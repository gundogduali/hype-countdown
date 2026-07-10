# Retro — backend-developer — 2026-07-09 (BE-3: seed date corrections)

## What I did
- `src/db/seed.js` was aligned with the PM-verified PRD Appendix A: Eurovision 2027 Final `2027-05-26T19:00:00Z`, Zelda Movie `2027-04-30T00:00:00Z`, iPhone 18 title `iPhone 18 Tanıtımı (beklenen)` (Turkish-era title, = "iPhone 18 Announcement (expected)"; date unchanged). A change note was added to the seed title comment.

## Verification
- 26/26 tests green (no test depended on the three changed records, no updates needed).
- The existing-deployment scenario was simulated with a temporary DB_PATH: DB full of old values + 1 custom timer → server restart → the three records updated, slug and `created_at` preserved, custom timer untouched, curated count 17 (missing ones added, no duplication). The dev DB was never touched (code-reviewer's FE-1 review unaffected).
- Programmatic cross-check: the seed list matches the PRD Appendix A table 17/17 exactly by title+date.

## What the orchestrator needs to know
- The change is data only; API contract and behavior unchanged. A restart is enough in running environments.
- Upsert does not update `created_at` (deliberate): a record keeps its first seed date.
