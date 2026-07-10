# Hype API Contract (v2.1)

> Single source of truth. The backend implements this contract; the frontend builds its mocks against it.
> Base URL (dev): `http://localhost:3001`
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
      "created_at": "2026-07-09T09:00:00.000Z"
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
    "created_at": "2026-07-09T11:58:00.000Z"
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
    "created_at": "2026-07-09T12:00:00.000Z"
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

## Other

- `GET /api/health` → `200` `{ "ok": true }`
- **Deployment**: Behind a reverse proxy (nginx etc.), set the `TRUST_PROXY=1` environment variable (hop count; `loopback` or a CIDR is also accepted) so the rate limiter sees the real client IP. The value `true` is interpreted as **1 hop** for security: trusting the entire `X-Forwarded-For` chain would let a client bypass the rate limit with a spoofed XFF. `false`/empty = off (default) — without a proxy, `X-Forwarded-For` is spoofable and untrusted. An invalid value (e.g. `TRUST_PROXY=yes`) crashes the server at startup (fail-fast).
- Unknown path → `404` `{ "error": { "code": "not_found", "message": "..." } }`
- Unexpected error → `500` `{ "error": { "code": "internal", "message": "..." } }`

## Categories (fixed list)

`games` · `sports` · `movies-tv` · `tech` · `holidays`

## Seed (curated content)

The PRD Appendix A list is loaded idempotently at server startup (upsert keyed by `slug`; restarts never duplicate, date corrections are applied). Curated rows whose slug is no longer in the seed list are **deleted** (cleans obsolete slugs after curation changes — e.g. the v2.1 Turkish → English slug switch); custom timers are never touched. Curated slugs are readable: `gta-6`, `world-cup-2026-final`, `iphone-18-event`, `christmas-2026`, `new-year-2027`, etc.
