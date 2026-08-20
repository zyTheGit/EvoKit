---
description: 知识库完整性深度检查
---

# /evokit-boot — 知识库完整性检查

对知识库执行深度完整性检查，比 SessionStart 钩子的快速检查更全面。

## 检查项

1. **目录结构** — `evokit/`、`knowledge/`、`.pending/` 目录是否存在
2. **索引文件** — `knowledge-index.md` 是否存在且格式合法（`## 个人知识` / `## 项目知识` section）
3. **条目完整性** — 索引中引用的每个条目文件是否都存在于 `knowledge/` 下（悬空检测）
4. **无孤儿条目** — `knowledge/` 中的条目是否均被索引引用（反向漂移检测，ADR 0003）
5. **Frontmatter 合法性** — 每个条目含必填字段（id、scope、type、source、confidence、created），且 confidence 落在三档合法取值
6. **待确认条目** — `.pending/` 中是否有待确认知识（提示运行 `/evokit-learn`）
7. **CLAUDE.md 行数** — 是否 ≤ 150 行

> 索引漂移（孤儿/悬空）可由 `evokit doctor --fix` 从实际条目重建索引修复；完整健康诊断（frontmatter / 积压 / 分布）用 `evokit doctor`。

## 用法

直接运行 `/evokit-boot`，无需参数。

## 自检

**运行前：**
- 这是本会话第一次运行 `/evokit-boot` 吗？（SessionStart 钩子已执行快速检查）
- 最近是否修改过知识库文件？（修改后建议运行一次）

**运行后：**
- 有 `✗` 标记？调查并修复后再继续
- 有待确认条目？运行 `/evokit-learn` 确认或拒绝

## 示例输出

```
[EvoKit Boot] ═══════════════════════════
  ✓ evokit/ 目录结构
  ✓ knowledge-index.md 格式
  ✓ 索引引用 5 个条目，全部存在
  ✓ 条目 frontmatter 合法性
  ⚠ .pending/ 有 2 个待确认条目（运行 /evokit-learn）
  ✓ CLAUDE.md: 112/150 行
════════════════════════════════════════
```
