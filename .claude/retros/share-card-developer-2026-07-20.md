# Share Card Developer — Retro (2026-07-20)

## Task

SC-3/SC-4: build the server-rendered Social Share Card image and its route.
- `backend/src/services/ogImage.js` — render logic + cache.
- `backend/src/routes/og.js` — `GET /api/timers/:slug/og-image.png`.
- Additive wiring: `backend/src/app.js` (mount router), `backend/package.json` (new dependency), `docs/api.md` (new section).

## What I built

- A 1200×630 PNG renderer using **`skia-canvas`** (Canvas 2D API on Skia — Chrome's own rasterizer), producing: dark bg + soft purple radial glow (`.glow-detail` equivalent), centered large emoji, bold wrapping/shrinking title, a DAYS:HOURS:MINUTES countdown row styled like `Countdown.jsx` (bold monospace values, tracked-uppercase monospace labels, light monospace `:` separators), a bottom-right "⏳ Hype" pill watermark, and an ended-state variant (gradient "🎉 It's time!" heading + "THE WAIT IS OVER" sub-caption) when `target_at <= server now`.
- `og.js` reuses `TimerService.getBySlug` and `TimerService.now()` — no duplicated lookup/clock logic — and returns the standard `{ error: { code: 'timer_not_found', message } }` 404 body on a miss.
- An in-memory LRU cache (capacity 200) inside `ogImage.js`.
- `docs/api.md` v2.4: new `GET /api/timers/:slug/og-image.png` section (response shape, caching, rendering approach, errors).

## Rendering-approach decision (Rule 2)

Before writing the real service, I prototyped the same "draw text `🎉🔥⏳` and rasterize" test in four different libraries and read the actual output pixels, rather than trusting documentation:

| Library | Result |
|---|---|
| `sharp` (bundled librsvg + pango) | Emoji drawn as a flat **monochrome silhouette** filled with the text color — not color. |
| `@resvg/resvg-js` | Emoji glyphs **not drawn at all** (blank). |
| `canvas` (node-canvas, Cairo) | Same monochrome-silhouette problem as `sharp`, even after explicitly `registerFont`-ing Apple Color Emoji. |
| `skia-canvas` (Skia) | **Correct full-color emoji**, matching what a real Twemoji/Apple emoji looks like. |

This wasn't guesswork — this is a known, documented limitation of Cairo/librsvg/resvg's text backends (they don't rasterize color glyph tables like `sbix`/`CBDT`/`COLR`), which is exactly the kind of "tofu/monochrome glyph" bug Rule 5 calls out. `skia-canvas` is still a native Canvas 2D library, not a headless browser (no page load, no JS engine, no network stack) — same category of dependency as `sharp`/`canvas`, just with a rasterizer that actually supports color emoji. Chose it and moved on rather than spending more time trying to force color-glyph support into the other three.

**Font choice/fallback**: generic CSS families only — `sans-serif` (bold, for title/heading) and `monospace` (for countdown digits/labels, matching `Countdown.jsx`'s visual language) — resolved by Skia through the OS font stack (Apple Color Emoji / Helvetica / Menlo on this macOS dev machine). No specific family ("Geist"/"Geist Mono") was embedded, per the task's explicit guidance. Verified with real screenshots: Latin bold sans, monospace digits, Chinese/Cyrillic/Arabic/Turkish-diacritic title text, and 4 different color emoji all render correctly (no tofu, no monochrome) — see the curl verification below.

**Known, documented limitation (not fixed here, out of file scope)**: this depends on the *deployment host* having a color-emoji font installed. Confirmed working on this macOS dev box (Apple Color Emoji) — a minimal/headless Linux container without `fonts-noto-color-emoji` (or similar) installed would fall back to no/monochrome emoji glyph. That's a base-image/Dockerfile/render.yaml concern, outside `ogImage.js`/`og.js`'s scope (owned elsewhere, e.g. DP-1's render.yaml). Documented in both this retro and `docs/api.md`'s new section so it isn't silently forgotten.

## Cache key (Rule 4, stated explicitly)

`` `${slug}::${target_at}::${title}::${emoji}` `` → in-memory `Map`-based LRU, capacity 200 (evicts oldest on overflow).
- **Invalidation on edit**: any change to `target_at`/`title`/`emoji` (e.g. a curated timer's seed data being corrected) changes the key, so the previous rendered PNG for that slug is simply never looked up again — never served stale after an edit.
- **Freshness TTL**: additionally, a cache hit older than **60 seconds** is treated as a miss and re-rendered even when the key is unchanged. This is needed *in addition to* the edit-invalidation key: the image shows whole minutes (no seconds, per spec), and without a TTL a popular, never-edited timer's image would freeze at whatever minute value it first rendered at, indefinitely — a real staleness bug that a key on `target_at`/`title` alone doesn't catch, since `target_at` itself never changes as time passes. Verified both invalidation paths directly (unit-level, not just by inspecting the code): same key → identical cached bytes; changed title/target → different bytes; TTL-expired same key → re-renders, still valid PNG.
- Route also sets `Cache-Control: public, max-age=60` to match, so a CDN/client isn't hammering the server for identical bytes within that window either.

## Verification (Rule 6)

Ran the real backend (`node src/server.js`) and curled all required cases, then inspected the actual PNG bytes/pixels (not just HTTP status):
- Curated slug (`spider-man-brand-new-day`) → `200`, `image/png`, 1200×630 PNG, countdown row correct.
- Custom slug with a long title (created via `POST /api/timers`) → `200`, title wraps to 2 lines and shrinks, no overflow/cutoff.
- Custom timer whose `target_at` had passed (created 3s in the future, waited for it to expire) → `200`, ended-state gradient heading rendered, no crash/500.
- Unknown slug → `404` with the exact `{"error":{"code":"timer_not_found","message":"No such timer."}}` body, matching the existing convention byte-for-byte.
- Also rendered (offline, not via the route) a Chinese/Cyrillic/Arabic/Turkish-diacritic title and 4 different emoji to confirm no tofu/monochrome glyphs.
- `file` on each saved PNG confirmed real, non-zero-size `PNG image data, 1200 x 630, 8-bit/color RGBA`.
- Full existing backend suite: **116/116 passing** after the additive `app.js`/`package.json` changes (no regressions).

## Bugs found and fixed during this task

1. The three "obvious" candidate rendering libraries (`sharp`, `resvg`, `canvas`) all had the color-emoji rendering bug described above. Found via direct pixel inspection before committing to an approach (not discovered later as a shipped bug) — switched to `skia-canvas`.
2. First draft of `ogImage.js` imported `FontLibrary` from `skia-canvas` for a "documented for later" comment that was never actually used — removed the unused import and the dead reference instead of leaving lint-bait in the file.

## Scope discipline

Worked concurrently with `backend-developer`'s HM-4 work touching `app.js`/`timers.js`/`package.json`/`docs/api.md` at the same time. Re-read each shared file immediately before editing it (rather than trusting a stale in-memory copy) and made only the minimal additive diff in each (one import + one `app.use()` line in `app.js`; one dependency line in `package.json`; one new section in `docs/api.md`). Did not touch `timers.js`, `reactions.js`, `messages.js`, `moderation.js`, `db/index.js`, or any frontend/`.pen` file.

## Lessons learned

- [2026-07-20] Don't trust that "a library can render SVG/canvas text" implies it can render color emoji — Cairo/librsvg/resvg text backends commonly draw color-glyph-table emoji as a monochrome silhouette (or nothing). Prototype the actual emoji glyph and look at the pixels before picking a rendering library, the same way Rule 5 already demands verifying it isn't a tofu box.
