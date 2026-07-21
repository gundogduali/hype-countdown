# Retro — HM-5 Hype Messages, second self-correction pass (stop-hook), 2026-07-20

This is a second, immediately-following stop-hook invocation for the same HM-5
retry task. The first pass (documented in
`.claude/retros/frontend-developer-2026-07-20-hm5.md`) already did the full
review + fix + verification cycle. This pass re-examined that work with fresh
eyes before finishing.

## What I re-checked
- Re-read the final `MessageInput.jsx` end to end against `docs/copy.md`'s
  ratified copy table and the Pencil design (`fWv8X`) once more: placeholder,
  char-counter recolor threshold (`>= 70`), gradient direction, error mapping
  switch, `canSubmit` gating — all consistent with what was fixed/verified in
  the first pass.
- Re-confirmed no stray `vite`/`node server.js` processes and no listeners on
  ports 3101/5183 (the scratch ports used during verification) were left behind.
- Re-ran `npm run build` and `npm run lint` from a clean shell — both clean.
- Re-reviewed `git status` to confirm only the intended files carry diffs
  (`frontend/package.json`, `frontend/src/components/MessageInput.jsx`, plus
  the untouched pre-existing modifications to `client.js`/`TimerDetail.jsx`
  from the original stalled draft).

## Findings this pass
None new. The two real bugs (send-button gradient direction using the wrong
Tailwind class for the design's `rotation: 90` value; the submit button being
disabled on empty input and thereby making the `invalid_message` error path
unreachable) and the missing `messages.mjs` entry in `package.json`'s `test`
script were already found and fixed in the first pass, and every acceptance
criterion (moderation errors, empty state, header count, mobile 375px layout,
`429 rate_limited` copy, network-failure copy, no ReactionBar regression,
build/lint, `e2e/messages.mjs`) was already verified against a real running
backend + Vite dev server in that pass, with servers backgrounded and
confirmed killed afterward.

## What the orchestrator needs to know
- HM-5 is complete and verified for real (not just "it compiles"): moderation
  errors, rate-limiting, empty/loading states, mobile fidelity, and
  ReactionBar coexistence were all exercised against a live backend instance,
  not inferred from source reading.
- Two real bugs were caught in the first pass's review — see that retro for
  detail. Nothing further to fix in this pass.
- No lesson to add this time — the relevant lesson from the first pass (submit
  buttons disabled on client-side validity vs. only "in flight") was already
  recorded in `.claude/agents/frontend-developer.md`.
