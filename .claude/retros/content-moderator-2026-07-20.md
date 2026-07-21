# content-moderator retro — 2026-07-20 (HM-3)

## Task
Build `backend/src/middleware/moderation.js` — standalone, stateless moderation middleware for
Hype Messages (PRD §9.3), plus its config and its own unit tests. No route, no data model (HM-4).

## What was built
- `backend/src/config/wordlist.json` — extensible blocklist (`blocklist: string[]`), a starter
  English profanity/spam-term list. Adding a term = editing this file, no code change.
- `backend/src/config/moderation.json` — `maxLength` (80), `repeatedCharMinRun` (6), `urlTlds`.
- `backend/src/middleware/moderation.js` — separable, independently exported functions:
  - `checkLength(text, maxLength)` — empty/whitespace-only + max-length (config-driven).
  - `checkBlocklist(text, blocklist)` — case-insensitive, NFKC-unicode-normalized,
    zero-width-char-stripped, light leetspeak-folded, word-boundary matched.
  - `checkRepeatedCharFlood(text, minRun)` — lowercased before matching so alternating-case
    flooding is still caught; default threshold 6 same chars in a row.
  - `checkBareUrl(text, tlds)` — catches `http(s)://`, `www.`, and bare `word.tld`; also
    collapses spelled-out `dot`/`[dot]`/`(dot)` evasions and fully-whitespace-stripped
    scheme/host splitting (`h t t p s : / /`).
  - `sanitizeText(text)` — strips control chars/newlines (single-line field), collapses
    whitespace, HTML-escapes `& < > " ' \``.
  - `moderateText(rawText, config)` — orchestrates all of the above in order (length → repeated
    chars → URL → blocklist → sanitize), returns `{ ok: true, text }` or
    `{ ok: false, code, message }`.
  - `moderationMiddleware({ field = 'text', config })` — Express middleware wrapper: on success
    replaces `req.body[field]` with the sanitized text and calls `next()`; on failure responds
    `res.status(400).json({ error: { code, message } })` directly (matches the project's error
    body shape) and does not call `next()`.
  - `createDuplicateGuard({ windowMs, now })` — **bonus, opt-in, not wired into the default
    pipeline.** A stateless in-memory helper (same shape as `services/rate-limit.js`) HM-4 can use
    per submitter key to catch exact-repeat flooding. Included because my own agent file's Rule 2
    lists "repeated identical submissions" as a spam signal, but this specific task's numbered
    list (and PRD §9.3's checklist) only calls out blocklist/repeated-chars/URLs/sanitize for
    HM-3 — so I did not force it into `moderateText`, just made it available.
- **Deliberately not implemented here**: per-submitter rate limiting. Both this task's explicit
  instructions and PRD §9.3 describe it as "beyond the moderation layer's own checks," reusing the
  project's existing per-IP `429 rate_limited` convention (`backend/src/services/rate-limit.js`) —
  that's HM-4's job when it wires the actual route.
- `docs/api.md` — new "Hype Messages — Moderation Layer (HM-3)" section documenting the 5 new
  error codes (`invalid_message`, `message_too_long`, `message_repeated_chars`,
  `message_contains_link`, `message_blocked_content`) ahead of the route existing, so HM-4 has a
  contract.
- `backend/test/moderation.test.js` — 46 tests, `node --test`, no server/DB needed.

## Signature contract for HM-4 (so it doesn't have to guess)
```js
import { moderateText, moderationMiddleware } from '../middleware/moderation.js';

// Pure function:
const result = moderateText(body.text);
// { ok: true, text: string } | { ok: false, code: string, message: string }

// Or as middleware directly in the route:
router.post('/:slug/message', moderationMiddleware(), (req, res) => {
  // req.body.text has already been replaced with the sanitized, accepted text.
});
```

## Bypass attempts tried (Rule 5) and results
| Rule | Bypass attempt | Result |
|---|---|---|
| Length | just under (79) / at (80) / over (81) chars | correctly accept/accept/reject |
| Length | pad long text with leading/trailing whitespace to see if trim hides true length | still rejected (`message_too_long`) — trim happens before the check, not instead of it |
| Empty | whitespace-only (`"   \t\n  "`) | rejected (`invalid_message`) |
| Empty | non-string input (number, object, null, undefined) | all rejected (`invalid_message`), no crash |
| Blocklist | mixed/random case (`"BiTcH"`, `"FUCK"`) | caught |
| Blocklist | fullwidth unicode look-alikes (`ｓｈｉｔ`) | caught via NFKC normalization |
| Blocklist | zero-width space spliced mid-word (`"sh​it"`) | caught via zero-width stripping |
| Blocklist | simple leetspeak (`"sh1t"`) | caught via leet-fold |
| Blocklist | false-positive check: `"classic"`, `"class of 2026"` | correctly NOT flagged (word-boundary matching) |
| Repeated-char flood | `"aaaaaaaaaa"` | caught |
| Repeated-char flood | alternating case (`"AaAaAaAaAa"`) | caught — lowercased before matching |
| Repeated-char flood | boundary: 5 reps (under) vs 6 reps (at threshold) | accept/reject correctly |
| Bare URL | `https://...`, `www....`, bare `word.tld` | all caught |
| Bare URL | scheme/host split by spaces (`"h t t p s : / / e v i l . c o m"`) | caught after a full whitespace-strip pass |
| Bare URL | spelled-out `"evil dot com"` | caught after "dot"-token collapsing |
| Bare URL | fullwidth unicode dot (`ｗｗｗ．evil．com`) | caught via NFKC |
| Bare URL | false-positive check: ordinary sentence with a period | correctly NOT flagged |
| Sanitization | `<script>...</script>`, `<img onerror=...>` | both neutralized (HTML-escaped) |
| Pipeline | HTML *and* a blocked word in the same message | rejected on blocklist before any sanitization happens (fail-closed ordering, not "sanitize then hope") |

## Bugs found and fixed during self-review (before closing)
1. **Test-writing bug** (not a module bug): my first draft of the length-boundary tests used
   `'a'.repeat(79)`/`(80)` as filler. That filler is itself 79/80 identical characters, so it
   tripped the repeated-character-flood check first and the tests failed for the wrong reason.
   Fixed by writing a `filler(n)` helper that cycles through 10 distinct letters — isolates the
   length check from the flood check in the test.
2. **Real module bug**: the bare-URL "dot"-evasion path (`"evil dot com"`) originally stripped
   *all* whitespace from the whole message before testing the `word.tld` regex. That glued
   trailing words onto the domain (`"evil.comrightnow"`), so the regex's end-of-domain boundary
   never matched and the bypass test failed — i.e., the check was silently not catching the
   spelled-out-dot evasion it was supposed to catch. Fixed by only fully-collapsing whitespace for
   the scheme/host (`http(s)://`, `www.`) patterns, and testing the bare `word.tld` pattern against
   a version that collapses `"dot"` tokens but preserves other whitespace, so `\b` word boundaries
   around the domain stay meaningful.

## Known, accepted limitations (not fixed — out of scope or intentional trade-off)
- Domain names split by plain spaces without an explicit "dot"/scheme marker (e.g.
  `"e v i l . c o m"` with no `www`/`http`/"dot" keyword) are not caught by the `word.tld` pattern,
  since collapsing all whitespace there would glue surrounding words onto the domain and break
  boundary matching (same failure mode as bug #2 above, on the legitimate side). The scheme/`www.`
  check does catch this shape when a scheme or `www.` is present.
  Cyrillic/Greek homoglyphs (e.g. Cyrillic а for Latin a) are not caught — NFKC does not fold
  cross-script confusables, only compatibility variants (fullwidth, some ligatures) within a
  script. A stronger confusables table (Unicode TR39) would be needed for that; flagged as a
  possible follow-up, not implemented since it's a heavier dependency for a v1 wordlist filter.
- 6+ identical emoji in a row (e.g. `"🔥🔥🔥🔥🔥🔥"`) is flagged as `message_repeated_chars`, same
  as `"aaaaaa"`. This is a literal, intentional reading of the PRD's "repeated-character flooding"
  rule applied uniformly, not an emoji-specific bug — but it is a plausible false positive for
  genuine enthusiasm. Threshold is config-driven (`repeatedCharMinRun` in `moderation.json`) if
  product wants to tune it later; left as spec'd rather than silently special-casing emoji.
- `createDuplicateGuard` is provided but not required/wired by this issue; HM-4 decides whether to
  use it and with which identity key (IP vs. device token), per PRD's existing rate-limit
  convention discussion.

## Verification
`node --test test/moderation.test.js` → 46/46 pass (isolated, no server/DB).
Full backend suite `npm test` → 95/95 pass (46 new + 49 pre-existing, nothing else broken).

## Scope check
Touched only: `backend/src/middleware/moderation.js`, `backend/src/config/wordlist.json`,
`backend/src/config/moderation.json`, `backend/test/moderation.test.js`, and an additive section
in `docs/api.md`. Did not touch `backend/src/routes/*`, any data model, or the parallel RX-3
reactions work (`backend/src/services/reactions.js`, `backend/src/routes/timers.js`,
`backend/src/services/rate-limit.js`, `backend/src/app.js`, `backend/src/db/index.js` — all
modified by `backend-developer` in parallel, confirmed via `git status` as pre-existing changes I
did not make).

## Lessons learned
Added one line to `.claude/agents/content-moderator.md`'s Lessons Learned section (see below).
