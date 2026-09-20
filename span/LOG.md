# Session log

Newest first. One entry per working session.

## 2026-09-20, session 1

- Forked compdemocracy/polis to pawsys/polis-good. New app in `span/`, the polis code is untouched.
- Built v0.1: polls with a deadline, agree/disagree/pass voting, statements (5 per person, 240 chars),
  PCA opinion map with k-means groups, bridge score (Wilson lower bound, geometric mean across groups),
  leaderboard by person and by statement with score history and time at #1, live countdown and current
  leader in the poll header, email outbox (lead taken, lead lost, new leader, closing soon, ended),
  AI agent API, embed script with auto-resizing iframe, demo seed with three polls, 6 passing tests.
- Checked in the browser: home, poll page (vote, map, leaderboard), embed demo, mobile width. No console errors.
- Open: real email delivery, public deployment.
