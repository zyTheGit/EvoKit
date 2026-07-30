# EvoKit Architecture

## Overview

EvoKit uses a **3-layer architecture** organized around the lifecycle of knowledge entries.

```
+------------------------------------------------------------------+
|  L1: Cognitive Core                                              |
|  CLAUDE.md — Thinking framework, knowledge system protocol        |
|  Loaded: Every session                                            |
|  Max: 150 lines                                                   |
+------------------------------------------------------------------+
|  L2: Path Rules + Skills + Sub-agents                             |
|  rules/ — Auto-loaded by file path                                |
|  skills/ — Progressive disclosure workflow skills                  |
|  agents/ — Specialized agent definitions                          |
+------------------------------------------------------------------+
|  L3: Knowledge Engine                                             |
|  evokit/ — Knowledge entries + index + pending                    |
|  Conversation extraction → confirm → persist → staleness detect   |
|  Commands: /evokit-boot, /evokit-learn, /evokit-review            |
|  Hooks: SessionStart, Stop                                        |
+------------------------------------------------------------------+
```

## Layer Details

### L1: Cognitive Core (CLAUDE.md)

The cognitive core defines **how the AI thinks**, not just what it knows. It contains:

- **Thinking Framework:** The Understand → Plan → Verify → Learn hierarchy
- **Completion Standards:** What "done" means (tested, no TODOs, knowledge base intact)
- **Knowledge System Protocol:** Knowledge identification, silent marking, confirmation flow
- **Skills & Agents:** Reference to skills directory and sub-agent definitions
- **Commands:** What `/evokit-boot`, `/evokit-learn`, `/evokit-review` do

**Design Principle:** CLAUDE.md should change rarely. New knowledge goes into `evokit/knowledge/`.

### L2: Path Rules + Skills + Sub-agents

**Path Rules (.claude/rules/)** — Automatically loaded when editing files matching their `paths` pattern.

| Rule File | Scope | Purpose |
|-----------|-------|---------|
| `security.md` | `*/security*` | API keys, sensitive ops, injection prevention |
| `coding.md` | `*/coding*` | Style, quality, language-specific conventions |
| `core-invariants.md` | `*/core-invariants*` | Immutable system rules |

**Skills (.claude/skills/)** — Auto-invoked workflow instructions using progressive disclosure.

**Sub-agents (.claude/agents/)** — Specialized agents with isolated context.

| Agent | Tools | MaxTurns | Memory | Purpose |
|-------|-------|----------|--------|---------|
| `architect` | Read, Write, Bash, Agent, etc. | 20 | project | Design implementation plans |
| `reviewer` | Read, Grep, Glob, Bash | 15 | project | Code review for bugs/security/quality |

### L3: Knowledge Engine (evokit/)

The core infrastructure that persists project/personal knowledge AI can't know from training data.

#### Data Flow

```
Knowledge identified in conversation
     |
     v
.pending/{type}-{slug}.md  ──→  User confirms  ──→  knowledge/{type}-{slug}.md
     |                                        |
     |                                        v
     └── Rejected → delete              knowledge-index.md (append entry line)
```

#### Hooks

| Hook | Role in Knowledge Engine |
|------|--------------------------|
| `SessionStart` | Quick knowledge base integrity check (index existence, entry files, frontmatter format) |
| `Stop` | Check `.pending/` for unconfirmed items, prompt user to run `/evokit-learn` |

#### Management Commands

| Command | Purpose |
|---------|---------|
| `/evokit-boot` | Deep knowledge base integrity check |
| `/evokit-learn` | Review conversation-extracted knowledge / explicitly declare knowledge |
| `/evokit-review` | Code review via reviewer agent |

#### Knowledge Entry Structure

Each knowledge entry is `knowledge/{type}-{slug}.md` with YAML frontmatter + body:

```yaml
---
id: convention-uv-pip
scope: personal
type: convention
source: conversation
confidence: 0.9
created: "2026-07-30"
---
## 内容
Use uv instead of pip
```

#### Knowledge Types

| Type | Description | Example |
|------|-------------|---------|
| `convention` | Project convention | "Use Result<T> instead of throw" |
| `preference` | Personal preference | "Use uv instead of pip" |
| `architecture` | Architecture decision | "packages/api is upstream" |
| `workflow` | Workflow rule | "Use conventional commits format" |

## File Size Limits

| File | Max Lines | When Full |
|------|-----------|-----------|
| `CLAUDE.md` | 150 | Move content to `rules/` |
| `knowledge-index.md` | No hard limit | Staleness detection is self-regulating |

## Multi-Agent Adapter Architecture

```
+-------------+    +--------------+    +-------------+    +---------+
|  Claude     |    |  Codex       |    |  OpenCode   |    |  Pi     |
|  Code       |    |  CLI         |    |  CLI        |    |  CLI    |
+------+------+    +------+-------+    +------+------+    +----+---+
       |                  |                   |               |
       v                  v                   v               v
+---------------------------------------------------------------+
|              EvoKit Adapter Layer                               |
|  install → setup-hooks → status → uninstall                    |
+---------------------------------------------------------------+
|              Independent Knowledge Base per Adapter             |
|  ~/.claude/memory/evokit/  ~/.codex/memory/evokit/  ...        |
+---------------------------------------------------------------+
```

See [MULTI_AGENT.md](MULTI_AGENT.md) for the full adapter specification.
