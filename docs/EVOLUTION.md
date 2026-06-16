# EvoKit Evolution Pipeline

## Overview

The evolution pipeline transforms raw corrections into permanent behavioral rules. It is the core mechanism that makes EvoKit "self-evolving." The pipeline is driven by both user interactions and **automated hooks** that capture learning data continuously.

## Hook-Driven Learning Flow

```
                    Hook Events
                         |
     +-------------------+--------------------+
     |                   |                    |
PreToolUse         PostToolUse          PreCompact
(inject rules)    (track edits)    (snapshot state)
     |                   |                    |
     v                   v                    v
learned-rules.md   observations.jsonl   .compact_state
     |                   |
     v                   v
  /boot verify      /evolve promote
```

## Pipeline Stages

### Stage 1: Capture

Learning data is captured from multiple sources:

**Source 1: User Corrections (manual)**
When a user corrects the AI during conversation, Claude records it:

```json
{"timestamp":"2026-06-11T14:30:00","pattern":"use uv instead of pip","context":"user corrected pip install to uv pip install","count":1}
```

**Source 2: PostToolUse Hook (automatic)**
Every file edit via the `PostToolUse` hook records an observation with the file extension, line count, and path. This builds a usage profile of which file types are most frequently edited.

**Source 3: PreCompact Hook (context preservation)**
Before context compaction, the learning state snapshot is saved (including correction/observation counts) to prevent data loss.

**Format:** `corrections.jsonl` (append-only, never delete), `observations.jsonl` (append-only, auto-populated)

### Stage 2: Rotation (Auto)

When `corrections.jsonl` or `observations.jsonl` exceed **500 lines**:

1. Entries older than **30 days** are moved to `archive/`
2. Archives larger than **1000 lines** are gzip-compressed
3. Active file stays lean for fast `/evolve` processing

For `observations.jsonl`:
- Entries older than **60 days** have confidence halved
- Entries below **0.3 threshold** after decay are archived

### Stage 3: Promotion (/evolve)

Run `/evolve` every ~10 sessions to:

1. **Group corrections** by `pattern` field
2. **Promote** patterns appearing 2+ times to `learned-rules.md`
3. Each promoted rule gets:
   - A human-readable description
   - A `<!-- verify: ... -->` comment (machine-checkable)
   - A promotion date annotation

```markdown
- **Use uv instead of pip for Python package management**
  <!-- verify: grep -r 'pip install' --include='*.md' ~/.claude/ && exit 1 || exit 0 -->
  <!-- promoted: 2026-06-11 from corrections.jsonl -->
```

### Stage 4: Verification (/boot)

Every session start runs `/boot` (via SessionStart hook):

1. Read all rules in `learned-rules.md`
2. Run each rule's `verify` command
3. Pass → silent. Fail → log to `violations.jsonl`
4. Report summary: "N passed, M failed"

### Stage 5: Graduation (/evolve)

After a rule has been verified for **10+ sessions** without violations:

1. `/evolve` may propose moving it to `rules/` or `CLAUDE.md`
2. The proposal is logged in `evolution-log.md`
3. If accepted, the rule becomes permanent (L2 or L1)
4. The promotion entry in `learned-rules.md` is removed

### Stage 6: Rejection

If a rule doesn't make sense or is covered elsewhere:

1. `/evolve` logs the rejection to `evolution-log.md`
2. The pattern is **never re-proposed** (prevents oscillation)

## File Lifecycle

```
corrections.jsonl     learned-rules.md        rules/*.md / CLAUDE.md
┌──────────┐         ┌──────────────┐         ┌──────────────────┐
│ Stage 1  │──2×──►  │  Stage 3     │──10×──► │  Stage 5         │
│ Capture  │         │  Promote     │  verify  │  Graduate        │
└──────────┘         └──────────────┘         └──────────────────┘
     │                      │                         │
     ▼ (30d+)               ▼ (reject)                │
┌──────────┐         ┌──────────────┘                 │
│ archive/ │         │                                │
│ (gzip)   │         ▼                                │
└──────────┘   evolution-log.md                       │
     │              (never re-propose)                 │
     ▼                                                │
  deleted                                            │
    (after TTL)                                      │
                                                     ▼
                                              Permanent behavioral
                                              change (rarely changes)
```

## Configuration

The pipeline has sensible defaults that work for most users:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_lines` | 500 | Trigger rotation when file exceeds this |
| `max_days` | 30 | Archive entries older than this |
| `max_lines_archive` | 1000 | Gzip archives larger than this |
| `confidence_decay_days` | 60 | Halve confidence after this many days |
| `confidence_threshold` | 0.3 | Archive observations below this confidence |
| `promote_threshold` | 2 | Promote pattern after this many occurrences |
| `graduate_sessions` | 10 | Sessions before proposing graduation |
| `learned_rules_max` | 50 lines | Hard limit for learned-rules.md |
| `claude_md_max` | 150 lines | Hard limit for CLAUDE.md |

These can be adjusted in the `/evolve` command implementation.
