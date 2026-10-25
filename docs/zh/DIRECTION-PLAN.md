# EvoKit 最新方向（2026.10）：从"适配器框架"重构为"单一事实源编译器"

> 版本：v2.0 ｜ 日期：2026-10-25 ｜ 作者：齐活林（Qi）· 交付总监
> 结论级别：**可直接进入全方位重构**

---

## 0. 一句话结论

**EvoKit 现有方向（"四助手适配器 + 人工背书知识引擎"）已被 2026 年的行业演进系统性超越，需要重构，而非修补。**

新的方向是：**从"给每个助手装一套适配器"反转为"维护一份单一事实源，编译到各助手的原生格式"。**

一句话：**EvoKit 不再自己发明知识引擎，而是成为 AGENTS.md / CLAUDE.md / SKILL.md 时代的"编译器 + 同步层 + 审计层"。**

---

## 1. 为什么必须重构（2026 年的四个硬事实）

以下事实直接推翻了 EvoKit v1.x 的核心假设，均有出处。

### 事实一：AGENTS.md 已成为跨工具事实标准，而 EvoKit 的"多助手适配器"是反向努力

- AGENTS.md 由 OpenAI Codex 2025.08 提出，2025.12 捐给 Linux 基金会，2026 年已被 **60,000+ 开源仓库**采用，被 Codex / Cursor / Copilot / Gemini CLI / Aider / Zed / Windsurf / opencode / Jules / Factory 等 **24+ 工具**原生读取。
- 关键转折：**Claude Code 自 v2.1.277（2026.09.18）起原生回退读取 AGENTS.md**——EvoKit 需要为 Claude/Codex/OpenCode/Pi 各写一套适配器的理由，已经被一个开放标准消解了大半。

**结论**：EvoKit 花最大力气做的"四适配器模板平移"，方向是逆潮流的。正确姿势是**拥抱 AGENTS.md，把自己变成"编译到它"的工具**。

### 事实二：原生 memory 已经成熟，EvoKit 的"人工背书知识引擎"缺乏不可替代性

- Claude 的 memory 2025.08 上线，2026.03 已免费全量开放；2026.02（v2.1.33）加入 **subagent 级持久 MEMORY.md**（前 200 行/25KB 注入 system prompt，可 Read/Write/Edit）。
- Claude Code 的 **auto memory** 每个会话自动加载，`/doctor` 还能"裁掉模型能从代码推出来的内容"。
- Anthropic 2026.04 推出 Managed Agents 企业级 memory（Netflix/Rakuten 等已用，声称首遍错误降 97%）。

**结论**：EvoKit 的"对话提取 → 人工确认 → 索引"这条链，与 Claude 原生 auto memory 高度重叠，且后者**零人工成本**。EvoKit 的人工背书，从"质量优势"变成了"额外负担"的嫌疑更大。

### 事实三：知识分层范式已经定型，EvoKit 的"三层索引"是重复造轮子

2026 年业界共识的分层模型（codersera/stackness 等）已经非常清晰：

| 层 | 载体 | 加载时机 | EvoKit 对应物 |
| --- | --- | --- | --- |
| 常驻指令 | AGENTS.md / CLAUDE.md | 每次 | 勉强对应 knowledge-index |
| 按需能力 | SKILL.md | 触发时 | 无（EvoKit 没有 skill 产物） |
| 作用域规则 | `.cursor/rules/*.mdc` / `.claude/rules` | 按文件路径 | 无 |
| 自动记忆 | auto memory / MEMORY.md | 每次/按需 | 对应 pending→knowledge |

**结论**：EvoKit 的"索引常驻 + 正文按需"是个自创抽象，而业界已经用 AGENTS.md + SKILL.md + rules 把它标准化了。继续维护自创抽象，等于和整个生态对着干。

### 事实四：研究数据显示"人写上下文"与"机器生成上下文"的价值分界清晰

- ETH Zurich（2026.09.29，100 仓库）：**开发者手写上下文 +2.4% 成功率**，LLM 生成的上下文 **-0.5% ~ -2%**（且 token 成本 +23%），差异不显著。
- 62% 的 agent 文件在复述 linter 已经强制的东西（"The code IS the documentation"）。
- Mem0 论文（2025.04）：完整上下文 72.90% vs Mem0 66.88%，却付出 26,031 vs 1,764 token。

**结论**：EvoKit 的核心动作是"让 AI 自动提取知识"——而这正是研究里**效果最差、成本最高**的那一路。EvoKit 应该倒过来：**聚焦"人写什么、放哪一层、怎么不漂移"，而不是"AI 自动学"。**

---

## 2. 新方向：EvoKit 2.0 —— 单一事实源编译器（Single Source-of-Truth Compiler）

### 2.1 定位转变

| | EvoKit v1.x（现状） | EvoKit 2.0（重构后） |
| --- | --- | --- |
| 核心动作 | 给每个助手装适配器、AI 自动提取知识 | 维护一份 canonical 上下文，编译到各助手 |
| 知识来源 | 对话提取 + 人工背书 | **人写为主**，AI 只做裁剪/同步建议 |
| 与生态关系 | 自创三层索引 | 拥抱 AGENTS.md / CLAUDE.md / SKILL.md / rules |
| 价值主张 | "让 AI 秒懂项目" | "一份上下文，永不漂移，跨 24+ 工具" |
| 竞争壁垒 | 低（原生 memory 已覆盖） | 中高（漂移治理 + 裁剪引擎 + 审计是空白） |

### 2.2 新价值主张

**EvoKit 2.0 = 项目上下文的"单一事实源 + 编译器 + 漂移治理"。**

- **单一事实源**：一份 canonical 上下文（YAML/Markdown），按"层"组织（常驻/按需/路径规则/记忆）。
- **编译器**：编译到 AGENTS.md、CLAUDE.md（含 @import）、SKILL.md、`.cursor/rules/*.mdc`、`.github/copilot-instructions.md` 等目标格式。
- **漂移治理**：检测"同一事实在多份产物里不一致"——这是多工具团队今天真正痛的、且没人做好的点。

### 2.3 为什么这是对的缝隙

- **原生 memory 吃掉了"AI 自动记忆"**，但**没人做"多工具团队上下文漂移治理"**——这正是 EvoKit 之前"多助手"野心的正确落点。
- **AGENTS.md 解决了"一份文件"，但没解决"从一份文件编译到多份 + 检测漂移 + 裁剪上下文成本"**。
- Skillwright、AgentDepot 等竞品在做"规则库 + 编译"，但 EvoKit 可以靠**漂移审计 + `/doctor` 式的裁剪引擎 + 本地优先**差异化。

---

## 3. 全方位重构蓝图

### 3.1 新架构（替换现有 src 结构）

```
evokit/
  context/                      # 单一事实源（canonical，人写为主）
    project.yaml                # 元数据 + 分层声明
    always/                     # → 常驻层（AGENTS.md / CLAUDE.md）
      overview.md
      commands.md
      conventions.md
      guardrails.md
    on-demand/                  # → 按需层（SKILL.md）
      postgres-migration/
        SKILL.md
        scripts/
    scoped/                     # → 路径规则层（.cursor/rules / .claude/rules）
      api.md        (paths: src/api/**)
    memory/                     # → 记忆层（人工晋升的稳定事实）
  targets/                      # 编译产物（生成，勿手改）
    AGENTS.md
    CLAUDE.md
    .cursor/rules/*.mdc
    skills/*/SKILL.md
  src/
    compile/                    # 编译器：canonical → targets
    drift/                      # 漂移检测引擎（核心差异化）
    prune/                      # 裁剪引擎（/doctor 式，去掉 AI 能推出来的）
    audit/                      # 敏感信息 / 失效检测 / 完整性
    sync/                       # 跨工具同步（替代旧 adapters）
  cli/
    evokit compile              # 编译到所有 targets
    evokit drift                # 检测产物漂移（新增，核心）
    evokit prune                # 建议裁剪冗余上下文
    evokit doctor               # 完整性 + 审计（保留语义，重写）
```

### 3.2 核心命令（替换旧命令）

| 旧命令 | 新命令 | 变化 |
| --- | --- | --- |
| `evokit learn` | **废弃** | 不再主打"AI 自动提取"，改为 `evokit memory promote`（人工晋升） |
| `evokit install <adapter>` | **废弃** | 不再装适配器，改为 `evokit compile`（生成产物，助手原生读取） |
| `evokit review` | **废弃** | 语义冲突问题随重写消解 |
| `evokit doctor` | 保留重写 | 从"知识库健康"转向"上下文健康 + 漂移审计" |
| — | **`evokit compile`** | 新增，核心 |
| — | **`evokit drift`** | 新增，核心差异化 |
| — | **`evokit prune`** | 新增，裁剪上下文成本 |

### 3.3 分阶段执行

| 阶段 | 内容 | 产出 | 时间 |
| --- | --- | --- | --- |
| **M0** | 砍掉 v0/v1 残留 + 修复信任断点 | 清理后的仓库，文档与实现一致 | 1 周 |
| **M1** | 定义 canonical schema + 实现 `compile`（AGENTS.md + CLAUDE.md 双目标起步） | 最小可用编译器 | 2–3 周 |
| **M2** | 实现 `drift` 漂移检测（核心差异化） | 漂移审计命令 | 2–3 周 |
| **M3** | 实现 `prune` 裁剪 + `doctor` 重写 | 成本治理 | 2 周 |
| **M4** | 扩展 targets（SKILL.md / .cursor/rules / copilot-instructions） | 全格式覆盖 | 2 周 |
| **M5** | 端到端验证（多工具团队真实项目） | 证据 + 收尾 | 2 周 |

---

## 4. 与旧方案的差异（为什么这次是重构不是修补）

| 维度 | 旧方案（DIRECTION-PLAN v1.0） | 本方案 v2.0 |
| --- | --- | --- |
| 核心动作 | 修文档、验证"人工背书闭环" | **推翻"适配器 + 自动提取"范式，转向"单一事实源编译器"** |
| 对原生 memory 的态度 | 把它当竞品，强调差异化 | **承认它赢了"自动记忆"，转向它没做的"漂移治理 + 编译"** |
| 对 AGENTS.md 的态度 | 未纳入 | **作为核心编译目标，放弃自创三层索引** |
| 知识来源 | AI 自动提取为主 | **人写为主，AI 只做裁剪/同步建议** |
| 差异化 | 人工背书（已被原生 memory 侵蚀） | **漂移检测 + 裁剪引擎 + 本地优先编译** |

---

## 5. 风险与决策闸门

### 风险

| 风险 | 缓解 |
| --- | --- |
| "编译器"赛道已有 Skillwright/AgentDepot 等 | 差异化在 **drift 漂移审计 + prune 裁剪 + 本地优先**，不做纯规则库 |
| AGENTS.md 标准仍在快速变动 | 编译器采用"目标格式可插拔"，标准变化只影响单个 target adapter |
| 彻底重构丢失现有用户 | M0 先修信任断点，提供旧知识库 → canonical 的**一次性迁移**，不抛弃已有数据 |

### 决策闸门（重构前必须回答）

1. **是否接受"放弃 AI 自动提取"这个核心转向？** —— 这是从 v1 到 v2 的根本立场变化。
2. **是否接受放弃自创三层索引，全面拥抱 AGENTS.md/SKILL.md/rules？**
3. **差异化押注在"漂移治理 + 裁剪"上，是否认可这是空白市场？**

---

## 附：2026 关键事实速查（重构依据）

- AGENTS.md：Linux 基金会 Agentic AI Foundation 托管，60k+ 仓库，24+ 工具原生读取，Claude Code v2.1.277（2026.09.18）起回退读取。
- Claude Code：auto memory 免费全量（2026.03）、subagent MEMORY.md（2026.02）、Managed Agents memory（2026.04）。
- 研究：ETH Zurich 人写 +2.4% vs LLM 生成 -0.5%~-2%（2026.09）；62% agent 文件复述 linter 已强制内容。
- 分层共识：AGENTS.md（常驻）+ SKILL.md（按需）+ rules（路径）+ auto memory（记忆）。
