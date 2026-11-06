# 诊断报告 — v1.2 复盘：读侧召回未闭环（2026-10）

> **⚠️ 已被取代（Superseded，2026-10-27）**：本报告的行动项（v1.3 主线 = 闭环召回 + 钩子层 Node 化，ADR 0006/0007/0008）**不再执行**。项目已于提交 `7f78090` 转向 v2.0.0「个人多工具偏好同步 CLI」，本报告所依据的 `src/` + `template/` 形态已从本分支删除（仅存 `main`）。报告保留作历史证据底稿；**§9 是对当前 v2.0 代码的复核，是本页唯一反映现状的部分。**

> **性质**：方向复盘的证据底稿，不是变更提案。结论用于支撑拟立的 ADR 0006 / 0007 / 0008 与 ROADMAP v1.3 段。
> **方法**：对 `src/`、`template/`、`docs/` 与本仓 `.evokit/` 逐文件核对（每条结论附 `文件:行号`），另经三轮独立评审（产品价值 / 技术正确性 / 工程可执行性）复核；评审点名的行号已自行回读代码订正。
> **本轮不改动 `src/` 与 `template/`。**

## 1. 一句话结论

v0.1→v1.2 的功能层全部投在**写侧**（提取、确认、去重）与**诊断侧**（健康指标、冲突表面化），而 ADR 0001:38 承诺的加载策略「**索引常驻 + 条目按需加载**」在读侧从未落地：四个助手里只有 OpenCode 接了一条注入面，且那条注入面**只覆盖个人根索引，项目根索引从未接入**。一个不会被读到的知识库，写侧做得再严密也只是在自己仓库里造了一个空的目录约定。

## 2. 诊断清单

### A — 读侧召回未闭环（致命）

| 助手 | 现状 | 证据 |
| --- | --- | --- |
| OpenCode | `opencode.json:3` 的 `instructions` 只列 `AGENTS.md` 与**个人根**索引一项；**项目根 `.evokit/knowledge-index.md` 不在其中** | `template/opencode/opencode.json:3` |
| Claude Code | 模板 `CLAUDE.md` 无 `@` 导入行；SessionStart 钩子只 `echo` 警告文本，不输出索引 | `template/claude/CLAUDE.md`、`template/claude/hooks/session-start.sh:66-69` |
| Codex CLI | `AGENTS.md:8` 用文字宣称「知识索引 — `knowledge-index.md` 始终加载」、`:79` 甚至要求"若索引见到 🏛 标记的条目，主动打开全文"，但 Codex 侧没有任何机制会把索引载入——只有 AGENTS.md 本身被读；`:101` 的 SessionStart 也只描述"快检完整性" | `template/codex/AGENTS.md:8,79,101`、`template/codex/config.toml`、`template/codex/hooks.json` |
| Pi CLI | `evokit-lifecycle.ts:33-41` 双根都扫，但 `:52` 的 `pi.sendMessage` 发的是「索引✓/条目目录✓/待确认N」的**完整性摘要**，不含任何索引内容 | `template/pi/extensions/evokit-lifecycle.ts:33-41,52` |

宣传面与此矛盾：`README.md:22` 称"构建可检索索引，AI 按需检索"，`README.md:27` 核心能力表同义，四份模板认知核心第 8 行均写"始终加载"。

### B — 写侧确认闸门在主干路径失效（高）

`learning-recorder` skill 教 AI 静默写入 `<project>/.evokit/.pending/`（项目根），而 `evokit learn` 无 `--project-dir` 时只扫个人根（`src/commands/learn.ts:204`：`knowledgeRoots = [getPersonalKnowledgeRoot(homeDir)]`），Stop 钩子同样只查 `${EVOKIT_DIR}/.pending`（`template/claude/hooks/stop.sh:5`、`template/codex/hooks-scripts/stop.sh:5`，`EVOKIT_DIR` 指向 `__HOME__/.evokit/knowledge`）。结果是主干路径产生的草稿**闸门看不见**。正确实现已存在于另两处，可作参照：`evokit-lifecycle.ts:33-41,57`（双根计数）、`tools/evokit-session.ts:21-24`。

### C — 索引 section 语义三套互斥，含一条真实丢数据路径（高）

代码侧 `src/core/knowledge.ts:147-148` 定义 `INDEX_HEADER = '## 个人知识'`（→桶 `evokit`）、`CLAUDE_HEADER = '## 项目知识'`（→桶 `claude`）。三个后果：

1. **桶名与语义正好错位**：`evokit` 桶由 `regenerateIndex` 全量重建（`src/core/repository.ts:308-317`），装的是「个人知识」段；`claude` 桶被原样透传、不参与重建，`dedup.ts:268-282` 的 `removeIndexEntry` 也只动 `evokit` 段——落在「项目知识」段的行因此**脱离工具管理域**（不是立即丢失，但从此不随条目增删而同步）。
2. **未知 section 被物理删除**：`readKnowledgeIndex` 遇任何其它 `## ` 行即把 `section` 置 `null`（`knowledge.ts:174-177`），这些行在解析阶段就被丢弃；`writeKnowledgeIndex`（`:202-230`）只重新输出两个常量标题（`:212-224`），于是一次重建会把用户手写的第三个 section **从文件里抹掉**。
3. **`appendIndex` 语义倒置**：`confirmDraft` 走 `appendIndex`（`repository.ts:262-272`）时把新条目行**无条件追加进 `evokit` 桶**，而该桶对应标题是「个人知识」——**项目级条目被写进个人段**。

文档侧是第三套：`CONTEXT.md:146-152` 示范的 header 是 `## EvoKit 知识` / `## Claude 原生记忆`，与代码的两个常量都不一致。

### D — 钩子层 bash-only 且静默失效（高）

`template/claude/hooks/session-start.sh:28` 与 `template/codex/hooks-scripts/session-start.sh:29` 用 `grep -oP`（GNU PCRE 专属，macOS BSD grep 不支持 `-P`），尾接 `2>/dev/null || true` → 在不支持的平台上**不报错、也不输出**，检查项 2 整体空转。Windows 原生（非 Git Bash）则根本没有钩子执行层。`README.md:42` 的前置条件写着"bash 4.0+（Linux / macOS / WSL / Git Bash）"，与实际用户环境（作者在 Windows）不符。

### E — 索引行格式：模板教的与代码提的不是同一套（中）

四份 `template/*/memory/evokit/knowledge-index.md:8,12` 的注释教 `- [标题](evokit/knowledge/<id>.md)`（链接式），而代码侧的提取规则是 `idFromIndexLine` 的 `/^- \[([^\]]+)\]/`（`src/core/health.ts:54-57`、`src/commands/boot.ts:88-92`）→ 把手写的「标题」当成 id，报出**悬空条目/孤儿条目误报**；bash 钩子 `:28` 用的是另一套（按链接目标 `knowledge/<file>` 提取）。三套提取规则并存，污染 `doctor`/`boot` 报告的可信度——而诊断可信度正是 v1.1/v1.2 全部投入的产出物。

### F — 质量门禁洞（中）

`doctor` 无命令级测试（治理 backlog M5.6 却假设 `tests/commands/doctor.test.ts` 已存在）；OpenCode 适配器无专项测试；无覆盖率门槛。`src/core/memory.ts` 残留零引用的 v0 死代码（`readEvolutionLog` / `getArchiveDir` / `getMemoryDir`）。`export_cmd.ts:7` / `import_cmd.ts:8` 是占位实现但退出码 0（README 已在 M1 改为"v1.x 暂不可用"，代码与文案仍未收口）。

### G — 文档陈旧（中）

`package.json:4,9-11` 仍是"Self-Evolving"旧定位；`README.md:131` 链向不存在的 `docs/zh/EVOLUTION.md`；`README.md:130` 称"四层架构"而 `docs/zh/ARCHITECTURE.md:5` 是 3 层；`docs/zh/KNOWLEDGE.md:49-54` 称过期检测"暂不实现"（与 ADR 0003 已落地的健康诊断矛盾）；`ROADMAP.md:90-95` 把已发版的 v1.2.0 留在「规划中」；`.claude/rules/docs-sync.md:7-8` 与 `docs/zh/DEV_STANDARDS.md:111-112` 仍把 `AI-DEVELOPMENT-STANDARDS` 列为"中文单语例外"，而 M3 已补齐该英文版。

### H — 结构性风险（高，方向层）

1. **四适配器维护 treadmill**：产品 = `template/<adapter>/**` + `src/**`，四个上游各自的记忆/钩子/扩展机制一改，模板与安装器就得跟改。历史上 v0.3→v0.6 四个版本的里程碑标题**全部是"某适配器"**，即维护成本早已显形，只是此前没被计入路线决策。
2. **零外部用户验证**：本仓 `.evokit/knowledge-index.md` 只有两个空 header、连 `knowledge/` 目录都不存在——作者本人未 dogfood，外部用户更无从谈起。诊断 A/B/C 之所以可能长期存在，正是因为缺这条反馈回路。
3. **此前无竞品定位**：见 §5。

## 3. 与既有 ADR 的对照

| ADR | 决策落点 | 侧别 |
| --- | --- | --- |
| 0001 项目上下文引擎转向 | 定位、数据模型、钩子精简、**加载策略「索引常驻 + 条目按需」** | 定契约（读侧承诺的唯一来源，未实现） |
| 0002 四轴与确认闸门 | 人工背书唯一闸门 | 写侧 |
| 0003 过期检测 = 健康诊断 | 诊断表面化，不自动降档 | 诊断侧 |
| 0004 Git 历史确定性提取器 | 候选 → `.pending/` | 写侧 |
| 0005 冲突合并 = 事后诊断 | 归一化全等 + `doctor`/`boot` 三选 | 诊断侧 |

**五份 ADR 里只有 0001 提到读侧，且只是表格里的一行；读侧没有任何一份 ADR 展开过机制**。本次转向（v1.3 主线押「闭环召回」）的理由即在此：不是要加新功能，而是 0001 已承诺、后续四个版本都没兑现的那一半。

## 4. 召回通道候选横评（ADR 0006 的决策输入）

「召回」被拆成两层，因为各助手能提供的注入面不同：

- **L1 索引常驻** —— 会话启动时把 `knowledge-index.md` 内容送进上下文。
- **L2 条目按需加载** —— AI 依据索引里的路径自行 Read 条目正文。

| 通道 | 覆盖助手 | 有官方文档背书？ | 跨平台 | 成本 | 判定 |
| --- | --- | --- | --- | --- | --- |
| SessionStart 钩子 stdout | Claude（文档明确 stdout 进上下文；亦支持 `hookSpecificOutput.additionalContext`）；Codex 有 hooks.json 但注入语义未核验；Pi 走扩展 API | 是（仅 Claude 已核实） | 取决于钩子实现语言 | 中 | **L1 主契约**（须先解决诊断 D → 见 0007） |
| `CLAUDE.md` 的 `@path` 导入 | Claude 专属 | 是（相对路径按含 import 的文件解析、递归上限 4 层） | 是 | 低 | **加速器**，Windows 绝对路径解析待 spike SP-1 |
| `opencode.json` 的 `instructions` | OpenCode 专属 | 是（已在用） | 是 | 低 | **加速器**，须补项目根索引路径 |
| AGENTS.md 强制 Read 指令 | Codex / OpenCode / Pi 共读 AGENTS.md | 未核验 Codex 是多文档拼接还是就近覆盖 | 是 | 低 | best-effort，待 spike SP-2 |
| Pi `pi.sendMessage` | Pi 专属 | 未核验进上下文还是仅 UI 展示 | 是 | 低 | 待 spike SP-2 |
| **MCP 知识库服务** | Claude / Codex / OpenCode 均支持 MCP（Pi 待核） | 是（协议层） | **是，唯一一次实现覆盖多助手** | 高（新运行时面 + 只能以 `npx` 分发，与"零依赖 CLI"定位冲突） | **L2 的可移植替代**，本 ADR 不承诺实现；作为 SP-4 与 v1.3 候选登记 |
| embedding 语义检索 | — | — | — | — | 否掉（违 ADR 0003 不变量） |
| 条目全文常驻 | — | — | — | token 成本不可控 | 否掉 |
| 每轮重注入 | — | — | — | 与 compaction 对抗 | 否掉 |

**横评结论交给 ADR 0006 定稿**，此处只固定一条纪律：**没有官方文档背书的通道，不得写成承诺，只能写成 spike**。

## 5. 竞品定位：为什么还需要一个 CLI 管知识

| 对手 | 它做到 | 它做不到（EvoKit 的立足点） | 诚实的弱点 |
| --- | --- | --- | --- |
| 助手原生记忆（Claude memory / Codex AGENTS.md） | 跨会话持久化，零安装 | 只覆盖单一助手；无结构（type/scope/confidence 三轴）；无确认闸门；换助手即失忆 | 单助手用户根本不需要 EvoKit——**目标用户必须是多助手切换者**，这个前提至今没有验证过 |
| Cursor rules / `.cursorrules` | 项目内规则常驻 | 手写、无提取、无生命周期、无诊断；不跨工具 | 若召回只需一行 `@import`，EvoKit 的价值就只剩写侧与治理，而治理的价值取决于条目量 |
| MCP 知识库（各语言生态） | 一次实现、多助手可配的按需检索 | 依赖模型主动调用，不保证"常驻"；需常驻进程或 `npx`；无本地文件可 diff / 可 git 提交 | 若 L2 交给 MCP，EvoKit 的"本地优先"优势被削弱——这正是 §4 把它列为待评估而非既成方案的原因 |
| RepoWiki / 代码库知识抽取 | 从代码反推结构文档 | 抽不出"AI 光看代码猜不出"的那类知识（CONTEXT.md 的 `architecture` 判据），也不承接个人偏好 | 与 EvoKit 不正面竞争，但在"给 AI 项目上下文"这句话上抢同一预算 |

**定位陈述（建议进 README）**：EvoKit = *助手无关的项目知识层*，用**文件**而非服务承载（可 git、可 diff、可离线、可人工背书），代价是必须自己解决"四个助手各有一套注入面"的碎片化——而 §4 的横评说明这个代价此前没有被认真设计过。

> 若 v1.3 结束时「召回有效性」仍无法证伪（E3 不过），则 EvoKit 实际退化为一个目录约定 + 一组 CLI 检查，此时更诚实的选择是收缩为**单助手（Claude）深做**或**只保留写侧治理**，而不是继续摊四个适配器。

## 6. 四适配器维护成本

- 每版发布需同步 4 套模板目录 + 4 份认知核心 + 安装/卸载引擎 + 模板回查断言；`template-recheck.test.ts` 已在防"CLI 落地了但模板没透传"这类脱节（v1.2 为此加过防回退断言），说明这份成本是真实的、反复出现的。
- 上游变动不可控：Claude Code 钩子 schema、Codex AGENTS.md 语义、OpenCode 配置项、Pi 扩展 API —— 四者中任一变更即需跟进，且多数发生在我们看不见的发布说明里。
- **建议的成本约束进 v1.3 设计**：新增能力优先落在**共享层**（`evokit hook` 命令、知识根契约），模板层只做"一行调用 + 一句指令"的薄对接；凡通道能力先问"能否只改 `src/` 不改 4 份模板"。

## 7. 结论与拟立 ADR

1. **v1.3 主线 = 闭环召回 + 跨平台钩子层**，不再新增诊断能力（诊断侧已连续三个版本有产出，读侧为 0）。
2. 拟立三份 ADR：
   - **ADR 0006** 读侧召回通道（L1/L2 分层，通道矩阵含 MCP 评估，Codex/Pi 定级 best-effort）
   - **ADR 0007** 钩子层 Node 化（`evokit hook session-start|stop`，纯 Node、跨平台、永不阻断）
   - **ADR 0008** 知识根读写契约（header 语义正名、未知 section 止血、`appendIndex` 倒置修正、索引行格式统一、双根默认扫描）
3. 治理 backlog（`.codeartsdoer` 的 M4–M10 与 6 个决策卡点）冻结，仅保留可支撑上述主线的高价值项。

## 8. 证伪实验与验收

**S0（20 分钟，先于任何代码投入）**：手写 3 条真实知识条目进本仓 `.evokit/knowledge/` + 补索引行 → 本仓 `CLAUDE.md` 加一行 `@import` → 开新会话，看 AI 是否真的会在相关话题上**复述条目正文要点**。这一步的结论决定整条 v1.3 主线值不值得押；若无效，回本 §5 的收缩选项重议。

**v1.3 验收（可证伪）**：E1 模板通道存在断言（含 `opencode.json` 补入项目根索引路径）；E2 `evokit hook session-start --json` 在 fixture 下条目数 ≥1 且 stdout 是单个合法 JSON、异常仍 exit 0；E3 召回有效性（复述正文要点，非仅提 id）；E4 防回退（模板禁 `grep -oP`、钩子壳仅剩 node 调用）；E5 本仓 dogfood ≥3 条真实条目且 `evokit boot --project-dir .` 全绿；E6 补 `tests/commands/doctor.test.ts`。
**完成判定 = E3 + E5**。**发布/上 npm 推广**另设闸门：需 ≥1 个外部真实项目完成 dogfood（作者托友跑一遍不构成发布资格）。

## 9. v2.0 复核（2026-10-27，逐条回读当前代码）

### 9.1 复核前提与方法

- 本分支（`feature/2.0`，HEAD `98adb42`）的树只剩 `cli/`、`docs/`、`.github/`、`LICENSE`、`README.md`、`.gitignore`；本报告引用的 `src/`、`template/`、`bin/`、`CONTEXT.md`、`ROADMAP.md`、ADR 0001–0005 **全部只存在于 `main`**（`git ls-tree -r main` 核对）。因此 §2 的 A–H 无法"原地复验"，只能判定每条病灶在 v2.0 是否换了形态仍在。
- 本报告与 `docs/adr/0006-0008`、`docs/en/`、`scripts/`、`docs/zh/2.0-DEVELOPMENT-HANDOFF.md` 在 `git status` 里都是**未跟踪文件**——v1.3 的收尾从未进入版本库。
- 方法：全量读 `cli/src/**`，并在 `EVOKIT_HOME` 重定向的隔离沙箱（`cli/src/paths.js:7`）里跑真实 CLI。下文 **【复现】** = 实测结果，**【静态】** = 只读代码核对、未运行验证。

### 9.2 A–H 逐条判定

| 诊断 | v1.x 病灶 | v2.0 判定 | 证据 |
| --- | --- | --- | --- |
| A 读侧召回未闭环 | 宣称"索引常驻"、实际不注入 | 机制随产品删除、宣称已下修；**同类病灶（宣称 > 实现）仍在** → P2-1、P4-1 | `README.md:5`（公开承认旧方向作废） |
| B 确认闸门只扫单根 | 项目根草稿闸门看不见 | **换了形态仍在：根不对称** | `cli/src/commands/list.js:7,19` 无项目分支；`cli/src/commands/inventory.js:243-251` 项目扫描结果只进 `debug`；`sync.js:42`、`check.js:73`、`status.js:41`、`uninstall.js:48` 的项目入口不过 `expandPath`（对照全局分支 `sync.js:20`、`check.js:59`、`status.js:47`、`uninstall.js:38`） |
| C section 语义互斥 + 一条删数据分支 | 未知 section 被物理删除 | **仍在，且已实测复现**（触发物由 `## ` 标题换成孤儿起始标记）→ P0 | `cli/src/fs-utils.js:40-42,50-52` |
| D bash-only 且静默失效 | `grep -oP` 尾接 `2>/dev/null \|\| true` | **平台依赖已消解**（`cli/` 内已无 `grep -oP`、`/dev/null`；`.cmd` 由 `cmd.exe /c` 包装，`agents-cli.js:53-58`）；**静默失效换了载体** → P1-1、P2-2 | 【静态】 |
| E 提取规则三套并存 | 模板 / 代码 / bash 各一套 | **变成四处独立实现、仍不统一**，且只有一处校验边界顺序 | `fs-utils.js:42`（要求 `end > begin`）vs `check.js:22-29`、`status.js:19-25`、`uninstall.js:15-22`（均不要求） |
| F 质量门禁洞 | 无命令级测试 / 无覆盖率 / 死代码 | **更严重：126 项测试从未进入门禁** | `.github/workflows/ci.yml:18-21` 只跑 `node cli/evokit.mjs --help` 与 `node --check` |
| G 文档陈旧 | 定位、链接、层数与实际不符 | **仍在** → P4-1 | `README.md:132,154` vs 实测 |
| H 结构性风险 | 四适配器 treadmill、零外部用户 | treadmill **已被 v2.0 兑现 §6 的成本约束**（能力落 `settings.json` 共享层、新增 agent 零代码改动，`README.md:16,80-88`）；**零外部用户验证仍是事实** | `README.md:5` 已改口"个人自用" |

### 9.3 P0｜两次 `sync` 物理删除用户内容【复现】

沙箱步骤（`EVOKIT_HOME` 指向临时 home，未触碰真实 `~/.evokit`）：

1. `node cli/evokit.mjs init`；
2. 把 `home/.claude/CLAUDE.md` 写成四行：`HEAD LINE` / `<!-- evokit-managed:start -->`（**无配对 end**）/ `MY IMPORTANT USER TEXT` / `TAIL LINE`；
3. `sync -a claude` 第一次 → `fs-utils.js:42` 守卫不成立（`endIdx === -1`）→ 走 `:50-52` 追加，四行用户内容仍在；
4. 第二次 `sync` → `:40` 命中的是**孤儿 start 标记**、`:41` 命中的是上一步新块的 end → 判定为"已有托管块"，`:44-46` 把两者之间整段替换 → `grep` 验证 `MY IMPORTANT USER TEXT` 与 `TAIL LINE` **均已消失**。

即 `README.md:17,102,113` 三处承诺的「块外用户内容永远原样保留」在两次同步后被违反。形状与诊断 C.2 完全同源：**"认为没有块 → 追加"与"认为有块 → 整段替换"共用一个不完整的判据**，判据漏掉的输入正好落在删除路径上。

### 9.4 P1–P2｜其余 v2.0 病灶

- **P1-1｜agent 非 0 退出只要有输出即算成功【静态】** `agents-cli.js:230-249`：`result.status` 只在 stdout 为空时（`:231-240`）进错误文案，有输出直接 `ok: true`（`:242-249`）。体检报告可能建立在半途失败的 agent 输出上——正是 §2-E 结尾说的"污染诊断可信度"，而诊断可信度是本项目唯一持续产出的资产。
- **P1-2｜同文件的第二个托管块永久陈旧，且 `check` 报「一致」【静态】** `fs-utils.js:40-46` 只替换第一个 BEGIN…END；`check.js:27-29` 也只比较第一个区间 → 陈旧块随入口文件一起交给 AI，检查却全绿。
- **P1-3｜`uninstall` 无边界顺序守卫 → 中段内容重复写入【静态】** `uninstall.js:19-22`：`end` 在 `begin` 之前时 `slice(0,start) + slice(end)` 把同一内容写两遍；`:24-26` 还会删除"剩余仅空白"的既有文件。`uninstall` 全程不设退出码。
- **P1-4｜`END` 在 `BEGIN` 之前时 `sync` 永不收敛【静态】** `fs-utils.js:42` 的守卫恒不成立 → 每次同步追加一块；`check.js:27-29` 反向 slice 得到空串 → 恒判「不一致」。
- **P2-1｜`check` 的 ctxlint 宣称未说明前置条件【静态】** `check.js:143` 仅当 `!isProject && filter === null` 才执行——`evokit check pi`、`evokit check --project` 不跑且**不提示**；`check.js:95` 目标硬编码 `~/.claude`，pi/codex 源从不体检；`check.js:113-116` 的 `execSync` 无 `timeout`。`README.md:104` 对此三条只字未提。
- **P2-2｜可用性探测把所有失败压成一个布尔【静态】** `agents-cli.js:61-69`：`stdio: 'ignore'` + `available = r.error === undefined` → "没装"与"装了但跑不起来"（例如本机模型/供应商配置问题）对用户都是同一行「未检测到，跳过」。
- **P2-3｜远程源缓存无 TTL、代理隧道不校验状态码【静态】** `remote.js:168` 命中缓存即返回，唯一调用方 `syncers.js:26` 从不传 `force` → 首次拉取后 `sync` 永久服务旧内容并打印成功；HTTPS-over-proxy 路径 `remote.js:150-153` 直接按 `\r\n\r\n` 切 body 而不看 `statusCode`（对照直连 `:180` 与 HTTP-经代理 `:126-127` 都校验）→ 404/502 错误页会被写入缓存（`:184`）并同步进托管块，退出码 0。
- **P2-4｜Windows 上「拒绝覆盖真实目录」的保护承诺不可达【复现】** `fs-utils.js:80-83`：本机 `lstatSync` 对 junction 报告 `isSymbolicLink()=true`，故 `:80` 的 win32 目录分支只会命中**真实目录**，`rmSync(..., {recursive:false})` 失败被 `:93` 吞掉，最终抛出 `EEXIST`。实测：空真实目录**未被删除**（数据未丢，订正一份中间报告"静默删掉空目录"的说法），但用户拿到的是裸 `EEXIST`，而不是 `README.md:93`、`cli/README.md:140` 承诺的那句可读拒绝信息。

### 9.5 P4｜文档与门禁陈旧

- **P4-1**｜`README.md:132,154` 称"87 项断言"，实测 `node cli/test-local.mjs` = **126 通过 / 0 失败**。
- `README.md:144` 的目录结构未列 `docs/adr/`、`docs/en/`、`scripts/`，与磁盘现状不符。
- `docs/en/AI-DEVELOPMENT-STANDARDS.md` 与 4 份 `docs/zh/*` 无镜像语言。已在 `scripts/check-docs-sync.mjs` 的 `EXEMPTIONS` 逐份登记理由（本分支已删除 v1.x 的双语维护规范，留下的都是单语言历史记录），而非补写无人阅读的镜像译文。
- `scripts/check-adr-roadmap.mjs` 此前因 `ROADMAP.md` 已随转向删除而 ENOENT 崩溃（exit 2）。现改为：跳过「## 状态」写明已被取代的 ADR；`ROADMAP.md` 缺失时——无推后项则给出可读结论并 exit 0，仍有有效推后项则报该登记缺失并 exit 1。两脚本现均通过。
- `dist/` 残留 260 个 v1.x TypeScript 构建产物（`dist/adapters/*`、`dist/commands/doctor.js` 等），**既未跟踪也不在 `.gitignore`**（`.gitignore` 无 `dist` 条目）→ 任何 `git add -A` 会把已废弃的 v1.x 形态重新带回仓库。**本次只登记，未删除。**
- 门禁本身：`.github/workflows/ci.yml:18-21` 不跑测试、不跑上述两个校验脚本，所以校验脚本长期失败无人拦截。
- 可收窄的导出面（订正子代理"零引用死代码"的说法）：`applyBlock`（`fs-utils.js:16`）、`resolveProxy`（`remote.js:35`）、`DEFAULT_AGENTS`/`DEFAULT_RESOURCES`（`defaults.js:4,28`）确有调用方，但都只在本模块内部，`export` 无外部消费者。

### 9.6 处置结论

1. §7 拟立的三份 ADR 已起草完毕，现全部标记 **已被取代（Superseded）**：`docs/adr/0006-recall-channel.md`、`docs/adr/0007-node-hook-layer.md`、`docs/adr/0008-knowledge-root-contract.md`。其机制（L1/L2 召回、`evokit hook`、索引 section 契约）不再实施。
2. §8 的证伪计划一并作废：S0/E1/E2/E4/E6 都绑定在已删除的 `template/` 与 `tests/` 上。E5 留下了实物——`.evokit/knowledge/` 确有 3 条真实条目，但 `.gitignore:5` 忽略 `.evokit/`，所以"本仓 dogfood"从未真正随仓库交付。这是诊断 H.2「缺反馈回路」的自我印证。
3. 与具体机制无关、仍然适用的三条纪律：**① 没有官方文档背书或实测复现的能力，不得写成用户承诺**（`README.md:93,104` 现各有一条）；**② 同一判据只实现一次**（托管块定位现有四处，是反例）；**③ 检查类命令必须让失败可见**——静默跳过（P2-1、P2-2）与被压平的布尔（P1-1）都会腐蚀唯一可信的产出物。

### 9.7 本次复核的边界

未改动 `cli/` 任何源文件、未新增功能、**未修 P0**（修它要先裁决"孤儿起始标记"算不算受支持输入，属产品决策，不在本目标范围）。已改的是：本节结论、三份 ADR 的状态段、两个校验脚本。未提交、未推送。待你决定：`dist/` 删除还是 `.gitignore`；这两个 v1.x 治理脚本是否退役；`cli/test-local.mjs` 是否接进 CI。
