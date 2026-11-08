# EvoKit 记忆引擎（v3）设计方案
## 记忆提纯 · 持续自动学习 · 技能自生成

> 基于 2026-11-06 对本机 12 个 AI 工具记忆存储的实测盘点 + 公开方案调研。
> 目标：让 EvoKit（`C:\zy\project_other\ai-projects\EvoKit`，v2.0 零依赖偏好同步 CLI）长出「经验层」——把分散在各个 agent IDE 文件夹里的记忆/经验提纯成统一知识库，持续自动学习，并自动沉淀成适合自己的 skill。
> 本文档于 2026-11-06 由 AutoClaw 会话产出，已随立项入库（commit 81d35f2）。
> **实施状态（2026-11-08）**：本方案已实现并真机验收——T-0/M0–M5 全部落地，实施中追加 M6 定时学习管理（`evokit schedule enable/disable/list` + `learn --assist`）与三项改进（F1 草稿间合并、F2 入库后自动分发索引、P4 报错文案明确化）；九套测试 774 断言全绿。与设计的已知差异：sqlite 适配器、`discover`、MCP 记忆服务仍为 P2 储备；钩子宿主首版仅 Claude Code（入队模式）。命令面与行为以 [`cli/README.md`](../../cli/README.md) 为准，任务拆分与完成状态见 [`MEMORY-ENGINE-IMPLEMENTATION-PLAN.md`](MEMORY-ENGINE-IMPLEMENTATION-PLAN.md)，关键裁决见 [`docs/adr/0009`](../adr/0009-knowledge-root-v3.md)。
> harvest 阶段已由零依赖 POC 脚本实机验证（7 源 79 事件、首批 21 张种子卡片、水位线增量与脱敏生效）；
> 技术栈评估（§14）含 Node 24 本机实测结论。POC 产物保留在会话工作区，M1 落地时作参照。

---

## 0. TL;DR

1. **规则层已经打通**（`evokit sync` 管理 3 个入口文件的托管块），缺的是**经验层**：约 300MB 的会话历史和 7 个工具各自为政的「显式记忆」无人收割。
2. 给 EvoKit 加一条**五级流水线**：`harvest（收集）→ distill（提纯）→ review（确认）→ knowledge（知识库）→ recall / forge（分发/锻技能）`。LLM 环节全部委托本机已有的 agent CLI（复用 `agents-cli.js`，与 inventory 同机制），EvoKit 本体保持「无 AI 的管道工」。
3. **持续自动学习** = 流水线定时/钩子触发 + 增量水位线 + `.pending` 草稿闸门（人在环可降级为全自动）+ 知识库 git 版本化。
4. **自动生成 skill** = 同主题知识卡片聚簇达标 → 委托 agent 生成 SKILL.md → review → 沿用现有 symlink 资源机制分发到各工具 skills 目录。本机已有两个先例：CodeArts Doer 的 `evolve` 模块、Gemini CLI 的 Auto Memory（官方实验特性，同思路）。
5. 零依赖红线不破：不引 embedding / 数据库 / MCP server / 常驻进程。codex 会话的 zstd 用 Node 24 内置 zlib 解；sqlite 源（AutoClaw/Trae SOLO/opencode）列为 P2 可选。

---

## 1. 现状盘点：12 个工具的记忆分散地图（本机实测）

### 1.1 三层模型

| 层 | 内容 | 现状 |
| --- | --- | --- |
| **规则层**（怎么干活） | CLAUDE.md / AGENTS.md / APPEND_SYSTEM.md、各工具 rules | ✅ 已由 evokit sync 打通（3 入口托管块）；可加 AGENTS.md 标准输出扩大覆盖 |
| **显式记忆层**（工具自己记的经验） | 各工具私有 memory 目录 | ❌ 7 套格式各自为政，互相看不见 |
| **会话历史层**（原始经验） | 各工具 session 文件 | ❌ 约 300MB，从未被提纯，随时间膨胀 |

### 1.2 全工具清单

| 工具 | 类型 | 记忆/会话位置 | 格式与形态 | 体量 | 收割价值 |
| --- | --- | --- | --- | --- | --- |
| Claude Code | CLI | `~/.claude/projects/<项目路径 munge>/<sessionId>.jsonl`（+`subagents/`） | JSONL：`type: user/assistant/system`，含 `cwd/gitBranch/timestamp/sessionId` | 375 文件 / **184MB** / 167 会话 | ★★★ 最大原始经验库 |
| Claude Code | CLI | `~/.claude/history.jsonl` | 用户 prompt 流 `{display, project, sessionId, timestamp}` | 524KB | ★★ 提炼「常问什么」 |
| Codex | CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl.zst` | **zstd 压缩** JSONL（Node≥23.8 内置 `zlib.zstdDecompressSync` 可解） | 88 文件 / **74MB** | ★★★ |
| Codex | CLI | `~/.codex/memories/`（git 仓库） | raw_memories.md + `extensions/ad_hoc` 笔记（自带合并纪律：笔记必须被整合、永不删除） | ≈0（刚建） | ★ 可作为分发目标 |
| Pi | CLI | `~/.pi/agent/sessions/<munge>/`、`sessions-archive/`、`missions/index/*.json` | JSONL + mission JSON | 52MB | ★★ |
| opencode | CLI | `~/.local/share/opencode/opencode.db`（sqlite）+ `storage/`、`tool-output/` | sqlite + 文件 | 24MB | ★ P2（sqlite 依赖） |
| Cursor | IDE | `~/.cursor/projects/**`；项目内 `.cursor/rules/*.mdc`（frontmatter 必须，纯 .md 被忽略） | 轻量 JSON | 0.2MB | ★ 规则文件更有价值 |
| Windsurf/Codeium | IDE | `~/.codeium/memories/global_rules.md`、`cascade/` | 空 | ≈0 | （闲置） |
| **Trae CN** | IDE | `~/.trae-cn/memory/projects/<munge>/YYYYMMDD/session_memory_*.jsonl` + `topics.md` | **已蒸馏**：`{intent, actions[], outcome, learned[], 时间}` | 9 文件 | ★★★ 现成的卡片范本 |
| Trae SOLO CN | IDE | `AppData/Roaming/TRAE SOLO CN/ModularData/ai-agent/database.db` | sqlite | ~13MB | ★ P2 |
| **Qoder / Qoder CN** | IDE | `~/.qoder(-cn)/memory/feedback-*.md` + `MEMORY.md` + `user-profile.md`；`plans/*.md`；项目内 `.qoder-credits/`（canvas 报告） | **已蒸馏**：一文件一主题的反馈卡 | 数十个文件 | ★★★ 直接可并入知识库 |
| **CodeArts Doer** | IDE | `~/.codeartsdoer/memory/<munge-project>/{MEMORY.md, user_preferences.md, spec_driven_workflow.md,…}` + `.extraction-state.json` 等状态文件；`evolve/skill_evolution_workspace/generated-skills`；项目内 `.codeartsdoer/{AGENTS.md, rule/, skills/, specs/}` | 按项目组织的记忆卡 + **内置经验采集/反思配置**（`mem-exp-config.json`：00:00–06:00 定时窗口）+ **技能进化模块** | 中 | ★★★ 同类机制先例 |
| **AutoClaw** | 桌面 Agent | `AppData/Roaming/AutoClaw-official/accounts/<hash>/runtime/runtime.sqlite` + `projects/<名>/.zwork/runs/*.md`（子代理产物）+ Memory 条目 | sqlite + markdown | ~10MB | ★★ P2（sqlite）/ runs 可直接读 |
| WorkBuddy | 工具 | 项目内 `.workbuddy/memory/YYYY-MM-DD.md` | 结构化日报（任务/动作/关键修正） | 小 | ★★ 现成经验流 |

技能侧（forge 的分发面）：`~/.agents/skills`（44 个，`.skill-lock.json` v3 记录 GitHub 来源）→ 软链到 `~/.claude/skills`（43 条链）等；Codex/Cursor/Trae/CodeArts 各有自己的 skills 目录。**skill-creator 技能已存在于本机**，生成流程有现成参照。

### 1.3 关键洞察

1. **各家都在自建记忆，但互不相通**：Qoder 的 feedback 卡、CodeArts 的按项目 MEMORY.md、Trae 的 session_memory、Claude Code 的 auto memory、Gemini CLI 的 Auto Memory——同一类东西七套格式。碎片化正是 EvoKit 的机会：它已经是用户信任的「单一事实源」管理者，经验层天然该长在这里。
2. **最好的提纯范本就在本机**：Trae 的 `session_memory` 四字段（intent/actions/outcome/learned）和 Qoder 的一题一卡 feedback-*.md，就是知识卡片该有的样子——目标格式向它们对齐，收割时还能直接映射。
3. **调研确认方向正确**：规则侧收敛到 [AGENTS.md](https://agents.md/) 开放标准（60k+ 项目采用，Codex/Cursor/Gemini CLI/VS Code 等直接读取）；记忆侧共识是「**抽取 → 与旧记忆比对 → LLM 裁决 ADD/UPDATE/DELETE/NOOP**」两阶段范式（[mem0 论文](https://arxiv.org/abs/2504.19413)）；知识分类用语义/情景/程序性三分法（[LangMem](https://docs.langchain.com/oss/python/concepts/memory)）——事实进入口文件、过程沉淀为 skill、局部约束进路径规则。EvoKit 现状只做了第一层分发，「历史会话→知识」的提纯层是公认缺口。
4. **自动学习+自动生成技能有官方先例**：[Gemini CLI Auto Memory](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/auto-memory.md)（后台挖掘历史会话，提议持久记忆更新与 Agent Skills）；本机 CodeArts 的 `evolve` 模块已在跑同类机制。EvoKit 做的是把它们+七家私有记忆统一收编。

---

## 2. 目标架构

```
┌─────────────────────────── 12 个工具（只读收割）───────────────────────────┐
│ claude│codex│pi│opencode│cursor│windsurf│trae│trae-solo│qoder│codearts│autoclaw│workbuddy │
└──────────────────────────────┬────────────────────────────────────────┘
                               │ ① harvest（采集器适配器，只读+水位线增量+脱敏）
                               ▼
                    RawEvent 流（统一中间格式，暂存 ~/.evokit/inbox/）
                               │ ② distill（委托本机 agent CLI：codex/pi）
                               │    两阶段：抽卡 → 与既有条目比对裁决
                               ▼
                    ~/.evokit/knowledge/.pending/   ← 草稿闸门
                               │ ③ review（人在环；assist/auto 两档自动）
                               ▼
              ┌────── 知识库 ~/.evokit/knowledge/（git 版本化）──────┐
              │  knowledge/*.md（原子卡片） + knowledge-index.md      │
              └──────────────┬───────────────────────┬──────────────┘
             ④ recall（分发）│                       │ ⑤ forge（锻造）
    knowledge-index 同步进各 │                       │  同主题卡片聚簇≥N
    入口托管块（复用 sync）  │                       │  → 委托生成 SKILL.md
    + AGENTS.md 标准输出    │                       │  → review → symlink 分发
                               ▼                       ▼
                 各工具入口文件（L1 常驻索引）      ~/.agents/skills/（44+ 技能源）
                 L2：索引行带路径，AI 自行 Read     → 各工具 skills 目录实时生效
```

### 设计原则（继承 v2.0 与 v1.x ADR 的血泪教训）

1. **零运行时依赖**：纯 Node≥18/24 标准库；zstd 用内置 zlib，sqlite 源不做 P0。
2. **LLM 全部外委**：提纯/裁决/生成 skill 都调本机 claude/pi/codex CLI（复用 `agents-cli.js`）；EvoKit 自身可测试、可离线、无 API key。
3. **只动托管块、永不整文件覆盖**；未知内容（无法解析的段落/条目）**只保留不删除**（ADR 0008 的 P0 教训）。
4. **草稿闸门**：一切写入知识库的动作先进 `.pending`，确认后生效；知识库根 `git init`，所有变更可回滚。
5. **可追溯**：每张卡片带 `source`（工具:文件[:行]）；每个生成的 skill 带父卡片 id 列表。
6. **过期不删除**（双时态）：`validUntil` 置值即失效，物理清理只由显式的 `evokit knowledge gc` 做。
7. **默认人在环，自动要显式开**：三档自动化（见 §6），默认 manual。

---

## 3. 数据契约

### 3.1 RawEvent（采集器 → 提纯器的中间格式）

```jsonc
{
  "source": "claude",              // 采集器 id（sources 块里的 key）
  "kind": "session",               // session | history | memory-card | plan | daily-log
  "project": "C:/zy/project_other/ai-projects/EvoKit",
  "ts": "2026-10-27T09:00:00Z",
  "sessionId": "845796e9-…",
  "text": "…规范化后的正文（用户问题+最终答复摘要）…",
  "meta": { "gitBranch": "feature/2.0", "file": "~/.claude/projects/…jsonl", "line": 120 }
}
```

暂存于 `~/.evokit/inbox/<source>/<YYYYMMDD>-<hash>.jsonl`，由 distill 消费后可删（或保留 30 天）。

### 3.2 知识卡片（knowledge/*.md）

```markdown
---
id: k20261106-7f3a2c          # k+日期+短哈希
title: fnm 环境下钩子内 node 不可用，须用安装期解析的绝对路径
type: pitfall                 # fact | preference | pattern | pitfall | workflow
scope: global                 # global | project:C--zy-project_other-ai-projects-EvoKit
tags: [node, fnm, windows, hook]
source: codex:sessions/2026/08/12/rollout-….jsonl.zst
confidence: 0.85              # 提纯 agent 自评
status: draft                 # draft → confirmed | retired
validFrom: 2026-11-06         # 双时态：生效日
validUntil: null              # 双时态：失效日（过期=置值，不删除）
created: 2026-11-06T20:00:00+08:00
updated: 2026-11-06T20:00:00+08:00
---
一卡一事实，自足可引用；写入时已脱敏（无密钥/内网地址）。
```

字段依据：双时态与「一卡一事实」来自调研共识；`type` 三分类落地为——`fact/preference` → 入口文件分发、`workflow/pattern` → forge 原料、`pitfall` → 高优先展示。

### 3.3 索引行（knowledge-index.md，格式沿用 ADR 0006/0008 已验证的 `- [id] 摘要`）

```markdown
## EvoKit 知识
- [k20261106-7f3a2c] ⚠ fnm 钩子内 node 不可用→用绝对路径 #node #hook
- [k20261101-19d8c4] 🏛 EvoKit 托管块机制：只动块内、绝不整文件覆盖 #evokit
## 助手原生记忆        ← 人工/AI 手写段落，EvoKit 只透传、永不重建
```

- 索引常驻预算：**≤60 行**（v1.x 实测 50 条 ≈1.2k token/会话），超限按「最近引用+置信度」滚动，被挤出者仍在库内可检索。
- `## 助手原生记忆` 等未知 section 一律原样保留（ADR 0008 §3 的止血纪律直接复用）。

### 3.4 生成技能的元数据（~/.agents/skills/<name>/SKILL.md + generation.json）

```jsonc
{
  "generatedBy": "evokit forge",
  "generatedAt": "2026-11-20T02:00:00+08:00",
  "parentCards": ["k20261028-…", "k20261102-…"],
  "sourceType": "evokit",           // 与 .skill-lock.json v3 的 sourceType 对齐
  "review": { "status": "trial", "uses": 0, "vetoed": false }
}
```

---

## 4. ① harvest 收集层

### 4.1 采集器清单（settings.json 新增 `sources` 块，保持零代码扩展哲学）

```jsonc
{
  "sources": [
    { "id": "claude-sessions", "adapter": "claude-projects",
      "root": "~/.claude/projects", "enabled": true, "since": "2026-08-01" },
    { "id": "claude-history",  "adapter": "jsonl-fields", "root": "~/.claude/history.jsonl" },
    { "id": "codex-sessions",  "adapter": "codex-rollout", "root": "~/.codex/sessions" },
    { "id": "qoder-cn-memory", "adapter": "memory-cards", "root": "~/.qoder-cn/memory", "glob": "feedback-*.md" },
    { "id": "qoder-memory",    "adapter": "memory-cards", "root": "~/.qoder/memory" },
    { "id": "codearts-memory", "adapter": "memory-cards", "root": "~/.codeartsdoer/memory", "recursive": true },
    { "id": "trae-memory",     "adapter": "trae-session-memory", "root": "~/.trae-cn/memory/projects" },
    { "id": "workbuddy-log",   "adapter": "daily-log", "glob": "**/.workbuddy/memory/*.md" },
    { "id": "pi-sessions",     "adapter": "pi-sessions", "root": "~/.pi/agent/sessions", "enabled": true },
    { "id": "trae-solo-db",    "adapter": "sqlite", "root": "…/TRAE SOLO CN/ModularData/ai-agent/database.db", "enabled": false },
    { "id": "autoclaw-db",     "adapter": "sqlite", "root": "…/AutoClaw-official/accounts/*/runtime/runtime.sqlite", "enabled": false }
  ]
}
```

| 优先级 | 适配器 | 处理要点 |
| --- | --- | --- |
| **P0** | `claude-projects` | JSONL 逐行解析；只取 `type:user/assistant` 的最终轮次；跳过 `isMeta`、可选跳过 `isSidechain`（子代理）；`cwd` 映射 project |
| **P0** | `codex-rollout` | Node≥23.8 `zlib.zstdDecompressSync` 解压；不可解则记入报告跳过（不阻塞） |
| **P0** | `memory-cards` | Qoder/CodeArts 的 feedback-*.md / MEMORY.md 已是提纯态 → **免 distill 直通入库**（status 直接 draft→confirm 待人过目） |
| **P0** | `trae-session-memory` | `{intent,actions,outcome,learned}` → 每字段映射为一张卡片，source 指回 jsonl |
| **P1** | `jsonl-fields` / `pi-sessions` / `daily-log` | 常规解析 |
| **P2** | `sqlite`（AutoClaw / Trae SOLO / opencode） | 零依赖红线：仅当本机有 `sqlite3` CLI 时启用，否则报告「需启用」；不做内置驱动 |

### 4.2 水位线与增量

`~/.evokit/state.json`：每个 source 记录 `{ lastRunAt, files: { "<path>": { size, mtime, hash, cursor } }, counts }`。只处理新增/变化的文件；`--full` 强制全量（结果仍走 .pending，安全）。

### 4.3 脱敏（收割时即执行，RawEvent 与卡片双保险）

内置规则：`sk-[A-Za-z0-9]{8,}`、`AKIA[0-9A-Z]{16}`、`Bearer …`、`password|token|secret|api[_-]?key\s*[:=]`、内网地址、`Authorization` 头 → `[REDACTED]`；规则表允许在 settings 里扩充。**会话历史里出现过真实密钥（本机 codex rules 里已有先例），这一步不可省。**

---

## 5. ② distill 提纯层（两阶段裁决，复用委托机制）

### 5.1 调用方式

完全复用 `inventory` 的既有链路：`detectAgentClis()` → `runAgentCli(cli, prompt)`（stdin 长文、超时、stderr 诊断、降级提示都是现成的）。**默认 codex、次选 pi**——交接文档已确认 claude CLI + step-5-preview 组合对长 prompt 必超时，在解决前不作为 distill 执行者。`--agent` 可覆盖。

### 5.2 分批策略

按 `project × 时间窗` 分批，每批 ≤8 个会话 / prompt ≤24KB；单批产出 ≤10 张卡。大项目分多批串行，报告进度（inventory 同款输出风格）。

### 5.3 两阶段（prompts 新增 `distill` 模板，可被 settings 覆盖）

```
阶段 A（抽卡）：输入 = 本批 RawEvent。
  只提取「可复用知识」：用户偏好修正、踩坑与解法、项目事实、有效工作流。
  忽略一次性调试细节与过期版本问题。每卡输出：title/type/tags/statement/
  evidence(来源文件)/confidence(0-1)。
阶段 B（裁决）：输入 = 阶段 A 卡片 + 既有同 tag 卡片的标题与摘要（仅摘要，控制 token）。
  对每张卡裁决：ADD / UPDATE(指向旧卡 id+改法) / MERGE(合并对象) / NOOP(重复)。
  输出严格 JSON 数组，字段见 §3.2；无密钥。
```

这正是 mem0 论文的两阶段范式——避免全量重写与重复堆积。输出解析容错：优先整体 JSON，失败则逐个提取 `{...}` 块，仍失败则把原始输出存入 `.pending/orphan/` 供人工处理（**绝不丢弃**）。

### 5.4 产出

全部写入 `~/.evokit/knowledge/.pending/<ts>-<slug>.md`（status: draft）。`.pending` 机制 v1.x 已验证过（learn/review 的闸门），直接复活。

---

## 6. ③ review 确认层（自动化三档）

| 档位 | 行为 | 适用 |
| --- | --- | --- |
| `manual`（默认） | `evokit review` 逐条列出草稿：接受 / 编辑 / 拒绝 / 合并 | 上线初期，建立质量基线 |
| `assist` | `confidence ≥ autoThreshold(默认 0.9)` 且裁决为 ADD 的自动入库；其余留审 | 信任建立后 |
| `auto` | 全自动入库，事后 `evokit review --audit` 抽查 + git diff 兜底 | 完全信任后 |

- 接受 → 卡片写入 `knowledge/`、索引重建（只重建 `## EvoKit 知识` 桶）、`git commit -m "learn: <title>"`（知识库根独立 git，与 codex memories 的做法一致）。
- 拒绝 → 移入 `knowledge/.rejected/`（保留 90 天）供 learn 提示词参考，不进正文库。
- 冲突：阶段 B 已做主裁决；`evokit inventory` 的 6 区块体检（重复/冲突/过期/断链）扩展为可对 `knowledge/` 运行，月度跑一次。

---

## 7. ④ recall 分发层（复用 sync，双通道）

1. **L1 常驻**：新增内置资源 `knowledge-index`（type: text，源 `~/.evokit/knowledge/knowledge-index.md`）→ 目标为各入口文件的托管块。`evokit sync` 一键分发，机制零新增。同时按调研结论**新增 AGENTS.md 输出目标**（Cursor / Gemini CLI / Copilot 等直接读取，一次覆盖一批工具）。
2. **L2 按需**：索引行携带 id，AI 按约定路径 `knowledge/<id>.md` 自行 Read——只要工具能读文件就能工作，最弱助手不断链（ADR 0006 的分层结论）。
3. `evokit recall "<关键词>"`：本地检索命令——tags/标题/正文关键词匹配，输出卡片路径与摘要（给人和给 AI 都用）。不做 embedding；MCP 记忆服务（[mcp-memory-service](https://github.com/doobidoo/mcp-memory-service) 等）登记为 **SP-spike**，与 ADR 0006 的立场一致：先验证再承诺。
4. 可选分发目标（P2）：把确认卡片追加写入 `~/.codex/memories/raw_memories.md`、`~/.codeium/memories/global_rules.md` 等工具原生记忆文件（走托管块纪律）。

---

## 8. ⑤ forge 锻造层（自动生成适合自己的 skill）

### 8.1 触发器

- **聚簇达标**：同 `tags` 组合下 `type ∈ {workflow, pattern}` 的 confirmed 卡片 ≥3 张 → `evokit learn --auto` 收尾时提示「可锻造技能：xxx（N 张卡）」；`auto` 档可直接生成草稿。
- **显式**：`evokit forge --topic "pms 发布流程"` / `--from-tags element-ui,pms`。
- **重复信号**：recalled 关键词在多会话重复命中（`knowledge/references.jsonl` 计数，见 §9）。

### 8.2 生成流程

1. 取同主题卡片集（含正文与来源），拼 `prompts.forge` 模板 → 委托 agent CLI；
2. 要求按本机 skill-creator 的形态输出：`SKILL.md`（YAML frontmatter：`name` + `description`（含触发时机）+ 正文渐进披露）+ 必要的 `scripts/`、`references/`；
3. 产物落 `~/.agents/skills/<name>/`（与现有 44 个技能同源同库），附 `generation.json`（§3.4）；skill-lock 里 `sourceType: "evokit"`；
4. `evokit review --skill` 人工过目 → 通过后由 **现有 symlink 资源机制**分发：`~/.claude/skills/`、`~/.codex/skills/`、`~/.trae/skills/`、`~/.codeartsdoer/skills/`、Cursor 等——一处改动、多工具实时生效，这正是 v2.0 symlink 资源的既有能力。

### 8.3 试用期与退役

生成技能默认 `status: trial`。每月 `evokit forge --audit`：无引用、被人工否决或父卡片大量 `validUntil` 失效 → 归档至 `skills/.retired/`（不删除，可恢复）。父卡片失效时提醒「技能需重审」。

> 参照系：本机 CodeArts `evolve/skill_evolution_workspace/generated-skills` 已在跑同类进化；Gemini CLI Auto Memory 官方实验特性同思路。EvoKit 的差异点：**跨 12 个工具统一**，而非单工具私有。

---

## 9. 持续自动学习 Loop

```
触发器（三选一或并存）
├─ 手动：evokit learn（= harvest → distill → review 提示）
├─ 定时：Windows 任务计划每晚 02:00 跑 `evokit learn --assist`
│        （仿 CodeArts 的 00:00–06:00 夜间窗口；misfire 策略 skip）
└─ 钩子：Claude Code SessionEnd/Stop 钩子 → `evokit learn --session <id>`
         （钩子 stdout 进上下文的通道官方已文档化；遵守 ADR 0007 纪律：
          Node 单实现、任何异常 exit 0、--json 单一合法 JSON）

单轮 loop
harvest(增量) → distill(增量会话) → [.pending] → review(按档位)
→ 索引重建 + git commit → sync(L1 索引分发)
→ forge 聚簇检查（达标则生成草稿）

反馈信号（写入 knowledge/references.jsonl）
├─ recall 命中：evokit recall 每次命中计数
├─ 人工纠错：review 中对已入库卡片做 UPDATE → 视为高价值信号（偏好类卡片常来自此）
└─ 技能使用：forge --audit 时人工/工具回填
```

防熵增三件套：增量水位线（不重复收割）、两阶段裁决（不重复入库）、月度 inventory 体检 + 季度重审（`validUntil` 失效卡片退出 L1 索引、保留在库可检索）。

---

## 10. 里程碑（每步可独立验收，符合渐进交付）

| 阶段 | 内容 | 验收标准 | 预估 |
| --- | --- | --- | --- |
| **M0 地基** | 知识根 `~/.evokit/knowledge/`（git init）；卡片/索引读写（**未知 section 只保留不删除**；`- [id] 摘要` 行格式；旧 header 永久别名）；`evokit review` 骨架 | 单测：第三个手写 section 在重建索引后逐字仍在；126 个现有测试不回归 | 0.5–1 天 |
| **M1 收割** | `sources` 块 + 4 个 P0 适配器 + 水位线 + 脱敏 + `evokit harvest` | 跑一遍产出 RawEvent 清单：claude/codex/trae/qoder 各源有计数，无密钥泄漏（抽检），二次运行 0 新增 | 1–2 天 |
| **M2 提纯闭环** | `distill`（默认 codex）+ `.pending` + `review` 三档 + 索引重建 | 用 EvoKit 开发会话史（WorkBuddy worktree 113 个会话中抽 10 个）跑通首闭环：产出 ≥10 张卡、重复卡被 MERGE、git 历史可回滚 | 1–2 天 |
| **M3 分发** | `knowledge-index` 资源 + AGENTS.md 目标 + `recall` 命令 | `evokit sync` 后 CLAUDE.md/AGENTS.md/APPEND_SYSTEM.md 均含 ≤60 行索引托管块；`recall fnm` 命中 M2 卡片 | 1 天 |
| **M4 锻造** | `forge` + 生成契约 + symlink 分发 + 试用期 | 用 M2 的 ≥3 张同主题卡生成 1 个 SKILL.md 草稿，review 后在 Claude Code 内可被发现与触发 | 1–2 天 |
| **M5 自动化** | 任务计划模板 + 钩子接Claude（Node 单实现 exit 0）+ references 计数 + inventory 对接 knowledge | 连续 7 天夜间自动学习无人工干预、无重复条目增长、git 提交序列可审计 | 1 天 |

> M0–M2 完成即有实用价值（经验不再散失）；M3 之后「供后续工具使用」成立；M4/M5 是自动进化。

---

## 11. 风险与红线

| 风险 | 对策 |
| --- | --- |
| 会话史含密钥/内网信息（已实测存在） | 收割即脱敏（§4.3）；知识库独立 git 也不上传远程；`sync` 分发的索引只含标题摘要 |
| 提纯质量差、胡编 | 只允许带 `source` 的卡片入库；`confidence` 字段；review 人工闸门默认开启；孤儿输出进 `orphan/` 不丢弃 |
| 重复/矛盾堆积 | 两阶段裁决 + 月度 inventory 体检 + 双时态过期 |
| agent CLI 不可用（claude 长文超时 bug、pi key 过期史） | 执行者按 `codex → pi → claude` 降级；`--prompt` 模式允许手动喂给任意 agent（inventory 同款兜底） |
| zstd/sqlite 环境差异 | zstd 不可解→报告跳过；sqlite 无 CLI→标记「需启用」，不阻塞其他源 |
| 误删用户内容 | 全链路只增不删（except 显式 gc）；未知 section 透传；工具目录只写托管块；「额外产物先确认」遵守你的全局行为规则 |
| token/成本 | 索引 ≤60 行常驻；distill 分批 ≤24KB；卡片按需 Read |

---

## 12. 不造轮子清单（与外部方案对照）

| 能力 | 采用 | 不采用/仅登记 |
| --- | --- | --- |
| 规则分发 | EvoKit 现有 sync + 新增 AGENTS.md 输出（[agents.md](https://agents.md/)） | rulesync / Ruler（功能重叠，README 已裁定避开） |
| 多设备符号分发 | 现有 symlink 资源（必要时参考 [ai-rules-sync](https://github.com/lbb00/ai-rules-sync) 的联邦思路） | — |
| 提纯范式 | mem0 两阶段裁决（方法论，非引入其库） | mem0/OpenMemory（自托管版已 sunset）、Letta/Graphiti（重运行时，违零依赖） |
| 知识分层 | LangMem 三分法 → 事实进入口、过程进 skill、局部约束进路径规则 | — |
| 方法论参照 | [Cline Memory Bank](https://docs.cline.bot/best-practices/memory-bank)（分层 Markdown、任何能读文档的 AI 都适用） | — |
| MCP 记忆层 | 仅登记 SP-spike（跨工具挂载值得验证） | 现阶段不做（违零依赖/常驻进程红线） |
| 单工具自动记忆 | — | claude-mem（仅 Claude Code）、Gemini Auto Memory（仅 Gemini）——做对照系，不依赖 |

**本机现成资产复用**：`agents-cli.js`（委托引擎）、托管块 sync（L1 分发）、symlink 资源（技能分发）、inventory（体检与提示词模板范式）、Trae session_memory 四字段（卡片范本）、Qoder feedback 卡（直通入库）、CodeArts mem-exp-config（定时窗口参数）、skill-creator（生成形态）。

---

## 附：与 EvoKit 代码的对接点

| 现有模块 | 复用/扩展方式 |
| --- | --- |
| `cli/src/paths.js` | 增 `EVOKIT_KNOWLEDGE_DIR`、`INBOX_DIR`、`STATE_FILE` 常量 |
| `cli/src/defaults.js` | 增 `DEFAULT_SOURCES`、`DEFAULT_PROMPTS.distill / .forge / .review` |
| `cli/src/config.js` | settings 读取支持 `sources` 块（沿用三块结构，配置分层照旧） |
| `cli/src/agents-cli.js` | 原样复用（distill/forge 的执行引擎） |
| `cli/src/syncers.js` | knowledge-index 走既有 text 同步器，零改动 |
| `cli/src/commands/` | 新增 `learn.js`（harvest+distill 编排）、`review.js`、`recall.js`、`forge.js`；`evokit.mjs` 命令表同步 |
| `cli/test-local.mjs` | 新增断言：水位线增量、脱敏、未知 section 保留、.pending 闸门、索引行提取 |

---

## 13. 设计补遗：五个关键问题的裁决

### Q1 重复的知识怎么处理？

四道防线，贯穿入库前后：

1. **入库前（distill 阶段 B）**：新卡片先与既有卡片比对再裁决。比对键 = tags 倒排索引 + 标题/关键词 Jaccard 粗筛出候选集（≤20 条，零依赖不做 embedding），连同新卡喂给 LLM 裁决 `ADD / UPDATE / MERGE / NOOP`（mem0 两阶段范式）。
2. **入库时（review）**：裁决结果随草稿带 `related: [旧卡id]`，人审可见"疑似重复"。
3. **入库后（体检）**：`evokit inventory` 六区块体检扩展到 knowledge/（DUP/CON/LINK/CACHE），月度跑，复用已有委托机制。
4. **合并语义（不丢内容）**：MERGE = 保留 canonical 卡，被并卡 `status: retired` + `mergedInto: <id>` + `validUntil` 置值；git 可回滚；索引只留 canonical。

注意区分：**事实相同表述不同 → MERGE**；**结论相反 → 冲突不是重复**，两条都保留并互标 `conflictWith`，进 review 强制人工裁决（或按 validFrom 新者优先，旧者置 validUntil）；**同主题不同侧面 → 都保留**，共享 tag 簇（是 forge 聚簇原料）。

### Q2 新增 agent 工具，怎么提炼？

三步接入，绝大多数情况零代码：

1. **发现**：`evokit discover` 探测常见数据目录（已知约定清单 + AppData/家目录启发式扫描），输出"疑似记忆/会话目录"报告（目录、文件类型 jsonl/sqlite/md/zst、疑似内容）。
2. **接入**：settings.json 的 `sources` 块加一条，映射到已有 8 种适配器之一——新工具的记忆必属三类之一：**已是提纯态**（md 卡片 → `memory-cards` 直通）、**半结构化**（jsonl → 对应解析器）、**私有格式**（才需要写新适配器：`collect(source) → RawEvent[]` 接口固定，约 50–100 行/个，是唯一要改代码的点）。本机实例：Qoder 接入 = 3 行配置；Trae SOLO（sqlite）= sqlite 适配器 + 表映射。
3. **提纯与分发自动继承**：新工具走同一条流水线；阶段 B 会拿新工具的经验与既有库比对——与旧知识重复的裁决 MERGE/NOOP，**新工具第一天即继承全部历史知识**；分发侧在 agents 块/symlink targets 加一条即可。

### Q3 如何把提炼的知识库给其他工具使用？

四通道，按优先级：

1. **L1 常驻索引（主通道）**：knowledge-index.md 经现有 `evokit sync` 写入各入口文件托管块（CLAUDE.md/AGENTS.md/APPEND_SYSTEM.md）——启动即见，≤60 行 ≈1.2k token。
2. **L2 按需读正文**：索引行带 id，AI 按约定路径 `knowledge/<id>.md` 自行 Read——只要工具能读文件就能用，最弱助手不断链。
3. **AGENTS.md 标准输出**：开放标准（Codex/Cursor/Gemini CLI/VS Code/Copilot 直接读取），agents 块加一条覆盖一批工具。
4. **回写工具原生记忆（P2 可选）+ 技能化**：确认卡追加写入 `~/.codex/memories/raw_memories.md`、`~/.codeium/memories/global_rules.md` 等原生记忆文件（托管块纪律）；程序性知识经 forge 变 SKILL.md 走 symlink 分发。MCP 记忆服务登记为 SP-spike，不承诺。

### Q4 加载方式：全量还是自动提炼？像 skill 那样加载？

读写两侧答案不同，都不全量：

- **写入侧（进库）= 增量自动提炼**：水位线只收割新会话，distill 只对增量批次提纯，经 .pending 按自动化档位（manual/assist/auto）入库。原始会话永不进库，库里只有原子卡片。
- **读取侧（用库）= 三层渐进加载**（v1.x ADR 0006 的 L1/L2 结论 + SKILL.md 渐进披露同构）：
  - L1 常驻：索引 ≤60 行随入口文件加载，静态可预测；
  - L2 按需：AI 判断索引行与任务相关时 Read 卡片全文（一张 ≈100–300 token）；
  - L3 检索：`evokit recall "关键词"` 主动查询（人和 AI 皆可调）。
- **与 skill 加载同构**：skill 的 description 常驻、正文按需加载；知识卡片的索引行 = description，卡片正文 = 正文。对 AI 是同一种使用习惯，token 成本比整篇 skill 更低。

### Q5 知识库越来越庞大如何维护？

六层机制，膨胀被约束在常数成本内：

1. **源头限流**：水位线 + 两阶段裁决挡重复；「只提可复用知识」规则过滤一次性调试细节——POC 实测 258MB 会话史的首批产出仅 21 张卡，有效知识增长率远低于会话增长率；manual 档人审本身是天然限流器。
2. **加载成本恒定**：L1 索引硬上限 60 行，超出按「最近引用 + confidence + type 权重」滚动淘汰出索引（卡片仍在库，L2/recall 可命中）——库再大，常驻 token 是常数。
3. **生命周期**：过时置 `validUntil`（不删除）；`evokit knowledge gc` 显式归档长期失效卡到 `.archive/`。
4. **月度体检**：inventory 六区块（重复/冲突/过期断链/缓存）对 knowledge/ 运行，整理建议按 P0–P3 人工确认。
5. **引用计数**：references.jsonl 记录 recall/L2 命中——长期零引用 + 低置信度 = 归档候选；高引用簇 = forge 原料，簇成熟锻成 skill 后原卡 retired（知识"毕业"）。
6. **物理规模无忧**：原子卡 1–2KB/张，一万张 ≈20MB markdown，git 毫无压力；真正的约束（索引行数、review 带宽）均已有机制。

组织方式：knowledge/ 按 scope 分子目录（global / project:xxx），tags 倒排可检索；季度重审高引用主题簇，簇成熟即 forge 成 skill——**知识库保持小而精，成熟流程沉淀为技能**。

---

## 14. 技术栈评估：Node 是否胜任（2026-11-06 本机实测）

**结论：胜任。在本项目的约束下（零依赖、本地优先、LLM 委托本机 CLI），Node ≥24 不仅够用，且是当前最优选。**

### 能力逐项核对（★=本机已实测）

| 记忆引擎所需能力 | Node 方案（全部标准库） | 状态 |
| --- | --- | --- |
| 目录遍历 / JSONL 解析 / 水位线 | `node:fs` + `JSON.parse` | ★ POC 通过（7 源 79 事件） |
| zstd 解压（codex 会话） | `node:zlib.zstdDecompressSync`（≥23.8） | ★ Node 24.20 实测通过 |
| **sqlite 读取（AutoClaw/Trae SOLO/opencode）** | **`node:sqlite`（≥23.4 免 flag，只读）** | ★ 实测读出 AutoClaw 运行时库 102 张表——sqlite 源由 P2 升级为零依赖可做 |
| 委托 agent CLI（提纯/裁决/生成） | `node:child_process.spawnSync` | ★ `agents-cli.js` 已投产（inventory codex/pi） |
| 托管块同步 / symlink+junction | `node:fs` / `node:path` | ★ v2.0 已投产 |
| 知识库 git 版本化 | `spawnSync('git', …)` | 常规调用 |
| 检索（tags 倒排 + Jaccard 粗筛） | 纯 JS 内存计算 | 1 万张卡（≈20MB 文本）内存索引 <100ms，无需 embedding |
| HTTP 远程资源 | 内置 `fetch` | v2.0 已投产（remote.js） |
| frontmatter 解析 | 自写受限解析器（扁平键 + 一层数组，格式自控） | ⚠ 唯一需自制小件（~60 行），配往返单测 |
| 定时调度 | **不进 Node**——Windows 任务计划 / 会话钩子触发 CLI | 设计红线：无常驻进程（ADR 0007 纪律） |
| LLM 推理 | **不内置**——委托本机 claude/pi/codex | 更轻：零 API key、零 SDK、零模型文件 |

### 量化体量

- 预计新增代码 1500–2500 行；CLI 总体积 <200KB 源码、npm 依赖仍为 0，保持 npx 直跑。
- 全量收割 258MB 会话史 ≈1–3 分钟（瓶颈是 `JSON.parse` 与磁盘 I/O，zstd 解压为原生码）；内存峰值 <150MB（逐行流式可压到 <50MB）。
- 真正的耗时大头是委托 CLI 的 LLM 延迟（秒~分钟级）——**语言性能完全不构成瓶颈**。

### Node 的两个真实短板与对策

1. **无本地 embedding/语义检索**：按设计用「tags 倒排 + 标题 Jaccard 粗筛 → LLM 裁决」替代——语义判断外包给已登录的 agent，更省且更准；若未来确需向量检索，登记 SP-spike（换语言也解决不了，那是要引模型的问题）。
2. **无完整 YAML 解析器**：知识卡 frontmatter 格式自控（扁平键 + 一层数组），自写 ~60 行解析/序列化器并配往返测试，不引入 js-yaml。

### 什么情况下 Node 才不够

- 想在本地跑 embedding 模型或向量库（transformers.js/ONNX 动辄数百 MB，违背轻量）——设计已明确不做；
- 想做常驻服务型架构（内置 MCP server、web 管理界面）——Node 做得了，但违背「无常驻、CLI 短进程」红线；若未来真要 MCP 化，Node/TS 生态反而是 MCP SDK 的一等公民，无需换栈。

### 与备选栈的一句话对比

Python 同样胜任但 stdlib 无 zstd（需第三方包）、且 EvoKit 已是 Node——重写只有成本没有收益；Rust/Go 单二进制更快，但收益趋零：本工作负载是「I/O + 文本处理 + 进程编排」，恰是 Node 甜区，性能瓶颈在 LLM 延迟而非语言。
