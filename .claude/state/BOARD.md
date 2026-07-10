# Task Board — Hype ⏳

> 2026-07-07: Project relaunched as **Hype** (popular countdowns) (PRD v2.0). Previous work is in the archive (below).

## To Do (Phase 3: live demo on Render — 2026-07-10 user decision: Render free, single service)
- [DP-3] User deploys on Render (blueprint) → PM verifies the live URL end to end → fix README URL if Render assigned a suffixed domain

## In Progress
- (empty)

## In Review
- (empty)

## Known minor issues (v1.1 candidates — from the FE review, deliberately deferred)
- If an Explore card/hero timer expires while the screen is open, it stays frozen at 0 (no refetch)
- No arrow-key navigation in the emoji radiogroup
- "All" empty list shows the "In this category..." text
- gmtLabel DST edge case (TR not affected)

## Done
- [PM-1] PRD v2.0 written (docs/PRD.md), scope decisions settled with the user
- [PM-2] PRD v2.1 (English), CLAUDE.md (English), docs/copy.md (copy deck) written; FE-3 deviations recorded in the deck (2026-07-09)
- [BE-1] backend API v2: 3 endpoints + seed + rate limit; code-review APPROVED (1 fix, 23/23 tests)
- [DS-1] 7 screens/variants dark premium design — user APPROVED (2026-07-07)
- [BE-2] polish + code-review: TRUST_PROXY rate-limit bypass vulnerability closed by the reviewer, contract aligned; 26/26 tests (2026-07-09)
- [QA-0] PM: seed dates verified from the web; Eurovision + Zelda corrected, iPhone 18 "(expected)" — PRD Appendix A up to date (2026-07-09)
- [BE-3] seed alignment: 3 records updated, seed↔Appendix A 17/17 exact match, 26/26 tests; separate code-review skipped since data-only (PM decision) (2026-07-09)
- [FE-1] frontend + code-review APPROVED: reviewer made 4 fixes (category race, retry guard, copy label, aria-invalid style) (2026-07-09)
- [QA-1] end-to-end verification: **READY TO SHIP, 10/10 criteria PASSED** (38 API + 33 browser checks; report: docs/qa-report.md; persistent smoke: frontend/e2e/smoke.mjs) (2026-07-09)
- [BE-4] QA B-1 closed: >100KB body → 413 `payload_too_large`; the Rule 7 sweep also closed the `invalid_emoji` test gap; 27/27 tests (2026-07-09)
- [FE-2] QA B-2 closed: inline data-URI favicon replaced with a link to the branded favicon.svg; build + console clean (2026-07-09)
- [BE-5] backend fully English: category values + 17 English seeds (slugs included), legacy-DB migration, old-slug cleanup; api.md v2.1; 29/29 tests (2026-07-09)
- [FE-3] frontend fully English: exact match to copy.md, locale fix, smoke 19/19 (English asserts); copy.md deviations recorded in the deck with PM approval (2026-07-09)
- [DS-2] .pen fully English (copy.md v2.1 exact, mock content Appendix A); old frames were already gone; Empty Category id changed Tdh23→CVv0i (2026-07-09)
- [REV-3] translation diff review: **ship-ready** — contract sync, 39 live copy asserts, extra migration idempotency tests; 1 direct fix; 2 nits to FE-4/BE-6, qa-report decision to QA-2 (2026-07-09)
- [FE-4] arrow removed + rate-limit message pluralization; lint+build clean (2026-07-09)
- [BE-6] 429 message plural-aware + new unit test; 31/31 tests (2026-07-09)
- [FE-5] Countdown aria-live plural fix (plural helper); lint+build clean (2026-07-09)
- [QA-2] v2.1 English verification: **READY TO SHIP, 10/10 PASSED** (31/31 backend, 19/19 smoke, ~70 extra checks; migration + clean-DB 17/17; zero Turkish); qa-report.md regenerated in English; 1 new low finding (F-1 → FE-6) + copy.md documentation note (PM handled) (2026-07-10)
- [PM-3] copy.md updated: mobile nav `+ Create`, toast, create hint/footnote, full server-error table (from the QA-2 note) (2026-07-10)
- [TR-2] .claude/ fully English: 6 agent definitions, 24 retro files, BOARD, hook (bash -n OK), settings statusMessage; PM sweep verified — only glossed historical literals remain; orchestrator language rule re-added in English (PM decision) (2026-07-10)
- [FE-6] QA-2 F-1 closed: smoke.mjs regex singular/plural-aware; smoke 19/19 on isolated instance; one-line test-infra change, PM reviewed the diff directly (BE-3 precedent) (2026-07-10)
- [GH-1] repo prep: git init (main) + root .gitignore (dev DB/node_modules/dist ignored, verified) + secret/personal-data sweep clean + demo assets in docs/assets/ (3 desktop PNGs @2x, mobile PNG, 343 KB hero.gif with NumberFlow animation) (2026-07-10)
- [PM-4] README.md (English, hero GIF + screenshots + agentic-team story) + MIT LICENSE written by PM (2026-07-10)
- [GH-2] **Published**: https://github.com/gundogduali/hype-countdown (public, main, 102 files, c7c5844); repo/README/assets verified via gh api; topics added; repo-local git email set to GitHub noreply for privacy (2026-07-10)
- [DP-1] Render deploy prep: Express serves frontend dist when STATIC_DIR set (SPA fallback, cache headers), render.yaml blueprint (free, frankfurt, TRUST_PROXY=true, health check /api/timers); 8 new tests, 39/39; prod-mode boot verified with curl incl. XFF rate-limit keying (2026-07-10)
- [DP-2] DP-1 code review: **ship-ready** — API never falls through to SPA, traversal-safe, render.yaml runtime shape replicated locally; 2 non-blocking notes (stale-hash /assets miss → index.html; app.get('*') is Express-4-only); Rule 7 sharpened in backend-developer.md (3rd assertion-from-memory recurrence); PM: README Live Demo section + Deploy-to-Render button (2026-07-10)

## Archive (old project — Focus Garden / UGC, cancelled)
- Done: PRD v1.0 + API contract, backend API (19/19 tests), code-review fixes, 6-screen Pencil design
- Not started: frontend, QA
