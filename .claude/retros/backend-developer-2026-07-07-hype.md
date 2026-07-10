# Retro — backend-developer — 2026-07-07 (Hype pivot)

## Task
Focus Garden → Hype pivot: write `docs/api.md` from scratch, implement the timers schema/route/service/seed, remove the old code.

## What I did
- `docs/api.md` rewritten: 3 endpoints (`GET /api/timers`, `GET /api/timers/:slug`, `POST /api/timers`), `serverNow` in every response, error body `{ error: { code, message } }` (different from before: nested format — explicit in the contract).
- Old `sessions/garden/stats` routes+services+tests and `data/focus.db*` deleted; the skeleton (createApp + injectable clock + node:test layout) was kept.
- New: `src/db/index.js` (timers schema), `src/db/seed.js` (Appendix A, 17 records, idempotent via slug-upsert; curated rows pick up date corrections on restart, customs untouched), `src/services/timers.js` (validation + crypto randomSlug 10 chars), `src/services/rate-limit.js` (in-memory sliding window 20/hour, Retry-After), `src/routes/timers.js`.
- Timezone-less ISO `target_at` is rejected (ambiguity = wrong target moment); offset forms are accepted and normalized to UTC.
- 21 tests passing; live verification with curl: list/filter/past-drops-out/custom-doesn't-leak, slug+404, POST all validations, 429 (after 20), post-restart persistence + seed doesn't duplicate.

## What I found / fixed
- Curl experiments left 16 test records in the dev DB → dev DB deleted (the seed rebuilds it on startup). To avoid writing test junk into the persistent DB, doing curl verification with a temporary DB_PATH is cleaner going forward.
- The rate limiter counts BEFORE the route: invalid POST attempts also consume the limit — a deliberate choice for abuse protection; not noted in the contract (behavioral detail, doesn't affect the frontend).

## Notes for the frontend
- The list is `target_at ASC` (soonest first) → hero = first element can be used.
- `is_curated` is boolean in JSON (0/1 in the DB).
- Empty-string category (`?category=`) = no filter.
