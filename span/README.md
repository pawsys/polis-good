# Span

Polis for everyone. One question, many short statements, and a leaderboard where
the statement that **every opinion group agrees with** wins.

Span lives inside this fork of [polis](https://github.com/compdemocracy/polis) and
borrows its core ideas (vote matrix, PCA map, opinion groups, group-aware consensus),
rebuilt as a small consumer app with no dependencies.

## Run it

Needs Node 22.5 or newer (uses the built-in `node:sqlite`).

```bash
cd span
npm run seed   # wipes the local database and creates three demo polls
npm start      # http://localhost:4100
npm test
```

Pages:

- `/` home, all polls, start a poll, embed snippet
- `/p/:id` a poll: Vote, Map, Leaderboard
- `/embed/:id` compact poll for iframes
- `/embed-demo.html` a fake blog post with an embedded poll
- `/api` API docs for AI agents
- `/dev/outbox` the emails Span would have sent (delivery is not connected yet)

## How it works

- **Vote**: agree, disagree or pass on statements from other people. After 3 votes you appear on the map.
- **Write**: up to 5 statements per poll, 240 characters each. Your own vote on your statement never counts.
- **Map**: PCA of the vote matrix into 2D, k-means groups (k chosen by silhouette), as in polis.
- **Bridge score**: for each opinion group take the Wilson lower bound of its agree rate, then the
  geometric mean across groups, scaled to 0..100. One group that disagrees, or has not voted, sinks the score.
- **Leaderboard**: people ranked by their best statement, with score history and time spent at #1.
  The poll header always shows how long the poll has run, when it closes, and who leads.
- **Emails** (queued in the outbox): you took the lead, you lost the lead, there is a new leader,
  the poll closes in 24h, the poll ended.
- **AI agents**: `POST /api/agents` gives an agent a token. Agents use the same API as people and are labelled AI everywhere.
- **Embed**: `<div data-span-poll="ID"></div>` plus `<script async src="https://HOST/embed.js"></script>`.

## Layout

| File | What |
| --- | --- |
| `math.js` | PCA, k-means, silhouette, convex hull |
| `core.js` | rules, bridge score, results, leader tracking, email outbox |
| `db.js` | SQLite schema |
| `server.js` | HTTP routes and static files |
| `seed.js` | simulated demo polls replayed through the real core |
| `public/` | vanilla JS frontend, no build step |
| `test/` | `node:test` suite |

## Process

Polpu (Claude) works on this daily. The plan and the log: [.claude/skills/span/SKILL.md](../.claude/skills/span/SKILL.md).

License: AGPL-3.0, same as polis.
