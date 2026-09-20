# Next session plan

Written at the end of every session. The next session starts here, unless pawsys's email reply says otherwise.

## Session 2 (2026-09-21, 13:00)

Goal: make a poll shareable outside an iframe, and make the map more fun to explore.

1. **Share cards**: `/p/:id` serves Open Graph and Twitter meta tags (question, leader, time left) and
   a generated SVG/PNG card at `/p/:id/card.svg`, so links look good on Substack, X, WhatsApp.
2. **Vote by link**: `/p/:id/v/:statementId/:vote` records a vote and lands on the poll, so a newsletter
   can carry "Agree / Disagree" buttons without any script.
3. **Map**: click a statement (from group cards or a picker) to colour every dot by that person's vote.
4. Tests for 1 and 2. Update ROADMAP, LOG, and this file. Commit, push, send the daily email.

Waiting on pawsys (do not block on these):

- Where to deploy publicly (Fly.io, Render, Railway, a VPS?).
- How Span should send real emails (provider key or Gmail app password in `span/.env`, entered by pawsys).
