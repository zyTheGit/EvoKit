<div align="center">

[**English**](README.en.md) · [**中文**](README.md)

<br>

# 🧠⚡ EvoKit

**Evolution Kit for AI Coding Agents**

_Make AI coding assistants learn and evolve across sessions_

[![Version](https://img.shields.io/github/v/release/zyTheGit/EvoKit?include_prereleases&style=flat-square&label=version)](CHANGELOG.md)
[![License](https://img.shields.io/github/license/zyTheGit/EvoKit?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/zyTheGit/EvoKit?style=flat-square)](https://github.com/zyTheGit/EvoKit/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/zyTheGit/EvoKit/ci.yml?branch=main&style=flat-square)](https://github.com/zyTheGit/EvoKit/actions)
[![GitHub issues](https://img.shields.io/github/issues/zyTheGit/EvoKit?style=flat-square)](https://github.com/zyTheGit/EvoKit/issues)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20WSL-blue?style=flat-square)](<>)
[![npm](https://img.shields.io/npm/v/%40zythegit%2Fevokit?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@zythegit/evokit)

---

**EvoKit** is an open-source **self-evolving system framework** for AI coding assistants. It enables Claude Code, Codex, OpenCode, and other AI tools to **get smarter over time** — by persisting corrections, observations, and rules across sessions, enabling automatic knowledge accumulation and promotion.

| Core Concept                | Description                                                             |
| --------------------------- | ----------------------------------------------------------------------- |
| 🧠 **Cross-session Memory** | Corrections and observations persist across sessions, never lost        |
| 📈 **Auto-promotion**       | Repeated patterns automatically graduate to permanent rules             |
| 🔌 **Hook-driven**          | Fully automated session lifecycle management                            |
| 🚚 **One-click Migration**  | Seamless transfer of learning data between machines                     |
| 🔒 **Privacy-first**        | All data stored locally — no cloud, no telemetry                        |
| 🤖 **Multi-agent**          | Adapter architecture supporting Claude Code / Codex / OpenCode / Pi CLI |

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

|                                                                                                                                                                  🔍 `/boot`                                                                                                                                                                  |                                                                                                                                                                                 🔄 `/evolve`                                                                                                                                                                                 |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| <pre>[EVOLUTION BOOT] ═══════════════════════<br> Self-Evolving System: checking integrity...<br> ✓ .claude/rules/<br> ✓ .claude/agents/<br> ✓ .claude/commands/<br> ✓ .claude/memory/<br> ✓ .claude/hooks/<br> ✓ CLAUDE.md: N lines (limit 150)<br> ✓ learned-rules.md: N lines (limit 50)<br>═══════════════════════════════════════</pre> | <pre>[EVOLUTION AUDIT] ═════════════════════<br> Rotating: corrections.jsonl (12 kept, 5 archived)<br> Rotating: observations.jsonl (8 kept, 3 archived)<br> Analyzing corrections...<br> ✓ Promoted: "use uv instead of pip" (2×)<br> ✓ Promoted: "no console.log in prod" (3×)<br> ✓ learned-rules.md: 6 lines (limit 50)<br>═══════════════════════════════════════</pre> |
|                                                                                                                                                            📦 `export-system.sh`                                                                                                                                                             |                                                                                                                                                                                                                                                                                                                                                                              |
|                        <pre>📦 Creating migration package...<br> ✓ system files copied<br> ✓ rotation applied<br> ✓ install.sh generated<br>🗜️ Packaging...<br>✅ claude-evolution-20260611.tar.gz<br><br>📊 Data overview:<br> corrections: 12 entries<br> observations: 8 entries<br> learned-rules: 6 lines</pre>                         |                                                                                                                                                                                                                                                                                                                                                                              |

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

See [ARCHITECTURE.md](docs/en/ARCHITECTURE.md) and [EVOLUTION.md](docs/en/EVOLUTION.md) for detailed documentation.

---

## Quick Start

### Prerequisites

- [Claude Code](https://claude.ai/code) ≥ v0.1.0 (or any AI coding assistant with hook/tool support)
- **bash 4.0+** (Linux / macOS / WSL / Git Bash) — required for hook scripts
- **Node.js ≥ 20.12.0** (for npm install or CLI usage)

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

| Command                   | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `evokit init`             | Initialize EvoKit (install template to `~/.claude/`) |
| `evokit evolve`           | Run evolution audit (rotation, promotion, pruning)   |
| `evokit export`           | Export system state for cross-machine migration      |
| `evokit import <package>` | Import a migration package                           |
| `evokit doctor`           | System health check and integrity verification       |
| `evokit uninstall`        | Uninstall EvoKit (manifest-driven precise rollback)  |
| `evokit project`          | Generate project-level AI assistant spec files       |

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

| Command   | When                | What                                |
| --------- | ------------------- | ----------------------------------- |
| `/boot`   | Every session start | Verify system integrity             |
| `/evolve` | Every ~10 sessions  | Promote patterns, prune stale rules |
| `/review` | Before commit       | Code review via reviewer agent      |

### Key Files

| File                | Purpose                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `CLAUDE.md`         | Cognitive core — thinking framework, evolution protocol (max 150 lines) |
| `.claude/rules/`    | Path-scoped rules (security, coding, invariants)                        |
| `.claude/agents/`   | Sub-agent definitions (architect, reviewer)                             |
| `.claude/commands/` | Slash commands (/boot, /evolve, /review)                                |
| `.claude/memory/`   | Learning data — corrections, observations, learned rules, session logs  |
| `.claude/hooks/`    | Session lifecycle hooks (start, stop, export)                           |

### Examples

See the [examples/](examples/) directory for full customization samples:

| Example                                      | Description                                                 |
| -------------------------------------------- | ----------------------------------------------------------- |
| [Custom Rules](examples/custom-rules/)       | Jest test rules, Docker conventions, Python project configs |
| [Custom Agents](examples/custom-agents/)     | Test generator, database migration assistant                |
| [Custom Commands](examples/custom-commands/) | `/changelog` generation, deployment checks                  |

---

## Adapter Versions

EvoKit supports multiple AI coding assistants through a unified adapter interface. Each adapter is versioned independently, matching the supported assistant's milestone.

| Adapter          | Version | Status                | Install Target               | Assistant Compatibility     |
| ---------------- | ------- | --------------------- | ---------------------------- | --------------------------- |
| **Claude Code**  | v0.2.0  | ✅ **Full support**   | `~/.claude/`                 | Claude Code ≥ v0.1.0 (CLI)  |
| **Codex CLI**    | v0.3.0  | ✅ **Full support**   | `~/.codex/`                  | Codex CLI ≥ v0.3.0 (OpenAI) |
| **OpenCode CLI** | v0.4.0  | ✅ **Full support**   | `.opencode/` (project-level) | OpenCode CLI ≥ v0.4.0       |
| **Pi CLI**       | —       | 🚧 **Stub / Planned** | —                            | Pi CLI (planned)            |

> **Adapter versioning**: Each adapter's `version` field is defined in its source (`src/adapters/*/adapter.ts`) and corresponds to the EvoKit milestone where that assistant first received full support. Subsequent iterations ship with the main EvoKit release cycle.

---

## Dependencies

### Runtime Requirements

| Dependency                                 | Category | Minimum Version | Purpose                               |
| ------------------------------------------ | -------- | --------------- | ------------------------------------- |
| [Node.js](https://nodejs.org/)             | Runtime  | ≥ 20.12.0       | CLI tool, npm package execution       |
| [bash](https://www.gnu.org/software/bash/) | Runtime  | ≥ 4.0           | Hook script execution                 |
| [Git](https://git-scm.com/)                | Runtime  | ≥ 2.0           | Template download, version management |

### NPM Dependencies

The EvoKit CLI tool depends on the following npm packages (auto-installed):

| Package                                                      | Version | Purpose                                                   |
| ------------------------------------------------------------ | ------- | --------------------------------------------------------- |
| [`@clack/prompts`](https://github.com/natemoo-re/clack)      | ^1.5.1  | Interactive CLI prompts (menus, input, selection)         |
| [`commander`](https://github.com/tj/commander.js)            | ^12.1.0 | CLI command framework (argument parsing, help)            |
| [`conf`](https://github.com/sindresorhus/conf)               | ^12.0.0 | JSON config persistence                                   |
| [`fs-extra`](https://github.com/jprichardson/node-fs-extra)  | ^11.3.0 | Enhanced filesystem operations (copy, remove, ensure dir) |
| [`picocolors`](https://github.com/alexeyraspopov/picocolors) | ^1.1.1  | Terminal color output                                     |

### Dev Dependencies

| Package                                                                 | Version  | Purpose                                |
| ----------------------------------------------------------------------- | -------- | -------------------------------------- |
| [TypeScript](https://www.typescriptlang.org/)                           | ^5.6.0   | Type checking and compilation          |
| [tsx](https://github.com/privatenumber/tsx)                             | ^4.19.0  | Direct TypeScript execution (dev mode) |
| [vitest](https://vitest.dev/)                                           | ^2.1.0   | Unit testing & coverage                |
| [`@types/node`](https://github.com/DefinitelyTyped/DefinitelyTyped)     | ^18.19.0 | Node.js type definitions               |
| [`@types/fs-extra`](https://github.com/DefinitelyTyped/DefinitelyTyped) | ^11.0.4  | fs-extra type definitions              |

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

See: [MIGRATION.md](docs/en/MIGRATION.md)

---

## Documentation

| Document                                   | Description                             |
| ------------------------------------------ | --------------------------------------- |
| [ARCHITECTURE.md](docs/en/ARCHITECTURE.md) | 4-layer architecture deep dive          |
| [EVOLUTION.md](docs/en/EVOLUTION.md)       | Evolution pipeline detailed walkthrough |
| [INSTALL.md](docs/en/INSTALL.md)           | Cross-platform installation guide       |
| [MIGRATION.md](docs/en/MIGRATION.md)       | Cross-machine migration guide           |
| [CUSTOMIZE.md](docs/en/CUSTOMIZE.md)       | Custom rules, agents, and commands      |
| [MULTI_AGENT.md](docs/en/MULTI_AGENT.md)   | Multi-agent adapter architecture        |
| [FAQ.md](docs/en/FAQ.md)                   | Frequently asked questions              |

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

**v0.3.0 — Codex Adapter**

- ✅ Codex CLI integration adapter (`~/.codex/` templates, AGENTS.md, hooks.json, config.toml)
- ✅ Codex hook mechanism mapping (SessionStart / Stop / PreToolUse)
- ✅ Shared learning data across assistants (shared `~/.claude/memory/`)
- ✅ Interactive adapter selection menu (box-drawing UI, multi-select support, default-on-Enter)
- ✅ 29 new tests (adapter + shared memory)

**v0.4.0 ~ v0.4.2 — Adapter Interface Refactor + Multi-assistant Support**

- ✅ **Unified adapter interface** — Extracted `AdapterInstaller` interface (`src/adapters/types.ts`) + registry (`registry.ts`), shared contract across all assistants
- ✅ **Claude Code Adapter v0.2.0** — Modular refactor, pluggable installation pipeline
- ✅ **Codex CLI Adapter v0.3.0** — AGENTS.md / hooks.json / config.toml / Starlark rules
- ✅ **OpenCode CLI Adapter v0.4.0** — AGENTS.md / opencode.json / custom tools / project-level install
- ✅ **Pi CLI Adapter** — Stub created (`src/adapters/pi/adapter.ts`), pending implementation
- ✅ **Smart config merge** — Won't overwrite existing settings / AGENTS.md / opencode.json
- ✅ **Interactive adapter selection** — box-drawing UI, multi-select, default-on-Enter

**v0.5.0 — Layout Engine + Uninstall + Project Specs** 🆕

- ✅ **Declarative layout engine** — `AdapterLayout` types + `executeLayout()` executor, upgrading adapter installation from imperative scripts to declarative config
- ✅ **Manifest-driven uninstall** — `evokit uninstall` command, precise rollback of all installation operations via `manifest.json` (files, hooks, env vars, agent frontmatter)
- ✅ **Heuristic uninstall fallback** — Automatically falls back to heuristic mode when no manifest exists, safely removing known EvoKit traces
- ✅ **Project-level spec generation** — `evokit project` command, interactively generates project `.claude/` structure (rules + CLAUDE.md + agents + commands)
- ✅ **Pi CLI adapter replaces Aider** — Removed Aider stub, replaced with Pi CLI adapter stub
- ✅ **Windows path fixes** — `__HOME__` placeholder backslash-to-forward-slash conversion, fixing JSON parsing on Windows
- ✅ **Bilingual documentation** — `docs/zh/` + `docs/en/` parallel structure, added DEV_STANDARDS development guide
- ✅ **CLI fully localized** — Code comments, CLI prompts, error messages all in Chinese
- ✅ **203 vitest test cases**

### In Development 🚧

- 🚧 Self-healing CI pipeline
- 🚧 Pi CLI adapter full implementation

### Planned 🔜

**v0.6.0 — Standalone Evolution Engine**

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
- Implement new adapters (Codex, OpenCode, Pi CLI)
- Improve documentation and screenshots
- Report bugs or suggest features
- Improve test coverage

---

## License

MIT © 2026 EvoKit Contributors

## Acknowledgments

Inspired by the self-evolving Claude Code system practices from the Chinese developer community. Thanks to all open-source contributors.

_Built with ❤️ for the open-source AI ecosystem._
