# UI Designer Retro — 2026-07-20 (HM-2: Hype Messages components)

> Note: this is a separate retro from the same-day SC-2 retro already on file
> (`ui-designer-2026-07-20.md`); kept as its own file rather than overwriting it.

## Task
Design two new reusable components for `Hype Components` (`sIewX`): `Hype/MessageInput`
(text input, 80-char counter, moderation error state) and `Hype/MessageList` (anonymous
message feed, newest-first, empty state). Plus a state gallery and a placement reference
extending the existing ReactionBar reference frame. Design-only, no code touched.

## What was designed
- `Hype/MessageInput` (id `fWv8X`): surface card (padding `$space-md`, radius `$hype-radius-md`,
  `$hype-surface` fill, `$hype-border` stroke) containing an `InputRow` (input field +
  gradient purple→pink send-icon submit button) and a `MetaRow` (left: `StatusWrap` —
  hidden-by-default alert icon + status text; right: mono `CharCounter` "0 / 80").
  - Default state: muted placeholder text, `hype-text-3` counter.
  - Approaching-limit state (demoed at 72/80): counter recolored to `$hype-pink` (reserved
    `$hype-danger` strictly for real errors, so the two severities read distinctly).
  - Moderation-error state: `StatusIcon` enabled, `StatusText` shows new copy **"That message
    isn't allowed. Try something else."**, input border switches to `$hype-danger`. This exact
    string does not exist in `docs/copy.md` yet — it's new copy written to match the deck's
    short/plain tone (c.f. "Something went wrong. Please try again."). **Flagging for PM/copy.md
    ratification before frontend implementation**, per the task's explicit instruction not to
    silently invent shipped copy. Demoed against a `message_contains_link`-shaped input
    ("visit spam-deals.link now!!!") since that's the most illustrative moderation trigger from
    `docs/api.md`'s HM-3 section; the same generic message slot is intended to be reused/adapted
    per error `code` by the frontend team (each of `invalid_message`, `message_too_long`,
    `message_repeated_chars`, `message_contains_link`, `message_blocked_content` will need its
    own PM-ratified string — this design demonstrates the visual treatment, not all 5 copies).
- `Hype/MessageList` (id `DDSQB`): header row ("N MESSAGES" mono uppercase, consistent with
  Explore's "{n} ACTIVE TIMERS" convention) + `ListRows` (vertical stack of message rows, each
  `$hype-surface-2` card with a muted "💬" glyph + message text) + a built-in `EmptyState` child
  (disabled by default, toggled on via instance override) so empty/non-empty is a single
  component with an override, not two disconnected designs. Empty copy ("No messages yet." /
  "Be the first to hype this up. 🔥") mirrors the tone/structure of the existing
  `Hype — Explore (Empty Category)` frame (`CVv0i`).
- 4 sample messages, clearly labeled as placeholder in the gallery's banner text
  ("SAMPLE COPY FOR DESIGN PURPOSES ONLY — NOT REAL USER DATA") so nobody mistakes them for
  real user submissions (feature is anonymous/no-author by design, per PRD §9.3).
- `Hype — Message Components (Gallery)` (id `fRAix`, replacing an initially-blank build at
  `uIzwq`): three sections — MessageInput states (default / near-limit / error), MessageList
  states (with messages / empty), and a 375px-wide mobile-compact section built with real
  instances (not just a note) proving both components reflow via `fill_container` alone.
- Extended the existing `Hype — Timer Detail (ReactionBar Placement Reference)` frame
  (originally `L6RGt`, now `aT1rA` after the stale-layout copy/rebuild fix) with a
  `MessageInput` + `MessageList` instance below the reaction bar and a second annotation line,
  per the task's guidance to extend that reference rather than clone `Hype — Timer Detail`
  (`vrAWQ`) again. `vrAWQ` itself was never opened for editing.

## Review found / fixed during the session
1. `Insert(sIewX, ...)` initially failed because I referenced the bare identifier `sIewX`
   instead of the string literal `"sIewX"` in `batch_design` — fixed immediately (basic JS
   scoping mistake, not a design issue).
2. The freshly-built gallery frame (`uIzwq`) rendered fully blank on first `get_screenshot`,
   and `snapshot_layout` reported spurious "partially clipped" on rows whose measured width
   exactly matched their parent — matching the known "blank/stale first render" pattern from
   the 2026-07-20 lesson log. Applied the documented fix: copied the whole frame to a new
   position, verified the copy rendered correctly (screenshots of every state instance and the
   mobile frame all looked right), deleted the stale original, and repositioned the copy back
   to the original slot (`fRAix` now at `x:6320, y:2463`, `uIzwq`'s old coordinates).
3. Extending the existing `L6RGt` reference frame with new children hit the *other* documented
   stale-layout variant (new nodes inserted into an *already laid-out* frame render blank/
   invisible even though the data is structurally correct) — confirmed via screenshot (reaction
   bar and annotation visible, but no sign of the new MessageInput/MessageList cards at all).
   Applied the same copy → verify → delete-original → reposition recipe; the copy (`aT1rA`)
   rendered every element correctly on the first screenshot. Final `snapshot_layout
   (problemsOnly)` on both new frames shows no real content-clipping issues — the only flagged
   items are the frame's own pre-existing decorative blurred glow streaks that intentionally
   rotate past the frame edge and get clipped by `clip:true`, unrelated to this task's changes.
4. A cosmetic engine warning ("`fill_container` sizing but not inside a flexbox layout")
   repeatedly appeared for the `EmptyState`/`ListRows` nodes whenever they were `enabled:false`
   in a given instance. Root cause: disabled nodes are excluded from their parent's flex layout
   pass, so the engine falls back to reporting the sizing-without-layout warning even though the
   parent frame does have `layout:"vertical"` — this is a benign side effect of intentionally
   hidden state-toggle children, not a real defect (confirmed both toggle states render
   correctly in the screenshots of `wxZgq`/`JtAuL`, `Pd1uZ`, and the "with messages" instance).

## Net result
- New reusable components: `Hype/MessageInput` (`fWv8X`), `Hype/MessageList` (`DDSQB`), both
  living in `Hype Components` (`sIewX`), verified via ref instances, not via master screenshots.
- New gallery frame: `Hype — Message Components (Gallery)` (`fRAix`).
- Placement reference frame id changed from `L6RGt` to `aT1rA` (same content + purpose, now
  also showing MessageInput/MessageList) due to the stale-layout copy/rebuild fix — noting this
  explicitly since the id is not what it originally was in the task's context summary.
- `Hype — Timer Detail` (`vrAWQ`) and all other existing screens/components untouched.

## Lessons
No new lesson added — both stale-layout symptoms encountered here (blank fresh top-level frame,
and blank content newly inserted into an already-laid-out existing frame) are already covered
by the 2026-07-09 and 2026-07-20 entries in this agent's Lessons Learned section, and the
documented copy/verify/delete/reposition fix worked cleanly both times without needing any
new workaround.
