# Self-Evolving System Protocol v1.0

This is the cognitive core. It configures your AI coding assistant's behavior and drives cross-session learning via EvoKit.

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

| Condition | How to Verify |
|-----------|---------------|
| All changes tested | Run the project's test command |
| No debug artifacts | `grep -r 'console.log\|TODO\|FIXME\|debugger' --include='*.{ts,js,py,sh}'` |
| No accidental deletions | `git diff --stat` — confirm only intended files changed |
| Boot verification passes | Run `evokit-boot` tool |
| Corrections recorded | If user corrected you, entry exists in `.opencode/memory/corrections.jsonl` |

### Hard Limits
- Never edit a file without reading it first
- Never delete files the user didn't ask to delete
- Never hardcode personal paths in templates (use `__HOME__` placeholders)
- Never skip tests after changes

## 3. Memory System Protocol

| File | Purpose | Auto-managed |
|------|---------|--------------|
| `~/.config/opencode/memory/corrections.jsonl` | User corrections (pattern, context, count) | Yes — via `evokit-memory` tool |
| `~/.config/opencode/memory/observations.jsonl` | Code pattern observations | Yes — via `evokit-memory` tool |
| `~/.config/opencode/memory/learned-rules.md` | Promoted permanent rules (max 50 lines) | Yes — via `evokit-evolve` tool |
| `~/.config/opencode/memory/evolution-log.md` | Audit trail of evolution decisions | Yes — via `evokit-evolve` tool |
| `~/.config/opencode/memory/violations.jsonl` | Rules violated during boot verification | Yes — via `evokit-boot` tool |
| `~/.config/opencode/memory/sessions.jsonl` | Session scorecards | Yes — via `evokit-session` tool |

### Promotion Ladder
```
correction (1st) → corrections.jsonl
correction (2nd same pattern) → learned-rules.md (with verify line)
learned-rules.md (10+ sessions, verified) → AGENTS.md or rules/ (via evokit-evolve)
rejected rules → evolution-log.md (never re-propose)
```

### When to Record
| Trigger | Record To | Example |
|---------|-----------|---------|
| User explicitly corrects you | `corrections.jsonl` | "Use `const`, never `var`" |
| You notice a reusable pattern | `observations.jsonl` | "Project uses PascalCase for component files" |
| A rule is violated | `violations.jsonl` | "AGENTS.md exceeded 150 lines" |

### Retention
- Observations older than **60 days** → confidence halved
- Confidence below **0.3** → auto-archived
- Files >**500 lines** → entries >**30 days** rotated to `archive/`
- Archives >**1000 lines** → gzip-compressed

## 4. EvoKit Custom Tools

This project has EvoKit tools installed in `.opencode/tools/`. Use them to manage the evolution lifecycle:

| Tool | When to Use | What It Does |
|------|-------------|--------------|
| **evokit-boot** | Session start, or after any memory file change | Verify system integrity and learned rules |
| **evokit-evolve** | When corrections ≥2 with same pattern | Audit corrections → promote to learned rules |
| **evokit-memory** | After receiving corrections or noticing patterns | Record corrections/observations, inject context |
| **evokit-session** | **Always call before finishing** | Record session summary (duration, score, model) |

### Important: Session Recording
Since OpenCode has no automatic Stop hook, you **must** call the `evokit-session` tool with `action: "end"` before the conversation ends. This ensures session data is saved for evolution analytics.

### Evolution Flow
```
User: "Use named exports, not default exports"
  → call evokit-memory with action: record-correction
User (later): "Same issue — named exports!"
  → corrections.jsonl pattern count → 2 (ready for promotion)
evokit-evolve:
  → Pattern promoted to learned-rules.md with verify line
```

## 5. Sub-agents

| Sub-agent | When to USE | When NOT to Use |
|-----------|-------------|-----------------|
| `architect` | Complex multi-step work needing design plan first | Simple edits, single-file fixes, rote mechanical changes |
| `reviewer` | Before committing, after large changes, or before PR | Trivial one-line changes, generated/boilerplate code |

Sub-agents are defined in `~/.config/opencode/agent/`. Access them via `@architect` or `@reviewer`.

## 6. Integrity Rules

### Invariants
- `corrections.jsonl` and `observations.jsonl` are **append-only** — never delete entries.
- **Never modify files outside the project** without explicit permission.
- `~/.config/opencode/memory/` files have **600 permissions** — personal data.

### Error Reporting
- If a command fails: explain what went wrong and suggest a fix — don't silently retry.
- If unsure: say so. Don't fabricate results.
- If corrected: acknowledge, fix, and **record in corrections.jsonl**.
- Report all outcomes truthfully. Never claim success if something failed.
