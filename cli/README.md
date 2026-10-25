# EvoKit CLI

个人多工具偏好同步工具（零依赖）。**一份偏好，同步到多个 AI 工具，不用重复维护。**

## 安装

```bash
# 方式一：npx 直接跑（无需安装）
npx @evokit/cli sync

# 方式二：全局安装
npm install -g @evokit/cli
evokit sync
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

## 工作原理

- 源文件是唯一事实源（canonical），改它，然后 `evokit sync`
- 入口文件由 `<!-- evokit-managed -->` 注释包裹，不要手动改
- `evokit check` 会做两层检查：① 三入口是否与源一致 ② 调 `ctxlint` 做内容健康检查

## 说明

- 零运行时依赖，纯 Node.js（>=18）
- 本地优先，无云端、无遥测
- 内容健康检查复用开源的 `@ctxlint/ctxlint`（`npx` 拉取，不内置）
