#!/usr/bin/env node
/**
 * Hype Reactions (PRD §9.2 / RX-5) — persistent end-to-end QA test.
 *
 * Prerequisites (same convention as e2e/smoke.mjs):
 *   1. Backend running with a throwaway DB, e.g.:
 *      cd backend && DB_PATH=/tmp/hype-reactions-e2e.db PORT=3001 node src/server.js
 *   2. Frontend dev server running (proxying to that backend):
 *      cd frontend && npm run dev
 *   3. playwright-core + system Chrome (npm i --no-save playwright-core, or set
 *      PLAYWRIGHT_CORE=/path/to/playwright-core)
 *
 * Run: node e2e/reactions.mjs
 * Env: API_URL (default http://localhost:3001), APP_URL (default http://localhost:5173)
 * Exit code: 0 = all checks passed, 1 = at least one FAIL.
 *
 * Idempotency note: this test creates its own fresh custom timers per run (via
 * POST /api/timers) so it never depends on prior runs' reaction state on a
 * shared curated slug, and can be run twice in a row against the same DB.
 */

const API = process.env.API_URL ?? 'http://localhost:3001';
const APP = process.env.APP_URL ?? 'http://localhost:5173';
const EMOJI = ['🔥', '⏳', '🎉', '😱', '👀'];

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
  if (!cond) failures++;
};

async function createTimer(title) {
  const res = await fetch(API + '/api/timers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, target_at: '2031-01-01T00:00:00Z', emoji: '🧪' }),
  });
  const body = await res.json();
  return body.timer.slug;
}

async function apiReact(slug, emoji, headers = {}) {
  const res = await fetch(`${API}/api/timers/${slug}/react`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ emoji }),
  });
  return { status: res.status, body: await res.json() };
}

async function getTimer(slug) {
  return (await (await fetch(`${API}/api/timers/${slug}`)).json()).timer;
}

// ---------- Pure API checks (fast, no browser) ----------
console.log('— Reactions API —');

{
  const slug = await createTimer('QA e2e: happy path');
  for (const emoji of EMOJI) {
    const r = await apiReact(slug, emoji);
    check(`happy path: react ${emoji} → 200`, r.status === 200);
  }
  const timer = await getTimer(slug);
  check('happy path: all 5 counts are 1 and persisted via GET', EMOJI.every((e) => timer.reactions[e] === 1), JSON.stringify(timer.reactions));
}

{
  const slug = await createTimer('QA e2e: duplicate same IP');
  await apiReact(slug, '🔥');
  const second = await apiReact(slug, '🔥');
  const third = await apiReact(slug, '🔥');
  check('duplicate: repeat reaction from same IP stays 200 (idempotent, not an error)', second.status === 200 && third.status === 200);
  check('duplicate: count does not move past 1', second.body.reactions['🔥'] === 1 && third.body.reactions['🔥'] === 1);
}

{
  const slug = await createTimer('QA e2e: parallel duplicate');
  const results = await Promise.all(Array.from({ length: 15 }, () => apiReact(slug, '🎉')));
  check('parallel duplicate: all 15 requests return 200', results.every((r) => r.status === 200));
  const timer = await getTimer(slug);
  check('parallel duplicate: server count settles at exactly 1', timer.reactions['🎉'] === 1, `got ${timer.reactions['🎉']}`);
}

{
  const cases = [undefined, null, 42, '', '🔥🔥', '😀', 'fire', [], {}];
  const slug = await createTimer('QA e2e: invalid emoji');
  for (const emoji of cases) {
    const r = await apiReact(slug, emoji);
    check(`invalid emoji ${JSON.stringify(emoji)} → 400 invalid_reaction_emoji`, r.status === 400 && r.body?.error?.code === 'invalid_reaction_emoji');
  }
}

{
  const r = await apiReact('no-such-timer-e2e-reactions', '🔥');
  check('unknown slug → 404 timer_not_found', r.status === 404 && r.body?.error?.code === 'timer_not_found');
}

// ---------- Browser checks ----------
let chromium = null;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core'));
} catch {
  console.log('SKIP | browser steps: playwright-core not found (npm i --no-save playwright-core)');
}

if (chromium) {
  console.log('— Reactions browser —');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    // Cross-emoji race + reload persistence, on a dedicated fresh timer.
    const slug = await createTimer('QA e2e: browser race + reload');
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(APP + '/t/' + slug, { waitUntil: 'networkidle' });
    const bar = page.locator('[role="group"][aria-label="React to this timer"]');
    await bar.waitFor({ state: 'visible' });

    const fireBtn = bar.locator('button', { hasText: '🔥' });
    const iceBtn = bar.locator('button', { hasText: '⏳' });

    // Fire two DIFFERENT emoji as close together as possible, before either settles.
    const p1 = page.waitForResponse((r) => r.url().includes('/react') && r.request().method() === 'POST');
    await fireBtn.click();
    const p2 = page.waitForResponse((r) => r.url().includes('/react') && r.request().method() === 'POST');
    await iceBtn.click();
    await Promise.all([p1, p2]);
    await page.waitForTimeout(1200); // allow the digit-flip animation to settle before reading the a11y tree

    const fireSnap = await fireBtn.ariaSnapshot();
    const iceSnap = await iceBtn.ariaSnapshot();
    check('race: 🔥 shows count 1 (not clobbered by the concurrent ⏳ tap)', /: "1"/.test(fireSnap), fireSnap);
    check('race: ⏳ shows count 1 (not clobbered by the concurrent 🔥 tap)', /: "1"/.test(iceSnap), iceSnap);
    check('race: 🔥 marked active (aria-pressed)', (await fireBtn.getAttribute('aria-pressed')) === 'true');
    check('race: ⏳ marked active (aria-pressed)', (await iceBtn.getAttribute('aria-pressed')) === 'true');

    const serverAfterRace = await getTimer(slug);
    check(
      'race: server truth matches the UI (no lost update server-side either)',
      serverAfterRace.reactions['🔥'] === 1 && serverAfterRace.reactions['⏳'] === 1,
      JSON.stringify(serverAfterRace.reactions)
    );

    // Reload: server-truth counts + localStorage-driven "already reacted" state must both survive.
    await page.reload({ waitUntil: 'networkidle' });
    const bar2 = page.locator('[role="group"][aria-label="React to this timer"]');
    await bar2.waitFor({ state: 'visible' });
    const fireBtn2 = bar2.locator('button', { hasText: '🔥' });
    await page.waitForTimeout(1200);
    check('reload: 🔥 count still 1 (server truth, not just client cache)', /: "1"/.test(await fireBtn2.ariaSnapshot()));
    check('reload: 🔥 still shows "already reacted" (localStorage)', (await fireBtn2.getAttribute('aria-pressed')) === 'true');
    check('reload: 🔥 button disabled again (cannot re-tap)', await fireBtn2.isDisabled());

    check('race+reload flow: no page errors', errors.length === 0, errors.join(' ; '));

    // Mobile-width compact rendering (~375px), separate fresh timer/page.
    const mobileSlug = await createTimer('QA e2e: mobile width');
    const mobilePage = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await mobilePage.goto(APP + '/t/' + mobileSlug, { waitUntil: 'networkidle' });
    const mobileBar = mobilePage.locator('[role="group"][aria-label="React to this timer"]');
    await mobileBar.waitFor({ state: 'visible' });
    const box = await mobileBar.boundingBox();
    check('mobile (375px): reaction bar fits within the viewport width', Boolean(box) && box.width <= 375, `width=${box?.width}`);
    const buttons = mobileBar.locator('button');
    check('mobile (375px): all 5 buttons rendered', (await buttons.count()) === 5);
    const rects = await buttons.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
    const maxRight = Math.max(...rects.map((r) => r.right));
    check('mobile (375px): no button overflows the viewport horizontally', maxRight <= 376, `maxRight=${maxRight}`);
    await mobilePage.close();
  } finally {
    await browser.close();
  }
}

console.log(failures === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
