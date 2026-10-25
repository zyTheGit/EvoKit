# EvoKit

**个人多工具偏好同步工具（零依赖 CLI）。一份偏好，同步到多个 AI 工具，不用重复维护。**

> 本项目曾定位为"AI 编程助手的项目上下文引擎"（v1.x，四助手适配器 + 知识引擎）。经方向研究、四人评审、证据与竞品核查后，确认该方向已被更成熟的开源项目（rulesync、Ruler、ctxlint）覆盖。现收敛为个人自用的轻量 CLI。

## 安装

```bash
# 全局安装
npm install -g @evokit/cli

# 或 npx 直接跑（无需安装）
npx @evokit/cli sync
```

## 用法

```bash
evokit init                 # 初始化全局源 ~/.evokit/context.md
evokit init --project       # 初始化当前项目 .evokit/context.md
evokit sync                 # 同步全局规则到所有入口
evokit sync --project       # 同步项目规则到该项目入口
evokit check                # 检查一致性 + ctxlint 内容健康检查
```

## 单一事实源

| 作用域 | 源文件 | 同步目标 |
| --- | --- | --- |
| 个人全局 | `~/.evokit/context.md` | `~/.claude/CLAUDE.md`、`~/.pi/agent/APPEND_SYSTEM.md`、`~/.codex/AGENTS.md` |
| 项目级 | `<project>/.evokit/context.md` | `<project>/CLAUDE.md`、`<project>/AGENTS.md` |

## 设计原则

- **零运行时依赖**，纯 Node.js（>=18）
- **本地优先**，无云端、无遥测
- **不重复造轮子**：内容健康检查复用开源的 `@ctxlint/ctxlint`（npx 按需拉取，不内置）

## 目录结构

```
cli/
  evokit.mjs     # CLI 源码（零依赖）
  package.json   # 包配置（@evokit/cli）
  README.md      # 使用说明
docs/zh/         # 方向决策记录（研究→评审→终判→路线图）
```

## 许可证

MIT
