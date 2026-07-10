# Retro — frontend-developer, 2026-07-09 (FE-3: full English localization)

## What I did
- Translated every user-visible string in `frontend/` to English per `docs/copy.md` (nav, hero, cards, CTA banner, detail incl. ended state, create form incl. validation/rate-limit messages, 404, empty/error states, `<title>`, meta description, `lang="en"`).
- Switched category mapping in `src/lib/categories.js` to the new API values (`games, sports, movies-tv, tech, holidays`) with English labels/tags.
- Removed hardcoded `tr-TR` from `src/lib/time.js` (browser default locale now); card format `134g …` → `134d …`.
- Translated all code comments, aria-labels, and CSS comments to English.
- Rewrote `e2e/smoke.mjs` assertions/comments in English with new category values and English countdown aria-label regex.
- Made the Vite `/api` proxy target overridable via `API_PROXY_TARGET` (default unchanged) so isolated e2e instances don't depend on the user's backend on 3001.

## Verification
- `grep` for Turkish-specific chars and diacritic-free Turkish words: clean.
- `npm run lint` + `npm run build`: clean.
- Live check on alternate ports (backend :3199 with throwaway DB, Vite :5199): full smoke run (19/19 PASS incl. browser steps). Screenshots verified: Explore desktop + 390px, Create, Detail (live + ended via a manually inserted expired timer), 404. User's dev servers on 3001/5173 left untouched; own processes stopped.

## Found / fixed along the way
- Split the single Turkish title validation into the deck's two messages (`Title is required.` / `Title must be 80 characters or less.`).
- Empty-category state now has the deck's `Show all` action (resets the filter) — previously only a Create CTA.
- Ended-state primary action changed to `Create your own timer` → `/create` per deck (was "Back to Explore").
- `pkill -f "PORT=3199"` didn't kill an env-var-launched process (env not in command line); had to kill by PID from `lsof`.

## Copy-deck deviations to report to PM (docs untouched)
1. Deck labels `{n} ACTIVE TIMERS` as the "Hero badge", but in the approved design that counter sits next to the "Popular countdowns" grid heading; the actual hero badge is `⚡ FEATURED COUNTDOWN` — neither the badge nor the grid heading is in the deck. Implemented: badge `⚡ FEATURED COUNTDOWN`, heading `Popular countdowns`, counter `{n} ACTIVE TIMERS`.
2. Strings not covered by the deck, translated in its tone: `Open fullscreen →`, footer (`Hype ⏳ — count down together`, `ALL TIMES IN YOUR LOCAL TIMEZONE`), toast `✓ Link copied to clipboard`, time helper `In your local timezone (GMT+X)`, create-form footnote, missing/invalid date messages, network error, submitting label `Creating…`.
3. Copy button had a `🔗 ` prefix in the old UI; deck says `Copy link` — prefix dropped to match the deck exactly.
4. 404 and empty state keep a secondary `Create Timer` action alongside the deck's single listed action.
