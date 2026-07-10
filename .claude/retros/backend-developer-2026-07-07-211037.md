# Retro — backend-developer — 2026-07-07 21:10 (BE-2 self-correction round)

## What I did (BE-2 summary)
- `target_at` cap at +100 years → 400 `invalid_target_at`; non-object JSON body → `invalid_body`; `trust proxy` via `TRUST_PROXY` env (off by default). All in `docs/api.md` and covered by tests.

## What I found in self-review, what I fixed
- **TRUST_PROXY=true was crashing the server**: The first implementation passed the string straight to Express; `proxy-addr` treats the string `"true"` as a subnet name and throws "unsupported trust argument" (verified with an isolated node script). Fix: `"true"`/`"false"` are converted to boolean, numeric values become a hop count, others (`loopback` etc.) pass through as-is. Regression test added (server up with `TRUST_PROXY=true` + XFF is honored).
- The `docs/api.md` deployment note was updated with the accepted values.

## Verification
- 26/26 tests passing. The TRUST_PROXY=true crash was reproduced with an isolated script and is covered in the test suite after the fix.

## What the orchestrator needs to know
- No behavior change in the contract; this round is deployment hardening only (resilience to env misconfiguration).
