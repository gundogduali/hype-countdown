/**
 * Simple in-memory per-IP sliding-window rate limiter.
 * Good enough for a single-process MVP; multiple instances would need a shared store.
 */
export function createRateLimiter({ limit = 20, windowMs = 60 * 60_000, now = () => new Date() } = {}) {
  /** @type {Map<string, number[]>} ip -> request timestamps (ms) */
  const hits = new Map();

  return function rateLimit(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const t = now().getTime();
    const windowStart = t - windowMs;

    const recent = (hits.get(ip) || []).filter((ts) => ts > windowStart);
    if (recent.length >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000));
      const minutes = Math.ceil(retryAfterSec / 60);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: {
          code: 'rate_limited',
          message: `You have created too many timers. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
        },
      });
    }

    recent.push(t);
    hits.set(ip, recent);

    // Keep memory bounded: occasional cleanup
    if (hits.size > 10_000) {
      for (const [key, arr] of hits) {
        if (arr.every((ts) => ts <= windowStart)) hits.delete(key);
      }
    }
    next();
  };
}
