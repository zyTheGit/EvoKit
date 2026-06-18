# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EvoKit is a **self-evolving system framework** for AI coding assistants. It consists of a template directory structure and installation scripts that get deployed to `~/.claude/`, enabling AI assistants to persist corrections, observations, and rules across sessions.

This repository is the **meta-project** (the framework itself), not the user's installed instance. The `template/` directory is what gets installed.

## Architecture (4-Layer)

See `docs/en/ARCHITECTURE.md` for full detail.

| Layer | Location | Purpose |
|-------|----------|---------|
| L1: Cognitive Core | `template/CLAUDE.md` | Thinking framework, evolution protocol (≤150 lines) |
| L2: Path Rules | `template/rules/` | Auto-loaded rules scoped by file path |
| L3: Sub-agents | `template/agents/` | Specialized agent defs (architect, reviewer) |
| L4: Evolution Engine | `template/memory/` + `template/commands/` | corrections → observations → promotion → audit |

## Key Directories

- **`template/`** — Installable template (mirrors `~/.claude/` structure); this is the product
  - `template/hooks/` — Session lifecycle hooks (`session-start.sh`, `stop.sh`, `export-system.sh`)
  - `template/commands/` — Slash commands (`boot.md`, `evolve.md`, `review.md`)
  - `template/rules/` — Path-scoped rules deployed to users
  - `template/agents/` — Sub-agent definitions
  - `template/memory/` — Learning data files (seeded empty for users)
- **`bin/`** — `install.sh` (one-click installer, supports `--dry-run` and `--template`)
- **`src/adapters/`** — Multi-agent adapter TypeScript sources (Claude Code: done; Codex/OpenCode/Aider: planned)
- **`docs/`** — Bilingual documentation (`en/` for English, `zh/` for Chinese): architecture, evolution pipeline, migration, multi-agent, customization, FAQ
- **`examples/`** — Example custom rules, agents, and commands for users

## Evolution Pipeline

```
correction → corrections.jsonl → (2+ same pattern) → learned-rules.md → (10+ sessions verified) → rules/ or CLAUDE.md
rejected rules → evolution-log.md (never re-propose)
```

See `docs/en/EVOLUTION.md` for the full pipeline with rotation, confidence decay, and graduation config.

## Commands

These are commands for **developing this repository** (not the user-facing `/boot` etc.):

```bash
# Dry-run install (validate template structure without modifying anything)
bash bin/install.sh --dry-run

# Install to a test home directory
HOME=/tmp/evokit-test-home bash bin/install.sh --template template

# Shellcheck all shell scripts
shellcheck bin/*.sh template/claude/hooks/*.sh

# CI-equivalent validation (template structure + no personal paths + shellcheck + dry-run)
bash .github/workflows/ci.yml-equivalent  # or run the individual steps from ci.yml

# Template structure test
test -f template/claude/CLAUDE.md && test -f template/claude/settings.json && test -f template/claude/MEMORY.md
test -f template/claude/hooks/session-start.sh && test -f template/claude/hooks/stop.sh && test -f template/claude/hooks/export-system.sh
```

## Important Design Rules

- **No personal paths in templates** — the installer uses `__HOME__` placeholders that get replaced at install time via `sed`. Never hardcode `/home/...` paths in template files.
- **`settings.json` uses `__HOME__`** placeholder (replaced by `sed -i` during install).
- **Memory files are append-only** — `corrections.jsonl` and `observations.jsonl` entries are never deleted.
- **`learned-rules.md`** must never exceed 50 lines.
- **`CLAUDE.md`** must never exceed 150 lines.
- The `/evolve` command handles rotation (archive entries >30d old, gzip >1000 lines) and confidence decay (halve confidence after 60d).
- The `stop.sh` hook uses embedded Python (via `uv run --isolated python3` if available) for JSON processing.
