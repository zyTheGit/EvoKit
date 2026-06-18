# EvoKit — OpenCode Learning Data

This directory stores learning data for your OpenCode EvoKit integration.

## Data Location

All evolution data lives at: **`~/.config/opencode/memory/`** (global)

| File | Purpose |
|------|---------|
| `corrections.jsonl` | User corrections (append-only, never deleted) |
| `observations.jsonl` | Self-noticed patterns |
| `learned-rules.md` | Promoted permanent rules (max 50 lines) |
| `evolution-log.md` | Audit trail of evolution decisions |
| `sessions.jsonl` | Session scorecards |
| `violations.jsonl` | Boot verification violations |

This memory directory is global to OpenCode and shared across all projects.
