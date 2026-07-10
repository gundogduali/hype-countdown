# Retro — backend-developer — 2026-07-10 (DP-1 follow-up: Render build failure)

Full DP-1 retro: `backend-developer-2026-07-10-110059.md` (includes this
follow-up's detail). This file covers the follow-up task specifically.

## What I did
- Reproduced the Render deploy #1 failure locally (scratchpad copy of
  `frontend/`): `NODE_ENV=production npm ci` skips devDependencies, so
  `@vitejs/plugin-react` is missing and `vite build` dies with
  ERR_MODULE_NOT_FOUND. Subtlety: `vite` itself IS installed (peer dep of
  `@tailwindcss/vite`, a regular dependency), which is why the build starts
  before exploding — matches the Render log exactly.
- Fixed `render.yaml` buildCommand: `npm ci` → `npm ci --include=dev` for
  the frontend install (one-line change + comment). Verified the exact new
  buildCommand from repo root with NODE_ENV=production exported: clean
  build, byte-identical bundle hashes (NODE_ENV doesn't affect `vite build`
  output — Vite forces its own mode).
- Audited all other envVars for build-vs-runtime interactions: backend
  `npm ci --omit=dev` unaffected (no devDeps); STATIC_DIR/TRUST_PROXY/
  DB_PATH are runtime-only reads; NODE_VERSION intended at both phases.
  No other risks found.
- Re-verified prod-shape boot on :3199 (throwaway DB): `/` → 200 html,
  `/api/timers` → 200 JSON. Killed by PID; :3199/:3001/:5173 free; suite
  39/39.

## What I found in review / fixed
- Second pass found no new defects. Confirmed local tree healthy after the
  simulation: frontend node_modules reinstalled WITH devDeps, backend
  without (identical — zero devDeps), dist rebuilt with same hashes,
  render.yaml re-validated post-edit.

## For the orchestrator
- Only file changed in this follow-up: `render.yaml` (one line + comment).
  Ready to commit and re-deploy; nothing committed by me.
- Lesson recorded in my agent definition: deploy-config env vars apply at
  BUILD time too — simulate the platform's build with the same env before
  shipping.
