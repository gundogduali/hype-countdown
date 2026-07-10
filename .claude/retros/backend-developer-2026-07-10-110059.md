# Retro — backend-developer — 2026-07-10 (DP-1: Render deploy prep)

## What I did
- `backend/src/app.js`: new `staticDir` option in `createApp`. When set:
  `/assets` served with `Cache-Control: public, max-age=31536000, immutable`
  (Vite content-hashed filenames), other build-root files and `index.html`
  with `no-cache`, and a GET-only SPA fallback (`app.get('*')`) that skips
  `/api` paths. Unset → block is inert, dev behavior byte-identical.
- `backend/src/server.js`: reads `STATIC_DIR` env (resolved against cwd),
  passes it to `createApp`, logs it on boot.
- `render.yaml` at repo root: single free web service (frankfurt), build =
  frontend `npm ci && npm run build` + backend `npm ci --omit=dev`, start =
  `node backend/src/server.js` from repo root, `healthCheckPath: /api/timers`,
  env: `NODE_VERSION=24`, `NODE_ENV=production`, `STATIC_DIR=frontend/dist`,
  `TRUST_PROXY=true`. `DB_PATH` left default; `openDb` mkdirs the data dir,
  so a clean checkout boots fine.
- `backend/test/static.test.js`: 8 new tests (suite 31 → 39, all green).

## What I verified
- Real prod-mode boot on :3199 with throwaway `DB_PATH` in the scratchpad:
  `/`, `/t/gta-6`, `/create` → index.html 200 no-cache; hashed asset →
  immutable 1y; `/api/timers` → JSON list; `/api/timers/nope` → 404
  `timer_not_found`; `/api/nope` → 404 `not_found`; XFF rate-limit keying
  (spoofed IP exhausted → 429 while another XFF IP still got 201).
- render.yaml parsed with a real YAML parser; paths cross-checked against
  build/start commands. Killed my server by PID; :3199/:3001/:5173 all free.

## What I found and fixed
- My first version of the static test asserted `not_found` for
  `GET /api/timers/nope`, but the contract (docs/api.md line 96) says
  `timer_not_found`. Wrote the assertion from memory instead of checking the
  contract first — exactly the Rule 7 failure mode. Fixed the test, not the
  behavior; contract untouched.

## Second-pass review (SubagentStop)
- Re-checked edge cases: encoded paths (`/%61pi/…`) fall to the SPA fallback
  (Express `req.path` is un-decoded) — harmless; `express.static` with an
  absolute root is traversal-safe; HEAD is handled by `app.get`. No new
  defects found; nothing needed fixing in the second pass.

## For the orchestrator
- API contract unchanged. Suite 39/39. `frontend/dist` rebuilt (gitignored).
- Nothing committed: new `render.yaml` at repo root, edits to
  `backend/src/app.js` + `backend/src/server.js`, new
  `backend/test/static.test.js`.

## Lesson added
- Yes (contract-first test assertions), see agent definition.
