# CLAUDE.md 模板重写

> **wayfinder:grilling** · 阻塞：T01, T02 · 状态：decided

## Question

template/claude/CLAUDE.md 是安装到用户 `~/.claude/` 的认知核心。从"自进化协议"改为"项目上下文引擎"协议，具体内容怎么写？

## 决策结论

### 1. 核心定位声明

极简定位 + 3 个核心机制 + 3 个命令，约 15 行：

```markdown
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
```

**决策理由**：极简定位节省行数留给协议和规则；3 个核心机制覆盖新系统的全部能力；命令列表让 AI 知道可用工具。

### 2. 思维框架

保留旧框架（理解→规划→验证→学习），重新定义"学习"：

```markdown
## 思维框架

1. **理解** — Read 相关文件，确认变更范围
2. **规划** — 复杂任务先列方案，简单任务直接执行
3. **验证** — 运行测试，确认无回归
4. **学习** — 识别项目知识，静默写入 .pending/，用户确认后持久化
```

**决策理由**：前三个步骤是通用开发流程，不依赖特定机制；"学习"的重新定义（纠错→知识识别）概念延续性好；完全替换旧框架会导致通用开发流程描述丢失。

### 3. 知识系统协议

紧凑表格 + 引用 CONTEXT.md，不重复完整 frontmatter 定义。约 25 行：

```markdown
## 知识系统

知识条目存储在 `.claude/memory/evokit/` 下，结构与 `CONTEXT.md` 定义一致。

### 目录布局

evokit/ knowledge-index.md knowledge/ .pending/

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
```

**决策理由**：不重复 CONTEXT.md 的完整 frontmatter 定义，只写 AI 日常使用需要的核心信息；紧凑表格节省行数；完整数据结构在 CONTEXT.md 中。

### 4. 完成标准

3 条，与旧系统等价但面向新机制：

```markdown
## 完成标准

1. **改动已验证** — 运行测试，确认无回归
2. **代码已清理** — 无 TODO/FIXME/console.log/debugger 残留
3. **知识库完整** — 索引引用的条目文件都存在，格式合法
```

**决策理由**：前两条是通用的，始终适用；第三条从"/boot 无违规"变为"知识库完整"，语义等价；不要求"所有知识都已确认"——完成标准是代码层面的，知识确认是异步流程。

### 5. 行数限制

- **CLAUDE.md ≤ 150 行** — 保留，认知核心膨胀严重影响 AI 性能
- **learned-rules.md ≤ 50 行** — 删除，该文件已废弃
- **knowledge-index.md 无硬性限制** — 行数取决于知识条目数量，强制上限会导致无法添加知识

**决策理由**：knowledge-index.md 实际上不会太长（20-50 条知识 = 20-50 行）；过期检测是自调节机制，不需要硬性上限。

## 影响范围

- `template/claude/CLAUDE.md` — 重写
- `src/core/template.ts` — 模板内容变更
- `template/claude/rules/` — 可能需要更新引用

## 依赖此票的后续票

- T06（CLI 清理）
