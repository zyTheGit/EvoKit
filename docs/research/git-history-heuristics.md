# 研究笔记 — Git 历史提取候选：commit message pattern → 约定的启发式

> 关联车票：GitHub #28（wayfinder:research）。
> 性质：**前置研究**，非 ADR。产出是「哪些 commit message 特征值得提取、如何避免噪声」的启发式设计，
> 供后续实现 git-history 提取逻辑时对齐。本文引用的「主数据源」是本仓库自已的 conventional commits 历史
> + CONTEXT.md / ADR 0002 确定的模型约束。

## 1. 模型约束（来自 CONTEXT.md / ADR 0002，非新决策）

- 来源 `source=git-history` 的候选**必须**走 `.pending/` + 用户确认背书（人工背书唯一闸门，ADR 0002）。
- `type` 候选以 `convention` / `workflow` 为主；`scope` 确认时人工裁定（默认当前项目）。
- confidence 入库后为 `FRESH(0.9)`（#26 三档常量），时间不自动衰减。
- **git-history 是「来源」不是「指令」**——由 AI 在会话中被动识别，无独立命令形态。
- 提取的终点是「提出候选」，不是「直接入库」。

## 2. 主证据：本仓库 commit 历史的结构特征

从 `EvoKit` 自己的 `git log --pretty='%s'` 取样，commit message 呈强 **Conventional Commits** 结构：

```
<type>(<scope>): <subject>       type ∈ {feat, fix, docs, refactor, chore, perf, test, ...}
```

特征观察：

| 特征 | 实例 | 可提取性 |
|------|------|---------|
| `type` 前缀分类 | `feat:` / `fix:` / `refactor:` / `docs:` / `chore:` 频繁且统一 | 高——频率即约定 |
| type 覆盖面 | `feat`+`fix`+`refactor` 占绝大多数，无 `style`/`build` 等极少出现 | type 覆盖度本身是约定 |
| 命名风格统一 | 全部小写 type + `:` + 空格，中英混合 | 高——格式即约定「commit 用 conventional format」 |
| `(scope)` 可选 | 出现 `(Homebrew Formula)` 等 | 低——scope 用不用是弱信号 |
| 空提交 | `Merge branch '...'` | **排除**——非约定信息 |
| 混沌历史（若项目的 message 无结构） | `perf: 优化 evokit -V/--help` | 无稳定 pattern，噪声 > 信号 |

**核心判读**：只有当项目 commit message 在**一段时间窗口内呈现稳定、可归类的 pattern** 时，才值得提出「commit 使用 XX 约定」的候选；否则整条提取路径都被噪声支配，应**不提示**（宁可漏提，不可误提——误提进 `.pending/` 消耗人工背书注意力）。

## 3. 启发式规则设计

### 3.1 前置门控：pattern 稳定性（数据门槛）

提取前先判定「是否值得提取」。用 commit message 的**结构可归类率**做闸门：

- 取最近 N=60 条 commit subject（建议上限，避超大仓库开销；可配置）。
- **结构匹配率** = 命中 `^<type>([(scope)])?: ` 前缀的条数 / 总条数。
- 规则：
  - `结构匹配率 ≥ 0.7` → 提出「commit 使用 `<type>: <subject>` Conventional-commit 格式」候选（type=workflow）。
  - `0.3 ≤ 率 < 0.7` → 弱信号，**仅提出弱候选、醒目标注不确定**，或降级为不提取。
  - `率 < 0.3` → **不提取**（混沌历史，噪声支配）。
- 要求样本数 `≥ 20` 条 message 才启用判定（小样本下任何比率都不可信）。

### 3.2 type 词包直觉（约定内容）

若门控通过，从 message 分类中抽取该项目的固定 type 词包作为约定细节：

- 通过 `type` 前缀去重聚合，记录「出现 ≥ 2 次的 type 及其含义」
  （如 `feat`/`fix`/`refactor` → 「功能/缺陷修复/重构分别用前綴」）。
- 约定的粒度以「该项目确实在用的词」为准，不做理论枚举。
- 若出现项目独有的 type（`codereview:`、`doc:` 等），也纳入候选（个性化约定）。

### 3.3 排除清单（抗噪声）

以下 message 一律**不计入**，不做提取素材：

| 排除类别 | 判定 | 理由 |
|---------|------|------|
| Merge / revert / release | subject 以 `Merge`/`Revert`/`release`/`publish` 开头，或含版本号 bump | 非项目约定，是编排噪音 |
| 单条、一次性长描述 | 无 type 前缀且依赖叙述 | 无 pattern，无法归类 |
| 训练/工具生成 | 依赖提交、依赖升级批量 | 自动过程，非人工约定 |
| 阈值内低频词 | 该 type 仅出现 1 次 | 样本不足，不构成约定 |
| 含敏感信息 | subject 含令牌/路径/密钥 | 安全红线，禁入索引 |

### 3.4 输出：不产出正文，只产出「候选线索」

按模型约束，git-history 提取的产物**不是已成型知识条目**，而是**候选线索**（供确认闸门）：

- 每条候选：`pattern`（如 `^feat: `）+ `建议 type`（convention/workflow）+ `置信度`（不落 0.9，标记为「待确认」）+ 若干支撑样本。
- 候选写入当前项目 `.pending/`，`source=git-history`，`status: pending`，`scope` 留空待裁定。
- 无独立命令；由 AI 在会话中触发，经 `/evokit-learn` 确认（#25 已定稿的确认背书路径）。
- **候选不更新 `knowledge-index.md`**（未背书知识不进索引常驻）。

### 3.5 风险与降噪总原则

1. **漏提优于误提**：无法稳定归纳时保持沉默，避免污染人工背书注意力。
2. **时间不衰减**：不因 commit 久远自动降 confidence（与 ADR 0002 一致）；过时由对话/复审二分判断。
3. **项目专属性**：pattern 来自当前项目仓库的 commit 历史，不从外部 dataset 猜。
4. **重复去重**：同一 pattern 若已是 knowledge/ 条目或在案，不再重复提候选。

## 4. 落地建议（供 #28 或后续 task 消费）

- 提取器作为 `src/core/git-history.ts` 单模块：输入 `cwd`（git repo），输出候选线索数组。
- 门控（3.1）前置做低开销短路：先 `git log -60 --pretty=%s` 取样即可，无必要全量遍历。
- 候选落 `.pending/` 的序列化复用 `src/core/knowledge.ts` 现有 frontmatter 机制，互补内容字段。
- 对接已验证：#26 三档常量、#25 确认背书双路径。`knowledge.ts` 尚无 `.pending/` 读写引擎，随实现补齐。

## 5. 主数据源清单

- 仓库自身 `git log --pretty='%s'`（EvoKit 仓库，conventional commits 实证样本）。
- `CONTEXT.md`：Git 历史分析定义、来源表、交互入口命名、`.pending/` 与确认流程。
- `docs/adr/0002-four-axes-and-confirmation-gate.md`：人工背书唯一闸门、git-history 改「提候选+确认」。
- #26 决议：confidence 三档常量；#25 决议：确认背书双路径。
