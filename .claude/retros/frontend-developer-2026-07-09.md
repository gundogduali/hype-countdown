# Retro — frontend-developer — 2026-07-09

## What I did
- Set up a Vite + React (JS) project under `frontend/`: Tailwind v4 (`@tailwindcss/vite`), motion, react-router-dom, `@number-flow/react`, lucide-react.
- Skiper UI research: the counter animation in the registry is `skiper37` — inspected the source; it's a demo wrapping `@number-flow/react` + framer-motion. I used the same foundation (NumberFlow + motion) directly with our theme tokens; instead of copying the demo skeleton, I matched the design's "number-flow" intent exactly.
- All `hype-*` tokens in one place in the `src/index.css` `@theme` block (from the Pencil `get_variables` output); no hardcoded colors in components.
- 3 screens + all states: Explore (hero live counter, chip filter, grid, skeleton, empty category, error+retry, CTA banner, footer), Detail (giant 4-unit counter, `--` loading, finished/gradient "Time's up!", copy+toast, justCreated pulse), Create (inline validation, emoji palette, category chips, server error mapping, 429 Retry-After message), 404.
- The `serverNow - Date.now()` offset lives in `src/lib/time.js`; re-synced on every API response; the "finished" decision and remaining time are always offset-based; negatives are never shown.
- Verification: ran the backend and went end to end with Playwright (headless chromium, installed into the scratchpad): counter ticks per second, filter, empty category, copy → clipboard content correct, finished state, 404, inline/past-date validation, create→redirect→reload. Console error-free (single exception: the browser resource log of the deliberate 404 fetch). Mobile 390px screenshots also checked.

## What I found / fixed
- The `export_nodes` MCP tool errored on this file ("wrong .pen file") → proceeded with `get_screenshot` + `batch_get`; no data loss.
- On mobile the hero counter overflowed with 4 units + separators → separators hidden `<md`, gap tightened; the `N AKTİF TIMER` (= "N ACTIVE TIMERS", Turkish-era copy) label wrapped → `whitespace-nowrap`.
- oxlint fast-refresh warning: constants moved from the component file to `src/lib/streaks.js`.
- The Vite template's boilerplate (App.css, assets, icons.svg) cleaned up.

## Notes (for subsequent tasks)
- The empty-category state couldn't be produced with real data (all seed categories are populated); verified with a Playwright route mock.
- In dev, StrictMode doubles fetches; on a nonexistent slug, 2 "Failed to load resource (404)" resource logs in the console are normal, not an application error.
