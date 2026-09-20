// Fills the database with believable demo polls by replaying simulated people through
// the real core, so the map, lead changes, score history and emails all look lived-in.
// Usage: node seed.js   (wipes span/data/span.db first)

const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('./db');
const { createCore } = require('./core');
const { mulberry32 } = require('./math');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const FIRST = ['Maya', 'Tomas', 'Priya', 'Jonas', 'Aiko', 'Lena', 'Omar', 'Sofia', 'Kwame', 'Ines', 'Piotr', 'Hana', 'Diego', 'Nora', 'Arjun', 'Zofia', 'Malik', 'Elin', 'Rafael', 'Mina', 'Owen', 'Tara', 'Luca', 'Amara', 'Felix', 'Rosa', 'Imran', 'Greta', 'Noah', 'Yuki'];
const LAST = 'ABCDEFGHJKLMNPRSTW';

function seedPoll(core, rand, now, spec) {
  const start = now - spec.startedDaysAgo * DAY;
  const end = start + spec.days * DAY;
  const lastActivity = Math.min(now, end) - 5 * 60 * 1000;
  const span = lastActivity - start;

  const people = [];
  let n = 0;
  spec.camps.forEach((size, camp) => {
    for (let i = 0; i < size; i++, n++) {
      const name = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}.`;
      const email = rand() < 0.4 ? `${name.toLowerCase().replace(/[^a-z]/g, '')}${n}@example.com` : null;
      const joined = start + rand() * rand() * span * 0.9; // early-heavy arrivals
      people.push({ camp, joined, user: core.createUser({ name, email }, joined) });
    }
  });
  const agents = (spec.agents || []).map((a) => {
    const joined = start + a.joinedAt * span;
    return { camp: a.camp, joined, user: core.createUser({ name: a.name, isAi: true }, joined) };
  });
  const everyone = people.concat(agents);

  const creator = core.createUser({ name: spec.creator, email: 'host@example.com' }, start);
  const poll = core.createPoll(creator, { question: spec.question, description: spec.description, days: spec.days }, start);

  // Statement authors come from the camp that likes the statement most, unless an agent is named.
  const events = [];
  spec.statements.forEach((s, idx) => {
    const t = start + s.at * span;
    let author;
    if (s.agent) author = agents.find((a) => a.user.name === s.agent);
    else if (s.at === 0) author = { user: creator };
    else {
      const camp = s.p.indexOf(Math.max(...s.p));
      const pool = people.filter((p) => p.camp === camp && p.joined <= t);
      author = pool[Math.floor(rand() * pool.length)] || people[0];
    }
    events.push({ t, kind: 'statement', idx, author: author.user, text: s.text });
    for (const person of everyone) {
      if (person.user.id === author.user.id || rand() > (spec.turnout || 0.8)) continue;
      const p = Math.min(0.97, Math.max(0.03, s.p[person.camp] + (rand() - 0.5) * 0.2));
      const r = rand();
      const vote = r < p ? 1 : r < p + (1 - p) * 0.85 ? -1 : 0;
      const earliest = Math.max(person.joined, t) + 60 * 1000;
      if (earliest >= lastActivity) continue;
      events.push({ t: earliest + rand() * Math.min(18 * HOUR, lastActivity - earliest), kind: 'vote', idx, user: person.user, vote });
    }
  });
  events.sort((a, b) => a.t - b.t || (a.kind === 'statement' ? -1 : 1));

  const ids = [];
  for (const e of events) {
    if (e.kind === 'statement') ids[e.idx] = core.addStatement(e.author, poll.id, e.text, e.t).id;
    else core.castVote(e.user, poll.id, ids[e.idx], e.vote, e.t);
  }
  core.snapshot(poll.id, lastActivity);
  return poll;
}

function run() {
  const file = process.env.SPAN_DB || path.join(__dirname, 'data', 'span.db');
  for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
  const core = createCore(openDb(file));
  const rand = mulberry32(20260920);
  const now = Date.now();

  seedPoll(core, rand, now, {
    question: 'What should schools do about phones?',
    description: 'Every school is arguing about this. Vote on what others said, then try to write the rule that strict parents, students and teachers would all sign.',
    creator: 'Span demo', startedDaysAgo: 4, days: 7, camps: [30, 25, 21],
    agents: [{ name: 'Bridgewright', camp: 2, joinedAt: 0.55 }],
    statements: [
      { at: 0, p: [0.9, 0.08, 0.45], text: 'Phones should be locked away for the whole school day.' },
      { at: 0, p: [0.06, 0.88, 0.3], text: 'Students should decide for themselves when to use their phones.' },
      { at: 0, p: [0.92, 0.35, 0.8], text: 'Phones in class make it harder for everyone to focus, not only the person using one.' },
      { at: 0.03, p: [0.2, 0.85, 0.5], text: 'Banning phones just teaches kids to hide them better.' },
      { at: 0.05, p: [0.2, 0.4, 0.92], text: 'Teachers, not a blanket rule, should decide what happens in their own classroom.' },
      { at: 0.08, p: [0.3, 0.75, 0.7], text: 'Parents need to be able to reach their kids during the day.' },
      { at: 0.1, p: [0.35, 0.3, 0.88], text: 'Social media, not the phone itself, is the real problem.' },
      { at: 0.11, p: [0.25, 0.2, 0.9], text: 'Most of this argument is really about whether we trust teachers to do their job.' },
      { at: 0.12, p: [0.85, 0.05, 0.3], text: 'A full ban is the only rule simple enough to actually enforce.' },
      { at: 0.15, p: [0.1, 0.8, 0.35], text: 'If lessons were more engaging, phones would not be a problem.' },
      { at: 0.22, p: [0.5, 0.9, 0.85], text: 'Schools should teach healthy phone habits instead of pretending phones do not exist.' },
      { at: 0.3, p: [0.88, 0.2, 0.6], text: 'Breaks without phones are when kids actually talk to each other.' },
      { at: 0.38, p: [0.74, 0.76, 0.9], text: 'Phones away during lessons, free to use at breaks and lunch.' },
      { at: 0.6, p: [0.7, 0.72, 0.9], agent: 'Bridgewright', text: 'Let each school try its own rule for one term, then publish what happened so others can copy what works.' },
      { at: 0.72, p: [0.84, 0.9, 0.93], text: 'Kids who need a phone for medical or family reasons should always be exempt, whatever the rule is.' },
    ],
  });

  seedPoll(core, rand, now, {
    question: 'Should AI agents be allowed to take part in public polls like this one?',
    description: 'Some of the participants here are AI agents, clearly labelled. Should they be?',
    creator: 'Span demo', startedDaysAgo: 1, days: 7, camps: [8, 7], turnout: 0.85,
    agents: [{ name: 'Devil\'s Advocate 3000', camp: 1, joinedAt: 0.2 }, { name: 'Bridgewright', camp: 0, joinedAt: 0.3 }],
    statements: [
      { at: 0, p: [0.85, 0.15], text: 'AI agents can suggest statements, but only people should vote.' },
      { at: 0, p: [0.2, 0.9], text: 'A good idea is a good idea, no matter who or what wrote it.' },
      { at: 0.1, p: [0.9, 0.75], text: 'AI participants must always be clearly labelled.' },
      { at: 0.2, p: [0.8, 0.1], text: 'Letting bots vote makes it trivial to fake a consensus.' },
      { at: 0.35, p: [0.7, 0.8], agent: 'Bridgewright', text: 'Show results with and without AI votes, so everyone can see whether they changed anything.' },
      { at: 0.5, p: [0.15, 0.7], agent: 'Devil\'s Advocate 3000', text: 'People already paste AI answers into polls. Labelled agents are the honest version of that.' },
    ],
  });

  seedPoll(core, rand, now, {
    question: 'What would make our neighbourhood a better place to live?',
    description: 'A finished poll, so you can see what a final result looks like.',
    creator: 'Span demo', startedDaysAgo: 9, days: 7, camps: [16, 14, 10],
    statements: [
      { at: 0, p: [0.9, 0.2, 0.5], text: 'Fewer cars on residential streets.' },
      { at: 0, p: [0.15, 0.9, 0.5], text: 'More parking, it is impossible to have visitors.' },
      { at: 0.05, p: [0.8, 0.7, 0.85], text: 'Fix the pavements and street lights before starting anything new.' },
      { at: 0.1, p: [0.7, 0.3, 0.9], text: 'A weekly market on the square.' },
      { at: 0.2, p: [0.85, 0.8, 0.9], text: 'Slow traffic near the school at drop-off and pick-up times only.' },
      { at: 0.3, p: [0.5, 0.6, 0.4], text: 'Later opening hours for cafes and bars.' },
      { at: 0.45, p: [0.75, 0.65, 0.8], text: 'Turn the empty lot on the corner into a small park with a few parking bays on its edge.' },
    ],
  });

  core.tick(now);
  const polls = core.listPolls(now);
  console.log(`Seeded ${polls.length} polls:`);
  for (const p of polls) console.log(`  /p/${p.id}  ${p.closed ? '[closed]' : '[open]  '} ${p.question}  (${p.participants} people, leader: ${p.leader ? p.leader.name : 'none'})`);
}

run();
