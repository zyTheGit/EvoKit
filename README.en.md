<div align="center">

[**English**](README.en.md) · [**中文**](README.md)

<br>

# 🧠⚡ EvoKit

**Evolution Kit for AI Coding Agents**

*Make AI coding assistants learn and evolve across sessions*

[![Version](https://img.shields.io/github/v/release/zyTheGit/EvoKit?include_prereleases&style=flat-square&label=version)](CHANGELOG.md)
[![License](https://img.shields.io/github/license/zyTheGit/EvoKit?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/zyTheGit/EvoKit?style=flat-square)](https://github.com/zyTheGit/EvoKit/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/zyTheGit/EvoKit/ci.yml?branch=main&style=flat-square)](https://github.com/zyTheGit/EvoKit/actions)
[![GitHub issues](https://img.shields.io/github/issues/zyTheGit/EvoKit?style=flat-square)](https://github.com/zyTheGit/EvoKit/issues)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20WSL-blue?style=flat-square)]()
[![npm](https://img.shields.io/npm/v/%40zythegit%2Fevokit?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@zythegit/evokit)

---

**EvoKit** is an open-source **self-evolving system framework** for AI coding assistants. It enables Claude Code, Codex, OpenCode, and other AI tools to **get smarter over time** — by persisting corrections, observations, and rules across sessions, enabling automatic knowledge accumulation and promotion.

| Core Concept | Description |
|-------------|-------------|
| 🧠 **Cross-session Memory** | Corrections and observations persist across sessions, never lost |
| 📈 **Auto-promotion** | Repeated patterns automatically graduate to permanent rules |
| 🔌 **Hook-driven** | Fully automated session lifecycle management |
| 🚚 **One-click Migration** | Seamless transfer of learning data between machines |
| 🔒 **Privacy-first** | All data stored locally — no cloud, no telemetry |
| 🤖 **Multi-agent** | Adapter architecture supporting Claude Code / Codex / OpenCode / Aider |

</div>

---

## Preview

```
╔═══════════════════════════════════════════╗
║   EvoKit — Self-Evolving System Install   ║
╚═══════════════════════════════════════════╝

  ┌─────────────────────────────────────────────┐
  │  Select AI assistants to configure:          │
  ├─────────────────────────────────────────────┤
  │                                             │
  │  [1] Claude Code (recommended)  ~/.claude/  │
  │  [2] Codex CLI (v0.3.0)         ~/.codex/   │
  │  [3] OpenCode CLI (v0.4.0)      .opencode/  │
  │                                             │
  │  [4] All of the above                       │
  │  [5] Codex CLI + OpenCode                   │
  │                                             │
  │  Enter numbers separated by spaces.          │
  │  Press ENTER for default: [1] Claude Code    │
  └─────────────────────────────────────────────┘

  → 1

📁 Creating directories...
  ✓ .claude/rules/    ✓ .claude/agents/
  ✓ .claude/commands/ ✓ .claude/memory/
  ✓ .claude/hooks/
📄 Installing template files...
  ✓ CLAUDE.md    ✓ MEMORY.md
  ✓ settings.json   ✓ hooks/  ✓ rules/
  ✓ agents/      ✓ commands/
🔒 Setting permissions...
✅ EvoKit installed successfully!
```

| 🔍 `/boot` | 🔄 `/evolve` |
|:--:|:--:|
| <pre>[EVOLUTION BOOT] ═══════════════════════<br>  Self-Evolving System: checking integrity...<br>  ✓ .claude/rules/<br>  ✓ .claude/agents/<br>  ✓ .claude/commands/<br>  ✓ .claude/memory/<br>  ✓ .claude/hooks/<br>  ✓ CLAUDE.md: N lines (limit 150)<br>  ✓ learned-rules.md: N lines (limit 50)<br>═══════════════════════════════════════</pre> | <pre>[EVOLUTION AUDIT] ═════════════════════<br>  Rotating: corrections.jsonl (12 kept, 5 archived)<br>  Rotating: observations.jsonl (8 kept, 3 archived)<br>  Analyzing corrections...<br>  ✓ Promoted: "use uv instead of pip" (2×)<br>  ✓ Promoted: "no console.log in prod" (3×)<br>  ✓ learned-rules.md: 6 lines (limit 50)<br>═══════════════════════════════════════</pre> |
| 📦 `export-system.sh` | |
| <pre>📦 Creating migration package...<br>  ✓ system files copied<br>  ✓ rotation applied<br>  ✓ install.sh generated<br>🗜️  Packaging...<br>✅ claude-evolution-20260611.tar.gz<br><br>📊 Data overview:<br>  corrections:  12 entries<br>  observations: 8 entries<br>  learned-rules: 6 lines</pre> | |

---

## Architecture

EvoKit uses a **4-layer architecture** that progressively refines AI behavior from general principles to specific, learned rules.

```
┌─────────────────────────────────────────────────┐
│  L1: Cognitive Core (CLAUDE.md)                  │
│  Thinking framework · evolution protocol         │
│  Loaded: every session · Max: 150 lines          │
├─────────────────────────────────────────────────┤
│  L2: Path Rules (.claude/rules/)                 │
│  Auto-loaded by file path being edited           │
│  Security · coding conventions · invariants       │
├─────────────────────────────────────────────────┤
│  L3: Sub-agents (.claude/agents/)                │
│  Specialized agent definitions                   │
│  architect (plan) · reviewer (review)             │
├─────────────────────────────────────────────────┤
│  L4: Evolution Engine (.claude/memory/)          │
│  corrections → observations → promotion → audit  │
│  Commands: /boot · /evolve · /review              │
└─────────────────────────────────────────────────┘
```

### Evolution Pipeline

```
User corrects AI
      ↓
corrections.jsonl ← recorded (append-only, never deleted)
      ↓ (2+ same pattern)
learned-rules.md ← promoted with automated verify line
      ↓ (10+ sessions verified)
CLAUDE.md / rules/ ← graduated to permanent rules
      ↓
rejected rules → evolution-log.md (never re-propose)
```

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) and [EVOLUTION.md](docs/EVOLUTION.md) for detailed documentation.

---

## Quick Start

### Prerequisites

- [Claude Code](https://claude.ai/code) (or any AI coding assistant with hook support)
- **bash 4.0+** (Linux / macOS / WSL / Git Bash)
- **Node.js 18+** (for npm install or CLI usage)

### Install

Choose one of the following methods:

```bash
# npm install (recommended)
npm install -g @zythegit/evokit
evokit init

# Homebrew install
brew tap zyTheGit/homebrew-evokit
brew install evokit

# One-liner (curl | bash with interactive adapter selection)
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash

# Pre-select adapters (skip interactive menu, useful for CI automation)
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --adapter claude,codex

# Clone from GitHub
git clone https://github.com/zyTheGit/EvoKit.git
cd EvoKit
bash bin/install.sh
```

The installer shows an interactive menu to choose which AI assistants to configure:
- **Claude Code** (recommended) — `~/.claude/`
- **Codex CLI** — `~/.codex/`
- **OpenCode CLI** — `.opencode/` (project-level)
- Multi-select supported: type `1 3` to install both Claude Code + OpenCode

Use `--adapter` to bypass the menu for non-interactive setups (CI, cron).

### CLI Command Reference

After installation, use the `evokit` command to manage your system:

| Command | Description |
|---------|-------------|
| `evokit init` | Initialize EvoKit (install template to `~/.claude/`) |
| `evokit evolve` | Run evolution audit (rotation, promotion, pruning) |
| `evokit export` | Export system state for cross-machine migration |
| `evokit import <package>` | Import a migration package |
| `evokit doctor` | System health check and integrity verification |

```bash
# View all commands
evokit --help

# Command-specific help
evokit init --help
evokit evolve --help
```

### Verify

Launch Claude Code and run:

```
/boot
```

Expected output:

```
[EVOLUTION BOOT] ═══════════════════════
  Self-Evolving System: checking integrity...
  ✓ .claude/rules/
  ✓ .claude/agents/
  ✓ .claude/commands/
  ✓ .claude/memory/
  ✓ .claude/hooks/
  ✓ CLAUDE.md: N lines (limit 150)
  ✓ learned-rules.md: N lines (limit 50)
═══════════════════════════════════════
```

---

## Features

### Built-in Commands

| Command | When | What |
|---------|------|------|
| `/boot` | Every session start | Verify system integrity |
| `/evolve` | Every ~10 sessions | Promote patterns, prune stale rules |
| `/review` | Before commit | Code review via reviewer agent |

### Key Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Cognitive core — thinking framework, evolution protocol (max 150 lines) |
| `.claude/rules/` | Path-scoped rules (security, coding, invariants) |
| `.claude/agents/` | Sub-agent definitions (architect, reviewer) |
| `.claude/commands/` | Slash commands (/boot, /evolve, /review) |
| `.claude/memory/` | Learning data — corrections, observations, learned rules, session logs |
| `.claude/hooks/` | Session lifecycle hooks (start, stop, export) |

### Examples

See the [examples/](examples/) directory for full customization samples:

| Example | Description |
|---------|-------------|
| [Custom Rules](examples/custom-rules/) | Jest test rules, Docker conventions, Python project configs |
| [Custom Agents](examples/custom-agents/) | Test generator, database migration assistant |
| [Custom Commands](examples/custom-commands/) | `/changelog` generation, deployment checks |

---

## Migration

```bash
# 1. Export from old machine
bash ~/.claude/hooks/export-system.sh

# 2. Transfer to new machine
scp claude-evolution-*.tar.gz new-machine:~/

# 3. Import on new machine
cd ~/ && tar xzf claude-evolution-*.tar.gz && bash install.sh
```

See: [MIGRATION.md](docs/MIGRATION.md)

---

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 4-layer architecture deep dive |
| [EVOLUTION.md](docs/EVOLUTION.md) | Evolution pipeline detailed walkthrough |
| [INSTALL.md](docs/INSTALL.md) | Cross-platform installation guide |
| [MIGRATION.md](docs/MIGRATION.md) | Cross-machine migration guide |
| [CUSTOMIZE.md](docs/CUSTOMIZE.md) | Custom rules, agents, and commands |
| [MULTI_AGENT.md](docs/MULTI_AGENT.md) | Multi-agent adapter architecture |
| [FAQ.md](docs/FAQ.md) | Frequently asked questions |

---

## Roadmap

### Completed ✅

**v0.1.0** — Core template + installer + documentation + Git release
- ✅ 4-layer self-evolving architecture (CLAUDE.md → rules/ → agents/ → commands/ → memory/)
- ✅ SessionStart / Stop hooks
- ✅ Evolution audit (/evolve) with rotation and confidence decay
- ✅ One-click migration (export-system.sh)
- ✅ Cross-platform (Linux / macOS / WSL / Git Bash)
- ✅ Privacy-first: zero telemetry, all local storage

**v0.2.0** — Standalone CLI tool
- ✅ `evokit` CLI (TypeScript/Node.js, replaces bash scripts)
- ✅ `evokit init` with `--template`, `--branch`, `--dry-run`, `--verify`
- ✅ `evokit evolve` — rotation, confidence decay, promotion, pruning
- ✅ `evokit export` / `evokit import` — cross-machine migration
- ✅ `evokit doctor` — system integrity verification
- ✅ npm package (`@zythegit/evokit`) + Homebrew support
- ✅ 41 vitest test cases

**v0.3.0 — Codex Adapter** 🆕
- ✅ Codex CLI integration adapter (`~/.codex/` templates, AGENTS.md, hooks.json, config.toml)
- ✅ Codex hook mechanism mapping (SessionStart / Stop / PreToolUse)
- ✅ Shared learning data across assistants (shared `~/.claude/memory/`)
- ✅ Interactive adapter selection menu (box-drawing UI, multi-select support, default-on-Enter)
- ✅ 29 new tests (adapter + shared memory)

### Planned 🔜

**v0.4.0 — OpenCode + Aider Adapters**
- ☐ OpenCode CLI plugin integration
- ☐ Aider convention file integration
- ☐ Unified adapter interface registry

**v0.5.0 — Standalone Evolution Engine**
- ☐ Independent rule promotion engine (runs without Claude Code)
- ☐ Web UI management dashboard
- ☐ Visualized learning data

### Future 🔮

**v1.0.0 — Stable API + Ecosystem**
- ☐ Stable adapter API
- ☐ GitHub Action integration
- ☐ Community plugin marketplace
- ☐ Enterprise-grade permission management

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Ideas for Contributors

- Write custom rule/agent/command examples
- Implement new adapters (Codex, OpenCode, Aider)
- Improve documentation and screenshots
- Report bugs or suggest features
- Improve test coverage

---

## License

MIT © 2026 EvoKit Contributors

## Acknowledgments

Inspired by the self-evolving Claude Code system practices from the Chinese developer community. Thanks to all open-source contributors.

*Built with ❤️ for the open-source AI ecosystem.*
