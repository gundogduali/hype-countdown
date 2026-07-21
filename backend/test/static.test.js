import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

/**
 * Static serving (STATIC_DIR / createApp({ staticDir })) — production mode
 * where Express serves the built frontend next to the API.
 */
describe('static serving (staticDir set)', () => {
  let server, base, dir;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'hype-static-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Hype</title>');
    writeFileSync(join(dir, 'favicon.svg'), '<svg></svg>');
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'index-Abc123XY.js'), 'console.log("hype")');

    const app = createApp({ dbPath: ':memory:', staticDir: dir });
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('GET / returns index.html with no-cache', async () => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    assert.match(await res.text(), /<title>Hype<\/title>/);
  });

  // Note: `/t/gta-6` is deliberately NOT used here — `gta-6` is a real
  // curated seed slug (default seed=true), so per SC-5 it now gets the
  // templated meta-tag variant, not the raw index.html. That behavior is
  // covered in its own describe block below. `/t/no-such-timer-slug` here
  // stands in as an unknown-slug `/t/:slug` case, which is unaffected.
  test('SPA fallback: unknown non-/api GET paths return index.html', async () => {
    for (const path of ['/t/no-such-timer-slug', '/create', '/no/such/page']) {
      const res = await fetch(base + path);
      assert.equal(res.status, 200, path);
      assert.match(res.headers.get('content-type'), /text\/html/, path);
      assert.equal(res.headers.get('cache-control'), 'no-cache', path);
      assert.match(await res.text(), /<title>Hype<\/title>/, path);
    }
  });

  test('hashed assets get long immutable cache', async () => {
    const res = await fetch(base + '/assets/index-Abc123XY.js');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  });

  test('un-hashed root files are served with no-cache', async () => {
    const res = await fetch(base + '/favicon.svg');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
  });

  test('missing asset falls back to index.html (SPA), not JSON 404', async () => {
    const res = await fetch(base + '/assets/nope.js');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
  });

  test('API still works and API 404s stay JSON, never index.html', async () => {
    const list = await fetch(base + '/api/timers');
    assert.equal(list.status, 200);
    assert.match(list.headers.get('content-type'), /application\/json/);
    const body = await list.json();
    assert.ok(Array.isArray(body.timers));
    assert.ok(body.serverNow);

    // Unknown slug → timer_not_found; unknown API path → not_found (docs/api.md).
    const cases = [
      ['/api/timers/nope', 'timer_not_found'],
      ['/api/nope', 'not_found'],
      ['/api', 'not_found'],
    ];
    for (const [path, code] of cases) {
      const res = await fetch(base + path);
      assert.equal(res.status, 404, path);
      assert.match(res.headers.get('content-type'), /application\/json/, path);
      const err = await res.json();
      assert.equal(err.error.code, code, path);
    }
  });

  test('non-GET on a non-API path is JSON 404, not SPA fallback', async () => {
    const res = await fetch(base + '/t/gta-6', { method: 'POST' });
    assert.equal(res.status, 404);
    const err = await res.json();
    assert.equal(err.error.code, 'not_found');
  });
});

/**
 * SC-5: server-side social share card meta tags injected into `/t/:slug`
 * responses (crawlers don't run client-side JS, so the HTML response itself
 * must already carry og: / twitter: tags — see backend/src/services/htmlTemplate.js).
 */
describe('static serving: /t/:slug social share meta tags (SC-5)', () => {
  let server, base, dir, app;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'hype-static-sc5-'));
    // A realistic template: real <title> tag + a description meta, like the
    // actual frontend/index.html, so both the "replace existing tag" and
    // "append new tag" code paths in htmlTemplate.js are exercised.
    writeFileSync(
      join(dir, 'index.html'),
      [
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <meta name="description" content="Hype — a premium countdown site." />',
        "    <title>Hype ⏳ — Countdown to what's next</title>",
        '  </head>',
        '  <body>',
        '    <div id="root"></div>',
        '  </body>',
        '</html>',
      ].join('\n')
    );
    mkdirSync(join(dir, 'assets'));

    app = createApp({ dbPath: ':memory:', staticDir: dir });
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('known curated slug: HTML contains timer-specific og/twitter tags with absolute URLs', async () => {
    const res = await fetch(base + '/t/gta-6');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();

    assert.match(html, /<title>🎮 GTA 6 Release — Hype ⏳<\/title>/);
    assert.match(
      html,
      /<meta name="description" content="Countdown to GTA 6 Release 🎮[^"]*" \/>/
    );
    assert.match(html, /<meta property="og:title" content="🎮 GTA 6 Release — Hype ⏳" \/>/);
    assert.match(html, /<meta property="og:description" content="[^"]+" \/>/);
    assert.match(
      html,
      new RegExp(
        `<meta property="og:image" content="${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/timers/gta-6/og-image\\.png" />`
      )
    );
    assert.match(
      html,
      new RegExp(
        `<meta property="og:url" content="${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/t/gta-6" />`
      )
    );
    assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);

    // og:image is a fully-qualified absolute URL (scheme+host+path), not relative.
    const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)" \/>/);
    assert.ok(ogImageMatch, 'og:image tag present');
    assert.match(ogImageMatch[1], /^https?:\/\/127\.0\.0\.1:\d+\/api\/timers\/gta-6\/og-image\.png$/);
  });

  test('HTML-special characters in a user-supplied title are escaped, not injected raw', async () => {
    const service = app.locals.service;
    const timer = service.createCustom({
      title: `<script>alert("xss")</script> & "quoted" <b>bold</b>`,
      target_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      emoji: '🎉',
    });

    const res = await fetch(base + `/t/${timer.slug}`);
    assert.equal(res.status, 200);
    const html = await res.text();

    // The raw, unescaped payload must never appear in the response.
    assert.ok(!html.includes('<script>alert("xss")</script>'), 'raw <script> tag must not appear');
    assert.ok(!html.includes('<b>bold</b>'), 'raw <b> tag must not appear unescaped');

    // The escaped form must appear (in the title and/or og tags).
    assert.ok(html.includes('&lt;script&gt;'), 'escaped <script> should be present');
    assert.ok(html.includes('&amp;'), 'escaped & should be present');
    assert.ok(html.includes('&quot;quoted&quot;'), 'escaped quotes should be present');
  });

  test('unknown slug at /t/:slug still returns the normal static index.html', async () => {
    const res = await fetch(base + '/t/no-such-timer-at-all');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<title>Hype ⏳ — Countdown to what's next<\/title>/);
    assert.ok(!html.includes('og:title'), 'unknown slug must not get og tags');
  });

  test('non-timer paths are byte-identical to the static index.html (unaffected by SC-5)', async () => {
    const raw = readFileSync(join(dir, 'index.html'), 'utf8');
    for (const path of ['/', '/create', '/no/such/page']) {
      const res = await fetch(base + path);
      assert.equal(res.status, 200, path);
      const html = await res.text();
      assert.equal(html, raw, `${path} must be byte-identical to the static index.html`);
    }
  });
});

describe('static serving disabled (default)', () => {
  test('GET / returns JSON 404 when staticDir is unset', async () => {
    const app = createApp({ dbPath: ':memory:' });
    const server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
      assert.equal(res.status, 404);
      const err = await res.json();
      assert.equal(err.error.code, 'not_found');
    } finally {
      server.close();
    }
  });
});
