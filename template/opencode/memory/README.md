# EvoKit — OpenCode Project Context Knowledge

本目录安装 EvoKit 项目上下文引擎的知识库骨架（与 4 个助手共享同一份知识，agent 无关）。

## Knowledge Roots

- **项目知识根**：`<project>/.evokit/`（随 git 走，可提交）
- **个人知识根**：`~/.evokit/knowledge/`（跨项目共享，不与任一助手私有目录绑定）

4 个助手（claude / codex / opencode / pi）共享同一份个人/项目知识（读助手无关 / 写经各自确认），知识不存放在任一助手私有 memory。

## 目录布局（每个知识根一致）

```
knowledge-index.md    # 索引（始终加载）
knowledge/            # 已背书条目（按需加载，扁平存放）
.pending/             # 待确认草稿（AI 识别后静默写入，用户确认后入 knowledge/）
```

## 工具

- **evokit-boot** — 知识库完整性深度检查（只读）
- **evokit-learn** — 确认背书 / 显式声明（同一人工背书闸门）
- **evokit-session** — 会话末 `flush_pending` 落盘在途草稿 + 提示确认（无 Stop 钩子必须调用）

## 废弃概念

v0.x 概念在 v1.0 已废弃，不再使用：`corrections.jsonl` / `observations.jsonl` / `learned-rules.md` / `evolution-log.md` / `sessions.jsonl` / `violations.jsonl` / `evokit-evolve` / evokit-memory record-*。知识改为对话提取 + 确认背书。
