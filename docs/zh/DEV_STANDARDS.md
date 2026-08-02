# EvoKit 开发规范

> **本文档是 EvoKit 仓库开发的权威规范。**
> 其他入口文件（`CLAUDE.md`、`.claude/rules/`、`CONTRIBUTING.md`）只保留摘要，并指向本文档的对应章节。
> 规则冲突时以本文档为准；修改规则时请先更新本文档，再同步各入口摘要。
>
> 英文版：[docs/en/DEV_STANDARDS.md](../en/DEV_STANDARDS.md)

## 目录

1. [代码风格](#1-代码风格)
2. [测试要求](#2-测试要求)
3. [Commit 规范](#3-commit-规范)
4. [分支与 PR](#4-分支与-pr)
5. [版本与发布](#5-版本与发布)
6. [文档同步](#6-文档同步)
7. [模板红线](#7-模板红线)
8. [AI 协作规则](#8-ai-协作规则)
9. [附录：常用命令速查](#9-附录常用命令速查)

---

## 1. 代码风格

- **语言与运行时**：TypeScript（ESM），Node.js ≥ 20.12.0（见 `package.json` `engines`）。
- **标识符一律英文**：变量名、函数名、类名、文件名保持英文命名惯例。
- **Lint**：ESLint = `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-config-prettier`。关键规则：

  | 规则                                 | 级别  | 说明                                |
  | ------------------------------------ | ----- | ----------------------------------- |
  | `eqeqeq`                             | error | 强制 `===`/`!==`（`null` 比较除外） |
  | `@typescript-eslint/no-explicit-any` | warn  | 迁移/遗留代码可保留，新代码避免     |
  | `@typescript-eslint/no-unused-vars`  | warn  | `_` 前缀的参数/解构除外             |
  | `prefer-const`                       | warn  | 未被重新赋值的变量用 `const`        |
  | `no-console`                         | off   | CLI 工具允许控制台输出              |

- **格式化**：Prettier（配置经 `eslint-config-prettier` 与 ESLint 对齐）。提交前执行 `npm run format` 检查，必要时 `npm run format:fix`。
- **注释优先中文**：解释意图与设计决策的注释使用中文（见 `.claude/rules/chinese-output.md`）。

## 2. 测试要求

- **框架**：vitest，测试文件统一放在 `tests/**/*.test.ts`。
- **硬性要求**：
  - 改动 `src/` 下任何文件，`npm test` 必须通过后方可提交。
  - 新功能必须附带对应测试；修复 bug 优先补回归测试。
- **覆盖率**：`npm run test:coverage`（v8 provider，统计 `src/**/*.ts`）。暂无硬性阈值，但新增核心模块应保持主体路径覆盖。
- **Shell 脚本**：所有 `.sh` 必须通过 shellcheck：

  ```bash
  shellcheck bin/*.sh template/claude/hooks/*.sh
  ```

## 3. Commit 规范

- 遵循 [Conventional Commits](https://www.conventionalcommits.org/)，**描述使用中文**：

  ```
  type(scope): 中文描述

  feat: 新增卸载命令
  fix(installer): 修复交互菜单回车符问题
  docs: 更新架构文档
  ```

- **常用 type**：`feat`（新功能）、`fix`（修复）、`docs`（文档）、`refactor`（重构）、`chore`（杂务/版本）、`test`（测试）。
- **scope 可选**：建议对适配器、命令等模块加上（如 `feat(uninstall): …`）。
- 一次提交只做一件事；版本升级单独提交（`chore: 版本升级至 x.y.z`）。

## 4. 分支与 PR

- **分支命名**：`feat/<名称>`、`fix/<名称>`、`docs/<名称>`。
- **PR 前本地验证**（与 CI 等效，步骤见 `.github/workflows/ci.yml`）：

  ```bash
  npm run build && npm test          # 构建 + 测试
  npm run lint                       # ESLint
  shellcheck bin/*.sh template/claude/hooks/*.sh
  bash bin/install.sh --dry-run      # 模板 dry-run 验证
  grep -rn "/home/" template/ || echo "OK: 无个人路径"
  ```

- **CI 自动检查**（`ci.yml`）：模板结构完整性、模板无个人路径、shellcheck、构建、dry-run 安装、文档存在性、测试。
- Issue 使用仓库模板：`bug-report.md` / `feature-request.md`（位于 `.github/ISSUE_TEMPLATE/`）。

## 5. 版本与发布

- **语义化版本（SemVer）**：

  | bump      | 适用场景                                   |
  | --------- | ------------------------------------------ |
  | **patch** | 开发迭代、bug 修复、文档、重构、注释调整   |
  | **minor** | 功能里程碑（如新命令完成、适配器完整集成） |
  | **major** | 破坏性变更                                 |

- **发布流程**：

  1. 升级 `package.json` 版本号（CLI 版本从此文件动态读取，无硬编码）。
  2. 单独提交：`chore: 版本升级至 x.y.z`。
  3. 打附注 tag：`git tag -a vx.y.z -m "vx.y.z: 一句话摘要"`。
  4. 推送：`git push origin main && git push origin vx.y.z`。
  5. 创建 Release（**中文 release notes**）：`gh release create vx.y.z --title "vx.y.z" --notes "…"`。
  6. 更新 `CHANGELOG.md`（中文，按 Major/Documentation/Internal/Fix 分组）。

- **npm 发布**：由 `publish.yml` 工作流处理；本地 `npm publish` 会触发 `prepublishOnly`（build + test）。

## 6. 文档同步

- **中文优先输出**：Git commit、release notes、代码注释、CLI 帮助、文档均优先中文（完整规则见 `.claude/rules/chinese-output.md`）。
- **双语平行**：`docs/zh/` 与 `docs/en/` 中的同名 `.md` 文件必须内容平行——新增或修改任一侧，另一侧同步更新。
- **README 同步**：`README.md`（中文）与 `README.en.md`（英文）必须保持同步。
- **中文单语例外名单**（有意不设英文版，新增例外须登记于此并同步 `.claude/rules/docs-sync.md`）：
  - `docs/zh/AI-DEVELOPMENT-STANDARDS.md` — 面向中文开发者社区的 AI Agent 开发规范实践指南，原生中文内容。

## 7. 模板红线

`template/` 是被安装到用户机器的**产品本身**，违反以下红线会直接破坏用户安装。CI 强制校验。

- **禁止个人路径**：模板文件一律使用 `__HOME__` 占位符，安装时由 `sed` 替换。禁止硬编码 `/home/...` 等路径（CI 用 grep 校验）。
- **`settings.json`** 同样使用 `__HOME__` 占位符（安装时 `sed -i` 替换）。
- **行数限制**：
  - `template/claude/CLAUDE.md` ≤ **150 行**（认知核心，不是垃圾场）。
- **知识根（v1.0）**：模板指向 agent 无关共享根 —— 个人 `~/.evokit/knowledge/`、项目 `<project>/.evokit/`；不绑定任一助手私有 `memory/`。
- **不引废弃概念**：模板不得引用 v0 文件（corrections.jsonl / observations.jsonl / learned-rules.md / evolution-log.md / sessions.jsonl / violations.jsonl / evokit-evolve / evokit-memory record-*）。知识改为对话提取 + 确认背书。
- **内嵌 Python**：`stop.sh` 等 hook 的 JSON 处理优先使用 `uv run --isolated python3`（不可用时回退 `python3`）。

## 8. AI 协作规则

- **中文优先**：所有对话、解释、注释、文档输出优先中文；**Sub agents（architect、reviewer 等）同样遵循**，输出评审意见、架构计划时使用中文。
- **思考框架**（见 `CLAUDE.md`）：
  1. **Understand** — 先读后改，禁止未读先改。
  2. **Plan** — 复杂任务（>3 步）先列方案。
  3. **Verify** — 改动后验证（跑测试、检查输出）。
  4. **Learn** — 被纠正的模式记入 memory。
- **完成标准**：任务"完成"须满足——改动已测试/可验证；无遗留 `TODO`/`FIXME`/`console.log`/`debugger`；未经用户明确要求不删除文件；`/boot` 无违规。
- **知识识别与确认**：识别到项目/个人知识 → 静默写入 `.pending/`（不猜 scope），用户确认后背书入库；显式声明 = `evokit learn "…"` 当场背书。

  ```
  AI 识别知识 → 写入 <project>/.evokit/.pending/{type}-{slug}.md
  → 用户运行 evokit learn 确认（同一人工背书闸门）→ 移入 knowledge/ + 更新索引
  ```

- **知识命令**：`/evokit-boot`（知识库完整性）、`/evokit-learn`（确认背书/显式声明）、`/evokit-review`（复审过期知识 confidence ≤ 0.5）。

## 9. 附录：常用命令速查

| 命令                                                                 | 用途                     |
| -------------------------------------------------------------------- | ------------------------ |
| `npm run build`                                                      | 编译 TypeScript（tsc）   |
| `npm run dev`                                                        | tsx 直接运行 CLI（开发） |
| `npm test`                                                           | 运行 vitest 测试         |
| `npm run test:coverage`                                              | 测试 + 覆盖率            |
| `npm run lint` / `lint:fix`                                          | ESLint 检查 / 自动修复   |
| `npm run format` / `format:fix`                                      | Prettier 检查 / 格式化   |
| `shellcheck bin/*.sh template/claude/hooks/*.sh`                     | Shell 脚本静态检查       |
| `bash bin/install.sh --dry-run`                                      | 模板结构 dry-run 验证    |
| `HOME=/tmp/evokit-test-home bash bin/install.sh --template template` | 安装到测试主目录         |
