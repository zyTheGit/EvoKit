# Changelog

## v0.4.0 (2026-06-16)

### Major
- 🤖 **Skills System** — New `.claude/skills/` directory with reusable skill modules (code-review, debug, learning-recorder)
- 🔔 **Semi-Automated Evolution Reminder** — Stop hook now checks `corrections.jsonl` at session end; prints a reminder when 10+ corrections accumulated, prompting the user to run `/evolve`
- 🛡️ **Permission Hardening** — `settings.json` with explicit allow/deny permission lists, preventing dangerous commands (`rm -rf /`, `git push --force` without prompt)
- 🧠 **Enhanced Session Recording** — Stop hook now tracks corrections count, observations count, and model info in each session record

### Improvements
- 📝 **CLAUDE.md Restructured** — Consolidated self-evolution protocol, auto-memory docs, tool priority, hooks reference, and integrity rules (still ≤150 lines)
- 🔧 **Session-Start Hook** — Added `skills/` directory check (optional, not required); enforce that every rule in `learned-rules.md` has a `verify` line
- 📚 **Documentation Updates**
  - `ARCHITECTURE.md` — Fable 5-inspired restructuring with clearer layer separation
  - `CUSTOMIZE.md` — Expanded customization guide with skills, advanced configuration
  - `EVOLUTION.md` — Updated evolution pipeline with confidence decay examples
- ⚡ **CI & Install Enhancements**
  - CI workflow now validates skills directory structure
  - `install.sh` — Updated for skills + new hook signatures

## v0.3.0 (2026-06-16)

### Major
- 🎉 **Codex CLI Adapter** — EvoKit now supports OpenAI Codex CLI!
  - `evokit init --adapter codex` — install to `~/.codex/` with AGENTS.md, hooks.json, and Starlark rules
  - Lifecycle hooks: SessionStart (boot), Stop (session recording), PreToolUse (learned rules injection)
  - Starlark-based safety rules in `~/.codex/rules/`
  - Shared `~/.claude/memory/` — corrections from Codex benefit all assistants
- 🧩 **Shared Memory Layer** — `src/core/shared-memory.ts` for cross-adapter read/write
  - Session records tagged by assistant (`"assistant": "codex"` / `"claude"`)
  - All adapters share the same memory files
- 🔧 **CLI Extended**
  - `evokit init --adapter codex` — Codex-specific template installation
  - `evokit doctor --adapter codex|claude|all` — per-adapter health checks
  - `evokit evolve` — cross-adapter session breakdown in audit output

### Internal
- 🔌 `src/adapters/codex-adapter.ts` — full AgentAdapter implementation
- 📦 `src/adapters/codex-installer.ts` — Codex template installation logic
- 🪝 `src/adapters/codex-hooks.ts` — hooks.json builder with TOML and merge support
- 🧪 22 new tests covering installer, hooks, memory, and status
- 📚 Updated MULTI_AGENT.md, INSTALL.md, FAQ.md with Codex documentation

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
