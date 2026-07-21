# UI Designer Retro — 2026-07-20 (RX-2: Hype/ReactionBar)

## Task
Design a new reusable `Hype/ReactionBar` component (5-emoji tap bar: 🔥⏳🎉😱👀, each with a live count)
for PRD §9.2 "Hype Reactions", matching `docs/api.md`'s `POST /api/timers/:slug/react` contract. Design-only,
added to the existing `Hype Components` frame (`sIewX`); one contextual placement example against Timer Detail.

## What I designed
- **`Hype/ReactionButton`** (reusable, id `m606ES`) — vertical pill: emoji (26px, `$hype-font-body`) over a
  count (`$hype-font-mono`, 13px/600). Default state: `$hype-surface` fill, `$hype-border` stroke,
  `$hype-text-2` count. Active/selected state (per-instance override, no separate component needed):
  `$hype-purple-soft` fill, `$hype-purple` stroke, outer glow shadow (`#A855F759`, blur 18), count recolored
  to `$hype-purple`.
- **`Hype/ReactionBar`** (reusable, id `MtevY`) — horizontal row of 5 `ReactionButton` refs, gap 10, one
  instance (🔥) preset to the active state to demonstrate a realistic "you already reacted with this one"
  mixed bar. Both now live as children of `sIewX` ("Hype Components"), alongside the existing
  `ButtonPrimary`/`ButtonGhost`/`Chip`/`CountUnit`/`TimerCard`/`TopNav`.
- **`Hype — ReactionBar (States & Responsive Notes)`** (new top-level doc frame, id `Y6uSPu`): a Default row
  (all 5 emoji, unreacted) and an Active row (all 5 emoji, reacted) side by side so every emoji's 2 states are
  explicit — plus a "Mobile (375px)" compact-sizing example (smaller padding/font overrides on the same
  component, still a single non-wrapping row, proven to fit) and a `note` documenting animation intent (tap =
  scale-bounce + glow-pop, settles into Active; per-emoji tap lock after reacting, other 4 stay tappable;
  server is the source of truth per `docs/api.md`) and the count-abbreviation expectation (24 / 342 / 1.2k /
  12.4k / 100k+ — not just single digits).
- **`Hype — Timer Detail (ReactionBar Placement Reference)`** (new top-level frame, id `L6RGt`): a full copy
  of the existing `Hype — Timer Detail` frame (`vrAWQ`, left untouched) with a `Hype/ReactionBar` instance
  inserted under the "Copy link" share row, plus a small annotation label marking it reference-only for RX-4.

Only existing `$hype-*` tokens were used (`hype-surface`, `hype-border`, `hype-radius-md`, `hype-text`,
`hype-text-2`, `hype-font-body`, `hype-font-mono`, `hype-purple`, `hype-purple-soft`) — no new variables
were created.

## What I found in review
Hit the known stale-layout/blank-render bug three separate times this session:
1. Inserting `ReactionButton`/`ReactionBar` directly as new children of the already-laid-out `sIewX` frame
   produced a component whose text children were pushed ~50px below their correct position and clipped out
   of the frame's own computed bounds (screenshot showed an empty dark card, no emoji/count visible).
2. A brand-new top-level "States & Notes" frame built via one multi-Insert batch rendered fully blank on the
   first screenshot (only the trailing `note` child was visible).
3. Inserting a `ReactionBar` ref + annotation text into an already-laid-out frame (a fresh copy of Timer
   Detail) also went stale/invisible.

New discovery this session: for case 1, the standard "Copy the frame, verify, delete original, reposition"
fix from the 2026-07-09/earlier-2026-07-20 lessons does **not** apply as-is to a `reusable:true` node's own
root, because `Copy` on a reusable node always yields a `ref` instance (per the schema docs), never a
duplicate definition — confirmed empirically (`Copy("m606ES", document, {...})` returned a `type:"ref"` node
pointing back at `m606ES`, not a new component). Also confirmed that even after rebuilding the components
fresh at the top level, directly screenshotting the reusable master node (`m606ES`, `MtevY`) still rendered
with content pushed out of bounds — but creating a `ref` instance of that same component and screenshotting
*that* rendered perfectly (fire emoji + "128"; full 5-button bar with correct default/active styling). So the
underlying component definitions were fine all along; only the master node's own direct-screenshot path is
unreliable in this engine session.

## What I fixed
- Rebuilt `ReactionButton`/`ReactionBar` fresh at the document root (not appended straight into the
  already-laid-out `sIewX`), verified correctness via `ref` instances (not the master node), then `Move`d both
  into `sIewX` afterward — `Move` preserved the correct internal layout (confirmed via `batch_get` +
  `snapshot_layout(problemsOnly:true)` → "No layout problems").
- For the blank "States & Notes" frame: applied the documented recipe — this frame was *not* reusable, so
  `Copy` produced a genuine duplicate; copied to a fresh sibling, verified the copy rendered correctly,
  deleted the stale original, repositioned the copy to the original slot (final id `Y6uSPu`).
- For the blank Timer Detail placement copy: same recipe — copied to a fresh sibling, verified, deleted the
  stale original, repositioned the copy (final id `L6RGt`).
- Cleaned up throwaway test nodes (`QTATJ`, `Str2v`) used only to empirically confirm the Copy/ref behavior
  described above.
- Final `snapshot_layout(problemsOnly:true)` across the whole document shows no new problems from this work;
  the only remaining "partially clipped" warnings anywhere are the pre-existing decorative rotated blur
  streaks on `UzP1e`/`vrAWQ`/`tigjP`/`nOpzp`/`TCOem`/`O7ui60`/`q3NHEV`/`UMult` (and, expectedly, their copy
  `L6RGt`) — an intentional cosmetic pattern that predates this task, not a regression.

## Lesson added
Added a `- [2026-07-20]` entry to `.claude/agents/ui-designer.md` documenting that (a) `Copy` on a
`reusable:true` node always yields a `ref`, not a duplicate definition, so the standard stale-layout fix
doesn't apply directly to a broken reusable master, and (b) verification of a new reusable component should
be done via a `ref` instance's screenshot, not the master node's own screenshot, which can be permanently
unreliable in this engine session even when the component's underlying data is correct.

## Final node ids for frontend reference (RX-4)
- `m606ES` — `Hype/ReactionButton` (reusable, child of `sIewX`)
- `MtevY` — `Hype/ReactionBar` (reusable, child of `sIewX`) — use this as the actual component
- `Y6uSPu` — `Hype — ReactionBar (States & Responsive Notes)` (top-level doc frame, states + mobile + notes)
- `L6RGt` — `Hype — Timer Detail (ReactionBar Placement Reference)` (top-level, copy of `vrAWQ`; original
  `vrAWQ` left untouched, per instructions)
