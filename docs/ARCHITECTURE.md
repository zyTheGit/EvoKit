# EvoKit Architecture

## Overview

EvoKit uses a **4-layer architecture** that progressively refines AI behavior from general principles to specific, learned rules.

```
┌────────────────────────────────────────────────────┐
│  L1: Cognitive Core                                │
│  CLAUDE.md — Thinking framework, evolution protocol │
│  Loaded: Every session                              │
│  Max: 150 lines                                     │
├────────────────────────────────────────────────────┤
│  L2: Path Rules                                     │
│  .claude/rules/ — Auto-loaded by file path          │
│  Loaded: When editing matching files                │
│  Examples: security.md, coding.md, core-invariants  │
├────────────────────────────────────────────────────┤
│  L3: Sub-agents                                     │
│  .claude/agents/ — Specialized agent definitions    │
│  Invoked: On demand via "claude agent <name>"       │
│  Examples: architect (plan), reviewer (review)      │
├────────────────────────────────────────────────────┤
│  L4: Evolution Engine                               │
│  .claude/memory/ + .claude/commands/               │
│  corrections → observations → promotion → audit    │
│  Commands: /boot, /evolve, /review                  │
└────────────────────────────────────────────────────┘
```

## Layer Details

### L1: Cognitive Core (CLAUDE.md)

The cognitive core defines **how the AI thinks**, not just what it knows. It contains:

- **Thinking Framework:** The Understand → Plan → Verify → Learn hierarchy
- **Completion Standards:** What "done" means (tested, no TODOs, no debug code)
- **Memory System Protocol:** How learning data flows through the system
- **Path Constraints:** What each `.claude/` subdirectory is for
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

### L3: Sub-agents (.claude/agents/)

Specialized agents with isolated context that can work independently.

| Agent | Tools | Purpose |
|-------|-------|---------|
| `architect` | Read, Write, Bash, Agent, etc. | Design implementation plans |
| `reviewer` | Read, Grep, Glob, Bash | Code review for bugs/security/quality |

**Design Principle:** Sub-agents keep complex analysis out of the main conversation context, preventing distraction and context overflow.

### L4: Evolution Engine (.claude/memory/ + commands/)

The learning infrastructure that makes the system self-evolving.

#### Data Flow

```
User Correction
     │
     ▼
corrections.jsonl ──► /evolve ──► learned-rules.md ──► rules/ or CLAUDE.md
     │                      │
     │                      ▼
     │               evolution-log.md (rejected → never re-propose)
     │
observations.jsonl ──► confidence decay (60d → half confidence)
     │
     ▼
archive/ (30d+ entries, gzip if >1000 lines)
```

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

> **Status:** Coming in v0.3+ / v0.4+

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Claude     │    │  Codex       │    │  OpenCode   │
│  Code       │    │  CLI         │    │  CLI        │
└──────┬──────┘    └──────┬───────┘    └──────┬──────┘
       │                  │                   │
       ▼                  ▼                   ▼
┌──────────────────────────────────────────────────┐
│              EvoKit Adapter Layer                  │
│  agent-install → setup-hooks → inject-memory      │
│  export-memory → run-command                       │
├──────────────────────────────────────────────────┤
│              Shared Learning Data                  │
│  corrections.jsonl / observations.jsonl / rules   │
└──────────────────────────────────────────────────┘
```

See [MULTI_AGENT.md](MULTI_AGENT.md) for the full adapter specification.
