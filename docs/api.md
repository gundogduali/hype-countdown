# Hype API Contract (v2.5)

> Single source of truth. The backend implements this contract; the frontend builds its mocks against it.
> Base URL (dev): `http://localhost:3001`
> v2.5 (2026-07-20): Social Share Card, HTML side (SC-5) — `GET /t/:slug` (production static serving only) now returns server-templated `og:*`/`twitter:card` meta tags for a known slug, since link-unfurl crawlers don't run the client-side head update. Not a JSON endpoint; purely additive to the static-serving behavior, no breaking change to any JSON response.
> v2.4 (2026-07-20): Social Share Card route implemented (SC-3/SC-4) — `GET /api/timers/:slug/og-image.png`, a rendered PNG for the link-unfurl preview (WhatsApp/Twitter/Discord/iMessage). Purely additive, no breaking change; existing consumers unaffected.
> v2.3 (2026-07-20): Hype Messages route implemented (HM-4) — `POST /api/timers/:slug/message` and `GET /api/timers/:slug/messages`, reusing HM-3's moderation error codes verbatim and the project's existing per-IP `rate_limited` convention. Purely additive, no breaking change; existing consumers unaffected.
> v2.2 (2026-07-20): Hype Reactions (RX-3) added — `POST /api/timers/:slug/react` plus an additive `reactions` field on the Timer Object. Also documents the Hype Messages moderation layer's stable error codes (HM-3) ahead of its route (`POST /api/timers/:slug/message`, tracked as HM-4). Purely additive, no breaking change; existing consumers unaffected.
> v2.1 (2026-07-09): product language switched to English — category API values, curated slugs/titles and all messages are English. Breaking slug/category changes were approved pre-launch (no public links existed).

## General Rules

- All times are **UTC ISO 8601** (`2026-11-19T00:00:00.000Z`). Display (local time) is the client's job.
- Every successful timer response includes a `serverNow` field (the server's current UTC time). The client corrects the countdown using the `serverNow - Date.now()` offset.
- The "is it expired" decision is made with the **server clock**.
- The error body always has this shape:

```json
{ "error": { "code": "some_code", "message": "Human-readable explanation." } }
```

- No auth. CORS: `http://localhost:5173` (Vite dev) allowed.

## Timer Object

| Field | Type | Description |
|---|---|---|
| `slug` | string | URL identifier. Curated: readable (`gta-6`). Custom: random, unguessable 10 characters (`k3x9tqv27m`). |
| `title` | string | 1–80 characters. |
| `emoji` | string | Single emoji; default `⏳`. |
| `category` | string \| null | `games` · `sports` · `movies-tv` · `tech` · `holidays`, or `null` (uncategorized custom). |
| `target_at` | string | Target moment, UTC ISO 8601. |
| `is_curated` | boolean | Curated (seed) or user-created. |
| `created_at` | string | Creation moment, UTC ISO 8601. |
| `reactions` | object | v2.2+. Hype Reactions live counts, one key per fixed emoji (`🔥⏳🎉😱👀`), `0` for emoji not yet used. Present on every timer object (list, detail, and create responses). |

---

## `GET /api/timers`

Returns curated, **non-expired** (`target_at > serverNow`) timers, ordered by `target_at` ascending (nearest first). **Custom timers (`is_curated=false`) are never returned in this list.**

### Query parameters

| Param | Required | Description |
|---|---|---|
| `category` | no | One of the valid category values. If given, only that category. Empty string = no filter. |

### Response `200`

```json
{
  "serverNow": "2026-07-09T12:00:00.000Z",
  "timers": [
    {
      "slug": "world-cup-2026-final",
      "title": "FIFA World Cup 2026 Final",
      "emoji": "🏆",
      "category": "sports",
      "target_at": "2026-07-19T19:00:00.000Z",
      "is_curated": true,
      "created_at": "2026-07-09T09:00:00.000Z",
      "reactions": { "🔥": 3, "⏳": 1, "🎉": 0, "😱": 0, "👀": 0 }
    }
  ]
}
```

### Errors

| Status | code | When |
|---|---|---|
| `400` | `invalid_category` | `category` is not one of the valid values (including being given more than once). |

---

## `GET /api/timers/:slug`

Returns a single timer — curated or custom, **even if expired** (the detail page shows the "🎉 It's time!" state).

### Response `200`

```json
{
  "serverNow": "2026-07-09T12:00:00.000Z",
  "timer": {
    "slug": "k3x9tqv27m",
    "title": "My driving test",
    "emoji": "🚗",
    "category": null,
    "target_at": "2026-08-01T06:30:00.000Z",
    "is_curated": false,
    "created_at": "2026-07-09T11:58:00.000Z",
    "reactions": { "🔥": 0, "⏳": 0, "🎉": 0, "😱": 0, "👀": 0 }
  }
}
```

### Errors

| Status | code | When |
|---|---|---|
| `404` | `timer_not_found` | Slug does not exist. |

---

## `POST /api/timers`

Creates a custom timer. Body: JSON.

### Request body

| Field | Required | Rule |
|---|---|---|
| `title` | yes | string, 1–80 characters after trim. |
| `target_at` | yes | ISO 8601 with an explicit timezone (`Z` or offset), **in the future** (by server clock) and at most **+100 years** ahead. |
| `emoji` | no | Short string (≤ 16 code units), default `⏳`. |
| `category` | no | One of the valid category values; `null` / `""` / omitted = uncategorized. |

```json
{ "title": "My driving test", "target_at": "2026-08-01T09:30:00+03:00", "emoji": "🚗" }
```

`target_at` may be sent with an offset; the server normalizes it to UTC before storing.

### Response `201`

```json
{
  "serverNow": "2026-07-09T12:00:00.000Z",
  "timer": {
    "slug": "k3x9tqv27m",
    "title": "My driving test",
    "emoji": "🚗",
    "category": null,
    "target_at": "2026-08-01T06:30:00.000Z",
    "is_curated": false,
    "created_at": "2026-07-09T12:00:00.000Z",
    "reactions": { "🔥": 0, "⏳": 0, "🎉": 0, "😱": 0, "👀": 0 }
  }
}
```

### Errors

| Status | code | When |
|---|---|---|
| `400` | `invalid_json` | Body is not valid JSON, or is a JSON primitive (`null`, number, string — the strict parser only accepts objects/arrays). |
| `400` | `invalid_body` | Body is JSON but not an object (e.g. an array). |
| `400` | `invalid_title` | Title missing / empty after trim / longer than 80 characters / not a string. |
| `400` | `invalid_target_at` | Date missing, not a string, unparseable, has no timezone, or is more than +100 years ahead. |
| `400` | `target_in_past` | `target_at` is not in the future by the server clock. |
| `400` | `invalid_category` | Category is not one of the valid values. |
| `400` | `invalid_emoji` | Emoji is not a string, is empty, or is too long. |
| `413` | `payload_too_large` | Body exceeds the 100KB limit. |
| `429` | `rate_limited` | Per-IP limit exceeded: **20 creations / hour**. The response includes a `Retry-After` header (seconds). |

---

## `POST /api/timers/:slug/react`

Anonymous Hype Reaction (PRD §9.2): taps one of a fixed 5-emoji set on a timer. No auth, no free text.

**IP-only identity (accepted MVP limitation)**: uniqueness is keyed on submitter IP only — there are no accounts, devices, or cookies in this MVP. Two people behind the same NAT/IP share one "slot" per emoji per timer; a person switching networks can react again. This is a known, accepted limitation, not a bug.

### Request body

| Field | Required | Rule |
|---|---|---|
| `emoji` | yes | Must be exactly one of the fixed set: `🔥` `⏳` `🎉` `😱` `👀`. No other emoji, empty string, or multi-emoji string is accepted. |

```json
{ "emoji": "🔥" }
```

### Response `200`

Always `200`, whether this IP's reaction was newly counted or it had already reacted with this emoji on this timer before (idempotent — the count does not move twice). `reactions` reflects the current live counts after the request.

```json
{
  "serverNow": "2026-07-09T12:00:00.000Z",
  "reactions": { "🔥": 4, "⏳": 1, "🎉": 0, "😱": 0, "👀": 0 }
}
```

### Errors

| Status | code | When |
|---|---|---|
| `404` | `timer_not_found` | Slug does not exist (same shape as `GET /api/timers/:slug`). |
| `400` | `invalid_body` | Body is not a JSON object (e.g. an array). |
| `400` | `invalid_json` | Body is not valid JSON, or is a JSON primitive. |
| `400` | `invalid_reaction_emoji` | `emoji` is missing, not a string, or not one of the fixed 5 values. |
| `413` | `payload_too_large` | Body exceeds the 100KB limit. |
| `429` | `rate_limited` | Per-IP limit exceeded: **100 reactions / hour** (a generous backstop against request flooding — the real per-emoji-per-timer duplicate check is the uniqueness constraint above, not this limit). The response includes a `Retry-After` header (seconds). |

---

## Hype Messages (HM-3 moderation layer + HM-4 route)

Short, moderated free text a visitor can attach to a timer (PRD §9.3) — shown publicly under the timer, newest first, capped list length. No auth; anonymous, like Hype Reactions.

Every message passes through the standalone moderation middleware (`backend/src/middleware/moderation.js`, config in `backend/src/config/wordlist.json` and `backend/src/config/moderation.json`) **before** it can be stored: max-length + empty check, blocklist check, spam-pattern check (repeated-character flooding, bare URLs/links), then HTML-escaping/sanitization of whatever text is accepted. The route layer (HM-4) never re-derives these checks itself — a rejection from the middleware is passed straight through as the response.

### Message Object

| Field | Type | Description |
|---|---|---|
| `id` | integer | Autoincrement id, unique across all timers. Useful as a stable list key; not sensitive. |
| `message` | string | Sanitized, HTML-escaped text, 1–80 characters. |
| `created_at` | string | UTC ISO 8601. |

### Cap

**Last 50 messages per timer** (`MESSAGE_CAP_PER_TIMER` in `backend/src/services/messages.js`). Chosen as a reasonable amount of recent history for a popular timer without an unbounded GET response or unbounded storage growth. Enforced on both sides: `GET` never returns more than 50, and older rows beyond the cap for that timer are pruned from storage on every successful `POST` (not just a read-time `LIMIT`).

---

## `POST /api/timers/:slug/message`

Submits a moderated free-text message on a timer.

### Request body

| Field | Required | Rule |
|---|---|---|
| `message` | yes | string, 1–80 characters after trim, passes moderation (see Errors below). |

```json
{ "message": "So hyped for this 🔥" }
```

### Response `201`

```json
{
  "serverNow": "2026-07-20T12:00:00.000Z",
  "message": { "id": 42, "message": "So hyped for this 🔥", "created_at": "2026-07-20T12:00:00.000Z" }
}
```

### Errors

| Status | code | When |
|---|---|---|
| `404` | `timer_not_found` | Slug does not exist (same shape as `GET /api/timers/:slug`). |
| `400` | `invalid_body` | Body is not a JSON object (e.g. an array). |
| `400` | `invalid_json` | Body is not valid JSON, or is a JSON primitive. |
| `400` | `invalid_message` | Message is missing, not a string, or empty/whitespace-only after trim. |
| `400` | `message_too_long` | Message exceeds 80 characters (config-driven `maxLength` in `moderation.json`) after trim. **API-level defense-in-depth by design (PM note, 2026-07-20)**: the shipped `MessageInput` hard-caps the input field at `maxLength={80}` (matching the character counter it shows), so this code is not reachable through ordinary typing/paste in the current UI — intentional, not a bug (found by REV-6/HM-7's review). Kept as a real server-side check for any non-UI client (curl, a future mobile client, etc.), same rationale as validation the UI also prevents client-side. |
| `400` | `message_repeated_chars` | Message contains a single character repeated 6+ times in a row (case-insensitive) — a common flooding/spam pattern. |
| `400` | `message_contains_link` | Message contains a bare URL/link (`http(s)://`, `www.`, or a `word.tld` pattern) — this field is not meant to carry links. |
| `400` | `message_blocked_content` | Message matches an entry in the moderation blocklist (`backend/src/config/wordlist.json`), after case-folding/unicode-normalization. |
| `413` | `payload_too_large` | Body exceeds the 100KB limit. |
| `429` | `rate_limited` | Per-IP limit exceeded: **20 messages / hour** — tighter than Hype Reactions' 100/hour since free text carries more abuse/moderation-bypass risk than a fixed-emoji tap; same order of magnitude as timer creation (a deliberate action, not a cheap tap). The response includes a `Retry-After` header (seconds). Same `rate_limited` code/shape as the other rate-limited endpoints above, just a different per-endpoint counter/limit. **Note (QA, 2026-07-20)**: the limiter runs before the moderation check, so a submission REJECTED by moderation still consumes one of the 20 slots, not just successful (`201`) ones — intentional (also caps free attempts to probe the moderation filter for a bypass), matching the same pattern as the timer-creation limiter. |

**Accepted trade-offs (known, intentional limitations — not bugs)**:
1. Cyrillic/Greek homoglyphs (e.g. Cyrillic `а` for Latin `a`) are not caught by the blocklist's
   unicode normalization — NFKC folds compatibility variants (fullwidth forms, some ligatures)
   within a script, not cross-script look-alikes. A confusables table (Unicode TR39) would be
   needed for that; a possible v1.1 follow-up, not implemented in this MVP.
2. Domain names split by plain spaces with no "dot"/scheme marker (e.g. `"e v i l . c o m"` with
   no `www`/`http`/spelled-out "dot") are not caught by the bare `word.tld` pattern, since fully
   collapsing whitespace there would glue surrounding words onto the domain and break the
   word-boundary matching that keeps the check from false-positiving on ordinary sentences. The
   `http(s)://`/`www.` check does still catch this shape when a scheme or `www.` prefix is present.
3. 6+ identical emoji in a row (e.g. `"🔥🔥🔥🔥🔥🔥"`) is flagged as `message_repeated_chars`, same
   as `"aaaaaa"` — a literal reading of "repeated-character flooding" applied uniformly, not
   emoji-specific. Threshold is config-driven (`repeatedCharMinRun` in `moderation.json`).
4. **(HM-3b, 2026-07-20)** The bare `word.tld` link heuristic only recognizes TLDs that are *not*
   also common English words/abbreviations (`urlTlds` in `moderation.json`: `com net org io info
   link xyz app ly`). Ambiguous TLDs that double as ordinary words (`gg co to me tv club biz dev
   shop top win click cc us uk ai gov edu`, etc.) were deliberately dropped from this list — casual
   messages that glue two clauses together with a period and no space (e.g. `"this game.gg"`,
   `"live.to be honest"`, `"this is lit.club vibes"`) were otherwise wrongly flagged as links. This
   is an accepted precision-over-recall trade-off: a real spam link using one of the dropped
   ambiguous TLDs (e.g. `"totally-legit-deal.gg"`) is **not** caught by this check alone — only by
   an explicit `http(s)://`/`www.` scheme, or independently by the length/blocklist checks. **Note
   (QA, 2026-07-20)**: don't use `"spam.gg"` as a test case for this specific trade-off — the word
   "spam" is independently on the blocklist, so that phrase is still rejected end-to-end, just via
   `message_blocked_content` rather than the link check. A clean demonstration of the trade-off
   working as designed is `"check game.gg later"`, which passes (`201`).
5. **(HM-4)** Uniqueness/spam beyond the checks above (e.g. the exact same message flooded
   repeatedly) is bounded only by the 20/hour rate limit, not a dedicated duplicate-submission
   check — `moderation.js` exports an opt-in `createDuplicateGuard` helper for that, not wired in
   here; a possible follow-up, not required by this issue's acceptance criteria.

---

## `GET /api/timers/:slug/messages`

Returns stored messages for a timer, newest first, capped at 50 (see "Cap" above).

### Response `200`

```json
{
  "serverNow": "2026-07-20T12:00:00.000Z",
  "messages": [
    { "id": 42, "message": "So hyped for this 🔥", "created_at": "2026-07-20T12:00:00.000Z" },
    { "id": 41, "message": "Can't wait!", "created_at": "2026-07-20T11:55:00.000Z" }
  ]
}
```

An unknown/expired-but-existing timer with zero messages returns `"messages": []`, not an error.

### Errors

| Status | code | When |
|---|---|---|
| `404` | `timer_not_found` | Slug does not exist (same shape as `GET /api/timers/:slug`). |

---

## `GET /api/timers/:slug/og-image.png`

Renders the Social Share Card (PRD §9.1): the image shown when a timer link is pasted into WhatsApp/Twitter/Discord/iMessage. Server-rendered PNG, 1200×630 (standard OG image size), dark premium style matching the site (`frontend/src/index.css` `$hype-*` tokens): emoji, title, remaining time as **whole days/hours/minutes only — no seconds** (a static cached image showing seconds would look stale within moments), and a small "⏳ Hype" watermark chip. If `target_at` is already in the past (by the **server clock** — same rule as everywhere else in this contract), the ended-state variant is rendered instead: gradient heading "🎉 It's time!" + "THE WAIT IS OVER" sub-caption (`docs/copy.md`).

Very long titles wrap to up to 2 lines and shrink the font size rather than being cut off; non-Latin scripts and emoji are rendered directly (not transliterated).

### Response `200`

`Content-Type: image/png`, `Cache-Control: public, max-age=60` (the server's own render cache is keyed by `slug` + `target_at` + `title` + `emoji` with the same 60s freshness window — see "Caching" below; the response header just lets a CDN/client avoid re-fetching the identical bytes within that window too).

### Errors

| Status | code | When |
|---|---|---|
| `404` | `timer_not_found` | Slug does not exist (same shape as `GET /api/timers/:slug`). |

### Caching

Rendered PNGs are cached in-memory (process-local LRU, capacity 200), keyed by **`slug` + `target_at` + `title` + `emoji`** — the fields that actually change what gets drawn. A curated timer's date/title being corrected in the seed, or (if ever added) an edit to a custom timer, changes the key, so the old render is simply never looked up again — it can never be served stale after an edit. Independently, a cache hit older than **60 seconds** is treated as a miss and re-rendered even if the key is unchanged, so the displayed remaining time (minute-granularity) doesn't visibly freeze for a popular, long-lived, never-edited timer.

### Rendering approach

Server-side Canvas 2D rendering via `skia-canvas` (Google's Skia rasterizer — the same engine Chrome uses — not a headless browser). Chosen after directly comparing candidate rendering libraries: `sharp` (librsvg), `@resvg/resvg-js`, and node-`canvas` (Cairo) all rendered emoji as a flat monochrome silhouette or nothing at all instead of full color glyphs; `skia-canvas` renders true color emoji. See `.claude/retros/share-card-developer-2026-07-20.md` for the original comparison.

**Host-independent by design (DP-4, 2026-07-20)**: emoji rendering does **not** rely on the deploy host having any system color-emoji font installed. `ogImage.js` bundles `@fontsource/noto-color-emoji` as a real npm dependency and registers its `.woff2` file explicitly via `skia-canvas`'s `FontLibrary.use(...)` at module load, under its own dedicated font family — so the same bytes render identically on macOS dev, a bare Linux container, or Render's production host. Verified two ways: (1) `FontLibrary.has(...)` asserts the registration actually took effect (fails loudly if a future refactor drops it, instead of silently degrading to tofu in production), and (2) a pixel-level test renders a real emoji through the live route and samples the output PNG's pixels to confirm true color (not just "the PNG parses"). This closes the earlier open risk of relying on an unverified OS font on the actual Render container — no separate production-only verification step remains.

**Known, separate limitation (not a host/font problem)**: a small number of emoji codepoints — confirmed so far: 🕷️ (`U+1F577`) and ⚽ (`U+26BD`, used by several curated timers, e.g. the sports category and `ucl-final-2027`) — render as a flat monochrome glyph rather than color, reproduced identically across three different font sources including macOS's own pre-installed font. This looks like a `skia-canvas`/Skia glyph-rendering limitation specific to those glyphs, not something registering a different font fixes. Not exhaustively enumerated beyond the two confirmed codepoints; a possible v1.1 follow-up (try an alternate rendering backend for just these glyphs), not blocking for MVP since the rest of the card (title, countdown, watermark) is unaffected and still legible.

**Fixed alongside this**: `skia-canvas` itself had been used since SC-3 but was never actually added to `backend/package.json`'s `dependencies` — it only worked locally because it happened to already be present in `node_modules`. This would have made the whole share-card feature fail to install (`npm ci`, as Render's build does) and crash in production. Now declared correctly, with a matching `package-lock.json`.

---

## `GET /t/:slug` (production static serving only — SC-5)

Not a JSON API endpoint — documented here because it's an observable, contractual part of the HTTP response. Only active when the server is started with `STATIC_DIR` set (production; see "Deployment" below) and only for GET requests matching the frontend router's `/t/:slug` path.

Why this exists: Hype's frontend is a pure client-side SPA, so a React-side `document.title`/head update (already done in-browser, see `frontend/src/pages/TimerDetail.jsx`) is invisible to link-unfurl crawlers that don't execute JS. The HTML response itself must already carry the tags.

- **Known slug** (curated or custom): the static `index.html` bytes are returned with these tags injected/replaced in `<head>`, using the timer's live title/emoji/slug:
  - `<title>{emoji} {title} — Hype ⏳</title>` (same convention as the in-browser tab title)
  - `<meta name="description" content="...">`
  - `<meta property="og:title">`, `<meta property="og:description">`, `<meta property="og:url">` (absolute URL to the timer page), `<meta property="og:type" content="website">`
  - `<meta property="og:image">` — absolute URL to `GET /api/timers/:slug/og-image.png` (scheme+host from the request; crawlers fetch this directly, without browser context, so it must be absolute, not relative)
  - `<meta name="twitter:card" content="summary_large_image">`
  - The timer's `title` is user-supplied for custom timers and is HTML-escaped before interpolation (defense in depth against a crafted title carrying markup).
- **Unknown slug**, or any other non-`/api` path (`/`, `/create`, unmatched paths): the plain static `index.html` is returned unchanged — the client-side router (including its 404 page) takes over as before this feature.
- Local dev (`STATIC_DIR` unset) is unaffected — this whole behavior lives inside the static-serving code path.

---

## Other

- `GET /api/health` → `200` `{ "ok": true }`
- **Deployment**: Behind a reverse proxy (nginx etc.), set the `TRUST_PROXY=1` environment variable (hop count; `loopback` or a CIDR is also accepted) so the rate limiter sees the real client IP. The value `true` is interpreted as **1 hop** for security: trusting the entire `X-Forwarded-For` chain would let a client bypass the rate limit with a spoofed XFF. `false`/empty = off (default) — without a proxy, `X-Forwarded-For` is spoofable and untrusted. An invalid value (e.g. `TRUST_PROXY=yes`) crashes the server at startup (fail-fast).
- Unknown path → `404` `{ "error": { "code": "not_found", "message": "..." } }`
- Unexpected error → `500` `{ "error": { "code": "internal", "message": "..." } }`

## Categories (fixed list)

`games` · `sports` · `movies-tv` · `tech` · `holidays`

## Seed (curated content)

The PRD Appendix A list is loaded idempotently at server startup (upsert keyed by `slug`; restarts never duplicate, date corrections are applied). Curated rows whose slug is no longer in the seed list are **deleted** (cleans obsolete slugs after curation changes — e.g. the v2.1 Turkish → English slug switch); custom timers are never touched. Curated slugs are readable: `gta-6`, `world-cup-2026-final`, `iphone-18-event`, `christmas-2026`, `new-year-2027`, etc.
