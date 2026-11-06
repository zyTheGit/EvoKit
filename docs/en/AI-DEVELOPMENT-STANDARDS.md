# AI Agent Development Standards — Practical Guide

> A project-level guide for establishing AI coding assistant standards, written for Chinese-speaking development teams.
> This document is the English mirror of `docs/zh/AI-DEVELOPMENT-STANDARDS.md`; headings are kept structurally aligned.

## Table of Contents

1. [Why project-level standards matter](#1-why-project-level-standards-matter)
2. [Quick start: evokit project](#2-quick-start-evokit-project)
3. [CLAUDE.md: the AI's cognitive entry point](#3-claudemd-the-ais-cognitive-entry-point)
4. [Path rules: letting AI obey constraints automatically](#4-path-rules-letting-ai-obey-constraints-automatically)
5. [Sub-agents: collaborating specialists](#5-sub-agents-collaborating-specialists)
6. [Slash commands: one-shot workflows](#6-slash-commands-one-shot-workflows)
7. [Evolution system: let standards evolve themselves](#7-evolution-system-let-standards-evolve-themselves)
8. [Best practices](#8-best-practices)
9. [FAQ](#9-faq)

---

## 1. Why project-level standards matter

AI coding assistants (Claude Code, Cursor, Copilot, etc.) know nothing about your project by default:

- They don't know your commit convention is conventional commits with Chinese descriptions
- They don't know that touching `src/` requires running tests
- They don't know `.env` files must never be committed
- They don't know your code review bar

**Project-level standards** are the files that tell the AI assistant these constraints. With them, the AI goes from "generic helper" to "teammate who knows the project".

## 2. Quick start: evokit project

### Install EvoKit

```bash
# Global install (optional — evokit project also runs standalone)
npx @zythegit/evokit init

# Or use directly
npx @zythegit/evokit project
```

### Generate project standards

Run in the project root:

```bash
evokit project
```

An interactive wizard walks you through:

1. **Project name** — written into the CLAUDE.md title
2. **Project description** — one sentence on what the project does
3. **Primary language/framework** — e.g. TypeScript, Python, Go
4. **Rule toggles** — pick which rules to generate (commit convention / test gate / docs sync)

### Non-interactive mode

```bash
evokit project --name my-app --desc "my app" --lang TypeScript
evokit project --dry-run   # preview only, no files written
```

### Generated result

```
my-project/
├── CLAUDE.md                    # AI cognitive entry
└── .claude/
    ├── rules/
    │   ├── commit-convention.md  # commit convention
    │   ├── test-gate.md          # test gate
    │   └── docs-sync.md          # docs sync
    ├── agents/
    │   ├── architect.md          # architect agent
    │   └── reviewer.md           # code review agent
    ├── commands/
    │   ├── boot.md               # boot verification
    │   └── review.md             # code review
    └── MEMORY.md                 # memory index
```

Existing files are **never overwritten** — safe to re-run.

## 3. CLAUDE.md: the AI's cognitive entry point

`CLAUDE.md` is the **first file** an AI assistant reads when opening the project. It is the project's "front door".

### Required content

```markdown
# Project name

One-sentence description

## Key directories

- src/ — source code
- tests/ — tests
- docs/ — documentation

## Development commands

- Build: npm run build
- Test: npm test
- Lint: npm run lint

## Important design rules

- Never touch the database directly; always go through the Repository layer
- All API responses use the Result<T> type
```

### Line limit

`CLAUDE.md` ≤ **150 lines**. Push detail down into `.claude/rules/` when you exceed it.

### Recommended additions

After generation, manually fill in the following (marked with `<!-- -->` in the template):

1. **Key directories** — your real directory layout
2. **Development commands** — real build / test / deploy commands
3. **Important design rules** — core architectural decisions and constraints

## 4. Path rules: letting AI obey constraints automatically

Files under `.claude/rules/` are **auto-loaded** when the AI edits files under the matching path.

### How it works

The `paths` field in the file header specifies which path patterns trigger the rule:

```yaml
---
paths: '*/src/**'
---
# Code quality rules (enforced when editing src/)
...
```

### Built-in rule templates

| Rule file              | Trigger paths        | Purpose                                                   |
| ---------------------- | -------------------- | --------------------------------------------------------- |
| `commit-convention.md` | `src/**`             | Enforce conventional commits + Chinese descriptions       |
| `test-gate.md`         | `src/**`, `tests/**` | Code changes must run tests                               |
| `docs-sync.md`         | `docs/**`, `README*` | Docs must be bilingual-synced                             |

### Custom rules

Create any `.md` file under `.claude/rules/`:

```yaml
---
paths: '*/api/**'
---
# API development standards (enforced when editing api/)

- All endpoints must validate input
- Response shape is uniformly `{ code, data, message }`
- Errors use custom exception classes; never throw raw Error
```

### Rules vs CLAUDE.md

| Dimension        | CLAUDE.md                  | rules/                          |
| ---------------- | -------------------------- | ------------------------------- |
| Load timing      | Every session              | When editing a matching path    |
| Best for         | Project overview, globals  | Mandatory rules for a path      |
| Line limit       | ≤ 150 lines                | Unlimited per file              |

## 5. Sub-agents: collaborating specialists

Sub-agents defined under `.claude/agents/` are the AI's "expert team".

### Built-in agents

| Agent       | Role                  | When to use                                  |
| ----------- | --------------------- | -------------------------------------------- |
| `architect` | Design implementation | Complex multi-step tasks, architecture trade-offs |
| `reviewer`  | Code review           | Pre-commit, after large refactors            |

### Agent definition format

```yaml
---
name: architect
description: Planning agent — complex software architecture & implementation design
model: haiku
tools: [Read, Write, Edit, Bash, Glob, Grep, Agent]
disallowedTools: []
memory: project
maxTurns: 20
---
# Architect Agent

You are a software architect. ...
```

### Custom agents

```yaml
---
name: db-expert
description: Database expert — SQL tuning & migration design
model: haiku
tools: [Read, Grep, Glob, Bash]
disallowedTools: [Write, Edit]
memory: project
maxTurns: 10
---
# Database Expert

You are a database optimization expert. ...
```

## 6. Slash commands: one-shot workflows

Commands defined under `.claude/commands/` are triggered via `/command-name` in chat.

### Built-in commands

| Command   | Role                                          |
| --------- | --------------------------------------------- |
| `/boot`   | Boot verification — checks system integrity   |
| `/review` | Code review — invokes the reviewer agent      |

### Custom commands

```yaml
---
description: Run full CI verification locally
---
# /ci — local CI verification

Run the local equivalent of CI:

1. npm run build
2. npm test
3. npm run lint
4. shellcheck bin/*.sh

If any step fails, report the cause and suggest fixes.
```

## 7. Knowledge system: compounding project context

EvoKit compounds standards-related project/personal knowledge via its **project context engine**:

### Knowledge lifecycle

```
Knowledge identified in conversation → silently written to <project>/.evokit/.pending/
    ↓ (scope is decided by a human at confirmation time)
Confirmed → moved into knowledge/ (personal → ~/.evokit/knowledge/, project → <project>/.evokit/)
    ↓
Index updated (knowledge-index.md) → later sessions retrieve all knowledge in one query
```

### Key commands

| Command           | Role                                                  | Frequency                     |
| ----------------- | ----------------------------------------------------- | ----------------------------- |
| `/evokit-boot`    | Knowledge-base integrity check (read-only)            | Every session start (auto)    |
| `/evokit-learn`   | Confirm endorsements / explicit declarations          | When `.pending/` has drafts   |
| `/evokit-review`  | Re-review stale knowledge (conf ≤ 0.5)                | Periodically                  |

### How knowledge accrues

1. You correct the AI: **"use const, not var"** (deterministic new fact)
2. The AI silently writes it to `.pending/` (without guessing scope)
3. You run `evokit learn` to confirm → stored and indexed
4. Personal knowledge goes to `~/.evokit/knowledge/` and is shared by all four assistants

## 8. Best practices

### ✅ Do

- **Run `evokit project` first**, then hand-tune what it generates
- **Keep CLAUDE.md lean** (≤ 150 lines); push detail into rules/
- **Write project-specific knowledge into `.pending/`** — but don't guess scope; that is decided at confirmation
- **Run `/evokit-review` regularly** — re-check stale architecture / convention knowledge
- **Bring standards into code review** — standards are code too and need maintenance

### ❌ Don't

- Don't pile detail into CLAUDE.md — that is the job of rules/ or the knowledge base
- Don't write one-off commands / generic common sense / unconfirmed guesses into `.pending/` (guards against mis-extraction)
- Don't write personal preferences as global rules — scope them
- Don't ignore `/evokit-boot` failures — they are signals of knowledge-base health

### Team collaboration tips

1. Track `<project>/.evokit/`, `.claude/rules/`, and `CLAUDE.md` in git
2. Standard changes go through PR review (same as code)
3. Periodically review project knowledge in team meetings — clean out entries that no longer apply
4. For onboarding, the files `evokit project` generates are the best project context

## 9. FAQ

### Q: What is the difference between `evokit project` and `evokit init`?

`evokit init` (aka `evokit install`) performs a **global install** — it installs the EvoKit framework into `~/.claude/`, shared by all projects. `evokit project` performs **project-level generation** — it scaffolds standards files inside one project directory and only affects that project. They are fully independent.

### Q: What if my project already has a `.claude/` directory?

`evokit project` uses a **skip-if-exists** strategy — existing files are skipped and never overwritten. You can safely re-run it.

### Q: Can I use project-level standards without a global EvoKit install?

Yes. `evokit project` is fully standalone and does not require `evokit init`. However, the evolution system (`/evolve`, `/boot`) needs the globally installed hooks.

### Q: What patterns does the `paths` field in rules/ support?

Glob patterns: `*/src/**` matches any `src/` subdirectory, `*.ts` matches all TypeScript files, `*/api/**` matches API-related files.

### Q: How do I make a rule apply only on a specific branch?

Rules currently do not distinguish branches. Instead, write the condition into the rule body (e.g. "Before merging to main, ...") and let the AI assistant judge.