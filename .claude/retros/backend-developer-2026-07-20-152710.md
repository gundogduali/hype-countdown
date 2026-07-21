# Backend Developer Retro — 2026-07-20 15:27 (RX-3 self-correction pass)

This is a follow-up, deeper review pass on the same RX-3 (Hype Reactions backend) task after my
first close-out. The first pass already covered the documented acceptance criteria with
unit tests and basic curl checks; this pass specifically stress-tested my own strongest claims
(race-safety, "not just an app-level SELECT-then-INSERT") instead of taking them on faith.

## What I re-reviewed

1. Re-read `backend/src/services/reactions.js`, `backend/src/routes/timers.js`,
   `backend/src/db/index.js` against the task's acceptance criteria line by line.
2. Specifically distrusted my own inline comment claiming the uniqueness constraint is
   "race-safe... even if this ever runs against a shared DB file from more than one process" —
   a claim I had NOT actually tested, only asserted. Decided to test it rather than leave it
   as an unverified comment.
3. Checked an edge case not covered by the automated tests: a `POST /react` request with no
   `Content-Type: application/json` header at all (so `express.json()` never runs).
4. Checked what node:sqlite's actual error message text is for (a) a `UNIQUE` constraint
   violation on `reaction_marks` and (b) a `CHECK` constraint violation on the emoji column —
   my duplicate-detection code branches on `/UNIQUE/.test(err.message)`, so if that assumption
   about the message text were wrong, every duplicate reaction would incorrectly bubble up as
   a 500 instead of being treated as a harmless no-op.

## What I found (and verified, not just fixed blindly)

- **Content-Type-less POST**: confirmed this does NOT crash — Express defaults `req.body` to
  `{}` when no parser matches, so my `typeof req.body !== 'object'` guard passes, `req.body.emoji`
  is `undefined`, and the service correctly returns `400 invalid_reaction_emoji` (not a 500, not
  a silent success). No bug, but worth having actually run it rather than assumed it.
- **Error-message-text assumption**: ran a direct script against `ReactionService` and confirmed
  node:sqlite's actual violation messages are `"UNIQUE constraint failed: reaction_marks..."`
  and `"CHECK constraint failed: emoji IN (...)"` — i.e. my regex-based duplicate/real-error
  branching is correct, and a real error (e.g. a hypothetical bug that let a bad emoji reach the
  DB layer) would NOT be misclassified as "already reacted" and swallowed. This was a real risk
  I had not verified in the first pass — the code happened to be right, but I hadn't earned that
  confidence yet.
- **True concurrency, single process**: fired 20 simultaneous `fetch()` calls (via `Promise.all`)
  at the same timer/emoji/IP against a live server. Result: exactly 1 counted, the other 19 were
  no-ops. This empirically confirms the earlier assertion (based on "DatabaseSync is synchronous
  so there's no interleaving") instead of just trusting the reasoning.
- **True concurrency, cross-process simulation**: opened two independent `DatabaseSync` handles
  on the *same file path* (simulating two server processes sharing a DB, the scenario my own code
  comment specifically called out) and had both react with the same (slug, emoji, ip). Result:
  one call's `added` was `true`, the other's `false`, and both connections agreed on a final count
  of 1 — proving the `PRIMARY KEY` on `reaction_marks` is a real, file-level constraint doing the
  work, not something that only happens to work because of single-process JS semantics.
- Re-ran the full `npm test` suite: now 95/95 passing (0 failing) — the 3 `test/moderation.test.js`
  failures present at my first close-out have since been fixed by the parallel `content-moderator`
  agent; not something I touched or needed to touch.
- Confirmed via `git status` that only my intended files changed; the parallel agent's
  `backend/src/middleware/`, `backend/src/config/`, and `backend/test/moderation.test.js` remain
  untouched by me, per the task's explicit constraint.
- Confirmed the dev DB (`backend/data/hype.db*`) file timestamps are unchanged by this pass —
  all live verification used temporary `DB_PATH`s under the scratchpad directory, cleaned up
  afterward.

## What I fixed

Nothing needed fixing — this pass was verification of already-shipped code and claims, not new
bug discovery. No code changes were made in this retro pass.

## What the orchestrator needs to know

- RX-3 backend is done and the "race-safe" claim in my own PRD/issue response is now backed by
  an actual concurrent-write test (both single-process and simulated cross-process), not just
  by design reasoning. If RX-4 (frontend) or QA want to double-check this themselves, the repro
  is: two `DatabaseSync` handles on one file path, both call `ReactionService.react()` with the
  same `(slug, emoji, ip)`, exactly one should report `added: true`.
- No blocking issues found. `docs/api.md` v2.2 section for `POST /api/timers/:slug/react` is
  stable and the content-moderator's HM-3 section coexists cleanly after mine (verified no
  merge/formatting damage between our two concurrent edits to the same file).

## Lessons

No new repeatable mistake pattern to add to my agent file this round. The useful discipline this
pass reinforced (test the concurrency/error-message claims your own code comments make, don't just
assert them) is already covered by existing rules (Rule 5: verify by running) — I applied it more
thoroughly here than in my first pass, but it isn't a new distinct lesson worth a new bullet.
