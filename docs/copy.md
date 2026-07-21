# Hype — UI Copy Deck (English, v2.2)

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

## Timer Detail — Hype Reactions & Messages (v2.2)
- Reaction bar: no error copy needed — `POST /timers/:slug/react` is idempotent and always succeeds (`docs/api.md`); a `429 rate_limited` on this route reuses the same message pattern as the Create form's `rate_limited` row below, adapted: `Too many reactions. Try again in about {n} minutes.`
- Message input placeholder: `Share the hype… 🔥` · char counter: `{n} / 80` (recolor to `$hype-pink` at 70+/80 — a soft warning, not an error; reserve `$hype-danger` strictly for a real rejection)
- Submit: send-icon button (no text label; icon-only per the approved HM-2 design)
- Message list header: `{n} MESSAGES` (mirrors Explore's `{n} ACTIVE TIMERS`) · empty state: `No messages yet.` · sub `Be the first to hype this up. 🔥`
- Server-error mappings (message submission — codes per `docs/api.md` HM-3):
  | Code | Message |
  |---|---|
  | `invalid_message` | `Type something first.` |
  | `message_too_long` | `Keep it under 80 characters.` |
  | `message_repeated_chars` | `Looks like spam — try rewriting that.` |
  | `message_contains_link` | `Links aren't allowed here.` |
  | `message_blocked_content` | `That message isn't allowed. Try something else.` |
  | `rate_limited` | `Too many messages. Try again in about {n} minutes.` (singular `minute` when n=1; without `Retry-After`: `Too many messages. Try again in a bit.`) |
  | network | `Could not reach the server. Check your connection and try again.` |
  | generic | `Something went wrong. Please try again.` |

> Ratified 2026-07-20 in response to the HM-2 design flag (the designer correctly did not silently ship the `message_blocked_content` string without PM sign-off — that string is confirmed as-is; the other 4 codes are new copy written to match the deck's existing short/plain tone, parallel to the Create form's table above).

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
> 2026-07-20: v2.2 — added Hype Reactions & Messages section (PM ratification of HM-2's flagged new copy, 5 server-error mappings for message submission).
