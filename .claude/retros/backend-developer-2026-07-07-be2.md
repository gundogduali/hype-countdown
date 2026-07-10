# Retro — backend-developer — 2026-07-07 (BE-2 polish)

## What I did
1. **target_at cap**: at most +100 years from the server clock (`MAX_FUTURE_MS`, `src/services/timers.js`); exceeding it → 400 `invalid_target_at` (message: `Hedef tarih en fazla 100 yıl ileride olabilir.` — "The target date can be at most 100 years in the future.", Turkish-era UI copy). Contract + test updated.
2. **invalid_body**: array/non-object JSON bodies now return the `invalid_body` code (consistent with the message). Added to the contract + test.
3. **trust proxy**: `app.set('trust proxy', ...)` via the `TRUST_PROXY` env (number → hop count, other values passed to Express as-is); off by default. Deployment note in the "Other" section of `docs/api.md`. Test: XFF is used as the rate-limit IP only when TRUST_PROXY is set, ignored when off.

## What I found in review, what I fixed
- The invalid_body test I first wrote expected `null`/string/number bodies to also return `invalid_body` — wrong: `express.json` in strict mode rejects primitives at the parser level (`invalid_json`); only arrays reach the handler. The test was fixed accordingly and both codes are asserted.
- In line with the reviewer's BE-1 fix (repeated `?category` → 400), a "(including being given more than once)" note was added to the GET error table.

## Verification
- 26/26 tests passing. Live verification was done with a temporary `DB_PATH` (dev DB not polluted): valid POST still 201 (backwards compatible), +100 years → 400, `[1,2]` → `invalid_body`, with TRUST_PROXY=1 a separate rate-limit bucket per XFF (20×201 + 429; different XFF 201).

## What the orchestrator needs to know
- The contract changes are additive; existing valid requests are unaffected.
- If the prod deploy is behind nginx, `TRUST_PROXY=1` must be set, otherwise the rate limit counts all traffic as a single IP.
