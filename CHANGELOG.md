# Changelog

## v0.4.2 (2026-06-18)

### Major

- 🧩 **适配器接口统一重构** — 抽取 `AdapterInstaller` 接口 + 注册表，三端适配器（Claude / Codex / OpenCode）共享同一安装/验证契约
- 🏗️ **适配器模块化迁移** — 旧单文件适配器（`src/adapters/*-adapter.ts`）全部删除，替换为按助手分目录（`src/adapters/{claude,codex,opencode}/`）的模块化结构
- 🎯 **Aider 适配器存根** — `src/adapters/aider/adapter.ts` 已创建，待后续实现完整集成

### Documentation

- 📋 **README 重构** — 新增「适配器版本」和「依赖」章节，详细记录：
  - 各适配器版本号（Claude v0.2.0 / Codex v0.3.0 / OpenCode v0.4.0）、状态及助手兼容范围
  - 运行时依赖（Node.js ≥ 18.0.0 / bash ≥ 4.0 / Git）
  - npm 运行时依赖（@clack/prompts、commander、conf、fs-extra、picocolors）
  - 开发依赖（TypeScript、tsx、vitest、类型定义）
- 🌍 英文 README（README.en.md）同步更新
- 🗺️ 路线图更新 — v0.4.x 阶段反映实际适配器改造进度

### Internal

- 🔧 删除旧的单文件适配器（aider-adapter.ts, claude-adapter.ts, codex-adapter.ts, codex-hooks.ts, codex-installer.ts, opencode-adapter.ts, opencode-hooks.ts, opencode-installer.ts）
- 📦 新增模块化适配器文件（`src/adapters/{claude,codex,opencode,aider}/` + `index.ts` + `registry.ts` + `types.ts`）
- 🔌 新增核心模块（`src/core/download.ts`, `interactive.ts`, `merge-agents.ts`, `merge-settings.ts`, `permissions.ts`）
- 🚚 模板目录重组织（`template/` → `template/{claude,codex,opencode}/`）

### Fix

- 🔧 **Installer interactive menu bug** — Fixed `\r` (carriage return) causing "Invalid choice" warning for valid input in `curl | bash` mode. The issue occurred when `read -r` from `/dev/tty` captured a trailing `\r` character, causing the case-match validation to fail even though the grep-based parsing below worked correctly.

### Improvement

- 🎨 **Beautified installer menu** — Replaced plain text menu with box-drawing characters (`┌─┐│└┘`) for a cleaner visual appearance
- 💡 **Better UX** — Pressing Enter defaults to `[1] Claude Code`; input now accepts commas (`1,3` same as `1 3`); cleaner prompt with `→` indicator
- 🛡️ **More robust input handling** — Strips `\r`, trims whitespace, accumulates only validated choices before parsing
- 📝 **README updated** — Preview section shows the new interactive menu; install docs highlight `--adapter` flag for non-interactive use
- 📋 **README roadmap updated** — v0.4.0 moved from "规划中 🔜" to "开发中 🚧" with actual OpenCode/Aider progress reflected; versioning rule documented

## v0.4.9 (2026-07-15)

### Fix

- 🧹 **移除废弃的 DotenvAppend 钩子** — `dotenv-append.sh` 及相关模板引用已全部清理；测试断言（7→6）同步更新
- 🔧 **Shellcheck SC2155 修复** — 拆分 `local var=$(cmd)` 为 `local var` + `var=$(cmd)`，消除声明与赋值混用的潜在返回码吞没问题

### Chore

- 📦 **npm bin 路径修正** — 移除 `package.json` 中 `bin` 路径的 `./` 前缀（`./bin/evokit.cjs` → `bin/evokit.cjs`）

---

## v0.4.8 (2026-07-10)

### Fix

- ⬆️ **Node.js 最低版本提升至 ≥20.12.0** — 版本检查失败时输出更友好的提示，引导用户使用 `fnm` 或 `nvm` 切换版本

### Chore

- 🚚 **npm bin 路径清理** — `package.json` 中移除 `./` 前缀

---

## v0.4.7 (2026-07-06)

### Refactor

- 🏗️ **OpenCode 配置迁移** — 全局配置从项目级 `.opencode/` 迁移至 `~/.config/opencode/`，更符合 XDG 规范；`agents/` 目录重命名为 `agent/` 以匹配 OpenCode CLI 约定
- 🔧 更新 OpenCode 适配器中所有内部路径引用

### Fix

- 🪟 **WSL 兼容性修复** — 移除 `install.sh` 中的 `exec </dev/tty`，该命令在 WSL 中导致安装脚本挂起
- 🐚 改用 `exec 3</dev/tty` + `read -u 3` 模式，在所有平台正常工作

### Documentation

- 📋 **INSTALL.md 更新** — 新增 `--adapter` 参数使用示例、OpenCode 全局配置说明、WSL pipe 安装注意事项

---

## v0.4.6 (2026-07-02)

### Fix

- 🐛 **curl | bash 模式 stdin 修复** — 在 shell 层级通过 `exec 3</dev/tty; read -u 3` 重定向 stdin，确保 npx 启动的 Node.js 进程能正确读取用户输入
- 🎯 此修复解决了 WSL 和某些终端环境下 `curl | bash` 安装时菜单无法交互的问题

---

## v0.4.5 (2026-06-30)

### Fix

- 🔧 **TTY 检测直接化** — `ensureInteractive` 直接尝试打开 `/dev/tty` 而非依赖 `isatty` 检测，提高跨平台兼容性

---

## v0.4.4 (2026-06-28)

### Fix

- 🔧 **TTY 检测扩展** — `ensureInteractive` 增加对 stderr 的 TTY 检查，覆盖更多 pipe 安装场景

---

## v0.4.3 (2026-06-24)

### Major

- 🌍 **文档双语化重构** — 全部文档拆分为 `docs/en/`（英文）和 `docs/zh/`（中文）双语结构，包含：
  - ARCHITECTURE.md / EVOLUTION.md / INSTALL.md / MIGRATION.md
  - CUSTOMIZE.md / FAQ.md / MULTI_AGENT.md / HOMEBREW.md
  - PLAN_OPENCODE_ADAPTER.md / AI-DEVELOPMENT-STANDARDS.md（中文专属）
- 📝 **README 双语索引** — 顶部增加中英文切换链接

### Fix

- 🔧 **CI 路径同步** — CI 工作流更新为新的双语文档路径
- 🔧 **CLAUDE.md 路径修复** — 模板 CLAUDE.md 引用路径更新
- 🔧 **CI 增加 Node.js 构建步骤** — 确保 dry-run 测试前正确编译
- 🔧 **Shellcheck SC2034 警告抑制** — dotenv-append.sh 中未使用的 `INPUT` 变量标记为 `readonly`

### Chore

- 🚚 **模板路径统一** — 所有 `template/` 引用更新为 `template/{claude,codex,opencode}/` 新结构

---

## v0.3.2 (2026-06-16)

### Fix

- 🔧 **Shellcheck CI 修复** — pre-tool-use.sh SC2016 误报修复（正则中 `$HOME` 改为双引号 + 正确转义，不改变语义）

## v0.3.1 (2026-06-16)

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
- 📚 docs/en/HOMEBREW.md — Homebrew tap instructions
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
