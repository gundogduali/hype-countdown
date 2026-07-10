# UI Designer Retro — 2026-07-09 (DS-2: English localization of ugc_design.pen)

## What I did
- Translated every user-facing string in all 8 Hype screens + 6 Hype components to English, matching `docs/copy.md` exactly (nav, chips, unit labels DAYS/HOURS/MINUTES/SECONDS, card tags GAMES/MOVIES & TV/…, validation errors, 404, ended state "🎉 It's time!" / "THE WAIT IS OVER").
- Replaced Turkish mock content with PRD Appendix A seed titles (GTA 6 Release, FIFA World Cup 2026 Final, iPhone 18 Event (expected), …) and English date formats.
- Translated the 4 design-intent notes (animation, create flow, states & data, responsive) to English.
- Renamed all frames/nodes to English (Hype — Explore, Hype — Timer Detail, FormCard (Error), NavExplore, …).
- Added the copy-deck-required "Show all" action to the empty-category state.
- Old Focus Garden / UGC frames (`yyucp`, `a2YObd`, `Cnjgh`, `RumCJ`, "Timer — …"): already deleted before this task — nothing to remove; verified only Hype frames remain at document root.

## What I found in review
- No Turkish text left (verified via full text/note node sweep + per-screen screenshots).
- No new clipping; only pre-existing intentional decorative glow streaks report "partially clipped".
- Engine issue: nodes newly Inserted/Replaced into the existing "Empty Category" frame kept stale layout (children rendered at wrong positions or invisible; snapshot_layout showed deleted siblings still occupying space). Update-only edits were fine everywhere else.

## What I fixed
- The stale-layout subtree: forced-relayout tricks (property toggles) did NOT help. Fix that worked: Copy the entire top-level frame (fresh IDs → clean full-tree layout), verify the copy renders correctly, delete the original, move the copy into the original position. Empty Category screen id changed: `Tdh23` → `CVv0i`.

## Lesson
- Added to agent file: prefer Update over Insert/Replace inside existing laid-out frames; if inserted nodes render with corrupt layout, copy the whole top-level frame and swap it in.
