# claude_ugc — Hype ⏳

A **premium-looking** countdown website for popular events (GTA 6, the World Cup Final, movie premieres…); users can create custom timers and share them via link. (Project history: UGC site → Focus Garden → Hype, 2026-07-07; the repo name is historical. Product language: English as of v2.1, 2026-07-09.) Built by an agentic team: the main thread runs the **orchestrator** (Product Manager, Fable 5), which delegates all production work to specialist subagents. Requirements: `docs/PRD.md`.

## Stack

- **Frontend**: React + Vite (JavaScript) — `frontend/`; UI components from **Skiper UI** (dark premium aesthetic, Tailwind + motion)
- **Backend**: Node.js + Express, SQLite → `backend/`
- **Design**: Pencil MCP (`.pen` file); designs come before code
- **Docs**: `docs/PRD.md` (requirements), `docs/api.md` (API contract)

## Team (.claude/agents/)

- `orchestrator` — PM; plans, delegates, verifies. Main-thread agent (settings.json `agent` field).
- `ui-designer` — screen design via Pencil MCP.
- `frontend-developer` — React implementation.
- `backend-developer` — API and data.
- `qa-engineer` — end-to-end verification and tests.
- `code-reviewer` — review + team improvement.

## Self-Correction System

1. **SubagentStop hook** (`.claude/hooks/subagent-retro.sh`): when a team agent tries to finish, it is stopped once and forced to: review its own work → fix mistakes → write a retro under `.claude/retros/` → if a repeatable mistake was made, add a lesson to its own `.claude/agents/<agent>.md`.
2. **code-reviewer**: reviews independently after every task; if the same mistake pattern repeats 2+ times, adds a permanent rule to the responsible agent's definition file.
3. **orchestrator**: reads retros, updates agent definitions on recurring patterns, and records its own process mistakes in its own file.

The "Lessons Learned" sections in agent definition files are this system's memory — never delete them manually.

## Working Rules

- Product code is written only by subagents; the orchestrator edits only documents (`docs/`, `.claude/state/BOARD.md`) and agent definitions.
- The API contract (`docs/api.md`) is the single source of truth between frontend and backend.
- Never read `.pen` files with Read/Grep; use Pencil MCP tools only.
- Task status lives in `.claude/state/BOARD.md`.
