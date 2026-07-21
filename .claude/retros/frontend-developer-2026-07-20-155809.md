# Retro — RX-4 self-correction pass (2026-07-20)

This is a second, deeper self-correction pass on the RX-4 Reaction Bar UI task (first pass
already recorded in `frontend-developer-2026-07-20-rx4.md`, which covered the initial design
research, implementation, and manual/scripted verification).

## What I did in this pass
- Re-read `ReactionBar.jsx` line by line against the task's acceptance criteria (optimistic
  update, server reconciliation, localStorage guard, revert-on-failure) specifically looking
  for concurrency/race issues, since the first pass's testing only exercised one emoji tap at
  a time.
- Re-ran `npm run lint` and `npm run build` (still clean) before touching anything, to have a
  known-good baseline.
- Confirmed no concurrent agent work had touched any of my three files
  (`frontend/src/api/client.js`, `frontend/src/pages/TimerDetail.jsx`,
  `frontend/src/components/ReactionBar.jsx`) since the first pass — diff was still exactly
  scoped to those three.

## What I found
- **Real bug**: `handleTap`'s success/failure branches did a **whole-object overwrite** of
  `counts`/`reacted` from closures (`previousCounts`, `previousReacted`, and
  `setCounts(normalizeReactions(data.reactions))` on success). If a user taps two *different*
  emoji before the first request resolves, whichever request settles second would stomp the
  other emoji's in-flight optimistic bump or server-confirmed count with a stale full-object
  snapshot — a genuine race, not just a test artifact this time. It wouldn't cause data loss
  (the server remains authoritative and a reload self-heals), but it's a real UI-correctness bug
  under a normal, expected usage pattern (PRD/design explicitly says other 4 emoji "remain
  tappable" while one is settling).

## What I fixed
- Rewrote `handleTap` in `frontend/src/components/ReactionBar.jsx` to use **per-emoji functional
  state updates** everywhere instead of object-snapshot overwrites:
  - Success: `setCounts((c) => ({ ...c, [emoji]: serverCount }))` — reconciles only the tapped
    emoji's count with the server's response, leaving any other emoji's state untouched.
  - Failure: `setCounts((c) => ({ ...c, [emoji]: Math.max(0, (c[emoji] ?? 1) - 1) }))` and a
    matching per-emoji `Set` delete for `reacted` — reverts only the failed emoji.
  - Moved the `localStorage` write out of `handleTap` entirely into a
    `useEffect(() => writeReacted(slug, reacted), [slug, reacted])`, so it can't run inside a
    state-updater callback (which React may invoke more than once, e.g. under Strict Mode) and
    stays correct regardless of how `reacted` changes.
- Verified the fix with a new scripted browser test simulating exactly the race: tap 🔥 (slow,
  succeeds after 500ms) then tap 🎉 (fast, fails after 100ms) while 🔥 is still in flight.
  Confirmed: 🎉's failure reverts only 🎉 to 0; 🔥's optimistic 1 is untouched by 🎉's revert;
  once 🔥's success resolves, 🔥 is confirmed at 1 and 🎉 is *not* resurrected by 🔥's response
  (the old code's `setCounts(normalizeReactions(data.reactions))` would have overwritten 🎉 back
  using 🔥's response, which doesn't yet reflect 🎉's already-reverted state — that combination
  is exactly what the whole-object overwrite would have gotten wrong).
- Re-ran the original regression checks (happy path tap, reload persistence) after the change —
  still pass, confirming the fix didn't regress the primary flow.
- `npm run lint` and `npm run build` clean after the change.
- Cleaned up the fresh test timers created in the shared dev DB during this verification pass
  and stopped the dev servers I started.

## What the orchestrator needs to know
- The RX-4 deliverable now handles concurrent multi-emoji taps correctly, not just the
  single-tap path verified in the first pass. No scope changes — same three files touched
  (`frontend/src/api/client.js`, `frontend/src/pages/TimerDetail.jsx`,
  `frontend/src/components/ReactionBar.jsx`).
- No other findings from this pass; the rest of the first retro's verification (mobile 375px,
  network-failure toast, localStorage-driven active state, design-token fidelity) still holds
  since that code path was untouched by this fix.

## Lesson learned
- Recorded in `frontend-developer.md`: when an optimistic-update component can have multiple
  independent "slots" (here: 5 emoji, each with its own in-flight request), review
  success/failure handlers specifically for whole-object snapshot overwrites — always reconcile
  and revert per-slot via functional state updates, not by restoring/replacing the entire object
  captured in a closure at request-start time. A single-tap-at-a-time manual test will not catch
  this; it requires a scripted concurrent-tap test with staggered response timing.
