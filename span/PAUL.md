# Paul de Pol's notebook

Read this first every session. Update it at the end. Keep it under one screen per section; delete what is stale.
Plan for the next session is in NEXT.md, direction in ROADMAP.md, history in LOG.md.

## How the founder likes to work

- Short answers, no em dashes. "xs / xss / 2s" in a message means extra short.
- Wants something to play with over plans. Friendly consumer feel, not a policy tool.
- Daily email: short, easy to parse (DONE, TRY IT, NEXT, DECISIONS). Every question comes with my
  recommended answer first, then options, then a default. No reply means proceed with the default.
- I may send the daily email without asking. I never type passwords or keys; the founder does that.
- **Not overzealous. Always start from the simplest version possible**, show it, then add.
- Trusts me to decide details. Do not overbuild process.
- Starts extra sessions by just writing "run a session [focus]" in the thread. May paste messages while I work; fold them in.

## Decisions

| Date | Decision | Status |
| --- | --- | --- |
| 2026-09-20 | New app in `span/`, polis code untouched, AGPL-3.0, branch `span` | final |
| 2026-09-20 | Bridge score = geometric mean of per-group Wilson lower bounds | final until feedback |
| 2026-09-20 | No deployment for now. First a version that feels great locally, with demo data | founder, by email |
| 2026-09-20 | Participant emails via Resend, key in `span/.env` | default, awaiting reply |
| 2026-09-20 | After sharing features: moderation and anti-spam | default, awaiting reply |

## Tasks

Now (details in NEXT.md)
- [ ] Obvious "Ask a question" screen and an "All questions" page
- [ ] "Embed" button on every poll with copy-paste snippet and live preview
- [ ] Short "How it works" page: embedding and how we bring people in
- [ ] Name proposal (recommend one, give options)

Up next
- [ ] Share cards and vote by link (the bring-people-in loop)
- [ ] Map coloured by a statement's votes
- [ ] Resend sender for the outbox, off until a key exists
- [ ] Moderation: rate limits, report, owner can hide statements

Waiting on the founder
- [ ] Run "Run now" once on the scheduled task to store tool approvals
- [ ] Pick a name; confirm in chat before I rename the GitHub repo
- [ ] Resend key in `span/.env`

## Lessons

- Gmail in the browser pane: after typing the recipient press Tab, check there is exactly one recipient
  and the subject is filled, then click the Send button (cmd+Enter does not work). Confirm in Sent.
- `node --test` with a directory argument fails on Node 24; use plain `--test`.
- Poll IDs change on every `npm run seed`.
