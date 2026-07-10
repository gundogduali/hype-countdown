import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/app.js';
import { CURATED_TIMERS, seedCuratedTimers } from '../src/db/seed.js';
import { openDb } from '../src/db/index.js';
import { randomSlug, CATEGORIES } from '../src/services/timers.js';

/** Test harness: in-memory DB + controllable clock + real HTTP server. */
function makeHarness(options = {}) {
  const clock = { now: new Date('2026-07-07T10:00:00.000Z') };
  const app = createApp({ dbPath: ':memory:', now: () => new Date(clock.now), ...options });
  return { app, clock };
}

describe('Hype API', () => {
  let server, base, clock, app;

  const start = async (options) => {
    ({ app, clock } = makeHarness(options));
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}/api`;
  };

  beforeEach(() => start());
  afterEach(() => server.close());

  const post = (path, body, headers = {}) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  const validCustom = {
    title: 'My driving test',
    target_at: '2026-08-01T09:30:00+03:00',
    emoji: '🚗',
  };

  // ---------- GET /api/timers (list) ----------

  test('list: all curated + future timers, target_at ASC, serverNow present', async () => {
    const res = await fetch(base + '/timers');
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.serverNow, clock.now.toISOString());
    const future = CURATED_TIMERS.filter((t) => Date.parse(t.target_at) > clock.now.getTime());
    assert.equal(body.timers.length, future.length);
    // ordering: nearest first
    const targets = body.timers.map((t) => t.target_at);
    assert.deepEqual(targets, [...targets].sort());
    // first item: the 2026-07-19 final (nearest after 07-07 at 10:00)
    assert.equal(body.timers[0].slug, 'world-cup-2026-final');
    // schema
    const t = body.timers[0];
    assert.deepEqual(Object.keys(t).sort(), [
      'category', 'created_at', 'emoji', 'is_curated', 'slug', 'target_at', 'title',
    ]);
    assert.equal(t.is_curated, true);
  });

  test('list: category filter works; empty category = no filter', async () => {
    for (const cat of CATEGORIES) {
      const body = await (await fetch(base + `/timers?category=${cat}`)).json();
      assert.ok(body.timers.length > 0, `category must not be empty: ${cat}`);
      assert.ok(body.timers.every((t) => t.category === cat));
    }
    const all = await (await fetch(base + '/timers?category=')).json();
    const noFilter = await (await fetch(base + '/timers')).json();
    assert.equal(all.timers.length, noFilter.timers.length);
  });

  test('list: invalid category → 400 invalid_category', async () => {
    const res = await fetch(base + '/timers?category=food');
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'invalid_category');
    assert.ok(body.error.message);
  });

  test('list: repeated category parameter (array) → 400 invalid_category', async () => {
    // Express turns ?category=a&category=b into an array; it must be rejected
    // instead of silently returning the unfiltered list.
    const res = await fetch(base + '/timers?category=games&category=sports');
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'invalid_category');
  });

  test('list: expired curated timer drops off the list (by server clock)', async () => {
    const before = (await (await fetch(base + '/timers')).json()).timers;
    assert.ok(before.some((t) => t.slug === 'world-cup-2026-final'));

    clock.now = new Date('2026-07-19T19:00:01.000Z'); // final is over
    const after = (await (await fetch(base + '/timers')).json()).timers;
    assert.ok(!after.some((t) => t.slug === 'world-cup-2026-final'));
    assert.equal(after.length, before.length - 1);
  });

  test('list: custom timers NEVER appear in the list (even with a category)', async () => {
    const created = await (
      await post('/timers', { ...validCustom, category: 'games' })
    ).json();
    assert.equal(created.timer.is_curated, false);

    const all = (await (await fetch(base + '/timers')).json()).timers;
    const games = (await (await fetch(base + '/timers?category=games')).json()).timers;
    assert.ok(!all.some((t) => t.slug === created.timer.slug));
    assert.ok(!games.some((t) => t.slug === created.timer.slug));
    assert.ok(all.every((t) => t.is_curated === true));
  });

  // ---------- GET /api/timers/:slug ----------

  test('slug: curated timer is readable + serverNow', async () => {
    const res = await fetch(base + '/timers/gta-6');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.serverNow, clock.now.toISOString());
    assert.equal(body.timer.title, 'GTA 6 Release');
    assert.equal(body.timer.category, 'games');
    assert.equal(body.timer.is_curated, true);
    assert.equal(body.timer.target_at, '2026-11-19T00:00:00.000Z');
  });

  test('slug: expired timer is still readable in detail (ended state is client work)', async () => {
    clock.now = new Date('2027-01-05T00:00:00.000Z');
    const res = await fetch(base + '/timers/christmas-2026');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.timer.slug, 'christmas-2026');
    assert.ok(Date.parse(body.timer.target_at) < Date.parse(body.serverNow));
  });

  test('slug: custom timer is readable by slug', async () => {
    const created = (await (await post('/timers', validCustom)).json()).timer;
    const res = await fetch(base + `/timers/${created.slug}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.timer, created);
  });

  test('slug: unknown slug → 404 timer_not_found', async () => {
    const res = await fetch(base + '/timers/no-such-thing');
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, 'timer_not_found');
    assert.ok(body.error.message);
  });

  // ---------- POST /api/timers ----------

  test('POST: valid custom timer → 201, offset date normalized to UTC, random slug', async () => {
    const res = await post('/timers', validCustom);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.serverNow, clock.now.toISOString());

    const t = body.timer;
    assert.match(t.slug, /^[a-z0-9]{10}$/);
    assert.equal(t.title, 'My driving test');
    assert.equal(t.emoji, '🚗');
    assert.equal(t.category, null);
    assert.equal(t.is_curated, false);
    assert.equal(t.target_at, '2026-08-01T06:30:00.000Z'); // +03:00 → UTC
    assert.equal(t.created_at, clock.now.toISOString());
  });

  test('POST: missing emoji defaults to ⏳, provided category is stored', async () => {
    const body = await (
      await post('/timers', {
        title: 'Match day',
        target_at: '2026-12-01T18:00:00Z',
        category: 'sports',
      })
    ).json();
    assert.equal(body.timer.emoji, '⏳');
    assert.equal(body.timer.category, 'sports');
  });

  test('POST: title validations → 400 invalid_title', async () => {
    const cases = [
      {}, // missing
      { title: '' },
      { title: '   ' }, // whitespace only
      { title: 'x'.repeat(81) }, // too long
      { title: 42 }, // wrong type
      { title: null },
    ];
    for (const c of cases) {
      const res = await post('/timers', { target_at: '2026-12-01T18:00:00Z', ...c });
      assert.equal(res.status, 400, `case: ${JSON.stringify(c)}`);
      assert.equal((await res.json()).error.code, 'invalid_title');
    }
    // boundary: exactly 80 chars is valid
    const ok = await post('/timers', { title: 'x'.repeat(80), target_at: '2026-12-01T18:00:00Z' });
    assert.equal(ok.status, 201);
  });

  test('POST: date validations → 400 invalid_target_at / target_in_past', async () => {
    const badFormat = [
      undefined,
      '',
      'tomorrow',
      '2026-12-01', // no time
      '2026-12-01T18:00:00', // no timezone — ambiguous, rejected
      1735689600000, // number
    ];
    for (const target_at of badFormat) {
      const res = await post('/timers', { title: 'Attempt', target_at });
      assert.equal(res.status, 400, `case: ${JSON.stringify(target_at)}`);
      assert.equal((await res.json()).error.code, 'invalid_target_at');
    }

    for (const past of ['2020-01-01T00:00:00Z', clock.now.toISOString()]) {
      const res = await post('/timers', { title: 'Attempt', target_at: past });
      assert.equal(res.status, 400, `case: ${past}`);
      assert.equal((await res.json()).error.code, 'target_in_past');
    }

    // high-precision fractional seconds are valid ISO → accepted
    const micro = await post('/timers', { title: 'Attempt', target_at: '2026-12-01T18:00:00.123456Z' });
    assert.equal(micro.status, 201);
  });

  test('POST: target_at beyond +100 years → 400 invalid_target_at; within cap accepted', async () => {
    // clock 2026-07-07T10:00Z → clearly above the +100 year cap
    const res = await post('/timers', { title: 'Far future', target_at: '2130-01-01T00:00:00Z' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'invalid_target_at');

    // clearly below the cap (+99 years) is valid
    const ok = await post('/timers', { title: 'Near future', target_at: '2125-07-07T10:00:00Z' });
    assert.equal(ok.status, 201);

    // exact boundary: the cap moment is accepted (<=), 1s beyond is rejected (> semantics regression)
    const capMs = clock.now.getTime() + 100 * 365.25 * 24 * 60 * 60_000;
    const atCap = await post('/timers', {
      title: 'At the cap', target_at: new Date(capMs).toISOString(),
    });
    assert.equal(atCap.status, 201);
    const overCap = await post('/timers', {
      title: 'Over the cap', target_at: new Date(capMs + 1000).toISOString(),
    });
    assert.equal(overCap.status, 400);
    assert.equal((await overCap.json()).error.code, 'invalid_target_at');
  });

  test('POST: non-object JSON body → 400 invalid_body / invalid_json', async () => {
    const send = (raw) =>
      fetch(base + '/timers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: raw,
      });

    // array: valid JSON, express.json accepts it → service says invalid_body
    let res = await send('[1,2]');
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'invalid_body');

    // primitives: express.json in strict mode rejects at the parser level → invalid_json
    for (const raw of ['null', '"text"', '42']) {
      res = await send(raw);
      assert.equal(res.status, 400, `case: ${raw}`);
      assert.equal((await res.json()).error.code, 'invalid_json', `case: ${raw}`);
    }
  });

  test('POST: category "" and null → stored as uncategorized (null)', async () => {
    for (const category of ['', null]) {
      const res = await post('/timers', {
        title: 'Uncategorized', target_at: '2026-12-01T18:00:00Z', category,
      });
      assert.equal(res.status, 201, `case: ${JSON.stringify(category)}`);
      assert.equal((await res.json()).timer.category, null);
    }
  });

  test('POST: invalid category/emoji → 400', async () => {
    let res = await post('/timers', { ...validCustom, category: 'music' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'invalid_category');

    // the three cases from the contract row: not a string / empty / too long
    for (const emoji of [42, '', '   ', 'a way too long emoji value']) {
      res = await post('/timers', { ...validCustom, emoji });
      assert.equal(res.status, 400, `emoji case: ${JSON.stringify(emoji)}`);
      assert.equal((await res.json()).error.code, 'invalid_emoji', `emoji case: ${JSON.stringify(emoji)}`);
    }
  });

  test('POST: body over 100KB → 413 payload_too_large', async () => {
    // express.json limit is 100kb; QA B-1: uncaught it used to return 500.
    const res = await post('/timers', {
      title: 'Bloated',
      target_at: '2026-12-01T18:00:00Z',
      pad: 'x'.repeat(150 * 1024),
    });
    assert.equal(res.status, 413);
    const body = await res.json();
    assert.equal(body.error.code, 'payload_too_large');
    assert.ok(body.error.message);

    // bodies under the limit are unaffected (backwards compatible)
    const ok = await post('/timers', {
      title: 'Normal size',
      target_at: '2026-12-01T18:00:00Z',
      pad: 'x'.repeat(10 * 1024),
    });
    assert.equal(ok.status, 201);
  });

  test('POST: malformed JSON → 400 invalid_json', async () => {
    const res = await fetch(base + '/timers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{broken',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'invalid_json');
  });

  // ---------- Rate limit ----------

  test('rate limit: 429 + Retry-After when exceeded; reopens after the window', async () => {
    server.close();
    await start({ rateLimit: { limit: 3, windowMs: 60 * 60_000 } });

    for (let i = 0; i < 3; i++) {
      const res = await post('/timers', { ...validCustom, title: `Timer ${i}` });
      assert.equal(res.status, 201, `request ${i} must be within the limit`);
    }
    const blocked = await post('/timers', validCustom);
    assert.equal(blocked.status, 429);
    const body = await blocked.json();
    assert.equal(body.error.code, 'rate_limited');
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);

    // rate limit does not affect GETs
    assert.equal((await fetch(base + '/timers')).status, 200);

    // reopens once the window has passed
    clock.now = new Date(clock.now.getTime() + 61 * 60_000);
    const again = await post('/timers', { ...validCustom, target_at: '2026-12-01T18:00:00Z' });
    assert.equal(again.status, 201);
  });

  test('trust proxy: with TRUST_PROXY=1 the rate limit keys on the X-Forwarded-For IP; ignored when off', async (t) => {
    const postAs = (ip, title) =>
      post('/timers', { ...validCustom, title }, { 'X-Forwarded-For': ip });

    // Default (off): different XFF values collapse onto the same socket IP → 2nd request 429
    server.close();
    await start({ rateLimit: { limit: 1 } });
    assert.equal((await postAs('1.1.1.1', 'a')).status, 201);
    assert.equal((await postAs('2.2.2.2', 'b')).status, 429);

    // TRUST_PROXY=1: each XFF IP gets its own bucket → different IP 201, same IP 429
    process.env.TRUST_PROXY = '1';
    t.after(() => delete process.env.TRUST_PROXY);
    server.close();
    await start({ rateLimit: { limit: 1 } });
    assert.equal((await postAs('1.1.1.1', 'a')).status, 201);
    assert.equal((await postAs('2.2.2.2', 'b')).status, 201);
    assert.equal((await postAs('1.1.1.1', 'c')).status, 429);

    // TRUST_PROXY=true (common user mistake) must not crash the server:
    // it is converted to 1 hop, XFF is still honored.
    process.env.TRUST_PROXY = 'true';
    server.close();
    await start({ rateLimit: { limit: 1 } });
    assert.equal((await postAs('3.3.3.3', 'a')).status, 201);
    assert.equal((await postAs('3.3.3.3', 'b')).status, 429);
    assert.equal((await postAs('4.4.4.4', 'c')).status, 201);

    // Security regression: "true" must not trust the whole XFF chain (boolean
    // true would let a client spoof the leftmost entry to bypass the limit).
    // With 1-hop semantics the IP is the LAST entry in the chain (added by the
    // proxy); even if the fake leftmost entry changes, the same client gets 429.
    assert.equal((await postAs('6.6.6.6, 5.5.5.5', 'a')).status, 201);
    assert.equal((await postAs('7.7.7.7, 5.5.5.5', 'b')).status, 429);
  });

  // ---------- Seed ----------

  test('seed idempotent: re-running never duplicates, corrections are applied', () => {
    const db = openDb(':memory:');
    seedCuratedTimers(db);
    seedCuratedTimers(db);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM timers').get();
    assert.equal(n, CURATED_TIMERS.length);

    // a date correction reaches the row via upsert
    db.prepare("UPDATE timers SET target_at = '2000-01-01T00:00:00.000Z' WHERE slug = 'gta-6'").run();
    seedCuratedTimers(db);
    const row = db.prepare("SELECT target_at FROM timers WHERE slug = 'gta-6'").get();
    assert.equal(row.target_at, '2026-11-19T00:00:00.000Z');
  });

  test('seed: obsolete curated slugs are removed; custom rows are never touched', () => {
    const db = openDb(':memory:');
    // A curated row whose slug fell out of the list (e.g. a pre-v2.1 Turkish slug)
    db.prepare(`
      INSERT INTO timers (slug, title, emoji, category, target_at, is_curated, created_at)
      VALUES ('yilbasi-2027', 'Old New Year', '🎆', 'holidays', '2026-12-31T21:00:00.000Z', 1, '2026-07-07T00:00:00.000Z')
    `).run();
    // A custom row that must survive
    db.prepare(`
      INSERT INTO timers (slug, title, emoji, category, target_at, is_curated, created_at)
      VALUES ('abc123xyz0', 'My custom timer', '⏳', NULL, '2026-12-31T21:00:00.000Z', 0, '2026-07-07T00:00:00.000Z')
    `).run();

    seedCuratedTimers(db);

    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM timers WHERE slug = 'yilbasi-2027'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM timers WHERE is_curated = 1").get().n, CURATED_TIMERS.length);
    const custom = db.prepare("SELECT title FROM timers WHERE slug = 'abc123xyz0'").get();
    assert.equal(custom.title, 'My custom timer');
  });

  test('seed: every row has a valid category + UTC ISO date + unique slug', () => {
    const slugs = new Set(CURATED_TIMERS.map((t) => t.slug));
    assert.equal(slugs.size, CURATED_TIMERS.length);
    for (const t of CURATED_TIMERS) {
      assert.ok(CATEGORIES.includes(t.category), t.slug);
      assert.equal(new Date(t.target_at).toISOString(), t.target_at, t.slug);
      assert.match(t.slug, /^[a-z0-9-]+$/, t.slug);
      assert.ok(t.title.length >= 1 && t.title.length <= 80, t.slug);
    }
  });

  // ---------- Legacy schema migration (v2.1 English switch) ----------

  test('migration: a DB with the old Turkish category schema is rebuilt; custom categories are mapped', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hype-migration-'));
    const dbPath = join(dir, 'legacy.db');
    try {
      // Build a DB with the pre-v2.1 schema and Turkish data by hand.
      const legacy = new DatabaseSync(dbPath);
      legacy.exec(`
        CREATE TABLE timers (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          slug       TEXT    NOT NULL UNIQUE,
          title      TEXT    NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
          emoji      TEXT    NOT NULL DEFAULT '⏳',
          category   TEXT             CHECK (category IN ('oyun', 'spor', 'film-dizi', 'teknoloji', 'ozel-gunler')),
          target_at  TEXT    NOT NULL,
          is_curated INTEGER NOT NULL DEFAULT 0 CHECK (is_curated IN (0, 1)),
          created_at TEXT    NOT NULL
        );
      `);
      legacy.prepare(`
        INSERT INTO timers (slug, title, emoji, category, target_at, is_curated, created_at)
        VALUES ('yilbasi-2027', 'Old title', '🎆', 'ozel-gunler', '2026-12-31T21:00:00.000Z', 1, '2026-07-07T00:00:00.000Z')
      `).run();
      legacy.prepare(`
        INSERT INTO timers (slug, title, emoji, category, target_at, is_curated, created_at)
        VALUES ('customslug', 'My custom timer', '🎮', 'oyun', '2026-12-31T21:00:00.000Z', 0, '2026-07-07T00:00:00.000Z')
      `).run();
      legacy.close();

      // openDb + seed = what the server does at startup.
      const db = openDb(dbPath);
      seedCuratedTimers(db);

      // New schema active: English categories accepted, Turkish rejected.
      const schema = db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'timers'")
        .get().sql;
      assert.ok(schema.includes("'holidays'"));
      assert.ok(!schema.includes("'ozel-gunler'"));

      // Obsolete curated slug removed by the seed; the 17 English rows are in.
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM timers WHERE slug = 'yilbasi-2027'").get().n, 0);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM timers WHERE is_curated = 1').get().n, CURATED_TIMERS.length);

      // Custom row survived with its category mapped to English.
      const custom = db.prepare("SELECT * FROM timers WHERE slug = 'customslug'").get();
      assert.equal(custom.title, 'My custom timer');
      assert.equal(custom.category, 'games');
      assert.equal(custom.is_curated, 0);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ---------- Misc ----------

  test('randomSlug: 10 chars, within alphabet, no collisions (1000 draws)', () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i++) {
      const s = randomSlug();
      assert.match(s, /^[a-z0-9]{10}$/);
      seen.add(s);
    }
    assert.equal(seen.size, 1000);
  });

  test('unknown path → 404 with {error: {code, message}} body', async () => {
    const res = await fetch(base + '/nope');
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, 'not_found');
    assert.ok(body.error.message);
  });

  test('CORS: Vite dev origin is allowed', async () => {
    const res = await fetch(base + '/timers', {
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  });
});
