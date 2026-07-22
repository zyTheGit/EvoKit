# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EvoKit is a **self-evolving system framework** for AI coding assistants. It consists of a template directory structure and installation scripts that get deployed to `~/.claude/`, enabling AI assistants to persist corrections, observations, and rules across sessions.

This repository is the **meta-project** (the framework itself), not the user's installed instance. The `template/` directory is what gets installed.

## Architecture (4-Layer)

See `docs/en/ARCHITECTURE.md` for full detail.

| Layer                | Location                                  | Purpose                                             |
| -------------------- | ----------------------------------------- | --------------------------------------------------- |
| L1: Cognitive Core   | `template/CLAUDE.md`                      | Thinking framework, evolution protocol (≤150 lines) |
| L2: Path Rules       | `template/rules/`                         | Auto-loaded rules scoped by file path               |
| L3: Sub-agents       | `template/agents/`                        | Specialized agent defs (architect, reviewer)        |
| L4: Evolution Engine | `template/memory/` + `template/commands/` | corrections → observations → promotion → audit      |

## Key Directories

- **`template/`** — Installable template (mirrors `~/.claude/` structure); this is the product
  - `template/hooks/` — Session lifecycle hooks (`session-start.sh`, `stop.sh`, `export-system.sh`)
  - `template/commands/` — Slash commands (`boot.md`, `evolve.md`, `review.md`)
  - `template/rules/` — Path-scoped rules deployed to users
  - `template/agents/` — Sub-agent definitions
  - `template/memory/` — Learning data files (seeded empty for users)
- **`bin/`** — `install.sh` (one-click installer, supports `--dry-run` and `--template`)
- **`src/adapters/`** — Multi-agent adapter TypeScript sources (Claude Code: done; Codex/OpenCode/Pi: planned)
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

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles, all using default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

# 本地 CI 等效验证（模板结构 + 无个人路径 + shellcheck + dry-run）
# 各步骤见 .github/workflows/ci.yml，本地命令速查见 docs/zh/DEV_STANDARDS.md §9

# Template structure test
test -f template/claude/CLAUDE.md && test -f template/claude/settings.json && test -f template/claude/MEMORY.md
test -f template/claude/hooks/session-start.sh && test -f template/claude/hooks/stop.sh && test -f template/claude/hooks/export-system.sh
```

## Important Design Rules

权威完整版见 `docs/zh/DEV_STANDARDS.md`（§7 模板红线）；路径规则见 `.claude/rules/`。

- **模板无个人路径** — 一律使用 `__HOME__` 占位符（含 `settings.json`），安装时 `sed` 替换；CI grep 校验
- **Memory 文件 append-only** — `corrections.jsonl` / `observations.jsonl` 条目永不删除
- **行数限制** — `learned-rules.md` ≤ 50 行；`CLAUDE.md` ≤ 150 行（认知核心，不是垃圾场）
- **轮转与衰减** — `/evolve` 负责（30 天归档、1000 行 gzip、60 天置信度减半）
- **内嵌 Python** — `stop.sh` 优先 `uv run --isolated python3`，不可用时回退 `python3`
