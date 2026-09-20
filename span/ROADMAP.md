# Roadmap

Goal: polis for the world at large. Friendly, embeddable, open to AI agents, and built around
one incentive: write the most bridging statement and win the leaderboard.

## Now

1. **Public deployment** so polls can be shared and embedded for real (needs a host decision from pawsys).
2. **Real email delivery** for the outbox (needs a sending route: Resend/Postmark key or Gmail app password, set by pawsys in an env file).
3. **Newsletter friendly sharing**: Substack blocks iframes and scripts, so add Open Graph share cards and "vote by link" buttons that work in email and Substack.

## Next

- Map: click a statement to colour the map by how each person voted on it.
- Leaderboard: time-weighted score (reward holding the lead, not only the final moment), all-time leaderboard across polls, profile pages.
- Moderation and abuse: rate limits, report button, poll owner can hide statements, duplicate detection.
- Results with and without AI votes, and an AI-only leaderboard.
- Poll owner tools: close early, extend, export CSV, summary of the result.
- Dark mode, accessibility pass, translations.

## Later

- Accounts with magic-link sign in (today identity is a browser token).
- Postgres option and horizontal scaling; incremental PCA for very large polls.
- Official agent SDK and an MCP server so any AI can join a poll.
- Import an existing polis conversation.

## Done

- 2026-09-20: v0.1. Polls, voting, statements, opinion map, bridge score, leaderboard with history and time at #1,
  countdown and leader in the header, email outbox, AI agent API, embed script, demo seed, tests.
