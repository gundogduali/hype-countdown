---
name: atomic-plan
description: "Use whenever a new feature or user request is about to enter the board — before writing PRD acceptance criteria or assigning any subagent. Decomposes a feature into small, single-owner, single-file-scope issues instead of one big task, to raise subagent success rate and cut token cost. Trigger: /atomic-plan"
---

# /atomic-plan

You are the orchestrator. This skill is a checklist you run **on yourself**, before a feature touches `docs/PRD.md` or `.claude/state/BOARD.md`. It exists because vague, multi-concern task assignments ("add feature X") cause subagents to load more context than they need, touch files outside their expertise, and fail more often. Small, atomic issues fix all three.

## Usage

```
/atomic-plan <feature name or short description>
```

## What "atomic" means here

An issue is atomic only if ALL of these hold:
1. **One agent** can complete it without needing another agent's output mid-task (dependencies are sequenced as separate issues, not folded into one).
2. **One concern** — e.g. "render an image" is not the same concern as "cache the image" is not the same concern as "inject the meta tag." Split them.
3. **A narrow, named file scope** — the prompt to the agent can list the exact file(s)/directory it will touch. If you can't name them, the issue is still too big.
4. **A standalone acceptance criterion** — testable/reviewable on its own, without needing the rest of the feature finished.
5. **Roughly "one sitting"** of work — if you can't picture the agent finishing it in a single focused pass, split further.

## Procedure

1. **State the feature in one sentence** and identify which existing or new specialist agent(s) it touches (see `.claude/agents/*.md` for current roster). If the feature needs a genuinely new specialization (e.g. image rendering, content moderation, notifications) that doesn't fit any existing agent's file scope, propose a new agent — don't stretch an existing one across unrelated concerns just to avoid defining a new file.
2. **List issues in dependency order**, each as a row: `id | one-line description | agent | file scope | depends-on`. Design issues (ui-designer) come before implementation issues that need them; backend issues that a frontend issue consumes come before it; moderation/security-sensitive issues get their own row even if a generic dev agent could technically do them, so review can be scoped just as narrowly.
3. **Write each issue into `.claude/state/BOARD.md`** under To Do as its own bullet with an id — never as one bullet covering the whole feature.
4. **Record the feature + its acceptance criteria in `docs/PRD.md`** (the PRD stays feature-level; the board stays issue-level — don't collapse the two).
5. **Assign issues one at a time** (or in parallel only when truly independent, per the orchestrator's own parallelization rule), each with the Task Assignment Template from `orchestrator.md` — Context / Task / Acceptance criteria / Constraints / Closing Protocol reminder — scoped to that one issue, not the whole feature.
6. **After the last issue for a feature closes**, run one code-reviewer pass and one qa-engineer pass over the feature as a whole (cross-issue integration is the one place a feature-level check still matters).

## Anti-patterns to catch in yourself

- A board bullet that describes a whole feature ("build reactions feature") instead of a step — split it before assigning.
- Handing a new agent's prompt the entire codebase context "just in case" — name only the files it needs; that's the token-cost payoff of atomic scoping.
- Two unrelated concerns in one prompt (e.g. "add the endpoint and also handle spam filtering") — these are two issues, possibly two agents.
- Skipping this skill for a feature because it "feels small" — small features are exactly where the discipline is cheap to apply and easy to skip by habit; run it anyway.
