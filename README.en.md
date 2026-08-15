<div align="center">

[**English**](README.en.md) · [**中文**](README.md)

<br>

# 🧠⚡ EvoKit

**Project Context Engine for AI Coding Agents**

_Make AI instantly understand your project, persist knowledge AI can't know from training data_

[![Version](https://img.shields.io/github/v/release/zyTheGit/EvoKit?include_prereleases&style=flat-square&label=version)](CHANGELOG.md)
[![License](https://img.shields.io/github/license/zyTheGit/EvoKit?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/zyTheGit/EvoKit?style=flat-square)](https://github.com/zyTheGit/EvoKit/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/zyTheGit/EvoKit/ci.yml?branch=main&style=flat-square)](https://github.com/zyTheGit/EvoKit/actions)
[![npm](https://img.shields.io/npm/v/%40zythegit%2Fevokit?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@zythegit/evokit)

---

**EvoKit** is an open-source **project context engine** for AI coding assistants. It enables Claude Code, Codex, OpenCode, and other AI tools to **instantly understand your project** — by extracting knowledge from conversations, building a persistent knowledge index, and detecting stale rules over time.

| Core Concept                   | Description                                                             |
| ------------------------------ | ----------------------------------------------------------------------- |
| 💬 **Conversation Extraction** | Extract corrections and observations from conversations automatically   |
| 📚 **Knowledge Index**         | Build a persistent, searchable knowledge base across sessions           |
| 🔄 **Staleness Detection**     | Automatically detect and prune outdated rules and patterns              |
| 🚚 **One-click Migration**     | Seamless transfer of learning data between machines                     |
| 🔒 **Privacy-first**           | All data stored locally — no cloud, no telemetry                        |
| 🤖 **Multi-agent**             | Adapter architecture supporting Claude Code / Codex / OpenCode / Pi CLI |

</div>

---

## Quick Start

### Prerequisites

- [Claude Code](https://claude.ai/code) ≥ 2.1.220 (or any AI coding assistant with hook/tool support)
- **bash 4.0+** (Linux / macOS / WSL / Git Bash)
- **Node.js ≥ 20.12.0**

### Install

```bash
# npm (recommended)
npm install -g @zythegit/evokit
evokit init

# Homebrew
brew tap zyTheGit/homebrew-evokit
brew install evokit

# One-liner (interactive adapter selection)
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash
```

Select adapters during install:

| Adapter          | Install Target               |
| ---------------- | ---------------------------- |
| **Claude Code**  | `~/.claude/`                 |
| **Codex CLI**    | `~/.codex/`                  |
| **OpenCode CLI** | `.opencode/` (project-level) |
| **Pi CLI**       | `~/.pi/agent/`               |

Use `--adapter claude,codex` to skip the interactive menu (CI automation).

### Update

After upgrading the npm package, refresh template files for all installed adapters:

```bash
evokit update
```

Update overwrites framework files (hooks, rules, commands, agents, skills) while preserving user data (CLAUDE.md, MEMORY.md, memory/).

### CLI Commands

```bash
evokit init         Initialize installation
evokit update       Upgrade template files
evokit migrate      Migrate learning data between machines
evokit doctor       System health check
```

### Verify

Launch your AI assistant and run:

```
/evokit-boot
```

---

## Built-in Commands

| Command          | When                | What                                |
| ---------------- | ------------------- | ----------------------------------- |
| `/evokit-boot`   | Every session start | Verify system integrity             |
| `/evokit-learn`  | Every ~10 sessions  | Promote patterns, prune stale rules |
| `/evokit-review` | Before commit       | Code review via reviewer agent      |

---

## Adapter Versions

| Adapter          | Version | Assistant Compatibility      |
| ---------------- | ------- | ---------------------------- |
| **Claude Code**  | v1.0.0  | Claude Code ≥ 2.1.220 (CLI)  |
| **Codex CLI**    | v0.4.0  | Codex CLI ≥ 0.145.0 (OpenAI) |
| **OpenCode CLI** | v0.5.0  | OpenCode CLI ≥ 1.18.4        |
| **Pi CLI**       | v0.6.0  | Pi CLI ≥ 0.82.0              |

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
| [ROADMAP.md](ROADMAP.md)                   | Roadmap and planning                    |

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

[Changelog](CHANGELOG.md) · [Roadmap](ROADMAP.md) · [Contributing Guide](CONTRIBUTING.md)

---

## License

MIT © 2026 EvoKit Contributors

_Built with ❤️ for the open-source AI ecosystem._
