# EvoKit 记忆引擎（v3）实施计划：技术方案与任务拆分

> 依据：[MEMORY-ENGINE-DESIGN.md](MEMORY-ENGINE-DESIGN.md)（2026-11-06，下称「设计文档」）。设计文档回答「做什么、为什么」；本文回答「怎么落地」：需求基线 → 贴着现有代码的技术方案 → 可直接执行的任务拆分。
>
> **基线核实（2026-11-06）**：分支 `main` @ `8e1a4c2`（v2.0 已合并，领先 origin 12 个提交）；`node cli/test-local.mjs` **126 通过 / 0 失败**；`docs/zh/MEMORY-ENGINE-DESIGN.md` 与 `scripts/check-docs-sync.mjs`（豁免表）改动在工作区尚未提交。
>
> **完成状态（2026-11-08）**：T-0.x 与 M0–M5 全部任务已完成并提交；实施中追加 M6 定时学习管理（`evokit schedule enable/disable/list` + `learn --assist`）与三项改进（F1 草稿间合并、F2 入库后自动分发索引、P4 报错文案明确化），均已真机验证。分支 `feature/3.0-memory-engine` 累计 23 个 commit（未推送）；九套测试 774 断言全绿。§3.7 的 P2 储备与 §6 开放问题①（双语补译）仍按登记待办；命令最终面以 `cli/README.md` 为准。
>
> **执行纪律**：每个任务一个独立 commit（渐进提交）；任务卡中的「验收」均为可运行命令，宣称完成前必须实际执行；只改任务相关文件。

---

## 1. 需求基线

### 1.1 目标与范围一句话

给 EvoKit（零依赖偏好同步 CLI）加一条**经验层流水线**：`harvest → distill → review → knowledge → recall / forge`，把 12 个 AI 工具的私有记忆与会话历史提纯成统一知识库，持续自动学习并自动沉淀 skill。LLM 环节全部委托本机 agent CLI，EvoKit 本体保持「无 AI 的管道工」。

- **范围内**：设计文档 §3–§10 的数据契约与 P0/P1 功能；个人知识根 `~/.evokit/knowledge/`。
- **范围外**（登记不承诺）：sqlite 源（P2 储备，[T-P2.1](#37-p2-储备不在本轮承诺)）、MCP 记忆服务（SP-spike）、项目级知识根 `<project>/.evokit/`（首版只做个人根，见 D10）、知识库远程同步、embedding。

### 1.2 功能需求（FR）

| 编号 | 需求 | 优先级 | 出处 |
| --- | --- | --- | --- |
| FR-01 | `sources` 配置块驱动的多源采集，8 种适配器（P0：`claude-projects` / `codex-rollout` / `memory-cards` / `trae-session-memory`；P1：`jsonl-fields` / `pi-sessions` / `daily-log`） | P0 | 设计文档 §4.1 |
| FR-02 | RawEvent 统一中间格式 + inbox 暂存（保留 30 天） | P0 | §3.1 |
| FR-03 | 水位线增量收割（`state.json`；`--full` 全量） | P0 | §4.2 |
| FR-04 | 收割即脱敏（默认 7 类规则 + 可扩展），RawEvent 与卡片双点执行 | P0 | §4.3 |
| FR-05 | distill 两阶段提纯（抽卡 → 与既有条目裁决 ADD/UPDATE/MERGE/NOOP），执行者 codex→pi，分批 ≤8 会话 / ≤24KB / ≤10 卡 | P0 | §5 |
| FR-06 | 输出解析容错：整体 JSON → 逐块提取 → `orphan/`，绝不丢弃 | P0 | §5.3 |
| FR-07 | `.pending` 草稿闸门 + review 三档（manual / assist / auto）+ `--audit` | P0 | §6 |
| FR-08 | 知识根 `~/.evokit/knowledge/`：独立 git 版本化（不配 remote）；原子卡片 + 索引 | P0 | §3.2–3.3 |
| FR-09 | 索引契约：`## EvoKit 知识` 可重建桶 + 未知 section 原样保留 + 旧 header 永久别名 + `- [id] 摘要` 行格式 + ≤60 行预算滚动 | P0 | §3.3 + ADR 0008 |
| FR-10 | review 裁决落库：accept / edit / reject / merge；`.rejected/` 保留 90 天；git commit 可回滚 | P0 | §6 + §13 Q1 |
| FR-11 | `recall` 本地检索（tags/标题/正文，无 embedding）+ references 命中计数 | P0 | §7.3 + §9 |
| FR-12 | L1 分发：`knowledge-index` 内置 text 资源 → 三入口托管块（复用 sync，同步器零改动） | P0 | §7.1 |
| FR-13 | AGENTS.md 标准输出目标（先 spike 验证，再决定是否承诺） | P1 | §7.1 |
| FR-14 | forge：聚簇达标触发 → 委托生成 SKILL.md → review → symlink 分发 → `generation.json` + 试用期/退役 | P0 | §8 |
| FR-15 | 持续学习触发：手动 `learn` / 任务计划 02:00 / Claude Code 钩子**入队** | P1 | §9 |
| FR-16 | inventory 六区块体检扩展到 `knowledge/` | P1 | §6 / §9 |
| FR-17 | `discover`：新工具记忆目录探测 + 适配器接入指引 | P2 | §13 Q2 |
| FR-18 | `knowledge gc` 显式归档（过期不自动删除） | P1 | §13 Q5 |
| FR-19 | sqlite 适配器（`node:sqlite` 只读） | P2 | §14 |

### 1.3 非功能需求（NFR）

| 编号 | 需求 |
| --- | --- |
| NFR-01 | 零 npm 依赖：纯 Node 标准库；npm 依赖保持 0，npx 直跑不破 |
| NFR-02 | 无常驻进程：调度交给任务计划/钩子，CLI 全部短进程 |
| NFR-03 | Node 版本分级：核心 ≥18；zstd（codex 源）≥23.8；`node:sqlite`（P2）≥23.4。不支持时该源报「需启用」并跳过，不阻塞其他源 |
| NFR-04 | token 预算：L1 索引 ≤60 行（≈1.2k token/会话）；distill 单批 ≤24KB；卡片正文按需 Read |
| NFR-05 | 安全：收割即脱敏；密钥/内网信息不入库；分发的索引只含标题摘要；知识库 git 不配 remote |
| NFR-06 | 可回滚：知识库独立 git；`.pending` 闸门；全链路只增不删（显式 `gc` 除外） |
| NFR-07 | 兼容：现有 9 命令与 126 测试零回归；一切未知内容只保留不删除 |
| NFR-08 | 跨平台：Windows 优先（本机），路径/换行/软链兼容 macOS/Linux（复用 fs-utils 的 junction 回退） |
| NFR-09 | 可测试：全部新逻辑可在 `EVOKIT_HOME` 隔离目录下单测（paths.js 已支持该覆盖）；委托调用复用 test-local.mjs 已有的 mock bin 手法 |
| NFR-10 | 体量：新增 1500–2500 行；CLI 源码 <200KB |

### 1.4 硬性红线（违反即打回）

1. **未知 section 只保留不删除**——ADR 0008 §3 纪律在 JS 版复活，是索引读写器的第一验收项（v1.x 曾有「一次重建就把用户手写段物理删除」的 P0 事故）。
2. **只动托管块、永不整文件覆盖**——分发只经 `fs-utils.applyManagedBlock`；工具入口文件块外内容一字不动。
3. **索引行单一格式 `- [id] 摘要`**；`🏛`/`⚠` 标记在摘要前缀位，不进中括号（ADR 0008 §5）。
4. **钩子三层纪律**（ADR 0007）：逻辑只实现一次（Node 层）；任何异常无条件 exit 0；`--json` 的 stdout 有且只有一个合法 JSON，异常堆栈禁入 stdout。
5. **新命令同步四处**：`cli/evokit.mjs` 的 `KNOWN_COMMANDS`（打错命令猜测表，v1.x bin 白名单漏改教训的 v2.0 对应物）+ switch 分支 + `commands/index.js` 导出 + `help.js`/`cli/README.md` 文案。
6. **LLM 全外委**：distill/forge 只调本机 agent CLI（复用 `agents-cli.js`）；不内置模型调用、不引 SDK、不引 API key。
7. **默认人在环**：`knowledge.automation` 默认 `manual`；assist/auto 必须显式配置。
8. **过期不删除**：失效 = 置 `validUntil`；物理清理只由 `evokit knowledge gc` 显式执行。
9. **委托 prompt 强制约束**：「不调用工具、不读取其他文件、不修改任何数据、只输出约定 JSON」（inventory 模板同款纪律，防 agent 副作用）。
10. **只认带 `source` 的卡片**：distill 产卡必须携带可回溯来源，缺 source 拒绝入库。

### 1.5 设计文档留白裁决（本方案裁定）

| # | 留白点 | 裁定 | 理由 |
| --- | --- | --- | --- |
| D1 | 钩子语义：设计文档写「SessionEnd/Stop 钩子 → `evokit learn --session <id>`」 | 钩子只**入队**不执行：新增 `evokit hook learn-enqueue`，写 `~/.evokit/triggers/*.json` 立即返回；`learn` 由夜间任务消费 triggers（`--session` 随入队传递） | distill 含 LLM 调用（分钟级），在 Stop 钩子里同步跑会阻塞会话结束，违反 ADR 0007「永不阻断宿主」 |
| D2 | harvest 是否独立命令 | 独立成命令（只采集到 inbox）；`learn` = harvest→distill→review 提示的编排，另有 `--no-distill` | harvest 可单独验收（M1）；两者复用同一段采集代码 |
| D3 | settings 新块合并策略 | `sources` 走 `mergeById`（与 agents/resources 同法）；新增 `knowledge` 块走 `mergeByKey`（与 prompts 同法） | config.js 既有两套合并器直接复用，行为可预期 |
| D4 | review 交互形态 | 非 REPL：`evokit review` 列清单并打印每条的裁决命令（`--accept <id>` / `--reject <id>` / `--merge <id> <into>`）；编辑 = 直接改 `.pending` 里的 md 后再 accept | Windows 管道/CI 兼容，符合 CLI 短进程定位；卡片本身是 markdown，就地编辑最自然 |
| D5 | forge 分发落点 | forge 通过后**直接创建 symlink**（复用 `fs-utils.makeSymlink`），落点回写 `generation.json.distributedTo`；不改写用户 settings.json 的 resources | resources 是用户手写配置，程序化追加条目越权；distributedTo 记录使 audit 退役可精确回收链接 |
| D6 | skill-lock 登记 | 读写 `~/.agents/skills/.skill-lock.json` 前先校验既有 schema；兼容则追加 `sourceType: "evokit"` 条目，不兼容则跳过并提示 | .skill-lock.json 属于 skill 生态，EvoKit 只做无损追加 |
| D7 | 索引滚动算法 | 溢出时按（最近引用时间 desc，confidence desc，updated desc）挤出；forge 父卡与 `pitfall` 类型加粘性权重 | 设计文档 §13 Q5「最近引用+置信度」的具体化 |
| D8 | 卡片 id 生成 | `k + YYYYMMDD + sha256(title|source|ts) 前 8 hex` | 设计文档 §3.2 示例的具体化，可复现、可校验 |
| D9 | 旧 header 别名 | 实现 `## 个人知识` / `## 项目知识` → 新桶的永久只读别名（约 2 行） | 本机暂无 v1.x 索引存量，但成本趋零，按 ADR 0008 §2 保险实现 |
| D10 | project 级知识根 | 首版只有个人根 `~/.evokit/knowledge/`；卡片 `scope` 字段支持 `project:<munge>` 值 | 设计文档未含双根扫描，避免 v1.x 双根复杂度；scope 元数据先留好 |
| D11 | inbox 生命周期 | distill 消费后**保留 30 天**（便于调 prompt 后重放），harvest 每次运行时清理超期文件 | 设计文档 §3.1「可删或保留 30 天」二选一 |
| D12 | codex 源解压内存 | 逐文件 `zstdDecompressSync` 全量解压、处理完即弃，峰值 ≈ 单文件解压后体积 | POC 已实测 74MB 源通过（设计文档 §14）；不做流式（标准库无流式 zstd） |

---

## 2. 技术方案

### 2.1 架构与数据流

```
12 个工具目录（只读）
   │ ① harvest：adapters × 8 + 水位线(state.json) + 脱敏(redact)
   ▼
~/.evokit/inbox/<source>/*.jsonl      ← RawEvent，保留 30 天
   │ ② distill：分批(project×时间窗) → codex→pi 两阶段(抽卡→裁决) → 解析容错
   ▼
~/.evokit/knowledge/.pending/*.md     ← 草稿闸门（draft）
   │ ③ review：manual 列表裁决 / assist 阈值自动 / auto 全自动 + --audit
   ▼
~/.evokit/knowledge/                  ← 独立 git，commit "learn: <title>"
   ├─ knowledge/*.md                  ← 原子卡片（draft→confirmed→retired）
   ├─ knowledge-index.md              ← ≤60 行可重建桶 + 未知段透传
   └─ references.jsonl                ← recall/L2/纠错 计数
   │ ④ recall：本地评分检索 ── ⑤ forge：tags 聚簇 ≥3 → SKILL.md → symlink
   ▼
knowledge-index 资源 → evokit sync → CLAUDE.md / APPEND_SYSTEM.md / AGENTS.md（托管块）
触发器：手动 learn ｜ 任务计划 02:00 ｜ Claude Code 钩子 hook learn-enqueue（入队，不执行）
```

### 2.2 代码改动地图

| 文件 | 改动 | 里程碑 |
| --- | --- | --- |
| `cli/src/paths.js` | + `KNOWLEDGE_DIR` / `KNOWLEDGE_INDEX_FILE` / `PENDING_DIR` / `REJECTED_DIR` / `INBOX_DIR` / `STATE_FILE` / `TRIGGERS_DIR` 常量 | M0 |
| `cli/src/defaults.js` | + `DEFAULT_SOURCES`、`DEFAULT_KNOWLEDGE`；`DEFAULT_RESOURCES` + `knowledge-index` 资源；`DEFAULT_PROMPTS` + `distillA` / `distillB` / `forge` / `audit` | M0–M2 |
| `cli/src/config.js` | `loadConfig` 返回 + `sources`（mergeById）+ `knowledge`（mergeByKey） | M0 |
| `cli/src/knowledge-cards.js` | 新增：frontmatter 受限解析/序列化（往返）、id 生成、校验、卡片 CRUD（append/retire/merge/conflictWith） | M0 |
| `cli/src/knowledge-index.js` | 新增：索引读写（可重建桶 / 未知段透传 / 旧 header 别名 / 行提取 / 预算滚动 / 悬空-孤儿检测） | M0 |
| `cli/src/state.js` | 新增：水位线读写、损坏自愈（备份→重建） | M1 |
| `cli/src/redact.js` | 新增：脱敏规则引擎（默认 7 类 + settings 扩充） | M1 |
| `cli/src/harvest/index.js` + `cli/src/harvest/adapters.js` | 新增：采集编排 + 8 适配器（P0×4 → P1×3 → P2 sqlite 另列） | M1 |
| `cli/src/distill.js` | 新增：分批器、执行者链（codex→pi）、委托调用、JSON 解析容错、orphan 落盘 | M2 |
| `cli/src/cluster.js` | 新增：tags Jaccard 聚簇 | M4 |
| `cli/src/commands/harvest.js` / `learn.js` / `review.js` / `recall.js` / `forge.js` / `knowledge.js` / `hook.js` | 新增命令 | M1–M5 |
| `cli/src/commands/index.js` / `cli/evokit.mjs` / `help.js` / `cli/README.md` | 命令表、KNOWN_COMMANDS、帮助文案同步 | 每里程碑 |
| `cli/test-local.mjs` | 追加测试段（≈45 组断言，见 §2.7） | 每里程碑 |
| `cli/src/fs-utils.js` / `syncers.js` / `agents-cli.js` / `remote.js` | **零改动**（索引走既有 text 同步器；委托复用 `detectAgentClis`/`runAgentCli`） | — |

### 2.3 数据契约落地

#### 2.3.1 RawEvent（`~/.evokit/inbox/<source>/<YYYYMMDD>-<hash8>.jsonl`）

沿用设计文档 §3.1 字段（`source/kind/project/ts/sessionId/text/meta`），补三条实现约束：

- 单事件 `text` 截断 ≤4KB（用户问题 + 最终答复摘要；`tool_use`/`tool_result` 大块不进 RawEvent）；
- 一条会话可产出多条 RawEvent（按轮次/按卡片），`meta.line` 指回原始行号；
- JSONL 逐行写、逐行读；单行畸形 → 跳过计数，不中断整个文件。

#### 2.3.2 知识卡片 frontmatter（`knowledge/*.md`）

字段 = 设计文档 §3.2 全集 + Q1 裁决新增：`related`（疑似重复旧卡）、`mergedInto`（被并卡指向 canonical）、`conflictWith`（结论相反互指）。

**受限 frontmatter 解析器规格**（唯一自制小件，~60 行，不引 js-yaml）：

- 仅扁平键 + 单层数组；数组支持 `[a, b]` 与逐行 `- x` 两种形态；值不解析嵌套对象；
- 未知键**保留不删除**（与未知 section 同纪律）；
- CRLF / UTF-8 BOM 容忍；写侧统一 LF、无 BOM；
- 校验：缺 `title`/`type`/`source`/`status` 拒绝；`confidence` ∉ [0,1] 拒绝；`type`/`status` 枚举校验；
- 必配**往返单测**：parse → serialize → parse 全等。

#### 2.3.3 索引文件（`knowledge-index.md`）契约

- 段结构：`## EvoKit 知识`（可重建桶）+ 任意未知段（如 `## 助手原生记忆`）**逐字透传**；
- 行格式：`- [k20261106-7f3a2c] ⚠ fnm 钩子内 node 不可用→用绝对路径 #node #hook`；提取规则 `/^- \[([^\]]+)\]/`（ADR 0008 对齐）；标记映射：`pitfall→⚠`、`pattern→🏛`、`workflow→🔧`、其余无前缀；
- 旧 header 永久别名：`## 个人知识` → EvoKit 桶、`## 项目知识` → 透传桶（读侧映射，写侧只出新 header）；
- 预算滚动（D7）：写入时行数 > `indexBudget(60)` 则按（最近引用 desc，confidence desc，updated desc）挤出，forge 父卡与 pitfall 加粘性；被挤出卡仍在库，L2/recall 可命中；
- 状态过滤：`draft`/`retired` 卡不进 L1 索引；
- 附带悬空/孤儿检测（索引行 id 无对应文件、文件无索引行），供 review 与体检输出。

#### 2.3.4 卡片状态机与合并/冲突语义

```
draft ──accept──▶ confirmed ──gc/过期──▶ retired(validUntil 置值)
   │                  │
   └─reject──▶ .rejected/（90 天）   confirmed ──merge──▶ retired(mergedInto=<canonical>)
```

- MERGE：保留 canonical，被并卡 `status: retired` + `mergedInto` + `validUntil` 置值；索引只留 canonical；git 可回滚；
- 结论相反 = 冲突不是重复：两张都保留，互设 `conflictWith`，review 强制人工裁决（或按 `validFrom` 新者优先，旧者置 `validUntil`）；
- 同主题不同侧面：都保留，共享 tag 簇（forge 原料）。

#### 2.3.5 references.jsonl（`knowledge/references.jsonl`）

追加事件 `{"ts","type":"recall|l2|review-update|forge-use","cardId","note?"}`；只追加、损坏行跳过；供索引滚动评分、forge 重复信号、月度体检「长期零引用 + 低置信度 = 归档候选」。

#### 2.3.6 state.json（`~/.evokit/state.json`）

```jsonc
{ "sources": { "<id>": { "lastRunAt": "...", "counts": { "events": 79, "files": 12, "skipped": 1 },
    "files": { "<绝对路径>": { "size": 123, "mtime": 1730..., "hash": "sha1-8", "cursor": 0 } } } } }
```

- 增量判定：路径 + size + mtime + hash 任一变化才重收割；
- 损坏自愈：JSON 解析失败 → 原文备份为 `state.json.bak-<ts>` → 视为空全量重扫（`.pending` 闸门保证重收割安全）。

#### 2.3.7 settings.json 新增块

```jsonc
{
  "sources": [ { "id": "claude-sessions", "adapter": "claude-projects", "root": "~/.claude/projects",
                 "enabled": true, "since": "2026-08-01" } /* …设计文档 §4.1 全表… */ ],
  "knowledge": {
    "automation": "manual",           // manual | assist | auto
    "autoThreshold": 0.9,
    "indexBudget": 60,
    "inboxRetentionDays": 30,
    "rejectedRetentionDays": 90,
    "distillAgentOrder": ["codex", "pi"],
    "batchMaxSessions": 8,
    "batchMaxPromptKB": 24,
    "forgeClusterMin": 3,
    "redact": { "extraPatterns": [] }
  }
}
```

`DEFAULT_SOURCES` 内置设计文档 §4.1 的 11 条（sqlite 两条 `enabled: false`）；用户 settings 覆盖同名 id。

### 2.4 关键流程设计

**learn 编排**（`commands/learn.js`）：
1. 消费 `~/.evokit/triggers/`（有则按 trigger 过滤 session）；2. `harvest`（复用 T-M1.5 同一函数）；3. `distill`（可 `--no-distill`）；4. `.pending` 非空 → 按 automation 档位处理并打印 review 提示；5. forge 聚簇检查（达标打印提示，auto 档可生成草稿）；6. 汇总报告（inventory 输出风格）。
失败降级：单源采集失败 → 计入报告继续；distill 执行者不可用 → 按 `distillAgentOrder` 降级，全不可用 → 输出 `--prompt` 模式提示（手动喂给任意 agent）；解析失败 → `orphan/`，绝不丢弃。

**distill 执行者链**：`codex → pi`（默认序，settings 可改）；**claude 不进自动链**（长 prompt 超时 bug，交接文档已确认），`--agent claude` 显式覆盖时可用并提示风险。每批 prompt ≤24KB、超时复用 agents-cli 默认 120s/批。

**recall 评分**：tag 全等 ×3 ＞ 标题子串 ×2 ＞ 正文子串 ×1；top `--limit`(默认 10)；每次命中写 references；`--json` 输出单个合法 JSON。

**forge 流程**：`forge`（无参）= 列出达标簇；`--from-tags a,b` / `--topic "…"` = 取卡拼 `prompts.forge` → 委托 agent → SKILL.md 草稿落 `~/.agents/skills/<name>/`（`status: trial` + `generation.json`，**不直接分发**）→ `evokit review --skill` 人工过目 → 通过后建 symlink（D5）+ `.skill-lock.json` 无损追加（D6）。`forge --audit`：trial 满期 0 uses / vetoed / 父卡大量失效 → 归档 `~/.agents/skills/.retired/<name>/` + 按 distributedTo 回收链接 + 提示「父卡失效需重审」。

**hook learn-enqueue**（M5）：`evokit hook learn-enqueue [--session <id>] [--json]` → 写 `~/.evokit/triggers/<ts>-<hash>.json` → exit 0。ADR 0007 纪律全套：Node 单实现；任何异常（目录缺失/磁盘满/未知错误）无条件 exit 0、错误只进 stderr；`--json` stdout 单 JSON（`{"ok":true,"queued":true}` / `{"ok":true,"queued":false,"error":"…"}` 区分 0 条与出错）。**安装方式 = 打印配置片段 + 文档，由用户自行合并进 `~/.claude/settings.json`，不自动改写工具配置**。

**knowledge init / gc**：`init` 建根（`knowledge/`、`.pending/`、`.rejected/`、`knowledge-index.md` 骨架、`git init` + `.gitignore`（`state.json` 不在库内）、README），并体检 `git user.name/email`（缺失 → 警告，后续 commit 跳过不致命）；`gc [--before <date>]` 把长期失效卡移入 `knowledge/.archive/`（不删除）。

### 2.5 CLI 命令面总表

| 命令 | 语义 | 关键参数 | 里程碑 |
| --- | --- | --- | --- |
| `evokit knowledge init` | 初始化知识根（git + 骨架 + 环境体检） | — | M0 |
| `evokit review` | 草稿清单 + 裁决（D4 非交互式） | `--list` / `--accept <id>` / `--reject <id>` / `--merge <id> <into>` / `--skill` / `--audit` | M0 骨架 → M2 完整 |
| `evokit harvest` | 只采集到 inbox | `--full` / `--source <id>` / `--dry-run` | M1 |
| `evokit learn` | harvest→distill→review 编排 | `--full` / `--no-distill` / `--agent <id>` / `--auto` / `--session <id>` | M2 |
| `evokit recall "<关键词>"` | 本地检索 + 计数 | `--limit n` / `--json` | M3 |
| `evokit forge` | 聚簇锻造 | `--topic` / `--from-tags a,b` / `--audit` | M4 |
| `evokit knowledge gc` | 显式归档失效卡 | `--before <date>` / `--dry-run` | M5 |
| `evokit schedule enable / disable / list` | 定时学习开关与查看（Windows 任务计划；enable 写包装脚本固定 cwd=~/.evokit 并读回验证，替代 T-M5.2 手工模板） | `--time HH:MM` / `--mode auto·assist` / `--task <name>` / `--json`（list） | M6 追加 |
| `evokit hook learn-enqueue` | 钩子入队（不执行 learn） | `--session <id>` / `--json` | M5 |

新增命令逐一同步：`KNOWN_COMMANDS`、switch、`commands/index.js`、`help.js`、`cli/README.md`（红线 #5）。

### 2.6 安全与隐私

- 脱敏双点：RawEvent 生成时 + 卡片入库前各过一遍；默认规则 7 类（`sk-[A-Za-z0-9]{8,}`、`AKIA[0-9A-Z]{16}`、`Bearer …`、`password|token|secret|api[_-]?key\s*[:=]`、内网地址/端口、`Authorization` 头、JDBC/连接串），settings 可扩充；规则设计须避免把含「token」一词的正常句子误伤（只匹配 key:value 形态）；
- 知识库 git 仓库**不配 remote**（`knowledge init` 时检查并警告）；`sync` 分发的索引只含标题摘要 + id，正文靠 L2 按需读；
- 委托 prompt 传给 agent 的内容同样先脱敏（agent CLI 可能留本地日志）。

### 2.7 测试方案（`cli/test-local.mjs` 追加）

复用既有手法：`EVOKIT_HOME` 隔离临时目录 + mock agent bin（codex stdin 测试已有先例）。计划新增测试段：

| 段 | 断言要点 | 里程碑 |
| --- | --- | --- |
| MT-A 配置层 | loadConfig 返回 sources/knowledge；mergeById/mergeByKey 新块行为；默认 settings.json 生成 | M0 |
| MT-B frontmatter | 往返全等（CRLF/BOM/两种数组/未知键/中文+emoji）；非法卡报错清单 | M0 |
| MT-C 索引 | **第三个手写 section 重建后逐字仍在**（硬验收）；旧 header 别名；行提取；预算滚动无抖动；悬空/孤儿检测 | M0 |
| MT-D 卡片操作 | merge 语义（canonical 保留/被并卡 retired/索引只留 canonical）；conflictWith；references 追加与损坏行容错 | M0 |
| MT-E 水位线 | 二跑 0 新增；--full 重置；state.json 损坏自愈 | M1 |
| MT-F 脱敏 | 7 类真实形态样例 → [REDACTED]；「token」一词不误伤；extraPatterns 生效 | M1 |
| MT-G 适配器 | 4+3 适配器 fixtures 解析计数；畸形行跳过；zstd 不可解跳过不失败 | M1 |
| MT-H distill | 三种输出（合法 JSON/逐块/垃圾）→ 入库/入库/orphan；分批器边界（9 会话 → 2 批；>24KB 截断拆批）；执行者降级链 | M2 |
| MT-I review | accept/reject/merge 全流程（隔离 HOME）；assist 阈值边界（0.89 留审 / 0.90 自动）；--audit 输出 | M2 |
| MT-J recall/索引资源 | 评分排序；references 计数；sync 后三入口托管块含索引且块外原样 | M3 |
| MT-K forge | 聚簇边界（共享 2 tag 触发 / 1 tag 不触发）；SKILL.md 落盘与 generation.json；audit 退役回收链接 | M4 |
| MT-L 钩子 | 异常路径全 exit 0；--json stdout 单 JSON；triggers 消费后删除；堆栈不进 stdout | M5 |
| MT-M 命令表 | 所有新命令出现在 KNOWN_COMMANDS、switch、help 文案中（防漏改，红线 #5 的回归断言） | 每里程碑 |

### 2.8 性能与体量预算

- 新增代码 ≈1500–2500 行（设计文档 §14 结论不变）；全量收割 258MB 会话史 ≈1–3 分钟，瓶颈在磁盘 I/O 与委托 LLM 延迟，语言性能无虞；
- zstd 解压峰值 ≈ 单文件解压后体积（D12，逐文件即弃）；
- 内存检索（tags 倒排 + Jaccard）1 万张卡 <100ms，不做 embedding。

---

## 3. 任务拆分

> 任务卡字段：改动 / 要点 / 验收（可运行）/ 预估 / 依赖。每任务一个 commit。预估按「人 + AI 协作」工时。

### 3.0 前置

#### T-0.1 分支、基线与立项文档入库
- 改动：建 `feature/3.0-memory-engine`；提交 `docs/zh/MEMORY-ENGINE-DESIGN.md` + 本计划 + `scripts/check-docs-sync.mjs` 豁免行（工作区已有改动）。
- 要点：设计文档头部注明「留待作者审阅后提交」——**入库前需作者确认**（见开放问题 ①）。
- 验收：`node scripts/check-docs-sync.mjs` 通过；`node cli/test-local.mjs` 126 通过；`git log --oneline -2` 含两个 docs commit。
- 预估 0.5h；依赖：作者确认。

#### T-0.2 ADR 0009「v3 知识根契约」
- 改动：新增 `docs/adr/0009-knowledge-root-v3.md`，状态「已接受」，说明取代（Supersede）0008；记录未知 section 透传、旧 header 别名、`- [id] 摘要` 行格式、60 行预算滚动、个人根单根（D10）在 JS 版的复活与差异。
- 要点：**正文避免出现「推后 / 推迟 / deferred / Won't-do / 不在本版本」等触发词**——`scripts/check-adr-roadmap.mjs` 会对非 Superseded ADR 的此类行强制要求恢复 ROADMAP.md 登记；P2 储备项写本计划 §3.7，不写 ADR。
- 验收：`node scripts/check-adr-roadmap.mjs` 通过；ADR 0008 与 0009 交叉引用一致。
- 预估 0.5h；依赖：T-0.1。

### 3.1 M0 地基（预估 ≈1 个工作日）

#### T-M0.1 路径、默认值与配置层
- 改动：`paths.js`（7 个常量）、`defaults.js`（`DEFAULT_SOURCES`/`DEFAULT_KNOWLEDGE`）、`config.js`（两处合并）。
- 验收：MT-A 全绿（隔离 HOME 下 loadConfig 含新块；默认 settings.json 生成含 `sources`/`knowledge`）。
- 预估 1h；依赖：T-0.2。

#### T-M0.2 frontmatter 读写器（`knowledge-cards.js`）
- 要点：§2.3.2 规格全项；id 生成（D8）。
- 验收：MT-B 全绿（≥6 组往返用例 + 非法卡清单）。
- 预估 2h；依赖：T-M0.1。

#### T-M0.3 索引读写器（`knowledge-index.js`）
- 要点：可重建桶重建、未知段逐字透传、旧 header 别名、行提取、预算滚动（D7）、悬空/孤儿检测。
- 验收：MT-C 全绿——**「第三个手写 section 在重建索引后逐字仍在」为第一硬验收**（ADR 0008 验收 1 复活）；别名读写；60 行滚动稳定。
- 预估 2.5h；依赖：T-M0.1。

#### T-M0.4 卡片操作与引用计数
- 要点：append / retire / merge（§2.3.4）/ conflictWith；`references.jsonl` 追加器。
- 验收：MT-D 全绿（merge 后索引只留 canonical；references 损坏行不致命）。
- 预估 1.5h；依赖：T-M0.2、T-M0.3。

#### T-M0.5 `knowledge init` + `review` 骨架 + 命令表同步
- 要点：init（§2.4）；`review --list` 骨架；`KNOWN_COMMANDS`/switch/`commands/index.js`/`help.js`/`cli/README.md` 五处同步。
- 验收：`node cli/evokit.mjs knowledge init` 在隔离 HOME 产出目录树；git 身份缺失仅警告；`evokit help` 含新命令；`node cli/test-local.mjs` 126 + 新增全绿；`evokit revie`（故意拼错）能猜到 `review`。
- 预估 1.5h；依赖：T-M0.4。

### 3.2 M1 收割（预估 ≈1.5 个工作日）

#### T-M1.1 水位线（`state.js`）
- 验收：MT-E（fixtures 二跑 0 新增；`--full` 重置；state.json 损坏 → 备份 + 重建）。
- 预估 1h；依赖：T-M0.5。

#### T-M1.2 脱敏引擎（`redact.js`）
- 要点：默认 7 类 + `knowledge.redact.extraPatterns`；双点调用接口 `redact(text)`。
- 验收：MT-F（真实形态密钥样例全中；「token」一词不误伤；扩充规则生效）。
- 预估 1.5h；依赖：T-M0.1（可与 T-M1.1 并行）。

#### T-M1.3 P0 适配器 ×4（`harvest/adapters.js`）
- 要点：`claude-projects`（跳过 `isMeta`/`isSidechain`、`cwd`→project、text ≤4KB）、`codex-rollout`（zstd，不可解单文件跳过计数）、`memory-cards`（Qoder/CodeArts 直通 `kind=memory-card`）、`trae-session-memory`（intent/actions/outcome/learned → 卡片映射）。
- 验收：MT-G 前半（POC fixtures 计数对齐：claude/codex/trae/qoder 各源有数；zstd 解不开计入 skipped）。
- 预估 3h；依赖：T-M1.1、T-M1.2。

#### T-M1.4 P1 适配器 ×3
- 要点：`jsonl-fields`（claude history）/ `pi-sessions` / `daily-log`（workbuddy）；统一「畸形行跳过」。
- 验收：MT-G 后半。
- 预估 1h；依赖：T-M1.3。

#### T-M1.5 `harvest` 命令编排
- 要点：sources 合并读取、`enabled:false` 跳过并标注、`--source`/`--full`/`--dry-run`、进度报告（inventory 输出风格）、水位线更新、inbox 30 天清理（D11）。
- 验收（里程碑级，真机）：`node cli/evokit.mjs harvest` 输出 7 源计数报告；对 inbox 抽检 grep 密钥规则 **0 泄漏**；二次运行 **0 新增**；sqlite 源显示「未启用」。
- 预估 2h；依赖：T-M1.4。

### 3.3 M2 提纯闭环（预估 ≈1.5 个工作日）

#### T-M2.1 distill 提示词（`defaults.js`）
- 要点：`distillA`（抽卡：只提可复用知识/每卡字段/忽略一次性调试）+ `distillB`（裁决：ADD/UPDATE/MERGE/NOOP + 严格 JSON）；两条模板均含红线 #9 约束与「无密钥」要求。
- 验收：`--prompt` 模式可导出两段模板；约束条目逐条在模板中。
- 预估 1h；依赖：T-M0.5。

#### T-M2.2 分批器（`distill.js` 上半）
- 要点：project × 时间窗；≤8 会话 / ≤24KB（超限截断拆批）；单批 ≤10 卡上限写入 prompt。
- 验收：MT-H 分批断言（30 会话 → 批次数与大小正确）。
- 预估 1h；依赖：T-M2.1。

#### T-M2.3 distill 引擎（`distill.js` 下半）
- 要点：执行者链 codex→pi（claude 缺席 + 报告说明）；`--agent` 覆盖；解析容错三段（整体 JSON → 逐块 `{...}` 提取 → `orphan/`）；每卡 source 回填 + **source 必须命中水位线文件清单**（防幻觉来源，打可疑标记）。
- 验收：MT-H 委托断言（mock agent 三种输出 → 入库/入库/orphan；orphan 内容完整）。
- 预估 2.5h；依赖：T-M2.2、T-M1.5。

#### T-M2.4 `.pending` 闸门 + review 完整实现（manual 档）
- 要点：review 列表（草稿摘要 + `related` 疑似重复提示）；`--accept`（写库 + 索引重建 + `git commit -m "learn: <title>"`，身份缺失警告跳过）/ `--reject`（→`.rejected/`）/ `--merge`（§2.3.4）。
- 验收：MT-I 前半（隔离 HOME 全流程走通；merge 语义正确；`.rejected/` 保留）。
- 预估 3h；依赖：T-M2.3。

#### T-M2.5 assist / auto 档 + `--audit`
- 要点：assist = `confidence ≥ autoThreshold` 且裁决 ADD 自动入库，其余留审；auto = 全自动入库；`review --audit` 列出近 N 条自动入库供抽查（git diff 兜底）。
- 验收：MT-I 后半（阈值边界 0.89 留审 / 0.90 自动；auto 档仍走 git commit）。
- 预估 1.5h；依赖：T-M2.4。
- **里程碑级验收（真机）**：用 EvoKit 开发会话史（WorkBuddy worktree 113 个会话中抽 10 个）跑通首闭环——产出 ≥10 张卡、重复卡被 MERGE、`git log` 可回滚。

### 3.4 M3 分发（预估 ≈1 个工作日）

#### T-M3.1 `knowledge-index` 内置资源 + 预算
- 要点：`DEFAULT_RESOURCES` 增条目（源 `~/.evokit/knowledge/knowledge-index.md` → 三入口）；源文件不存在时 sync 跳过并提示（不报错）；裁剪在索引写侧完成（同步器零改动）。
- 验收：MT-J 前半（隔离 HOME `evokit sync` 后三入口托管块含 ≤60 行索引，块外内容逐字原样）。
- 预估 2h；依赖：T-M0.5。

#### T-M3.2 AGENTS.md 输出目标 spike
- 要点：核验 Cursor / Gemini CLI / VS Code / Copilot 对**家目录级与项目根** AGENTS.md 的读取行为（官方文档 + 实机）；结论写入本计划附录 A。
- 纪律：未核验的通道不定级、不承诺（ADR 0006 既有立场）；核验通过才新增 agent 条目。
- 验收：附录 A 有结论与证据链接；`node scripts/check-docs-sync.mjs` 仍通过。
- 预估 2h；依赖：T-0.1（可与 M2 并行）。

#### T-M3.3 `recall` 命令
- 要点：评分检索（tag×3 / 标题×2 / 正文×1）、`--limit`/`--json`、命中写 references。
- 验收（里程碑级，真机）：`recall fnm` 命中 M2 卡片；`--json` 单 JSON；无命中 exit 0 + 友好提示。
- 预估 2h；依赖：T-M0.4、T-M2.4。

### 3.5 M4 锻造（预估 ≈1 个工作日）

#### T-M4.1 聚簇器（`cluster.js`）
- 要点：confirmed 且 `type ∈ {workflow, pattern}` 的卡，tags Jaccard ≥0.5 归簇，簇 ≥`forgeClusterMin(3)` 触发；`learn` 尾部报告达标簇。
- 验收：MT-K 前半（簇边界用例：共享 2 tag 触发、1 tag 不触发、retired 不计入）。
- 预估 1h；依赖：T-M2.4。

#### T-M4.2 forge 生成链（`commands/forge.js`）
- 要点：`--from-tags` / `--topic` 取卡拼 `prompts.forge`（含 skill-creator 形态要求：frontmatter `name`+`description` 触发时机、正文渐进披露、允许 scripts/references）→ 委托 agent → 草稿落 `~/.agents/skills/<name>/` + `generation.json`（`status: trial`，parentCards）。agent 失败不落半成品。
- 验收：MT-K 中段（mock agent 产出合法 SKILL.md 落盘 + parentCards 正确；失败路径干净报错）。
- 预估 2h；依赖：T-M4.1、T-M2.3 的委托复用。

#### T-M4.3 `review --skill` + 分发 + skill-lock
- 要点：人工过目 → 通过后建 symlink（D5，复用 `makeSymlink` 的 junction 回退）+ `distributedTo` 回写 + `.skill-lock.json` 无损追加（D6）。
- 验收（里程碑级，真机）：**Claude Code 实机可见并可触发该技能**；`.skill-lock.json` 解析仍合法（若 schema 不兼容则已跳过并提示）。
- 预估 2h；依赖：T-M4.2。

#### T-M4.4 试用期与退役（`forge --audit`）
- 要点：trial 满期 0 uses / vetoed / 父卡大量 `validUntil` 失效 → 归档 `.retired/` + 按 `distributedTo` 回收链接 + 父卡失效提醒。
- 验收：MT-K 后半（构造过期 trial → 链接移除、目录归档、可手工恢复）。
- 预估 1.5h；依赖：T-M4.3。

### 3.6 M5 自动化（预估 ≈1 个工作日）

#### T-M5.1 钩子入队 + triggers 消费
- 要点：`hook learn-enqueue`（§2.4，ADR 0007 纪律全套）；`learn` 启动时消费并删除 triggers。
- 验收：MT-L 全绿（异常路径全 exit 0；`--json` stdout 单 JSON；堆栈不进 stdout）。
- 预估 2h；依赖：T-M2.5。

#### T-M5.2 Windows 任务计划模板
- 改动：`scripts/schedule/register-nightly-learn.ps1`（`schtasks /Create /TN "EvoKit Learn" /SC DAILY /ST 02:00 /TR "node <绝对路径>\cli\evokit.mjs learn --auto"`）+ README 安装/卸载说明；**不自动注册**。
- 要点：路径取安装时解析的绝对路径（ADR 0007 §5 的教训：不依赖运行期 PATH 上的 node）。
- 验收：模板 `-WhatIf` 干跑通过；文档含查询/删除命令。
- 预估 1h；依赖：T-M2.5。

#### T-M5.3 references 完善 + inventory 体检扩展
- 要点：L2 读正文约定的计数入口（约定路径 `knowledge/<id>.md`，由索引行 id 推导）；`inventory` 在知识根存在时把 `knowledge/*.md` 清单并入审计输入（六区块体检，月度跑）。
- 验收（里程碑级，真机）：`inventory` 报告含知识库区块；连续 7 天夜间自动学习无人工干预、无重复条目增长、git 提交序列可审计。
- 预估 2h；依赖：T-M3.3。

### 3.7 P2 储备（不在本轮承诺）

| 任务 | 内容 | 触发条件 |
| --- | --- | --- |
| T-P2.1 | sqlite 适配器 ×3（AutoClaw / Trae SOLO / opencode），`node:sqlite` 只读（本机已实测读出 102 张表） | 需要这三源经验时 |
| T-P2.2 | 原生记忆回写（`~/.codex/memories/raw_memories.md`、`~/.codeium/memories/global_rules.md`，托管块纪律） | 工具原生记忆确有消费方时 |
| T-P2.3 | `discover` 命令（新工具记忆目录探测 + 适配器接入指引） | 接入第 13 个工具时 |
| T-P2.4 | MCP 记忆服务 SP-spike（跨工具挂载可行性） | L2/recall 不够用时 |
| T-P2.5 | 两份立项文档的英文镜像（docs/en/） | v3.0 发布前（开放问题 ①） |

### 3.8 依赖关系与关键路径

```
T-0.1 → T-0.2 → T-M0.1 → {T-M0.2, T-M0.3} → T-M0.4 → T-M0.5
   → M1: {T-M1.1 ∥ T-M1.2} → T-M1.3 → T-M1.4 → T-M1.5
   → M2: T-M2.1 → T-M2.2 → T-M2.3 → T-M2.4 → T-M2.5        （T-M3.2 可自 T-0.1 起并行）
   → M3: {T-M3.1 ∥ T-M3.3}                                  （recall 依赖 M2.4）
   → M4: T-M4.1 → T-M4.2 → T-M4.3 → T-M4.4
   → M5: {T-M5.1 ∥ T-M5.2 ∥ T-M5.3}
```

关键路径 = T0 → M0 → M1 → M2 → M4 → M5；M3 与 M4 可并行（ recall 仅依赖 M2）。

### 3.9 工作量汇总

| 里程碑 | 内容 | 任务数 | 预估 |
| --- | --- | --- | --- |
| 前置 | 分支 / ADR 0009 | 2 | 1h |
| M0 地基 | 知识根读写契约 | 5 | ≈1 天 |
| M1 收割 | 适配器 + 水位线 + 脱敏 | 5 | ≈1.5 天 |
| M2 提纯闭环 | distill + review 三档 | 5 | ≈1.5 天 |
| M3 分发 | 索引资源 + recall | 3 | ≈1 天 |
| M4 锻造 | forge 全链 | 4 | ≈1 天 |
| M5 自动化 | 钩子 + 任务计划 + 体检 | 3 | ≈1 天 |
| **合计** | | **27** | **≈7 个工作日**（与设计文档 §10 的 6–9 天吻合） |

M0–M2 完成即有实用价值（经验不再散失），可在此提前收敛一次；M3 后「供后续工具使用」成立；M4/M5 是自动进化。

---

## 4. 里程碑验收总表（对照设计文档 §10）

| 里程碑 | 验收标准（设计文档原文要求） | 落点任务 |
| --- | --- | --- |
| M0 | 第三个手写 section 重建后逐字仍在；126 个现有测试不回归 | T-M0.3（硬验收）、T-M0.5 |
| M1 | 真机 7 源计数报告；无密钥泄漏（抽检）；二次运行 0 新增 | T-M1.5 |
| M2 | 首闭环 ≥10 张卡；重复卡被 MERGE；git 历史可回滚 | T-M2.5 里程碑验收 |
| M3 | sync 后三入口均含 ≤60 行索引托管块；`recall fnm` 命中 | T-M3.1、T-M3.3 |
| M4 | ≥3 张同主题卡 → SKILL.md 草稿 → Claude Code 内可发现与触发 | T-M4.3 |
| M5 | 连续 7 天夜间自动学习无人工干预、无重复增长、git 序列可审计 | T-M5.3 |

---

## 5. 实施风险补充（设计文档 §11 之外的代码层风险）

| 风险 | 对策 |
| --- | --- |
| 新命令漏改 `KNOWN_COMMANDS` / help | MT-M 回归断言 + 每任务卡验收含 `evokit help` 检查（红线 #5） |
| frontmatter 解析器边界（CRLF、BOM、数组含逗号/引号、中文 emoji） | 往返单测强制（MT-B），写侧统一 LF 无 BOM |
| zstd 大文件内存峰值 | 逐文件解压即弃（D12）；POC 已实测 74MB 通过；超预期再谈分片 |
| 委托 agent 幻觉卡片来源 | source 必须命中水位线文件清单（T-M2.3），否则打可疑标记留审 |
| review 在管道/CI 环境退化 | D4 非交互式设计（无 REPL）；`--list` 纯输出可脚本化 |
| 知识库 git 身份未配置 | `knowledge init` 体检 + commit 缺身份时警告跳过，卡片照写（不致命） |
| 用户手写 settings 与新默认块冲突 | mergeById/mergeByKey 语义单测（MT-A）；「base 有 override 无 → 保留」已有既有行为背书 |
| Windows symlink 权限 | 复用 fs-utils 的 junction 回退（v2.0 symlink 资源已投产） |
| `.skill-lock.json` schema 变化 | D6 无损追加前置校验，不兼容跳过不破坏 |

---

## 6. 开放问题（均有默认值，不阻塞开工）

1. **立项文档入库与翻译时机**：两份中文文档默认随 T-0.1 提交（设计文档头部注明待作者审阅，需作者一句话确认）；英文镜像默认 v3.0 发布前补译（T-P2.5）。若希望提前补译，请指出。
2. **M5 钩子宿主范围**：设计文档只提 Claude Code SessionEnd/Stop。默认 M5 仅接 Claude Code（入队模式），Pi/Codex 钩子登记 P2 储备；若需首版三宿主全覆盖，M5 加 0.5 天。
3. **夜间窗口与档位**：任务计划默认 `02:00` + `learn --auto`（设计文档 §9 的 CodeArts 夜间窗口思路）。若希望夜间跑 `--assist` 而非全 auto（更保守），模板参数一行可改。

---

## 附录 A：AGENTS.md 输出目标 spike 结论（T-M3.2 已收口，2026-11-06 实读核验）

> 结论：**不新增任何家目录级 AGENTS.md 条目，M3 无需代码改动**。家目录级 AGENTS.md 仅 Codex CLI 一家读取（`~/.codex/AGENTS.md`，已是 v2.0 既有 agent 目标）；其余工具的家目录记忆文件均为专有格式（`~/.claude/CLAUDE.md`、`~/.gemini/GEMINI.md`、`~/.copilot/copilot-instructions.md`、`~/.trae/user_rules`），写 `~/.xxx/AGENTS.md` 会被无视。

| 工具 | 家目录级 AGENTS.md | 项目根 AGENTS.md | 多层级语义 | EvoKit 裁定 |
| --- | --- | --- | --- | --- |
| Codex CLI | **是**（唯一） | 是 | 根→cwd 逐层拼接、越近越覆盖；32KiB 上限 | 既有目标已覆盖；索引 ≤60 行设计正好契合截断限制 |
| Cursor | 否 | 是 | 根+子目录组合、就近优先 | 用户可在 settings 自加 project 目标（零代码） |
| Copilot (VS Code/CLI/远程) | 否 | 是（GA） | 按 harness 组合、无统一优先序；嵌套多为实验开关 | 同上，项目根单文件是可靠通道 |
| Qoder | 否 | 是 | 未说明 [未核验]；rules 冲突时压过 AGENTS.md | 同上；注意 100k 字符上限 |
| Trae | 否 | 是，但需用户开 Import 开关 | 子目录就近触发 | 写根 AGENTS.md 需文档提示开开关；或走原生 `.trae/rules/` |
| Gemini CLI | 否（家目录是 GEMINI.md） | 默认否，需 `context.fileName` 配置 | 三层全拼接、无覆盖 | 不写 AGENTS.md；需要时写 GEMINI.md（用户配置） |
| Claude Code（对照） | 否 | 有条件：cwd 及以上无任何 CLAUDE.md 才读 | 同 CLAUDE.md 机制拼接 | 主通道是 CLAUDE.md（既有）；AGENTS.md 会被 CLAUDE.md 整体遮蔽，勿依赖 |

**对 v3 的落地裁定**：① L1 全局索引分发维持既有三入口（CLAUDE.md / APPEND_SYSTEM.md / ~/.codex/AGENTS.md），零改动；② 项目级 AGENTS.md（Cursor/Copilot/Qoder）由用户在 settings.json 的 agents 块加 `project: 'AGENTS.md'` 条目即可，EvoKit 机制已支持，不进默认配置；③ 知识索引只写项目根一层，不依赖嵌套覆盖语义（各家实现差异大，详见核验记录）。核验方法与逐工具证据链接见子代理调研存档（.zwork/runs/30d6f71f/2-研究员.md），引用时以各工具官方文档为准。
