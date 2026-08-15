# ADR 0004 — Git 历史提取用确定性启发式落地，产物复用确认闸门

## 状态

已接受（本轮 grilling 会话）

## 背景

CONTEXT.md + ADR 0002 声明 `source=git-history` 为第一类来源（辅助），并有一份完整的前置研究（`docs/research/git-history-heuristics.md`），但从未实现——`git-history` 枚举值是死值，没有提取器产出候选。这是"声明了能力却不存在"的缺口。

## 决策

把这条来源落地为**确定性启发式提取器**（`src/core/git-history.ts`），产物是**候选线索**，经 `.pending/` 复用已有确认闸门，不新增写入通道：

- 提取器为纯函数 `extractGitHistoryCandidates(cwd): GitHistoryCandidate[]`，严格按 research note 启发式：结构匹配率门控（≥0.7 且样本≥20 才提取）、type 词包抽取、排除清单（merge/revert/release/低频/敏感）。
- 产物候选线索（`pattern` + 建议 `type` + 支撑样本 + 待确认标记），写 `.pending/`（`source=git-history`、`status: pending`、`scope` 留空待裁定）；**候选不更新 `knowledge-index.md`**（未背书不进索引常驻）。
- 触发面：`evokit learn --git-history` 生成候选草稿到 `.pending/` 并打印摘要（**不进入确认**）；确认仍走无参 `evokit learn`。这是 learn 命令的 flag，非新命令，仍 `evokit-*` 前缀，符合"git-history 是来源不是指令、无独立命令形态"。

## 取舍

### 选择确定性启发式而非 AI 辅助分析

- **放弃**：AI 对 commit 语义的理解
- **获得**：可测试、可预测、零 token 成本、不依赖模型质量；git-history 本就是"辅助/弱信号"来源，启发式足够
- **代价**：漏提一些需语义理解的约定（"漏提优于误提"，research note §3.5 总原则）

### 选择复用 `.pending/` + 确认闸门而非新入库通道

- **放弃**：git-history 全自动直接入库
- **获得**：保住"人工背书唯一闸门"不变量（ADR 0002），规则不新增
- **代价**：git 提取候选多在确认流程里过一道

### 选择 flag 而非独立命令

- **放弃**：`evokit git-history` 独立子命令的显眼度
- **获得**：遵守"git-history 是来源不是指令、无独立命令形态"，且 `--git-history` 仍可被 AI 在会话中触发
- **代价**：发现入口藏在 learn 的子选项里，不如独立命令直观
