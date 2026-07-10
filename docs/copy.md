# Hype — UI Copy Deck (English, v2.1)

> Owner: orchestrator (PM). Single source of truth for user-facing strings. Design (`.pen`) and frontend must match this deck. Deviations require a PM decision.

## Global
- Brand: **Hype** · Tab title: `Hype ⏳ — Countdown to what's next`
- Nav: `Explore` · Primary CTA: `Create Timer` (mobile nav label: `+ Create`)

## Categories (label ↔ API value)
| Label | API value | Emoji |
|---|---|---|
| All | *(no filter)* | — |
| Games | `games` | 🎮 |
| Sports | `sports` | ⚽ |
| Movies & TV | `movies-tv` | 🎬 |
| Tech | `tech` | 📱 |
| Holidays | `holidays` | 🎉 |

Card category tags are UPPERCASE mono: `GAMES`, `MOVIES & TV`, `HOLIDAYS`…

## Explore
- Hero badge: `⚡ FEATURED COUNTDOWN` · hero secondary action: `Open fullscreen →`
- Grid heading: `Popular countdowns` · grid counter: `{n} ACTIVE TIMERS`
- Countdown units: `DAYS · HOURS · MINUTES · SECONDS` (cards may abbreviate: `d h m s`)
- CTA banner: title `Can't find your moment?` · sub `Create your own countdown and share it with a link.` · button `Create Timer`
- Empty category: `No timers in this category yet.` · actions `Show all` (+ secondary `Create Timer`)
- Load error: `Something went wrong.` · action `Retry`

## Timer Detail
- Copy button: `Copy link` · feedback: `✓ Copied` · toast: `✓ Link copied to clipboard`
- Ended state: heading `🎉 It's time!` · sub `THE WAIT IS OVER` · action `Create your own timer`
- Target date line: localized date+time in the visitor's locale/timezone (browser default locale — no hardcoded locale)

## Create
- Heading: `New countdown ⏳` · sub `Pick a moment, get a link, share the hype.`
- Fields: `Title` (placeholder `What are you waiting for?`) · `Date` · `Time` · `Emoji` · `Category` `(optional)`
- Date/time hint: `In your local timezone ({GMT±X})` · form footnote: `You'll get a unique link — your timer is only visible to people who have it.`
- Submit: `Start countdown ⏳` · pending: `Creating…`
- Validation (client): `Title is required.` · `Title must be 80 characters or less.` · `Pick a date and time.` · `Pick a date in the future.`
- Server-error mappings:
  | Code | Message |
  |---|---|
  | `invalid_title` | `Title must be 1–80 characters.` |
  | `target_in_past` | `Pick a date in the future.` |
  | `invalid_target_at` | `Pick a valid date and time (at most 100 years ahead).` |
  | `invalid_category` | `The selected category is invalid. Change it and try again.` |
  | `invalid_emoji` | `The selected emoji is invalid. Pick one from the palette.` |
  | `rate_limited` | `Too many timers created. Try again in about {n} minutes.` (singular `minute` when n=1; without `Retry-After`: `Too many timers created. Try again in a bit.`) |
  | network | `Could not reach the server. Check your connection and try again.` |
  | generic | `Something went wrong. Please try again.` |

## 404
- Heading: `This timer doesn't exist.` · sub `The link may be wrong, or the timer was never created.` · actions `Back to Explore` (+ secondary `Create Timer`)

> v2.1 note: deck reconciled with the implemented UI after FE-3 (hero badge vs grid counter distinction, pending state, secondary actions). Frontend is the reference implementation of this deck.
> 2026-07-10: folded in QA-2's documentation note — mobile nav label, copy toast, create date/time hint + footnote, full server-error mapping table.
