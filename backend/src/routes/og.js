import { Router } from 'express';
import { getOgImage } from '../services/ogImage.js';

/**
 * Social share card route (PRD §9.1, issue SC-4).
 *
 * `GET /api/timers/:slug/og-image.png` — mounted as its own router at the
 * same `/api/timers` prefix as `timersRouter` (see app.js). Kept in a
 * separate file/router rather than added to `timers.js` per this agent's
 * file-scope restriction (share-card-developer.md Rule 1).
 *
 * @param {import('../services/timers.js').TimerService} service reused for
 *   lookup — no duplicated slug-lookup logic — and for the server clock.
 */
export function ogRouter(service) {
  const router = Router();

  router.get('/:slug/og-image.png', async (req, res, next) => {
    try {
      const timer = service.getBySlug(req.params.slug);
      if (!timer) {
        return res.status(404).json({
          error: { code: 'timer_not_found', message: 'No such timer.' },
        });
      }
      const buffer = await getOgImage(timer, service.now());
      res.set('Content-Type', 'image/png');
      // Rendered output is cached server-side (see ogImage.js); short
      // client/CDN cache too, so a paste into a chat app doesn't re-fetch on
      // every preview refresh, while still picking up an edit within a minute.
      res.set('Cache-Control', 'public, max-age=60');
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
