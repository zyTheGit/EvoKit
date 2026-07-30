# 钩子体系重写

> **wayfinder:grilling** · 阻塞：T01, T02 · 状态：decided

## Question

5→2 钩子精简后，SessionStart 和 Stop 两个钩子的精确行为是什么？

## 决策结论

### 1. SessionStart 钩子

快速检查知识库完整性（文件存在性 + 格式合法性）：

- `knowledge-index.md` 是否存在？
- 索引中引用的条目文件是否都存在？
- 条目文件的 YAML frontmatter 是否可解析（检查 `---` 分隔符）？
- `.pending/` 是否有待确认知识？（提示用户运行 /evokit-learn）

输出格式：静默通过（无输出），有问题时输出警告。详细检查留给 `/evokit-boot`。

**决策理由**：SessionStart 每次会话执行，必须快；检查都是 O(n) 文件存在性检查；过期检测等复杂逻辑不适合启动时做；职责分离——SessionStart 快速检查，/evokit-boot 深度检查。

### 2. Stop 钩子

仅检查 `.pending/` 是否非空：

- 非空时输出："📋 有 N 条待确认知识，下次运行 /evokit-learn 确认"
- 空时静默跳过

不做对话回顾（留给 `/evokit-learn` 手动触发），不保留 sessions.jsonl 统计。

**决策理由**：Stop 钩子执行时间有限，对话回顾是重操作；对话回顾是 /evokit-learn skill 的职责；sessions.jsonl 已废弃（纠错/观察次数概念不再适用）；简单可靠——只做一件事。

### 3. 被删除的钩子

| 文件                    | 处理 | 理由                                    |
| ----------------------- | ---- | --------------------------------------- |
| `session-start.sh`      | 重写 | 新行为：检查知识库完整性                |
| `stop.sh`               | 重写 | 新行为：检查 .pending/ 提示             |
| `pre-tool-use.sh`       | 删除 | 知识通过索引常驻加载，不需注入          |
| `post-tool-use.sh`      | 删除 | observations.jsonl 已废弃               |
| `pre-compact.sh`        | 删除 | 知识库是持久化文件，压缩不丢失          |
| `export-system.sh`      | 删除 | 新系统知识库是标准 markdown，可直接浏览 |
| `blocked-commands.json` | 删除 | 旧系统概念，新系统不需要                |

**决策理由**：导出功能不保留——新系统知识库是标准 markdown 文件，用户可直接浏览/搜索/打包；旧系统导出 JSONL 格式对用户几乎无价值。

### 4. 实现方式

纯 shell 脚本，保持简单，确保 `shellcheck` 通过。

SessionStart 检查逻辑用 shell 实现（文件存在性 `test -f`、目录非空检查、grep 检查 `---` 分隔符），不需要完整 YAML 解析。

**决策理由**：检查逻辑很简单，shell 完全胜任；适配器机制已支持 shell 钩子；shellcheck 可通过；不需要增加 Node.js 依赖。

## 影响范围

- `template/claude/hooks/` — 删减 + 重写
- `src/adapters/claude/adapter.ts` — 钩子安装逻辑变更
- `src/adapters/base-adapter.ts` — 钩子相关方法变更
- `template/codex/hooks-scripts/` — 同步变更
- `template/codex/hooks.json` — 配置变更
- `src/core/template.ts` — 钩子文件列表变更

## 依赖此票的后续票

- T06（CLI 清理）
