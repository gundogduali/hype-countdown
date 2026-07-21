#!/usr/bin/env node
/**
 * Hype Messages (PRD §9.3 / HM-5) — persistent end-to-end QA test.
 *
 * Prerequisites (same convention as e2e/reactions.mjs):
 *   1. Backend running with a throwaway DB.
 *   2. Frontend dev server running (proxying to that backend).
 *   3. playwright-core + system Chrome.
 *
 * Run: node e2e/messages.mjs
 * Env: API_URL (default http://localhost:3001), APP_URL (default http://localhost:5173)
 * Exit code: 0 = all checks passed, 1 = at least one FAIL.
 *
 * Note (QA, 2026-07-20 — same caveat as e2e/smoke.mjs's rate-limit note):
 * POST /api/timers/:slug/message is rate limited per-IP at 20/hour (across ALL
 * timers, not per-slug — see docs/api.md). This suite's own rate-limit test
 * (both the API-level and browser-level 429 checks) deliberately exhausts that
 * whole-hour quota for this IP as part of proving the 429 path actually fires.
 * Running this script a second time within the same hour against the SAME
 * long-lived backend/DB will therefore fail with `rate_limited` on every
 * subsequent message POST (including the happy-path/moderation tests earlier
 * in the file) — restart the backend with a fresh DB_PATH between runs, same
 * as the existing convention for e2e/smoke.mjs's timer-creation rate limit.
 */

const API = process.env.API_URL ?? 'http://localhost:3001';
const APP = process.env.APP_URL ?? 'http://localhost:5173';

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

async function apiPostMessage(slug, message) {
  const res = await fetch(`${API}/api/timers/${slug}/message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return { status: res.status, body: await res.json() };
}

async function apiGetMessages(slug) {
  const res = await fetch(`${API}/api/timers/${slug}/messages`);
  return { status: res.status, body: await res.json() };
}

console.log('— Messages API —');

{
  const slug = await createTimer('QA e2e: happy path message');
  const r = await apiPostMessage(slug, 'So hyped for this 🔥');
  check('happy path: post → 201', r.status === 201, JSON.stringify(r.body));
  check('happy path: returns created message shape', typeof r.body?.message?.id === 'number' && r.body.message.message === 'So hyped for this 🔥');
  const list = await apiGetMessages(slug);
  check('happy path: GET reflects the posted message', list.body.messages.length === 1 && list.body.messages[0].message === 'So hyped for this 🔥');
}

{
  const slug = await createTimer('QA e2e: empty messages');
  const list = await apiGetMessages(slug);
  check('empty: fresh timer → messages: []', Array.isArray(list.body.messages) && list.body.messages.length === 0);
}

const moderationCases = [
  { name: 'invalid_message (whitespace only)', message: '   ', code: 'invalid_message' },
  { name: 'message_too_long (81 chars)', message: 'a'.repeat(81), code: 'message_too_long' },
  { name: 'message_repeated_chars ("aaaaaaa")', message: 'aaaaaaa', code: 'message_repeated_chars' },
  { name: 'message_contains_link (bare URL)', message: 'check out https://spam-deals.example now', code: 'message_contains_link' },
  { name: 'message_blocked_content (blocklisted word)', message: 'this is spam', code: 'message_blocked_content' },
];

// QA (2026-07-20): a single shared timer for the whole loop, not one per
// case — every one of these submissions is expected to be REJECTED by
// moderation (never stored), so there is no cross-case state to corrupt, and
// reusing one slug saves 4 `POST /api/timers` calls against this suite's
// shared 20/hour per-IP budget (see the docstring note at the top of this
// file; smoke.mjs + reactions.mjs + this file all draw from the same quota
// when chained via `npm test`).
const moderationSharedSlug = await createTimer('QA e2e: moderation cases (shared)');
for (const c of moderationCases) {
  const r = await apiPostMessage(moderationSharedSlug, c.message);
  check(`moderation: ${c.name} → 400 ${c.code}`, r.status === 400 && r.body?.error?.code === c.code, JSON.stringify(r.body));
}

{
  const r = await apiPostMessage('no-such-timer-e2e-messages', 'hello');
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
  console.log('— Messages browser —');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    // Empty state (desktop). Reused below for the mobile-width check too
    // (QA, 2026-07-20): neither test posts a message, so the same pristine,
    // message-free slug is safe to view at two different viewport widths —
    // saves one more `POST /api/timers` call against this suite's shared
    // 20/hour per-IP budget (see the docstring note at the top of this file).
    const emptyStateSlug = await createTimer('QA e2e: browser empty state');
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      await page.goto(APP + '/t/' + emptyStateSlug, { waitUntil: 'networkidle' });
      const emptyTitle = page.getByText('No messages yet.');
      await emptyTitle.waitFor({ state: 'visible' });
      check('empty state: "No messages yet." shown', await emptyTitle.isVisible());
      check('empty state: sub copy shown', await page.getByText('Be the first to hype this up. 🔥').isVisible());
      check('empty state: header shows 0 MESSAGES', await page.getByText('0 MESSAGES').isVisible());
      await page.close();
    }

    // Posting a valid message: appears without reload, persists after reload.
    {
      const slug = await createTimer('QA e2e: browser post + persist');
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(APP + '/t/' + slug, { waitUntil: 'networkidle' });

      const input = page.getByLabel('Share the hype');
      await input.waitFor({ state: 'visible' });
      await input.fill('Cannot wait for this one!!');
      await page.getByRole('button', { name: 'Send message' }).click();

      const row = page.getByText('Cannot wait for this one!!');
      await row.waitFor({ state: 'visible', timeout: 5000 });
      check('post: message appears in the list without reload', await row.isVisible());
      check('post: header updates to 1 MESSAGES', await page.getByText('1 MESSAGES').isVisible());
      check('post: input clears after successful submit', (await input.inputValue()) === '');

      await page.reload({ waitUntil: 'networkidle' });
      const rowAfterReload = page.getByText('Cannot wait for this one!!');
      await rowAfterReload.waitFor({ state: 'visible', timeout: 5000 });
      check('post: message still present after a real reload (server truth)', await rowAfterReload.isVisible());
      check('post flow: no page errors', errors.length === 0, errors.join(' ; '));

      // QA (2026-07-20): newest-first ordering in the actual rendered list (not
      // just asserted against the API response) — a gap in the original suite,
      // which only ever posted a single message per browser test. Reuses THIS
      // block's already-created timer/page (rather than a dedicated
      // `createTimer` call) deliberately: `POST /api/timers` shares one 20/hour
      // per-IP quota across this whole e2e suite (smoke.mjs + reactions.mjs +
      // messages.mjs all create custom timers against the same backend/IP when
      // chained via `npm test`), and this suite was already right at that
      // budget — see the docstring note above. Posting a 2nd message to an
      // existing slug costs nothing extra against that quota.
      await input.fill('Second message (newer)');
      await page.getByRole('button', { name: 'Send message' }).click();
      await page.getByText('2 MESSAGES').waitFor({ state: 'visible', timeout: 5000 });

      const rowTexts = await page.locator('ul li p').allTextContents();
      check(
        'newest-first: the most recently posted message renders ABOVE the older one',
        rowTexts[0] === 'Second message (newer)' && rowTexts[1] === 'Cannot wait for this one!!',
        JSON.stringify(rowTexts)
      );

      await page.reload({ waitUntil: 'networkidle' });
      const rowTextsAfterReload = await page.locator('ul li p').allTextContents();
      check(
        'newest-first: ordering survives a reload (server truth, not just optimistic client prepend)',
        rowTextsAfterReload[0] === 'Second message (newer)' && rowTextsAfterReload[1] === 'Cannot wait for this one!!',
        JSON.stringify(rowTextsAfterReload)
      );
      await page.close();
    }

    // Each moderation code shows its OWN distinct ratified string in the UI.
    {
      const uiCases = [
        { message: '   ', expected: 'Type something first.' },
        { message: 'a'.repeat(81), expected: 'Keep it under 80 characters.' },
        { message: 'this is spam', expected: "That message isn't allowed. Try something else." },
        { message: 'aaaaaaa', expected: 'Looks like spam — try rewriting that.' },
        { message: 'check out https://spam-deals.example now', expected: "Links aren't allowed here." },
      ];
      const slug = await createTimer('QA e2e: browser moderation errors');
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      await page.goto(APP + '/t/' + slug, { waitUntil: 'networkidle' });
      const input = page.getByLabel('Share the hype');
      await input.waitFor({ state: 'visible' });

      const seen = new Set();
      for (const c of uiCases) {
        await input.fill('');
        // maxLength=80 client-side clamps typed/pasted text; use JS fill to bypass
        // for the 81-char case so the server's message_too_long path is exercised.
        await input.evaluate((el, val) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }, c.message);
        await page.getByRole('button', { name: 'Send message' }).click();
        const errorEl = page.locator('#hype-message-error');
        await errorEl.waitFor({ state: 'visible', timeout: 5000 });
        const text = (await errorEl.textContent())?.trim();
        check(`moderation UI: "${c.message.slice(0, 24)}…" → "${c.expected}"`, text === c.expected, `got "${text}"`);
        seen.add(text);
      }
      check('moderation UI: all 4 triggered errors are distinct strings (no generic collapse)', seen.size === uiCases.length, [...seen].join(' | '));
      await page.close();
    }

    // QA (2026-07-20): the 429 rate-limited path end-to-end in the real UI —
    // not previously covered by this suite. Exhausts the per-IP quota (default
    // 20/hour) via direct API calls (fast), then triggers the 429 through the
    // actual browser submit flow and asserts the ratified copy string renders
    // (docs/copy.md: "Too many messages. Try again in about {n} minutes.").
    // Deliberately reuses the always-present curated `gta-6` slug rather than
    // a fresh `createTimer()` call: the message rate limit is keyed per-IP
    // only (not per-slug, see docs/api.md), so which timer is used doesn't
    // matter here, and this suite is already right at the shared 20/hour
    // `POST /api/timers` budget across smoke.mjs + reactions.mjs + this file
    // (see the docstring note at the top) — no need to spend one more slot of
    // a DIFFERENT rate limit just to test this one.
    {
      const slug = 'gta-6';
      for (let i = 0; i < 20; i++) {
        await apiPostMessage(slug, `warm up ${i}`);
      }
      const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
      await page.goto(APP + '/t/' + slug, { waitUntil: 'networkidle' });
      const input = page.getByLabel('Share the hype');
      await input.waitFor({ state: 'visible' });
      await input.fill('one too many');
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/message') && r.request().method() === 'POST'),
        page.getByRole('button', { name: 'Send message' }).click(),
      ]);
      check('rate limit: submitting past the quota actually gets a 429 from the server', resp.status() === 429, String(resp.status()));
      check('rate limit: Retry-After header present on the 429 response', Boolean(resp.headers()['retry-after']), resp.headers()['retry-after']);
      const errorEl = page.locator('#hype-message-error');
      await errorEl.waitFor({ state: 'visible', timeout: 5000 });
      const text = (await errorEl.textContent())?.trim();
      check(
        'rate limit UI: shows the ratified "Too many messages. Try again in about {n} minute(s)." copy',
        /^Too many messages\. Try again in about \d+ minutes?\.$/.test(text),
        `got "${text}"`
      );
      await page.close();
    }

    // Mobile-width rendering (~375px). Reuses `emptyStateSlug` from the
    // desktop empty-state check above (see the comment there) — still empty,
    // since nothing was ever posted to it.
    {
      const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
      await page.goto(APP + '/t/' + emptyStateSlug, { waitUntil: 'networkidle' });
      const input = page.getByLabel('Share the hype');
      await input.waitFor({ state: 'visible' });
      const inputForm = page.locator('form').filter({ has: input });
      const box = await inputForm.boundingBox();
      check('mobile (375px): message input fits within the viewport width', Boolean(box) && box.width <= 375, `width=${box?.width}`);
      const emptyTitle = page.getByText('No messages yet.');
      await emptyTitle.waitFor({ state: 'visible' });
      check('mobile (375px): message list empty state visible', await emptyTitle.isVisible());
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

console.log(failures === 0 ? '\nRESULT: ALL CHECKS PASSED' : `\nRESULT: ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
