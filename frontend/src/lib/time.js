/**
 * Time helpers.
 * PRD 3.5: the client clock is untrusted — we keep a `serverNow - Date.now()`
 * offset from every API response; countdowns and the "done" decision use
 * this offset-corrected time. Negative values are never shown.
 */

let serverOffsetMs = 0

export function syncServerNow(serverNowIso) {
  const t = Date.parse(serverNowIso)
  if (!Number.isNaN(t)) {
    serverOffsetMs = t - Date.now()
  }
}

/** Server-corrected "now" (ms epoch). */
export function serverNow() {
  return Date.now() + serverOffsetMs
}

const pad = (n) => String(n).padStart(2, '0')

/** Splits the time remaining until the target into parts; never negative. */
export function getRemaining(targetIso, nowMs = serverNow()) {
  const diff = Math.max(0, Date.parse(targetIso) - nowMs)
  const totalSeconds = Math.floor(diff / 1000)
  return {
    total: diff,
    done: diff <= 0,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor(totalSeconds / 3600) % 24,
    minutes: Math.floor(totalSeconds / 60) % 60,
    seconds: totalSeconds % 60,
  }
}

/** Card format: "134d 16:22:41" */
export function formatCardRemaining(r) {
  return `${r.days}d ${pad(r.hours)}:${pad(r.minutes)}:${pad(r.seconds)}`
}

/** e.g. "November 19, 2026" — browser default locale, visitor's timezone. */
export function formatLocalDate(iso) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso))
}

/** e.g. "November 19, 2026 · 03:00 (your local time)" */
export function formatLocalDateTime(iso) {
  const d = new Date(iso)
  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
  return `${formatLocalDate(iso)} · ${time} (your local time)`
}

/** Local timezone label such as "GMT+3" or "GMT+5:30". */
export function gmtLabel() {
  const mins = -new Date().getTimezoneOffset()
  const sign = mins >= 0 ? '+' : '-'
  const h = Math.floor(Math.abs(mins) / 60)
  const m = Math.abs(mins) % 60
  return `GMT${sign}${h}${m ? `:${pad(m)}` : ''}`
}
