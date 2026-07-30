# EvoKit Knowledge System

## Overview

The core of EvoKit v1.0 is **knowledge lifecycle management** — persisting project/personal knowledge AI can't know from training data, from identification through confirmation to staleness detection.

## Knowledge Lifecycle

```
Knowledge identified in conversation → silently write to .pending/ → user confirms → move to knowledge/ → staleness detection
                    ↓                                      ↓
               Stop hook prompts                       update knowledge-index.md
```

### 1. Identification

AI identifies project/personal knowledge during conversation, silently writes to `.pending/{type}-{slug}.md`, without mentioning it in the response.

**Identification Signals:**

| Signal Category | Example Pattern | Knowledge Type |
|-----------------|-----------------|----------------|
| Project convention | "In our project, we always..." | convention |
| Personal preference | "I prefer..." | preference |
| Architecture decision | "X is upstream of Y" | architecture |
| Workflow rule | "When committing..." | workflow |
| Correction feedback | "No, it should be..." | depends on content |
| Implicit knowledge | AI makes same mistake, user corrects | convention/preference |

**Excluded:** One-time instructions, general programming knowledge, temporary context, unconfirmed guesses.

### 2. Pending

Entries written to `.pending/` have `status: pending` in their frontmatter. The Stop hook detects non-empty `.pending/` and prompts the user to run `/evokit-learn` to confirm.

### 3. Confirmation

Confirmation is performed via `/evokit-learn`:

1. Display all pending entries
2. User responds: "Confirm 1 and 3, reject 2"
3. Confirmed entries: move to `knowledge/` and update `knowledge-index.md`
4. Rejected entries: delete from `.pending/`

### 4. Persistence

Confirmed knowledge entries are stored in the `knowledge/` directory as `{type}-{slug}.md`, containing YAML frontmatter + body.

### 5. Staleness Detection (Planned)

Not implemented in v1.0. Planned approach:
- Periodically check if knowledge entries are still applicable (via verify commands or Git history analysis)
- Entries not referenced for a long time get reduced confidence
- Entries below threshold are marked for review

## Explicit Declaration

Users can directly create knowledge entries via `/evokit-learn "content"`, bypassing the .pending/ confirmation flow. Suitable for:
- User-initiated project conventions
- Architecture decisions extracted from docs/README
- Workflow rules from team standards

## Knowledge Entry Data Structure

### Frontmatter

```yaml
id: string           # Required, = filename without .md
scope: personal | project  # Required
type: convention | preference | architecture | workflow  # Required
source: conversation | explicit | git-history  # Required
confidence: number   # Required, 0.0–1.0
created: string      # Required, ISO 8601
updated?: string     # Optional, ISO 8601
context?: string     # Optional, one-line summary
tags?: string[]      # Optional, tag array
```

### Body Sections

- `## 适用范围` (optional) — detailed description expanding context
- `## 内容` (required) — specific description of the knowledge
- `## 来源上下文` (optional) — identification source, original conversation excerpt

### File Naming

`{type}-{slug}.md`, full type name, slug in kebab-case. Append number suffix on conflict.

## Knowledge Index

`knowledge-index.md` is always loaded, providing summary lines for all knowledge entries. AI quickly understands the full scope of project knowledge through the index, and loads specific entries on demand.

```markdown
## 个人知识

- [convention-uv-pip] 使用 uv 而非 pip
- [preference-dark-mode] 偏好暗色主题

## 项目知识

- [architecture-api-upstream] packages/api 是 packages/web 的上游
```

## Scope

| Level | Storage Location | Lifecycle | Description |
|-------|-----------------|-----------|-------------|
| Personal | `~/.claude/memory/evokit/` | Persists across projects | Personal preferences, toolchain preferences |
| Project | `.claude/memory/evokit/` | Follows project, can be committed to git | Project conventions, architecture decisions |

## Relationship with Claude Code Memory

**Enhancement, not replacement.**

- Claude Code memory = storage layer (filesystem, index, loading mechanism)
- EvoKit = intelligence layer (conversation extraction, structuring, confirmation, staleness detection, multi-agent sync)
- EvoKit works within the `evokit/` subdirectory, without modifying native Claude Code memory files
- `knowledge-index.md` can reference upper-level Claude Code native entries, allowing AI to query all knowledge at once
