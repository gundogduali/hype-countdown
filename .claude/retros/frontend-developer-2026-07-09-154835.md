# Retro — frontend-developer, 2026-07-09 15:48 (FE-3: full English localization)

Detailed retro: `.claude/retros/frontend-developer-2026-07-09-fe3.md` (written during the closing protocol). Summary:

## What I did
- Translated all of `frontend/` to English per `docs/copy.md`: every screen's strings, category mapping (`games, sports, movies-tv, tech, holidays`), removed hardcoded `tr-TR` locale, comments/aria-labels, `index.html` (`lang="en"`, new tab title/description), and `e2e/smoke.mjs` assertions.
- Made the Vite `/api` proxy overridable via `API_PROXY_TARGET` (default unchanged) for isolated test instances.

## Review findings & fixes (done during this task)
- Split single Turkish title validation into the deck's two messages.
- Added the deck's `Show all` action to the empty-category state (resets filter).
- Ended-state primary action changed to `Create your own timer` → `/create` per deck.
- Leftover backend process on :3199 wasn't killed by `pkill -f "PORT=..."` (env vars aren't in the command line) — found via `lsof`, killed by PID. Final check confirms no processes left on :3199/:5199; user's servers on :3001/:5173 untouched.
- Final re-verify after all edits: Turkish grep (special chars + diacritic-free words) clean, `npm run lint` + `npm run build` clean, smoke 19/19 PASS (incl. browser steps), screenshots of all 5 states verified (desktop + 390px), `package.json`/lock untouched by the `--no-save` playwright-core install.

## For the orchestrator (copy-deck deviations, docs untouched)
1. Deck labels `{n} ACTIVE TIMERS` as "Hero badge", but in the approved design it's the grid counter; the actual hero badge (`⚡ FEATURED COUNTDOWN`) and grid heading (`Popular countdowns`) aren't in the deck — translated in deck tone. Needs PM confirmation.
2. Strings not in the deck (footer, toast, `Open fullscreen →`, `Creating…`, network/missing-date errors, form footnote) translated consistently — deck could be extended.
3. Dropped the old `🔗 ` prefix on the copy button to match the deck's exact `Copy link`.
4. 404/empty states keep a secondary `Create Timer` action alongside the deck's single listed action.

## Lesson
Added one line to my agent file (pkill/env-var cleanup + diacritic-free Turkish grep).
