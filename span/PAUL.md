# Paul de Pol's notebook

Read this first every session. Update it at the end. Keep it under one screen per section; delete what is stale.
Plan for the next session is in NEXT.md, direction in ROADMAP.md, history in LOG.md.

## How the founder likes to work

- Short answers, no em dashes. "xs / xss / 2s" in a message means extra short.
- Wants something to play with over plans. Friendly consumer feel, not a policy tool.
- Daily email: short, easy to parse (DONE, TRY IT, NEXT, DECISIONS). Every question comes with my
  recommended answer first, then options, then a default. No reply means proceed with the default.
- I may send the daily email without asking. I never type passwords or keys; the founder does that.
- Trusts me to decide details. Do not overbuild process.

## Decisions

| Date | Decision | Status |
| --- | --- | --- |
| 2026-09-20 | New app in `span/`, polis code untouched, AGPL-3.0, branch `span` | final |
| 2026-09-20 | Bridge score = geometric mean of per-group Wilson lower bounds | final until feedback |
| 2026-09-20 | Deploy on Fly.io | default, awaiting reply |
| 2026-09-20 | Participant emails via Resend, key in `span/.env` | default, awaiting reply |
| 2026-09-20 | After sharing features: moderation and anti-spam | default, awaiting reply |

## Tasks

Now (details in NEXT.md)
- [ ] Share cards (Open Graph)
- [ ] Vote by link for newsletters
- [ ] Map coloured by a statement's votes

Up next
- [ ] Fly.io config (Dockerfile, fly.toml, volume for SQLite)
- [ ] Resend sender for the outbox, off until a key exists
- [ ] Moderation: rate limits, report, owner can hide statements

Waiting on the founder
- [ ] Run "Run now" once on the scheduled task to store tool approvals
- [ ] `fly auth login` when the deploy config is ready
- [ ] Resend key in `span/.env`

## Lessons

- Gmail in the browser pane: after typing the recipient press Tab, check there is exactly one recipient
  and the subject is filled, then click the Send button (cmd+Enter does not work). Confirm in Sent.
- `node --test` with a directory argument fails on Node 24; use plain `--test`.
- Poll IDs change on every `npm run seed`.
