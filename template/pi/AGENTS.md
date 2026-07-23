# Self-Evolving System Protocol v1.0

This is the cognitive core. It configures your Pi CLI coding assistant's behavior and drives cross-session learning via EvoKit.

## 1. Thinking Framework

Before any coding task, follow this hierarchy:

1. **Understand** — Read relevant files first. Never edit what you haven't read.
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

| Condition               | How to Verify                                                                 |
| ----------------------- | ----------------------------------------------------------------------------- |
| All changes tested      | Run the project's test command                                                |
| No debug artifacts      | `grep -r 'console.log\|TODO\|FIXME\|debugger' --include='*.{ts,js,py,sh}'`    |
| No accidental deletions | `git diff --stat` — confirm only intended files changed                       |
| Corrections recorded    | If user corrected you, entry exists in `~/.pi/agent/memory/corrections.jsonl` |

### Hard Limits

- Never edit a file without reading it first
- Never delete files the user didn't ask to delete
- Never hardcode personal paths in templates (use `__HOME__` placeholders)
- Never skip tests after changes

## 3. Memory System Protocol

| File                                    | Purpose                                    | Auto-managed                         |
| --------------------------------------- | ------------------------------------------ | ------------------------------------ |
| `~/.pi/agent/memory/corrections.jsonl`  | User corrections (pattern, context, count) | Yes — via evokit-memory extension    |
| `~/.pi/agent/memory/observations.jsonl` | Code pattern observations                  | Yes — via evokit-memory extension    |
| `~/.pi/agent/memory/learned-rules.md`   | Promoted permanent rules (max 50 lines)    | Yes — via evokit-evolve extension    |
| `~/.pi/agent/memory/evolution-log.md`   | Audit trail of evolution decisions         | Yes — via evokit-evolve extension    |
| `~/.pi/agent/memory/violations.jsonl`   | Rules violated during boot verification    | Yes — via evokit-lifecycle extension |
| `~/.pi/agent/memory/sessions.jsonl`     | Session scorecards                         | Yes — via evokit-session extension   |

### Promotion Ladder

```
correction (1st) → corrections.jsonl
correction (2nd same pattern) → learned-rules.md (with verify line)
learned-rules.md (10+ sessions, verified) → AGENTS.md or extensions/ (via /evokit-evolve)
rejected rules → evolution-log.md (never re-propose)
```

### When to Record

| Trigger                       | Record To            | Example                                       |
| ----------------------------- | -------------------- | --------------------------------------------- |
| User explicitly corrects you  | `corrections.jsonl`  | "Use `const`, never `var`"                    |
| You notice a reusable pattern | `observations.jsonl` | "Project uses PascalCase for component files" |
| A rule is violated            | `violations.jsonl`   | "AGENTS.md exceeded 150 lines"                |

### Retention

- Observations older than **60 days** → confidence halved
- Confidence below **0.3** → auto-archived
- Files >**500 lines** → entries >**30 days** rotated to `archive/`
- Archives >**1000 lines** → gzip-compressed

## 4. EvoKit Extensions

This project has EvoKit extensions installed in `~/.pi/agent/extensions/`. They handle the evolution lifecycle automatically:

| Extension            | Purpose                                                                   | Auto-triggered           |
| -------------------- | ------------------------------------------------------------------------- | ------------------------ |
| **evokit-lifecycle** | session_start → boot, session_shutdown → record, tool_call → inject rules | ✅ (via pi.on())         |
| **evokit-boot**      | Manual boot verification command                                          | ❌ (via /evokit-boot)    |
| **evokit-evolve**    | Evolution audit command                                                   | ❌ (via /evokit-evolve)  |
| **evokit-memory**    | Memory management command                                                 | ❌ (via /evokit-memory)  |
| **evokit-session**   | Session recording command                                                 | ❌ (via /evokit-session) |

### Important: Session Recording

The `evokit-lifecycle` extension automatically records session data via `session_shutdown`. If you need manual recording, call `/evokit-session` with `action: "end"` before the conversation ends.

### Evolution Flow

```
User: "Use named exports, not default exports"
  → call /evokit-memory with action: record-correction
User (later): "Same issue — named exports!"
  → corrections.jsonl pattern count → 2 (ready for promotion)
/evokit-evolve:
  → Pattern promoted to learned-rules.md with verify line
```

## 5. Sub-agents

| Sub-agent   | When to USE                                          | When NOT to Use                                          |
| ----------- | ---------------------------------------------------- | -------------------------------------------------------- |
| `architect` | Complex multi-step work needing design plan first    | Simple edits, single-file fixes, rote mechanical changes |
| `reviewer`  | Before committing, after large changes, or before PR | Trivial one-line changes, generated/boilerplate code     |

Sub-agents are defined in `~/.pi/agent/agent/`. Access them via `@architect` or `@reviewer`.

## 6. Integrity Rules

### Invariants

- `corrections.jsonl` and `observations.jsonl` are **append-only** — never delete entries.
- **Never modify files outside the project** without explicit permission.
- `~/.pi/agent/memory/` files have **600 permissions** — personal data.

### Error Reporting

- If a command fails: explain what went wrong and suggest a fix — don't silently retry.
- If unsure: say so. Don't fabricate results.
- If corrected: acknowledge, fix, and **record in corrections.jsonl**.
- Report all outcomes truthfully. Never claim success if something failed.
