import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

  test('SPA fallback: unknown non-/api GET paths return index.html', async () => {
    for (const path of ['/t/gta-6', '/create', '/no/such/page']) {
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
