#!/usr/bin/env bash
# SubagentStop hook — Self-Correction Protocol enforcer.
# When a team agent tries to finish its work, this stops it once and asks it to
# review and fix its own work, write a retro, and, if needed,
# add a lesson to its own agent .md file.

input=$(cat)

# Infinite-loop guard: if the hook has already fired once, let the agent finish.
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)
if [ "$active" = "true" ]; then
  exit 0
fi

agent=$(printf '%s' "$input" | jq -r '.agent_type // .agent_name // .subagent_type // "unknown"' 2>/dev/null)

# The protocol applies only to project team agents.
case "$agent" in
  ui-designer|frontend-developer|backend-developer|qa-engineer|code-reviewer|unknown) ;;
  *) exit 0 ;;
esac

project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"
mkdir -p "$project_dir/.claude/retros"
ts=$(date +%Y-%m-%d-%H%M%S)

reason="SELF-CORRECTION PROTOCOL — before finishing your work, follow these steps (if you are NOT a member of the claude_ugc project team, ignore this message and finish immediately):
1. REVIEW: Critically examine everything you produced in this task against the task definition, the acceptance criteria, and the rules in your own agent definition file (if you wrote code, verify it runs; if you produced a design, check it with a screenshot).
2. FIX: Fix the bugs, gaps, and inconsistencies you found NOW — do not defer them.
3. WRITE A RETRO: Write a short retro to '$project_dir/.claude/retros/${agent}-${ts}.md': what you did, what you found in your review, what you fixed, and what the orchestrator needs to know.
4. EXTRACT A LESSON: If you made a repeatable mistake, add a single line in the format '- [YYYY-MM-DD] <lesson>' to the 'Lessons Learned' section at the end of your own definition file ('$project_dir/.claude/agents/<your-name>.md'). If there was no mistake, do not touch the file.
5. Then finish your work and mention what you fixed in your final report."

jq -n --arg r "$reason" '{decision: "block", reason: $r}'
exit 0
