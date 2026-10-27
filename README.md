# EvoKit

**个人多工具偏好同步工具（零依赖 CLI）。一份偏好，同步到多个 AI 工具，不用重复维护。**

> 本项目曾定位为“AI 编程助手的项目上下文引擎”（v1.x，四助手适配器 + 知识引擎）。经方向研究、四人评审、证据与竞品核查后，确认该方向已被更成熟的开源项目（rulesync、Ruler、ctxlint）覆盖。现收敛为个人自用的轻量 CLI（v2.0.0）。

## 它解决什么问题

你用多个 AI 编程工具（Claude Code、Pi、Codex …），但偏好/规则要在每个工具的入口文件里各写一遍、各维护一遍。EvoKit 让你只改**一个文件**（`context.md`），再 `evokit sync` 一键分发到所有工具入口——并且**只写入 EvoKit 托管的区块，绝不覆盖你手写在块外的内容**。

## 特性

- **单一事实源**：全局 `~/.evokit/context.md` 或项目级 `<project>/.evokit/context.md`，改一处即可。
- **零运行时依赖**：纯 Node.js（>=18），无任何第三方库；远程源用内置 `fetch`，软链接/代理手写实现。
- **本地优先**：无云端、无遥测、无网络上报。
- **可扩展（零代码改动）**：要新增一个 AI 工具、要同步一个规则文件或 skill、要拉取团队远程规范，只改 `~/.evokit/settings.json`，无需碰 CLI 代码。
- **数据安全**：`sync` 只更新托管区块，`uninstall` 只移除托管区块；块外的用户内容永远原样保留。
- **跨平台**：Windows / macOS / Linux 全支持（`~` 展开、环境变量、`%VAR%` / `$VAR`、反斜杠归一化；Windows 软链接自动用 junction）。
- **智能提示**：打错命令名或 agent/资源 id 时，按编辑距离猜测并提示正确写法；`check` 在入口都没同步时会主动提示下一步命令。

## 安装

```bash
# 方式一：npx 直接跑（无需安装）
npx @evokit/cli sync

# 方式二：全局安装
npm install -g @evokit/cli
evokit sync
```

要求 Node.js >= 18。

## 快速开始

```bash
evokit init                 # 首次运行：创建 ~/.evokit/context.md 与 settings.json
evokit sync                 # 把全局偏好同步到所有 AI 工具入口
evokit status               # 查看各入口是否一致
```

之后**只改 `context.md`**，再 `evokit sync` 即可，不用再逐个工具维护。

## 命令总览

| 命令 | 作用 |
| --- | --- |
| `evokit agents` | 列出支持的所有 agent 工具（来自 `settings.json` 的 `agents`） |
| `evokit resources` | 列出管理的所有资源（text / symlink / remote） |
| `evokit inventory` | 盘点知识库 + 委托 agent 自己找冗余（调用 claude/pi/codex CLI，只读） |
| `evokit init` | 初始化全局源（`context.md`）+ `settings.json` |
| `evokit init --project` | 初始化当前项目 `.evokit/`（含 `context.md` + `settings.json`） |
| `evokit sync` | 同步所有资源到所有 agent |
| `evokit check` | 检查各入口与源是否一致 + ctxlint 内容健康检查 |
| `evokit status` | 查看各 agent 入口的同步状态 |
| `evokit uninstall` | 移除托管区块，恢复入口文件（保留块外用户内容） |
| `evokit help` / `-h` | 打印完整用法 |

### 常用选项与别名

- `--agent <id>` / `-a`：只操作指定 agent（逗号分隔多选，如 `-a claude,codex`）。`check`/`status`/`uninstall` 还支持位置参数（`evokit check pi` ≡ `evokit check --agent pi`）。
- `--resource <id>` / `-r`：只同步指定资源（如 `-r context,my-skill`）。
- `--project` / `-p`：项目级操作（基于当前目录的 `.evokit/`）。
- `--output <file>` / `-o`（`inventory`）：指定报告导出路径。
- `--no-output`（`inventory`）：禁用导出，仅终端回显。
- `--prompt`（`inventory`）：只生成通用整理 prompt，不调用 agent CLI（调试用）。
- `--debug`：开启统一调试日志（写入 stderr，不污染 stdout）。

> 方括号 `[ ]` 表示可选：`--agent` 不写即操作全部 agent，写了就只操作指定的。`inventory` 还会调用本机 `claude`/`pi`/`codex` CLI；未安装的 agent 会自动跳过，不影响其他 agent。

## 单一事实源

| 作用域 | 源文件（唯一事实源） | 同步目标（由 `settings.json` 的 `agents` 决定） |
| --- | --- | --- |
| 个人全局 | `~/.evokit/context.md` | 默认 `~/.claude/CLAUDE.md`、`~/.pi/agent/APPEND_SYSTEM.md`、`~/.codex/AGENTS.md` |
| 项目级 | `<project>/.evokit/context.md` | 默认各 agent 的 `project` 入口（`CLAUDE.md`、`APPEND_SYSTEM.md`、`AGENTS.md`） |

## 统一配置（零代码改动）

所有目标、资源、提示词都集中在 `~/.evokit/settings.json`（首次 `init` 自动生成），三个顶层块：

| 块 | 作用 |
| --- | --- |
| `agents` | agent 目标清单（`id`/`name`/`global`/`project`/`cli`），新增一个 AI 工具改这里 |
| `resources` | 资源清单（`type=text`/`symlink`/`remote`），同步规则文件/skill/远程规范改这里 |
| `prompts` | 内置提示词模板（`inventory` 等），你只覆盖想改的 key，未覆盖仍用默认 |

**配置分层**：`<project>/.evokit/settings.json` 可按 `id`/`key` 逐项覆盖全局同名条目；全局有、项目级没写的条目仍然生效。

三种资源类型：

- `type: "text"` —— 把源文件内容写入各目标的托管区块（默认 `context` 资源）。
- `type: "symlink"` —— 把源目录软链接到各目标，一处改动多处实时生效，无需重新 sync（Windows 用 junction；若目标已是真实目录会拒绝覆盖，保护用户数据）。
- `type: "remote"` —— 把 `http(s)://` 源的远程内容拉取并写入目标（内置 `fetch` + 本地缓存；支持 `proxy` 字段或 `HTTPS_PROXY` 等环境变量；不支持 SOCKS5）。

> 详细的配置写法（新增 agent、CLI 调用字段 `cli`、代理、跨平台路径写法、配置分层示例、inventory 设计）见 [`cli/README.md`](cli/README.md)。

## 工作原理

- 源文件是唯一事实源（canonical）。改源 → `evokit sync` 分发。
- 文本类入口由 `<!-- evokit-managed:start -->` / `<!-- evokit-managed:end -->` 注释包裹，**不要手动改托管块内部**。
- **sync 绝不整文件覆盖**：目标已有托管块则只更新块内；无托管块则追加到末尾；目标不存在则新建。块外你手写的内容始终原样保留。
- 软链接类无需重复 sync：改源目录，所有链接目标实时生效。
- `check` 做两层检查：① 各入口托管块是否与源一致；② 调用 `@ctxlint/ctxlint` 做内容健康检查（辅助、不阻塞，环境异常时自动跳过而不泄漏原始报错栈）。
- `uninstall` 只移除托管块，保留块外用户内容；若入口原本仅含托管块则删除该文件。

### 数据安全（sync 与 uninstall 共用）

| 操作 | 托管块内部 | 托管块外部（用户内容） |
| --- | --- | --- |
| `sync`（目标已有托管块） | 更新为最新源 | 原样保留 |
| `sync`（目标无托管块） | 追加到末尾 | 原样保留 |
| `sync`（目标不存在） | 新建并写入 | — |
| `uninstall` | 移除 | 原样保留（纯托管块文件则删除） |

## 设计原则

- **零运行时依赖**，纯 Node.js（>=18）。
- **本地优先**，无云端、无遥测。
- **不重复造轮子**：内容健康检查复用开源 `@ctxlint/ctxlint`（`npx` 按需拉取，不内置）；同步方向本身也借鉴/避开已被覆盖的 rulesync / Ruler / ctxlint 路径。
- **只动托管块，绝不整文件覆盖**——把“不会误伤用户内容”作为一等约束。

## 目录结构

```
.
├── README.md               # 本文件（项目总览）
├── LICENSE                 # MIT
├── cli/                    # EvoKit CLI 实现（零依赖）
│   ├── evokit.mjs          # 入口：解析 argv，按命令分派
│   ├── package.json        # 包配置 @evokit/cli（v2.0.0）
│   ├── test-local.mjs      # 隔离测试（87 项断言，EVOKIT_HOME 重定向）
│   ├── README.md           # CLI 完整文档（配置/资源/代理/inventory/路径/结构）
│   └── src/
│       ├── paths.js        # 路径常量 + expandPath 跨平台路径展开
│       ├── defaults.js     # 默认配置（agents/resources/prompts）+ 源内容
│       ├── config.js       # settings.json 读写 + 过滤器 + 配置分层
│       ├── fs-utils.js     # 文件工具（托管块、软链接、ensureSource）
│       ├── syncers.js      # 同步器分派（text / symlink / remote）
│       ├── remote.js       # 远程源拉取（内置 fetch + 代理 + 本地缓存）
│       ├── agents-cli.js   # agents CLI 探测与调用（inventory 委托用）
│       ├── debug.js        # 统一调试日志（stderr，可配置）
│       └── commands/       # 各命令实现（init/sync/check/status/uninstall/inventory/list/help）
└── docs/zh/                # 方向决策记录（研究 → 评审 → 终判 → 路线图）
```

## 测试

```bash
cd cli
node test-local.mjs        # 隔离测试（EVOKIT_HOME 重定向到临时目录）
```

覆盖 init / sync / check / status / uninstall（含项目级）/ agents / resources / inventory、`--agent`/`--resource` 过滤、位置参数回退、错误提示意图猜测、新增 agent/资源零代码改动、软链接、跨平台路径展开、远程源与代理、数据保护（sync 保留块外用户内容）、配置分层、统一配置（settings.json 三块结构 + prompts 覆盖 + cli 字段）等 87 项断言。

## 深入阅读

- [`cli/README.md`](cli/README.md) —— CLI 完整使用文档（命令、配置、资源、代理、inventory、原理、代码结构）。
- [`docs/zh/`](docs/zh/) —— 方向决策记录（含 v1.x → v2.0.0 的收敛依据与竞品核查）。

## 许可证

MIT
