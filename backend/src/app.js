import express from 'express';
import cors from 'cors';
import { openDb } from './db/index.js';
import { seedCuratedTimers } from './db/seed.js';
import { TimerService } from './services/timers.js';
import { createRateLimiter } from './services/rate-limit.js';
import { timersRouter, validationErrorHandler } from './routes/timers.js';

/**
 * Builds the Express app.
 * @param {{
 *   dbPath?: string,
 *   now?: () => Date,
 *   seed?: boolean,
 *   rateLimit?: { limit?: number, windowMs?: number }
 * }} options
 */
export function createApp({ dbPath = ':memory:', now = () => new Date(), seed = true, rateLimit = {} } = {}) {
  const db = openDb(dbPath);
  if (seed) seedCuratedTimers(db, now);
  const service = new TimerService(db, now);
  const createLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 60_000, now, ...rateLimit });

  const app = express();

  // Behind a reverse proxy (nginx etc.), set TRUST_PROXY=1 (hop count) or a
  // value like TRUST_PROXY=loopback so the real client IP is used.
  // Off by default — without a proxy, X-Forwarded-For is spoofable and untrusted.
  // Note: passing the string "true" straight to Express crashes proxy-addr;
  // passing boolean true would trust the ENTIRE X-Forwarded-For chain — a
  // client could spoof the leftmost entry to bypass the rate limit. So
  // "true" → 1 hop (a single reverse proxy: the intended setup, spoof-proof).
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy && trustProxy.toLowerCase() !== 'false') {
    app.set(
      'trust proxy',
      /^\d+$/.test(trustProxy)
        ? Number(trustProxy)
        : trustProxy.toLowerCase() === 'true'
          ? 1
          : trustProxy
    );
  }

  app.use(
    cors({
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    })
  );
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/timers', timersRouter(service, createLimiter));

  // 404
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'No such endpoint.' } });
  });

  // Errors: ValidationError → 400, JSON parse → 400, everything else → 500
  app.use(validationErrorHandler);
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res
        .status(400)
        .json({ error: { code: 'invalid_json', message: 'Body is not valid JSON.' } });
    }
    if (err.type === 'entity.too.large') {
      return res
        .status(413)
        .json({ error: { code: 'payload_too_large', message: 'Body too large (100KB limit).' } });
    }
    console.error(err);
    res.status(500).json({ error: { code: 'internal', message: 'Unexpected server error.' } });
  });

  app.locals.db = db;
  app.locals.service = service;
  return app;
}
