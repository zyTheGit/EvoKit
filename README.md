# EvoKit

**个人多工具偏好同步 + 记忆引擎（零依赖 CLI）。一份偏好与经验，同步到多个 AI 工具，不用重复维护。**

v3 新增记忆引擎（经验层）：`harvest → distill → review → knowledge → recall/forge`，把各 AI 工具的会话史与私有记忆提纯为统一知识库（独立 git 版本化）；知识索引随 `sync` 自动分发回各工具入口，达标的同类经验自动学习锻造为技能。

> 本项目曾定位为“AI 编程助手的项目上下文引擎”（v1.x，四助手适配器 + 知识引擎）。经方向研究、四人评审、证据与竞品核查后，确认该方向已被更成熟的开源项目（rulesync、Ruler、ctxlint）覆盖。现收敛为个人自用的轻量 CLI（v2.0.0，v3 起新增记忆引擎）。

## 它解决什么问题

你用多个 AI 编程工具（Claude Code、Pi、Codex …），但偏好/规则要在每个工具的入口文件里各写一遍、各维护一遍。EvoKit 让你只改**一个文件**（`context.md`），再 `evokit sync` 一键分发到所有工具入口——并且**只写入 EvoKit 托管的区块，绝不覆盖你手写在块外的内容**。

经验比偏好更散：一次踩坑的解法、一条被验证的工作流，埋在各工具的会话史里，隔两个月、换台机器就找不回来。EvoKit 的经验层定时收割会话史（采集即脱敏），委托本机 agent 提纯成统一知识库的知识卡；`review` 过目入库后，精简的知识索引自动分发回各工具入口。默认人在环：`review` 裁决后才入库，或按 `knowledge.automation` 档位放宽到半自动/全自动。

## 特性

- **单一事实源**：全局 `~/.evokit/context.md` 或项目级 `<project>/.evokit/context.md`，改一处即可。
- **零运行时依赖**：纯 Node.js（>=18），无任何第三方库；远程源用内置 `fetch`，软链接/代理手写实现。
- **本地优先**：无云端、无遥测、无网络上报。
- **可扩展（零代码改动）**：要新增一个 AI 工具、要同步一个规则文件或 skill、要拉取团队远程规范，只改 `~/.evokit/settings.json`，无需碰 CLI 代码。
- **数据安全**：`sync` 只更新托管区块，`uninstall` 只移除托管区块；块外的用户内容永远原样保留。
- **跨平台**：Windows / macOS / Linux 全支持（`~` 展开、环境变量、`%VAR%` / `$VAR`、反斜杠归一化；Windows 软链接自动用 junction）。
- **智能提示**：打错命令名或 agent/资源 id 时，按编辑距离猜测并提示正确写法；`check` 在入口都没同步时会主动提示下一步命令。
- **记忆引擎（经验层）**：采集 → 提纯 → 人工裁决，把会话史沉淀为知识卡；自动化三档（manual / assist / auto）默认人在环；支持会话结束钩子入队与每日定时学习。
- **多源采集**：11 个内置源配置化（`settings.json` 的 `sources` 块，可自行增删）；增量只收新会话；采集时自动脱敏（密钥/内网信息不进库，规则可扩充）。
- **知识库**：`~/.evokit/knowledge/` 独立 git 版本化、可回滚；精简知识索引自动分发回各工具入口；过时知识置失效、不物理删除。
- **定时学习**：`evokit schedule enable / disable / list` 一条命令开启 / 关闭 / 查看每日自动学习（时间与档位可配）。
- **网页端控制台**：`evokit web` 一条命令在浏览器里只读浏览全局偏好、知识卡（含待审/归档/拒绝）、检索、三入口同步状态、知识库变更历史、召回统计与采集水位线（仅绑定本机 127.0.0.1，数据不出机）。

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
| `evokit knowledge init` | 初始化知识根（独立 git 版本化的知识库） |
| `evokit knowledge gc` | 归档失效与过期知识卡，清理超期的被拒草稿 |
| `evokit harvest` | 采集各源新会话（增量 + 自动脱敏） |
| `evokit learn` | 采集 → 提纯 → 按档位处理草稿（启动时消费钩子触发） |
| `evokit review` | 待审草稿清单与裁决（--accept / --reject / --merge / --skill / --audit） |
| `evokit recall "<关键词>"` | 本地知识检索（按相关度排序，命中自动计数） |
| `evokit forge` | 把达标的同类知识卡锻造成技能草稿（人工过目后分发） |
| `evokit hook learn-enqueue` | 会话结束钩子入队（写触发文件立即返回，不阻塞会话） |
| `evokit schedule enable / disable / list` | 每日定时学习的开启 / 关闭 / 查看（Windows / macOS / Linux） |
| `evokit web` | 本机网页端：只读浏览偏好 / 知识库 / 同步状态 / 采集概览（需先在 cli/ 执行 npm install） |
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
>
> 记忆引擎命令（knowledge / harvest / learn / review / recall / forge / hook / schedule）的完整用法见 [`cli/README.md`](cli/README.md) 的「记忆引擎（v3）」一节。

## 单一事实源

| 作用域 | 源文件（唯一事实源） | 同步目标（由 `settings.json` 的 `agents` 决定） |
| --- | --- | --- |
| 个人全局 | `~/.evokit/context.md` | 默认 `~/.claude/CLAUDE.md`、`~/.pi/agent/APPEND_SYSTEM.md`、`~/.codex/AGENTS.md` |
| 项目级 | `<project>/.evokit/context.md` | 默认各 agent 的 `project` 入口（`CLAUDE.md`、`APPEND_SYSTEM.md`、`AGENTS.md`） |

## 统一配置（零代码改动）

所有目标、资源、提示词与记忆引擎参数都集中在 `~/.evokit/settings.json`（首次 `init` 自动生成），五个顶层块：

| 块 | 作用 |
| --- | --- |
| `agents` | agent 目标清单（`id`/`name`/`global`/`project`/`cli`），新增一个 AI 工具改这里 |
| `resources` | 资源清单（`type=text`/`symlink`/`remote`），同步规则文件/skill/远程规范改这里 |
| `prompts` | 内置提示词模板（`inventory`、记忆引擎提纯、技能锻造等），你只覆盖想改的 key，未覆盖仍用默认 |
| `sources` | 采集源清单（`id`/`adapter`/`root`/`enabled` 等），记忆引擎从哪里收割会话史，内置 11 条可增删 |
| `knowledge` | 记忆引擎参数（自动化档位 / 阈值 / 索引预算 / 分批 / 聚簇 / 脱敏扩充），默认值见 [`cli/README.md`](cli/README.md) |

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
- `check` 做两层检查：① 各入口托管块是否与源一致；② 调用 `@ctxlint/ctxlint` 做内容健康检查（辅助、不阻塞）。
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
- **不重复造轮子**：内容健康检查复用开源 `@ctxlint/ctxlint`（`npx` 按需拉取，不内置）。
- **只动托管块，绝不整文件覆盖**——把“不会误伤用户内容”作为一等约束。

## 深入阅读

- [`cli/README.md`](cli/README.md) —— CLI 完整文档（命令、配置、资源、代理、inventory、记忆引擎的完整用法；含开发者向的代码结构、测试与实现说明）。
- [`docs/adr/0009-knowledge-root-v3.md`](docs/adr/0009-knowledge-root-v3.md) —— v3 知识根契约：卡片、索引读写与个人根单根。
- [`docs/zh/MEMORY-ENGINE-DESIGN.md`](docs/zh/MEMORY-ENGINE-DESIGN.md) —— 记忆引擎 v3 设计方案（方向裁决与里程碑）。
- [`docs/zh/MEMORY-ENGINE-IMPLEMENTATION-PLAN.md`](docs/zh/MEMORY-ENGINE-IMPLEMENTATION-PLAN.md) —— 记忆引擎实施计划（技术方案与任务拆分）。
- [`docs/zh/`](docs/zh/) —— 方向决策记录（含 v1.x → v2.0.0 的收敛依据与竞品核查）。

## 许可证

MIT
