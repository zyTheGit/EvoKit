# CLI 命令重写与废弃模块清理

> **wayfinder:grilling** · 阻塞：T01, T02, T03, T05 · 状态：decided

## Question

CLI 命令体系需要重写，同时清理废弃的核心模块。哪些删、哪些改、哪些新增？

## 决策记录

### 1. `evolve` 命令 → 直接删除

整个晋升管线（corrections → learned-rules）已被对话提取机制取代。`evolve.ts` 唯一依赖 `promote.ts` 和 `rotate.ts`，删除后无向后兼容需求（v1.0 major version）。

- 删除 `src/commands/evolve.ts`
- 删除 `src/cli.ts` 中的 import 和 `.addCommand()`

### 2. `promote.ts` + `rotate.ts` → 删除模块+测试+相关函数

唯一调用方 `evolve.ts` 已确认删除，概念基础已不存在。

- 删除 `src/core/promote.ts`（283 行）
- 删除 `src/core/rotate.ts`（157 行）
- 删除 `tests/core/promote.test.ts`
- 删除 `tests/core/rotate.test.ts`
- 删除 `src/core/memory.ts` 中的 `readLearnedRules`、`writeLearnedRules` 及相关常量（RULE_REGEX、VERIFY_REGEX、PROMOTED_REGEX）

### 3. `doctor` 命令 → 扩展而非重写

原有检查仍有价值，知识库健康是新增维度。`doctor` 命令代码零改动，在适配器 `status()` 中增加知识库检查项：

- `evokit/` 目录存在性
- `knowledge-index.md` 存在性 + 格式合法性
- `knowledge/` 条目文件与索引一致性
- `.pending/` 是否有未确认条目（warn 级）
- 条目 frontmatter 格式合法性

### 4. `evokit learn` 命令 → v1.0 不新增

对话提取是 AI 驱动的交互过程，不适合 CLI 单次调用。用户显式声明知识可直接编辑 `knowledge/` 下的 `.md` 文件。

### 5. `export` / `import` 命令 → v1.0 保留注册但提示暂不支持

当前实现硬编码 Claude Code 路径，处理 v0 数据格式。重写工作量不小，跨机器迁移是后续需求。

- v1.0：保留命令注册，执行时提示"v1.0 格式暂不支持，请先使用 evokit migrate 转换旧数据"
- v1.1：重写为支持 `evokit/` 目录结构的 export/import

### 6. 种子文件 → 删除 v0 种子，新增 v1.0 结构

- 删除 `template/claude/memory/` 下的 v0 种子文件（corrections.jsonl、observations.jsonl、violations.jsonl、evolution-log.md、learned-rules.md、sessions.jsonl）
- 新增 `template/claude/memory/evokit/knowledge-index.md`（含两个 section）
- 新增 `template/claude/memory/evokit/knowledge/` 目录（空或含 README）
- 新增 `template/claude/memory/evokit/.pending/` 目录（空）
- 更新 `MEMORY_SEED_FILES` 为 `['README.md', 'evokit/knowledge-index.md']`
- 同步更新 OpenCode 适配器的 `MEMORY_SEED_FILES`

### 7. `cli.ts` 文案 → 更新品牌定位

- `.description()` 改为"EvoKit — AI 编程助手的项目上下文引擎"
- help 文本中删除 `evolve` 行，新增 `migrate` 行
- 删除 `evolveCommand` 的 import 和 `.addCommand()`
- 新增 `migrateCommand` 的 `.addCommand()`

## 影响范围

| 文件                               | 操作                                               |
| ---------------------------------- | -------------------------------------------------- |
| `src/cli.ts`                       | 修改：更新文案、删除 evolve、注册 migrate          |
| `src/commands/evolve.ts`           | 删除                                               |
| `src/commands/doctor.ts`           | 不改（适配器层扩展）                               |
| `src/commands/export_cmd.ts`       | 修改：添加 v1.0 不支持提示                         |
| `src/commands/import_cmd.ts`       | 修改：添加 v1.0 不支持提示                         |
| `src/core/promote.ts`              | 删除                                               |
| `src/core/rotate.ts`               | 删除                                               |
| `src/core/memory.ts`               | 修改：删除 readLearnedRules/writeLearnedRules      |
| `src/core/template.ts`             | 修改：更新 MEMORY_SEED_FILES                       |
| `src/adapters/claude/adapter.ts`   | 修改：status() 增加知识库检查                      |
| `src/adapters/opencode/adapter.ts` | 修改：更新 MEMORY_SEED_FILES                       |
| `template/claude/memory/`          | 修改：删除 v0 种子、新增 v1.0 结构                 |
| `tests/core/promote.test.ts`       | 删除                                               |
| `tests/core/rotate.test.ts`        | 删除                                               |
| `tests/core/memory.test.ts`        | 修改：删除 readLearnedRules/writeLearnedRules 测试 |
