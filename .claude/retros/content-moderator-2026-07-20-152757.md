# content-moderator retro — 2026-07-20 15:27:57 (second forced review pass, HM-3)

## Context
This is a second, forced self-correction pass on top of my first closing-protocol pass earlier
today (`.claude/retros/content-moderator-2026-07-20.md`). Everything from that first retro still
stands (46 tests, blocklist/length/spam/sanitize checks, docs/api.md error table, scope respected).
This retro covers only what changed in this pass.

## What I did
Re-examined `checkBlocklist` specifically for false-positive risk, since that's the check most
likely to have subtle boundary bugs that my first pass's happy-path/bypass tests didn't probe from
the "innocent text wrongly blocked" angle (I had one false-positive test, `"class of 2026"`, but
only for single-word terms — I had not tried a false positive against a **multi-word** blocklist
phrase).

## What I found (real bug)
`checkBlocklist`'s original code deliberately skipped `\b` word-boundary anchoring for multi-word
phrases (comment: "multi-word terms ... don't get clean \b boundaries around the internal space
... so escape+substring is enough") and fell back to a raw substring test. That reasoning was
wrong: `\b` only needs to anchor the two *ends* of the whole matched span, not each internal word —
so it does work correctly for phrases too, and the "substring is enough" fallback was actually a
regression risk, not a simplification.

Concretely: the blocklist contains the phrase `"dm me"`. Plain substring matching flagged
`"lets dm meet you tomorrow"` as blocked content, because `"dm me"` is a literal substring of
`"dm meet"` — a completely innocent message about meeting someone would have been rejected.
Same class of bug: `"follow me"` as a substring of `"follow mentors"`.

Verified with a script before fixing:
```
checkBlocklist('lets dm meet you tomorrow')  →  { code: 'message_blocked_content', ... }  // WRONG
```

## Fix
Removed the phrase/single-word branch and always anchor with `\b` on both ends of the escaped term
(`new RegExp('\\b' + escaped + '\\b')`), regardless of whether the term contains internal spaces.
`\b` at the very start/end of a multi-word phrase correctly requires a word/non-word transition
there, which rejects `"dm meet"` (position after "me" inside "meet" is word-to-word, no boundary)
while still accepting `"dm me"` as a clean word, and still accepting existing legitimate phrase
matches like `"kill yourself"`.

Verified after fixing:
```
checkBlocklist('lets dm meet you tomorrow')      → null                        // fixed
checkBlocklist('just dm me later')                → message_blocked_content     // still catches the real phrase
checkBlocklist('follow mentors like this')        → null                        // same class of fix
checkBlocklist('follow me for more')              → message_blocked_content     // still catches the real phrase
checkBlocklist('you should kill yourself')        → message_blocked_content     // pre-existing phrase match unaffected
```

Added a regression test (`test/moderation.test.js`, "multi-word blocklist phrases still require a
real word boundary, not just a substring match") covering both the false-positive case and the
true-positive case side by side, so this can't silently regress again.

## Verification
- `node --test test/moderation.test.js` → 47/47 pass (was 46; +1 regression test).
- `npm test` (full backend suite) → 96/96 pass (was 95; +1 test, nothing else broken).
- Scope re-confirmed via `git status`: only `docs/api.md` (pre-existing additive edit from the
  first pass), `backend/src/middleware/`, `backend/src/config/`, `backend/test/moderation.test.js`
  touched. No routes, no data model, no RX-3 files touched.

## What the orchestrator needs to know
- The blocklist false-positive bug (multi-word phrases matching as raw substrings) is fixed and
  regression-tested. This was a real correctness bug that would have caused innocent user messages
  to be wrongly rejected in production once HM-4 wires the route — worth knowing since HM-4/QA
  should not need to independently rediscover it, and HM-7 (security review) can treat this
  specific class of bug as already closed.
- No other new issues found in this pass; all conclusions/limitations from the first retro
  (Cyrillic homoglyphs not caught, plain-space-split domains without a "dot"/scheme marker not
  caught, 6+ identical emoji flagged as flood by design) still stand as documented trade-offs, not
  bugs.

## Lesson learned
Added a line to `.claude/agents/content-moderator.md`'s Lessons Learned section: when writing a
word-boundary regex for a blocklist/wordlist check, don't special-case multi-word phrases into a
plain substring match on the assumption that `\b` "doesn't work well" with internal spaces — anchor
the *whole* term with `\b` on both ends regardless of internal spaces; substring-only matching on
phrases is a false-positive trap (e.g. blocking "meet" because it contains "me").
