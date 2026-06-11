<div align="center">

# 🧠⚡ EvoKit

**Evolution Kit for AI Coding Agents**

让 AI 编程助手拥有自我进化能力

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

## 🌟 What is EvoKit?

EvoKit 是一个开源的 **自进化系统框架**，为 AI 编程助手（Claude Code、Codex、OpenCode 等）提供跨会话学习能力。

**核心思想：** 每次对话中 AI 被纠正的错误、发现的模式、积累的知识，都会通过文件持久化跨会话保留，并自动晋升为永久规则。AI 越用越聪明，越用越懂你。

### ✨ Features

| Feature | Description |
|---------|-------------|
| 🧠 **Cross-session Memory** | Corrections and observations persist across sessions |
| 📈 **Auto Promotion** | Repeated patterns auto-promote to permanent rules |
| 🔌 **Hook Driven** | Session lifecycle management via hooks |
| 🚚 **One-click Migration** | Seamless migration across machines |
| 🔒 **Privacy First** | All data stays local — no cloud, no telemetry |
| 🤖 **Multi-agent Ready** | Adapter architecture for Claude Code, Codex, OpenCode, Aider |

### 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│  L1: Cognitive Core (CLAUDE.md)              │
│  Behavioral programming, thinking framework  │
├─────────────────────────────────────────────┤
│  L2: Path Rules (.claude/rules/)             │
│  Auto-loaded by file path (security/coding)  │
├─────────────────────────────────────────────┤
│  L3: Sub-agents (.claude/agents/)            │
│  architect (plan) + reviewer (review)        │
├─────────────────────────────────────────────┤
│  L4: Evolution Engine (.claude/memory/)     │
│  corrections → observations → promotion     │
└─────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- [Claude Code](https://claude.ai/code) (or other supported AI coding assistant)
- bash 4.0+ (Linux / macOS / WSL)

### Install

```bash
# One-line install (coming soon)
# curl -fsSL https://evokit.dev/install.sh | bash

# Or from source
git clone https://github.com/your-username/EvoKit.git
cd EvoKit
bash bin/evokit-install.sh
```

### Verify

Start Claude Code and run:

```
/boot
```

You should see:

```
[EVOLUTION BOOT] ═══════════════════════
  ✓ .claude/rules/
  ✓ .claude/agents/
  ✓ .claude/commands/
  ✓ .claude/memory/
  ✓ CLAUDE.md: N lines (limit 150)
  ✓ learned-rules.md: N lines (limit 50)
═══════════════════════════════════════
```

---

## 📖 How It Works

### The Evolution Loop

```
User corrects AI
      ↓
corrections.jsonl ← recorded
      ↓ (2+ same pattern)
learned-rules.md ← promoted (with verify line)
      ↓ (10+ sessions, verified)
CLAUDE.md / rules/ ← graduated
      ↓
rejected rules → evolution-log.md (never re-propose)
```

### Commands

| Command | When | What |
|---------|------|------|
| `/boot` | Session start | Verify system integrity |
| `/evolve` | Every ~10 sessions | Promote patterns, prune stale rules |
| `/review` | Before commit | Review changes via reviewer agent |

### Key Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Cognitive core — thinking framework, evolution protocol (max 150 lines) |
| `.claude/rules/` | Path-scoped rules (security, coding, invariants) |
| `.claude/agents/` | Sub-agent definitions (architect, reviewer) |
| `.claude/commands/` | Slash commands (/boot, /evolve, /review) |
| `.claude/memory/` | Learning data — corrections, observations, learned rules |
| `.claude/hooks/` | Session lifecycle hooks (session-start, stop) |

---

## 🔧 Customization

See [CUSTOMIZE.md](docs/CUSTOMIZE.md) for:

- Writing custom rules
- Creating custom agents
- Adding custom commands
- Adjusting rotation thresholds
- Multi-agent setup

## 📦 Migration

See [MIGRATION.md](docs/MIGRATION.md) for:

- Migrating to a new machine
- Backing up your learning data
- Syncing across multiple machines

---

## 🗺️ Roadmap

| Version | Focus | Status |
|---------|-------|--------|
| v0.1.0 | Core template + install + docs | ✅ Current |
| v0.2.0 | Standalone CLI tool | 🔜 Planned |
| v0.3.0 | Codex adapter | 🔜 Planned |
| v0.4.0 | OpenCode / Aider adapters | 🔜 Planned |
| v1.0.0 | Stable API + multi-agent support | 🔮 Future |

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT © 2026 EvoKit Contributors

## 🙏 Acknowledgments

Inspired by the self-evolving Claude Code systems pioneered by the Chinese developer community. Built with ❤️ for the open-source AI ecosystem.
