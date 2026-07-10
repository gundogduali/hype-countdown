# QA Report — Hype ⏳ MVP (v2.1)

> Date: 2026-07-10 · QA: qa-engineer · Run: QA-2 (English release verification)
> Scope: PRD v2.1 Section 7 acceptance criteria, English copy conformance against `docs/copy.md`, and the legacy-DB migration path. Seed date accuracy is out of scope (verified by the PM against web sources on 2026-07-09, PRD Appendix A).
> Method: backend and frontend were actually booted and exercised end to end — API via `curl`/Node `fetch`, UI via headless Chrome (playwright-core + system Chrome). All write/destructive tests ran against **temporary `DB_PATH` instances** on alternate ports (backend :3101, Vite :5273 with `API_PROXY_TARGET`); the dev database (`backend/data/hype.db`) was never touched.
> Environment: macOS, Node 25, TZ Europe/Istanbul (GMT+3), browser default locale.

## Overall Verdict: **READY FOR RELEASE** ✅

**10 of 10 acceptance criteria PASS.** Backend unit/integration suite: **31/31 PASS**. Persistent e2e smoke (`frontend/e2e/smoke.mjs`): **19/19 PASS**. Extended QA-2 browser/API pass: 70+ checks, all PASS. One new **low**-severity finding (test-infrastructure flakiness, not a product bug — see F-1). No Turkish text remains anywhere user-visible.

## Acceptance Criteria — One by One

### 1. Explore lists curated timers with a working category filter; remaining times live and correct — **PASS**
- API: `GET /api/timers` → 17 timers matching Appendix A exactly (slug, title, category, emoji, `target_at`), all `is_curated=true`, sorted `target_at` ASC (hero = FIFA World Cup Final, 2026-07-19T19:00Z). `?category=sports` → 5, all `category=sports`. Invalid category → `400 invalid_category`.
- UI: "17 ACTIVE TIMERS" + 17 cards; **Sports ⚽** chip → 5 cards, every card tag reads `SPORTS`, counter "5 ACTIVE TIMERS"; **All** restores 17.
- Live correctness (math): hero `aria-label` converted to seconds = **885,042 s**; expected (`target_at − real now`) = **885,042 s** → 0 s drift. Counter label changed after 2.2 s (ticks live).
- Empty-category state: with the only `games` row removed from the temp DB, the Games filter showed "No timers in this category yet." + **Show all** (which reset the filter correctly).

### 2. Expired curated timers excluded from the list; their detail shows the ended state — **PASS**
- An expired curated row (`qa-expired-curated`, target 2026-01-01) was injected into the temp DB: absent from `GET /api/timers`, but `GET /api/timers/qa-expired-curated` → 200, and `/t/qa-expired-curated` rendered "🎉 It's time!" + "THE WAIT IS OVER".

### 3. Custom timer creation + validation + reachable via slug URL — **PASS**
- UI flow: `/create` filled (title "QA UI Timer", +36 h, 🚀) → 201 → redirected to `/t/6uwiia1cup`, title and "(your local time)" date line correct; slug URL opened directly in a fresh browser context.
- Client validation: empty submit → "Title is required." + "Pick a date and time."; past date → "Pick a date in the future." (blocked before any API call).
- API validation: empty title / 81-char title → `400 invalid_title`; past date → `400 target_in_past`; timezone-less date → `400 invalid_target_at` (all via smoke).
- Slug: 10 chars `[a-z0-9]`, random. Offset input `2026-08-01T09:30:00+03:00` stored normalized as `2026-08-01T06:30:00.000Z`.
- Concurrency: 2 simultaneous POSTs → both 201, distinct slugs (`wda3ggwzyv`, `lyv5qbsz6p`).

### 4. Custom timers never appear in Explore — **PASS**
- Created custom timers absent from `GET /api/timers` (unfiltered and filtered); reachable only by slug URL (smoke + hand checks).

### 5. Per-second tick + correct after refresh + correct with a skewed client clock — **PASS**
- Tick: hero label changed between samples 2.2 s apart; NumberFlow digit animation visible.
- Refresh: after reload of `/t/6uwiia1cup`, shown = **157,639 s**, expected = **157,639 s** → 0 s drift.
- Skewed clock: browser context with `Date.now()`/`new Date()` shifted **+2 hours** → counter showed **157,637 s** vs expected 157,637 s (an uncorrected client would show 150,437 s). The `serverNow` offset correction works (PRD 3.5).

### 6. Dates render in the user's local timezone (storage UTC) — **PASS**
- Storage UTC verified (`…Z` in DB/API; +03:00 input normalized to UTC).
- Rendering in GMT+3: FIFA `2026-07-19T19:00Z` → "July 19, 2026 · 10:00 PM (your local time)"; GTA 6 `2026-11-19T00:00Z` → "November 19, 2026 · 03:00 AM (your local time)". Browser default locale, no hardcoded locale.

### 7. Share → link copied to clipboard with feedback — **PASS**
- Click "Copy link" → button becomes "✓ Copied" (reverts after ~1.5 s) + toast "✓ Link copied to clipboard"; clipboard content read back = exact page URL.

### 8. Unknown slug shows a 404 page — **PASS**
- API: `GET /api/timers/no-such-slug-xyz` → `404 timer_not_found`; unknown endpoint → `404 not_found`.
- UI: `/t/definitely-not-real` and `/nope/nothing` → "4⏳4 / This timer doesn't exist." + "The link may be wrong, or the timer was never created." + Back to Explore / Create Timer.

### 9. Data persists in SQLite across server restarts — **PASS**
- Backend killed and restarted on the same `DB_PATH`: all 3 custom timers still 200 (`6uwiia1cup`, `azbhc01xnk`, `jotffq7xv5`); curated list back to exactly 17 with no duplicates; seed self-heal confirmed (deleted `gta-6` restored, injected non-seed curated slug removed, custom rows untouched).

### 10. UI faithful to the approved design, dark premium, all copy in English — **PASS**
- Headless screenshots (Explore, Detail, Create) reviewed on 2026-07-10: near-black background, purple/pink glow gradients, giant Geist Mono counter with digit-slide animation, chip filters, gradient CTA — consistent with the approved Pencil design (v2.1 was a copy-only change; REV-3 reviewed the translation diff). No layout breakage or overflow, no console/page errors on any screen.
- English copy: see the dedicated section below.

## English Copy Verification (v2.1, per `docs/copy.md`)

- `<html lang="en">` ✓ · tab title `Hype ⏳ — Countdown to what's next` ✓ · favicon.svg served (200, no console 404) ✓
- Key strings asserted verbatim in the browser on every screen:
  - **Explore**: nav `Explore`/`Create Timer`, `⚡ FEATURED COUNTDOWN`, `Open fullscreen →`, `Popular countdowns`, `{n} ACTIVE TIMERS`, unit labels `DAYS/HOURS/MINUTES/SECONDS`, all 6 chips (`All`, `Games 🎮`, `Sports ⚽`, `Movies & TV 🎬`, `Tech 📱`, `Holidays 🎉`), CTA banner (`Can't find your moment?` + sub), empty state (`No timers in this category yet.` + `Show all`).
  - **Create**: `New countdown ⏳`, `Pick a moment, get a link, share the hype.`, placeholder `What are you waiting for?`, fields `Title/Date/Time/Emoji/Category (optional)`, `Start countdown ⏳`, validation strings, 429 message `Too many timers created. Try again in about 60 minutes.` (live-triggered, see destructive tests).
  - **Detail**: `Copy link` / `✓ Copied`, `(your local time)` date line, category tags UPPERCASE (`SPORTS`, `GAMES`…).
  - **Ended**: `It's time!`, `THE WAIT IS OVER`, `Create your own timer`.
  - **404**: heading, sub, and both actions.
- Turkish-character scan (`çğışöüÇĞİŞÖÜ`) of rendered body text on Explore, Create, Detail, Ended and 404: **zero hits**. Source grep of `frontend/src`, `index.html`, `public/` and `backend/src` (Turkish characters + common Turkish UI words): no Turkish strings — the only hit was the substring "Spor" inside the English label "Sports" (false positive from the word list, not Turkish text).
- API/backend messages: all English (`invalid_title`, `timer_not_found`, 429 wording with correct singular/plural "minute(s)" — unit-tested 31/31).

## Legacy Migration Verification (v2.0 Turkish DB → v2.1)

Reproduced end to end, not just via the suite: a DB file was built with the **old Turkish schema** (`CHECK category IN ('oyun','spor','film-dizi','teknoloji','ozel-gunler')`) containing 2 Turkish curated rows + 1 custom row with `category='oyun'` + 1 uncategorized custom row. The current backend was booted against it:
- Table rebuilt without error; **custom rows preserved** with categories mapped (`oyun` → `games`; `null` stays `null`), slugs/titles/dates intact.
- Old Turkish curated slugs deleted by seed cleanup (`gta-6-cikis`, `yilbasi-2027` → 404); 17 English curated rows seeded per Appendix A.
- Fresh-DB path also verified: empty `DB_PATH` → exactly 17 English curated rows, slugs/titles matching Appendix A 17/17.
- Suite coverage: migration + idempotency + custom-category mapping tests included in the 31/31.

## Destructive Tests (temp instance only)

- **Rate limit**: 20 POSTs → all 201; 21st → `429 rate_limited`, `Retry-After: 3600`, English message. UI submit while limited → form shows `Too many timers created. Try again in about 60 minutes.` and the submit button recovers (not stuck in `Creating…`).
- **Oversized payload**: >100 KB JSON body → `413 payload_too_large` (QA-1 finding B-1 confirmed fixed).
- **Double submit**: 2 concurrent POSTs → both 201, distinct slugs, no crash.

## Findings (new)

### F-1: `smoke.mjs` counter regex breaks on singular units — severity: **low** (test infrastructure, not product)
- Repro: run `frontend/e2e/smoke.mjs` at a moment when any hero unit equals exactly 1 (e.g. 1 second past the minute) → the "Explore: hero counter correct" check FAILs with `shown=NaNs`.
- Expected: the check parses the label regardless of pluralization.
- Actual: FE-5 changed the countdown `aria-label` to grammatical singular/plural (`1 second`, `frontend/src/components/Countdown.jsx:30,73`), but the smoke regex still requires plural forms: `/(\d+) days (\d+) hours (\d+) minutes (\d+) seconds/` (`frontend/e2e/smoke.mjs:95`). Roughly ~7% chance per run that some unit is 1 → intermittent false FAIL.
- Fix suggestion (owner: frontend/QA): `/(\d+) days? (\d+) hours? (\d+) minutes? (\d+) seconds?/`.
- Did not affect this run (19/19 PASS at the sampled moment); confirmed by code inspection.

### Documentation note (info, no severity)
A few implemented strings are not yet in the `docs/copy.md` deck (all English, all fine): toast `✓ Link copied to clipboard`, create-page helper `You'll get a unique link — your timer is only visible to people who have it.`, `In your local timezone (GMT+X)`, mobile nav label `+ Create`, and the server-error mappings in `Create.jsx`. Deck says the frontend is its reference implementation — PM may want to fold these in at the next deck pass.

### Known deferred minors (already on BOARD, not re-reported)
Card/hero freezing at 0 if it expires while Explore is open (no refetch) · no arrow-key navigation in the emoji radiogroup · empty "All" list reuses the category empty-state text · `gmtLabel` DST edge case.

## Test Inventory

- Backend unit/integration: `backend/test/api.test.js` + `backend/test/rate-limit.test.js` → **31/31 PASS** (`cd backend && npm test`). Covers contract, validation, 413, 429 + wording, trust proxy, seed idempotency/cleanup, legacy migration + custom-category mapping.
- Persistent e2e smoke: `frontend/e2e/smoke.mjs` → **19/19 PASS** this run (English assertions; usage documented in its header; browser steps auto-skip without playwright-core).
- QA-2 extended pass (this run, ad hoc): ~55 browser checks (copy conformance, filter UI, create flow, clipboard, refresh, +2 h clock skew, live ended-state flip, 404, Turkish scans) + ~15 API checks (expired-curated exclusion, UTC normalization, persistence/restart, migration boot, rate limit, 413, concurrency) → all PASS.
- Production build: `npm run build` clean (no warnings/errors).

## Test Hygiene

- All write/destructive tests used throwaway DBs under the session scratchpad; instances ran on :3101/:3102 (backend) and :5273 (Vite). The dev database was verified clean afterwards: 17 curated rows, none of the QA slugs present.
- All QA-spawned processes were stopped at the end of the run; no test data left anywhere in the repo.
