import { Router } from 'express';
import { ValidationError } from '../services/timers.js';

/**
 * @param {import('../services/timers.js').TimerService} service
 * @param {import('express').RequestHandler} createLimiter rate limiter for POST
 */
export function timersRouter(service, createLimiter) {
  const router = Router();

  // GET /api/timers?category= — curated + non-expired
  router.get('/', (req, res, next) => {
    try {
      // Non-string values (e.g. ?category=a&category=b → array) fall through
      // to invalid_category in the service; they are not silently swallowed.
      const { category } = req.query;
      const timers = service.listCurated(category);
      res.json({ serverNow: service.nowIso(), timers });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/timers — create a custom timer (rate limited)
  router.post('/', createLimiter, (req, res, next) => {
    try {
      const timer = service.createCustom(req.body);
      res.status(201).json({ serverNow: service.nowIso(), timer });
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
      res.json({ serverNow: service.nowIso(), timer });
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
