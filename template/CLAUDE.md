# EvoKit — Self-Evolving System Protocol

This file is the L1 cognitive core of the self-evolving system. It configures Claude Code's behavior and persists across sessions via the memory system.

## 1. Thinking Framework

Before every coding task, follow this hierarchy:

1. **Understand** — Read relevant files first. Never edit what you haven't read.
2. **Plan** — For complex tasks (>3 steps), outline the approach before acting.
3. **Verify** — After changes, confirm they work (run tests, check output).
4. **Learn** — If corrected, record the pattern for future sessions.

### Self-Check Before Acting

Before writing code or running commands:

- Have I read every file I'm about to modify?
- Do I understand the existing patterns I should match (naming, imports, structure)?
- Is there an existing utility, helper, or convention I should reuse?
- Have I checked `codegraph_impact` to understand what would break?

### Self-Check After Changes

- Did I run the relevant tests? (e.g. `fnm use && npm test`)
- Did I check for leftover `TODO`, `FIXME`, `console.log`, or `debugger`?
- Did I verify `/boot` passes?
- Did I record any corrections received?

## 2. Completion Standards

A task is "done" ONLY when ALL conditions are met:

| Condition | How to Verify |
|-----------|---------------|
| All changes tested | Run the project's test command |
| No debug artifacts | `grep -r 'console.log\|TODO\|FIXME\|debugger' --include='*.{ts,js,py,sh}'` |
| No accidental deletions | `git diff --stat` — confirm only intended files changed |
| Boot verification passes | Run `/boot` or `bash ~/.claude/hooks/session-start.sh` |
| Corrections recorded | If user corrected you, entry exists in `corrections.jsonl` |

### Hard Limits (NON-NEGOTIABLE)

| Rule | If Violated |
|------|-------------|
| Never edit a file without reading it first | Undo changes, re-read, re-apply |
| Never delete files the user didn't ask to delete | Restore from git immediately |
| Never hardcode personal paths in templates | Fix paths, re-verify with `bash bin/install.sh --dry-run` |
| Never skip tests after changes | Re-run tests, fix failures, re-run `/boot` |

## 3. Memory System Protocol

Memory files in `.claude/memory/` drive the evolution loop:

| File | Purpose | Auto-managed | Personal? |
|------|---------|--------------|-----------|
| `corrections.jsonl` | User corrections (pattern, context, count) | Yes — append on each correction | Yes |
| `observations.jsonl` | Observations about code patterns | Yes — append during analysis | Yes |
| `learned-rules.md` | Promoted permanent rules (max 50 lines) | Yes — via `/evolve` | Optional |
| `evolution-log.md` | Audit trail of `/evolve` decisions | Yes — via `/evolve` | Optional |
| `violations.jsonl` | Rules violated during boot verification | Yes — via `/boot` | Yes |
| `sessions.jsonl` | Session scorecards | Yes — via Stop hook | Yes |

### Promotion Ladder

```
correction (1st occurrence) → corrections.jsonl
correction (2nd same pattern) → learned-rules.md (with verify line)
learned-rules.md (10+ sessions, verified) → rules/ or CLAUDE.md (via /evolve)
rejected rules → evolution-log.md (never re-propose)
```

### When to Record

| Trigger | Record To | Example |
|---------|-----------|---------|
| User explicitly corrects you | `corrections.jsonl` | "Use `let`/`const`, never `var`" |
| You notice a reusable pattern | `observations.jsonl` | "Project uses PascalCase for component files" |
| A rule is violated | `violations.jsonl` | "CLAUDE.md exceeded 150 lines" |

### Confidence & Retention

- Observations older than **60 days** → confidence halved
- Confidence below **0.3** → auto-archived (never re-proposed)
- Files >**500 lines** → entries older than **30 days** rotated to `archive/`
- Archives >**1000 lines** → gzip-compressed

## 4. Evolution Commands

| Command | When to Run | Self-Check Before Running |
|---------|-------------|---------------------------|
| `/boot` | Session start (auto) | Did I check the `verify` line of every learned rule? |
| `/evolve` | Every ~10 sessions | Have I accumulated ≥2 corrections with the same pattern? |
| `/review` | Before committing | Did I stage all intended changes? Are tests passing? |

### Example Evolution Flow

```
User: "Use named exports, not default exports"
  → correction appended to corrections.jsonl {pattern: "prefer-named-exports"}
User (later): "Same mistake — use named exports"
  → corrections.jsonl pattern count → 2 (ready for promotion)
You run /evolve:
  → Pattern promoted to learned-rules.md:
    "- Prefer named exports over default exports"
    "  <!-- verify: grep -r 'export default' src/ -->"
```

## 5. Tool & Agent Usage

### Tool Priority

When answering questions or executing tasks, prefer tools in this order:

1. **Codegraph** — `codegraph_explore` / `codegraph_search` / `codegraph_impact` (fastest, most precise)
2. **Read** — file contents (only after codegraph has located the right file)
3. **Grep / Glob** — broad pattern matching (when codegraph doesn't cover the pattern)
4. **Bash** — running tests, builds, or one-off commands

### Agent Usage

| Agent | When to USE | When NOT to Use |
|-------|-------------|-----------------|
| `architect` | Complex multi-step work needing a design plan first | Simple edits, single-file fixes, rote mechanical changes |
| `reviewer` | Before committing, after large changes, or before PR | Trivial one-line changes, generated/boilerplate code |

## 6. Path Constraints

| Path | Purpose | Rule |
|------|---------|------|
| `.claude/rules/` | Path-scoped rules | Loaded automatically based on file paths being edited |
| `.claude/agents/` | Sub-agent definitions | Invoke via `claude agent <name>` |
| `.claude/commands/` | Slash commands | Invoke via `/command` |
| `.claude/memory/` | Learning data | `corrections.jsonl`/`observations.jsonl` → personal (`.gitignore`). `learned-rules.md`/`evolution-log.md` → shareable |
| `.claude/hooks/` | Session lifecycle hooks | `session-start.sh`, `stop.sh`, `export-system.sh` |
| `CLAUDE.md` | Cognitive core | Max 150 lines. Delegate overflow to `.claude/rules/` |

## 7. Integrity Rules

### Invariants
- `corrections.jsonl` and `observations.jsonl` are **append-only** — never delete or edit entries.
- `MEMORY.md` is **read-only** for Claude — update it only via the learning workflow.
- **Never modify files outside the project** without explicit user permission.

### Error Reporting
- If a command fails: explain what went wrong and suggest a fix — don't silently retry.
- If you're unsure: say so. Don't pretend to know or fabricate results.
- If the user corrects you: acknowledge honestly, fix the issue, and **record the correction** in `corrections.jsonl`.
- Report all errors truthfully. Never claim a step succeeded if it didn't.
