#!/usr/bin/env node
/**
 * Hype — end-to-end smoke test (QA).
 *
 * Prerequisites:
 *   1. Backend running (preferably with a throwaway DB, to keep the dev DB clean):
 *      cd backend && DB_PATH=/tmp/hype-smoke.db PORT=3001 node src/server.js
 *   2. Frontend dev server running: cd frontend && npm run dev  (http://localhost:5173)
 *   3. (Optional, for the browser steps) playwright-core + system Chrome:
 *      npm i --no-save playwright-core   or   PLAYWRIGHT_CORE=/path/to/playwright-core node e2e/smoke.mjs
 *
 * Run: node e2e/smoke.mjs
 * Exit code: 0 = all checks passed, 1 = at least one FAIL.
 *
 * Note: POST /api/timers is rate limited (20/hour/IP). Each run creates 2 timers;
 * if you see 429 after 10+ consecutive runs, restart the backend with a clean DB.
 */

const API = process.env.API_URL ?? 'http://localhost:3001';
const APP = process.env.APP_URL ?? 'http://localhost:5173';

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
  if (!cond) failures++;
};

const j = async (path, opts) => {
  const res = await fetch(API + path, opts);
  let body = null;
  try { body = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body };
};
const post = (body) =>
  j('/api/timers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// ---------- API smoke ----------
console.log('— API smoke —');
const health = await j('/api/health');
check('GET /api/health 200', health.status === 200 && health.body?.ok === true);

const list = await j('/api/timers');
const timers = list.body?.timers ?? [];
check('GET /api/timers: 200 + serverNow', list.status === 200 && typeof list.body.serverNow === 'string');
check('list: all curated + not expired', timers.length > 0 && timers.every((t) => t.is_curated && Date.parse(t.target_at) > Date.parse(list.body.serverNow)), `n=${timers.length}`);
check('list: target_at ascending', timers.every((t, i) => i === 0 || Date.parse(t.target_at) >= Date.parse(timers[i - 1].target_at)));

const cat = await j('/api/timers?category=sports');
check('category filter (sports)', cat.status === 200 && cat.body.timers.every((t) => t.category === 'sports'));
const badCat = await j('/api/timers?category=no-such-category');
check('invalid category → 400 invalid_category', badCat.status === 400 && badCat.body.error?.code === 'invalid_category');

const nf = await j('/api/timers/no-such-slug-xyz');
check('unknown slug → 404 timer_not_found', nf.status === 404 && nf.body.error?.code === 'timer_not_found');

check('empty title → 400 invalid_title', (await post({ title: '', target_at: '2030-01-01T00:00:00Z' })).body?.error?.code === 'invalid_title');
check('81-char title → 400 invalid_title', (await post({ title: 'a'.repeat(81), target_at: '2030-01-01T00:00:00Z' })).body?.error?.code === 'invalid_title');
check('past date → 400 target_in_past', (await post({ title: 'past', target_at: '2000-01-01T00:00:00Z' })).body?.error?.code === 'target_in_past');
check('missing timezone → 400 invalid_target_at', (await post({ title: 'no tz', target_at: '2030-01-01T00:00:00' })).body?.error?.code === 'invalid_target_at');

const created = await post({ title: 'Smoke test', target_at: new Date(Date.now() + 864e5).toISOString(), emoji: '🧪' });
check('valid POST → 201 + 10-char slug', created.status === 201 && /^[a-z0-9]{10}$/.test(created.body?.timer?.slug ?? ''), `slug=${created.body?.timer?.slug}`);
const slug = created.body?.timer?.slug;
if (slug) {
  const got = await j('/api/timers/' + slug);
  check('custom timer reachable by slug', got.status === 200 && got.body.timer.title === 'Smoke test');
  const list2 = await j('/api/timers');
  check('custom timer NOT in the Explore list', !list2.body.timers.some((t) => t.slug === slug));
}

// ---------- Browser smoke (if playwright-core is available) ----------
let chromium = null;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core'));
} catch {
  console.log('SKIP | browser steps: playwright-core not found (npm i --no-save playwright-core)');
}

if (chromium) {
  console.log('— Browser smoke —');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // Explore: hero + cards + live counter math
    await page.goto(APP + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('[role="timer"]');
    const label = await page.locator('[role="timer"]').first().getAttribute('aria-label');
    const m = label.match(/(\d+) days? (\d+) hours? (\d+) minutes? (\d+) seconds?/);
    const shownSecs = m ? ((+m[1] * 24 + +m[2]) * 60 + +m[3]) * 60 + +m[4] : NaN;
    const expectSecs = Math.floor((Date.parse(timers[0].target_at) - Date.now()) / 1000);
    check('Explore: hero counter correct (±3s)', Math.abs(shownSecs - expectSecs) <= 3, `shown=${shownSecs}s expected=${expectSecs}s`);
    await page.waitForTimeout(2200);
    const label2 = await page.locator('[role="timer"]').first().getAttribute('aria-label');
    check('Explore: counter ticks every second', label !== label2);

    // Detail: custom slug opens directly
    if (slug) {
      await page.goto(APP + '/t/' + slug, { waitUntil: 'networkidle' });
      check('Detail: custom timer title visible', await page.getByText('Smoke test').first().isVisible());
    }

    // 404
    await page.goto(APP + '/t/no-such-slug-xyz', { waitUntil: 'networkidle' });
    check('404: "This timer doesn\'t exist."', await page.getByText("This timer doesn't exist.").isVisible());

    check('browser: no page errors (pageerror)', errors.length === 0, errors.join(' ; '));
  } finally {
    await browser.close();
  }
}

console.log(failures === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
