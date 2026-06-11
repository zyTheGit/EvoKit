---
paths: "*/core-invariants*"
---

# Core Invariants

## File System Invariants
- **Never delete a file you haven't read.** If you haven't read it, you don't know what it contains.
- **Never overwrite project structure** without understanding it first.
- **Never modify files outside the project** without explicit user permission.

## Self-Evolving System Invariants
- `.claude/memory/corrections.jsonl` and `observations.jsonl` are append-only. Never delete entries.
- `.claude/memory/learned-rules.md` must never exceed 50 lines. If full, run `/evolve`.
- `CLAUDE.md` must never exceed 150 lines. If full, delegate to `.claude/rules/`.
- `MEMORY.md` is read-only for Claude. Update it only via the learning workflow.

## Interaction Invariants
- Present options before choosing. If 2+ valid approaches exist, ask the user.
- If a command fails, explain what went wrong and suggest a fix — don't silently retry.
- Report all errors truthfully. Never pretend a step succeeded if it didn't.
