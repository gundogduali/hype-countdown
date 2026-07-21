/**
 * Server-side HTML head templating for the timer-detail social share card
 * (PRD §9.1, issue SC-5).
 *
 * Why this exists in the backend, not the frontend: Hype's frontend is a
 * pure client-side React SPA, and the backend's SPA fallback
 * (`backend/src/app.js`, `if (staticDir)` block) always serves the *same*
 * static `index.html` bytes for every non-`/api` GET path. A React-side
 * `document.title`/meta update (already done for the in-browser tab title,
 * see `frontend/src/pages/TimerDetail.jsx`) never runs for a crawler that
 * doesn't execute JS (historically true for Facebook/WhatsApp link-unfurl
 * bots, inconsistent for others) — so the HTML *response itself* must
 * already contain the right tags before any JS runs. This module produces
 * that per-request HTML variant from the one in-memory `index.html` template
 * loaded once at startup (no extra disk reads per request).
 */

/** Escapes text for safe interpolation into HTML content/attribute values. */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TITLE_TAG_RE = /<title>[\s\S]*?<\/title>/i;
const DESCRIPTION_META_RE = /<meta\s+name="description"[^>]*>/i;
const HEAD_CLOSE_RE = /<\/head>/i;

/**
 * Builds the description text shown in the share preview / SPA <head>.
 * Kept short and consistent with `docs/copy.md`'s existing plain tone.
 */
function buildDescription(timer) {
  return `Countdown to ${timer.title} ${timer.emoji} — see how much time is left and share the hype.`;
}

/**
 * Returns a copy of `indexHtml` with timer-specific `<title>`, description,
 * Open Graph and Twitter Card meta tags injected/replaced in the `<head>`.
 *
 * @param {string} indexHtml the in-memory (loaded-once-at-startup) template
 * @param {{ title: string, emoji: string, slug: string }} timer
 * @param {{ pageUrl: string, imageUrl: string }} urls fully-qualified absolute URLs
 *   (crawlers fetch `og:image`/`og:url` directly, without browser context, so
 *   relative URLs would not resolve for them)
 * @returns {string}
 */
export function renderTimerHtml(indexHtml, timer, { pageUrl, imageUrl }) {
  // Match the frontend's own established convention for the in-browser tab
  // title (frontend/src/pages/TimerDetail.jsx: `${emoji} ${title} — Hype ⏳`).
  const title = escapeHtml(`${timer.emoji} ${timer.title} — Hype ⏳`);
  const description = escapeHtml(buildDescription(timer));
  const safeImageUrl = escapeHtml(imageUrl);
  const safePageUrl = escapeHtml(pageUrl);

  let html = indexHtml;

  html = TITLE_TAG_RE.test(html)
    ? html.replace(TITLE_TAG_RE, `<title>${title}</title>`)
    : html.replace(HEAD_CLOSE_RE, `<title>${title}</title>\n  </head>`);

  html = DESCRIPTION_META_RE.test(html)
    ? html.replace(DESCRIPTION_META_RE, `<meta name="description" content="${description}" />`)
    : html.replace(
        HEAD_CLOSE_RE,
        `<meta name="description" content="${description}" />\n  </head>`
      );

  const ogTags = [
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${safeImageUrl}" />`,
    `<meta property="og:url" content="${safePageUrl}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join('\n    ');

  html = html.replace(HEAD_CLOSE_RE, `${ogTags}\n  </head>`);

  return html;
}
