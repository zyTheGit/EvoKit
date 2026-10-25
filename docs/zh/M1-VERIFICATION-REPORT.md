# EvoKit 2.0 M-1 前置验证报告：证据核查 + 竞品 + 需求验证

> 版本：M-1 ｜ 日期：2026-10-25 ｜ 主持人：齐活林（Qi）· 交付总监
> 目的：四位评审一致要求的"重构前前置闸门"。本报告完成后决定**是否进入 M1，或暂停重构**。

---

## 0. 结论先行

**三条关键发现，其中两条动摇收敛版方向，需要你决策：**

1. **方向没有错，但"编译器"这一层已经有成熟开源竞品**——`rulesync`（dyoshikawa/rulesync，MIT，1.5k stars）已经实现"单一事实源 → 多工具编译 + lint + token 预算 + 漂移 receipt + context explain"，几乎就是收敛版蓝图想做的事。**EvoKit 若要正面做编译器，是在一个已被占满的格子上重造轮子。**
2. **ETH Zurich 论文的准确结论，比原蓝图和评审时引用的更精细，且更不利于"LLM 生成上下文"**：LLM 生成的文件**降成功率 2~3%**（不是"差异不显著"），开发者手写 +4%，两者都 +20% 成本。核心建议是"从空文件开始、只写非可推导事实、按摩擦增量"。**这把"人写为主 + prune 裁冗余"抬高为唯一硬价值，把"AI 生成草稿冷启动"降为高危。**
3. **六个硬事实全部核实通过**（含 Claude Code v2.1.277 官方 changelog），但其中两条的**解读方式**需要修正。

**建议**：不暂停整体方向，但**收敛版里的"双向 promote 编译器"需要降级为可选探针**；第一优先级锁定在**"上下文健康（doctor）"单品**——它不依赖 canonical、不依赖多目标、零门槛、直接命中 ETH 论文验证过的真实痛点（stale/冗余/可推导内容烧 token）。

---

## 1. 六条事实核查结果

| # | 事实 | 核查结果 | 出处 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | AGENTS.md 60k+ 仓库、24+ 工具读取 | ✅ 属实 | [agents.md](https://agents.md/)；[Linux Foundation AAIF 公告](https://aithority.com/?p=597756/) | 2025.12 由 OpenAI+Anthropic 联合捐给 AAIF（Linux Foundation），与 MCP、goose 并列为三大奠基项目 |
| 2 | Claude Code v2.1.277（2026.09.18）回退读取 AGENTS.md | ✅ 属实 | [Claude Code 2.1.277 changelog](https://claudekit.io/en/updates/claude-code-2-1-277) | **关键细节：是"回退"不是"合并"**——有 CLAUDE.md 时只读 CLAUDE.md，不读 AGENTS.md；双文件并存是残留痛点 |
| 3 | Claude 原生 memory 成熟（auto memory / subagent MEMORY.md / Managed Agents） | ✅ 属实 | [Anthropic 官方博客](https://claude.com/de/blog/claude-managed-agents-memory) | Managed Agents memory 2026.04.23 公测，Netflix/Rakuten/Wisedocs/Ando 采用 |
| 4 | ETH Zurich 论文 | ⚠️ **解读需修正** | [ETH SRI Lab 原文](https://www.sri.inf.ethz.ch/publications/gloaguen2026agentsmd) | 见 §2，准确结论比蓝图引用更精细 |
| 5 | "首遍错误降 97%" | ⚠️ 厂商营销数字 | 同上 | 来自 Rakuten 客户证言，非第三方研究，**不应作为论据**，只作背景 |
| 6 | 62% agent 文件复述 linter 内容 | ⚠️ 来源未独立核实 | 原见 stackness 博客转述 | 未找到一手研究，降级为"方向性观察" |

**结论**：六条事实的"骨架"都真实（方向反转的根基是扎实的），但**事实 4/5/6 的强度被原蓝图高估**，且事实 2 的"回退而非合并"这个细节对产品设计有直接含义（见 §4）。

---

## 2. ETH Zurich 论文的准确结论（关键修正）

**论文**：Gloaguen, Mündler, Müller, Raychev, Vechev《Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?》(ICLR 2026 Workshop, arXiv:2602.11988)

| 条件 | 成功率变化 | 成本变化 |
| --- | --- | --- |
| 无上下文文件 | 基线 | 基线 |
| LLM 生成 | **-2%~-3%**（5/8 场景下降） | +20~23% |
| 开发者手写 | **+4%** | +19~20% |

**核心机制**（比"差异不显著"更尖锐）：
- Agent **忠实执行**上下文指令（工具调用频率涨 2.5 倍），问题不是没读，而是**指令制造了不必要的工作**。
- LLM 生成文件的主要问题是**冗余**——复述仓库已有文档；移除文档后同文件反而 +2.7%。
- 研究者结论：**"从空文件开始、按摩擦增量添加，每条指令问'去掉它 Agent 会不会犯无法恢复的错'"**。

**对 EvoKit 的四个直接含义**：
1. **"prune 裁冗余"是被学术验证的硬价值**，不是拍脑袋——LLM 生成/冗余上下文是负收益 + 高成本。
2. **"AI 生成草稿冷启动"是高危方向**——Hy4 主张的"AI 生成 80 分草稿"恰好撞在论文的负收益区间。冷启动的正确形态应是"**空文件起步 + 按摩擦增量**"，而非"AI 预生成"。
3. **"人写为主"是对的**，但要强化为"**只写非可推导事实**"（工具链偏好、约定边界、不能碰的禁区），删掉目录布局/依赖表/架构总览。
4. 原蓝图"编译 + token 预算"里的 **token 预算**是真价值（+20% 成本是硬痛），但 **compile 本身**不产生价值——它只是搬运，价值在"搬什么、不搬什么"（即 prune/健康）。

---

## 3. 竞品正面对比表

| 竞品 | 定位 | 核心能力 | 成熟度 | EvoKit 可差异化处 |
| --- | --- | --- | --- | --- |
| **rulesync** (dyoshikawa/rulesync) | 单一事实源→多工具编译 | init/generate/import/convert，支持 30+ 工具，含 MCP/skills/hooks/permissions | MIT，1.5k stars，2026.09 一月内发 4 个大版本 | 无——这几乎就是收敛版编译器 |
| **rulesync** (juwonllee fork) | 同上+静态分析 | ART(抽象规则树)+linter+编译器+`receipt`(漂移指纹)+`explain`(context lens) | 较早期 | receipt/explain 已覆盖"漂移+可解释" |
| **Ruler** (@intellectronica/ruler) | 单向规则同步 | `.ruler/AGENTS.md → 各工具 config`，ruler apply/revert | 较早期，单向 | 无 |
| **Skillwright** | 规则库+编译 | canonical 库 + 编译到 tool 格式 | 商业化 | 无 |
| **AgentDepot** | 规则库目录 | battle-tested rules 分享 | 内容平台 | 无 |
| **Claude Code /doctor** | 内置裁剪 | prompt-audit 审计 CLAUDE.md/AGENTS.md 过时/矛盾指令 | 原生内置 | 仅 Claude、仅诊断 |

**残酷的结论**：**"单一事实源编译器 + 漂移检测 + token 预算 + context explain"这个组合已经被 rulesync 系占满，且是 MIT 开源。** 收敛版蓝图若把核心押在编译器 + 双向 promote，等于在已被占满的格子上做第二份。

**EvoKit 仍可能存在的缝隙**（需需求验证确认）：
1. **"上下文健康"作为独立可安装 CLI 单品**（而非绑死编译器）：对**现有** AGENTS.md/CLAUDE.md 原地做 prune/审计/stale/敏感扫描，不以 canonical 为前提。rulesync 的 receipt/explain 需要你先迁移到它的 .rulesync/ 体系，对存量散落的配置文件无用。
2. **按 ETH 论文的"非可推导事实"方法论做内容质量工具**：区分"可删的冗余"（目录/依赖/复述 linter）vs"不可删的因果"（约定边界/坑），这个判断规则是算法资产。
3. **本地优先、无账号、无云端**：rulesync 的 dashboard 版是云端多仓库团队向，Ruler/rulesync CLI 需 npm；本地 Git 托管、零遥测仍是差异化。

---

## 4. 需求验证提纲 + kill switch（待执行，非本报告可完成）

四位评审要求"M0 前访谈 3-5 个多工具团队"。这是**人工访谈**，无法由我独立完成，需要你配合执行。访谈提纲如下：

### 4.1 目标对象
同时使用 ≥2 个 AI 编程工具（如 Claude Code + Cursor，或 Codex + Copilot）的开发团队/个人。

### 4.2 五个问题

1. **你们现在有几个"上下文文件"？**（AGENTS.md / CLAUDE.md / .cursor/rules / copilot-instructions，几个、谁在维护）
2. **"同一规则在不同工具里不一致"多久发生一次？发生时怎么发现、怎么修？**（这是 drift 痛点的直接验证）
3. **如果只保留一个文件（AGENTS.md），你们会失去什么能力？**（验证 scoped/on-demand 层是否是真需求）
4. **你们的上下文文件里，有多少是"AI 从代码/package.json 就能看出来"的内容？有没有想过删掉？**（验证 prune 需求）
5. **如果有一个本地 CLI，能告诉你"这个 AGENTS.md 每次会话白烧多少 token、哪些行是冗余的、哪些已经过时"，你会装吗？**（验证"上下文健康"单品）

### 4.3 Kill switch（决策闸门）

| 信号 | 决策 |
| --- | --- |
| 问题 2 答案普遍是"我们只用一份 AGENTS.md，从不漂移" | **砍掉编译器 + promote，只做"上下文健康"单品** |
| 问题 4 答案普遍是"没想过 / 无所谓" | prune 需求存疑，token 预算降级为次要卖点 |
| 问题 5 答案普遍是"不会装，用 /doctor 够了" | **暂停整个重构**，回退到 v1.x 修补路线 |
| 问题 3 答案普遍是"scoped/按需规则确实需要" | scoped/on-demand 编译保留价值，M1 单目标扩展 |

---

## 5. 对收敛版方向的修正建议（本轮新增）

基于上述证据，我作为主理人提出**第二轮修正**（需要你拍板，是否再拉四位评审确认）：

| 原收敛版 | 本轮修正 |
| --- | --- |
| 核心 = 双向 promote 同步 + 上下文健康 | **核心 = 上下文健康（doctor）单品；promote/编译器降级为"需求验证通过后"的可选探针** |
| 冷启动 = AI 反向生成草稿 | **冷启动 = 空文件起步 + 按摩擦增量**（AI 生成草稿撞 ETH 负收益区间） |
| 三项资产（含双向 promote） | **第一资产 = 上下文健康引擎（prune/审计/token/stale + 非可推导事实判别规则）；promote 暂移出** |
| M1 = init + compile（AGENTS.md 单目标） | **M1 = doctor 单品（对现有文件原地健康检查），不建 canonical** |

**理由一句话**：编译器赛道已被 rulesync 系（MIT）占满，而"上下文健康"是 ETH 论文验证过、且现有竞品都要你先迁移才能用的空白——它更小、更可验证、更不依赖假设。

---

## 附：本次核查引用的关键出处

- AGENTS.md 官网与 60k 数据：https://agents.md/
- Linux Foundation AAIF 成立公告（AGENTS.md 捐赠）：https://aithority.com/?p=597756/
- Claude Code v2.1.277 changelog（AGENTS.md 回退读取）：https://claudekit.io/en/updates/claude-code-2-1-277
- Anthropic Managed Agents memory 官方博客：https://claude.com/de/blog/claude-managed-agents-memory
- ETH Zurich 论文原文：https://www.sri.inf.ethz.ch/publications/gloaguen2026agentsmd （arXiv:2602.11988）
- rulesync（dyoshikawa）：https://github.com/dyoshikawa/rulesync ；https://developertoolkit.ai/en/ecosystem/frameworks/rules-sync/
- rulesync（juwonllee fork，receipt/explain）：https://github.com/juwonllee2024-dotcom/rulesync
- Ruler：https://github.com/intellectronica/ruler （经 gist 转述）
