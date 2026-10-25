# EvoKit inventory 第二、三档进阶设计方案

> 版本：v1.1 ｜ 日期：2026-10-25 ｜ 前置阅读：`INVENTORY-DESIGN.md`（第一档）
> 定位：本文规划 `evokit inventory` 这条线在「扫描 + 委托 agent 找冗余 + 回显」之上的进阶能力。
> 已与用户对齐：第二、三档是 **inventory 体检的进阶**，核心诉求（按优先级）为：
> ① token 预算/裁剪建议 → ② 漂移检测 → ③ 给出修复建议。
> v1.1 修订（关键）：核实发现三 agent 均**内置**了实时 token/上下文统计能力（claude `/cost`/`/context`、codex `/status`、pi 底部栏），故第二档**砍掉「EvoKit 自己估算 token」**，改为「客观文件体检 + 指路内置命令 + 委托 agent 裁剪」，避免重复造轮子。

---

## 0. 一句话总览

| 档位 | 主题 | 核心问题 | 形态 |
| --- | --- | --- | --- |
| 第一档（已完成） | 扫描 + 委托 agent 找冗余 | 「我的知识库乱不乱？」 | 只读，回显 agent 报告 |
| 第二档 | 静态上下文体检 + 裁剪委托 | 「哪个常驻入口在膨胀？」 | 只读，确定性扫描 + 委托 agent |
| 第三档 | 漂移检测 + 修复建议 | 「同一规则，各处说法一致吗？」 | 只读检测 + 可选的确定性修复 |

**贯穿原则**（继承第一档）：
1. EvoKit 只做**确定性、通用**的事（扫描、指纹、命令行调用）；**语义判断（含「这段能不能删」）仍交给 agent**。
2. **不重复造轮子**：agent 已内置的能力（精确 token 统计、成本、上下文分配图）EvoKit 一律不重做，只在报告里「指路」。
3. 第二档的定位是「**跨工具的静态文件横向体检**」——这是三个 agent 各自做不到的（每个 agent 只看得到自己的入口），也是 EvoKit 独有的价值点。
4. 第三档复用第一档的「委托 agent 找冲突」+ 确定性指纹，把「发现」和「修复」分开：发现可让 agent 做，修复用确定性规则做。

---

## 1. 第二档：静态上下文体检 + 裁剪委托（`evokit inventory --budget`）

### 1.0 关键决策：不自己算 token（先读这段）

调研结论：三个 agent 都**内置**了实时、精确的 token/上下文统计，且用的是各模型**真实的 tokenizer**：

| agent | 内置命令 | 能力 |
| --- | --- | --- |
| Claude Code | `/cost`、`/usage`、`/context` | 本次会话 token 总量 + 成本 + 上下文分配图（系统提示/CLAUDE.md/工具 schema/历史/文件各占多少） |
| Codex | `/status`、`/statusline` | 当前上下文用量、剩余预算、实时计数 |
| Pi | 底部栏 + `/session` | ↑输入/↓输出/缓存读/缓存写/成本/上下文进度条 |

这些是**运行时真实消耗**（含会话历史、文件读取、工具 schema），EvoKit 在文件层面**根本算不出来**（它看不到运行时）。若 EvoKit 用 `字符/4` 之类公式「估算 token」，产出的是**模糊估值**，既不如 agent 精确，又和 agent 内置能力重叠——**这是典型的重复造轮子**。

因此第二档**砍掉 token 估算**，重新定位为：**「跨工具静态文件横向体检」**——这是三个 agent 各自做不到的（每个 agent 只看得到自己的入口文件），也是 EvoKit 独有的价值点。

### 1.1 第二档做什么（三件事）

1. **客观体检**（确定性，EvoKit 做，不声称是 token）：列出每个常驻入口文件的**大小、行数、字符数、修改时间**，横向排序，回答「哪个入口最大、哪个最近在膨胀」。
2. **指路**（把「精确 token」交还给 agent 内置命令）：报告末尾附一张「去哪看精确值」的表。
3. **裁剪委托**（语义判断交给 agent）：复用第一档的提示词委托方式，让 agent 看自己的入口文件、判断哪些段落可裁。

### 1.2 客观体检（确定性扫描，不算 token）

对每个「常驻加载的上下文入口」记录客观指标：

| 入口 | 说明 | 是否常驻 |
| --- | --- | --- |
| `~/.claude/CLAUDE.md` | 每次 Claude 会话自动加载 | 常驻 |
| `~/.codex/AGENTS.md` | Codex 全局规则 | 常驻 |
| `~/.pi/agent/APPEND_SYSTEM.md` | Pi 追加系统提示词 | 常驻 |
| 项目级 `CLAUDE.md` / `AGENTS.md` | 进入项目时加载 | 常驻（项目内） |
| 常驻 skill / 常驻规则 | 有 `alwaysApply: true` 或等效标记 | 常驻 |

> 客观指标只给**大小 / 行数 / 字符数 / mtime**，**不给「估算 token」**。目的是「横向找大头 + 发现膨胀趋势」，而不是冒充精确 token 数。

### 1.3 输出形态

```
$ evokit inventory --budget

========== 常驻上下文文件体检（客观指标，非 token 估算）==========

入口                          大小    行数   字符数   最后修改
~/.claude/CLAUDE.md          6.2KB   186    8.4k    2026-10-20
~/.codex/AGENTS.md           3.1KB    92    4.1k    2026-10-18
~/.pi/agent/APPEND_SYSTEM.md 2.4KB    71    3.2k    2026-10-22
项目 .claude/CLAUDE.md       5.0KB   148    6.9k    （项目内）

→ 最大入口：~/.claude/CLAUDE.md（6.2KB / 186 行）

========== 精确 token / 成本去哪看（agent 内置）==========
Claude Code  → /cost  /usage  /context
Codex        → /status  /statusline
Pi           → 底部栏  /session

========== 裁剪委托（让 agent 自己判断哪些可删）==========
（调用 claude -p "…" / codex exec "…" / pi --print "…"，
  把各入口文件内容 + 裁剪启发式清单喂给 agent，让它输出可裁剪段落）
```

### 1.4 裁剪委托（复用第一档的提示词方式）

「哪些段落可删」是**语义判断**，交给 agent（它看得到自己的入口文件内容）。EvoKit 生成一份**通用裁剪 prompt**，把入口文件内容 + 常见冗余特征清单喂给 agent：

```
你是 {agent}，请检查你自己的常驻上下文入口文件（CLAUDE.md / AGENTS.md / APPEND_SYSTEM.md）。

下面是你的入口文件当前内容：
{入口文件内容}

请找出「可从常驻层删掉/精简」的内容，输出结构化清单：
1. 【复述代码可推知的】目录结构、依赖清单、文件树（模型读代码就知道）
2. 【复述工具已强制的】ESLint/Prettier 等 linter 已强制、无需再写进提示词的规则
3. 【过期/失效】硬编码的旧日期、旧版本、已不存在的命令
4. 【空话/占位】纯注释、重复分隔符、无信息量的空段落

要求：
- 只读分析，不要修改任何文件
- 每条标注：入口文件 + 行号 + 为什么可裁 + 建议动作（删/精简/移到按需层）
```

- 复用第一档 `runAgentCli`（claude `-p` / codex `exec` / pi `--print`）。
- 只读，不改文件；产出「可裁剪清单」给用户参考。

### 1.5 与第一档的边界（不重复）

| 维度 | 第一档 `inventory` | 第二档 `--budget` |
| --- | --- | --- |
| 扫描对象 | 全部知识库（agents/skills/rules/commands/MCP/缓存） | 只聚焦**常驻入口文件**（CLAUDE.md/AGENTS.md 等） |
| 输出 | 冗余/冲突/断链报告（agent 全量整理） | 文件大小体检 + 精确值指路 + 裁剪清单 |
| 委托重点 | 「找重复/冲突」 | 「找可裁剪段落」 |

第二档是第一档的**聚焦版**：只盯「每次会话都白付的常驻文件」，并补上第一档没有的「跨工具横向对比 + 精确值指路」。

### 1.6 实现要点

- 复用 `scanGlobal()` / `scanProject()` 拿入口清单（已有）。
- 新增 `cli/src/commands/inventory-budget.js`（或并入 `inventory.js` 的 `--budget` 分支）。
- 客观体检：读文件 `stat` + 数行数/字符数，零依赖、纯本地。
- 指路表：静态文案（agent 内置命令清单，写死在代码里）。
- 裁剪委托：复用 `buildPrompt` + `runAgentCli`，只替换 prompt 模板为「裁剪版」。
- 不新增 token 估算模块（**砍掉原设计的 `token-estimator.js`**）。

---

## 2. 第三档：漂移检测 + 修复建议（`evokit inventory --drift`）

### 2.1 什么是「漂移」（在 inventory 语境下）

第一档已经让 agent 找「冲突项」（对同一件事给出不同规则）。第三档把它**升级为确定性检测**：不靠 agent 猜，而是用**内容指纹**判定「同一个逻辑块，在多处是否一致」。

典型场景：
- 你在 `~/.evokit/context.md`（EvoKit 的单一事实源）里写了「测试命令是 `pnpm test`」。
- `sync` 把它同步进 `CLAUDE.md`、`AGENTS.md`。
- 后来你在 Claude 里手改了 `CLAUDE.md` 里的测试命令为 `pnpm test --coverage`，但没改源。
- 现在三处不一致，但你不知道。

第三档就是**自动发现这种不一致**。

### 2.2 检测算法（复用第一档 + 归档蓝图的指纹思路，但轻量化）

**核心：EvoKit 的托管块天然带边界标记**（`<!-- evokit-managed:start -->` / `<!-- evokit-managed:end -->`），这正好是「可定位切片」的依据，无需引入新标记。

对每个 agent 入口文件：

```
1. 从单一事实源 context.md 提取 EvoKit 托管的内容块（按 resource 切）
2. 从每个入口文件的托管块里提取同样内容
3. 对每个 resource 块做规范化指纹（去空白/大小写/尾随标点后 hash）
4. 比对：
   - 源有、入口无          → 「未同步」（sync 没跑或入口被删块）
   - 源无、入口有          → 「孤儿块」（入口里多了源没有的托管内容）
   - 两边都有但 hash 不同   → 「漂移」（入口被手改或源改了没 sync）
   - 托管块之外、用户手写的部分 → 不检测（尊重用户内容）
```

关键点：**只对比托管块**，用户自己在入口文件里手写的内容（托管块之外）不误报——这和 sync「只动托管块」的数据安全原则完全一致。

### 2.3 与第一档「agent 找冲突」的分工

| 维度 | 第一档（agent 找冲突） | 第三档（确定性漂移） |
| --- | --- | --- |
| 对象 | 语义冲突（「两条规则矛盾」） | 同一资源块的一致性 |
| 方法 | agent 语义理解 | 指纹 hash 比对 |
| 确定性 | 定性、可能漏/误判 | 确定、可复现 |
| 结果 | 「A 和 B 规则冲突」 | 「CLAUDE.md 的 X 块落后于源」 |

两者**互补**：第三档抓「同一块不一致」（机器擅长的），第一档抓「不同块语义冲突」（agent 擅长的）。第三档结果也可以喂给第一档的 agent 做二次确认。

### 2.4 修复建议（继承 sync 的「人工背书 + 三选」哲学）

检测出漂移后，`--drift` 输出建议，但**默认不自动改**（数据安全第一）：

```
$ evokit inventory --drift

========== 漂移检测 ==========
✗ CLAUDE.md    § 测试命令：源已更新，入口落后（可 sync 修复）
✗ AGENTS.md    § 测试命令：入口被手改，与源不一致
✗ CLAUDE.md    § 代码风格：源已删除，入口存在孤儿块

→ evokit sync            以源为准，重新同步（覆盖入口为源内容）
→ evokit drift --fix     交互式三选：以源为准 / 以入口为准 / 保留两边
```

`--fix` 的三选（复用 `uninstall`/`sync` 已建立的边界）：
1. **以源为准**：把入口托管块重写为源内容（等价于 `sync --resource <id>`）。
2. **以入口为准**：把入口的手改内容写回源（`~/.evokit/context.md` 对应块）。
3. **保留两边**：不动，标记为「已知漂移」，下次不再报。

### 2.5 实现要点

- 新增 `cli/src/drift.js`：`normalizeFingerprint(text)`、`detectDrift(source, entries)`。
- 复用 `fs-utils.js` 里解析托管块的逻辑（提取 `evokit-managed:start/end` 区间）。
- 复用 `config.js` 的 `loadResources()` 拿资源 id 列表，逐个资源比对。
- `--fix` 复用 `sync` 的 `applyManagedBlock`（以源为准）或新增「回写源」逻辑（以入口为准）。
- 确定性、无 agent 依赖，秒出。

---

## 3. 三档汇总与依赖关系

```
第一档 inventory          （扫描 + 委托 agent 找冗余 + 回显）  ✅ 已完成
        │
        ├─ 第二档 --budget （静态文件体检 + 精确值指路 + 裁剪委托）
        │        └─ 依赖：扫描器（已有）、客观指标（新）、裁剪 prompt（复用）
        │
        └─ 第三档 --drift  （漂移检测 + 修复建议）    确定性指纹，不依赖 agent
                 └─ 依赖：扫描器（已有）、托管块解析（已有）、指纹（新）
                 └─ 与第一档「agent 找冲突」互补，结果可喂回 agent 二次确认
```

**关键设计决策**：
- 第一、二档都**依赖 agent 做语义判断**（找冗余 / 找可裁剪段落）；第三档是**纯确定性**（指纹比对）。
- 第二档的「体检」部分是确定性的（大小/行数/字符数），但「裁剪」是委托 agent 的语义判断——**精确 token 值不归 EvoKit 管**，交给 agent 内置命令。
- 三者共用同一个扫描器 `scanGlobal()` / `scanProject()`，只是「消费扫描结果」的方式不同。
- 都不破坏「只读优先、数据安全、只动托管块」的红线。

---

## 4. 命令形态与代码结构建议

### 4.1 命令形态（统一在 inventory 下，用 flag 区分）

```
evokit inventory                 # 第一档：扫描 + 委托 agent 找冗余
evokit inventory --agent claude  # 指定 agent
evokit inventory --prompt        # 只生成 prompt
evokit inventory --budget        # 第二档：静态文件体检 + 精确值指路 + 裁剪委托
evokit inventory --drift         # 第三档：漂移检测（不调 agent）
evokit inventory --drift --fix   # 第三档：交互式三选修复
evokit inventory --all           # 一档 + 二档 + 三档全跑，汇总输出（可选）
```

**为什么都用 `inventory` 一个命令、而非拆成 `budget`/`drift` 独立命令**：
- 三者共享同一个扫描器，本质是「同一次体检的三个维度」。
- 用户心智是「我做一次知识库体检」，而不是「我分别跑三个工具」。
- `--all` 一键得到完整体检报告。

（若未来某档膨胀到需要独立交互，再拆成子命令 `evokit inventory budget` 也不迟，当前 flag 足够。）

### 4.2 代码结构

```
cli/src/
  inventory.js                # 扫描器 scanGlobal/scanProject/serializeInventory（现有，抽公共）
  drift.js                    # 第三档：normalizeFingerprint + detectDrift（新）
  commands/
    inventory.js              # 编排：解析 flag → 分发到一/二/三档
    inventory-budget.js       # 第二档：客观体检 + 指路 + 裁剪委托（复用 runAgentCli）
    ...
```

- `scanGlobal`/`scanProject`/`serializeInventory` 从 `commands/inventory.js` 抽到 `inventory.js`（或 `scan.js`），三档共用。
- `buildPrompt`、`runAgentCli` 调用逻辑保留在 commands/inventory.js，第二档的「裁剪 prompt」复用同一套。
- **无 `token-estimator.js`**（已砍掉 token 估算，见 §1.0）。

---

## 5. 实施顺序建议

| 步骤 | 内容 | 依赖 | 可独立验证 |
| --- | --- | --- | --- |
| 1 | 抽公共扫描器 | 无 | 现有 78 测试仍过 |
| 2 | 第二档 `--budget`（客观体检 + 指路 + 裁剪委托） | 步骤 1 | `--budget` 对真实目录输出体检表 + 指路表 |
| 3 | 第三档 `--drift`（指纹 + 托管块比对） | 步骤 1 | 人为制造漂移后能检出 |
| 4 | `--drift --fix` 三选修复 | 步骤 3 + 复用 sync | 三选各验证数据安全 |
| 5 | `--all` 汇总 | 步骤 2、3 | 一键全跑 |

**建议先做步骤 1 + 2**（第二档优先级最高，且只读、无数据安全风险、最易验证），跑通后再做第三档。

---

## 6. 待确认点

- [ ] 第二档裁剪委托是否本版就做，还是先只做「客观体检 + 指路」（裁剪委托可复用第一档 `--agent`，用户手动组合）？
- [ ] 第三档 `--fix` 的「以入口为准」是否真的需要（涉及把入口手改内容回写单一事实源，风险略高）？可先只做「以源为准 / 保留两边」两选，更安全。
- [ ] `--all` 是否本期就做，还是先让 `--budget`/`--drift` 各自独立跑通再汇总。
