# 多助手适配器同步

> **wayfinder:grilling** · 阻塞：T01 · 状态：decided

## Question

EvoKit 支持 4 个适配器（Claude Code / Codex / OpenCode / Pi）。知识库的 evokit/ 子目录结构在 4 个适配器中如何同步？

## 决策记录

### 1. 知识库位置 → 方案 A：每个助手独立知识库

每个 AI 助手有独立的知识库，路径为各自的 `memory/evokit/` 子目录：

- Claude Code：`~/.claude/memory/evokit/knowledge/`
- Codex：`~/.codex/memory/evokit/knowledge/`
- OpenCode：`~/.config/opencode/memory/evokit/knowledge/`
- Pi：`~/.pi/agent/memory/evokit/knowledge/`

理由：独立性（避免跨助手冲突）、简单性（无需符号链接或同步机制）、evokit/ 子目录已隔离。跨助手共享留待 v1.1（通过 export/import）。

### 2. BaseAdapter memory 方法 → 删除三个死代码方法 + 重命名路径方法

- 删除 `injectMemory()`、`exportMemory()`、`recordSession()`（无调用方，处理 v0 数据格式）
- `resolveMemoryDir()` 重命名为 `resolveEvokitDir()`，返回 `memory/evokit/` 路径
- 子类 override 跟随重命名

### 3. 适配器模板同步 → 分步实施

#### T07a（v1.0 范围）

统一处理原则：

1. 所有适配器删除 v0 种子文件（`memory/learned-rules.md`、`memory/evolution-log.md` 等）
2. 所有适配器新增 `memory/evokit/knowledge-index.md`、`memory/evokit/knowledge/`、`memory/evokit/.pending/`
3. Codex：hooks.json 和 hooks-scripts 已是 v1.0 格式，只需清理种子文件
4. OpenCode：删除 `tools/evokit-evolve.ts`
5. Pi：删除 `extensions/evokit-evolve.ts`
6. 更新各适配器代码中的 `MEMORY_SEED_FILES` 常量

#### T07b（v1.1 范围）

- 重写 OpenCode `tools/evokit-memory.ts`、`tools/evokit-boot.ts`（适配知识条目操作）
- 重写 Pi `extensions/evokit-memory.ts`、`extensions/evokit-boot.ts`、`extensions/evokit-lifecycle.ts`
- 需要实际测试环境验证

### 4. Claude 命令文件 → 删除 evolve、保留其余

- 删除 `template/claude/commands/evolve.md`
- 保留 `commands/boot.md` 和 `commands/evokit-review.md`（内容更新留给各自实现票）

## 影响范围

| 文件                                       | 操作                                                        |
| ------------------------------------------ | ----------------------------------------------------------- |
| `src/adapters/base-adapter.ts`             | 修改：删除 3 个方法，重命名 resolveMemoryDir                |
| `src/adapters/claude/adapter.ts`           | 修改：跟随 resolveEvokitDir 重命名                          |
| `src/adapters/codex/adapter.ts`            | 修改：跟随 resolveEvokitDir 重命名                          |
| `src/adapters/opencode/adapter.ts`         | 修改：跟随 resolveEvokitDir 重命名 + 更新 MEMORY_SEED_FILES |
| `src/adapters/pi/adapter.ts`               | 修改：跟随 resolveEvokitDir 重命名                          |
| `template/claude/memory/`                  | 修改：删除 v0 种子、新增 evokit/ 结构                       |
| `template/claude/commands/evolve.md`       | 删除                                                        |
| `template/codex/memory/`                   | 修改：删除 v0 种子、新增 evokit/ 结构                       |
| `template/opencode/memory/`                | 修改：删除 v0 种子、新增 evokit/ 结构                       |
| `template/opencode/tools/evokit-evolve.ts` | 删除                                                        |
| `template/pi/memory/`                      | 修改：删除 v0 种子、新增 evokit/ 结构                       |
| `template/pi/extensions/evokit-evolve.ts`  | 删除                                                        |
