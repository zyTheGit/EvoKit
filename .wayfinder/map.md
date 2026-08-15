# 🗺️ EvoKit v1.0 — 从自进化纠错系统到项目上下文引擎

> ⚠️ **已归档（2026-08-15）**：v1.0 已发布，本 map 的决策与「Not yet specified」清单已全部落地/作答（过期检测 → ADR 0003、Git 历史实现 → ADR 0004、doctor 指标与索引重建 → ADR 0003、v1.0 发布 → ROADMAP）。现行事实源以 `CONTEXT.md` 与 `docs/adr/` 为准；本文件保留仅作历史规划工件，不再维护。

> **wayfinder:map**

## Destination

EvoKit v1.0.0 发布：核心定位从"自进化纠错系统"转向"项目上下文引擎"。让 AI 编程助手秒懂项目，持久化 AI 不可能知道的项目/个人专属知识。所有关键决策已在 `/grill-with-docs` 质询中确认（见 `CONTEXT.md` 和 `docs/adr/0001`），本地图将决策转化为可执行的实施计划。

## Notes

- **领域模型**：`CONTEXT.md` 是术语和概念的权威来源
- **ADR**：`docs/adr/0001-project-context-engine.md` 记录了转向决策和取舍
- **技能**：每个会话应查阅 `/grilling` 和 `/domain-modeling` 技能
- **代码库**：TypeScript/Node.js，~7300 行 src + ~6100 行测试 + 模板文件
- **当前版本**：v0.6.10，发布到 npm + Homebrew
- **16 个已确认决策**：核心定位、作用域、数据模型、钩子、命令、迁移策略等

## Decisions so far

- [核心定位转向](../CONTEXT.md) — 从"自进化纠错系统"转向"项目上下文引擎"，持久化 AI 不可能知道的知识
- [对话提取](../CONTEXT.md) — T02 已决策：混合载体（CLAUDE.md+skill）、.pending/ 静默标记、对话交互确认、三种触发方式、6 类信号+4 类排除
- [作用域分层](../docs/adr/0001-project-context-engine.md) — 个人 + 项目两层；团队层搁置
- [与 Claude Code memory 关系](../docs/adr/0001-project-context-engine.md) — 增强不替代，在 evokit/ 子目录下工作
- [数据模型](../CONTEXT.md) — T01 已决策：frontmatter 9 字段、{type}-{slug}.md 命名、扁平目录、knowledge-index.md 极简+桥接
- [钩子重写](t03-hooks-rewrite.md) — T03 已决策：SessionStart 快速检查、Stop 仅提示、5 个文件删除、纯 shell 实现
- [CLAUDE.md 重写](t04-claude-md-rewrite.md) — T04 已决策：极简定位、保留思维框架重定义学习、紧凑知识协议、3 条完成标准、150 行限制
- [迁移策略](t05-migration.md) — T05 已决策：2 种格式解析、evokit migrate 命令、批量确认、归档 v0/、不降级
- [版本号](../docs/adr/0001-project-context-engine.md) — v1.0.0
- [Git 历史范围](../docs/adr/0001-project-context-engine.md) — v1.0 只做 commit message pattern
- [品牌定位](../docs/adr/0001-project-context-engine.md) — 放弃"自进化"，定义为"项目上下文引擎"

## Ticket 依赖图

```
T01（数据模型）────────────────────┐
  │                                │
  ├── T02（对话提取 prompt）        │
  │     │                          │
  │     └── T03（钩子重写）←── T01 │
  │                                │
  ├── T04（CLAUDE.md 重写）←── T01,T02 │
  │                                │
  ├── T05（旧数据迁移）             │
  │                                │
  ├── T06（CLI 清理）←── T01,T02,T03,T05 │
  │                                │
  └── T07（多助手同步）             │
```

## 前沿（Frontier）— 当前可做的票

- **T06 CLI 命令重写与废弃清理** — 已决策，待开发
- **T07a 多助手适配器同步（v1.0 范围）** — 已决策，待开发

## Not yet specified

- 过期检测的具体算法 — 基于时间？基于代码变更频率？基于用户反馈？
- evokit doctor 命令的"知识库健康"检查具体包含哪些指标？
- Git 历史 commit pattern 分析的具体实现 — 正则匹配？AI 辅助分析？
- knowledge-index.md 何时自动重建？（每次写入知识条目后？evokit boot 时？）
- v1.0.0 发布流程 — npm 发布 + Homebrew 更新 + GitHub Release 的步骤

## Out of scope

- 团队层知识共享（v1.0 不做）
- 代码扫描/AST 分析提取项目知识
- Web UI 管理面板（原 v0.7.0 规划）
- 社区插件市场
- 企业级权限管理
