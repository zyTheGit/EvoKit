# EvoKit 架构

## 概述

EvoKit 采用 **3 层架构**，围绕知识条目的生命周期组织 AI 行为。

```
+------------------------------------------------------------------+
|  L1: 认知核心                                                      |
|  CLAUDE.md — 思维框架、知识系统协议                                  |
|  加载时机：每次会话                                                |
|  最大行数：150 行                                                  |
+------------------------------------------------------------------+
|  L2: 路径规则 + 技能 + 子代理                                       |
|  rules/ — 按文件路径自动加载                                        |
|  skills/ — 渐进式披露的自动调用工作流                               |
|  agents/ — 专门的代理定义                                          |
+------------------------------------------------------------------+
|  L3: 知识引擎                                                      |
|  evokit/ — 知识条目 + 索引 + 待确认                                 |
|  对话提取 → 确认 → 持久化 → 过期检测                                |
|  命令：/evokit-boot, /evokit-learn, /evokit-review                 |
|  钩子：SessionStart, Stop                                          |
+------------------------------------------------------------------+
```

## 各层详解

### L1：认知核心（CLAUDE.md）

认知核心定义了 **AI 如何思考**，而不仅仅是它知道什么。它包含：

- **思维框架：** 理解 → 规划 → 验证 → 学习的层级结构
- **完成标准：** "完成"的定义（经过测试、无 TODO、知识库完整）
- **知识系统协议：** 知识识别、静默标记、确认流程
- **技能与代理：** 对技能目录和子代理定义的引用
- **命令：** `/evokit-boot`、`/evokit-learn`、`/evokit-review` 的功能说明

**设计原则：** CLAUDE.md 应很少变更。新知识应写入 `evokit/knowledge/`。

### L2：路径规则 + 技能 + 子代理

**路径规则（.claude/rules/）** — 编辑匹配其 `paths` 模式的文件时自动加载。

| 规则文件 | 作用域 | 用途 |
|-----------|-------|------|
| `security.md` | `*/security*` | API 密钥、敏感操作、注入防护 |
| `coding.md` | `*/coding*` | 风格、质量、语言特定约定 |
| `core-invariants.md` | `*/core-invariants*` | 不可变的系统规则 |

**技能（.claude/skills/）** — 渐进式披露的自动调用工作流指令。

**子代理（.claude/agents/）** — 具有隔离上下文的专业代理。

| 代理 | 工具 | 最大轮次 | 记忆 | 用途 |
|------|------|---------|------|------|
| `architect` | Read, Write, Bash, Agent 等 | 20 | project | 设计实现方案 |
| `reviewer` | Read, Grep, Glob, Bash | 15 | project | 代码审查 |

### L3：知识引擎（evokit/）

让 AI 持久化项目/个人专属知识的核心基础设施。

#### 数据流

```
对话中识别知识
     |
     v
.pending/{type}-{slug}.md  ──→  用户确认  ──→  knowledge/{type}-{slug}.md
     |                                        |
     |                                        v
     └── 拒绝 → 删除                    knowledge-index.md（追加条目行）
```

#### 钩子

| 钩子 | 在知识引擎中的角色 |
|------|-------------------|
| `SessionStart` | 快速知识库完整性检查（索引存在、条目文件、frontmatter 格式） |
| `Stop` | 检查 `.pending/` 非空时提示运行 `/evokit-learn` |

#### 管理命令

| 命令 | 用途 |
|------|------|
| `/evokit-boot` | 知识库完整性深度检查 |
| `/evokit-learn` | 回顾对话提取知识 / 显式声明知识 |
| `/evokit-review` | 代码审查 |

#### 知识条目结构

每个知识条目是 `knowledge/{type}-{slug}.md`，包含 YAML frontmatter + 正文：

```yaml
---
id: convention-uv-pip
scope: personal
type: convention
source: conversation
confidence: 0.9
created: "2026-07-30"
---
## 内容
使用 uv 代替 pip
```

#### 知识类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `convention` | 项目约定 | "使用 Result<T> 而非 throw" |
| `preference` | 个人偏好 | "使用 uv 而非 pip" |
| `architecture` | 架构决策 | "packages/api 是上游" |
| `workflow` | 工作流规则 | "commit 用 conventional 格式" |

## 文件大小限制

| 文件 | 最大行数 | 超出时 |
|------|---------|--------|
| `CLAUDE.md` | 150 | 将内容移至 `rules/` |
| `knowledge-index.md` | 无硬性限制 | 过期检测自动调节 |

## 多代理适配器架构

```
+-------------+    +--------------+    +-------------+    +---------+
|  Claude     |    |  Codex       |    |  OpenCode   |    |  Pi     |
|  Code       |    |  CLI         |    |  CLI        |    |  CLI    |
+------+------+    +------+-------+    +------+------+    +----+---+
       |                  |                   |               |
       v                  v                   v               v
+---------------------------------------------------------------+
|               EvoKit 适配器层                                     |
|  install → verify → status → uninstall                          |
+---------------------------------------------------------------+
|              共享知识根（agent 无关）                            |
|  个人 ~/.evokit/knowledge/   项目 <project>/.evokit/  ...        |
+---------------------------------------------------------------+
```

详见 [MULTI_AGENT.md](MULTI_AGENT.md) 了解完整的适配器规范。
