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
      'category', 'created_at', 'emoji', 'is_curated', 'reactions', 'slug', 'target_at', 'title',
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

  // ---------- POST /api/timers/:slug/react (Hype Reactions, PRD §9.2) ----------

  test('react: timer objects include a reactions field, all-zero by default', async () => {
    const list = await (await fetch(base + '/timers')).json();
    assert.deepEqual(list.timers[0].reactions, { '🔥': 0, '⏳': 0, '🎉': 0, '😱': 0, '👀': 0 });

    const detail = await (await fetch(base + '/timers/gta-6')).json();
    assert.deepEqual(detail.timer.reactions, { '🔥': 0, '⏳': 0, '🎉': 0, '😱': 0, '👀': 0 });

    const created = await (await post('/timers', validCustom)).json();
    assert.deepEqual(created.timer.reactions, { '🔥': 0, '⏳': 0, '🎉': 0, '😱': 0, '👀': 0 });
  });

  test('react: happy path increments the count and is reflected on GET afterwards', async () => {
    const res = await post('/timers/gta-6/react', { emoji: '🔥' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.serverNow, clock.now.toISOString());
    assert.deepEqual(body.reactions, { '🔥': 1, '⏳': 0, '🎉': 0, '😱': 0, '👀': 0 });

    const detail = await (await fetch(base + '/timers/gta-6')).json();
    assert.deepEqual(detail.timer.reactions, { '🔥': 1, '⏳': 0, '🎉': 0, '😱': 0, '👀': 0 });
  });

  test('react: only the 5 fixed emoji are accepted → 400 invalid_reaction_emoji', async () => {
    const cases = [
      undefined, // missing
      {}, // wrong type object
      42, // wrong type number
      '', // empty string
      '🔥🔥', // multi-emoji (not exactly one of the fixed set)
      '😀', // valid-looking but different emoji, not in the fixed set
      'fire', // plain text
    ];
    for (const emoji of cases) {
      const res = await post('/timers/gta-6/react', emoji === undefined ? {} : { emoji });
      assert.equal(res.status, 400, `case: ${JSON.stringify(emoji)}`);
      assert.equal((await res.json()).error.code, 'invalid_reaction_emoji', `case: ${JSON.stringify(emoji)}`);
    }
    // sanity: every one of the 5 fixed emoji IS accepted
    for (const emoji of ['🔥', '⏳', '🎉', '😱', '👀']) {
      const res = await post('/timers/gta-6/react', { emoji });
      assert.equal(res.status, 200, `emoji: ${emoji}`);
    }
  });

  test('react: same IP reacting twice with the same emoji does not double-count', async () => {
    const first = await (await post('/timers/gta-6/react', { emoji: '🎉' })).json();
    assert.equal(first.reactions['🎉'], 1);

    const second = await (await post('/timers/gta-6/react', { emoji: '🎉' })).json();
    assert.equal(second.reactions['🎉'], 1, 'count must not move on a repeat from the same IP');

    // and once more for good measure
    const third = await (await post('/timers/gta-6/react', { emoji: '🎉' })).json();
    assert.equal(third.reactions['🎉'], 1);
  });

  test('react: same IP CAN react with a different emoji, and/or a different timer', async () => {
    await post('/timers/gta-6/react', { emoji: '🔥' });
    const differentEmoji = await (await post('/timers/gta-6/react', { emoji: '👀' })).json();
    assert.equal(differentEmoji.reactions['🔥'], 1);
    assert.equal(differentEmoji.reactions['👀'], 1);

    const other = await (await post('/timers/world-cup-2026-final/react', { emoji: '🔥' })).json();
    assert.equal(other.reactions['🔥'], 1, 'a different timer has its own independent counts');

    const gta6 = await (await fetch(base + '/timers/gta-6')).json();
    assert.equal(gta6.timer.reactions['🔥'], 1, 'gta-6 count unaffected by the other timer reaction');
  });

  test('react: different IP CAN react with the same emoji on the same timer', async () => {
    process.env.TRUST_PROXY = '1';
    try {
      server.close();
      await start();
      const a = await post('/timers/gta-6/react', { emoji: '😱' }, { 'X-Forwarded-For': '1.1.1.1' });
      assert.equal((await a.json()).reactions['😱'], 1);
      const b = await post('/timers/gta-6/react', { emoji: '😱' }, { 'X-Forwarded-For': '2.2.2.2' });
      assert.equal((await b.json()).reactions['😱'], 2);
      // repeat from the first IP again is still a no-op
      const aAgain = await post('/timers/gta-6/react', { emoji: '😱' }, { 'X-Forwarded-For': '1.1.1.1' });
      assert.equal((await aAgain.json()).reactions['😱'], 2);
    } finally {
      delete process.env.TRUST_PROXY;
    }
  });

  test('react: unknown slug → 404 timer_not_found (same shape as GET /api/timers/:slug)', async () => {
    const res = await post('/timers/no-such-thing/react', { emoji: '🔥' });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, 'timer_not_found');
    assert.ok(body.error.message);
  });

  test('react: non-object JSON body → 400 invalid_body / invalid_json', async () => {
    const send = (raw) =>
      fetch(base + '/timers/gta-6/react', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: raw,
      });

    let res = await send('[1,2]');
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'invalid_body');

    for (const raw of ['null', '"text"', '42']) {
      res = await send(raw);
      assert.equal(res.status, 400, `case: ${raw}`);
      assert.equal((await res.json()).error.code, 'invalid_json', `case: ${raw}`);
    }
  });

  test('react: body over 100KB → 413 payload_too_large', async () => {
    const res = await post('/timers/gta-6/react', { emoji: '🔥', pad: 'x'.repeat(150 * 1024) });
    assert.equal(res.status, 413);
    assert.equal((await res.json()).error.code, 'payload_too_large');
  });

  test('react: rate limit 429 + Retry-After, independent of the per-emoji uniqueness check', async () => {
    server.close();
    await start({ reactionRateLimit: { limit: 3, windowMs: 60 * 60_000 } });

    const emoji = ['🔥', '⏳', '🎉']; // 3 distinct emoji: within limit, none are duplicates
    for (const e of emoji) {
      const res = await post('/timers/gta-6/react', { emoji: e });
      assert.equal(res.status, 200, `emoji ${e} must be within the limit`);
    }
    // 4th request (yet another distinct emoji, so not blocked by uniqueness) hits the rate limit
    const blocked = await post('/timers/gta-6/react', { emoji: '😱' });
    assert.equal(blocked.status, 429);
    const body = await blocked.json();
    assert.equal(body.error.code, 'rate_limited');
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);

    // rate limit does not affect GETs
    assert.equal((await fetch(base + '/timers/gta-6')).status, 200);
  });

  // ---------- Hype Messages (HM-4, PRD §9.3) ----------

  test('messages: no messages yet → GET returns an empty list, not an error', async () => {
    const res = await fetch(base + '/timers/gta-6/messages');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.serverNow);
    assert.deepEqual(body.messages, []);
  });

  test('messages: happy path — valid short message is stored and returned by GET, newest first', async () => {
    const res = await post('/timers/gta-6/message', { message: 'So hyped for this 🔥' });
    assert.equal(res.status, 201);
    const created = await res.json();
    assert.ok(created.serverNow);
    assert.equal(created.message.message, 'So hyped for this 🔥');
    assert.equal(created.message.created_at, clock.now.toISOString());
    assert.ok(Number.isInteger(created.message.id));

    // advance the clock so ordering is unambiguous
    clock.now = new Date(clock.now.getTime() + 1000);
    const second = await (await post('/timers/gta-6/message', { message: 'Cant wait!' })).json();

    const list = await (await fetch(base + '/timers/gta-6/messages')).json();
    assert.equal(list.messages.length, 2);
    // newest first
    assert.equal(list.messages[0].id, second.message.id);
    assert.equal(list.messages[0].message, 'Cant wait!');
    assert.equal(list.messages[1].id, created.message.id);

    // messages for a different timer stay independent
    const otherList = await (await fetch(base + '/timers/world-cup-2026-final/messages')).json();
    assert.deepEqual(otherList.messages, []);
  });

  test('messages: unknown slug → 404 timer_not_found (GET and POST)', async () => {
    const getRes = await fetch(base + '/timers/no-such-thing/messages');
    assert.equal(getRes.status, 404);
    assert.equal((await getRes.json()).error.code, 'timer_not_found');

    const postRes = await post('/timers/no-such-thing/message', { message: 'hi' });
    assert.equal(postRes.status, 404);
    assert.equal((await postRes.json()).error.code, 'timer_not_found');
  });

  test('messages: non-object JSON body → 400 invalid_body / invalid_json', async () => {
    const send = (raw) =>
      fetch(base + '/timers/gta-6/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: raw,
      });

    let res = await send('[1,2]');
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'invalid_body');

    for (const raw of ['null', '"text"', '42']) {
      res = await send(raw);
      assert.equal(res.status, 400, `case: ${raw}`);
      assert.equal((await res.json()).error.code, 'invalid_json', `case: ${raw}`);
    }
  });

  test('messages: body over 100KB → 413 payload_too_large', async () => {
    const res = await post('/timers/gta-6/message', { message: 'hi', pad: 'x'.repeat(150 * 1024) });
    assert.equal(res.status, 413);
    assert.equal((await res.json()).error.code, 'payload_too_large');
  });

  // Every moderation rejection code, exercised through the real route (not
  // just unit-tested against moderateText in isolation) — per HM-4's
  // acceptance criteria.
  test('messages: missing/empty/non-string message → 400 invalid_message', async () => {
    // Contract row (docs/api.md): "Message is missing, not a string, or
    // empty/whitespace-only after trim." — covers all three shapes, not just
    // the missing/empty ones.
    for (const message of [undefined, '', '   ', 42, true, null, [], {}]) {
      const res = await post('/timers/gta-6/message', message === undefined ? {} : { message });
      assert.equal(res.status, 400, `case: ${JSON.stringify(message)}`);
      assert.equal((await res.json()).error.code, 'invalid_message', `case: ${JSON.stringify(message)}`);
    }
  });

  test('messages: oversized message (>80 chars) → 400 message_too_long', async () => {
    const res = await post('/timers/gta-6/message', { message: 'abcdefghij'.repeat(9) });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'message_too_long');
  });

  test('messages: repeated-character flood → 400 message_repeated_chars', async () => {
    const res = await post('/timers/gta-6/message', { message: 'aaaaaaaaaa' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'message_repeated_chars');
  });

  test('messages: bare link/URL → 400 message_contains_link', async () => {
    const res = await post('/timers/gta-6/message', { message: 'check this out https://evil.com' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'message_contains_link');
  });

  test('messages: blocklisted content → 400 message_blocked_content', async () => {
    const res = await post('/timers/gta-6/message', { message: 'this is shit' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'message_blocked_content');
  });

  // QA (2026-07-20, independent verification of HM-3b's route-level behavior,
  // complementing the unit-level checkBareUrl() tests in moderation.test.js):
  // proves the *documented* trade-off through the real POST route, not just the
  // isolated link-check function — and separately proves that docs/api.md's own
  // cited example ("spam.gg") is still rejected end-to-end, just via the
  // blocklist check ("spam" is a blocklisted word), not the link check. Anyone
  // reading the trade-off writeup and testing with that exact phrase would
  // otherwise wrongly conclude the trade-off "doesn't work" when in fact it's
  // working exactly as designed — the rejection just comes from a different,
  // independent check.
  test('messages: HM-3b accepted trade-off — ambiguous dropped TLD (.gg) alone does not trigger message_contains_link', async () => {
    const res = await post('/timers/gta-6/message', { message: 'check game.gg later' });
    assert.equal(res.status, 201, 'a message using a deliberately-dropped ambiguous TLD must NOT be blocked by the link check');
    const body = await res.json();
    assert.equal(body.message.message, 'check game.gg later');
  });

  test('messages: the docs\' own "spam.gg" example is still rejected end-to-end — via message_blocked_content (blocklist), not message_contains_link', async () => {
    const res = await post('/timers/gta-6/message', { message: 'check spam.gg' });
    assert.equal(res.status, 400);
    // Important distinction: this must be blocked_content (the word "spam" is
    // on the blocklist), NOT contains_link — the ambiguous .gg TLD itself is
    // never caught by the link heuristic, by design (HM-3b).
    assert.equal((await res.json()).error.code, 'message_blocked_content');
  });

  test('messages: a rejected message is never stored', async () => {
    await post('/timers/gta-6/message', { message: 'aaaaaaaaaa' });
    const list = await (await fetch(base + '/timers/gta-6/messages')).json();
    assert.deepEqual(list.messages, []);
  });

  test('messages: HTML in an otherwise-accepted message is sanitized before storage', async () => {
    const res = await post('/timers/gta-6/message', { message: '<script>alert(1)</script>' });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(!body.message.message.includes('<script>'));
    assert.match(body.message.message, /&lt;script&gt;/);
  });

  test('messages: capped at 50 stored per timer — oldest are pruned, GET never exceeds the cap', async () => {
    // 55 submissions exceeds the default 20/hour rate limit, so raise it for this test —
    // it's specifically exercising the storage cap, not the rate limiter.
    server.close();
    await start({ messageRateLimit: { limit: 1000 } });

    for (let i = 0; i < 55; i++) {
      clock.now = new Date(clock.now.getTime() + 1000);
      const res = await post('/timers/gta-6/message', { message: `msg ${i}` });
      assert.equal(res.status, 201, `message ${i}`);
    }
    const list = await (await fetch(base + '/timers/gta-6/messages')).json();
    assert.equal(list.messages.length, 50);
    // newest first: the last one posted (msg 54) must be present, the earliest 5 pruned
    assert.equal(list.messages[0].message, 'msg 54');
    assert.ok(!list.messages.some((m) => m.message === 'msg 0'), 'oldest messages must be pruned');
    assert.ok(!list.messages.some((m) => m.message === 'msg 4'), 'oldest messages must be pruned');
  });

  test('messages: rate limit 429 + Retry-After, independent of the moderation checks', async () => {
    server.close();
    await start({ messageRateLimit: { limit: 3, windowMs: 60 * 60_000 } });

    for (let i = 0; i < 3; i++) {
      const res = await post('/timers/gta-6/message', { message: `hi ${i}` });
      assert.equal(res.status, 201, `message ${i} must be within the limit`);
    }
    const blocked = await post('/timers/gta-6/message', { message: 'one too many' });
    assert.equal(blocked.status, 429);
    const body = await blocked.json();
    assert.equal(body.error.code, 'rate_limited');
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);

    // rate limit does not affect GETs
    assert.equal((await fetch(base + '/timers/gta-6/messages')).status, 200);
  });

  // QA (2026-07-20, independent verification): the rate limiter middleware runs
  // BEFORE the moderation/route-level checks (see routes/timers.js:
  // `router.post('/:slug/message', messageLimiter, ...)`), so a submission that
  // is ultimately REJECTED by moderation still consumes one slot of the per-IP
  // quota — not just accepted (201) submissions. Documented here as an explicit,
  // asserted behavior (not previously covered by a test) rather than an
  // incidental implementation detail: a caller relying on "only successful
  // messages count against my quota" would be surprised otherwise. This is a
  // defensible/common rate-limiting design (it also stops an attacker from
  // getting unlimited free attempts to probe the moderation filter for a
  // bypass), but it is not currently spelled out in docs/api.md's `rate_limited`
  // row — see QA finding HM-6-F1.
  test('messages: rate limit also counts moderation-REJECTED submissions, not just accepted ones', async () => {
    server.close();
    await start({ messageRateLimit: { limit: 3, windowMs: 60 * 60_000 } });

    // 3 submissions that are all rejected by moderation (never stored) should
    // still exhaust the same 3-per-hour quota as 3 accepted ones would.
    const rejected1 = await post('/timers/gta-6/message', { message: 'aaaaaaaaaa' });
    assert.equal(rejected1.status, 400);
    assert.equal((await rejected1.json()).error.code, 'message_repeated_chars');

    const rejected2 = await post('/timers/gta-6/message', { message: 'this is shit' });
    assert.equal(rejected2.status, 400);

    const rejected3 = await post('/timers/gta-6/message', { message: '   ' });
    assert.equal(rejected3.status, 400);

    // A 4th attempt — even a perfectly valid message — now hits the exhausted quota.
    const fourth = await post('/timers/gta-6/message', { message: 'a perfectly valid message' });
    assert.equal(fourth.status, 429, 'quota must already be exhausted by the 3 rejected attempts alone');
    assert.equal((await fourth.json()).error.code, 'rate_limited');

    // Confirm nothing was ever stored (all 3 were rejected, the 4th never ran).
    const list = await (await fetch(base + '/timers/gta-6/messages')).json();
    assert.deepEqual(list.messages, []);
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
