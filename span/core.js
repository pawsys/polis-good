const crypto = require('node:crypto');
const { pca2, cluster, convexHull } = require('./math');

const LIMITS = {
  statementMax: 240,
  statementMin: 8,
  statementsPerUser: 5,
  questionMax: 160,
  descriptionMax: 600,
  nameMax: 40,
  minVotesToBePlaced: 3,
  minVotesToLead: 5,
};
const SNAPSHOT_MS = 5 * 60 * 1000;
const HOUR = 3600 * 1000;

const ADJECTIVES = ['Curious', 'Patient', 'Bold', 'Gentle', 'Wry', 'Candid', 'Steady', 'Nimble', 'Earnest', 'Quiet', 'Sunny', 'Salty', 'Plucky', 'Mellow', 'Keen', 'Dapper'];
const ANIMALS = ['Otter', 'Heron', 'Lynx', 'Magpie', 'Badger', 'Finch', 'Marmot', 'Gecko', 'Walrus', 'Ibis', 'Stoat', 'Puffin', 'Tapir', 'Wren', 'Bison', 'Newt'];

class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Wilson lower bound of the agree rate. Unlike polis' (A+1)/(S+2) prior, a statement
// with no votes scores 0 rather than 0.5, so the leaderboard cannot be topped by
// statements nobody has judged yet, and two friendly votes do not beat forty.
function wilsonLower(agree, votes, z = 1.28) {
  if (!votes) return 0;
  const p = agree / votes;
  const z2 = z * z;
  const centre = p + z2 / (2 * votes);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * votes)) / votes);
  return Math.max(0, (centre - margin) / (1 + z2 / votes));
}

// Geometric mean across groups, 0..100: high only if every group agrees.
function bridgeScore(groupStats) {
  if (!groupStats.length) return 0;
  let logSum = 0;
  for (const g of groupStats) {
    const w = wilsonLower(g.agree, g.votes);
    if (w <= 0) return 0;
    logSum += Math.log(w);
  }
  return 100 * Math.exp(logSum / groupStats.length);
}

function createCore(db, opts = {}) {
  const baseUrl = opts.baseUrl || process.env.SPAN_BASE_URL || 'http://localhost:4100';
  const clock = opts.now || (() => Date.now());
  const cache = new Map(); // pollId -> { version, base }
  const versions = new Map();
  const lastSnapshot = new Map();

  const bump = (pollId) => versions.set(pollId, (versions.get(pollId) || 0) + 1);

  // ---------- users ----------
  function randomName() {
    const a = ADJECTIVES[crypto.randomInt(ADJECTIVES.length)];
    const b = ANIMALS[crypto.randomInt(ANIMALS.length)];
    return `${a} ${b}`;
  }

  function cleanName(name) {
    const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.nameMax);
    return n || randomName();
  }

  function cleanEmail(email) {
    if (email === undefined || email === null || email === '') return null;
    const e = String(email).trim().toLowerCase();
    if (e.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new UserError('That email address does not look right.');
    return e;
  }

  function createUser({ name, email, isAi } = {}, t = clock()) {
    const token = crypto.randomBytes(24).toString('base64url');
    const res = db.prepare('INSERT INTO users (token, name, email, is_ai, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(token, cleanName(name), cleanEmail(email), isAi ? 1 : 0, t);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(res.lastInsertRowid);
  }

  function userByToken(token) {
    if (!token || typeof token !== 'string') return null;
    return db.prepare('SELECT * FROM users WHERE token = ?').get(token) || null;
  }

  function updateUser(user, { name, email }) {
    const newName = name !== undefined ? cleanName(name) : user.name;
    const newEmail = email !== undefined ? cleanEmail(email) : user.email;
    db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(newName, newEmail, user.id);
    for (const [pollId] of cache) bump(pollId); // names appear in cached results
    return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }

  const publicUser = (u) => ({ id: u.id, name: u.name, isAi: !!u.is_ai, hasEmail: !!u.email });

  // ---------- polls ----------
  function createPoll(user, { question, description, days, seedStatements }, t = clock()) {
    const q = String(question || '').replace(/\s+/g, ' ').trim();
    if (q.length < 10) throw new UserError('Ask a full question, at least 10 characters.');
    if (q.length > LIMITS.questionMax) throw new UserError(`Keep the question under ${LIMITS.questionMax} characters.`);
    const d = String(description || '').trim().slice(0, LIMITS.descriptionMax);
    const nDays = Math.min(60, Math.max(1, Number(days) || 7));
    let id;
    do { id = crypto.randomBytes(4).toString('hex').slice(0, 6); } while (db.prepare('SELECT 1 FROM polls WHERE id = ?').get(id));
    db.prepare('INSERT INTO polls (id, question, description, creator_id, created_at, ends_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, q, d, user.id, t, t + nDays * 24 * HOUR);
    for (const text of (seedStatements || []).slice(0, LIMITS.statementsPerUser)) {
      if (String(text || '').trim()) addStatement(user, id, text, t);
    }
    return getPoll(id);
  }

  function getPoll(id) {
    return db.prepare('SELECT * FROM polls WHERE id = ?').get(String(id)) || null;
  }

  function requireOpenPoll(id, t) {
    const poll = getPoll(id);
    if (!poll) throw new UserError('This poll does not exist.', 404);
    if (t >= poll.ends_at) throw new UserError('This poll has closed.', 409);
    return poll;
  }

  function pollSummary(poll, t = clock()) {
    const counts = db.prepare(`SELECT
        (SELECT COUNT(*) FROM statements WHERE poll_id = ?) AS statements,
        (SELECT COUNT(DISTINCT user_id) FROM votes WHERE poll_id = ?) AS participants,
        (SELECT COUNT(*) FROM votes WHERE poll_id = ?) AS votes`).get(poll.id, poll.id, poll.id);
    let leader = null;
    if (poll.leader_statement_id) {
      const row = db.prepare(`SELECT s.id, s.text, u.name, u.is_ai FROM statements s JOIN users u ON u.id = s.author_id WHERE s.id = ?`)
        .get(poll.leader_statement_id);
      if (row) leader = { statementId: row.id, text: row.text, name: row.name, isAi: !!row.is_ai, since: poll.leader_since };
    }
    return {
      id: poll.id,
      question: poll.question,
      description: poll.description,
      createdAt: poll.created_at,
      endsAt: poll.ends_at,
      closed: t >= poll.ends_at,
      ...counts,
      leader,
    };
  }

  function listPolls(t = clock()) {
    return db.prepare('SELECT * FROM polls ORDER BY (ends_at > ?) DESC, created_at DESC LIMIT 100').all(t).map((p) => pollSummary(p, t));
  }

  // ---------- statements & votes ----------
  function addStatement(user, pollId, text, t = clock()) {
    const poll = requireOpenPoll(pollId, t);
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length < LIMITS.statementMin) throw new UserError('Say a little more, at least a short sentence.');
    if (clean.length > LIMITS.statementMax) throw new UserError(`Keep it under ${LIMITS.statementMax} characters. One idea per statement.`);
    const mine = db.prepare('SELECT COUNT(*) AS c FROM statements WHERE poll_id = ? AND author_id = ?').get(poll.id, user.id).c;
    if (mine >= LIMITS.statementsPerUser) throw new UserError(`You have used all ${LIMITS.statementsPerUser} of your statements in this poll.`, 409);
    const dup = db.prepare('SELECT 1 FROM statements WHERE poll_id = ? AND lower(text) = lower(?)').get(poll.id, clean);
    if (dup) throw new UserError('Someone already said exactly that. Vote on theirs, or try a new angle.', 409);
    const res = db.prepare('INSERT INTO statements (poll_id, author_id, text, created_at) VALUES (?, ?, ?, ?)').run(poll.id, user.id, clean, t);
    const id = Number(res.lastInsertRowid);
    // Authors agree with themselves (shapes their map position) but that vote never counts toward the score.
    db.prepare('INSERT INTO votes (poll_id, statement_id, user_id, vote, created_at) VALUES (?, ?, ?, 1, ?)').run(poll.id, id, user.id, t);
    bump(poll.id);
    return { id, text: clean, left: LIMITS.statementsPerUser - mine - 1 };
  }

  function castVote(user, pollId, statementId, vote, t = clock()) {
    const poll = requireOpenPoll(pollId, t);
    const v = Number(vote);
    if (![1, 0, -1].includes(v)) throw new UserError('Vote must be 1 (agree), -1 (disagree) or 0 (pass).');
    const st = db.prepare('SELECT * FROM statements WHERE id = ? AND poll_id = ?').get(Number(statementId), poll.id);
    if (!st) throw new UserError('That statement is not part of this poll.', 404);
    if (st.author_id === user.id) throw new UserError('You cannot vote on your own statement.', 409);
    db.prepare(`INSERT INTO votes (poll_id, statement_id, user_id, vote, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(statement_id, user_id) DO UPDATE SET vote = excluded.vote`).run(poll.id, st.id, user.id, v, t);
    bump(poll.id);
    maybeSnapshot(poll.id, t);
  }

  // Next statement to show: unseen ones, favouring statements with few votes so new
  // ideas get a fair hearing, with a nudge toward the current front-runners.
  function nextStatement(user, pollId) {
    const rows = db.prepare(`SELECT s.id, s.text, u.name AS author, u.is_ai AS isAi,
        (SELECT COUNT(*) FROM votes v WHERE v.statement_id = s.id) AS n
      FROM statements s JOIN users u ON u.id = s.author_id
      WHERE s.poll_id = ? AND s.author_id != ?
        AND NOT EXISTS (SELECT 1 FROM votes v WHERE v.statement_id = s.id AND v.user_id = ?)`).all(pollId, user.id, user.id);
    const total = db.prepare('SELECT COUNT(*) AS c FROM statements WHERE poll_id = ? AND author_id != ?').get(pollId, user.id).c;
    if (!rows.length) return { statement: null, remaining: 0, total };
    const base = cache.get(pollId)?.base;
    const scoreOf = new Map((base?.statements || []).map((s) => [s.id, s.score]));
    const weights = rows.map((r) => 1 / (1 + r.n) + (scoreOf.get(r.id) || 0) / 400);
    let pick = Math.random() * weights.reduce((a, b) => a + b, 0);
    let chosen = rows[rows.length - 1];
    for (let i = 0; i < rows.length; i++) { pick -= weights[i]; if (pick <= 0) { chosen = rows[i]; break; } }
    return { statement: { id: chosen.id, text: chosen.text, author: chosen.author, isAi: !!chosen.isAi }, remaining: rows.length, total };
  }

  // ---------- results ----------
  function computeBase(pollId) {
    const statements = db.prepare(`SELECT s.id, s.text, s.author_id AS authorId, s.created_at AS createdAt, u.name AS author, u.is_ai AS isAi
      FROM statements s JOIN users u ON u.id = s.author_id WHERE s.poll_id = ? ORDER BY s.id`).all(pollId);
    const votes = db.prepare('SELECT statement_id AS sid, user_id AS uid, vote FROM votes WHERE poll_id = ?').all(pollId);
    const sIndex = new Map(statements.map((s, i) => [s.id, i]));
    const authorOf = new Map(statements.map((s) => [s.id, s.authorId]));

    const byUser = new Map();
    for (const v of votes) {
      if (!byUser.has(v.uid)) byUser.set(v.uid, []);
      byUser.get(v.uid).push(v);
    }
    const minVotes = Math.min(LIMITS.minVotesToBePlaced, statements.length);
    const placedIds = [...byUser.keys()].filter((uid) => byUser.get(uid).length >= minVotes).sort((a, b) => a - b);
    const rows = placedIds.map((uid) => {
      const r = new Array(statements.length).fill(null);
      for (const v of byUser.get(uid)) r[sIndex.get(v.sid)] = v.vote;
      return r;
    });

    const { points } = pca2(rows);
    const { labels, k } = cluster(points);
    let maxAbs = 1e-9;
    for (const p of points) maxAbs = Math.max(maxAbs, Math.abs(p[0]), Math.abs(p[1]));
    const norm = points.map((p) => [p[0] / maxAbs, p[1] / maxAbs]);

    const groupOf = new Map(placedIds.map((uid, i) => [uid, labels[i]]));
    const groupCount = Math.max(k, placedIds.length ? 1 : 0);
    const groups = Array.from({ length: groupCount }, (_, g) => ({ id: g, size: 0, hull: [] }));
    const groupPts = groups.map(() => []);
    placedIds.forEach((uid, i) => { groups[labels[i]].size++; groupPts[labels[i]].push(norm[i]); });
    groups.forEach((g, i) => { g.hull = convexHull(groupPts[i]).map((p) => [round(p[0]), round(p[1])]); });

    const stats = statements.map(() => ({
      overall: { agree: 0, disagree: 0, pass: 0 },
      groups: groups.map(() => ({ agree: 0, disagree: 0, pass: 0, votes: 0 })),
    }));
    for (const v of votes) {
      if (authorOf.get(v.sid) === v.uid) continue; // own vote never counts
      const st = stats[sIndex.get(v.sid)];
      const key = v.vote === 1 ? 'agree' : v.vote === -1 ? 'disagree' : 'pass';
      st.overall[key]++;
      const g = groupOf.get(v.uid);
      if (g !== undefined) { st.groups[g][key]++; st.groups[g].votes++; }
    }

    const names = new Map(db.prepare(`SELECT id, name, is_ai FROM users WHERE id IN (SELECT user_id FROM votes WHERE poll_id = ?)`).all(pollId).map((u) => [u.id, u]));

    const outStatements = statements.map((s, i) => {
      const st = stats[i];
      const total = st.overall.agree + st.overall.disagree + st.overall.pass;
      return {
        id: s.id, text: s.text, authorId: s.authorId, author: s.author, isAi: !!s.isAi, createdAt: s.createdAt,
        votes: total,
        overall: st.overall,
        groups: st.groups.map((g) => ({ ...g, pct: g.votes ? Math.round((100 * g.agree) / g.votes) : null })),
        score: round(bridgeScore(st.groups), 1),
      };
    });

    // What sets each group apart: statements it agrees with far more than everyone else.
    groups.forEach((g, gi) => {
      const scored = [];
      outStatements.forEach((s) => {
        const mine = s.groups[gi];
        if (!mine || mine.votes < 3) return;
        let oa = 0, ov = 0;
        s.groups.forEach((x, xi) => { if (xi !== gi) { oa += x.agree; ov += x.votes; } });
        const diff = mine.agree / mine.votes - (ov ? oa / ov : 0.5);
        scored.push({ id: s.id, text: s.text, pct: mine.pct, diff });
      });
      scored.sort((a, b) => b.diff - a.diff);
      g.defining = scored.filter((x) => x.diff > 0.15).slice(0, 2).map(({ id, text, pct }) => ({ id, text, pct }));
    });

    const participants = placedIds.map((uid, i) => ({
      id: uid, x: round(norm[i][0]), y: round(norm[i][1]), group: labels[i],
      name: names.get(uid)?.name || 'Someone', isAi: !!names.get(uid)?.is_ai,
    }));

    return { statements: outStatements, groups, participants, voters: byUser.size };
  }

  function round(x, d = 3) {
    const f = 10 ** d;
    return Math.round(x * f) / f;
  }

  function getBase(pollId) {
    const version = versions.get(pollId) || 0;
    const hit = cache.get(pollId);
    if (hit && hit.version === version) return hit.base;
    const base = computeBase(pollId);
    cache.set(pollId, { version, base });
    return base;
  }

  function pickLeader(base) {
    let best = null;
    for (const s of base.statements) {
      if (s.votes < LIMITS.minVotesToLead || s.score <= 0) continue;
      if (!best || s.score > best.score) best = s;
    }
    return best;
  }

  function history(pollId) {
    const rows = db.prepare('SELECT statement_id AS sid, t, score FROM snapshots WHERE poll_id = ? ORDER BY t').all(pollId);
    const series = new Map();
    const times = [];
    const topAt = new Map();
    for (const r of rows) {
      if (!series.has(r.sid)) series.set(r.sid, []);
      series.get(r.sid).push([r.t, r.score]);
      const top = topAt.get(r.t);
      if (!top) { times.push(r.t); topAt.set(r.t, r); } else if (r.score > top.score) topAt.set(r.t, r);
    }
    return { series, times, topAt };
  }

  function results(pollId, viewer, t = clock()) {
    const poll = getPoll(pollId);
    if (!poll) throw new UserError('This poll does not exist.', 404);
    const base = getBase(poll.id);
    const { series, times, topAt } = history(poll.id);

    // Time each statement has spent at #1, from snapshots.
    const end = Math.min(t, poll.ends_at);
    const timeAtTop = new Map();
    times.forEach((ts, i) => {
      const top = topAt.get(ts);
      if (!top || top.score <= 0) return;
      const until = i + 1 < times.length ? times[i + 1] : end;
      timeAtTop.set(top.sid, (timeAtTop.get(top.sid) || 0) + Math.max(0, until - ts));
    });

    const downsample = (pts, n = 40) => {
      if (pts.length <= n) return pts;
      const out = [];
      for (let i = 0; i < n; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (n - 1))]);
      return out;
    };

    const ranked = base.statements.slice().sort((a, b) => b.score - a.score || b.votes - a.votes);
    const statements = ranked.map((s, i) => ({
      ...s, rank: i + 1,
      timeAtTop: timeAtTop.get(s.id) || 0,
      history: downsample(series.get(s.id) || []).map(([ts, sc]) => [ts, round(sc, 1)]),
    }));

    // People leaderboard: each author is ranked by their best statement.
    const byAuthor = new Map();
    for (const s of statements) {
      let a = byAuthor.get(s.authorId);
      if (!a) { a = { authorId: s.authorId, name: s.author, isAi: s.isAi, best: s, statements: 0, timeAtTop: 0 }; byAuthor.set(s.authorId, a); }
      a.statements++;
      a.timeAtTop += s.timeAtTop;
    }
    const leaderboard = [...byAuthor.values()].map((a, i) => ({
      rank: i + 1, authorId: a.authorId, name: a.name, isAi: a.isAi, statements: a.statements, timeAtTop: a.timeAtTop,
      score: a.best.score, statementId: a.best.id, text: a.best.text, groups: a.best.groups, votes: a.best.votes, history: a.best.history,
      isYou: !!viewer && viewer.id === a.authorId,
    }));

    let you = null;
    if (viewer) {
      const p = base.participants.find((x) => x.id === viewer.id);
      const cast = db.prepare('SELECT COUNT(*) AS c FROM votes WHERE poll_id = ? AND user_id = ?').get(poll.id, viewer.id).c;
      const mine = db.prepare('SELECT COUNT(*) AS c FROM statements WHERE poll_id = ? AND author_id = ?').get(poll.id, viewer.id).c;
      you = {
        id: viewer.id, placed: !!p, group: p ? p.group : null, votesCast: cast,
        votesNeeded: Math.max(0, Math.min(LIMITS.minVotesToBePlaced, base.statements.length) - cast),
        statementsLeft: LIMITS.statementsPerUser - mine,
      };
    }

    return {
      poll: pollSummary(poll, t),
      groups: base.groups,
      participants: base.participants.map((p) => ({ x: p.x, y: p.y, group: p.group, name: p.name, isAi: p.isAi, isYou: !!viewer && p.id === viewer.id })),
      statements,
      leaderboard,
      you,
      limits: LIMITS,
    };
  }

  // ---------- snapshots, leader changes, emails ----------
  function maybeSnapshot(pollId, t = clock()) {
    const last = lastSnapshot.get(pollId) ?? (db.prepare('SELECT MAX(t) AS t FROM snapshots WHERE poll_id = ?').get(pollId).t || 0);
    if (t - last < SNAPSHOT_MS) { lastSnapshot.set(pollId, last); return false; }
    snapshot(pollId, t);
    return true;
  }

  function snapshot(pollId, t = clock()) {
    const base = getBase(pollId);
    const ins = db.prepare('INSERT INTO snapshots (poll_id, statement_id, t, score) VALUES (?, ?, ?, ?)');
    db.exec('BEGIN');
    for (const s of base.statements) ins.run(pollId, s.id, t, s.score);
    db.exec('COMMIT');
    lastSnapshot.set(pollId, t);

    const poll = getPoll(pollId);
    const leader = pickLeader(base);
    if (leader && leader.id !== poll.leader_statement_id) {
      const previous = poll.leader_statement_id ? base.statements.find((s) => s.id === poll.leader_statement_id) : null;
      db.prepare('UPDATE polls SET leader_statement_id = ?, leader_since = ? WHERE id = ?').run(leader.id, t, pollId);
      if (!previous || previous.authorId !== leader.authorId) notifyLeaderChange(poll, leader, previous, t);
    }
  }

  function queueEmail(userId, poll, kind, subject, body, t, throttleMs) {
    if (throttleMs) {
      const recent = db.prepare('SELECT 1 FROM outbox WHERE user_id = ? AND poll_id = ? AND kind = ? AND created_at > ?').get(userId, poll.id, kind, t - throttleMs);
      if (recent) return;
    }
    db.prepare('INSERT INTO outbox (user_id, poll_id, kind, subject, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, poll.id, kind, subject, body, t);
  }

  function pollParticipantsWithEmail(pollId) {
    return db.prepare(`SELECT DISTINCT u.id, u.name, u.email FROM users u
      WHERE u.email IS NOT NULL AND (u.id IN (SELECT user_id FROM votes WHERE poll_id = ?) OR u.id IN (SELECT author_id FROM statements WHERE poll_id = ?))`).all(pollId, pollId);
  }

  function notifyLeaderChange(poll, leader, previous, t) {
    const link = `${baseUrl}/p/${poll.id}`;
    for (const u of pollParticipantsWithEmail(poll.id)) {
      if (u.id === leader.authorId) {
        queueEmail(u.id, poll, 'you-lead', `You are winning: "${poll.question}"`,
          `Your statement just took first place with a bridge score of ${leader.score}.\n\n"${leader.text}"\n\nIt leads because every group agrees with it. Others will try to out-bridge you before the poll closes.\n\nSee the leaderboard: ${link}`, t, HOUR);
      } else if (previous && u.id === previous.authorId) {
        queueEmail(u.id, poll, 'dethroned', `${leader.author} just took your lead`,
          `A new statement passed yours in "${poll.question}".\n\nNow leading (${leader.score}): "${leader.text}"\nYours (${previous.score}): "${previous.text}"\n\nYou can still add a statement that bridges the groups better: ${link}`, t, HOUR);
      } else {
        queueEmail(u.id, poll, 'new-leader', `New leader in "${poll.question}"`,
          `${leader.author} took first place with a statement every group agrees with:\n\n"${leader.text}"\n\nDo you agree? Could you write something that bridges the groups even better? ${link}`, t, 12 * HOUR);
      }
    }
  }

  // Periodic housekeeping: closing-soon reminders and final results.
  function tick(t = clock()) {
    const polls = db.prepare('SELECT * FROM polls WHERE ended_notified = 0').all();
    for (const poll of polls) {
      const link = `${baseUrl}/p/${poll.id}`;
      const long = poll.ends_at - poll.created_at >= 48 * HOUR;
      if (!poll.ending_notified && long && t < poll.ends_at && poll.ends_at - t <= 24 * HOUR) {
        db.prepare('UPDATE polls SET ending_notified = 1 WHERE id = ?').run(poll.id);
        const leader = pickLeader(getBase(poll.id));
        for (const u of pollParticipantsWithEmail(poll.id)) {
          queueEmail(u.id, poll, 'ending', `One day left: "${poll.question}"`,
            `${leader ? `${leader.author} is leading with: "${leader.text}"` : 'Nobody has taken the lead yet.'}\n\nThere is still time to vote on new statements or write the one that wins: ${link}`, t);
        }
      }
      if (t >= poll.ends_at) {
        snapshot(poll.id, poll.ends_at);
        db.prepare('UPDATE polls SET ended_notified = 1 WHERE id = ?').run(poll.id);
        const leader = pickLeader(getBase(poll.id));
        for (const u of pollParticipantsWithEmail(poll.id)) {
          queueEmail(u.id, poll, 'ended', `Final result: "${poll.question}"`,
            `${leader ? `${leader.author} won with the statement that best bridged every group (${leader.score}):\n\n"${leader.text}"` : 'The poll closed without a winner.'}\n\nSee the final map and leaderboard: ${link}`, t);
        }
      }
    }
  }

  function outbox(limit = 100) {
    return db.prepare(`SELECT o.id, o.kind, o.subject, o.body, o.created_at AS createdAt, o.sent_at AS sentAt, u.email AS "to", o.poll_id AS pollId
      FROM outbox o JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT ?`).all(limit);
  }

  return {
    LIMITS, createUser, userByToken, updateUser, publicUser,
    createPoll, getPoll, pollSummary, listPolls,
    addStatement, castVote, nextStatement,
    results, snapshot, maybeSnapshot, tick, outbox,
  };
}

module.exports = { createCore, UserError, wilsonLower, bridgeScore, LIMITS };
