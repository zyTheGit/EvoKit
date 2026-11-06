# ADR 0006 — 读侧召回通道分层：L1 索引常驻走钩子 stdout，L2 条目按需走 Read

## 状态

**已被取代（Superseded，2026-10-27）**——项目于提交 `7f78090` 转向 v2.0.0「个人多工具偏好同步 CLI」，本 ADR 面向的 `src/` + `template/` 四适配器形态已整体删除（见 `README.md:5`），L1/L2 召回机制不再实施；引用的 ADR 0001–0005 与 `ROADMAP.md` 在本分支也已不存在（仅存 `main`）。保留作历史决策记录，其中「无官方文档背书的通道不得写成承诺、只能写成 spike」这条纪律仍适用。逐条复核见 `docs/DIAGNOSIS-2026-10-v1.2-recall-loop.md` §9。

~~已接受（2026-10 方向复盘；依据 `docs/DIAGNOSIS-2026-10-v1.2-recall-loop.md` 诊断 A）~~

## 背景

ADR 0001:38 把加载策略从"全量加载"改为「**索引常驻 + 条目按需加载**」，但五份 ADR 里只有 0001 提到读侧，且只是表格里一行——**读侧从未有任何一份 ADR 展开过机制**。复盘核对（诊断 A）：

| 助手 | 宣称 | 实际通道 |
| --- | --- | --- |
| Claude Code | `template/claude/CLAUDE.md:8` "knowledge-index.md 始终加载" | 无。`CLAUDE.md` 不含 `@` 导入；`hooks/session-start.sh:66-69` 只在有问题时 `echo` 警告文本，从不输出索引内容 |
| Codex CLI | `template/codex/AGENTS.md:8` 同样宣称"始终加载"，`:79` 还要求"若索引见 🏛 标记就主动打开全文" | 无机制。Codex 只读 AGENTS.md 本身，索引文件不在任何注入面上——**指令教模型去读一个它从没见过路径格式的索引** |
| OpenCode | `opencode.json:3` `instructions` | **唯一真实通道**，但只列了个人根索引，**项目根 `.evokit/knowledge-index.md` 从未接入** |
| Pi CLI | `evokit-lifecycle.ts:33-41` 双根都扫 | `:52` `pi.sendMessage` 发的是「索引✓/条目✓/待确认 N」完整性摘要，**不含索引内容** |

即：四个助手里三个半是"宣称常驻、实际不注入"。写侧（ADR 0002/0004）与诊断侧（ADR 0003/0005）已连续四个版本有产出，读侧为 0——本 ADR 补的是 0001 已承诺、后续未兑现的那一半。

外部事实已核验（可作依据）：Claude Code 的 `CLAUDE.md` 支持 `@path` 导入、会话启动时展开、递归上限 4 层、相对路径按含 import 的文件解析；SessionStart 钩子的 stdout 会进入模型上下文（亦支持 `hookSpecificOutput.additionalContext`），Stop 钩子 stdout 同样进上下文。来源：[memory](https://code.claude.com/docs/en/memory)、[hooks](https://code.claude.com/docs/en/hooks)。**其余助手原语未核验**，本 ADR 一律登记为 spike，不当既成事实。

## 决策

### 1. 把「召回」拆成两层，分别定契约

- **L1 索引常驻**——会话启动时把 `knowledge-index.md` 的条目行送进上下文。
- **L2 条目按需加载**——AI 依据 L1 给出的路径自行 `Read` 条目正文。

两层分开的理由：各助手能提供的注入面不同，把"常驻"和"取全文"钉死成同一个机制（例如"全靠 MCP"或"全靠 @import"）会在最弱的助手上整条断掉。

### 2. L1 主契约只钉有官方文档背书的那条通道

**L1 = `evokit hook session-start` 的 stdout**（机制见 ADR 0007）。选择它而非模板措辞的理由：它是**唯一有官方文档明确"stdout 进上下文"**的通道，且内容可由 CLI 生成、可单测、跨平台由 Node 保证；模板里的"始终加载"是文字承诺，没有任何东西兑现它。

### 3. `@import` / `instructions` 定级为「加速器」，不构成承诺

- Claude `CLAUDE.md` 加 `@__HOME__/.evokit/knowledge/knowledge-index.md` 一行（`@` 导入按官方文档存在，**Windows/Git Bash 下绝对路径解析行为待 spike SP-1**）。
- OpenCode `opencode.json:3` 的 `instructions` **补入项目根索引路径**（现只有个人根一条）。

两条都写为"能力已具备、行为待验"，未定级前不写进用户承诺与验收。

### 4. Codex / Pi 定级 best-effort，不承诺同等效果

Codex 侧仅强化 AGENTS.md 的**可执行指令**（明确索引路径 + 要求开场 Read），因为 Codex 的多文档注入语义（层级 AGENTS.md 拼接还是就近覆盖）未核验；Pi 侧 `pi.sendMessage` 是进上下文还是仅 UI 展示亦未核验。**两者统一待 spike SP-2**，SP-2 结论出来前不得对外宣称"四助手召回一致"。原拟独立成文的"Codex 通道适配"并入本 ADR 的通道矩阵一行，不另开 ADR。

### 5. L2 契约 = 索引行携带可读路径，零新依赖

索引行格式统一为 `- [id] 摘要`（与 `health.ts:54` / `boot.ts:88-92` 的提取规则对齐，见 ADR 0008），条目正文路径按 `{knowledgeRoot}/knowledge/{id}.md` 由约定推导，模板认知核心给出该根路径。**不引入检索服务、不引入 embedding**。

### 6. MCP 作为 L2 的可移植替代：评估后本 ADR 不承诺实现

MCP 是候选通道里**唯一一次实现覆盖多助手**的一条（诊断报告 §4 横评），但：

- 它服务的是 L2（按需检索），**不解决 L1 常驻**——MCP 工具要模型主动调用，不保证开场即在上下文；
- 需要一个常驻/按需拉起的 server 进程与协议面，与本项目"零依赖 CLI + 纯文件"的定位直接冲突（发布前只能以 `npx` 形式分发）；
- 依赖各助手已配好 MCP，配置成本转嫁给用户。

故本 ADR **不承诺实现 MCP 通道**，改为登记 **spike SP-4**（可行性 + 各助手 MCP 配置面）进 ROADMAP v1.3 候选事项，评估结论出来后再决定是否另开 ADR。

### 7. 明确否掉的方案

embedding 语义检索（违 ADR 0003 不变量）、条目全文常驻（token 不可控）、每轮重注入（与 compaction 对抗）、只改模板措辞不建机制（正是诊断 A 的成因）。

## 通道矩阵（决策表）

| 层 | 通道 | 助手 | 定级 | 前置 |
| --- | --- | --- | --- | --- |
| L1 | `evokit hook session-start` stdout | Claude | **契约** | ADR 0007 |
| L1 | `CLAUDE.md` `@import` | Claude | 加速器 | SP-1 |
| L1 | `opencode.json` `instructions` | OpenCode | 加速器 | 补项目根路径 |
| L1 | AGENTS.md 可执行 Read 指令 | Codex | best-effort | SP-2 |
| L1 | `pi.sendMessage` 发索引块 | Pi | best-effort | SP-2 |
| L2 | 索引行 + 约定路径，AI 自行 Read | 全部 | **契约** | ADR 0008（格式统一） |
| L2 | MCP 知识库服务 | 潜在跨助手 | 不承诺 | SP-4 |

## 取舍

### 选钩子 stdout 作为主契约，而非"每助手各写一套模板指令"

- **放弃**：零代码改动的纯文档方案（只在 AGENTS.md/CLAUDE.md 写"请读索引"）
- **获得**：内容生成集中在一处（`src/`），可单测、可跨平台、四助手共享；与 ADR 0005"代码是唯一可审计的收口点"的思路一致
- **代价**：新增一个 CLI 命令与其安装/升级面；纯文档方案本可零依赖，本方案把维护成本从"四套模板文案"换成"一个命令 + 四行对接"

### 选分层（L1/L2）而非单一机制

- **放弃**：架构统一性（一条通道走到底的整洁感）
- **获得**：在最弱助手上不断链——L2 的"AI 自行 Read"只要有文件系统访问就能工作，不依赖任何注入面
- **代价**：验收要分两层分别证伪，文档需解释两层关系

### 选 best-effort 明写"不承诺"而非笼统宣称"四助手始终加载"

- **放弃**：README 的卖点整齐度（现状 `README.md:22,27` 正在作此宣称）
- **获得**：宣称与实际一致，避免继续积累"模板教了、代码没做"的债（诊断 E/F 同源于此）
- **代价**：README 需下修一处宣传语（本轮 D6 已登记）

## 实施约束（写侧不可绕过的既有事实）

- `@import` 行如何到达**存量用户**：`src/adapters/claude/adapter.ts:52-57` 的 `cognitiveCore` 策略是 `skip-if-exists`（带 `appendMarker`），即已装用户不会被覆盖 `CLAUDE.md`——新增导入行只能走 `appendMarker` 追加路径或 `evokit update`，**不得假设重装**。
- `CLAUDE.md` 现 121 行、上限 150（`template/claude/CLAUDE.md:88`），L1 若走 `@import` 有约 29 行余量；索引本体不进 `CLAUDE.md`，只进钩子 stdout，避免行数上限与 token 同时爆。
- token 预算：50 条摘要 ≈1.2k token/会话（按现格式实测估算）。**L1 双通道并存时该成本翻倍**（`@import` + 钩子同时注入），故加速器定级为"可选，默认只开一条"。

## 前置依赖

- ADR 0007（钩子层 Node 化）——L1 主契约的实现载体；其 `bin/evokit.cjs` 白名单同步与 exit 0 纪律是本 ADR 生效的前提。
- ADR 0008（索引行格式统一）——L2 契约的可读路径来源。
- SP-1 / SP-2 / SP-4 结论。

## 验收条件

- **E1 通道存在断言**（扩 `tests/adapters/template-recheck.test.ts`）：claude 模板含 `@` 导入行；`opencode.json` 的 `instructions` 含**两个**索引路径（个人根 + 项目根）；codex AGENTS.md 含明确路径的强制 Read 指令；pi 扩展含索引块输出。
- **E2** `evokit hook session-start --json` 在 fixture 下输出条目数 ≥1 且 stdout 为单个合法 JSON。
- **E3 有效性（本 ADR 的真正验收）**：新会话中 AI 能**复述某条知识的正文要点**（不是仅提到 id），且由话题触发 L2 读取。仅"注入成功"不算通过。
- **S0 证伪实验**先于代码投入：手写 3 条真实条目进本仓 `.evokit/knowledge/` + `@import` 一行，开新会话看是否真被使用。**若 S0 无效，本 ADR 的 L1 定级与 v1.3 主线须一并重议。**
