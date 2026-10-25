# EvoKit 方向终判：轮子已齐，重构不再成立

> 版本：FINAL ｜ 日期：2026-10-25 ｜ 主持人：齐活林（Qi）· 交付总监
> 触发：用户原则「不重复造轮子，能用线上高评分项目就用」
> 结论级别：**建议停止 v2.0 重构，重新定位 EvoKit**

---

## 0. 一句话结论

**按"不重复造轮子"原则核查后，EvoKit 2.0 计划中设想的每一个能力——编译器、漂移检测、上下文健康检查——都已有成熟的开源项目实现。继续重构就是重造轮子。EvoKit 不该做"又一个上下文工具"，而应该重新回答一个更根本的问题：它还有什么别人没做的价值。**

---

## 1. 轮子全貌（本次核查新增，决定性的）

| 能力 | 已有轮子 | 成熟度 | 覆盖范围 |
| --- | --- | --- | --- |
| 单一事实源 → 多工具编译 | **rulesync**（dyoshikawa/rulesync） | MIT，1.5k stars，2026.09 一月 4 大版本 | 30+ 工具，含 MCP/skills/hooks/permissions |
| 编译 + 漂移检测 + token 预算 + explain | **rulesync**（juwonllee fork） | 有 `receipt`（漂移指纹）、`explain`（context lens） | 抽象规则树 + linter + 编译器 |
| 单向规则同步 | **Ruler**（@intellectronica/ruler） | MIT，v0.3.x | .ruler/ → 各工具 config |
| **上下文健康检查（doctor 单品）** | **ctxlint**（@ctxlint/ctxlint） | npm，1.1.3，引用了 ETH 论文 | stale-file-ref / 死命令 / token 浪费 / 硬编码密钥 / **`slim` 自动修复** / **`diff` 漂移检测** / MCP 校验 / SARIF / watch |
| 上下文 lint + LLM 验证 + 死规则 | **instrlint** | npm，0.2.4，487 tests | 死规则（复述 linter）/ token 预算 / 矛盾检测 / --fix / LLM 验证 |

**关键结论**：

1. 我上一轮建议的"上下文健康（doctor）单品"——**ctxlint 已经完整实现了，而且比我们规划的更全**（连 `slim` 自动修复、`diff` 漂移检测、MCP 校验、SARIF 输出都有，还直接引用了 ETH Zurich 论文做规则依据）。
2. "编译器 + 漂移"——**rulesync 已经实现**。
3. 也就是说，M-1 到现在的**整条重构路径，终点都是已存在的轮子**。

---

## 2. 诚实的自我纠错

回顾整个讨论链条，我需要承认一个判断失误：

| 阶段 | 当时的判断 | 实际情况 |
| --- | --- | --- |
| v2.0 蓝图 | "漂移治理是空白市场，没人做" | MiMo 当时就核查出 rulesync/Ruler 已存在 |
| 四人评审收敛 | 押注"上下文健康（doctor）是空白" | **ctxlint/instrlint 已实现，且更完整** |
| M-1 报告 | 建议"doctor 单品"为第一方向 | 同上，是重造轮子 |

**MiMo 在评审时的提醒是对的**："promote/编译器是未经验证的假设，且竞品已存在"，而我在收敛时把它弱化成了"降级为探针"，没有彻底面对"轮子已齐"这个事实。直到你提出"不重复造轮子"原则，才把这个问题彻底摆到台面上。

---

## 3. EvoKit 还剩什么？（诚实的剩余价值盘点）

把所有已实现的能力划掉后，EvoKit 剩余的真实资产是：

| 资产 | 状态 | 是否还有独占价值 |
| --- | --- | --- |
| 四助手适配器（claude/codex/opencode/pi 安装） | 已被 rulesync 的编译能力覆盖 | ❌ 无 |
| 人工背书知识引擎 | 已被 Claude auto memory / ctxlint / instrlint 分食 | ❌ 无 |
| 架构决策推理链（ADR 式） | madr/adr-tools 成熟实践 | ❌ 无独占 |
| **本地优先 + 零遥测 + Git 托管** | ctxlint 也本地、rulesync 也本地 | ⚠️ 弱差异化 |
| 已发布的 v1.2.0 存量用户 | 真实资产 | ⚠️ 需盘点 |

**结论：按"不重复造轮子"原则，EvoKit 2.0 重构（编译器 + 健康检查）的正当性已不成立。** 唯一可能的价值缝隙，需要你基于真实情况判断（见 §5）。

---

## 4. 三条可选的出路（都基于"不造轮子"）

### 选项 A：放弃重构，收缩为"薄封装 + 集成层"

不自己造轮子，而是做一个**把 ctxlint + rulesync + instrlint 串起来的轻量 CLI**：
- `evokit` 变成 `ctxlint` 的本地 frontend，或直接推荐用户用 ctxlint
- 价值极薄，且"为什么不用原工具"这个问句很难回答

**评估**：最诚实的做法，但商业/项目价值接近于零。

### 选项 B：转向"集成 + 最佳实践编排"（基于现有轮子，做差异化的组合）

不写 lint 引擎、不写编译器，而是做一个**"上下文工程最佳实践的一键脚手架 + 编排层"**：
- 内部调用 ctxlint（lint）+ rulesync（编译）作为依赖
- EvoKit 提供的是**决策层**：按 ETH 论文的"非可推导事实"方法论，引导用户"该写什么、放哪一层、何时该删"
- 类似"eslint 之上的一套 rule 预设 + 工作流"，而不是另一个 eslint

**评估**：有微弱差异化（编排/方法论 > 引擎），但容易被 ctxlint/rulesync 各自补上。

### 选项 C：回到 v1.x，只做"可信度修复"，不再追求新方向

四位评审 M0 阶段列出的 P0 断点（文档与实现脱节、pending 提示断链等）仍值得修——但修完的目的不是为 v2.0 铺路，而是**让 v1.2.0 存量用户不被误导**，然后项目进入维护模式。

**评估**：最稳妥、最不折腾；接受"EvoKit 的历史使命已完成"。

---

## 5. 需要你回答的三个问题（决定走哪条路）

在继续任何动作前，我需要你基于真实情况回答（这些是我无法替你判断的）：

1. **EvoKit 的 v1.2.0 到底有多少真实用户？** 是"有团队在用"还是"个人 side project 没有用户"？这决定了选项 A/B/C 的成本收益。
2. **你做 EvoKit 的原始动机是什么？** 是"想解决自己多工具协作的痛点"，还是"想做一个有用户的开源项目"？如果是前者，直接用 ctxlint/rulesync 就够了，不必维护自己的。
3. **你是否有 ctxlint / rulesync 覆盖不到、但你自己真实在痛的场景？** 如果有，那才是 EvoKit 唯一该做的方向；如果没有，说明轮子确实齐了。

---

## 6. 我的建议

**在没有回答 §5 的三个问题之前，停止任何重构动作。**

我的倾向是：
- 如果答案是"side project、无用户、动机是解决自己痛点" → **选项 C**：直接把仓库里的 README 顶部加一句"本项目功能已被 ctxlint/rulesync 等更成熟的工具覆盖，建议迁移"，进入归档。
- 如果答案是"有真实用户、有 ctxlint 覆盖不到的真实痛点" → 带着那个具体痛点回来，我们再评估该不该做一个**极其薄**的差异化点。

**原则先行是对的。** 这一轮核查的价值，是避免了 EvoKit 花几个月重造三个已经存在且更成熟的开源轮子。

---

## 附：本次核查引用的关键出处

- rulesync（dyoshikawa）：https://github.com/dyoshikawa/rulesync
- rulesync（juwonllee fork，receipt/explain）：https://github.com/juwonllee2024-dotcom/rulesync
- Ruler：https://github.com/intellectronica/ruler
- **ctxlint（上下文健康检查，最接近"doctor 单品"）**：https://npmjs.com/package/@ctxlint/ctxlint ；https://github.com/lguzzon-scratchbook/Ctxlint
- instrlint：https://socket.dev/npm/package/instrlint
- 生态对比指南（developertoolkit，2026-09-26 实测）：https://developertoolkit.ai/en/ecosystem/frameworks/rules-sync/
- ETH Zurich 论文（Gloaguen et al. 2026）：https://www.sri.inf.ethz.ch/publications/gloaguen2026agentsmd
