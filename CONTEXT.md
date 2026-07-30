# EvoKit 领域模型

## 核心定位

**EvoKit 是 AI 编程助手的"项目上下文引擎"** — 让 AI 秒懂项目，持久化 AI 不可能知道的项目/个人专属知识。

> 旧定位（v0.x）："自进化纠错系统" — 已废弃。模型能力提升使"纠错低级错误"的痛点消解。

## 术语表

| 术语                                     | 定义                                                                | 作用域   |
| ---------------------------------------- | ------------------------------------------------------------------- | -------- |
| **知识（Knowledge）**                    | AI 不可能从训练数据中获知的、项目或个人专属的信息                   | 核心概念 |
| **知识条目（Knowledge Entry）**          | 一条结构化的知识，含类型、来源、置信度、内容、上下文                | 存储单元 |
| **知识索引（Knowledge Index）**          | `knowledge-index.md`，每条知识的摘要行，始终加载                    | 查询入口 |
| **项目知识（Project Knowledge）**        | 作用域为特定项目的知识，存储在项目 `.claude/memory/evokit/` 下      | 项目级   |
| **个人知识（Personal Knowledge）**       | 作用域为个人的知识，存储在 `~/.claude/memory/evokit/` 下            | 个人级   |
| **团队知识（Team Knowledge）**           | 作用域为团队的知识 — **v1.0 不做**                                  | 搁置     |
| **对话提取（Conversation Extraction）**  | AI 在对话中识别项目知识，静默写入 .pending/，会话结束时提示确认     | 核心机制 |
| **待确认知识（Pending Knowledge）**      | AI 识别后写入 `.pending/` 的知识条目，等待用户确认后移入 knowledge/ | 中间状态 |
| **显式声明（Explicit Declaration）**     | 用户通过 `/evokit-learn "内容"` 直接创建知识条目                    | 兜底机制 |
| **Git 历史分析（Git History Analysis）** | 从 commit message pattern 提取约定                                  | 辅助机制 |
| **过期检测（Staleness Detection）**      | 检查知识条目是否仍然适用                                            | 维护机制 |

## 知识类型

| 类型           | 说明       | 示例                                    |
| -------------- | ---------- | --------------------------------------- |
| `convention`   | 项目约定   | "使用 Result<T> 而非 throw"             |
| `preference`   | 个人偏好   | "使用 uv 而非 pip"                      |
| `architecture` | 架构决策   | "packages/api 是 packages/web 的上游"   |
| `workflow`     | 工作流规则 | "commit 使用 conventional commits 格式" |

## 知识来源

| 来源     | 优先级 | 自动化程度                     |
| -------- | ------ | ------------------------------ |
| 对话提取 | 主     | 半自动（AI 识别 + 用户确认）   |
| 显式声明 | 兜底   | 手动                           |
| Git 历史 | 辅助   | 自动（commit message pattern） |

## 作用域

| 层级 | 存储位置                   | 生命周期             | v1.0    |
| ---- | -------------------------- | -------------------- | ------- |
| 个人 | `~/.claude/memory/evokit/` | 跨项目持久           | ✅      |
| 项目 | `.claude/memory/evokit/`   | 跟项目走，可提交 git | ✅      |
| 团队 | 待定                       | 跟组织走             | ❌ 搁置 |

## 与 Claude Code Memory 的关系

**增强，不替代。**

- Claude Code memory = 存储层（文件系统、索引、加载机制）
- EvoKit = 智能层（对话提取、结构化、确认、过期检测、多助手同步）
- EvoKit 在 `evokit/` 子目录下工作，不修改 Claude Code 原生 memory 文件
- `knowledge-index.md` 可引用上层 Claude Code 原生条目，AI 一次查询覆盖所有知识

## 知识条目数据结构

### Frontmatter

```yaml
id: string # 必填，= 文件名去掉 .md
scope: personal | project # 必填
type: convention | preference | architecture | workflow # 必填
source: conversation | explicit | git-history # 必填
confidence: number # 必填，0.0–1.0
created: string # 必填，ISO 8601
updated?: string # 可选，ISO 8601，修正时填入
context?: string # 可选，单行摘要，适用范围
tags?: string[] # 可选，标签数组
```

### 正文区段

- `## 适用范围`（可选）— 展开 context 的详细描述
- `## 内容`（必填）— 知识的具体描述
- `## 来源上下文`（可选）— 识别来源、原始对话片段

### 文件命名

`{type}-{slug}.md`，完整 type 名，slug 为 kebab-case。冲突加数字后缀。

### 目录结构

```
evokit/
  knowledge-index.md          # 索引（始终加载）
  knowledge/                  # 条目（按需加载，扁平存放）
    convention-result-throw.md
    architecture-api-upstream.md
```

个人级（`~/.claude/memory/evokit/`）与项目级（`.claude/memory/evokit/`）结构完全相同。

### knowledge-index.md 格式

```markdown
## EvoKit 知识

- [convention-result-throw] 使用 Result<T> 而非 throw

## Claude 原生记忆

- [sync-readme-languages](../sync-readme-languages.md) — Keep README.md and README.en.md in sync
```

## 对话提取机制

### 识别载体

- **CLAUDE.md**（始终加载）：2-3 行简短指令，告诉 AI 识别后静默写入 `.pending/`
- **`/evokit-learn` skill**（按需加载）：详细识别规则、信号清单、确认流程

### 静默标记

AI 识别知识 → Write `.pending/{type}-{slug}.md`（frontmatter `status: pending`）→ 回复中不提及。

### 确认流程

1. `/evokit-learn` — 展示 `.pending/` 条目 + 回顾对话提取新知识
2. 用户在对话中回复（自然语言）："确认 1 和 3，拒绝 2"
3. AI 执行：确认的移入 `knowledge/`，拒绝的删除

### 触发方式

- `/evokit-learn` — 手动回顾 + 确认
- `/evokit-learn "内容"` — 显式声明，直接写入 knowledge/
- Stop 钩子 — 检查 `.pending/` 非空时提示（不自动确认）

### 识别信号

| 信号类别   | 示例模式                    | type                  |
| ---------- | --------------------------- | --------------------- |
| 项目约定   | "我们项目总是…"             | convention            |
| 个人偏好   | "我更喜欢…"                 | preference            |
| 架构决策   | "X 是 Y 的上游"             | architecture          |
| 工作流规则 | "提交时…"                   | workflow              |
| 纠正反馈   | "不对，应该是…"             | 根据 content 判断     |
| 隐性知识   | AI 多次犯同一错误后用户纠正 | convention/preference |

**排除**：一次性指令、通用编程常识、临时上下文、未确认猜测。

## 已废弃概念

| 旧概念             | 废弃原因                       | 替代               |
| ------------------ | ------------------------------ | ------------------ |
| 纠错晋升管线       | 模型能力提升，低级错误减少     | 对话提取           |
| corrections.jsonl  | 纠错不再是核心数据源           | 对话提取标记       |
| observations.jsonl | 自动追踪噪声高                 | 对话提取           |
| evolution-log.md   | 无晋升管线则无审计需求         | 无                 |
| violations.jsonl   | 知识不需要"违规验证"           | 过期检测           |
| /evolve 命令       | 纠错晋升管线整体废弃           | /evokit-learn      |
| PreToolUse 钩子    | 知识通过索引常驻加载，不需注入 | knowledge-index.md |
| PostToolUse 钩子   | observations.jsonl 已废弃      | 对话提取           |
| PreCompact 钩子    | 知识库是持久化文件，压缩不丢失 | 无需               |
