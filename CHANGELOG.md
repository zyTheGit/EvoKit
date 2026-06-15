# Changelog

## v0.2.1 (2026-06-15)

### Improvement
- 📝 CLAUDE.md template restructured with Fable 5-inspired architecture:
  - Hierarchical sections with `###` nesting for clarity
  - Self-check patterns before/after key actions
  - Tool priority ordering (Codegraph → Read → Grep/Glob → Bash)
  - "When to Use / When NOT to Use" agent usage tables
  - Hard limits with explicit violation consequences
  - Concrete examples throughout (correct vs incorrect patterns)
- 📋 Command docs (`/boot`, `/evolve`, `/review`) enhanced with:
  - Self-check checklists before and after running
  - Real-world example sessions
  - Priority/severity rating guides
- 🛡️ Rule files enhanced with self-check patterns and example tables
- 🤖 Agent definitions (`architect`, `reviewer`) with USE/NOT USE guidelines
- ⚙️ Session-start hook with additional integrity checks and severity indicators
- 🧠 Memory README with confidence scoring system and retention policies

## v0.2.0 (2026-06-12)

### Major
- 🚀 `evokit` CLI — standalone Node.js CLI tool replacing bash scripts
- ✨ `evokit init` — initialize EvoKit with template installation
- 🔄 `evokit evolve` — run evolution audit (rotation, decay, promotion, pruning)
- 📦 `evokit export` / `evokit import` — cross-machine migration management
- 🔍 `evokit doctor` — system integrity verification
- 📦 npm package: `@zythegit/evokit`

### Internal
- 🔧 TypeScript rewrite of install.sh, export-system.sh, evolve.md, boot.md
- 🧪 41 vitest tests covering core modules
- 📚 docs/HOMEBREW.md — Homebrew tap instructions
- 🔗 GitHub Actions: npm publish workflow

## v0.1.0 (2026-06-11)

### Initial Release
- 🎉 Project skeleton with 4-layer architecture
- 📦 Template system for Claude Code self-evolution
- 🔌 SessionStart hook — auto-verify at session start
- ⏹️ Stop hook — session recording to sessions.jsonl
- 🚚 export-system.sh — one-click migration across machines
- 📝 /boot command — system integrity verification
- 🔄 /evolve command — correction promotion and rule pruning
- 👁️ /review command — code review via reviewer agent
- 🧠 Self-evolving memory pipeline (corrections → rules → graduation)
- 📚 Full documentation (architecture, evolution, migration, FAQ)
- 🔒 Privacy-first: zero telemetry, all data stays local
- 🐧 Cross-platform: Linux / macOS / WSL / Git Bash
