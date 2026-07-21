# UI Designer Retro — 2026-07-20 (SC-2: Social Share Card OG image)

> Note: this replaces an earlier same-day retro for this task that recorded a hard blocker
> (wrong Pencil document active — `pencil-shadcn.pen` instead of `ugc_design.pen`). That was
> fixed before this session started; `get_editor_state` was re-verified as the very first step
> and correctly showed Hype content (`Hype — Explore`, `Hype — Timer Detail`, etc.) before any
> design work began.

## Task
SC-2 (PRD §9.1 Social Share Card): design the static OG-image preview (1200x630) shown when a
Hype timer link is pasted into WhatsApp/Twitter/Discord/iMessage.

## What I designed
Confirmed `get_editor_state` showed real Hype content first, then pulled the actual dark-premium
tokens from `get_variables` and read `Hype — Timer Detail` / `Hype — Timer Detail (Ended)` /
`Hype/CountUnit` via `batch_get` before touching anything, so no values were invented.

Three new top-level frames, alongside (not replacing) the existing screens:

1. **`Hype — Share Card (OG Image)`** (id `O7ui60`, 1200x630) — normal state, "GTA 6 Release"
   sample. Structure: dark radial-gradient background + 3 blurred accent streaks (same pattern as
   Timer Detail) → emoji (104px) → category pill (`$hype-purple-soft`/`$hype-purple`, mono,
   uppercase) → title (`$hype-font-display`, 700, 56px, centered) → big countdown row built from
   4 `Hype/CountUnit` (`jm22K`) instances at 72px value / 13px label with `:` separators, i.e. the
   literal component used everywhere else in the product → bottom-right "⏳ Hype" watermark pill
   (`$hype-surface-2` chip, `$hype-border-strong` stroke).
2. **`Hype — Share Card (OG Image) — Long Title`** (id `q3NHEV`) — same structure, title
   "FIFA Women's World Cup 2027 Opening" to stress-test wrapping (`textGrowth:"fixed-width"`,
   width 980, wraps to 2 lines, no overflow).
3. **`Hype — Share Card (OG Image) — Ended`** (id `UMult`) — reuses the *exact* copy from
   `Hype — Timer Detail (Ended)`: party emoji + gradient "It's time!" (purple→pink→cyan linear
   gradient text) + "THE WAIT IS OVER" mono caption, pulled verbatim rather than guessed.

All three use only existing `$hype-*` variables (no new tokens defined).

## What I found in review
- First `get_screenshot` calls on the freshly-built frames (and even on individual text/leaf
  nodes inside them) returned **visually blank** results — dark gradient background only, no
  text/emoji/countdown content — even though `batch_get` showed the node tree was structurally
  correct. This is the exact "stale layout for newly Inserted nodes" failure mode from my
  2026-07-09 lesson, this time affecting a **brand-new top-level frame** built via many nested
  `Insert` calls in one `batch_design`, not just nodes inserted into a pre-existing laid-out
  frame — so the bug class is broader than I'd previously scoped it.
- Fix applied (same recipe as the existing lesson): `Copy` each broken frame to a fresh sibling
  with new IDs, verify via screenshot, delete the stale original, then reposition the copy to the
  intended slot. All three copies rendered correctly on the first try after the copy.
- Verified the 🎆/🎉 "monochrome outline in a white box" emoji rendering in the Ended variant is
  not a bug I introduced — the existing, already-approved `Hype — Timer Detail (Ended)` frame
  renders the identical two emoji the exact same way, confirming it's a pre-existing renderer
  quirk, not a regression.
- `snapshot_layout(problemsOnly:true)` on all three frames only flagged the intentionally
  off-canvas decorative streak rectangles (by design, matches the identical pattern already
  present and accepted in `Hype — Timer Detail`) — no real content-overflow problems.

## Fixes made
- Applied the copy → verify → delete-original → reposition recipe to all three new frames before
  finishing (ids changed from the first-pass `Lq0xy`/`ctO9v`/`BjLbu` to the final
  `O7ui60`/`q3NHEV`/`UMult` — noting this explicitly since the orchestrator/other agents should
  reference the final ids, not the ones from my first `batch_design` call's returned mapping).
- No content/token changes were needed — the underlying design was correct; only the render/layout
  glitch needed the recovery procedure.

## Lesson learned (added to agent definition)
Newly created **top-level** frames (not just nodes added into existing frames) can also hit the
stale-layout/blank-render bug when built via a large multi-Insert `batch_design` in one shot;
verifying with `get_screenshot` immediately after building is not optional, and the copy/verify/
delete-original/reposition recipe is the fix regardless of whether the frame is brand-new or
pre-existing.
