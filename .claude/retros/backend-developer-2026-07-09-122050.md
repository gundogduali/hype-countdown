# Retro — backend-developer — 2026-07-09 12:20 (BE-3 closing)

## What I did
- `src/db/seed.js` was aligned with PRD Appendix A as verified from the web by the PM: Eurovision `2027-05-26T19:00:00Z`, Zelda `2027-04-30T00:00:00Z`, iPhone 18 title `iPhone 18 Tanıtımı (beklenen)` (Turkish-era title, = "iPhone 18 Announcement (expected)"). Slugs unchanged; a change note was added to the seed comment.

## What I found in review, what I fixed
- No bug requiring a fix came up. Extra checks: the longer iPhone title is within the 1–80 limit; the three records have the expected values in the seed; 26/26 tests green.
- No test asserts depended on the changed records (confirmed with grep), no updates needed.
- Upsert behavior was verified in the existing-DB scenario with a temporary `DB_PATH`: after restart the 3 records were updated, `created_at` and slugs preserved, custom timers untouched, curated count 17. The dev DB was not touched (FE-1 review unaffected).
- Programmatic cross-check: seed ↔ PRD Appendix A title+date 17/17 exact match.

## What the orchestrator needs to know
- Data-only change; API contract/behavior unchanged. A restart is enough in running environments.
- Upsert does not update `created_at` (deliberate).
- No lesson added: no repeatable mistake occurred; the earlier "temporary DB_PATH" lesson was applied in this task.
