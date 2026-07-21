# Retro — backend-developer, 2026-07-20 (155303 self-correction pass, HM-4)

## Task
Second self-correction pass on HM-4 (Hype Messages route), forced by the SubagentStop hook,
after the first pass already delivered a working implementation + retro
(`backend-developer-2026-07-20-hm4.md`).

## What I reviewed
- Re-read the `docs/api.md` error table for `POST /api/timers/:slug/message` row by row against
  `backend/test/api.test.js` (Rule 7 bidirectional sweep, repeated).
- Verified FK cascade behavior for `messages` when a curated timer row is deleted (the seed's
  obsolete-slug cleanup does a real `DELETE FROM timers`) — confirmed with a standalone script
  against `openDb(':memory:')` that inserting a message then deleting its timer leaves 0 orphan
  message rows (`ON DELETE CASCADE` + `PRAGMA foreign_keys = ON` do their job).
- Verified behavior with no body / empty JSON object sent to `POST /message` (no `content-type`
  header, and `{}`) — both correctly resolve to `400 invalid_message`, not a crash.
- Re-ran `node --test "test/*.test.js"` after a different agent (share-card-developer) had
  concurrently added `routes/og.js` + mounted `ogRouter` in `app.js` in parallel — confirmed no
  conflict markers in any file I touched and all 116 tests (mine + everyone else's) still pass
  together.
- Live-verified the happy path, a non-string `message` field, unknown slug, and the unaffected
  `/react`/`/timers/:slug` responses (reactions field intact) against a fresh temporary `DB_PATH`.

## What I found (and fixed)
1. **Real gap (Rule 7)**: the `docs/api.md` row for `invalid_message` reads "Message is missing,
   **not a string**, or empty/whitespace-only after trim" — but my test only covered the
   "missing" and "empty/whitespace" cases (`undefined`, `''`, `'   '`), never actually exercising
   the "not a string" clause through the real route. Fixed by extending
   `messages: missing/empty/non-string message → 400 invalid_message` to also cover `42`, `true`,
   `null`, `[]`, `{}` as the `message` value — all confirmed to return `invalid_message` through
   the live route.
2. **Process hygiene bug (mine, not a product bug)**: an earlier verification command
   (`... & ... kill %1 ... wait`) timed out after 2 minutes and left two orphaned
   `node src/server.js` processes running in the background (PIDs from two separate temp-DB
   verification runs). Found via `ps aux | grep server.js`, killed both, and removed their
   leftover temp DB directories from the scratchpad. No product code was affected, but this is a
   process-hygiene mistake worth a lesson (background server processes from `&`-launched
   verification commands can survive a failed/timed-out `kill %1` and must be checked for and
   swept explicitly, not assumed dead).
3. Confirmed (not a bug, just double-checked): the `messages` table intentionally has **no**
   schema-level `CHECK` on message length (unlike `timers.title`), because HM-3's `maxLength` is
   config-driven (`moderation.json`) rather than a fixed product invariant — hardcoding it into
   the schema would create a second source of truth that could silently drift from the config.
   Left as-is; documented here so the reasoning is visible to reviewers, not just in my head.

## What the orchestrator needs to know
- HM-4 is fully implemented, tested (116/116, up from 102 pre-existing), and live-verified.
  `docs/api.md` is v2.3 and consistent with the test suite (bidirectional check re-run and passed).
- No conflicts with the concurrently-shipped share-card-developer work (`routes/og.js`); both
  mount under `/api/timers` in `app.js` without colliding routes.
- No orphan processes or leftover temp DBs remain from my verification runs as of this pass.

## Lesson learned
Added to `.claude/agents/backend-developer.md`:
- [2026-07-20] After any `&`-backgrounded verification server + `kill %1`, explicitly confirm
  with `ps aux | grep server.js` (or equivalent) that it actually died — a timed-out cleanup
  command can leave orphan dev servers (and their temp DB files) running silently.
