# EvoKit — 项目上下文引擎

让 AI 秒懂项目，持久化 AI 不可能知道的项目/个人专属知识。

## 核心机制

1. **对话提取** — AI 识别项目知识，静默写入 .pending/，用户确认后持久化
2. **知识索引** — knowledge-index.md 始终加载，条目按需加载
3. **过期检测** — 定期检查知识条目是否仍然适用

## 命令

- `/evokit-boot` — 知识库完整性深度检查
- `/evokit-learn` — 回顾对话提取知识 / 显式声明知识
- `/evokit-review` — 代码审查

## 思维框架

1. **理解** — Read 相关文件，确认变更范围
2. **规划** — 复杂任务先列方案，简单任务直接执行
3. **验证** — 运行测试，确认无回归
4. **学习** — 识别项目知识，静默写入 .pending/，用户确认后持久化

### 自检

**行动前：**

- 已读取要修改的文件？
- 理解现有模式？
- 有可复用的工具/约定？

**变更后：**

- 测试通过？无 TODO/FIXME/console.log/debugger 残留？
- 识别到项目知识？→ 静默写入 .pending/

## 知识系统

知识条目存储在 `.claude/memory/evokit/` 下，结构与 `CONTEXT.md` 定义一致。

### 目录布局

```
evokit/
  knowledge-index.md    # 索引（始终加载）
  knowledge/            # 条目（按需加载，扁平存放）
  .pending/             # 待确认条目
```

### 知识类型

| 类型         | 说明       | 示例                          |
| ------------ | ---------- | ----------------------------- |
| convention   | 项目约定   | "使用 Result<T> 而非 throw"   |
| preference   | 个人偏好   | "使用 uv 而非 pip"            |
| architecture | 架构决策   | "packages/api 是上游"         |
| workflow     | 工作流规则 | "commit 用 conventional 格式" |

### 知识识别

当你在对话中识别到项目/个人专属知识时，静默写入
`.claude/memory/evokit/.pending/{type}-{slug}.md`，不要在回复中提及。
用户确认后移入 `knowledge/` 并更新索引。

### 作用域

| 层级 | 位置                       | 说明     |
| ---- | -------------------------- | -------- |
| 项目 | `.claude/memory/evokit/`   | 跟项目走 |
| 个人 | `~/.claude/memory/evokit/` | 跨项目   |

## 完成标准

1. **改动已验证** — 运行测试，确认无回归
2. **代码已清理** — 无 TODO/FIXME/console.log/debugger 残留
3. **知识库完整** — 索引引用的条目文件都存在，格式合法

## 行数限制

- `CLAUDE.md` ≤ 150 行

## 工具优先级

1. **Codegraph** _(可选)_ — `codegraph_explore`/`codegraph_search`/`codegraph_impact`
2. **Read** — 文件内容
3. **Grep/Glob** — 模式匹配
4. **Bash** — 测试、构建、一次性命令

## Agent 使用

| Agent       | 使用场景                   | 不适用场景              |
| ----------- | -------------------------- | ----------------------- |
| `architect` | 复杂多步工作，需先设计方案 | 简单编辑、单文件修复    |
| `reviewer`  | 提交前、大变更后、PR 前    | 一行改动、生成/样板代码 |

## 钩子事件

| Event        | Purpose                                         | Hook Script        |
| ------------ | ----------------------------------------------- | ------------------ |
| SessionStart | Quick knowledge base integrity check            | `session-start.sh` |
| Stop         | Check pending knowledge, prompt user to confirm | `stop.sh`          |

SessionStart performs a fast check on knowledge base integrity (index existence, entry files, frontmatter format, pending items). Detailed diagnostics are left to `/evokit-boot`.

## 完整性规则

- **先读后改** — 未读取的文件不编辑
- **不删未授权文件** — 用户未要求的不删除
- **不硬编码个人路径** — 模板中使用 `__HOME__` 占位符
- **不跳过测试** — 变更后必须验证
- **错误如实报告** — 不假装成功，不静默重试
- **多方案先问** — 2+ 合理方案时，列出选项让用户决定
