const test = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../db');
const { createCore, wilsonLower, bridgeScore } = require('../core');
const { pca2, cluster, mulberry32 } = require('../math');

const HOUR = 3600 * 1000;

function twoCamps(core, t0) {
  const host = core.createUser({ name: 'Host' }, t0);
  const poll = core.createPoll(host, { question: 'Cats or dogs, which is better?', days: 7 }, t0);
  const cat = core.addStatement(host, poll.id, 'Cats are the better pet.', t0).id;
  const dog = core.addStatement(host, poll.id, 'Dogs are the better pet.', t0).id;
  const indoor = core.addStatement(host, poll.id, 'Indoor pets need daily play.', t0).id;
  const author = core.createUser({ name: 'Bridger', email: 'bridger@example.com' }, t0);
  const both = core.addStatement(author, poll.id, 'Any pet deserves a caring home.', t0).id;
  const users = [];
  for (let i = 0; i < 12; i++) {
    const u = core.createUser({ name: `P${i}`, email: i === 0 ? 'p0@example.com' : null }, t0);
    const catPerson = i < 6;
    const t = t0 + (i + 1) * 10 * 60 * 1000;
    core.castVote(u, poll.id, cat, catPerson ? 1 : -1, t);
    core.castVote(u, poll.id, dog, catPerson ? -1 : 1, t);
    core.castVote(u, poll.id, indoor, catPerson ? 1 : -1, t);
    core.castVote(u, poll.id, both, 1, t);
    users.push(u);
  }
  return { poll, host, author, users, ids: { cat, dog, indoor, both }, tEnd: t0 + 13 * 10 * 60 * 1000 };
}

test('wilsonLower is cautious with few votes and 0 with none', () => {
  assert.strictEqual(wilsonLower(0, 0), 0);
  assert.ok(wilsonLower(2, 2) < wilsonLower(40, 40));
  assert.ok(wilsonLower(40, 40) > 0.9);
});

test('bridgeScore needs every group', () => {
  const oneSided = bridgeScore([{ agree: 20, votes: 20 }, { agree: 1, votes: 20 }]);
  const bridging = bridgeScore([{ agree: 15, votes: 20 }, { agree: 15, votes: 20 }]);
  assert.ok(bridging > oneSided * 2);
  assert.strictEqual(bridgeScore([{ agree: 20, votes: 20 }, { agree: 0, votes: 0 }]), 0);
});

test('pca + cluster separates two obvious camps', () => {
  const rand = mulberry32(1);
  const camp = (sign) => Array.from({ length: 8 }, (_, j) => (rand() < 0.15 ? null : (rand() < 0.9 ? 1 : -1) * (j < 4 ? sign : -sign)));
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(camp(1));
  for (let i = 0; i < 10; i++) rows.push(camp(-1));
  const { points } = pca2(rows);
  const { labels, k } = cluster(points);
  assert.strictEqual(k, 2);
  assert.ok(labels.slice(0, 10).every((l) => l === labels[0]));
  assert.ok(labels.slice(10).every((l) => l === labels[10]));
  assert.notStrictEqual(labels[0], labels[10]);
});

test('the bridging statement wins, its author leads, and people get emailed', () => {
  const t0 = Date.UTC(2026, 0, 1);
  const core = createCore(openDb(':memory:'), { now: () => t0 });
  const { poll, author, users, ids, tEnd } = twoCamps(core, t0);
  core.snapshot(poll.id, tEnd);

  const r = core.results(poll.id, users[0], tEnd);
  assert.strictEqual(r.groups.length, 2);
  assert.deepStrictEqual(r.groups.map((g) => g.size).sort(), [6, 7]); // 12 voters + the host, placed by their own statements
  assert.strictEqual(r.statements[0].id, ids.both);
  assert.strictEqual(r.leaderboard[0].authorId, author.id);
  assert.strictEqual(r.poll.leader.statementId, ids.both);
  assert.ok(r.you.placed);
  assert.ok(r.statements[0].history.length >= 1);

  const kinds = core.outbox().map((m) => `${m.kind}:${m.to}`);
  assert.ok(kinds.includes('you-lead:bridger@example.com'));
  assert.ok(kinds.includes('new-leader:p0@example.com'));
});

test('own votes do not count, and the rules are enforced', () => {
  const t0 = Date.UTC(2026, 0, 1);
  const core = createCore(openDb(':memory:'), { now: () => t0 });
  const { poll, author, host, ids } = twoCamps(core, t0);
  const mine = core.results(poll.id, author, t0).statements.find((s) => s.id === ids.both);
  assert.strictEqual(mine.votes, 12); // author auto-agree excluded
  assert.throws(() => core.castVote(author, poll.id, ids.both, 1, t0), /own statement/);
  assert.throws(() => core.addStatement(host, poll.id, 'cats are the better pet.', t0), /already said/);
  assert.throws(() => core.addStatement(host, poll.id, 'short', t0), /little more/);
  core.addStatement(host, poll.id, 'A fourth statement from the host.', t0);
  core.addStatement(host, poll.id, 'A fifth statement from the host.', t0);
  assert.throws(() => core.addStatement(host, poll.id, 'A sixth statement from the host.', t0), /used all/);
  assert.throws(() => core.castVote(author, poll.id, ids.cat, 1, t0 + 8 * 24 * HOUR), /closed/);
});

test('closing a poll emails the final result once', () => {
  const t0 = Date.UTC(2026, 0, 1);
  const core = createCore(openDb(':memory:'), { now: () => t0 });
  const { poll } = twoCamps(core, t0);
  core.tick(t0 + 6.5 * 24 * HOUR);
  core.tick(t0 + 8 * 24 * HOUR);
  core.tick(t0 + 9 * 24 * HOUR);
  const kinds = core.outbox().filter((m) => m.to === 'p0@example.com').map((m) => m.kind);
  assert.strictEqual(kinds.filter((k) => k === 'ended').length, 1);
  assert.strictEqual(kinds.filter((k) => k === 'ending').length, 1);
  assert.strictEqual(core.pollSummary(core.getPoll(poll.id), t0 + 9 * 24 * HOUR).closed, true);
});
