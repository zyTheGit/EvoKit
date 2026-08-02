---
name: evokit
description: EvoKit 项目上下文引擎 — boot 完整性检查、知识确认背书、显式声明（Pi CLI）
allowed-tools: read write bash
---

# EvoKit Skill

Use this skill when the user asks about EvoKit, project context knowledge, boot verification, or knowledge confirmation/declaration.

## Available Commands

| Command            | Description                                                       |
| ------------------ | ----------------------------------------------------------------- |
| `evokit-boot`      | 知识库完整性深度检查（只读）                                      |
| `evokit learn`     | 确认背书：无内容列出待确认草稿，逐条确认/拒绝；有内容则显式声明   |
| `evokit review`    | 复审过期知识（confidence ≤ 0.5），confirm/retire/delete           |

## When to Use

- **Session start**: 完整性快检由 `evokit-lifecycle` 扩展自动运行
- **识别到项目/个人知识**: 静默写入 `<project>/.evokit/.pending/`，不猜测 scope，待用户确认
- **会话末有待确认**: 运行 `evokit learn` 确认背书（同一道人工背书闸门）
- **讨论模块依赖/数据流**: 索引见 `🏛` 架构条目时打开 `knowledge/` 全文追索

## 知识根

- 个人：`~/.evokit/knowledge/`（4 助手共享，agent 无关）
- 项目：`<project>/.evokit/`（随 git 走，可提交）
