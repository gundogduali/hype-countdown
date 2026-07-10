import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/services/rate-limit.js';

/** Minimal req/res mocks to exercise the middleware without an HTTP server. */
function makeRes() {
  const res = {
    headers: {},
    statusCode: null,
    body: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
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

function hit(limiter, ip = '10.0.0.1') {
  const res = makeRes();
  let nextCalled = false;
  limiter({ ip }, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

describe('rate-limit message wording', () => {
  test('singular "minute" when the remaining window rounds to 1', () => {
    const clock = { t: new Date('2026-07-07T10:00:00.000Z') };
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => clock.t });

    assert.equal(hit(limiter).nextCalled, true);
    const { res, nextCalled } = hit(limiter);
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error.code, 'rate_limited');
    assert.equal(
      res.body.error.message,
      'You have created too many timers. Try again in 1 minute.'
    );
  });

  test('plural "minutes" when the remaining window rounds to more than 1', () => {
    const clock = { t: new Date('2026-07-07T10:00:00.000Z') };
    const limiter = createRateLimiter({ limit: 1, windowMs: 120_000, now: () => clock.t });

    assert.equal(hit(limiter).nextCalled, true);
    const { res } = hit(limiter);
    assert.equal(res.statusCode, 429);
    assert.match(res.body.error.message, /Try again in 2 minutes\.$/);
  });
});
