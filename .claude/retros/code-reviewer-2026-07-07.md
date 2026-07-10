# Retro — code-reviewer — 2026-07-07

## Task
Full review of the Focus Garden backend (`backend/`): contract compliance (`docs/api.md`), business rules, edge cases, test verification.

## What I did
- Verified the 5 endpoints line by line against the contract; all compliant (status codes, `{error, message}` format, 409/422, `{completed_now}`, plant pools, ended_at semantics).
- Ran the tests (16/16 → 17/17 after fixes). Additionally ran them under TZ=Pacific/Kiritimati and TZ=America/Anchorage — the day-boundary logic is correct independent of TZ.
- Live probes: 2 s grace window (1.5s early → 200, 2.5s early → 422), SQLi attempts (parameterized queries, table intact), weird ids, body-less PATCH, burst of 10 concurrent POSTs (exactly 1×201, the single-active invariant holds).

## What I found / fixed
1. **Fixed (medium):** `start()` still counted an expired "active" session as active and returned 409 — the PRD says "a session that expires while the app is closed counts as completed". Now it is auto-completed before POST (same rule as GET /active). Regression test added.
2. **Fixed (low, test):** the "streak across a real day boundary" test used a real `new Date()` → it would flake in the 25-minute window before local midnight. Converted to fixed local dates.
3. Reported (not fixed): `abandon` on an expired session still produces 🥀 (debatable, a contract decision); no partial unique index for single-active in the DB (defense-in-depth suggestion); `/api/health` is not in the contract.

## Team observation
No 2+ recurring mistake pattern in backend-developer (retros cover single tasks). The "applying a server rule to only one endpoint" mistake was seen for the first time — if it recurs, a rule will be added to the agent definition.

## My own mistakes
Practically none; findings were verified by reproduction; no false positives were eliminated because none came up.
