# AI Agent 开发规范实践指南

> 面向中文开发者的项目级 AI 编程助手规范建立指南。
> 本文档为中文原生内容，不设英文版（参见 `.claude/rules/docs-sync.md` 例外名单）。

## 目录

1. [为什么需要项目级规范](#1-为什么需要项目级规范)
2. [快速开始：evokit project](#2-快速开始evokit-project)
3. [CLAUDE.md：AI 助手的认知入口](#3-claudemdai-助手的认知入口)
4. [路径规则：让 AI 自动遵守约束](#4-路径规则让-ai-自动遵守约束)
5. [子代理：分工协作的专家](#5-子代理分工协作的专家)
6. [斜杠命令：一键触发的流程](#6-斜杠命令一键触发的流程)
7. [演化系统：让规范自我进化](#7-演化系统让规范自我进化)
8. [最佳实践](#8-最佳实践)
9. [常见问题](#9-常见问题)

---

## 1. 为什么需要项目级规范

AI 编程助手（Claude Code、Cursor、Copilot 等）默认不了解你的项目：

- 不知道你们的 commit 规范是 conventional commits + 中文描述
- 不知道改动 `src/` 后必须跑测试
- 不知道 `.env` 文件绝对不能提交
- 不知道你们的代码审查标准

**项目级规范**就是告诉 AI 助手这些约束的文件。有了它们，AI 从"通用助手"变成"懂你项目的队友"。

## 2. 快速开始：evokit project

### 安装 EvoKit

```bash
# 全局安装（可选——evokit project 可独立运行）
npx @zythegit/evokit init

# 或直接使用
npx @zythegit/evokit project
```

### 生成项目规范

在项目根目录运行：

```bash
evokit project
```

交互式问答会引导你完成：

1. **项目名称** — 写入 CLAUDE.md 标题
2. **项目描述** — 一句话说明项目做什么
3. **主要语言/框架** — 如 TypeScript、Python、Go
4. **规则开关** — 选择要生成的规则（commit 规范 / 测试门禁 / 文档同步）

### 非交互模式

```bash
evokit project --name my-app --desc "我的应用" --lang TypeScript
evokit project --dry-run   # 仅预览，不写入文件
```

### 生成结果

```
my-project/
├── CLAUDE.md                    # AI 认知入口
└── .claude/
    ├── rules/
    │   ├── commit-convention.md  # commit 规范
    │   ├── test-gate.md          # 测试门禁
    │   └── docs-sync.md          # 文档同步
    ├── agents/
    │   ├── architect.md          # 架构师代理
    │   └── reviewer.md           # 代码审查代理
    ├── commands/
    │   ├── boot.md               # 启动验证
    │   └── review.md             # 代码审查
    └── MEMORY.md                 # 记忆索引
```

已存在的文件**不会被覆盖**——安全可重复运行。

## 3. CLAUDE.md：AI 助手的认知入口

`CLAUDE.md` 是 AI 助手打开项目时**首先读取**的文件。它是项目的"门面"。

### 必备内容

```markdown
# 项目名称

一句话描述

## 关键目录

- src/ — 源代码
- tests/ — 测试
- docs/ — 文档

## 开发命令

- 构建：npm run build
- 测试：npm test
- 代码检查：npm run lint

## 重要设计规则

- 禁止直接操作数据库，必须通过 Repository 层
- API 响应统一使用 Result<T> 类型
```

### 行数限制

`CLAUDE.md` ≤ **150 行**。超出时将细节下沉到 `.claude/rules/`。

### 补充建议

生成后请手动补充以下内容（模板中用 `<!-- -->` 标记）：

1. **关键目录** — 补充项目的实际目录结构
2. **开发命令** — 补充实际的构建、测试、部署命令
3. **重要设计规则** — 补充项目的核心架构决策和约束

## 4. 路径规则：让 AI 自动遵守约束

`.claude/rules/` 下的文件会在 AI 助手编辑对应路径的文件时**自动加载**。

### 工作原理

文件头的 `paths` 字段指定规则生效的路径模式：

```yaml
---
paths: '*/src/**'
---
# 代码质量规则（编辑 src/ 时强制）
...
```

### 内置规则模板

| 规则文件               | 触发路径             | 作用                                 |
| ---------------------- | -------------------- | ------------------------------------ |
| `commit-convention.md` | `src/**`             | 强制 conventional commits + 中文描述 |
| `test-gate.md`         | `src/**`, `tests/**` | 改动代码必须跑测试                   |
| `docs-sync.md`         | `docs/**`, `README*` | 文档必须双语同步                     |

### 自定义规则

创建 `.claude/rules/` 下的 `.md` 文件即可：

```yaml
---
paths: '*/api/**'
---
# API 开发规范（编辑 api/ 时强制）

- 所有端点必须有入参校验
- 响应格式统一使用 `{ code, data, message }`
- 错误处理使用自定义异常类，不抛原生 Error
```

### 规则与 CLAUDE.md 的关系

| 维度       | CLAUDE.md          | rules/             |
| ---------- | ------------------ | ------------------ |
| 加载时机   | 每次会话           | 编辑匹配路径时     |
| 适合放什么 | 项目概览、全局约束 | 特定路径的强制规则 |
| 行数限制   | ≤ 150 行           | 单文件无限制       |

## 5. 子代理：分工协作的专家

`.claude/agents/` 下定义的子代理是 AI 助手的"专家团队"。

### 内置代理

| 代理        | 作用         | 何时使用                 |
| ----------- | ------------ | ------------------------ |
| `architect` | 设计实现方案 | 复杂多步骤任务、架构权衡 |
| `reviewer`  | 代码审查     | 提交前、大型重构后       |

### 代理定义格式

```yaml
---
name: architect
description: 规划代理 — 复杂软件架构与实现设计
model: haiku
tools: [Read, Write, Edit, Bash, Glob, Grep, Agent]
disallowedTools: []
memory: project
maxTurns: 20
---
# Architect Agent

你是一名软件架构师。...
```

### 自定义代理

```yaml
---
name: db-expert
description: 数据库专家 — SQL 优化与迁移设计
model: haiku
tools: [Read, Grep, Glob, Bash]
disallowedTools: [Write, Edit]
memory: project
maxTurns: 10
---
# 数据库专家

你是一名数据库优化专家。...
```

## 6. 斜杠命令：一键触发的流程

`.claude/commands/` 下定义的命令可在对话中用 `/command-name` 触发。

### 内置命令

| 命令      | 作用                         |
| --------- | ---------------------------- |
| `/boot`   | 启动验证——检查系统完整性     |
| `/review` | 代码审查——调用 reviewer 代理 |

### 自定义命令

```yaml
---
description: 运行完整 CI 验证
---
# /ci — 本地 CI 验证

运行与 CI 等效的本地验证：

1. npm run build
2. npm test
3. npm run lint
4. shellcheck bin/*.sh

如果任一步骤失败，报告失败原因并建议修复方案。
```

## 7. 演化系统：让规范自我进化

EvoKit 不仅仅是生成规范文件，还提供**持续演化**机制：

### 演化管线

```
用户纠正 → corrections.jsonl
    ↓ (同一模式出现 2 次)
提升为规则 → learned-rules.md
    ↓ (10+ 会话验证)
固化为路径规则 → rules/ 或 CLAUDE.md
```

### 关键命令

| 命令      | 作用               | 频率                 |
| --------- | ------------------ | -------------------- |
| `/boot`   | 验证系统健康       | 每次会话启动（自动） |
| `/evolve` | 审计纠正、提升规则 | 约每 10 次会话       |
| `/review` | 代码审查           | 提交前               |

### 纠正如何变成规则

1. 你纠正 AI：**"用 const，不要用 var"**
2. AI 记录到 `corrections.jsonl`
3. 同一纠正出现第 2 次 → 自动提升到 `learned-rules.md`
4. 规则在 10+ 会话中持续有效 → 经 `/evolve` 固化到 `rules/`

## 8. 最佳实践

### ✅ 应该做的

- **先跑 `evokit project`**，再手动微调生成的内容
- **CLAUDE.md 保持精简**（≤ 150 行），细节下沉到 rules/
- **路径规则要有 verify 行**——方便 `/boot` 自动验证
- **定期运行 `/evolve`**——让纠正转化为持久规则
- **把规范纳入 code review**——规范也是代码，需要维护

### ❌ 不应该做的

- 不要在 CLAUDE.md 中堆砌细节——那是 rules/ 的工作
- 不要手动删除 `corrections.jsonl` 中的条目——它是 append-only
- 不要把个人偏好写成全局规则——用项目级 rules/ 限定作用域
- 不要忽略 `/boot` 的失败项——它们是系统健康的信号

### 团队协作建议

1. 将 `.claude/rules/` 和 `CLAUDE.md` 纳入 git 跟踪
2. 规范变更走 PR 审查（和代码一样）
3. 定期在团队会议中审查 `learned-rules.md`——清理不再适用的规则
4. 新成员入职时，`evokit project` 生成的文件是最好的项目上下文

## 9. 常见问题

### Q: `evokit project` 和 `evokit init` 有什么区别？

`evokit init`（即 `evokit install`）做**全局安装**——将 EvoKit 框架安装到 `~/.claude/`，所有项目共享。`evokit project` 做**项目级生成**——在特定项目目录中生成规范文件，只影响该项目。两者完全独立。

### Q: 我的项目已有 .claude/ 目录怎么办？

`evokit project` 使用 **skip-if-exists** 策略——已存在的文件跳过不覆盖。你可以安全地重复运行。

### Q: 可以不用 EvoKit 全局安装，只用项目级规范吗？

可以。`evokit project` 完全独立，不要求先 `evokit init`。但演化系统（`/evolve`、`/boot`）需要全局安装的 hooks 支持。

### Q: rules/ 的 paths 字段支持什么模式？

支持 glob 模式：`*/src/**` 匹配所有路径中的 `src/` 子目录，`*.ts` 匹配所有 TypeScript 文件，`*/api/**` 匹配 API 相关文件。

### Q: 如何让规则只在特定分支生效？

目前规则不区分分支。建议在规则中写明适用条件（如"合并到 main 前必须..."），由 AI 助手判断。
