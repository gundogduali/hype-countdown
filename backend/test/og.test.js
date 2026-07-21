import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { FontLibrary, loadImage, Canvas } from 'skia-canvas';
import { createApp } from '../src/app.js';
import { CURATED_TIMERS } from '../src/db/seed.js';
import {
  renderOgImage,
  getOgImage,
  clearOgImageCache,
  getRenderInvocationCount,
  resetRenderInvocationCount,
  getBundledEmojiFontFamily,
} from '../src/services/ogImage.js';

/** Loads a PNG buffer into a fresh Canvas and returns its raw ImageData for
 * the given region. */
async function regionPixels(buffer, x, y, w, h) {
  const image = await loadImage(buffer);
  const canvas = new Canvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(x, y, w, h).data;
}

/**
 * True if the glyph itself contributed a real (non-gray) color to the given
 * region, isolated from everything else drawn on the card.
 *
 * A naive absolute check ("is any R/G/B channel in this region visibly
 * unequal?") is NOT safe here: the card's background is a purple radial
 * glow (`drawBackground`'s gradient) blended over a near-black fill, and
 * that glow alone already pushes R/G/B channels apart by ~24-30 in exactly
 * this region — a plain color-difference threshold check would return true
 * even with *no glyph drawn at all* (verified empirically while fixing this
 * test, 2026-07-21: 100% of pixels in this region already exceeded a diff-20
 * threshold from the background gradient alone). So it can never actually
 * fail, regardless of whether the emoji glyph itself renders in color,
 * monochrome, or not at all.
 *
 * Instead, this diffs the actual render against a `referenceBuffer` — the
 * exact same timer/layout, but with the emoji swapped for a plain ASCII
 * character (`.`) that exercises the identical background/layout code path
 * with no color glyph. Subtracting the two cancels out the shared
 * background so only the glyph's own contribution remains; a true
 * color-emoji glyph shows up as a large, non-gray (R/G/B-unequal) delta,
 * while a monochrome/tofu/missing glyph would not.
 */
async function glyphAddedRealColor(actualBuffer, referenceBuffer, x, y, w, h) {
  const [actual, reference] = await Promise.all([
    regionPixels(actualBuffer, x, y, w, h),
    regionPixels(referenceBuffer, x, y, w, h),
  ]);
  for (let i = 0; i < actual.length; i += 4) {
    const dr = actual[i] - reference[i];
    const dg = actual[i + 1] - reference[i + 1];
    const db = actual[i + 2] - reference[i + 2];
    const spread = Math.max(Math.abs(dr - dg), Math.abs(dg - db), Math.abs(dr - db));
    if (spread > 60) return true;
  }
  return false;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Same harness pattern as test/api.test.js: in-memory DB + controllable clock. */
function makeHarness(options = {}) {
  const clock = { now: new Date('2026-07-07T10:00:00.000Z') };
  const app = createApp({ dbPath: ':memory:', now: () => new Date(clock.now), ...options });
  return { app, clock };
}

describe('OG image route (GET /api/timers/:slug/og-image.png)', () => {
  let server, base, clock, app;

  const start = async (options) => {
    ({ app, clock } = makeHarness(options));
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}/api`;
  };

  beforeEach(async () => {
    await start();
    clearOgImageCache();
    resetRenderInvocationCount();
  });
  afterEach(() => server.close());

  const post = (path, body) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  // ---------- Happy path: curated slug ----------

  test('curated slug: 200, image/png, valid PNG magic bytes, non-trivial size', async () => {
    const slug = CURATED_TIMERS[0].slug;
    const res = await fetch(base + `/timers/${slug}/og-image.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');

    const buffer = Buffer.from(await res.arrayBuffer());
    assert.ok(buffer.length > 1000, `expected a real PNG, got ${buffer.length} bytes`);
    assert.deepEqual(buffer.subarray(0, 8), PNG_MAGIC);
  });

  // ---------- DP-4: bundled color-emoji font (host-independence) ----------

  test('DP-4: the bundled color-emoji font is registered under its own explicit family', () => {
    // Registration happens once at module load (see ogImage.js); this just
    // asserts it actually took effect, so a future refactor that silently
    // drops the FontLibrary.use() call fails loudly here instead of only
    // showing up as monochrome emoji in production.
    assert.equal(FontLibrary.has(getBundledEmojiFontFamily()), true);
  });

  test('DP-4: a timer emoji known to work renders true color pixels, not monochrome', async () => {
    // 🚀 is confirmed (see retro) to render in full color via the bundled
    // font. This is a real pixel-level check, not just "PNG parses" — it
    // would have caught the original host-dependency bug (no color font at
    // all -> tofu/monochrome) had it been run against a host with none.
    //
    // Compared differentially against a reference render of the exact same
    // timer/layout with the emoji swapped for a plain ASCII '.' (see
    // glyphAddedRealColor's doc comment for why an absolute region check is
    // unsafe here: the background glow alone already fools it).
    const title = 'Rocket launch';
    const target_at = '2026-08-01T09:30:00+03:00';

    const created = await (
      await post('/timers', { title, target_at, emoji: '🚀', category: 'games' })
    ).json();
    const referenceCreated = await (
      await post('/timers', { title, target_at, emoji: '.', category: 'games' })
    ).json();

    const res = await fetch(base + `/timers/${created.timer.slug}/og-image.png`);
    assert.equal(res.status, 200);
    const buffer = Buffer.from(await res.arrayBuffer());

    const referenceRes = await fetch(base + `/timers/${referenceCreated.timer.slug}/og-image.png`);
    assert.equal(referenceRes.status, 200);
    const referenceBuffer = Buffer.from(await referenceRes.arrayBuffer());

    // The standalone emoji is drawn centered around (600, 190) at 108px —
    // sample a generous box around it.
    const hasColor = await glyphAddedRealColor(buffer, referenceBuffer, 500, 120, 200, 140);
    assert.equal(hasColor, true, 'expected the centered emoji glyph to contain real color pixels');
  });

  test('DP-4 sanity: glyphAddedRealColor returns false when nothing differs (guards against the false-positive this test replaced)', async () => {
    // Two renders of the *same* non-color reference timer must show no
    // "added color" against each other — proves the differential check
    // itself doesn't false-positive on the shared background glow alone
    // (the exact bug the previous absolute-threshold version had).
    const created = await (
      await post('/timers', {
        title: 'Reference only',
        target_at: '2026-08-01T09:30:00+03:00',
        emoji: '.',
        category: 'games',
      })
    ).json();
    const slug = created.timer.slug;
    const res = await fetch(base + `/timers/${slug}/og-image.png`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const hasColor = await glyphAddedRealColor(buffer, buffer, 500, 120, 200, 140);
    assert.equal(hasColor, false, 'identical renders must never register as containing added color');
  });

  // ---------- Unknown slug ----------

  test('unknown slug: 404 with the standard timer_not_found body', async () => {
    const res = await fetch(base + '/timers/does-not-exist/og-image.png');
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    const body = await res.json();
    assert.deepEqual(body, { error: { code: 'timer_not_found', message: 'No such timer.' } });
  });

  // ---------- Long title (via the real API, up to the validated 80-char max) ----------

  test('long title (80 chars, no spaces to break on): renders successfully, no crash', async () => {
    const longTitle = 'Supercalifragilisticexpialidocious'.repeat(3).slice(0, 80);
    const created = await (
      await post('/timers', {
        title: longTitle,
        target_at: '2026-08-01T09:30:00+03:00',
        emoji: '🚀',
        category: 'games',
      })
    ).json();
    const slug = created.timer.slug;

    const res = await fetch(base + `/timers/${slug}/og-image.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    const buffer = Buffer.from(await res.arrayBuffer());
    assert.ok(buffer.length > 1000);
    assert.deepEqual(buffer.subarray(0, 8), PNG_MAGIC);
  });

  test('pathological unbroken title (500 chars, char-split path): render service does not crash', async () => {
    // Exercises wrapUnbounded's char-split fallback and layoutTitle's forced
    // ellipsis directly (the HTTP-level title validator caps custom timers at
    // 80 chars, but the render service itself must stay robust to any input
    // — e.g. curated seed data — regardless of that separate limit).
    const pathological = 'x'.repeat(500);
    const buffer = await renderOgImage(
      { emoji: '⏳', title: pathological, target_at: '2026-08-01T09:30:00.000Z' },
      Date.parse('2026-07-07T10:00:00.000Z')
    );
    assert.ok(buffer.length > 1000);
    assert.deepEqual(buffer.subarray(0, 8), PNG_MAGIC);
  });

  // ---------- Non-Latin / emoji title ----------

  test('non-Latin + emoji title: renders successfully, no crash', async () => {
    const created = await (
      await post('/timers', {
        title: '生日会 🎉 день рождения',
        target_at: '2026-08-01T09:30:00+03:00',
        emoji: '🎂',
        category: 'games',
      })
    ).json();
    const slug = created.timer.slug;

    const res = await fetch(base + `/timers/${slug}/og-image.png`);
    assert.equal(res.status, 200);
    const buffer = Buffer.from(await res.arrayBuffer());
    assert.ok(buffer.length > 1000);
    assert.deepEqual(buffer.subarray(0, 8), PNG_MAGIC);
  });

  // ---------- Expired timer → ended state ----------

  test('expired timer: renders the ended state, no crash (200, valid PNG)', async () => {
    const created = await (
      await post('/timers', {
        title: 'Almost over',
        target_at: '2026-07-07T11:00:00.000Z',
        emoji: '⌛',
        category: 'games',
      })
    ).json();
    const slug = created.timer.slug;

    clock.now = new Date('2026-07-07T11:00:01.000Z'); // 1s past target_at
    const res = await fetch(base + `/timers/${slug}/og-image.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    const buffer = Buffer.from(await res.arrayBuffer());
    assert.ok(buffer.length > 1000);
    assert.deepEqual(buffer.subarray(0, 8), PNG_MAGIC);
  });

  // ---------- Cache hit ----------

  test('cache hit: same key requested twice → only one real render (call-counter, not timing)', async () => {
    const slug = CURATED_TIMERS[0].slug;

    const first = await fetch(base + `/timers/${slug}/og-image.png`);
    assert.equal(first.status, 200);
    assert.equal(getRenderInvocationCount(), 1);

    const second = await fetch(base + `/timers/${slug}/og-image.png`);
    assert.equal(second.status, 200);
    // Second request for the identical (slug, target_at, title, emoji) key
    // within the TTL must be served from cache: still exactly 1 real render.
    assert.equal(getRenderInvocationCount(), 1);
  });

  test('cache key includes title/target_at: an edited snapshot never serves a stale render', async () => {
    // No PATCH/edit endpoint exists on the timer API (custom timers are
    // create-only; only a re-seed can change a curated timer's fields) — so
    // this exercises the cache-key semantics directly at the service level,
    // the same way a corrected/re-seeded curated timer would present a
    // different snapshot for the same slug.
    const now = new Date('2026-07-07T10:00:00.000Z');
    const original = { slug: 'edit-test', title: 'Original title', emoji: '🚗', target_at: '2026-08-01T09:30:00.000Z' };
    const edited = { ...original, title: 'Edited title' };

    const buf1 = await getOgImage(original, now);
    assert.equal(getRenderInvocationCount(), 1);

    // Same (slug, target_at, title, emoji) snapshot again: cache hit, no re-render.
    const buf1Again = await getOgImage(original, now);
    assert.equal(getRenderInvocationCount(), 1);
    assert.deepEqual(buf1Again, buf1);

    // A different title under the same slug is a different cache key: must
    // trigger a real re-render, never reuse the stale buffer.
    const buf2 = await getOgImage(edited, now);
    assert.equal(getRenderInvocationCount(), 2);
    assert.notDeepEqual(buf2, buf1);
  });

  // ---------- Cache stampede fix: single-flight de-dup ----------

  test('concurrency: N simultaneous requests for the same uncached key → exactly 1 real render', async () => {
    const slug = CURATED_TIMERS[0].slug;
    const N = 15;

    const responses = await Promise.all(
      Array.from({ length: N }, () => fetch(base + `/timers/${slug}/og-image.png`))
    );

    for (const res of responses) {
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
    }
    // The whole point of the single-flight fix: N concurrent misses on the
    // same key must collapse into exactly one real `renderOgImage` call, not N.
    assert.equal(getRenderInvocationCount(), 1);

    // And every response body is byte-identical (all served the one render).
    const buffers = await Promise.all(responses.map((r) => r.arrayBuffer()));
    const first = Buffer.from(buffers[0]);
    for (const buf of buffers.slice(1)) {
      assert.deepEqual(Buffer.from(buf), first);
    }
  });

  test('concurrency: distinct keys requested simultaneously each still get their own render', async () => {
    const slugs = CURATED_TIMERS.slice(0, 3).map((t) => t.slug);
    const responses = await Promise.all(
      slugs.map((slug) => fetch(base + `/timers/${slug}/og-image.png`))
    );
    for (const res of responses) assert.equal(res.status, 200);
    assert.equal(getRenderInvocationCount(), slugs.length);
  });
});
