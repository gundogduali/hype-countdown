# content-moderator retro — 2026-07-20 15:42 (HM-3b — bare-URL ambiguous-TLD false positive)

## Task
Fix the false-positive class `code-reviewer` found in `checkBareUrl`'s bare `word.tld` heuristic
(report: `.claude/retros/code-reviewer-2026-07-20.md`; PM decision recorded in
`.claude/state/BOARD.md` under HM-3b): TLDs that are also common English words/abbreviations
(`.gg .co .to .me .tv .club .biz .dev`, and similar ones I found on review) caused casual phrases
like `"so hyped for this game.gg"` to be wrongly flagged as links. PM decision: favor precision
over recall — restrict the bare-domain heuristic to an unambiguous-TLD allowlist only, dropping
the ambiguous colloquial TLDs from the list entirely (accepted trade-off, not a bug to "fully fix").

## What I changed
- **`backend/src/config/moderation.json`** — this was a config-only fix, no code logic changed
  (`checkBareUrl` already took `tlds` as a parameter; the bug was in the data, not the algorithm).
  Replaced the 27-entry `urlTlds` list with a 9-entry unambiguous-only list:
  `com net org io info link xyz app ly`.
  - `com net org io info link xyz app` — exactly the PM's given example list; not re-litigated.
  - `ly` — the one deliberate addition beyond the PM's example. Reasoning (documented in the new
    `_urlTldsReadme` field): `ly` is not itself a standalone English word (only a suffix), so it
    cannot appear as the first word of a second clause glued to a period with no space — the
    specific failure mode this fix targets. It also remains a real, common link-shortener TLD
    (bit.ly-style), so keeping it preserves genuine recall without reintroducing the false-positive
    risk class.
  - Dropped, with reasoning per group:
    - PM-named ambiguous set: `co dev me tv club biz gg to` (company/developer/pronoun/television/
      club/business/gaming-slang/preposition).
    - Additional ones I found by applying the same test: `shop top win click` (all common nouns/
      verbs — "a shop", "on top", "a win", "one click"); `gl` (gaming slang "good luck", same
      family as the PM-flagged `gg`); `cc` (informal abbreviation, "carbon copy", same ambiguity
      class as the PM-flagged `biz`/`dev`); `us` (extremely common pronoun — arguably *more*
      ambiguous than several PM-named ones); `uk ai gov edu` (country/AI/government/education,
      increasingly used conversationally, e.g. "ai" as slang for artificial intelligence).
  - Kept `net org io info link xyz app com` unmodified per PM's explicit list (did not second-guess
    that `net`/`info`/`link`/`app` are themselves technically common words too — that's the PM's
    judgment call to make, not mine to relitigate, per the task's explicit instruction).
- **`backend/src/middleware/moderation.js`** — no logic change. Added a JSDoc block above
  `checkBareUrl` documenting the HM-3b history/trade-off inline (so a future reader of the code,
  not just the config file or docs, understands why the TLD list is deliberately short), and a
  reminder next to the `tlds` param not to add ambiguous words back in.
- **`docs/api.md`** — added an "Accepted trade-offs" numbered list under the HM-3 error table,
  documenting all 4 accepted trade-offs together for the first time in the API contract itself (the
  first 3 were previously only in my retro/code comments, not in `docs/api.md`): Cyrillic
  homoglyphs, plain-space-split domains, 6+ identical emoji, and the new ambiguous-TLD exclusion
  (HM-3b). Kept the existing 3 verbatim in substance, just centralized them here per the task's ask
  to "update the trade-offs documentation... alongside the three you already documented."
- **`backend/test/moderation.test.js`** — added a `describe('HM-3b — ...')` block with 6 new tests.

## Bypass-attempt / regression tests written (Rule 5)
| Test | Result |
|---|---|
| Re-run the 3 exact false-positive examples from the code-reviewer's finding (`"so hyped for this game.gg"`, `"cant wait to see it live.to be honest"`, `"this is lit.club vibes"`) | all now `null` (not flagged) — confirmed fixed |
| Genuine spam links via explicit scheme: `https://spam-example.com/promo`, `www.spam-example.gg` | still caught (`message_contains_link`) — scheme/`www.` check is untouched by this fix and doesn't care about the TLD list at all |
| Genuine spam links via bare domain + unambiguous TLD: `spam.xyz`, `scam.link`, `totally-legit-site.com` | still caught — proves the narrowed list didn't silently stop catching everything |
| **Accepted trade-off, proven not just asserted**: bare-domain spam attempt using a *dropped* ambiguous TLD (`"check out spam.gg for free stuff"`, `"visit scam.to now"`, `"this deal is at deals.club today"`) | all `null` (missed) — this is the accepted trade-off from the PM decision, demonstrated empirically rather than just described in prose, exactly as this fix's task asked |

## Verification
- `node --test test/moderation.test.js` → 53/53 pass (was 47; +6 new tests, 0 regressions).
- `npm test` (full backend suite) → 102/102 pass (was 96; +6, nothing else broken).
- `git status --short` reviewed: my touches are confined to `backend/src/config/moderation.json`,
  `backend/src/middleware/moderation.js`, `backend/test/moderation.test.js`, and the HM-3 section of
  `docs/api.md` (an additive paragraph only — did not touch the pre-existing RX-3 content in that
  file, which was `backend-developer`'s parallel work). No routes, no data model, no RX-3/share-card
  files touched.

## Self-review before closing
Re-read the acceptance criteria line by line against what I built:
- Exact false-positive examples pass — verified above.
- Genuine spam links (scheme, `www.`, unambiguous-TLD bare domain) still caught — verified above,
  with dedicated tests kept (not just relying on the old, already-existing scheme/www tests).
- Trade-offs doc updated as a 4th item alongside the other 3 — done in `docs/api.md`, plus inline
  in the config file and the code comment (three places, not just one, since this is a config-data
  decision that future editors of any of those three files should see).
- `npm test` passes — 102/102.
- Bypass/edge test proving the trade-off is real, not just claimed — the `spam.gg`/`scam.to`/
  `deals.club` test does exactly this.
No bugs found in this pass; the fix is data-only (no algorithm change), which kept the risk surface
small — I did not touch `checkBareUrl`'s regex logic, only the list it's parameterized with.

## Lessons learned
No new repeatable-mistake pattern from this task — it was a scoped, well-specified config fix with
the trade-off and acceptance criteria already fully decided by the PM, so there was little room for
me to reintroduce my own class of bug. No new line added to the "Lessons Learned" section of
`.claude/agents/content-moderator.md` this round.
