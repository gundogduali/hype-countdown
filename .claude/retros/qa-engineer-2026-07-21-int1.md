# Retro — INT-1 cross-feature integration pass (2026-07-21)

## What I tested
- Built the real frontend (`vite build`) and booted the real backend with
  `STATIC_DIR` pointed at `frontend/dist`, `PORT=3093`, and a scratch
  `DB_PATH` (never touching any other running instance).
- Ran the full backend suite (`node --test "test/*.test.js"`): 144/144 pass.
- Ran the full chained frontend e2e suite exactly as `npm test` invokes it
  (`smoke.mjs && reactions.mjs && messages.mjs`) against ONE fresh DB with
  both `API_URL`/`APP_URL` pointed at the built+served instance on 3093: all
  PASS, including the message-rate-limit-exhaustion test at the end.
- Wrote an ad-hoc (scratch-only, not committed) Playwright script covering
  exactly the coexistence angles no single-feature QA pass had checked:
  - Desktop (1400px) and mobile (375px) layout of Countdown + copy-link row +
    ReactionBar + MessageInput + MessageList together, verifying all 4
    sections render with real bounding boxes and stack top-to-bottom with no
    overlap, on both a fresh custom timer and the real expired curated timer
    `world-cup-2026-final`.
  - Combined interaction on one page load: typed an in-progress (unsubmitted)
    message, then tapped a reaction mid-type, confirmed the in-progress text
    survived the reaction tap and the reaction still showed pressed=1
    immediately; then submitted the message and confirmed the reaction state
    was untouched by the sibling MessageList update; then did a full page
    reload (a genuine MessageList refetch + ReactionBar remount from
    server truth + localStorage) and confirmed both features' state
    (message persisted, "already reacted" persisted) survived independently.
  - Page-source (`fetch` the raw HTML, not the browser DOM) check that
    `og:image`/`twitter:card`/`og:title` meta tags are present in the
    server-templated HTML on both a custom timer and the expired curated
    timer, and that the same HTML still contains the `#root` mount point React
    hydrates into (server template + client hydration coexist, don't clobber
    each other).
  - Spot-checked og-image rendering for the ⚽ soccer-ball curated timer
    (`ucl-final-2027`) and confirmed it matches the already-documented,
    accepted "monochrome for a few specific codepoints" Skia limitation
    (PM-11) rather than a new bug — visually inspected the rendered PNG.
    Also visually inspected the ended-state og-image for the real expired
    `world-cup-2026-final` timer (🏆 trophy, full color, correct "It's time!"
    layout) to confirm SC-3/SC-4/DP-4 still work on this specific
    already-expired timer.
  - Ran my own combined-interaction script twice in a row against the SAME
    fresh DB (idempotency check) before finalizing it.

## What I found
- No bugs. All 6 acceptance-criteria points PASSED:
  1. Visual/layout: PASS (desktop + mobile, both an active and the real
     expired timer, screenshots inspected + bounding-box asserts).
  2. Independent functionality together: PASS (react + message on one load,
     verified no state/network cross-talk in either direction, incl. across
     a real reload/refetch).
  3. Page-source SSR meta tags coexist with client hydration: PASS.
  4. Already-expired real timer (`world-cup-2026-final`) has a working
     ReactionBar and MessageInput/List alongside the ended-state UI: PASS.
  5. Full regression (backend 144/144 + chained smoke/reactions/messages
     e2e) from one fresh DB: PASS, no crash (the QA-4 chained-rate-limit fix
     holds).
  6. og-image ⚽ spot check: PASS, matches the documented monochrome
     limitation, not a new bug.
- Caught one bug in my OWN test script before it became a false finding: used
  `.innerText()` to read a `ReactionButton`'s count, which is the exact
  NumberFlow shadow-DOM trap from an earlier lesson — fixed to use
  `ariaSnapshot()` per that lesson before trusting the result.
- Caught a second self-inflicted issue: a fixed literal message string made
  my own combined-interaction check non-idempotent across reruns against the
  same DB (`getByText(...)` resolved to 2 elements on the 3rd run). Fixed by
  making the posted message text unique per run (`slug + Date.now()`) and
  using `.first()` — then verified the fixed script passes twice in a row
  from one fresh DB before finishing.

## What I could not test
- Nothing in-scope was left untested. Per the task's own framing ("lighter-
  weight integration check, not a full re-verification"), I did not re-verify
  every single-feature behavior already covered by SC-6/RX-5/HM-6/DP-4/REV-7 —
  only the coexistence angles a combined page uniquely exposes.

## Persistent test decision
No genuine coexistence gap was found, so per this task's explicit constraint
("persistent test additions if you find a genuine coexistence gap worth
locking in") I deliberately did NOT add a new e2e script to the repo. The
ad-hoc Playwright script and screenshots used to prove the above live only in
the scratch directory, not in `frontend/e2e/`.

## Process notes / cleanup
- Killed both scratch server instances I started (ports 3093) and confirmed
  via `ps`/`lsof` that nothing remains listening before finishing.
- Installed `playwright-core` in `frontend/` with `--no-save` (matches this
  project's established e2e convention) — did not modify `package.json`/
  lockfile; confirmed via `git diff` that the only pending `package.json`
  change is pre-existing (the `test` script from QA-4), not mine.
