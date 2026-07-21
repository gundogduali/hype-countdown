# Retro — HM-5 Hype Messages frontend (retry), 2026-07-20

## Context
This was a retry of HM-5 (PRD §9.3). A previous attempt stalled on a 600s watchdog
because an earlier `vite`/`npm run dev` process was left running in the foreground
of a tool call. That attempt left a plausible-looking draft (`MessageInput.jsx`,
`MessageList.jsx`, `e2e/messages.mjs`, `client.js`/`TimerDetail.jsx` wiring,
`package.json`) that had never been through a real closing-protocol self-review.

## What I did
1. First action: `ps aux | grep -E "vite|node.*dev"` — confirmed no stray processes
   from the earlier stall (the orchestrator or hook had presumably already cleaned
   it up). Nothing to kill.
2. Read `docs/api.md` (Hype Messages / HM-3 / HM-4 sections), `docs/PRD.md` §9.3,
   and `docs/copy.md`'s "Timer Detail — Hype Reactions & Messages (v2.2)" section
   for the ratified copy and full error-code mapping table.
3. Read the existing draft files in full and cross-checked every ratified string,
   the API client, and the page wiring.
4. Checked the Pencil design (`Hype/MessageInput` `fWv8X`, `Hype/MessageList`
   `DDSQB`, gallery `fRAix`, mobile compact section) via `get_screenshot`/`batch_get`
   for corner radii, colors, spacing, and the send-button gradient direction, and
   cross-referenced against the already-shipped `Hype/ButtonPrimary` (`hzm9X`),
   which uses the same `rotation: 90` value in the design.
5. Started the real backend (`node src/server.js`, scratch `DB_PATH`, alternate
   `PORT=3101`) and the real Vite dev server (`API_PROXY_TARGET` pointed at it,
   `--port 5183 --strictPort`) **in the background** (`nohup ... &`, `disown`,
   output to a log file) — never in the foreground — and verified both were up
   via `lsof`/log output before running anything against them.
6. Ran `frontend/e2e/messages.mjs` against the real backend+frontend. Iterated on
   two real bugs it surfaced (see below), then reran to a clean pass.
7. Additionally, beyond what the e2e script covers, manually scripted with
   playwright-core: (a) exhausting the real 20/hour message rate limit and reading
   the literal rendered `429` copy in the UI ("Too many messages. Try again in
   about 60 minutes." — exact ratified match), (b) a delayed `route.abort()` to
   verify the network-failure copy ("Could not reach the server. Check your
   connection and try again." — exact match, avoiding the same-microtask flake
   from a past lesson), (c) reacting via `ReactionBar` and posting a message on
   the same page load to confirm no regression/console errors between the two
   already-shipped/in-progress features.
8. Ran `npm run build` and `npm run lint` (both clean) as the final one-shot
   compile/console check — never left `vite`/dev server running in the foreground.
9. Killed both background processes and confirmed with `lsof` that ports 3101 and
   5183 were free, and that no `vite`/`node .../server.js` processes remained.

## Bugs found and fixed
1. **Send-button gradient direction wrong.** The draft's `MessageInput.jsx` used
   `bg-gradient-to-b` for the send button's purple→pink gradient. The Pencil design
   node (`fWv8X`'s `SubmitBtn`) has `rotation: 90` for that gradient — the exact
   same value used by the already-shipped `Hype/ButtonPrimary` (`hzm9X`), which is
   implemented in code as `bg-gradient-to-r`. Confirmed visually via
   `get_screenshot` on `fWv8X` (purple on the left, pink on the right). Fixed to
   `bg-gradient-to-r` to match the established rotation→Tailwind-direction mapping
   for this design.
2. **`invalid_message` error path was structurally unreachable.** The draft's
   `canSubmit` was `value.trim().length > 0 && !submitting`, so the submit button
   was `disabled` for an empty/whitespace-only value — meaning a real user (or a
   Playwright test) could never click Send with an empty message to see the
   ratified "Type something first." copy; the button was simply inert. This also
   diverged from the codebase's own established convention: `Create.jsx`'s submit
   button is only `disabled={submitting}` — it always lets the user attempt submit,
   and its `handleSubmit` does its own client-side validation and sets an inline
   error (e.g. "Title is required.")). Fixed `MessageInput.jsx`'s `canSubmit` to
   `!submitting` only, matching `Create.jsx`'s pattern; the existing
   `if (!trimmed) { setError('Type something first.'); return }` guard inside
   `handleSubmit` now actually fires. This was the bug that made the first run of
   `e2e/messages.mjs` hang for 30s on a disabled-button click before failing.
3. **`package.json`'s `test` script didn't include the new e2e file.** Added
   `&& node e2e/messages.mjs` alongside the existing `smoke.mjs`/`reactions.mjs`
   chain so `npm test` covers the new feature too.

## What I verified as already correct (not bugs)
- All 5 moderation error copy strings, the `{n} MESSAGES` header, the empty state
  copy, the placeholder, and the char counter format matched `docs/copy.md`
  word-for-word (the draft correctly used the *ratified* copy, not the Pencil
  design's stale placeholder text "Add a hype message... 🔥" — `docs/copy.md` is
  the more recent source of truth here per the task's own framing).
- The `rate_limited` mapping (client-side computed from `Retry-After`, singular/
  plural minute handling, "in a bit" fallback) already matched `Create.jsx`'s
  established convention for this exact pattern — this is intentionally different
  from `ReactionBar.jsx`'s simpler `err.message` passthrough for its own
  (idempotent, toast-based) rate-limit case; the two components have different,
  independently-established conventions in this codebase, and `MessageInput`
  correctly follows the form-with-inline-errors one (same as `Create.jsx`), not
  `ReactionBar`'s toast one.
- The "generic"/unmapped-code fallback (`err.message || 'Something went wrong...'`)
  is intentionally identical to `Create.jsx`'s default case — not a copy-fidelity
  bug.
- No regression to `ReactionBar.jsx`/reactions: tested both features together on
  one page load (react with 🔥, then post a message) with zero console errors.

## Lesson learned
Added to `.claude/agents/frontend-developer.md`: when a form/composer's submit
button is disabled based on *client-side validity* (e.g. "is the trimmed value
non-empty") rather than only "is a submission currently in flight", the resulting
UI can make an entire validation-error code path (the one for "you submitted
nothing") structurally unreachable by any real click — always check the submit
button's `disabled` condition against the codebase's own established convention
for the same situation (e.g. another form's submit handler) before assuming a
laid-out inline-error branch is actually reachable.
