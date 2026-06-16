# EvoKit Architecture

## Overview

EvoKit uses a **4-layer architecture** that progressively refines AI behavior from general principles to specific, learned rules.

```
+------------------------------------------------------------------+
|  L1: Cognitive Core                                              |
|  CLAUDE.md — Thinking framework, evolution protocol               |
|  Loaded: Every session                                            |
|  Max: 150 lines                                                   |
+------------------------------------------------------------------+
|  L2: Path Rules                                                   |
|  .claude/rules/ — Auto-loaded by file path                        |
|  Loaded: When editing matching files                              |
|  Examples: security.md, coding.md, core-invariants               |
+------------------------------------------------------------------+
|  L3a: Skills                                                      |
|  .claude/skills/ — Auto-invoked workflow skills                  |
|  Invoked: Automatically by relevance detection                    |
|  Examples: debug, code-review, learning-recorder                  |
+------------------------------------------------------------------+
|  L3b: Sub-agents                                                  |
|  .claude/agents/ — Specialized agent definitions                 |
|  Invoked: On demand via "claude agent <name>"                    |
|  Examples: architect (plan), reviewer (review)                    |
+------------------------------------------------------------------+
|  L4: Evolution Engine                                             |
|  .claude/memory/ + .claude/hooks/ + .claude/commands/            |
|  corrections -> observations -> promotion -> audit                |
|  Commands: /boot, /evolve, /review                                |
|  Hooks: PreToolUse, PostToolUse, PreCompact, Stop                 |
+------------------------------------------------------------------+
```

## Layer Details

### L1: Cognitive Core (CLAUDE.md)

The cognitive core defines **how the AI thinks**, not just what it knows. It contains:

- **Thinking Framework:** The Understand -> Plan -> Verify -> Learn hierarchy
- **Completion Standards:** What "done" means (tested, no TODOs, no debug code)
- **Memory System Protocol:** How learning data flows through the system
- **Skills & Agents:** Reference to skills directory and sub-agent definitions
- **Auto-Memory & Hooks:** Configuration for auto-memory and lifecycle hooks
- **Evolution Commands:** What `/boot`, `/evolve`, `/review` do

**Design Principle:** CLAUDE.md should change rarely. New knowledge goes into rules/ or memory/.

### L2: Path Rules (.claude/rules/)

Rules that are **automatically loaded when editing files matching their `paths` pattern**.

| Rule File | Scope | Purpose |
|-----------|-------|---------|
| `security.md` | `*/security*` | API keys, sensitive ops, injection prevention |
| `coding.md` | `*/coding*` | Style, quality, language-specific conventions |
| `core-invariants.md` | `*/core-invariants*` | Immutable system rules |

**Design Principle:** Rules are the permanent knowledge that has graduated from the learning pipeline.

### L3a: Skills (.claude/skills/)

Skills are **auto-invoked workflow instructions** using progressive disclosure. Only the `description` field (~30-50 tokens) loads initially; full instructions load on-demand when Claude detects relevance.

| Skill | Auto-Invoked | Purpose |
|-------|-------------|---------|
| `debug` | Yes | Systematic debugging workflow |
| `code-review` | Yes | Structured code review workflow |
| `learning-recorder` | No (manual) | Guidelines for recording learning data |

Skills use `disable-model-invocation: true` to prevent auto-loading for reference-only skills.

### L3b: Sub-agents (.claude/agents/)

Specialized agents with isolated context that can work independently.

| Agent | Tools | MaxTurns | Memory | Purpose |
|-------|-------|----------|--------|---------|
| `architect` | Read, Write, Bash, Agent, etc. | 20 | project | Design implementation plans |
| `reviewer` | Read, Grep, Glob, Bash | 15 | project | Code review for bugs/security/quality |

Sub-agents support `memory: project` for project-scoped learning, `disallowedTools` for restricting access, and `isolation: worktree` for safe parallel execution.

**Design Principle:** Sub-agents keep complex analysis out of the main conversation context, preventing context overflow.

### L4: Evolution Engine (.claude/memory/ + hooks/ + commands/)

The learning infrastructure that makes the system self-evolving.

#### Data Flow

```
User Correction
     |
     v
corrections.jsonl ----> /evolve ----> learned-rules.md ----> rules/ or CLAUDE.md
     |                      |
     |                      v
     |               evolution-log.md (rejected -> never re-propose)
     |
observations.jsonl ----> confidence decay (60d -> half confidence)
     |
     v
archive/ (30d+ entries, gzip if >1000 lines)
```

#### Hook-Driven Learning

| Hook | Role in Evolution |
|------|-------------------|
| `SessionStart` | Boot verification, check system integrity |
| `PreToolUse` | Inject learned rules before tool use, block dangerous commands |
| `PostToolUse` | Track file edit patterns as observations |
| `PreCompact` | Snapshot learning state before context compaction |
| `Stop` | Record session duration, corrections, observations |

#### Management Commands

| Command | Frequency | Action |
|---------|-----------|--------|
| `/boot` | Every session | Verify all learned rules, check structure |
| `/evolve` | ~10 sessions | Audit corrections, promote/prune rules |
| `/review` | Before commit | Full code review via reviewer agent |

## File Size Limits

| File | Max Lines | When Full |
|------|-----------|-----------|
| `CLAUDE.md` | 150 | Move content to `rules/` |
| `learned-rules.md` | 50 | Run `/evolve` to prune |
| `corrections.jsonl` | 500 | Auto-rotate to `archive/` |
| `observations.jsonl` | 500 | Auto-rotate to `archive/` |

## Multi-Agent Adapter Architecture

```
+-------------+    +--------------+    +-------------+
|  Claude     |    |  Codex       |    |  OpenCode   |
|  Code       |    |  CLI         |    |  CLI        |
+------+------+    +------+-------+    +------+------+
       |                  |                   |
       v                  v                   v
+----------------------------------------------------+
|              EvoKit Adapter Layer                   |
|  agent-install -> setup-hooks -> inject-memory      |
|  export-memory -> run-command                       |
+----------------------------------------------------+
|              Shared Learning Data                    |
|  corrections.jsonl / observations.jsonl / rules     |
+----------------------------------------------------+
```

See [MULTI_AGENT.md](MULTI_AGENT.md) for the full adapter specification.
