# 路线图 / Roadmap

## 已完成 ✅

### v0.1.0 — 核心模板 + 安装脚本 + 文档 + Git 发布

- ✅ 4 层自进化架构（CLAUDE.md → rules/ → agents/ → commands/ → memory/）
- ✅ SessionStart / Stop 钩子
- ✅ 进化审计（/evolve）含旋转归档和置信度衰减
- ✅ 一键迁移（export-system.sh）
- ✅ 跨平台支持（Linux / macOS / WSL / Git Bash）
- ✅ 隐私优先：零遥测、全本地存储

### v0.2.0 — 独立 CLI 工具

- ✅ `evokit` 命令行（TypeScript/Node.js，替代 bash 脚本）
- ✅ `evokit init` — 支持 `--template`、`--branch`、`--dry-run`、`--verify`
- ✅ `evokit evolve` — 旋转、置信度衰减、晋升、修剪
- ✅ `evokit export` / `evokit import` — 跨机迁移管理
- ✅ `evokit doctor` — 系统完整性验证
- ✅ npm 包发布（`@zythegit/evokit`）+ Homebrew 支持

### v0.3.0 — Codex 适配器

- ✅ Codex CLI 集成适配器（`~/.codex/` 模板、AGENTS.md、hooks.json、config.toml）
- ✅ Codex 钩子机制映射（SessionStart / Stop / PreToolUse）
- ✅ 跨助手学习数据同步（共享 `~/.claude/memory/`）
- ✅ 交互式适配器选择菜单

### v0.4.0 ~ v0.4.2 — 适配器接口重构 + 多助手支持

- ✅ **适配器接口统一** — `AdapterInstaller` 接口 + 注册表，所有适配器共享同一契约
- ✅ **Claude Code 适配器 v0.2.0** — 模块化重构，插件化安装管线
- ✅ **Codex CLI 适配器 v0.4.0** — AGENTS.md / hooks.json / config.toml / Starlark 规则
- ✅ **OpenCode CLI 适配器 v0.5.0** — AGENTS.md / opencode.json / 自定义工具 / 项目级安装
- ✅ **Pi CLI 适配器 v0.6.0** — TypeScript 扩展 / Skills / Agent Skills 标准 / 生命周期事件
- ✅ **配置文件智能合并** — 不覆盖已有 settings / AGENTS.md / opencode.json
- ✅ **交互式适配器选择** — 带 box-drawing UI，支持多选和默认回车

### v0.5.0 — Codex/Pi 适配器完整集成

- ✅ Codex 适配器增强（项目级目录、清单写入、卸载支持）
- ✅ Pi 适配器完整集成（扩展系统、Skills、模板、类型定义）
- ✅ 双语 ADAPTER_SPEC 规范文档
- ✅ BaseAdapter 基类 + 共享版本工具

### v0.6.0 — 适配器完善 + 规范对齐

- ✅ Pi 扩展尊重 `PI_CODING_AGENT_DIR` 环境变量
- ✅ Claude Code Hook 脚本列表补全
- ✅ `evokit update` 命令 — 已安装适配器模板升级
- ✅ `/review` → `/evokit-review` 改名
- ✅ 文档全面同步

> **版本说明**：v0.4.x ~ v0.6.x 系列持续开发中，所有中间修复和迭代均为修订号更新，次版本号仅在有完整功能里程碑时递增。

### v1.0.0 — 项目上下文引擎转向（wayfinder + spec #36）

- ✅ 核心定位从"自进化纠错系统"转向"项目上下文引擎"（ADR 0001）
- ✅ 领域模型落地 — 知识条目数据模型（frontmatter 9 字段）、三档 confidence 状态机、作用域分层（个人/项目）
- ✅ T03 钩子精简（SessionStart 快速检查 + Stop 提示，5→2）
- ✅ T04 CLAUDE.md 模板重写 — 从自进化协议到项目上下文引擎
- ✅ T05 旧数据迁移 — `evokit migrate` 命令 + knowledge 模块
- ✅ T06 CLI 命令重写与废弃清理
- ✅ T07a 多助手适配器同步（v1.0 范围）

### v1.0.1 — 卸载安全修复

- ✅ uninstall 不再删除整个 skills 目录和 settings.json，只移除 EvoKit 条目
- ✅ purge 模式同样只移除 EvoKit 条目，保留 settings.json

### v1.0.2 — 共享知识根 + 模板平移 + 验收 seam

- ✅ 共享知识根单一事实源（`~/.evokit/knowledge/`，4 助手 agent 无关）
- ✅ codex/opencode/pi 模板 v0.x→v1.0 知识引擎平移 + 清理 v0 残留
- ✅ 验收 seam — 模板回查 + 安装契约（spec #36 T6 #42）

### v1.0.3 — 安装体验修复

- ✅ init 提示/选择描述/安装说明修正
- ✅ settings hook 合并与启发式误删修复

### v1.1.0 — 核心闭环补齐（ADR 0003 / ADR 0004）

- ✅ Git 历史提取落地 — 确定性启发式提取器 `src/core/git-history.ts` + `evokit learn --git-history`，候选线索写 `.pending/` 复用确认闸门（ADR 0004）
- ✅ 知识库健康诊断 — `src/core/health.ts` + doctor/boot 双向索引漂移、frontmatter 合法性、积压、分布指标（ADR 0003）
- ✅ 索引漂移检测 + `--fix` 重建 — `evokit doctor --fix` 在索引漂移时重建派生索引
- ✅ 确认闸门去重 — 显式声明时同 type 归一化内容相近提示三选（不引入 embedding）

## 规划中 🔜

> **设计已定（ADR 0005），待实现**：助手间冲突合并 = 事后健康诊断（近重复检测 + `doctor`/`boot` 表面化 + `--fix` 人工三选合并 + 索引写入原子化），非实时协商。
> **仍搁置（v1.3+）**：团队级知识共享（多用户、新存储拓扑 + 权限模型，独立 ADR，待 grilling）。

### v1.2.0 — 助手间冲突合并（事后诊断）

- ☐ 前置：审计四个复用件契约 — `normalizeKnowledgeText` 规则、`findSimilarActive`（是否全等/扫 active/比较字段）、`overwriteActiveBody`（是否更新索引）、`atomicWriteFile`（ADR 0005 §C7）
- ☐ 归一化全等重复检测 — 扩展 `src/core/health.ts`：归一化全等扫描 `knowledge/` 与 `.pending/`，**作用域内分扫**（个人/项目不跨层），复用或新增 `findExactDuplicates`（ADR 0005）
- ☐ `doctor`/`boot` 表面化重复对 — 报告同 type 归一化全等条目对，与索引漂移检测同构
- ☐ `doctor --fix` 逐条人工三选合并（冲突子模式，与"重建索引"子模式区分）— 合并为主条（刷正文+删从条+删索引行）/ 保留两条 / 择一保留，复用 `overwriteActiveBody`+`removeIndexEntry`，**绝不自动择主**，守"人工背书唯一闸门"
- ☐ 索引写入原子化（**独立 hotfix PR**，与冲突合并解耦）— `appendIndex`/`writeKnowledgeIndex` 改用 `atomicWriteFile`（防单写者损坏，不消除 TOCTOU 丢行），`regenerateIndex` 全量重建兜底
- ☐ `doctor` 索引结构完整性校验 — frontmatter 合法 + 条目存在性交叉验证（覆盖 AI-direct 写损坏盲区）
- ☐ 测试 — 全等命中/不命中、三选每支文件+索引突变、跨作用域不判冲突、`--fix` 无自动选主防回退、在现有 `knowledge/` 跑误报率基线

### v0.7.0 — 进化引擎独立化

- ☐ 独立的规则晋升引擎（可脱离 Claude Code 运行）
- ☐ Web UI 管理面板
- ☐ 可视化学习数据

### 未来展望 🔮

- ☐ 稳定适配器 API
- ☐ GitHub Action 集成
- ☐ 社区插件市场
- ☐ 企业级权限管理
- ☐ Web UI 管理面板 / 可视化学习数据（原 v0.7.0 规划，v1.0 转向后回退为长期展望）
