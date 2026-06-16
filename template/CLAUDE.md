# Self-Evolving System Protocol v1.0

This is the cognitive core. It configures Claude Code's behavior and drives cross-session learning.

## 1. Thinking Framework

Before any coding task, follow this hierarchy:
1. **Understand** — Read relevant files first. Never edit a file without reading it.
2. **Plan** — For complex tasks (>3 steps), outline the approach before acting.
3. **Verify** — After changes, confirm they work (run tests, check output).
4. **Learn** — If corrected, record the pattern for future sessions.

### Self-Check Before Acting
- Have I read every file I'm about to modify?
- Do I understand the existing patterns I should match?
- Is there an existing utility/helper/convention I should reuse?

### Self-Check After Changes
- Did I run tests? Check for `TODO`/`FIXME`/`console.log`/`debugger` artifacts?
- Did I record any corrections received?

## 2. Completion Standards

A task is "done" ONLY when ALL conditions are met:

| Condition | How to Verify |
|-----------|---------------|
| All changes tested | Run the project's test command |
| No debug artifacts | `grep -r 'console.log\|TODO\|FIXME\|debugger' --include='*.{ts,js,py,sh}'` |
| No accidental deletions | `git diff --stat` — confirm only intended files changed |
| Boot verification passes | Run `/boot` or check session-start hook output |
| Corrections recorded | If user corrected you, entry exists in `corrections.jsonl` |

### Hard Limits
- Never edit a file without reading it first
- Never delete files the user didn't ask to delete
- Never hardcode personal paths in templates (use `__HOME__` placeholders)
- Never skip tests after changes

## 3. Memory System Protocol

| File | Purpose | Auto-managed |
|------|---------|--------------|
| `corrections.jsonl` | User corrections (pattern, context, count) | Yes — append on each correction |
| `observations.jsonl` | Code pattern observations | Yes — append during analysis |
| `learned-rules.md` | Promoted permanent rules (max 50 lines) | Yes — via `/evolve` |
| `evolution-log.md` | Audit trail of `/evolve` decisions | Yes — via `/evolve` |
| `violations.jsonl` | Rules violated during boot verification | Yes — via `/boot` |
| `sessions.jsonl` | Session scorecards | Yes — via Stop hook |

### Promotion Ladder
```
correction (1st) → corrections.jsonl
correction (2nd same pattern) → learned-rules.md (with verify line)
learned-rules.md (10+ sessions, verified) → rules/ or CLAUDE.md (via /evolve)
rejected rules → evolution-log.md (never re-propose)
```

### When to Record
| Trigger | Record To | Example |
|---------|-----------|---------|
| User explicitly corrects you | `corrections.jsonl` | "Use `const`, never `var`" |
| You notice a reusable pattern | `observations.jsonl` | "Project uses PascalCase for component files" |
| A rule is violated | `violations.jsonl` | "CLAUDE.md exceeded 150 lines" |

### Retention
- Observations older than **60 days** → confidence halved
- Confidence below **0.3** → auto-archived
- Files >**500 lines** → entries >**30 days** rotated to `archive/`
- Archives >**1000 lines** → gzip-compressed

## 4. Evolution Commands

| Command | When to Run | Self-Check |
|---------|-------------|------------|
| `/boot` | Session start (auto via SessionStart hook), or after any memory file change | Did I check each learned rule's `verify` line? |
| `/evolve` | Every ~10 sessions, or when corrections ≥2 with same pattern | Has pattern appeared ≥2 times? Run `/boot` first to verify rules. |
| `/review` | Before committing, after large changes | Are tests passing? All intended changes staged? |

### Evolution Flow
```
User: "Use named exports, not default exports"
  → correction appended to corrections.jsonl {pattern: "prefer-named-exports"}
User (later): "Same issue — named exports!"
  → corrections.jsonl pattern count → 2 (ready for promotion)
/evolve:
  → Pattern promoted to learned-rules.md with verify line
```

## 5. Skills, Agents & Tools

### Skills (`.claude/skills/`)
Skills are auto-invoked workflow instructions. Refer to `debug` skill for debugging, `code-review` for reviews. Skills use progressive disclosure (~50 tokens until invoked). Use `disable-model-invocation: true` for manually-triggered skills.

### Tool Priority
1. **Codegraph** — `codegraph_explore`/`codegraph_search`/`codegraph_impact` (fastest)
2. **Read** — file contents (after codegraph has located the right file)
3. **Grep/Glob** — broad pattern matching
4. **Bash** — running tests, builds, or one-off commands

### Agent Usage
| Agent | When to USE | When NOT to Use |
|-------|-------------|-----------------|
| `architect` | Complex multi-step work needing design plan first | Simple edits, single-file fixes, rote mechanical changes |
| `reviewer` | Before committing, after large changes, or before PR | Trivial one-line changes, generated/boilerplate code |

## 6. Auto-Memory & Hooks

### Auto-Memory
Claude Code's built-in auto-memory (`autoMemoryEnabled: true` in settings.json) automatically saves notes about build commands, architecture decisions, and preferences. Notes are stored in `~/.claude/projects/<slug>/memory/` and loaded each session. No manual filing needed.

### Hook Events (configured in settings.json)
| Event | Purpose | Hook Script |
|-------|---------|-------------|
| SessionStart | Boot verification at session start | `session-start.sh` |
| PreToolUse | Inject learned rules context, block dangerous commands | `pre-tool-use.sh` |
| PostToolUse | Auto-format edited files, track edit patterns | `post-tool-use.sh` |
| PreCompact | Save learning state before context compaction | `pre-compact.sh` |
| Stop | Record session summary (duration, corrections, model) | `stop.sh` |

Before context compaction (`PreCompact`), a snapshot of current learning state is saved so progress isn't lost. Auto-formatting runs asynchronously (`async: true`) on every Edit/Write via `PostToolUse`.

## 7. Integrity Rules

### Invariants
- `corrections.jsonl` and `observations.jsonl` are **append-only** — never delete entries.
- `MEMORY.md` is **read-only** for Claude — update only via the learning workflow.
- **Never modify files outside the project** without explicit permission.
- Files in `.claude/memory/*.jsonl` have **600 permissions** — personal data.

### Error Reporting
- If a command fails: explain what went wrong and suggest a fix — don't silently retry.
- If unsure: say so. Don't fabricate results.
- If corrected: acknowledge, fix, and **record in corrections.jsonl**.
- Report all outcomes truthfully. Never claim success if something failed.
