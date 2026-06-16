# EvoKit — Shared Learning Data

This directory references learning data stored in `~/.claude/memory/`, shared across all AI coding assistants (Claude Code, Codex CLI, etc.).

## Data Location

All evolution data lives at: **`~/.claude/memory/`**

| File | Purpose |
|------|---------|
| `corrections.jsonl` | User corrections (append-only, never deleted) |
| `observations.jsonl` | Self-noticed patterns |
| `learned-rules.md` | Promoted permanent rules (max 50 lines) |
| `evolution-log.md` | Audit trail of evolution decisions |
| `sessions.jsonl` | Session scorecards (tagged by assistant) |
| `violations.jsonl` | Boot verification violations |

## Why Shared?

- Corrections made to any assistant benefit all assistants
- Learned rules apply consistently across tools
- Single source of truth for evolutionary data

## Session Tagging

Each session record in `sessions.jsonl` includes an `"assistant"` field:
- `"claude"` — Claude Code session
- `"codex"` — Codex CLI session

This allows per-assistant analytics while sharing the common learning pool.
