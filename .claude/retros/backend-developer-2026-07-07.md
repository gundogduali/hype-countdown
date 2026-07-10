# Retro — backend-developer — 2026-07-07

## Task
Focus Garden backend from scratch: Express + SQLite, the entire `docs/api.md` contract.

## What I did
- Express under `backend/` (port 3001) + `node:sqlite` (built-in, no native compilation; dependencies are only express+cors).
- Schema auto-migrates on startup (`src/db/index.js`), DB `backend/data/focus.db`, `data/` in gitignore.
- 5 endpoints + business rules: single active session (409), early complete 422 `not_elapsed`, automatic `completed` + `{completed_now}` wrapper for an expired session on GET /active, plant assignment on the server, day-based streak (if today is empty, from yesterday).
- 16 tests (node:test, in-memory DB + injectable clock) — all passing. Live verification with curl + post-restart persistence check done.

## What I found / fixed
- `"test": "node --test test/"` gives MODULE_NOT_FOUND on Node 25 (the directory argument gets resolved like a module). Converted it to a glob: `node --test "test/*.test.js"`.

## Contract points needing interpretation (not deviations, clarification suggestions)
- `totals.sessions/minutes` counts only completed; `totals.plants` counts completed+abandoned (everything in the garden). Since the two were equal in the contract example, this was ambiguous — this interpretation could be written explicitly into `docs/api.md`.
- The `complete` validation has a 2 s tolerance (for network latency); any earlier request is 422.
- In auto-complete and in normal complete, `ended_at = started_at + duration` (server truth), not the request time.
