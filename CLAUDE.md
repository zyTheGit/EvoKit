# CLAUDE.md — EvoKit 项目入口

## 项目角色

EvoKit 是面向 AI 编码助手的**自演化系统框架**。本仓库是元项目（框架本身），`template/` 是安装到用户 `~/.claude/` 的产品。

## 核心开发原则

1. **先读后改** — 编辑任何文件前必须先 Read
2. **最小变更** — 只改必须改的，不做范围蔓延
3. **验证闭环** — 改动后必须测试/验证，不留 TODO/FIXME
4. **中文优先** — commit/注释/CLI help/文档优先中文，标识符保持英文
5. **工具链规范** — Node.js 用 fnm，Python 用 uv，禁止裸 `python3`/`pip`

## 规则文件索引

| 规则文件                     | 职责                         | 触发路径                |
| ---------------------------- | ---------------------------- | ----------------------- |
| `rules/workflow.md`          | 任务执行流程、开发步骤       | 全局                    |
| `rules/analysis.md`          | 问题分析、根因定位、影响评估 | 全局                    |
| `rules/modification.md`      | 修改代码原则、最小变更       | `src/**`, `template/**` |
| `rules/architecture.md`      | 架构设计、模块划分、扩展性   | `src/**`                |
| `rules/quality.md`           | 可维护性、可读性、稳定性     | `src/**`, `tests/**`    |
| `rules/security.md`          | 安全意识、敏感信息、权限     | 全局                    |
| `rules/testing.md`           | 测试要求、验证流程、回归检查 | `src/**`, `tests/**`    |
| `rules/git.md`               | Git 协作、提交原则、分支管理 | 全局                    |
| `rules/src-quality.md`       | 源码 lint/test 门禁          | `src/**`, `tests/**`    |
| `rules/docs-sync.md`         | 双语文档同步                 | `docs/**`, `README*`    |
| `rules/template-redlines.md` | 模板红线（无个人路径等）     | `template/**`           |
| `rules/chinese-output.md`    | 中文输出规则                 | 全局                    |

## Claude 工作方式

- **多方案时先问** — 2+ 合理方案时，列出选项让用户决定
- **错误如实报告** — 不假装成功，不静默重试
- **破坏性操作确认** — `rm -rf`、`git push --force` 等必须先说明影响
- **append-only 文件** — `corrections.jsonl`/`observations.jsonl` 只追加不删除
- **行数限制** — `CLAUDE.md` ≤ 100 行，`learned-rules.md` ≤ 50 行

## 任务执行流程

1. **理解** — Read 相关文件，理解现状
2. **规划** — 复杂任务（>3 步）先列方案
3. **实施** — 按方案执行，最小变更
4. **验证** — 运行测试，确认无回归
5. **记录** — 非显而易见的发现记入 memory

## 关键目录

- `template/` — 安装模板（产品本身）
- `src/adapters/` — 多 Agent 适配器 TypeScript 源码
- `docs/` — 双语文档（`zh/` + `en/`）
- `bin/` — 安装脚本
