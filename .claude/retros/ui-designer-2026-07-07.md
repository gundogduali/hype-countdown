# Retro — ui-designer — 2026-07-07 (Focus Garden pivot)

## What I designed
The old UGC frame inside `ugc_design.pen` was deleted; 6 screens + 4 reusable components + 1 mobile/interaction note designed for Focus Garden (desktop 1440px, calm green palette inspired by "Soft Bento / Forest Sage"; Newsreader headings, Inter body, Geist Mono numerals).

- Components: TopNav (`yyucp`), Button (`a2YObd`), PlantCell (`Cnjgh`), StatTile (`RumCJ`)
- Screens: Timer Idle (`Cf6N9`), Timer Running (`Q2SSlo`), Timer Abandon Confirmation (`J5kxz`), Timer Completed (`mRaM3`), Garden Full (`YZYnd`), Garden Empty (`P4bSI`)
- Note: Mobile adaptation + interaction rules (`o6aI1f`)

## What I found in review
1. `get_screenshot` repeatedly returned an **empty image** right after batch_design (fonts/emoji load asynchronously). I almost mistook the sound design for "broken" and redid it; `snapshot_layout` also showed half-computed (inconsistent x/y) values during this time.
2. The `note` node doesn't support `textGrowth` (in the schema, Note derives from TextStyle but Size is separate) — width/height must be given explicitly.
3. `text-muted` (#7A9A80) was at ~2.8:1 contrast on the beige background.

## What I fixed
1. Instead of redesigning on an empty screenshot, I verified the node data with `batch_get` and retried the screenshot; confirmed with a document-level screenshot.
2. Gave the note fixed width/height.
3. Darkened the `text-muted` variable to #5E7C65 (all usages fixed at once — the benefit of using tokens).

## Acceptance criteria check
- 6+ frames ✓ (Timer x3 + Abandon confirmation + Garden full/empty)
- No pause, only Abandon + confirmation dialog ✓
- Growth stages (seed→sprout→sapling→mature) as a stepper ✓
- Plant emoji pools, 🥀 wilted style (faded cell + 50% opacity) ✓
- Garden: grid + hover tooltip (date/duration/status) + stats panel (today, 🔥 streak, totals) + empty-state CTA ✓
- Consistent token set (color/typography/spacing variables) ✓
- Every frame verified with a screenshot ✓
