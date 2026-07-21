import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express from 'express';
import cors from 'cors';
import { openDb } from './db/index.js';
import { seedCuratedTimers } from './db/seed.js';
import { TimerService } from './services/timers.js';
import { ReactionService } from './services/reactions.js';
import { MessageService } from './services/messages.js';
import { createRateLimiter } from './services/rate-limit.js';
import { timersRouter, validationErrorHandler } from './routes/timers.js';
import { ogRouter } from './routes/og.js';
import { renderTimerHtml } from './services/htmlTemplate.js';

// Matches the frontend router's timer-detail route (frontend/src/App.jsx:
// `<Route path="/t/:slug" .../>`) — used by the SPA fallback below to
// special-case the social-share-card meta tags (PRD §9.1, issue SC-5).
const TIMER_DETAIL_PATH_RE = /^\/t\/([^/]+)\/?$/;

/**
 * Builds the Express app.
 * @param {{
 *   dbPath?: string,
 *   now?: () => Date,
 *   seed?: boolean,
 *   rateLimit?: { limit?: number, windowMs?: number },
 *   reactionRateLimit?: { limit?: number, windowMs?: number },
 *   messageRateLimit?: { limit?: number, windowMs?: number },
 *   staticDir?: string
 * }} options
 */
export function createApp({
  dbPath = ':memory:',
  now = () => new Date(),
  seed = true,
  rateLimit = {},
  reactionRateLimit = {},
  messageRateLimit = {},
  staticDir,
} = {}) {
  const db = openDb(dbPath);
  if (seed) seedCuratedTimers(db, now);
  const service = new TimerService(db, now);
  const reactionService = new ReactionService(db, now);
  const messageService = new MessageService(db, now);
  const createLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 60_000, now, ...rateLimit });
  // Reactions are cheap taps, not full timer creations — a more generous
  // per-IP window (still bounded, per the project's "rate limit every POST"
  // rule). The per-(slug, emoji, ip) uniqueness constraint is the real limit;
  // this is just a backstop against request flooding.
  const reactLimiter = createRateLimiter({
    limit: 100,
    windowMs: 60 * 60_000,
    now,
    message: (minutes) =>
      `Too many reactions from this address. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
    ...reactionRateLimit,
  });
  // Free-text submissions carry more abuse risk than a reaction tap (spam,
  // moderation-bypass attempts), so this is tighter than reactLimiter and
  // matches createLimiter's per-IP window (same order of magnitude as
  // "creating a timer" — a deliberate, meaningful action, not a cheap tap).
  const messageLimiter = createRateLimiter({
    limit: 20,
    windowMs: 60 * 60_000,
    now,
    message: (minutes) =>
      `Too many messages from this address. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
    ...messageRateLimit,
  });

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
  app.use(
    '/api/timers',
    timersRouter(service, createLimiter, reactionService, reactLimiter, messageService, messageLimiter)
  );
  // Share card (PRD §9.1, SC-4): a distinct router at the same prefix so the
  // route lives in its own file, per share-card-developer's file scope.
  app.use('/api/timers', ogRouter(service));

  // Production static serving (STATIC_DIR): the frontend build lives alongside
  // the API on the same origin. Unset in local dev → this whole block is inert.
  if (staticDir) {
    const root = resolve(staticDir);
    const indexHtml = join(root, 'index.html');
    // Read once at startup and reused (templated in-memory per request below)
    // — avoids a disk read on every `/t/:slug` request.
    const indexHtmlTemplate = readFileSync(indexHtml, 'utf8');

    // Vite emits content-hashed filenames under assets/ → safe to cache forever.
    app.use(
      '/assets',
      express.static(join(root, 'assets'), { immutable: true, maxAge: '1y', index: false })
    );
    // Everything else in the build root (favicon.svg, index.html if asked for
    // directly, …) is un-hashed → always revalidate.
    app.use(
      express.static(root, {
        index: false,
        setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
      })
    );
    // SPA fallback: any non-/api GET without a file match gets index.html and
    // the client router takes over (/t/:slug, /create, client-side 404 page).
    //
    // Special case (PRD §9.1, SC-5): a `/t/:slug` request for a *known*
    // timer gets a server-templated HTML variant with real og:*/twitter:*
    // meta tags baked in, so link-unfurl crawlers (WhatsApp/Twitter/Discord/
    // iMessage) — which don't execute the client-side
    // `document.title`/head update in TimerDetail.jsx — still see a correct
    // preview. An unknown slug (or any other path) falls through to the
    // plain static index.html unchanged; the client-side 404 page handles
    // that case, same as before this feature.
    app.get('*', (req, res, next) => {
      if (req.path === '/api' || req.path.startsWith('/api/')) return next();

      const match = req.path.match(TIMER_DETAIL_PATH_RE);
      if (match) {
        let slug;
        try {
          slug = decodeURIComponent(match[1]);
        } catch {
          slug = match[1]; // malformed percent-encoding — treat as a literal slug (won't match anything)
        }
        const timer = service.getBySlug(slug);
        if (timer) {
          const origin = `${req.protocol}://${req.get('host')}`;
          const html = renderTimerHtml(indexHtmlTemplate, timer, {
            pageUrl: `${origin}/t/${encodeURIComponent(timer.slug)}`,
            imageUrl: `${origin}/api/timers/${encodeURIComponent(timer.slug)}/og-image.png`,
          });
          res.set('Content-Type', 'text/html; charset=utf-8');
          res.set('Cache-Control', 'no-cache');
          return res.send(html);
        }
      }

      res.sendFile(
        indexHtml,
        { cacheControl: false, headers: { 'Cache-Control': 'no-cache' } },
        (err) => {
          if (err) next(err);
        }
      );
    });
  }

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
  app.locals.reactionService = reactionService;
  app.locals.messageService = messageService;
  return app;
}
