import { Router } from 'express';
import { ValidationError } from '../services/timers.js';

/** Attaches the additive `reactions` field to a Timer Object (PRD §9.2). */
function withReactions(timer, reactionService) {
  return { ...timer, reactions: reactionService.getCounts(timer.slug) };
}

/**
 * @param {import('../services/timers.js').TimerService} service
 * @param {import('express').RequestHandler} createLimiter rate limiter for POST /api/timers
 * @param {import('../services/reactions.js').ReactionService} reactionService
 * @param {import('express').RequestHandler} reactLimiter rate limiter for POST /api/timers/:slug/react
 * @param {import('../services/messages.js').MessageService} messageService
 * @param {import('express').RequestHandler} messageLimiter rate limiter for POST /api/timers/:slug/message
 */
export function timersRouter(
  service,
  createLimiter,
  reactionService,
  reactLimiter,
  messageService,
  messageLimiter
) {
  const router = Router();

  // GET /api/timers?category= — curated + non-expired
  router.get('/', (req, res, next) => {
    try {
      // Non-string values (e.g. ?category=a&category=b → array) fall through
      // to invalid_category in the service; they are not silently swallowed.
      const { category } = req.query;
      const timers = service.listCurated(category).map((t) => withReactions(t, reactionService));
      res.json({ serverNow: service.nowIso(), timers });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/timers — create a custom timer (rate limited)
  router.post('/', createLimiter, (req, res, next) => {
    try {
      const timer = service.createCustom(req.body);
      res.status(201).json({ serverNow: service.nowIso(), timer: withReactions(timer, reactionService) });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/timers/:slug — single timer (returned even if expired)
  router.get('/:slug', (req, res, next) => {
    try {
      const timer = service.getBySlug(req.params.slug);
      if (!timer) {
        return res.status(404).json({
          error: { code: 'timer_not_found', message: 'No such timer.' },
        });
      }
      res.json({ serverNow: service.nowIso(), timer: withReactions(timer, reactionService) });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/timers/:slug/react — anonymous, per-IP-once reaction (PRD §9.2)
  router.post('/:slug/react', reactLimiter, (req, res, next) => {
    try {
      const timer = service.getBySlug(req.params.slug);
      if (!timer) {
        return res.status(404).json({
          error: { code: 'timer_not_found', message: 'No such timer.' },
        });
      }
      if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
        return res.status(400).json({
          error: { code: 'invalid_body', message: 'Body must be a JSON object.' },
        });
      }
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
      const { reactions } = reactionService.react(req.params.slug, req.body.emoji, ip);
      res.status(200).json({ serverNow: service.nowIso(), reactions });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/timers/:slug/messages — stored Hype Messages, newest first, capped (PRD §9.3)
  router.get('/:slug/messages', (req, res, next) => {
    try {
      const timer = service.getBySlug(req.params.slug);
      if (!timer) {
        return res.status(404).json({
          error: { code: 'timer_not_found', message: 'No such timer.' },
        });
      }
      const messages = messageService.list(req.params.slug);
      res.json({ serverNow: service.nowIso(), messages });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/timers/:slug/message — moderated free-text message (PRD §9.3, issue HM-4)
  router.post('/:slug/message', messageLimiter, (req, res, next) => {
    try {
      const timer = service.getBySlug(req.params.slug);
      if (!timer) {
        return res.status(404).json({
          error: { code: 'timer_not_found', message: 'No such timer.' },
        });
      }
      if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
        return res.status(400).json({
          error: { code: 'invalid_body', message: 'Body must be a JSON object.' },
        });
      }
      // Moderation (HM-3) owns length/blocklist/spam-pattern/sanitize checks and
      // their error codes — never re-derived here.
      const result = messageService.submit(req.params.slug, req.body.message);
      if (!result.ok) {
        return res.status(400).json({ error: { code: result.code, message: result.message } });
      }
      res.status(201).json({ serverNow: service.nowIso(), message: result.item });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/** ValidationError → 400 translator (used at the app level). */
export function validationErrorHandler(err, _req, res, next) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: { code: err.code, message: err.message } });
  }
  next(err);
}
