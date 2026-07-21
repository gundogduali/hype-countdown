# QA retro — SC-6 (Social Share Card) + HM-6 (Hype Messages) — 2026-07-20

## Scope
Independent end-to-end verification of PRD §9.1 (Social Share Card: og-image route +
SC-5 HTML templating) and §9.3 (Hype Messages: moderation + route + frontend), as a
real user/attacker, not by re-trusting the developer/content-moderator retros.

## What I tested (live, against my own instances)
- Booted a dedicated backend on `PORT=3094` with a scratch `DB_PATH`, once API-only and
  once with `STATIC_DIR` pointed at a fresh `npm run build` of the frontend.
- Booted a second backend on `PORT=3095` + Vite dev server on port `5183`
  (`API_PROXY_TARGET`) for real-browser (playwright-core + system Chrome) checks.
- SC-6: curled `og-image.png` for a curated slug, an unknown slug, a very-long-title
  custom timer, a real already-expired curated timer (`world-cup-2026-final` — its
  2026-07-19 target has already passed as of today, 2026-07-20, so this was a genuine
  expired case, not simulated), and a title mixing Japanese/Arabic/emoji. Visually
  inspected all four rendered PNGs (Read tool on the image bytes) — no overflow, correct
  ended-state gradient heading, full-color emoji, correct RTL Arabic glyph rendering, no
  tofu boxes. Curled `/t/:slug` (prod static mode) for a curated and a custom slug and
  confirmed real `og:title`/`og:description`/`og:image`/`og:url`/`twitter:card` with
  absolute URLs and live timer data (not placeholders). Attempted an HTML/script/quote
  injection title (`<script>alert(1)</script> "XSS" & friends`) and confirmed it is
  fully escaped in the HTML response (0 raw occurrences, correctly `&lt;`/`&quot;`
  encoded). Confirmed `/`, `/create`, and an unknown `/t/:slug` all return the plain
  static `index.html` unaffected (0 `og:title` occurrences). Fired 8 concurrent requests
  at a brand-new (uncached) custom timer's og-image to spot-check the single-flight
  stampede guard live (all 200, low/consistent latency).
- HM-6: posted a valid message via the real API and confirmed newest-first ordering via
  `GET .../messages`. As an attacker: 81-char message, `aaaaaaa` flood, mixed-case
  blocklist word, `http://`, `www.`, and bare `word.tld` (`.com`) link forms — all
  correctly rejected with their exact documented `code`. Additionally tried (via the
  isolated `moderateText` function, to avoid burning the live rate-limit budget)
  leetspeak (`sh1t`), a zero-width-space-split word, spelled-out `dot` evasion, a 6-emoji
  flood, fullwidth-unicode blocklist evasion, and a scrambled-case multi-trick blocklist
  entry — all correctly caught. Confirmed the Cyrillic-homoglyph and ambiguous-TLD
  (`.gg`) trade-offs are real and understood, not bugs (see Findings). Triggered the real
  20/hour `429 rate_limited` path and confirmed `Retry-After` is present and the exact
  number of seconds/minutes is honored end-to-end into the UI's ratified copy. Verified
  the empty state, `{n} MESSAGES` header, and full moderation-copy mapping in a real
  Chrome browser via playwright-core against the live dev server (not mocked).
- Ran the full backend `npm test` (141/141, twice in a row) and the frontend e2e suite
  (`smoke.mjs`, `reactions.mjs`, `messages.mjs`) against my own fresh instances, confirming
  a clean run passes end to end (and confirming, deliberately, that a second run against
  the SAME long-lived DB without a restart correctly fails on rate-limited routes — an
  expected characteristic of this project's "real HTTP against a real server" e2e style,
  already precedented by `smoke.mjs`'s own timer-creation rate-limit caveat).

## Findings
1. **[Informational / not filed as a bug]** `docs/api.md`'s own cited example for the
   HM-3b ambiguous-TLD trade-off (`"spam.gg"`) is *still* rejected end-to-end — but via
   `message_blocked_content` (the word "spam" is independently on the blocklist), not
   because the link check caught the `.gg` TLD. Confirmed via curl that a collision-free
   phrase (`"check game.gg later"`) sails through as `201`, proving the trade-off is real
   and working as designed. Someone testing with the docs' own example and expecting a
   `message_contains_link` rejection could wrongly conclude the trade-off "doesn't work";
   it does, just via a different, independent check. No code change needed — I added an
   explicit route-level regression test asserting both halves of this (see Tests).
2. **[Low severity / documentation gap, not a bug]** The per-IP message rate limiter
   (`messageLimiter` in `app.js`) runs as Express middleware *before* the moderation
   check in `routes/timers.js`, so a submission that is ultimately **rejected** by
   moderation still consumes one slot of the 20/hour quota — not just accepted (`201`)
   ones. I verified this live (my own bypass-attempt curls exhausted the quota well
   before 20 *successful* posts) and added a dedicated regression test
   (`backend/test/api.test.js`: "rate limit also counts moderation-REJECTED
   submissions"). This is a defensible design (it also stops unlimited free attempts to
   probe the moderation filter for a bypass) and matches the same pattern already used
   for `POST /api/timers`'s creation limiter, but `docs/api.md`'s `rate_limited` row for
   messages doesn't currently spell this out. Recommend a one-line doc clarification;
   not blocking sign-off.

No other bugs found. All PRD §9.1/§9.3 acceptance-criteria bullets passed (see final
report to orchestrator for the full itemized checklist).

## Tests written/extended
- `backend/test/api.test.js`: 2 new tests — (a) end-to-end proof of the HM-3b
  ambiguous-TLD trade-off through the real route (both the "not blocked" and "the docs'
  own cited example is still blocked, but via blocklist" halves), (b) proof that
  moderation-rejected submissions still consume the per-IP rate-limit quota.
- `frontend/e2e/messages.mjs` (existing HM-5 suite, extended): added a real-browser
  newest-first-ordering check (2 posts, verify DOM order + survives reload) and a real
  browser 429-rate-limited check (exhausts the quota via direct API calls, then triggers
  the 429 through the actual submit button and asserts the exact ratified copy string
  renders) — both were previously untested gaps in the existing suite. Added a docstring
  caveat (matching `smoke.mjs`'s existing convention) that running this script exhausts
  the whole-hour message quota for that IP, so a second run against the same long-lived
  backend needs a fresh `DB_PATH`.
- Ran `npm test` (backend, 141/141 twice in a row) and all three frontend e2e scripts
  clean against fresh instances before finishing.

## What I could not test
- SC-6 AC3 ("cache must not serve a stale image after a seed update") was verified via
  code reading + the existing/passing automated cache-key test (`og.test.js`: "cache key
  includes title/target_at: an edited snapshot never serves a stale render"), not by
  actually editing the seed list file and restarting the server — that would require
  touching a business-logic/config file beyond what's needed to run the server, which is
  out of scope per my constraints. Given custom timers have no edit endpoint (MVP) and
  the cache key construction is simple/deterministic, I'm confident in this as a
  code-review-backed "passed", not a live click-through.
- Did not test actual link-unfurl behavior in WhatsApp/Twitter/Discord/iMessage
  themselves (no way to do that from this sandboxed environment) — verified the
  contractual HTML/meta-tag output instead, which is the testable surface.

## Process notes
- Found and killed an orphaned `node src/server.js` process (PID 24623, port 3095) at
  the start of my session — its env showed the exact same `CLAUDE_CODE_SESSION_ID` as
  mine, so it was a leftover from an earlier subagent turn in this same orchestrator
  session (STATIC_DIR pointed at `frontend/dist`, DB at a `sc5.db` scratch path — almost
  certainly SC-5 QA/dev work). Confirms the task's warning that this exact stall class
  hit other agents today; killing by exact PID (after confirming via `ps`/`lsof`, not by
  a `pkill -f` pattern match) was the right approach per my own existing lesson below.
- All servers/processes I started this session were confirmed dead via `ps aux` and
  `lsof -i` before finishing; no lingering listeners on 3094/3095/5183.

## Lessons Learned (existing, not newly added this session)
No new repeatable mistake pattern found this session — the existing lessons (isVisible()
not waiting, shadow-DOM number components, `pkill -f` not matching leading-env-var
process invocations) were already correctly applied (I killed the orphaned process by
exact PID, and used `waitForResponse`/`Promise.all` + `waitFor({state:'visible'})`
throughout the new playwright checks).
