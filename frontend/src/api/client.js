/**
 * Hype API client — contract: docs/api.md (v2.1).
 * In dev, the Vite proxy maps `/api` → http://localhost:3001.
 * Error bodies are always nested: { error: { code, message } }.
 */
import { syncServerNow } from '../lib/time'

export class ApiError extends Error {
  constructor(code, message, status, retryAfter) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.retryAfter = retryAfter // seconds (Retry-After header on 429)
  }
}

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`/api${path}`, options)
  } catch {
    throw new ApiError('network', 'Could not reach the server. Check your connection.', 0)
  }

  let body = null
  try {
    body = await res.json()
  } catch {
    // empty / non-JSON response
  }

  if (!res.ok) {
    const code = body?.error?.code ?? 'internal'
    const message = body?.error?.message ?? 'Something went wrong. Please try again.'
    const retryHeader = res.headers.get('Retry-After')
    const retryAfter = retryHeader ? Number.parseInt(retryHeader, 10) : undefined
    throw new ApiError(code, message, res.status, retryAfter)
  }

  if (body?.serverNow) syncServerNow(body.serverNow)
  return body
}

/** Curated, non-expired timers (target_at ASC). Empty category = all. */
export function getTimers(category = '') {
  const qs = category ? `?category=${encodeURIComponent(category)}` : ''
  return request(`/timers${qs}`)
}

/** Single timer — returned even if expired; 404 timer_not_found if missing. */
export function getTimer(slug) {
  return request(`/timers/${encodeURIComponent(slug)}`)
}

/** Creates a custom timer. data: { title, target_at, emoji?, category? } */
export function createTimer(data) {
  return request('/timers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}
