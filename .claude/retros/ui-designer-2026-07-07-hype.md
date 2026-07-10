# Retro — ui-designer — 2026-07-07 (Hype pivot)

## What was designed
The desktop (1440px) designs of the Hype ⏳ MVP, inside `ugc_design.pen` (the old Focus Garden pages untouched):
- New dark premium token set: `hype-*` (color/font/radius) — the old light-theme variables were kept.
- 6 new Hype components: TopNav, ButtonPrimary (gradient+glow), ButtonGhost, Chip, CountUnit, TimerCard.
- Screens: Explore (hero + chips + 3x3 grid + CTA banner + footer), Timer Detail (giant counter + share + copied toast), Detail Finished variant ("🎉 Time's up!" gradient typography), Create (form + emoji palette + category chips), Create Error variant (empty title + past date), 404, Explore Empty Category variant, 4 design notes (animation/flow/states/responsive).

## What was found in review
1. The `lucide` set has no `clock` icon → batch_design gave a warning.
2. In the Create form the category chip row (5 chips) overflowed the 512px area — the last chip was clipped; caught with `snapshot_layout problemsOnly`, hard to spot with the naked eye in a screenshot.
3. The detail-screen screenshot taken right after batch_design came back empty (the known async render case) — following the earlier lesson I retried without deleting; the second attempt rendered correctly.

## What was fixed
1. `clock` → `clock-3`.
2. Chip row gap 8→6, chip padding [8,14]→[8,11] (in both the original form and the copied error variant); problemsOnly re-run and verified.

## Lesson
- Horizontal chip/label rows inside fixed-width containers silently overflow; always run `snapshot_layout problemsOnly` after designing a form/card. (Added to the agent file.)
