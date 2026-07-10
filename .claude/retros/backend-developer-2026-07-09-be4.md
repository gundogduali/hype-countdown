# Retro — backend-developer — 2026-07-09 (BE-4: QA B-1, payload_too_large)

## What I did
- Added an `err.type === 'entity.too.large'` branch to the `src/app.js` error handler → **413** `{ error: { code: 'payload_too_large', message: 'Gövde çok büyük (limit 100KB).' } }` (Turkish-era message, = "Body too large (limit 100KB)."). Previously this produced 500 `internal` + stack-trace log noise (QA B-1).
- A `413 payload_too_large` row was added to the `docs/api.md` POST error table.
- Test added: 150KB body → 413 + code assert; 10KB body → 201 (backwards compatibility). Rule 7 applied: table row ↔ test assert exact match.

## What I found in review
- No additional bug requiring a fix. Handler ordering is correct: since `entity.too.large` comes from the parser, it maps to 413 in the generic handler without entering the ValidationError chain.
- The files had been updated by others in the meantime (the api.md invalid_json row was elaborated after QA) — re-read before editing, no conflict.

## Verification
- 27/27 tests green. Live verification with a temporary `DB_PATH`: QA's exact repro (200KB padding) → 413 + correct body; normal POST → 201; no stack trace in the backend log (log noise also eliminated).

## What the orchestrator needs to know
- Backwards compatible; only a new error row was added to the contract. QA B-1 can be closed.
