import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Builds filler text of an exact length that won't accidentally trip the
 * repeated-character-flood check (unlike `'a'.repeat(n)`, which is itself
 * spam-shaped) or the blocklist — used to test length boundaries in isolation.
 */
function filler(length) {
  const pattern = 'abcdefghij';
  let out = '';
  while (out.length < length) out += pattern;
  return out.slice(0, length);
}
import {
  moderateText,
  moderationMiddleware,
  checkLength,
  checkBlocklist,
  checkRepeatedCharFlood,
  checkBareUrl,
  sanitizeText,
  normalizeForDetection,
  createDuplicateGuard,
  DEFAULT_MAX_LENGTH,
} from '../src/middleware/moderation.js';

/** Minimal req/res mocks, same shape as test/rate-limit.test.js. */
function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function runMiddleware(mw, body) {
  const req = { body };
  const res = makeRes();
  let nextCalled = false;
  mw(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
}

describe('checkLength', () => {
  test('accepts text just under the limit', () => {
    assert.equal(checkLength('a'.repeat(DEFAULT_MAX_LENGTH - 1)), null);
  });

  test('accepts text exactly at the limit', () => {
    assert.equal(checkLength('a'.repeat(DEFAULT_MAX_LENGTH)), null);
  });

  test('rejects text just over the limit', () => {
    const result = checkLength('a'.repeat(DEFAULT_MAX_LENGTH + 1));
    assert.equal(result.code, 'message_too_long');
  });

  test('rejects empty string', () => {
    assert.equal(checkLength('').code, 'invalid_message');
  });
});

describe('moderateText — empty / whitespace-only rejection', () => {
  test('rejects empty string', () => {
    const r = moderateText('');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid_message');
  });

  test('bypass attempt: whitespace-only text (spaces, tabs, newlines) is still rejected', () => {
    const r = moderateText('   \t\n  ');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid_message');
  });

  test('rejects non-string input (e.g. a number or object slipped through JSON parsing)', () => {
    assert.equal(moderateText(42).code, 'invalid_message');
    assert.equal(moderateText({ text: 'hi' }).code, 'invalid_message');
    assert.equal(moderateText(null).code, 'invalid_message');
    assert.equal(moderateText(undefined).code, 'invalid_message');
  });

  test('accepts and trims ordinary text with leading/trailing whitespace', () => {
    const r = moderateText('  So hyped! 🔥  ');
    assert.equal(r.ok, true);
    assert.equal(r.text, 'So hyped! 🔥');
  });
});

describe('moderateText — max length (bypass attempts: under / at / over)', () => {
  test('accepts a message just under 80 chars', () => {
    const r = moderateText(filler(79));
    assert.equal(r.ok, true);
  });

  test('accepts a message at exactly 80 chars', () => {
    const r = moderateText(filler(80));
    assert.equal(r.ok, true);
  });

  test('rejects a message at 81 chars (just over)', () => {
    const r = moderateText(filler(81));
    assert.equal(r.ok, false);
    assert.equal(r.code, 'message_too_long');
  });

  test('bypass attempt: padding with leading/trailing whitespace does not let long text sneak under the limit', () => {
    // 90 non-space chars padded with spaces that get trimmed before the length check —
    // the *content* is still 90 chars, so it must still be rejected.
    const r = moderateText(`   ${filler(90)}   `);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'message_too_long');
  });
});

describe('checkBlocklist — mixed-case and unicode-lookalike bypass attempts', () => {
  test('rejects an exact lowercase blocked word', () => {
    assert.equal(checkBlocklist('you are such a bitch honestly').code, 'message_blocked_content');
  });

  test('bypass attempt: mixed/random case ("BaDwOrD"-style) does not evade the blocklist', () => {
    // Using a real blocklist entry with scrambled case, as the task's own example describes.
    assert.equal(checkBlocklist('what a BiTcH move').code, 'message_blocked_content');
    assert.equal(checkBlocklist('FUCK this timer').code, 'message_blocked_content');
  });

  test('bypass attempt: fullwidth unicode look-alike characters are normalized (NFKC) before matching', () => {
    // Fullwidth Latin letters (U+FF01-FF5E block) spell the same word visually.
    const fullwidthShit = 'ｓｈｉｔ';
    assert.equal(normalizeForDetection(fullwidthShit), 'shit');
    assert.equal(checkBlocklist(`this is ${fullwidthShit} honestly`).code, 'message_blocked_content');
  });

  test('bypass attempt: zero-width characters inserted mid-word do not evade the blocklist', () => {
    const zwspWord = 'sh​it'; // zero-width space spliced into "shit"
    assert.equal(checkBlocklist(zwspWord).code, 'message_blocked_content');
  });

  test('bypass attempt: simple leetspeak substitution does not evade the blocklist', () => {
    assert.equal(checkBlocklist('sh1t happens').code, 'message_blocked_content');
  });

  test('does not flag clean text (no false positive on an unrelated word containing a blocked substring only via bad boundary)', () => {
    // "class" contains no blocked term; sanity check that legitimate hype text passes.
    assert.equal(checkBlocklist('So hyped for the class of 2026!'), null);
  });

  test('multi-word blocklist phrases still require a real word boundary, not just a substring match', () => {
    // Regression: "dm meet" contains the phrase "dm me" as a raw substring, but
    // that's a legitimate word ("meet"), not the blocked phrase — must NOT match.
    assert.equal(checkBlocklist('lets dm meet you tomorrow'), null);
    // The actual phrase, properly bounded, must still match.
    assert.equal(checkBlocklist('just dm me later').code, 'message_blocked_content');
  });

  test('custom/injected blocklist config is honored (config-driven, no code change needed)', () => {
    assert.equal(checkBlocklist('this timer is totally bogus', ['bogus']).code, 'message_blocked_content');
    assert.equal(checkBlocklist('this timer is great', ['bogus']), null);
  });
});

describe('checkRepeatedCharFlood — repeated-character flooding', () => {
  test('rejects long identical-character runs ("aaaaaaaaaa")', () => {
    assert.equal(checkRepeatedCharFlood('aaaaaaaaaa').code, 'message_repeated_chars');
  });

  test('accepts short, legitimate repeats (e.g. "soooo hyped")', () => {
    assert.equal(checkRepeatedCharFlood('soooo hyped'), null);
  });

  test('bypass attempt: alternating case flooding ("AaAaAaAaAa") does not evade detection', () => {
    assert.equal(checkRepeatedCharFlood('AaAaAaAaAa').code, 'message_repeated_chars');
  });

  test('boundary: run just under the threshold is accepted, at/over the threshold is rejected', () => {
    assert.equal(checkRepeatedCharFlood('aaaaa'), null); // 5 repeats, threshold is 6
    assert.equal(checkRepeatedCharFlood('aaaaaa').code, 'message_repeated_chars'); // 6 repeats
  });
});

describe('checkBareUrl — bare URL / link detection', () => {
  test('rejects an obvious http(s) URL', () => {
    assert.equal(checkBareUrl('check this out https://evil-example.com/promo').code, 'message_contains_link');
  });

  test('rejects a bare "www." link with no scheme', () => {
    assert.equal(checkBareUrl('go to www.example.com now').code, 'message_contains_link');
  });

  test('rejects a bare domain-looking string even without www/scheme', () => {
    assert.equal(checkBareUrl('free stuff at totally-legit-site.xyz').code, 'message_contains_link');
  });

  test('does not flag ordinary text with a period (no false positive)', () => {
    assert.equal(checkBareUrl('So hyped. Cant wait.'), null);
  });

  test('bypass attempt: URL split with spaces across "allowed characters" is still caught', () => {
    const r = checkBareUrl('h t t p s : / / e v i l . c o m');
    assert.equal(r && r.code, 'message_contains_link');
  });

  test('bypass attempt: "dot" spelled out instead of "." is still caught', () => {
    const r = checkBareUrl('visit evil dot com right now');
    assert.equal(r && r.code, 'message_contains_link');
  });

  test('bypass attempt: fullwidth unicode look-alike dot/colon is normalized before matching', () => {
    const r = checkBareUrl('ｗｗｗ．evil．com');
    assert.equal(r && r.code, 'message_contains_link');
  });

  describe('HM-3b — ambiguous-word TLDs dropped from the bare-domain heuristic', () => {
    // code-reviewer (2026-07-20) found these exact phrases were false-positiving
    // because .gg/.to/.club (and similar) are also common English words/slang.
    test('false positive fix: "so hyped for this game.gg" is no longer flagged', () => {
      assert.equal(checkBareUrl('so hyped for this game.gg'), null);
    });

    test('false positive fix: "cant wait to see it live.to be honest" is no longer flagged', () => {
      assert.equal(checkBareUrl('cant wait to see it live.to be honest'), null);
    });

    test('false positive fix: "this is lit.club vibes" is no longer flagged', () => {
      assert.equal(checkBareUrl('this is lit.club vibes'), null);
    });

    test('genuine spam links are still caught: http(s):// and www. schemes', () => {
      assert.equal(checkBareUrl('check this out https://spam-example.com/promo').code, 'message_contains_link');
      assert.equal(checkBareUrl('go to www.spam-example.gg now').code, 'message_contains_link');
    });

    test('genuine spam links are still caught: bare domains using the unambiguous-TLD allowlist', () => {
      assert.equal(checkBareUrl('check out spam.xyz').code, 'message_contains_link');
      assert.equal(checkBareUrl('visit scam.link').code, 'message_contains_link');
      assert.equal(checkBareUrl('free stuff at totally-legit-site.com').code, 'message_contains_link');
    });

    test('accepted trade-off (proven, not just asserted): a bare-domain spam link using a ' +
      'dropped ambiguous TLD is NOT caught by this check alone', () => {
      // "spam.gg" looks exactly like the caught "spam.xyz"/"scam.link" cases above, but .gg was
      // deliberately dropped (see moderation.json's _urlTldsReadme) because it's also gaming
      // slang ("good game"). This is the accepted precision-over-recall trade-off from HM-3b,
      // not a leftover bug — it's still only reachable via bare-domain phrasing; an explicit
      // scheme or www. prefix on the same domain is still caught (previous test).
      assert.equal(checkBareUrl('check out spam.gg for free stuff'), null);
      assert.equal(checkBareUrl('visit scam.to now'), null);
      assert.equal(checkBareUrl('this deal is at deals.club today'), null);
    });
  });
});

describe('sanitizeText — HTML/script defense in depth', () => {
  test('escapes angle brackets and quotes so embedded markup cannot execute', () => {
    const out = sanitizeText('<script>alert(1)</script>');
    assert.equal(out.includes('<script>'), false);
    assert.equal(out, '&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('bypass attempt: an img/onerror XSS payload is neutralized', () => {
    const out = sanitizeText(`<img src=x onerror="alert('xss')">`);
    assert.equal(/<img/i.test(out), false);
    assert.ok(out.includes('&lt;img'));
    assert.ok(out.includes('&#39;'));
  });

  test('strips newlines/control characters (single-line field) and collapses whitespace', () => {
    const out = sanitizeText('line one\nline\ttwo');
    assert.equal(out, 'line one line two');
  });

  test('leaves ordinary emoji/text untouched aside from escaping', () => {
    assert.equal(sanitizeText('So hyped for this 🔥'), 'So hyped for this 🔥');
  });
});

describe('moderateText — full pipeline ordering and accepted-text sanitization', () => {
  test('happy path: accepted text is trimmed and HTML-escaped, ready to store', () => {
    const r = moderateText('  Cant wait for <this>! 🎉  ');
    assert.equal(r.ok, true);
    assert.equal(r.text, 'Cant wait for &lt;this&gt;! 🎉');
  });

  test('rejects on blocklist even when the text also contains HTML (fails closed before sanitizing)', () => {
    const r = moderateText('<b>this is shit</b>');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'message_blocked_content');
  });

  test('length is checked before spam-pattern/blocklist checks (fails fast on the cheapest check)', () => {
    const r = moderateText('a'.repeat(200));
    assert.equal(r.ok, false);
    assert.equal(r.code, 'message_too_long');
  });
});

describe('moderationMiddleware — Express integration surface', () => {
  test('calls next() and replaces req.body.text with sanitized text on success', () => {
    const mw = moderationMiddleware();
    const { req, res, nextCalled } = runMiddleware(mw, { text: '  Hyped! <3  ' });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
    assert.equal(req.body.text, 'Hyped! &lt;3');
  });

  test('responds 400 with a stable error code and does not call next() on rejection', () => {
    const mw = moderationMiddleware();
    const { res, nextCalled } = runMiddleware(mw, { text: 'https://evil.com click here' });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'message_contains_link');
    assert.ok(typeof res.body.error.message === 'string' && res.body.error.message.length > 0);
  });

  test('supports a custom field name', () => {
    const mw = moderationMiddleware({ field: 'message' });
    const { req, nextCalled } = runMiddleware(mw, { message: 'Hi there' });
    assert.equal(nextCalled, true);
    assert.equal(req.body.message, 'Hi there');
  });

  test('missing field on the body is rejected with invalid_message, not a crash', () => {
    const mw = moderationMiddleware();
    const { res, nextCalled } = runMiddleware(mw, {});
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'invalid_message');
  });
});

describe('createDuplicateGuard — optional repeated-identical-submission helper', () => {
  test('first submission for a key is never a duplicate', () => {
    const isDup = createDuplicateGuard();
    assert.equal(isDup('device-1', 'hello'), false);
  });

  test('the exact same text from the same key within the window is flagged as a duplicate', () => {
    const clock = { t: new Date('2026-07-20T10:00:00.000Z') };
    const isDup = createDuplicateGuard({ windowMs: 60_000, now: () => clock.t });
    assert.equal(isDup('device-1', 'hello'), false);
    assert.equal(isDup('device-1', 'hello'), true);
  });

  test('different text from the same key is not a duplicate', () => {
    const isDup = createDuplicateGuard();
    assert.equal(isDup('device-1', 'hello'), false);
    assert.equal(isDup('device-1', 'goodbye'), false);
  });

  test('the same text after the window has elapsed is not flagged', () => {
    const clock = { t: new Date('2026-07-20T10:00:00.000Z') };
    const isDup = createDuplicateGuard({ windowMs: 1000, now: () => clock.t });
    assert.equal(isDup('device-1', 'hello'), false);
    clock.t = new Date(clock.t.getTime() + 2000);
    assert.equal(isDup('device-1', 'hello'), false);
  });

  test('different keys (submitters) do not interfere with each other', () => {
    const isDup = createDuplicateGuard();
    assert.equal(isDup('device-1', 'hello'), false);
    assert.equal(isDup('device-2', 'hello'), false);
  });
});
