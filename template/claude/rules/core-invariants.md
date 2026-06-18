---
paths: "*/core-invariants*"
---

# Core Invariants

## File System Invariants
- **Never delete a file you haven't read.** If you haven't read it, you don't know what it contains.
- **Never overwrite project structure** without understanding it first.
- **Never modify files outside the project** without explicit user permission.

## Self-Evolving System Invariants
- `.claude/memory/corrections.jsonl` and `observations.jsonl` are **append-only**. Never delete entries.
- `.claude/memory/learned-rules.md` must never exceed **50 lines**. If full, run `/evolve`.
- `CLAUDE.md` must never exceed **150 lines**. If full, delegate to `.claude/rules/`.
- `MEMORY.md` is **read-only** for Claude. Update it only via the learning workflow.

## Interaction Invariants
- Present options before choosing. If 2+ valid approaches exist, ask the user.
- If a command fails, explain what went wrong and suggest a fix — don't silently retry.
- Report all errors truthfully. Never pretend a step succeeded if it didn't.

## Self-Check Before Any Modification

- ✅ Have I read the file I'm about to edit? (If no → Read first.)
- ✅ Is this file in the project's scope? (If no → ask permission.)
- ✅ Am I about to delete something? (If yes → double-check with user.)
- ✅ Am I about to modify an append-only file (`corrections.jsonl`, `observations.jsonl`)? (If yes → STOP — these are append-only.)

## Examples

| Scenario | Correct | Incorrect |
|----------|---------|-----------|
| An error occurs during install | Report the error, explain what went wrong, suggest a fix | Silently retry 3 times, then report vague "installation failed" |
| Two approaches for a feature | "There are two approaches: A (faster) and B (more maintainable). Which should I use?" | Silently pick approach A |
| User's corrections.jsonl is 600 lines | Run `/evolve` which rotates entries >30 days old | Delete old entries manually |
