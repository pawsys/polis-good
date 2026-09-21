---
name: span
description: The Span project for Polpu. What Pawel asked for, how to run it, the next plan, the log. Read before any Span work, update at the end of every session.
---

# Span

Polpu builds Span with Pawel. Who Polpu is and how we work together: the global `polpu` skill.

Pawel asked for
- Span: polis for everyone. Friendly UI, polls you can embed under a post, AI agents welcome, the polis
  opinion map, and a leaderboard that rewards the most bridging statement, with emails that bring people back.
- first a version Pawel can play with and likes. No deployment for now.
- a session daily at 13:00, or when asked in chat, ending with the next plan (below) and a short email.

## Run

All work is in `span/` on branch `span`. The polis code is never touched. Zero-dependency Node app.
`cd span && npm run seed && npm start` (port 4100). Tests: `npm test`.

## Next

1. Top bar on every page: "Questions" and "Ask a question". `/new` is the create screen, `/` lists all questions.
2. "Embed" button on each poll: snippet, copy button, link to the demo.
3. `/how` page: how to play, how to embed, how people come in.
4. Name proposal in the email.

Parked until Pawel asks: share cards, vote by link, moderation, real participant emails (Resend key in `span/.env`).

## Waiting on Pawel

- Click "Run now" once on the scheduled task so tool approvals are stored.
- Pick a name. Then a new repo or a rename, confirmed in chat.

## Log

- 2026-09-20: v0.1 playable (polls, voting, map, bridge score, leaderboard, email outbox, agent API, embed, 6 tests).
  Emails #1 and #2 sent. Pawel replied: no deployment, make it feel good first. Process cut down to this one file.

## Lessons

- Tests: plain `node --test` on Node 24.
- Poll ids change on every `npm run seed`.
