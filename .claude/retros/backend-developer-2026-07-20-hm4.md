# Retro — backend-developer, 2026-07-20 (HM-4: Hype Messages route)

## Task
Build the actual Hype Messages feature (PRD §9.3, issue HM-4) on top of HM-3's already-shipped
`backend/src/middleware/moderation.js`: data model, `POST /api/timers/:slug/message`,
`GET /api/timers/:slug/messages`, a per-IP rate limit reusing the project's existing convention,
and the `docs/api.md` update.

## What I did
- Read `backend/src/middleware/moderation.js` directly (not from memory) to confirm the exact
  exported shape: `moderateText(rawText)` → `{ ok: true, text }` or `{ ok: false, code, message }`.
  Used the plain function, not `moderationMiddleware()`, since the route needs to check
  `timer_not_found` (404) before running moderation, and the middleware factory doesn't have a
  slug/DB hook — calling `moderateText` directly inside `MessageService.submit()` keeps the route
  handler doing the same kind of orchestration `react()` does in `reactions.js`.
- Added a `messages` table (`backend/src/db/index.js`): `id, timer_slug, message, created_at`,
  `timer_slug` FK `ON DELETE CASCADE` (same shape as the `reaction_totals`/`reaction_marks`
  tables), plus an `idx_messages_slug_id` index for the newest-first per-timer query.
- New `backend/src/services/messages.js` (`MessageService`): `list(slug)` (newest first, capped)
  and `submit(slug, rawText)` (runs `moderateText`, stores on success, prunes anything beyond the
  cap for that timer in the same transaction). Chose a cap of **50 messages per timer** — not
  specified by the PRD ("capped list length" only), documented the choice and rationale in both
  the service docstring and `docs/api.md`.
- New routes in `backend/src/routes/timers.js` (same file as the RX-3 `/react` route, only
  additive — that route's code is untouched): `GET /:slug/messages` and
  `POST /:slug/message` (rate limited, checks `timer_not_found` first, then body-is-object,
  then delegates to `MessageService.submit`, translating a moderation rejection into the same
  `400 { error: { code, message } }` shape the middleware itself would have produced).
- Wired a new `messageLimiter` into `backend/src/app.js` (20/hour per IP — tighter than
  Reactions' 100/hour, same order of magnitude as timer creation, since free text carries more
  abuse risk than a fixed-emoji tap), following the exact `createRateLimiter(...)` pattern used
  for `createLimiter`/`reactLimiter`.
- Rewrote the `docs/api.md` "Hype Messages" section: removed the "not implemented yet" status
  note, added the Message Object, the cap documentation, full request/response/error docs for
  both endpoints (reusing HM-3's 5 error codes and their documented trade-offs verbatim,
  word-for-word — did not re-type them from memory, copied from the existing HM-3 section), and
  bumped the contract to v2.3.
- Added 15 new tests to `backend/test/api.test.js` covering: empty-list GET, happy-path
  create+list (newest first, per-timer isolation), unknown slug on both routes, non-object/
  primitive body, payload-too-large, **all 5 moderation codes exercised through the real route**
  (not just unit-tested against `moderateText` in isolation, per this issue's acceptance
  criteria), a rejected message never being stored, HTML sanitization surviving storage, the
  50-message cap with pruning, and the rate limiter (429 + `Retry-After`, independent of
  moderation).
- Live-verified with curl against a temporary `DB_PATH` (not the persistent dev DB, per my own
  Lessons Learned): happy path, all 5 moderation error codes, `timer_not_found` on both routes,
  `invalid_body`/`invalid_json`, `payload_too_large`, and the rate limit with its `Retry-After`
  header — all matched the documented contract. Cleaned up the temp DB and killed the server
  afterward.
- Ran `node --test "test/*.test.js"` (glob, not a bare directory arg, per my own Lessons Learned):
  116/116 pass, no regressions in the pre-existing 102.

## What I found (and fixed before delivering)
1. First draft of `docs/api.md` accidentally duplicated the full error table + trade-offs list
   (once under the new `POST /api/timers/:slug/message` section, once in a leftover "Moderation
   Layer error reference" section at the bottom). Caught on a self-review re-read of the diff;
   removed the redundant trailing section so there is exactly one place documenting these codes.
2. My "50-message cap" test posted 55 messages in a row against the *default* 20/hour rate
   limiter and failed with `429` at message #21 — a self-inflicted collision between two features
   I was testing in the same request loop. Fixed by overriding `messageRateLimit` to a high limit
   for that specific test, since it's exercising the storage cap, not the rate limiter (same
   pattern the RX-3 tests already use for isolating "cap" tests from "rate limit" tests).
3. Ran the Rule 7 bidirectional sweep on the `POST /api/timers/:slug/message` error table before
   delivering: all 10 rows (`timer_not_found`, `invalid_body`, `invalid_json`, `invalid_message`,
   `message_too_long`, `message_repeated_chars`, `message_contains_link`,
   `message_blocked_content`, `payload_too_large`, `rate_limited`) have a matching test asserting
   that exact `code` string, copied from the table, not from memory of what `moderation.js`
   "probably" returns.

## Lesson learned
No new repeatable-mistake pattern beyond what's already in my Lessons Learned section — item #2
above is an instance of a general "don't let two features you're testing in the same loop
interfere with each other" issue, already covered by the RX-3 precedent I followed once I noticed
it, not a new class of mistake.
