# Retro — backend-developer — 2026-07-09 (BE-5: English switch)

## What I did
- Translated everything Turkish in `backend/` (all comments, log strings, error messages, package.json description) and rewrote `docs/api.md` fully in English (bumped to v2.1, same structure and error codes).
- Category API values: `oyun/spor/film-dizi/teknoloji/ozel-gunler` → `games/sports/movies-tv/tech/holidays` in `CATEGORIES`, the SQLite CHECK constraint, tests, and the contract.
- Added a legacy-schema migration in `src/db/index.js`: DBs created with the old Turkish CHECK constraint are rebuilt (rename → copy → drop) with category values mapped; custom rows preserved. Approved as destructive pre-launch.
- Reseeded all 17 curated rows per PRD v2.1 Appendix A (English titles + slugs); New Year target moved to `2027-01-01T00:00:00Z` (UTC midnight). Seed now deletes curated rows whose slug fell out of the list (`is_curated = 1 AND slug NOT IN (...)`) — custom rows are never touched.
- Tests rewritten in English + 2 new tests (seed obsolete-slug cleanup; legacy schema migration incl. custom-category mapping): 29 passing (was 27).

## Verification
- `grep` for Turkish-specific characters over `backend/` + `docs/api.md`: clean.
- Rule 7 sweep: every row of the error tables in `docs/api.md` matched 1:1 against test asserts (same `code` per input) — no mismatches.
- Live run on `PORT=3999` + temp `DB_PATH` (dev server on 3001 and `backend/data/` untouched):
  - Fresh DB: 17 English curated rows, correct ordering, English error messages, POST/404/invalid-category flows OK.
  - Legacy DB (old schema + `yilbasi-2027`, `noel-2026`, old `gta-6`, custom row with `spor`): boot rebuilt the schema, seed removed obsolete slugs and upserted the 17 new rows, custom row survived with category mapped to `sports` and its user-written Turkish title intentionally untouched (user content is not ours to translate).

## Found / fixed along the way
- The old seed had no removal path — obsolete curated slugs would have lingered forever on existing DBs. The new `NOT IN` delete fixes the immediate Turkish-slug cleanup and future curation removals.
- Note for ops: the running dev server (port 3001) still serves old code/data; on its next restart the migration + seed cleanup will convert its DB automatically (verified this exact path on a copy of the legacy schema).

## Lessons
- No new repeatable mistake this run; existing lessons (contract↔test 1:1 sweep, temp DB_PATH for live checks) were applied and paid off.
