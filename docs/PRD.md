# PRD — Hype ⏳ Countdowns to Popular Events

> Version: 2.1 (MVP) · Date: 2026-07-09 · Owner: orchestrator (PM)
> History: UGC site → Focus Garden (cancelled) → **Hype** (2026-07-07, user decision). v2.1 (2026-07-09): product language switched from Turkish to **English** (user decision, pre-launch) — all UI copy, API values, seed content, and docs are English.

## 1. Product Summary

**Hype** is a **premium-looking** countdown website for popular, widely anticipated events (game releases, sports finals, movie premieres, tech events, holidays). Users open a curated timer or create their own custom timer and **share it via link**.

**Value proposition:** the slickest answer to "How long until GTA 6?" + create your own countdown in 10 seconds and send the link to a friend.

## 2. Target User & Principles

- Public, **no accounts/auth** (MVP). No signup needed to create a custom timer.
- UI language: **English** (changed from Turkish in v2.1). Events are global.
- **Visual direction: dark premium.** Near-black background, glow/gradient accents, huge animated countdown typography. Frontend uses **Skiper UI** components; designs follow this aesthetic.

## 3. MVP Scope

### 3.1 Explore (home screen)
- **Hero:** 1 featured timer (e.g. the nearest major event) — large display with live countdown.
- **Popular timer grid:** curated event cards; each card shows emoji, title, time remaining (live, at least minute precision), category tag.
- **Category filter:** Games 🎮 · Sports ⚽ · Movies & TV 🎬 · Tech 📱 · Holidays 🎉 (single select, "All" default).
- Prominent **"Create your own timer"** CTA.
- Expired curated timers are excluded from the list (filtered by the backend).

### 3.2 Timer Detail (`/t/:slug`)
- Full-screen-feel **big countdown**: days / hours / minutes / seconds, seconds tick live.
- Event title, emoji, category, target date (shown in the user's local time).
- **Share:** copy link to clipboard (with "copied" feedback).
- **Ended state:** if the target moment has passed, show a celebration state ("🎉 It's time!") + event name instead of the counter. Never show negative numbers.
- Curated and custom timers use the same detail page.

### 3.3 Custom Timer Creation
- Form (page or modal — designer's call): **title** (required, 1–80 chars), **target date+time** (required, must be in the future), **emoji** (picked from a preset palette, default ⏳), **category** (optional).
- User enters the date in their local time; it is converted to UTC and stored.
- Save → unique slug generated (random, unguessable, ~8-10 chars) → user is redirected to `/t/:slug` with "copy link" emphasized.
- Custom timers **never appear in Explore**; only people with the link can access them.
- No edit/delete in MVP (v2: ownership token).

### 3.4 Content: Curated Seed List
- The backend seeds the events in Appendix A (`is_curated = 1`).
- Dates were verified by the PM against web sources on 2026-07-09 (see Appendix A notes).

### 3.5 Time Correctness
- Target moments are stored as **UTC ISO 8601**; display is in the client's local timezone.
- To guard against unreliable client clocks: API responses include `serverNow` (server UTC time); the client corrects the countdown using the `serverNow - Date.now()` offset.
- The "ended" decision uses this offset-corrected time.

## 4. Out of MVP (v2+)
Accounts/auth, timer edit/delete, user-submitted public events, view counter & trending sort, reminders/notifications, theme toggle (light), OG image/social cards, multi-language, recurring events (every New Year etc.), search.

## 5. Screens
1. **Explore** (`/`): hero + category filter + popular grid + create CTA.
2. **Timer Detail** (`/t/:slug`): big counter, share, ended state.
3. **Create** (`/create` or modal): form + validation + success redirect.
- States: loading, error (404 — unknown slug), empty category result.

## 6. API Contract (summary — details in `docs/api.md`)
- `GET /api/timers?category=` → curated, non-expired timer list + `serverNow`.
- `GET /api/timers/:slug` → single timer (curated or custom) + `serverNow`; 404 if missing.
- `POST /api/timers` → create custom timer; validation: title 1–80, `target_at` in the future (max +100 years), valid category/emoji. Response: timer + slug. Basic abuse guard: per-IP rate limit (e.g. 20/hour).
- Fields: `slug, title, emoji, category, target_at (UTC ISO), is_curated, created_at`.
- Categories (API values, v2.1): `games, sports, movies-tv, tech, holidays`.

## 7. Acceptance Criteria
- [ ] Explore lists curated timers with a working category filter; remaining times are live and correct.
- [ ] Expired curated timers don't appear in the list; their detail page shows the "It's time!" state.
- [ ] A custom timer can be created; validations work (empty title, past date rejected); it is reachable from any browser via its slug URL.
- [ ] Custom timers never appear in Explore.
- [ ] The countdown ticks per second; is correct after page refresh; counts correctly even with a skewed client clock (serverNow offset).
- [ ] Dates render in the user's local timezone (storage is UTC).
- [ ] Share → link copied to clipboard with feedback.
- [ ] Unknown slug shows a 404 page.
- [ ] Data persists in SQLite across server restarts.
- [ ] UI is faithful to the approved Pencil design, dark premium (Skiper UI components), all copy in English.

## 8. Technical Frame
- Frontend: React + Vite (`frontend/`), **Skiper UI** (+ its requirements: Tailwind, motion) components.
- Backend: Express + SQLite (`backend/`).
- API contract: `docs/api.md` — single source of truth.
- All time math in UTC; "expired" decisions use the server clock.
- Date formatting uses the browser's default locale (no hardcoded locale).

## Appendix A — Curated Seed List (v2.1, English)

| Title | Category | Emoji | Slug | Target (UTC) | Note |
|---|---|---|---|---|---|
| GTA 6 Release | games | 🎮 | gta-6 | 2026-11-19T00:00:00Z | confirmed (official) |
| FIFA World Cup 2026 Final | sports | 🏆 | world-cup-2026-final | 2026-07-19T19:00:00Z | confirmed (3PM ET, MetLife — verified 2026-07-09) |
| Spider-Man: Brand New Day | movies-tv | 🕷️ | spider-man-brand-new-day | 2026-07-31T00:00:00Z | confirmed (verified 2026-07-09) |
| Avengers: Doomsday | movies-tv | 🦸 | avengers-doomsday | 2026-12-18T00:00:00Z | confirmed (verified 2026-07-09) |
| Dune: Part Three | movies-tv | 🏜️ | dune-part-three | 2026-12-18T00:00:00Z | confirmed (verified 2026-07-09) |
| iPhone 18 Event (expected) | tech | 📱 | iphone-18-event | 2026-09-08T17:00:00Z | Apple hasn't announced; analyst expectation Sep 8-9. "(expected)" in title is mandatory. |
| Black Friday | holidays | 🛍️ | black-friday-2026 | 2026-11-27T00:00:00Z | confirmed |
| Halloween | holidays | 🎃 | halloween-2026 | 2026-10-31T00:00:00Z | confirmed |
| Christmas | holidays | 🎄 | christmas-2026 | 2026-12-25T00:00:00Z | confirmed |
| New Year 2027 | holidays | 🎆 | new-year-2027 | 2027-01-01T00:00:00Z | UTC midnight (v2.1: was TR midnight; product is global now) |
| Valentine's Day | holidays | 💘 | valentines-day-2027 | 2027-02-14T00:00:00Z | confirmed |
| Super Bowl LXI | sports | 🏈 | super-bowl-lxi | 2027-02-14T23:30:00Z | date confirmed (SoFi, verified 2026-07-09); time approximate |
| Eurovision 2027 Grand Final | holidays | 🎤 | eurovision-2027-final | 2027-05-26T19:00:00Z | confirmed (Bulgaria; verified 2026-07-09) |
| UEFA Champions League Final 2027 | sports | ⚽ | ucl-final-2027 | 2027-06-05T19:00:00Z | confirmed (Metropolitano, Madrid — verified 2026-07-09) |
| The Legend of Zelda Movie | movies-tv | 🗡️ | zelda-movie | 2027-04-30T00:00:00Z | confirmed (verified 2026-07-09) |
| FIFA Women's World Cup 2027 Opening | sports | ⚽ | womens-world-cup-2027 | 2027-06-24T00:00:00Z | confirmed (verified 2026-07-09) |
| LA 2028 Olympics Opening Ceremony | sports | 🥇 | la-2028-olympics | 2028-07-14T00:00:00Z | confirmed |

> Verification (2026-07-09, PM): all previously "estimated" rows confirmed via web sources; Eurovision and Zelda dates corrected, iPhone 18 kept with "(expected)". Sources: [Marvel](https://www.marvel.com/movies/spider-man-brand-new-day), [Marvel/Doomsday](https://www.marvel.com/movies/avengers-doomsday), [Wikipedia/Dune 3](https://en.wikipedia.org/wiki/Dune:_Part_Three), [FOX/WC Final](https://www.foxsports.com/stories/soccer/2026-world-cup-final-afternoon-match-metlife-stadium-july-19), [Wikipedia/SB LXI](https://en.wikipedia.org/wiki/Super_Bowl_LXI), [eurovisionworld](https://eurovisionworld.com/eurovision/2027), [UEFA](https://www.uefa.com/uefachampionsleague/news/029d-1eb2d5faf53c-d67c9fed04fa-1000--2027-uefa-champions-league-final-estadio-metropolitano-m/), [Wikipedia/Zelda](https://en.wikipedia.org/wiki/The_Legend_of_Zelda_(film)), [FIFA/WWC 2027](https://inside.fifa.com/media-releases/fifa-womens-world-cup-brazil-2027-dates-confirmed), [Forbes/iPhone 18](https://www.forbes.com/sites/davidphelan/2026/07/08/iphone-18-pro-release-date-a-new-september-timeline-emerges/)

> Slug policy (v2.1): curated slugs are English and human-readable; changing them pre-launch is acceptable (no public links exist yet).
