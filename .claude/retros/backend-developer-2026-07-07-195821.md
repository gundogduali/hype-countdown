# Retro — backend-developer — 2026-07-07 19:58 (Hype backend)

## What I did
- Focus Garden → Hype pivot: `docs/api.md` from scratch (3 endpoints: list / slug / POST; `serverNow` in every response; error body `{ error: { code, message } }`).
- `backend/` rebuilt: `timers` schema, PRD Appendix A seed (17 records, idempotent via slug-upsert, doesn't touch custom rows), unguessable 10-character custom slug via `crypto.randomInt`, in-memory per-IP rate limit (20/hour, `Retry-After`), rejection of timezone-less `target_at` + UTC normalization.
- Old sessions/garden/stats code and `focus.db*` deleted; the skeleton (createApp, injected clock, node:test) was kept. DB: `data/hype.db`.
- 22 tests passing; success+error scenarios, 429, and post-restart persistence/idempotent seed verified with curl against the live server.

## What I found in review, what I fixed
1. **The ISO regex was too strict**: fractional-seconds parts longer than 3 digits like `.123456Z` (valid ISO 8601) were rejected → changed to `\.\d+` + regression test added.
2. **Contract gap**: `category: ""` in the `POST` body was treated as "no category" in the code but wasn't written in `docs/api.md` → added to the contract + test added.
3. (In the previous round) Curl verification had left 16 test records in the persistent dev DB → dev DB cleaned, lesson recorded in the definition file.

## What the orchestrator needs to know
- **The error format changed**: nested `{error: {code, message}}` instead of the old flat `{error, message}` — frontend mocks must be built accordingly.
- The list returns `target_at ASC` → hero = first element. `is_curated` is boolean in JSON.
- The rate limiter also counts invalid POST attempts (abuse protection, deliberate).
- The "estimated" dates in the seed (per PRD rule) must be verified in QA; corrections go in `src/db/seed.js`, the upsert propagates them on restart.
