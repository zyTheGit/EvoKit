# Changelog

## v1.2.0

### Features

- 🔀 **助手间冲突合并 - 归一化全等重复检测（ADR 0005）** - `src/core/dedup.ts` 新增 `findExactDuplicates`：作用域内分扫（个人/项目不跨层）active+pending 归一化全等扫描，覆盖 pending↔pending / pending↔active / active↔active 三种组合；只做归一化全等、非语义近重复，不引入 embedding
- 🩺 **doctor/boot 表面化重复簇** - `inspectKnowledgeHealth` 新增 `duplicateGroups` 指标，doctor 报告同 type 归一化全等条目簇（与索引漂移检测同构），boot 增 warnOnly 重复检查
- 🔀 **`doctor --fix` 逐簇人工三选合并** - 冲突子模式与"重建索引"子模式区分：合并为主条（active 删文件+索引行 / pending 走 rejectDraft）/ 保留两条 / 择一保留，复用 `overwriteActiveBody`+`removeIndexEntry`；`keepId` 必由人工传入，**绝不自动择主**，守"人工背书唯一闸门"；非 TTY 环境跳过交互
- 🧱 **索引写入原子化** - `appendIndex`/`writeKnowledgeIndex` 改用 `atomicWriteFile`（防单写者损坏，不消除 TOCTOU 丢行），`regenerateIndex` 全量重建兜底
- 📡 **四助手 doctor 入口透传** - codex/opencode/pi AGENTS.md doctor 描述与 claude `evokit-boot.md` 检查项补"归一化全等重复"检测与三选合并指引；`template-recheck` 新增防回退断言（四助手均须透传，防 CLI 落地产品层脱节）
- 🧪 新增 conflict-merge/health 模块测试，全量测试 470 -> 484 通过

> **范围说明**：v1.2 按 ADR 0005 将助手间冲突合并定位为事后健康诊断（检测+表面化+人工三选），非实时协商。团队级知识共享仍搁置（v1.3+，独立 ADR 待 grilling）。

## v1.1.0

### Features

- 🆕 **Git 历史约定提取（ADR 0004）** — `evokit learn --git-history` 用确定性启发式从 commit 历史提取 Conventional Commits 约定候选：结构匹配率门控（≥0.7 且样本≥20）、merge/revert/release/敏感信息排除清单，候选线索写 `.pending/` 复用人工确认闸门，不新增写入通道
- 🩺 **知识库健康诊断（ADR 0003）** — `src/core/health.ts` 对规范知识根输出量化报告：双向索引漂移（孤儿/悬空）、frontmatter 合法性、`.pending/` 与 STALE/RETIRED 积压、按 scope/type/confidence 分布；doctor/boot 表面化该被复审的条目，降档仍由人工二分判断驱动
- 🔧 **`evokit doctor --fix` 索引重建** — 索引漂移时按派生物语义从实际条目再生成 `knowledge-index.md`，消除手维护漂移
- ♻️ **确认闸门去重** — 显式声明（`evokit learn "内容"`）时若同 type 已存在归一化内容相近的 active 条目，提示"已有相似条目"，用户三选（覆盖/新建/放弃），只做归一化匹配不引入 embedding
- 🧪 新增 `git-history` / `health` / `dedup` 模块测试，全量测试达 470/470 通过

### Bug Fixes

- 🐛 **四助手 v1.1 能力透传** — git-history 提取与 `doctor --fix` 在 CLI 层已落地但各助手入口未透传，导致 AI 无法触发：opencode/pi 的 `evokit-learn` 工具/扩展 args schema 锁死（已加 `git_history` 参数透传 `--git-history`）；四助手 learn/boot 文档登记 `--git-history` 与 `evokit doctor`；claude `evokit-boot` 文档补回 v1.1 孤儿检测项。新增 `template-recheck` 断言防回退。

> **范围说明**：v1.1 收口 v1.0 转向后声明的核心闭环（健康诊断 + Git 历史来源 + 索引漂移修复 + 确认去重）。助手间同条目实时协商/冲突合并、团队级知识共享仍搁置（v1.2+，见 CONTEXT.md）。

## v1.0.3

### Bug Fixes

- 🐛 **修复 init 后续步骤误提示 `/boot`** — Claude 安装后的后续步骤文案由错误的 `运行 /boot 进行验证` 改为 `运行 /evokit-boot 进行验证（或 npx evokit boot）`，与实际安装的斜杠命令（`commands/evokit-boot.md`）和 CLI 命令（`npx evokit boot`）对齐
- 🐛 **修复适配器选择描述易误导** — claude / codex / opencode 的 description 由 `~/.claude/ + .claude/` 与 `~/.codex/ + .codex/`、`~/.config/opencode/ + .opencode/`（全局+相对路径混写，后者缺上下文易误导）改为 `全局 ~/.claude/（项目 .claude/ 可选）` 等清晰区分全局与可选项目级目录
- 🐛 **安装结果补充各类别简要说明** — `formatInstallResult` 在分类计数后新增钩子/规则/代理/命令/技能各用途一句说明，帮助用户理解装了什么
- 🐛 **修复 Settings hooks 合并** — 自定义 hook 事件（如 `SessionStart`）已被用户占用时，`mergeSettings` 此前会跳过整个事件导致 EvoKit hook 从未写入；现改为追加到事件数组尾部（按 JSON 精确去重，重装/升级幂等），manifest 精确记录以保证卸载可按条目反合并
- 🐛 **修复启发式卸载误删用户自建 hook** — `buildVirtualManifest` 此前仅凭脚本位于 `adapterHome/hooks/` 路径前缀识别 EvoKit hook，会把用户同名目录下自建的 hook（如 `herdr-agent-state.sh`）误判为 EvoKit 并在卸载时从 settings.json 反合并掉；现改为按 EvoKit 已知 hook 脚本文件名（`session-start.sh` / `stop.sh`）精确识别，保留用户 hook

## v1.0.2 (2026-08-02)

> **多助手同步落地：4 助手共享同一份知识（读助手无关 / 写经各自确认）**
>
> v1.0.2 把"项目上下文引擎"从 claude 单一助手扩展到全部 4 个 AI 助手（claude / codex / opencode / pi），知识根脱离任一助手私有目录、统一共享。

### Major（范畴 B 引擎）

- 🧩 **知识单一数据访问层（KnowledgeRepository）** — 新增 `src/core/repository.ts`，统一管理 `.pending/`（待确认草稿）与 `knowledge/`（已背书条目）：createDraft / rejectDraft / confirmDraft / expire / collectStale / regenerateIndex。learn/review/boot/migrate 全部收敛到该层。
- 📦 **`evokit learn` 命令** — 确认背书 + 显式声明双路径（#25/#31）：无内容列出 `.pending/` 逐条确认/拒绝 + 裁定 scope；带内容当场背书（source=explicit, FRESH）。
- 🔄 **索引作为派生物** — `KnowledgeRepository.regenerateIndex()` 让 `knowledge-index.md` 可从实际条目自助再生成，消除手维护漂移。
- 🏛 **架构型条目推理标注**（#33）— 写路径强制 `## 影响范围` 标注，索引前置 🏛 标记引导 AI 主动追索全文。
- ♻️ **多助手同步研究**（#32）— 4 adapter 确认钩子 / 共享目录 / 信号桥接评估。

### Breaking Changes

- 🗂️ **知识根统一为 agent 无关共享根** — 个人知识根从 claude 私有 `~/.claude/memory/evokit/` 改为中性 `~/.evokit/knowledge/`，项目知识根改为 `<project>/.evokit/`（均脱离任一助手私有目录，与卸载管理 `~/.evokit/backup/`、`manifest.json` 物理隔离）。
- 🗑️ **废弃概念全清** — 4 个 adapter 模板清空 v0 废弃管线（corrections.jsonl / observations.jsonl / learned-rules.md / evolution-log.md / sessions.jsonl / violations.jsonl / evokit-evolve / evokit-memory record-*），全部改为对话提取 + 确认背书。

### Major

- 🪛 **codex 模板平移** — AGENTS.md + hooks 指向共享根，确认入口 `evokit learn`。
- 🧰 **opencode 模板平移** — 无 Stop 钩子 → 新增 `evokit-session --action flush_pending` 会话末落盘；新增 evokit-learn 工具；删除 v0 evokit-memory。
- 🛠️ **pi 模板平移** — 新增 evokit-learn 扩展；`session_shutdown` 检查 `.pending/` 提示确认；删除 v0 evokit-memory/evokit-session。
- 🧪 **验收 seam** — 新增模板回查测试 + 安装契约扩展：4 adapter 模板含 evokit 结构、无 v0 废弃引用。（全量测试 416 → 433）
- 📝 **文档/CI 同步** — 核心文档（FAQ/KNOWLEDGE/ARCHITECTURE/INSTALL/ADAPTER_SPEC/DEV_STANDARDS/MULTI_AGENT 中英）改 v1.0 共享根语义；CI 模板断言对齐 v1.0 工具/扩展集。

## v1.0.1 (2026-07-31)

### Bug Fixes

- 🐛 **修复 uninstall 删除整个 skills 目录** — `evokit uninstall` 会无条件删除 `~/.claude/skills/` 整个目录，导致用户自己添加的技能文件丢失。现在只删除 EvoKit 安装的技能（包含 `SKILL.md` 的子目录）和 `README.md` 种子文件，保留用户自己的文件
- 🐛 **修复 uninstall 删除 settings.json** — `evokit uninstall` 在 `settings.json` 移除 EvoKit 条目后仅剩 `$schema` 或为空时，会直接删除整个文件。现在无论是否 `--purge`，都只做 reverse merge（移除 EvoKit 条目，保留文件），绝不删除用户配置文件
- 🐛 **修复 --purge 删除 settings.json** — `--purge` 模式下原来的 `reverse-purge-settings` section 会直接删除 settings.json。现在已移除该 section，`--purge` 只删除 EvoKit 生成的用户数据（memory 种子等），不删除用户配置

## v1.0.0 (2026-07-30)

> **里程碑：从"自进化纠错系统"转向"项目上下文引擎"**
>
> EvoKit v1.0 重新定义了核心定位——持久化 AI 不可能知道的项目/个人专属知识。
> 核心机制：对话提取（AI 识别 + 用户确认）为主，显式声明为兜底，Git 历史为辅助。

### Breaking Changes

- 🔄 **核心定位转向** — 从"自进化纠错系统"变为"项目上下文引擎"，所有模块围绕知识条目重新设计
- 🗑️ **删除 evolve 命令** — `evokit evolve` 及相关 promote/rotate 模块全部移除
- 🗑️ **删除 export/import 完整功能** — 降级为 v1.0 暂不支持提示
- 🗑️ **删除 v0 种子文件** — `corrections.jsonl`、`observations.jsonl`、`sessions.jsonl`、`violations.jsonl`、`learned-rules.md`、`evolution-log.md` 从所有适配器模板中移除
- 🗑️ **删除 v0 钩子** — `post-tool-use.sh`、`pre-compact.sh`、`pre-tool-use.sh`、`blocked-commands.json`、`export-system.sh` 从 Claude 模板移除
- 🗑️ **删除 evokit-evolve.ts** — OpenCode 和 Pi 适配器的 evolve 工具扩展移除
- 🗑️ **删除 settings.json 模板** — Claude 适配器不再安装权限配置模板

### Major

- 🧠 **知识模块（knowledge.ts）** — 新增 `src/core/knowledge.ts`（490 行），实现知识条目的 CRUD、搜索、作用域管理、对话提取
- 🚚 **迁移命令（migrate）** — 新增 `evokit migrate`，将 v0 数据（corrections/observations/learned-rules/sessions）转换为 v1.0 知识条目
- 🪝 **钩子体系重写** — 5→2 钩子精简：
  - SessionStart：快速检查知识库完整性
  - Stop：仅检查 `.pending/` 非空并输出提示
- 📝 **CLAUDE.md 模板重写** — 153→112 行，从"自进化协议"重写为"项目上下文引擎"定位
- 🏗️ **适配器基类精简** — BaseAdapter 删除 `injectMemory`/`exportMemory`/`recordSession`，`resolveMemoryDir` → `resolveEvokitDir`
- 📂 **新模板目录结构** — 所有 4 个适配器新增 `evokit/knowledge-index.md`、`evokit/knowledge/`、`evokit/.pending/`

### Architecture

- 📋 **领域模型（CONTEXT.md）** — 术语表、知识类型、作用域、数据结构、对话提取机制、已废弃概念
- 📋 **架构决策记录（ADR-0001）** — 16 个战略决策，6 个取舍分析
- 📋 **Wayfinder 决策票** — T01~T07 共 7 张决策票，全部已决策

### Internal

- 🧪 **测试新增 75 个** — `knowledge.test.ts`（62 个）+ `migrate.test.ts`（13 个）
- 🧪 **测试删除** — `promote.test.ts`（157 行）+ `rotate.test.ts`（136 行）+ `memory.test.ts` 部分（73 行）
- 🧹 **CLI 品牌定位** — `cli.ts` 描述更新为"项目上下文引擎"，注册 migrate 命令
- 🧹 **doctor 扩展** — 知识库检查（适配器 `status()` → `buildClaudeExtraChecks`）
- 🧹 **types.ts 清理** — 删除 8 个 v0 接口
- 🧹 **memory.ts 精简** — 删除 `readLearnedRules`/`writeLearnedRules`
- 📊 **总变更** — 76 文件，+3310/-3441 行**

## v0.6.7 (2026-07-27)

### Major

- 🆕 **`evokit update` 命令** — 对已安装适配器执行升级安装，自动检测清单中的适配器，使用 upgrade profile 覆盖框架文件（hooks、rules、commands、agents、skills），保留用户数据（CLAUDE.md、MEMORY.md、memory/）
- 🔄 **`/review` → `/evokit-review`** — 将内置代码审查命令改名，避免与用户项目自定义命令冲突
- 🧹 **移除冗余 Skills** — 删除 `code-review`（与命令重复）和 `debug`（与规则重叠），保留 `learning-recorder`

### Architecture

- 🏗️ **AdapterInstallConfig 新增 profile 字段** — 支持 `full` / `minimal` / `upgrade` 三种安装配置
- 🔧 **buildStandardLayout 根据 profile 动态调整策略** — upgrade 时认知核心/MEMORY.md 为 skip-if-exists、agents 覆盖 body + 合并 frontmatter、其余始终覆盖
- 🐛 **修正 buildClaudeLayout upgradeMode 行为** — CLAUDE.md 从 always 改为 skip-if-exists，MEMORY.md 从 always 改为 skip-if-exists

### Documentation

- 📖 **README 同步** — 新增 `evokit update` 命令说明，更新 `/evokit-review` 引用

### Internal

- 🧪 **测试新增 12 个** — 覆盖 upgrade profile 文件策略（CLAUDE.md/MEMORY.md 保留、agents body 覆盖、hooks/rules/commands/skills 覆盖、seed-memory 保留、幂等性）和命令注册验证

## v0.6.0 (2026-07-23)

### Major

- 🤖 **Pi CLI 适配器完整集成（v0.6.0）** — TypeScript 扩展系统（evokit-lifecycle/evokit-boot/evokit-evolve/evokit-memory/evokit-session）、Agent Skills 标准、模板文件（AGENTS.md、settings.json、skills/、agent/）
- 📋 **双语 ADAPTER_SPEC 规范文档** — 四个 CLI 适配器的官方规格摘要（版本号、目录结构、生命周期事件、扩展机制）
- 🏗️ **BaseAdapter 基类** — 抽象安装管线，供子类继承
- 🔧 **共享版本工具** — `src/core/version.ts` 提取 `getEvokitVersion()` 为统一入口

### Documentation

- 📖 **FAQ 更新** — 新增 Pi CLI 和 OpenCode 支持条目，移除"计划中"描述
- 📖 **INSTALL 更新** — 前置要求新增 Pi CLI 条目
- 📖 **MULTI_AGENT 更新** — 状态从"计划中"改为"已实现"，章节标题改为"已实现的适配器"
- 📖 **README 路线图更新** — Pi CLI 状态从存根改为完整支持，新增 v0.5.0/v0.6.0 里程碑
- 📖 **PLAN_OPENCODE_ADAPTER 标注完成** — 状态标记为已发布

### Internal

- 🔌 **Codex 适配器增强** — 项目级目录支持、hooks 类型扩展、测试覆盖
- 🔌 **Pi 适配器** — 扩展尊重 `PI_CODING_AGENT_DIR` 环境变量
- 🔌 **Claude 适配器** — `CLAUDE_HOOK_FILES` 补充完整 Hook 列表（session-start/pre-tool-use/post-tool-use/pre-compact/stop/export-system）
- 🧪 **测试新增** — claude-adapter.test.ts、codex-adapter.test.ts 扩展、pi-adapter.test.ts 扩展（265 个测试全通过）

### Fix

- 🐛 **Pi 扩展路径硬编码** — 5 个 TypeScript 扩展使用 `resolvePiHome()` 替代硬编码 `homedir() + '.pi/agent'`，尊重 `PI_CODING_AGENT_DIR` 环境变量
- 🐛 **Claude Hook 脚本列表不完整** — `CLAUDE_HOOK_FILES` 缺少 pre-tool-use.sh、post-tool-use.sh、pre-compact.sh

## v0.4.2 (2026-06-18)

### Major

- 🧩 **适配器接口统一重构** — 抽取 `AdapterInstaller` 接口 + 注册表，三端适配器（Claude / Codex / OpenCode）共享同一安装/验证契约
- 🏗️ **适配器模块化迁移** — 旧单文件适配器（`src/adapters/*-adapter.ts`）全部删除，替换为按助手分目录（`src/adapters/{claude,codex,opencode}/`）的模块化结构
- 🎯 **Pi CLI 适配器存根** — `src/adapters/pi/adapter.ts` 已创建，待后续实现完整集成

### Documentation

- 📋 **README 重构** — 新增「适配器版本」和「依赖」章节，详细记录：
  - 各适配器版本号（Claude v0.2.0 / Codex v0.3.0 / OpenCode v0.4.0）、状态及助手兼容范围
  - 运行时依赖（Node.js ≥ 18.0.0 / bash ≥ 4.0 / Git）
  - npm 运行时依赖（@clack/prompts、commander、conf、fs-extra、picocolors）
  - 开发依赖（TypeScript、tsx、vitest、类型定义）
- 🌍 英文 README（README.en.md）同步更新
- 🗺️ 路线图更新 — v0.4.x 阶段反映实际适配器改造进度

### Internal

- 🔧 删除旧的单文件适配器（pi-adapter.ts, claude-adapter.ts, codex-adapter.ts, codex-hooks.ts, codex-installer.ts, opencode-adapter.ts, opencode-hooks.ts, opencode-installer.ts）
- 📦 新增模块化适配器文件（`src/adapters/{claude,codex,opencode,pi}/` + `index.ts` + `registry.ts` + `types.ts`）
- 🔌 新增核心模块（`src/core/download.ts`, `interactive.ts`, `merge-agents.ts`, `merge-settings.ts`, `permissions.ts`）
- 🚚 模板目录重组织（`template/` → `template/{claude,codex,opencode}/`）

### Fix

- 🔧 **Installer interactive menu bug** — Fixed `\r` (carriage return) causing "Invalid choice" warning for valid input in `curl | bash` mode. The issue occurred when `read -r` from `/dev/tty` captured a trailing `\r` character, causing the case-match validation to fail even though the grep-based parsing below worked correctly.

### Improvement

- 🎨 **Beautified installer menu** — Replaced plain text menu with box-drawing characters (`┌─┐│└┘`) for a cleaner visual appearance
- 💡 **Better UX** — Pressing Enter defaults to `[1] Claude Code`; input now accepts commas (`1,3` same as `1 3`); cleaner prompt with `→` indicator
- 🛡️ **More robust input handling** — Strips `\r`, trims whitespace, accumulates only validated choices before parsing
- 📝 **README updated** — Preview section shows the new interactive menu; install docs highlight `--adapter` flag for non-interactive use
- 📋 **README roadmap updated** — v0.4.0 moved from "规划中 🔜" to "开发中 🚧" with actual OpenCode/Pi CLI progress reflected; versioning rule documented

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
