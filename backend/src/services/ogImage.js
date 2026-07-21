/**
 * Social share card (Open Graph / Twitter Card) image renderer — PRD §9.1 (SC-3).
 *
 * Rendering approach: `skia-canvas` (Canvas 2D API on top of Google's Skia,
 * the same rasterizer Chrome uses) — NOT a headless browser. It was picked
 * over `sharp`/`@resvg/resvg-js`/node-`canvas` after a hands-on check: all
 * three render emoji as a flat monochrome silhouette (or nothing at all, for
 * resvg) because their text backends (librsvg/pango, resvg's own shaper, and
 * node-canvas's bundled Cairo) don't rasterize color glyph tables (macOS's
 * `sbix` format here). Skia does, so `ctx.fillText('🎉🔥⏳', …)` produces real
 * color emoji, matching what the emoji actually looks like when pasted by a
 * user. See the retro for the side-by-side screenshots.
 *
 * Font choice/fallback: the generic CSS families `sans-serif` (title, bold)
 * and `monospace` (countdown digits + labels, matching
 * frontend/src/components/Countdown.jsx's visual language) are used for
 * ordinary text, resolved by Skia through the OS font stack (Apple Color
 * Emoji / Helvetica / Menlo on macOS dev; whatever fontconfig finds on a
 * given Linux host).
 *
 * Color-emoji font (DP-4 fix, 2026-07-20): the *emoji glyphs* specifically no
 * longer rely on the OS providing a color-emoji font at all. A redistributable
 * copy of Google's Noto Color Emoji (SIL Open Font License 1.1) is bundled as
 * an npm dependency (`@fontsource/noto-color-emoji`) and registered explicitly
 * via `FontLibrary.use(EMOJI_FAMILY, [file])` below, loading the font's bytes
 * directly from the installed package rather than depending on OS font
 * discovery (fontconfig/CoreText/etc.) — this is the same mechanism
 * regardless of host, so it does not matter whether the deploy container has
 * `fonts-noto-color-emoji` (or any color-emoji font) installed at all. Every
 * font string that draws user-facing text which may contain an emoji
 * character (the standalone timer emoji, the title, the watermark, and the
 * ended-state heading) explicitly lists `"${EMOJI_FAMILY}"` as a fallback
 * family alongside the generic one, e.g. `sans-serif, "Hype Bundled Emoji"` —
 * per-glyph fallback then picks whichever listed family actually has that
 * glyph (verified directly: plain Latin text renders via `sans-serif`, the
 * emoji glyph renders in full color via the bundled family, in the same
 * string). See the retro for the verification methodology (including why a
 * "remove the OS's own emoji font" negative control isn't reproducible on
 * macOS, and what that means for what's still unverified pre-deploy).
 *
 * Known, separate limitation found while verifying the above (NOT caused by
 * this fix, and NOT specific to any one font file — reproduced identically
 * with three different font sources, including macOS's own pre-installed
 * Apple Color Emoji with zero custom registration at all): a small number of
 * emoji codepoints (confirmed: U+1F577 SPIDER 🕷️, U+26BD SOCCER BALL ⚽; not
 * exhaustively enumerated beyond that) render as a flat monochrome glyph
 * rather than color, seemingly regardless of font or host. This looks like a
 * Skia/skia-canvas glyph-rendering limitation for those specific glyphs, not
 * a missing-font problem — out of this fix's scope (registering more/other
 * fonts does not change the outcome) and flagged separately rather than
 * silently left undocumented.
 */
import { Canvas, FontLibrary } from 'skia-canvas';
import { fileURLToPath } from 'node:url';

const WIDTH = 1200;
const HEIGHT = 630;

/** Family name used to register the bundled color-emoji font below. Kept as
 * a distinctive, project-specific string (not a generic name like "Emoji")
 * so it can never accidentally collide with — and thus be satisfied by — an
 * unrelated system font of the same name. */
const EMOJI_FAMILY = 'Hype Bundled Emoji';

const emojiFontPath = fileURLToPath(
  import.meta.resolve('@fontsource/noto-color-emoji/files/noto-color-emoji-emoji-400-normal.woff2')
);
FontLibrary.use(EMOJI_FAMILY, [emojiFontPath]);

// Test-only instrumentation: counts real invocations of the (expensive) Skia
// render pipeline below, so tests can assert "exactly one real render
// happened" via a counter instead of trusting timing (flaky) — see
// `getRenderInvocationCount`/`resetRenderInvocationCount` and
// backend/test/og.test.js's cache-hit and stampede tests.
let _renderInvocationCount = 0;

const COLORS = {
  bg: '#0a0a12',
  glow: '#a855f7',
  surface2: '#1a1a28',
  borderStrong: '#3d3d58',
  text: '#f5f5fa',
  text2: '#a3a3bd',
  text3: '#70708c',
  purple: '#a855f7',
  pink: '#ec4899',
  cyan: '#06b6d4',
};

const TITLE_MAX_WIDTH = 980;
const TITLE_MAX_LINES = 2;
const TITLE_MAX_SIZE = 58;
const TITLE_MIN_SIZE = 32;

/** Draws letters with extra tracking (canvas has no letter-spacing), centered on cx. */
function fillTrackedText(ctx, text, cx, y, spacing) {
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, w) => a + w, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x, y);
    x += widths[i] + spacing;
  }
  ctx.textAlign = prevAlign;
}

/** Greedy word wrap; falls back to character-splitting for unbroken long "words". */
function wrapUnbounded(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      // Word itself may still be wider than maxWidth (long unbroken token,
      // e.g. no-space title, CJK run) — split it by character in that case.
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }
      // current is empty and the single word overflows: char-split it.
      let piece = '';
      for (const ch of word) {
        const test = piece + ch;
        if (ctx.measureText(test).width > maxWidth && piece) {
          lines.push(piece);
          piece = ch;
        } else {
          piece = test;
        }
      }
      current = piece;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Always appends an ellipsis (trimming characters as needed to fit
 * maxWidth) — used when we know content is being dropped (more wrapped
 * lines than we can show), so the truncation is visually indicated even if
 * this particular line's own text would otherwise fit maxWidth on its own.
 * (Bug fixed 2026-07-20: a naturally-broken wrap line that already fit
 * maxWidth was previously left without a "…", silently cutting the title
 * with no visual cue that it had been truncated.)
 */
function forceEllipsis(ctx, text, maxWidth) {
  const withEllipsis = `${text}…`;
  if (ctx.measureText(withEllipsis).width <= maxWidth) return withEllipsis;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${text.slice(0, mid).trimEnd()}…`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

/**
 * Picks the largest font size (within TITLE_MIN_SIZE..TITLE_MAX_SIZE) whose
 * greedy wrap fits within TITLE_MAX_LINES lines of TITLE_MAX_WIDTH; if even
 * the minimum size doesn't fit in 2 lines (pathological very-long title),
 * wraps to 2 lines anyway and ellipsizes the 2nd line as a last resort
 * (never overflows the canvas — Rule 5).
 */
function layoutTitle(ctx, title) {
  for (let size = TITLE_MAX_SIZE; size >= TITLE_MIN_SIZE; size -= 2) {
    ctx.font = `bold ${size}px sans-serif, "${EMOJI_FAMILY}"`;
    const lines = wrapUnbounded(ctx, title, TITLE_MAX_WIDTH);
    if (lines.length <= TITLE_MAX_LINES) {
      return { fontSize: size, lines };
    }
  }
  ctx.font = `bold ${TITLE_MIN_SIZE}px sans-serif, "${EMOJI_FAMILY}"`;
  const forced = wrapUnbounded(ctx, title, TITLE_MAX_WIDTH);
  const lines = forced.slice(0, TITLE_MAX_LINES);
  if (forced.length > TITLE_MAX_LINES) {
    // Content beyond TITLE_MAX_LINES is being dropped — always mark it with
    // "…", even if this specific wrapped line's own text already fits
    // maxWidth (it would otherwise look like a complete, un-truncated line).
    lines[TITLE_MAX_LINES - 1] = forceEllipsis(ctx, lines[TITLE_MAX_LINES - 1], TITLE_MAX_WIDTH);
  }
  return { fontSize: TITLE_MIN_SIZE, lines };
}

function drawBackground(ctx) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Soft radial purple glow, mimicking .glow-detail: ~16% opacity at center,
  // centered ~50%/55%, fading to transparent.
  const cx = WIDTH * 0.5;
  const cy = HEIGHT * 0.55;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(WIDTH, HEIGHT) * 0.6);
  gradient.addColorStop(0, 'rgba(168, 85, 247, 0.16)');
  gradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawWatermark(ctx) {
  const label = '⏳ Hype';
  ctx.font = `600 22px sans-serif, "${EMOJI_FAMILY}"`;
  const textWidth = ctx.measureText(label).width;
  const paddingX = 20;
  const paddingY = 12;
  const chipWidth = textWidth + paddingX * 2;
  const chipHeight = 22 + paddingY * 2;
  const margin = 32;
  const x = WIDTH - margin - chipWidth;
  const y = HEIGHT - margin - chipHeight;
  const radius = chipHeight / 2;

  ctx.fillStyle = COLORS.surface2;
  ctx.strokeStyle = COLORS.borderStrong;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, chipWidth, chipHeight, radius);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + paddingX, y + chipHeight / 2 + 1);
}

/** Whole days/hours/minutes remaining — no seconds (a static image showing
 * seconds would look stale within moments). Same unit math as the frontend's
 * getRemaining() (frontend/src/lib/time.js): days = total days, hours/minutes
 * are the remainder within their parent unit. */
function computeRemaining(targetMs, nowMs) {
  const diff = Math.max(0, targetMs - nowMs);
  const totalMinutes = Math.floor(diff / 60000);
  return {
    days: Math.floor(totalMinutes / (24 * 60)),
    hours: Math.floor(totalMinutes / 60) % 24,
    minutes: totalMinutes % 60,
  };
}

function drawCountdownRow(ctx, remaining, centerY) {
  const units = [
    { value: remaining.days, label: 'DAYS' },
    { value: remaining.hours, label: 'HOURS' },
    { value: remaining.minutes, label: 'MINUTES' },
  ];
  const valueFont = 'bold 72px monospace';
  const labelFont = '600 20px monospace';
  const sepFont = '300 56px monospace';
  const gap = 48; // between blocks (value+label) and separators

  ctx.textAlign = 'center';

  // Measure each block's width (max of value text and tracked label width).
  const blocks = units.map((u) => {
    ctx.font = valueFont;
    const valueText = String(u.value).padStart(2, '0');
    const valueWidth = ctx.measureText(valueText).width;
    ctx.font = labelFont;
    const chars = Array.from(u.label);
    const labelSpacing = 4;
    const labelWidth =
      chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + labelSpacing * (chars.length - 1);
    return { ...u, valueText, width: Math.max(valueWidth, labelWidth), labelSpacing };
  });

  ctx.font = sepFont;
  const sepWidth = ctx.measureText(':').width;

  const totalWidth =
    blocks.reduce((a, b) => a + b.width, 0) + sepWidth * 2 + gap * (blocks.length - 1 + 2);
  let x = WIDTH / 2 - totalWidth / 2;

  const valueBaseline = centerY;
  const labelBaseline = centerY + 44;

  blocks.forEach((b, i) => {
    const bx = x + b.width / 2;
    ctx.font = valueFont;
    ctx.fillStyle = COLORS.text;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(b.valueText, bx, valueBaseline);

    ctx.font = labelFont;
    ctx.fillStyle = COLORS.text3;
    fillTrackedText(ctx, b.label, bx, labelBaseline, b.labelSpacing);

    x += b.width + gap;
    if (i < blocks.length - 1) {
      ctx.font = sepFont;
      ctx.fillStyle = COLORS.text3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(':', x + sepWidth / 2, valueBaseline - 6);
      x += sepWidth + gap;
    }
  });
}

function drawEndedState(ctx, centerY) {
  const heading = "🎉 It's time!";
  ctx.font = `bold 56px sans-serif, "${EMOJI_FAMILY}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const headingWidth = ctx.measureText(heading).width;
  const x0 = WIDTH / 2 - headingWidth / 2;
  const x1 = WIDTH / 2 + headingWidth / 2;
  const gradient = ctx.createLinearGradient(x0, 0, x1, 0);
  gradient.addColorStop(0, COLORS.purple);
  gradient.addColorStop(0.5, COLORS.pink);
  gradient.addColorStop(1, COLORS.cyan);
  ctx.fillStyle = gradient;
  ctx.fillText(heading, WIDTH / 2, centerY);

  ctx.font = '600 22px monospace';
  ctx.fillStyle = COLORS.text3;
  fillTrackedText(ctx, 'THE WAIT IS OVER', WIDTH / 2, centerY + 48, 4);
}

/**
 * Renders the share card PNG for one timer snapshot.
 * @param {{ emoji: string, title: string, target_at: string }} timer
 * @param {number} nowMs server-clock "now" in ms (PRD/API convention: the
 *   expired decision is always made with the server clock, never the client's).
 * @returns {Promise<Buffer>}
 */
export async function renderOgImage(timer, nowMs) {
  _renderInvocationCount += 1;
  const canvas = new Canvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx);

  // Emoji, large, centered near the top.
  ctx.font = `108px sans-serif, "${EMOJI_FAMILY}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(timer.emoji || '⏳', WIDTH / 2, 190);

  // Title: bold, wraps to up to 2 lines, shrinks rather than truncating
  // when 2 lines still isn't enough for a very long title.
  const { fontSize, lines } = layoutTitle(ctx, timer.title);
  ctx.font = `bold ${fontSize}px sans-serif, "${EMOJI_FAMILY}"`;
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const lineHeight = fontSize * 1.22;
  const titleTop = 280;
  lines.forEach((line, i) => {
    ctx.fillText(line, WIDTH / 2, titleTop + i * lineHeight);
  });

  const targetMs = Date.parse(timer.target_at);
  const contentCenterY = titleTop + lines.length * lineHeight + 90;

  if (Number.isNaN(targetMs) || targetMs <= nowMs) {
    drawEndedState(ctx, contentCenterY);
  } else {
    const remaining = computeRemaining(targetMs, nowMs);
    drawCountdownRow(ctx, remaining, contentCenterY);
  }

  drawWatermark(ctx);

  return canvas.toBuffer('png');
}

// --- In-memory cache -------------------------------------------------------
//
// Cache key: `${slug}::${target_at}::${title}::${emoji}` — a timer edit (or a
// curated timer being re-seeded with a new title/date/emoji) changes the key,
// so the old rendered PNG is simply never looked up again (never served
// stale on edit). A short TTL (60s, matching the image's minute-level
// display granularity — no seconds are shown) additionally re-renders a
// *reused* key so the displayed remaining time doesn't visibly freeze for a
// timer that nobody edits for a long time. Capacity-bounded LRU (simple
// Map-based: re-inserting on access moves an entry to "most recent").

const CACHE_CAPACITY = 200;
const CACHE_TTL_MS = 60_000;

const cache = new Map(); // key -> { buffer, renderedAtMs }

// Single-flight de-dup: on a cache miss, the *first* concurrent caller for a
// given key stores its in-progress render Promise here; every other
// concurrent caller for the same key awaits that same Promise instead of
// starting its own `renderOgImage` (fixes the cache-stampede found in the
// 2026-07-20 code review: 15 concurrent misses previously triggered 15 full
// renders). Cleared (success or failure) as soon as the render settles, at
// which point the result has already been written to `cache` by the winner
// (or, on failure, the next request simply retries a fresh render).
const inFlight = new Map(); // key -> Promise<Buffer>

function cacheKey(timer) {
  return `${timer.slug}::${timer.target_at}::${timer.title}::${timer.emoji}`;
}

function cacheGet(key, nowMs) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (nowMs - entry.renderedAtMs > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  // Refresh LRU order.
  cache.delete(key);
  cache.set(key, entry);
  return entry.buffer;
}

function cacheSet(key, buffer, nowMs) {
  cache.set(key, { buffer, renderedAtMs: nowMs });
  while (cache.size > CACHE_CAPACITY) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

/**
 * Cached render entry point used by the route.
 * @param {{ slug: string, emoji: string, title: string, target_at: string }} timer
 * @param {Date} nowDate server clock "now"
 * @returns {Promise<Buffer>}
 */
export async function getOgImage(timer, nowDate) {
  const nowMs = nowDate.getTime();
  const key = cacheKey(timer);
  const cached = cacheGet(key, nowMs);
  if (cached) return cached;

  // Single-flight: join an already-in-progress render for this exact key
  // rather than starting a redundant one.
  const existing = inFlight.get(key);
  if (existing) return existing;

  const renderPromise = (async () => {
    try {
      const buffer = await renderOgImage(timer, nowMs);
      cacheSet(key, buffer, nowMs);
      return buffer;
    } finally {
      // Only the owner of this in-flight entry clears it; guards against a
      // pathological case where the map already moved on to a newer promise
      // for the same key (shouldn't happen given we set it synchronously
      // below, but keeps this robust to future refactors).
      if (inFlight.get(key) === renderPromise) {
        inFlight.delete(key);
      }
    }
  })();
  inFlight.set(key, renderPromise);
  return renderPromise;
}

/** Test/ops helper: drops all cached renders (and any in-flight entries). */
export function clearOgImageCache() {
  cache.clear();
  inFlight.clear();
}

/** Test-only: how many times the real Skia render pipeline has run so far. */
export function getRenderInvocationCount() {
  return _renderInvocationCount;
}

/** Test-only: resets the render-invocation counter to 0. */
export function resetRenderInvocationCount() {
  _renderInvocationCount = 0;
}

/** Test-only: the bundled color-emoji font's registered family name, so a
 * test can assert `FontLibrary.has(getBundledEmojiFontFamily())` directly
 * instead of hard-coding the string (DP-4). */
export function getBundledEmojiFontFamily() {
  return EMOJI_FAMILY;
}
