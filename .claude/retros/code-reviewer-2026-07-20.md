# Code Reviewer Retro — 2026-07-20 (RX-3 + HM-3 joint review)

## Task
Review two independently-landed atomic issues: RX-3 (Hype Reactions backend, `backend-developer`)
and HM-3 (Hype Messages moderation middleware, `content-moderator`). Verify empirically, not on
the strength of the retros alone.

## What I did
- Read both agents' retros (including the forced second-pass retros) and diffed the two agent
  definition files against them.
- Read every changed/new file line by line: `backend/src/db/index.js`, `backend/src/services/reactions.js`,
  `backend/src/routes/timers.js`, `backend/src/services/rate-limit.js`, `backend/src/app.js`,
  `backend/src/middleware/moderation.js`, `backend/src/config/{wordlist,moderation}.json`, and the
  new sections of `docs/api.md`.
- Ran `npm test` myself twice (before and after my exploration) — 96/96 both times, no code changes
  needed on my part.
- Independently reproduced, rather than trusted, the two retros' strongest empirical claims:
  - Wrote a standalone script opening two separate `DatabaseSync` handles on the same file and
    firing the same `(slug, emoji, ip)` react call from both — confirmed exactly one `added: true`
    and both handles agreeing on a final count of 1. The PRIMARY KEY on `reaction_marks` really is
    doing the work.
  - Deliberately triggered a genuine *different* SQLite error (FOREIGN KEY violation, via a
    nonexistent slug fed straight to `ReactionService.react`, bypassing the route's 404 guard) and
    confirmed the `/UNIQUE/.test(err.message)` branch correctly re-threw it rather than swallowing
    it as "already reacted."
  - Ran `checkBlocklist` against the exact false-positive/true-positive pairs from the HM-3 retro
    (`"lets dm meet you tomorrow"` vs `"just dm me later"`, `"follow mentors..."` vs `"follow me..."`)
    plus my own additions (Scunthorpe-style words: "classic", "dickens", "spammy", "Mississippi",
    "assassin", "pissed") — all resolved correctly, no reintroduced false positive, no lost true
    positive.
  - Probed `checkBareUrl`'s bare `word.tld` heuristic with realistic casual Hype-message phrasing
    and found a real, previously-undocumented false-positive class: common English words/abbreviations
    that are also TLDs in the config (`.dev`, `.co`, `.gg`, `.to`, `.biz`, `.club`, `.tv`, `.me`) get
    flagged as links whenever a user types a period with no following space before them — e.g.
    "so hyped for this game.gg", "cant wait to see it live.to be honest", "this is lit.club vibes".
    This is a distinct failure mode from the three trade-offs the retro already documented
    (Cyrillic homoglyphs, plain-space-split domains, 6+ emoji flood) — those were about *missed*
    detections; this one is about *wrongly rejecting* ordinary messages. Reported as a finding
    rather than fixed directly, since the right fix (drop ambiguous-word TLDs from the bare-domain
    list vs. require whitespace before/after the domain vs. keep as-is and accept the trade-off) is
    a product/config decision, not a one-line bug fix.
  - Also flagged a PRD-vs-implementation ambiguity: PRD §9.2 says "at most once per emoji per
    rate-limit window," but the shipped constraint is a permanent, un-expiring per-(slug, emoji, ip)
    uniqueness — the same IP can never react again with that emoji on that timer, ever, not just
    within a window. Plausibly an intentional simplification (and it's what `docs/api.md` documents
    as the actual behavior), but the PRD's literal wording implies something time-boxed. Flagged as
    a probable contract-compliance finding for the orchestrator/product to confirm intent, not
    something I resolved unilaterally.
- Confirmed `docs/api.md`'s RX-3 and HM-3 sections coexist without formatting damage or duplicate/
  contradictory error codes (both fully independent tables, no code reused across sections).
  Noted one minor documentation nit (HM-3 has no changelog/version-bump line, unlike RX-3's v2.2
  bullet) — cosmetic, reported as a finding rather than edited directly, since bumping/annotating a
  shared version header touches both agents' delivered work and isn't a clear-cut "typo-class" fix.
- Checked both agents' Lessons Learned sections against their retros. `backend-developer` added
  no new lesson this round (correctly — no repeatable-mistake pattern found, and none introduced).
  `content-moderator` (brand-new agent, first task) added three lessons in a single round (filler-
  text self-trip, whitespace-stripping breaking `\b`, substring-vs-`\b` false positive) — reviewed
  the most recent one (the `\b`-anchoring lesson) specifically per the task's ask: it's well-formed
  (concrete failure example, prescriptive fix, requires a regression test), so no edit needed.
  Did NOT add a new permanent rule to `content-moderator.md` for the bare-URL TLD false-positive
  class I found, since it is a first occurrence of a *new* failure type (wrong-check, wrong-class
  from the three already-documented trade-offs) — Rule 6 requires a 2+ repeat of the *same* mistake
  type before a permanent rule is warranted, and this agent has exactly one prior task. Recommending
  the orchestrator watch for this pattern (TLD-list false positives from an over-broad bare-domain
  heuristic) recurring on a future content-moderator task before codifying a rule.

## What I found (no direct fixes needed — verified as correct)
- No bugs in RX-3's schema, service, route, or rate-limiter wiring. DB-level uniqueness is real
  (schema-level PRIMARY KEY, not app-level check-then-insert), and the error-message-based
  duplicate/real-error branching is safe.
- No bugs in HM-3's moderation checks beyond what the agent's own retro already found/fixed
  (verified the fix is real, not just claimed, and doesn't regress the opposite failure mode).
- Two new findings surfaced (bare-URL TLD false positives; PRD §9.2 "window" vs. permanent
  uniqueness ambiguity) — reported to the orchestrator, not fixed directly, since both require a
  product/config judgment call rather than being unambiguous bugs.

## Verification
- `npm test` (full backend suite): 96/96 pass, run twice (start and end of my review), no changes
  made by me to any project file. `git status` confirmed identical before/after.

## Lessons
No new repeatable mistake pattern of my own this round — I stuck to reproducing claims empirically
before accepting them (per my existing 2026-07-09 lessons) and correctly separated "small
unambiguous fix" from "architectural/product-judgment finding" without crossing into either
agent's or the orchestrator's decision space. No lesson-file edit needed for myself.
