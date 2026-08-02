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
| **过期检测（Staleness Detection）**      | 检查知识条目是否仍然适用；非独立机制，分布于三个触发点             | 分布式维护 |

## 知识类型

| 类型           | 说明       | 示例                                    |
| -------------- | ---------- | --------------------------------------- |
| `convention`   | 微观/风格层约定，AI 可能从代码反推  | "使用 Result<T> 而非 throw"             |
| `preference`   | 个人偏好   | "使用 uv 而非 pip"                      |
| `architecture` | 结构/依赖/系统边界层，AI 无从反推、「猜不出」的知识 | "packages/api 是 packages/web 的上游"   |
| `workflow`     | 工作流规则 | "commit 使用 conventional commits 格式" |

> **`convention` vs `architecture` 划分判据**：这条知识 *AI 光看代码能否自己猜出来？*
> 猜得出 → `convention`（风格/微观）；猜不出 → `architecture`（结构/依赖/系统边界）。
> 两者都是"写作代码的约定"，区别只在抽象层级与可否反推。来源由独立的 `source` 字段承担分类职责。

## 知识来源

| 来源     | 优先级 | 自动化程度                     |
| -------- | ------ | ------------------------------ |
| 对话提取 | 主     | 半自动（AI 识别 + 用户确认背书）|
| 显式声明 | 兜底   | 手动（用户发起即当场背书）      |
| Git 历史 | 辅助   | 提出候选 + 用户确认背书        |

> **唯一闸门是"人工背书"，不是"流程形状"**。所有来源入库前都经过**人工背书**：
> - 对话提取 / git-history → 先进 `.pending/`，用户**确认书**后才入库（半自动，人工在确认步背书）
> - 显式声明 → 用户发起即**当场背书**直接入库（人工在发起瞬间背书，是最强背书形态）
>
> **不再有"直接写入"例外措辞**——统一为"所有入库都经过人工背书"，不变量无孔不入。
> 保证 confidence 高值前提（已背书 → 默认 0.9）无条件成立。

## 作用域

| 层级 | 存储位置                   | 生命周期             | v1.0    |
| ---- | -------------------------- | -------------------- | ------- |
| 个人 | `~/.claude/memory/evokit/` | 跨项目持久           | ✅      |
| 项目 | `.claude/memory/evokit/`   | 跟项目走，可提交 git | ✅      |
| 团队 | 待定                       | 跟组织走             | ❌ 搁置 |

> **作用域判定判据**：问自己——"这条知识 *换到另一个项目还成立吗？*"
> 换项目仍成立 → **个人**（通用习性、个人工作流）；只在当前项目成立 → **项目**（项目特有约定/架构/工作流）。
> **`type` 不等于 `scope`**——它们是正交轴。`preference` 不一定属于个人（可能仅项目生效），
> `convention`/`architecture` 也可能是个人通用习惯。type 描述内容，scope 描述归属。

## 与 Claude Code Memory 的关系

**增强，不替代。**

- Claude Code memory = 存储层（文件系统、索引、加载机制）
- EvoKit = 智能层（对话提取、结构化、确认、过期检测、多助手同步）
- EvoKit 在 `evokit/` 子目录下工作，不修改 Claude Code 原生 memory 文件
- `knowledge-index.md` 可引用上层 Claude Code 原生条目，AI 一次查询覆盖所有知识

> **多助手同步的 v1.0 最小承诺：读助手无关 / 写经各自确认**。
> 所有助手共享同一份 `knowledge/` + 索引（**读**：助手无关）。
> 写入/确认仍经**各助手自己的提取**落 `.pending/`、走同一道人工确认（**写**：助手相关——
> 知识是共享的，确认是各助手触发的）。
> "人工背书唯一闸门"因此不变；多助手只是消费方扩展，不是第二条写入通道，无需新增状态机/冲突合并。
> 助手间同条目实时协商/冲突合并留到 v1.x。

## 知识条目数据结构

### Frontmatter

```yaml
id: string # 必填，= 文件名去掉 .md
scope: personal | project # 必填
type: convention | preference | architecture | workflow # 必填
source: conversation | explicit | git-history # 必填
confidence: number # 必填，0.0–1.0，维护/新鲜度信号（非可信度）
created: string # 必填，ISO 8601，审计元数据（断言时间）
updated?: string # 可选，ISO 8601，最近一次复审/修正时间（审计元数据）
context?: string # 可选，单行摘要，适用范围
tags?: string[] # 可选，标签数组
```

> **`confidence` 是维护/新鲜度信号，是离散三档状态机，非透明数值**。
> `0.9 已确认且有效 → 0.5 待复审 → 0.1 疑失效`。
> **触发是二分判断**（这条还成立吗），**落到谁是指定的档位**——AI 不需精确打分。
> **降分只来自过期检测**：命中　→0.5 并标记待复审；复审后仍存疑 →0.1，交用户定留/删。
> 模型有三根正交轴：**type（内容）· scope（归属）· confidence（时间/寿命）**。
> confidence 给时间轴上"崭新↔发霉"打分。

> **时间流逝不自动衰减 confidence**（不因"陈旧"判"失效"）：
> `created`/`updated` 是**审计元数据**，只记录"何时被断言/复审"，不参与衰退判断。
> 一条 2 年的架构依赖只要仍有效就保持 0.9。判失效是由对话中过期检测的**二分判断**驱动。
> 复审/修正时刷新 `updated`（记录"被认真复核过"），避免纯时间驱动的大面积误报复审。

### 正文区段

- `## 适用范围`（可选）— 展开 context 的详细描述
- `## 内容`（必填）— 知识的具体描述
- `## 来源上下文`（可选）— 识别来源、原始对话片段

> **架构型条目的推理标注**：`type: architecture` 还应在 `## 内容` 后附 `## 影响范围` / `## 相关决策`，
> 写明结论依赖什么前提、会影响哪些模块/服务/数据流，好让 AI 按需追索而非只看摘要。

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

> **检索方式按知识类型分裂**：
> - **规则型**（`convention` / `preference` / `workflow`）：摘要即知识，`knowledge-index.md` 常驻已足够。
> - **架构型**（`architecture`）：结论依赖推理链，摘要不足以触发加载——AI 在遇到模块依赖、
>   服务划分、数据流话题时应主动去查 architecture 型条目。架构条目正文带推理标注见下。

## 对话提取机制

### 识别载体

- **CLAUDE.md**（始终加载）：2-3 行简短指令，告诉 AI 识别后静默写入 `.pending/`
- **`/evokit-learn` skill**（按需加载）：详细识别规则、信号清单、确认流程

### 交互入口命名规范

> **产品提供的所有交互入口统一带 `evokit-` 前缀**（命令 / skill / 触发面）：
> `/evokit-learn` · `/evokit-review` · `/evokit-boot`。
> 不占裸名，与用户项目自定义 slash command 隔离。
>
> **`git-history` 是知识来源，不是指令**——它是会话中由 AI 从 commit 历史被动识别、
> 候选走 `.pending/` 进确认闸门；无独立命令形态。若未来提供手动触发指令，也须为 `/evokit-*`。
> 同理 `source` 枚举值（conversation/explicit/git-history）是字段值，不是可调用的命令。

### 静默标记

AI 识别知识 → Write `.claude/memory/evokit/.pending/{type}-{slug}.md`（frontmatter `status: pending`）→ 回复中不提及。

> **`.pending/` 一律按当前项目存放**（对话提取发生在当前项目会话中，语境一致）。确认时可指定作用域后归档。
> 识别时**不猜测作用域**，`scope` 延后到确认时由人工裁定（见下方确认流程）。

### 确认流程

1. `/evokit-learn` — 展示 `.pending/` 条目 + 回顾对话提取新知识
2. 用户在对话中回复（自然语言）："确认 1 和 3，拒绝 2"
3. AI 执行：确认的移入 `knowledge/`，拒绝的删除

> **作用域在确认时裁定，而非识别时猜测**：AI 展示待确认条目时显式标注建议的 `scope`（个人/项目），用户可在确认时指定归属，如"确认 1 为个人，3 为项目"。
> 确认时若指定了个人的，条目移往 `~/.claude/memory/evokit/knowledge/`；否则留在 `.claude/memory/evokit/knowledge/`。

### 触发方式

- `/evokit-learn` — 手动回顾 + 确认（背书对话提取）/git-history 候选)
- `/evokit-learn "内容"` — 显式声明，用户发起即**当场背书**，直接入库（用户明确 `scope`，缺省当前项目）
- Stop 钩子 — 检查 `.pending/` 非空时提示（不自动确认）

> **显式声明的 `scope` 同样人工裁定**：用户带上下文，天然能明确归属。缺省按当前项目，
> 与对话提取 `.pending/` 的默认项目一致，两条路径的 `scope` 来源统一。

### 识别信号

| 信号类别   | 示例模式                    | type                  |
| ---------- | --------------------------- | --------------------- |
| 约定·项目层面 | "我们项目总是…"             | convention（scope 确认时裁定）|
| 偏好·个人层面 | "我更喜欢…"                 | preference（scope 确认时裁定）|
| 架构决策   | "X 是 Y 的上游"             | architecture          |
| 工作流规则 | "提交时…"                   | workflow              |
| 纠正反馈   | "不对，应该是…"             | 根据 content 判断     |
| 隐性知识   | AI 多次犯同一错误后用户纠正 | convention/preference |

> **`type` 与 `scope` 正交**：signal 到 `type` 的映射不代表归属。
> 示例模式只是**内容线索**，作用域一律按上述判据在**确认时**由人工裁定，
> `preference` 不一定属于个人，`convention` 也可能是个人的。

**排除**：一次性指令、通用编程常识、临时上下文、未确认猜测。

## 过期检测（分布式，非独立机制）

基于对话/现地核对，分布于三个触发点：

| 触发点 | 何时检查 | 判定 |
|--------|----------|------|
| 对话中发现失效 | AI 在对话中意识到某条知识过时 | 直接降 confidence 或标记，提示用户 |
| 确认时顺带自查 | `/evokit-learn` 确认对话提取时 | 顺带看已入库条目是否还成立 |
| 用户主动发起 | `/evokit-review` 命令 | 全量复审 confidence 低于阈值的条目 |

过期检测与对话提取共用**对话语境 + 确认闸门**，不新增抽象载体。

**confidence 离散三档状态机（触发二分、落档指定）：**

```
0.9 已确认且有效
  │  过期检测命中（该条还成立吗 → 否）
0.5 待复审（标记复审，进 /evokit-review 名单）
  │  复审后仍存疑
0.1 疑失效（交用户定留/删）
```

**阈值**：≤ 0.5 即列入复审；0.1 由用户裁决。往返：复审确认仍有效可回升 0.9。

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
