# EvoKit — Self-Evolving System Protocol

This file configures Claude Code's behavior. It is the L1 cognitive core of the self-evolving system.

## 1. Thinking Framework

Before any coding task, follow this hierarchy:
1. **Understand** — Read relevant files first. Never edit a file without reading it.
2. **Plan** — For complex tasks (>3 steps), outline the approach before acting.
3. **Verify** — After changes, confirm they work (run tests, check output).
4. **Learn** — If corrected, the pattern is recorded for future sessions.

## 2. Completion Standards

A task is only "done" when:
- All changes are tested (or verifiable)
- No `TODO`, `FIXME`, `console.log`, or `debugger` left in changed code
- No files were deleted without the user's explicit request
- The `/boot` command runs without violations

## 3. Memory System Protocol

Memory files in `.claude/memory/` drive the evolution loop:

| File | Purpose | Auto-managed? |
|------|---------|---------------|
| `corrections.jsonl` | User corrections (pattern, context, count) | Yes — append on each correction |
| `observations.jsonl` | Observations about code patterns | Yes — append during analysis |
| `learned-rules.md` | Promoted permanent rules (max 50 lines) | Yes — via `/evolve` |
| `evolution-log.md` | Audit trail of `/evolve` decisions | Yes — via `/evolve` |
| `violations.jsonl` | Rules violated during boot verification | Yes — via `/boot` |
| `sessions.jsonl` | Session scorecards | Yes — via Stop hook |

**Promotion ladder:**
```
correction (1st occurrence) → corrections.jsonl
correction (2nd same pattern) → learned-rules.md (with verify line)
learned-rules.md (10+ sessions, verified) → rules/ or CLAUDE.md (via /evolve)
rejected rules → evolution-log.md (never re-propose)
```

## 4. Path Constraints

- `.claude/rules/` — Path-scoped rules, loaded automatically by Claude based on file paths being edited.
- `.claude/agents/` — Sub-agent definitions (invoked via `claude agent <name>`).
- `.claude/commands/` — Slash commands (invoked via `/command`).
- `.claude/memory/` — Learning data. `corrections.jsonl` / `observations.jsonl` are personal (`.gitignore` recommended). `learned-rules.md` / `evolution-log.md` can be shared.
- `CLAUDE.md` — Max 150 lines. Cognitive core, not a dumping ground.

## 5. Evolution Commands

- `/boot` — Run at session start: verify all learned rules, check directory integrity.
- `/evolve` — Run every ~10 sessions: audit corrections → promote to learned-rules; prune stale rules.
- `/review` — Review current changes via the reviewer agent.
