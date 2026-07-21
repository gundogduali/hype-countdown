# Backend Developer Retro — 2026-07-20 (RX-3: Hype Reactions backend)

## What I did

- Read `docs/api.md` and PRD §9.2 fully before starting; reused the existing `rate-limit.js` per-IP window limiter pattern, and the existing `timer_not_found` 404 shape.
- Schema (`backend/src/db/index.js`): added two new tables, per the issue's explicit instruction to keep aggregate counts and uniqueness separate:
  - `reaction_totals (timer_slug, emoji, count)` — PK `(timer_slug, emoji)`, live count per emoji per timer.
  - `reaction_marks (timer_slug, emoji, ip, created_at)` — PK `(timer_slug, emoji, ip)`, the actual DB-level uniqueness constraint (not an app-level SELECT-then-INSERT). Both have `FOREIGN KEY ... REFERENCES timers(slug) ON DELETE CASCADE` and a `CHECK (emoji IN (...))` restricting to the fixed 5-emoji set at the DB layer too, not just in application code.
- `backend/src/services/reactions.js` (new): `ReactionService.react(slug, emoji, ip)` wraps the mark-insert + count-upsert in `BEGIN IMMEDIATE ... COMMIT`, catching a `UNIQUE` constraint violation on `reaction_marks` as a benign no-op (duplicate from the same IP) rather than an error. `getCounts(slug)` always returns all 5 emoji keys, defaulting unused ones to 0.
- `backend/src/routes/timers.js`: new `POST /:slug/react` (checks `timer_not_found` first, then body-is-object, then delegates emoji validation to the service); `withReactions()` helper attaches the `reactions` field additively to every Timer Object response (list, detail, create).
- `backend/src/services/rate-limit.js`: made the 429 message text overridable (default unchanged) so the new endpoint's limiter could say "reactions" instead of "timers" without touching existing wording/tests.
- `backend/src/app.js`: wired a second, more generous rate limiter (100/hour) for the react endpoint — a backstop against request flooding, distinct from the per-(slug, emoji, ip) uniqueness check that is the actual duplicate-prevention mechanism.
- `docs/api.md`: added `reactions` to the Timer Object table and all three existing example responses (list/detail/create — additive, not breaking); new `POST /api/timers/:slug/react` section with request/response shape and error table; noted the IP-only-identity MVP limitation explicitly in the endpoint's docs (not just in this retro); bumped to v2.2 with a changelog line.
- Tests (`backend/test/api.test.js`): 14 new tests — reactions field present/all-zero by default, happy path + persistence on GET, all 5 emoji accepted, 7 invalid-emoji cases (missing/wrong-type/empty/multi-emoji/valid-but-different-emoji/plain text) each asserted against `invalid_reaction_emoji` copied from `docs/api.md`, same-IP-same-emoji-twice-is-idempotent, same-IP-different-emoji-or-different-timer-both-work, different-IP-same-emoji-both-count (via `TRUST_PROXY=1` + XFF, reusing the existing trust-proxy test pattern), unknown-slug → `timer_not_found`, non-object/malformed JSON body, oversized payload, and a rate-limit test that deliberately uses 4 *distinct* emoji so the 429 is attributable to the rate limiter and not the uniqueness constraint.
- Verified live: started the server against a temporary `DB_PATH` under the scratchpad (never the persistent dev DB), and curled every success/error path by hand — happy path, exact-duplicate-from-same-IP (count stayed at 1), invalid/empty/multi-emoji, unknown slug, malformed JSON, JSON primitive body, oversized payload — before running `sqlite3` against the temp DB to confirm the two tables' actual rows/constraints, then deleted the temp DB.
- Ran the full `npm test` suite: all 49 tests I own (api/rate-limit/static) pass. 3 pre-existing failures live in `test/moderation.test.js`, which belongs to the `content-moderator` agent working in parallel on a disjoint feature (`backend/src/middleware/moderation.js`, untracked at the time I read `git status`) — confirmed via `git status` that I never touched that directory, and left those failures alone per my task's explicit "stay out of that directory" constraint.

## What I found / fixed

- The existing schema-key assertion test (`Object.keys(t).sort()` in the list test) needed updating to include `reactions` — an expected, intentional update to an existing test for an additive contract change, not a bug. Fixed inline.
- Caught myself writing an unnecessarily convoluted expression (`` `/timers/${randomSlug() && 'gta-6'}/react` ``) while drafting the emoji-acceptance test — a leftover from an earlier draft that added no value and obscured the test's intent. Simplified to a direct literal before finishing.
- No SQL-injection surface introduced: all reaction queries are parameterized (`?` placeholders via `db.prepare(...).run(...)`), and the emoji is additionally constrained by a `CHECK` at the DB layer, so even a application-layer validation bug couldn't get a non-fixed-set emoji into the table.

## Lessons

No new repeatable-mistake pattern this time; existing lessons (temp `DB_PATH` for live verification, copying error codes from `docs/api.md` rather than memory, testing regex edge cases) were followed and none were violated. Nothing new added to the "Lessons Learned" section this round.
