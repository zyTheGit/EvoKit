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
evokit init                 # 初始化全局源 + agents.json + resources.json
evokit init --project       # 初始化当前项目 .evokit/（context.md + agents.json + resources.json）
evokit agents               # 列出支持的所有 agent
evokit resources            # 列出管理的所有资源（文本 / 软链接）
evokit sync                 # 同步所有资源到所有 agent
evokit sync --resource <id> # 只同步指定资源（逗号分隔：--resource context,my-skill）
evokit sync --agent claude  # 只同步指定 agent（逗号分隔多选：--agent claude,pi）
evokit sync --project       # 同步项目规则到该项目入口
evokit check                # 检查一致性 + ctxlint 内容健康检查
evokit check --project      # 检查当前项目的一致性
evokit status               # 查看各入口同步状态
evokit status --agent pi    # 只查看指定 agent 的状态
evokit status --project     # 查看当前项目各入口同步状态
evokit uninstall            # 移除托管块，恢复入口文件（保留用户内容）
evokit uninstall --agent claude  # 只卸载指定 agent
evokit uninstall --project  # 卸载当前项目入口（移除项目级托管块，保留用户内容）
```

> `check` / `status` / `uninstall` 支持位置参数，`evokit check pi` 等价于 `evokit check --agent pi`。
>
> `--agent <id>` / `--resource <id>` 都是**可选**参数：不写就是操作全部，写了就只操作指定的（`id` 用逗号分隔可多选）。
>
> 常用选项有**短别名**：`-a` ≡ `--agent`、`-r` ≡ `--resource`、`-p` ≡ `--project`（如 `evokit sync -a claude` 等价 `evokit sync --agent claude`）。
>
> 输入错误命令或错误的 agent/resource id 时，会**自动猜测你的意图**并提示正确写法（如 `evokit syncc` 会提示「你是不是想输入 `evokit sync`？」）。
>
> `check` 在发现所有入口都尚未同步时，会**猜测你可能还没 init/sync**，直接给出下一步命令（`evokit init` → `evokit sync`），而不是只冷冰冰地说「文件不存在」。
>
> `check` 附带的 ctxlint 内容健康检查是**辅助功能**：优先用 `node + npm-cli.js` 直接驱动（规避 Windows 上 `npx.cmd` 会基于 cwd 向上误找 `node_modules`、导致 `Cannot find module .../npm-prefix.js` 报错栈泄漏的问题）。若本机 npm 环境确实异常导致它跑不起来，只会打印一行友好提示并跳过，**绝不泄漏 Node.js 原始报错栈**，也不阻塞同步结果。

### 新增 / 自定义 agent（零代码改动）

agent 列表由 `~/.evokit/agents.json` 驱动，**新增工具无需改 CLI 代码**：

```json
[
  { "id": "cursor", "name": "Cursor", "global": "~/.cursor/rules/global.mdc", "project": ".cursor/rules/project.mdc" }
]
```

- `id`：`--agent` 引用的短名
- `global`：该 agent 的全局入口文件路径（`~` 会自动展开）
- `project`：该 agent 的项目级入口相对路径

编辑后直接 `evokit agents` 查看、`evokit sync --agent cursor` 同步，无需改代码。

### 同步「规则 / skill」等更多资源（零代码改动）

不止 `context.md`。要同步**规则文件**或**用软链接同步整个 skill 目录**，改 `~/.evokit/resources.json` 即可，无需改 CLI 代码：

```jsonc
[
  { "id": "context", "type": "text", "source": "~/.evokit/context.md",
    "targets": ["~/.claude/CLAUDE.md", "~/.pi/agent/APPEND_SYSTEM.md"] },

  { "id": "commit-rule", "type": "text", "source": "~/.evokit/rules/commit.md",
    "targets": ["~/.claude/rules/commit.md", "~/.codex/rules/commit.md"] },

  { "id": "my-skill", "type": "symlink", "source": "~/.evokit/skills/my-skill",
    "targets": ["~/.claude/skills/my-skill", "~/.codex/skills/my-skill"] },

  { "id": "team-rules", "type": "remote", "source": "https://example.com/team-rules.md",
    "targets": ["~/.claude/team-rules.md"] }
]
```

- `type: "text"`：把 `source` 内容写入各 `target` 的托管块（现有行为）
- `type: "symlink"`：把 `source` 目录**软链接**到各 `target`（Windows 用 junction）—— **一处改动，多个工具实时生效，无需重新 sync**
- `type: "remote"`：`source` 是 `http(s)://` URL，同步时**拉取远程内容**写入目标（零依赖，用 Node 内置 `fetch`）

编辑后 `evokit resources` 查看、`evokit sync --resource my-skill` 同步。新增一种资源类型，只需给 `resources.json` 加一条，代码零改动。

> **软链接数据保护**：同步软链接时，若目标位置已是一个**真实目录**（含用户数据），会**拒绝覆盖并报错**，绝不误删。只有目标是旧软链接/junction 时才会替换。

### 远程源（remote）

远程源用于拉取**共享的团队规则 / 公共规范**，无需手动拷贝：

```jsonc
{ "id": "team-rules", "type": "remote",
  "source": "https://raw.githubusercontent.com/user/repo/main/rules.md",
  "targets": ["~/.claude/team-rules.md"] }
```

- `source` 支持任意 `http(s)://` URL（含 GitHub raw 文件、gist 等）
- **零依赖**：用 Node ≥18 内置的 `fetch`，不引入第三方库
- **本地缓存**：拉取结果缓存到 `~/.evokit/cache/`，离线时可复用；URL 不变则下次 sync 直接读缓存
- 未指定 `type` 但 `source` 是 URL 时，会**自动按 remote 处理**（`type` 可省略）

#### 代理支持（部分地址需代理时）

部分地址因网络原因需走代理。给远程资源加 `proxy` 字段即可（零依赖，手写 HTTP CONNECT 隧道）：

```jsonc
{ "id": "team-rules", "type": "remote",
  "source": "https://raw.githubusercontent.com/user/repo/main/rules.md",
  "proxy": "http://127.0.0.1:7890",           // 该资源走这个代理
  "targets": ["~/.claude/team-rules.md"] }
```

- `proxy` 字段可选，未指定时**自动回退到环境变量** `HTTPS_PROXY` / `https_proxy` / `HTTP_PROXY` / `http_proxy`
- 代理格式支持 `http://host:port`，也支持带认证 `http://user:pass@host:port`
- 支持 HTTP/HTTPS 代理（CONNECT 隧道）；**不支持 SOCKS5**
- 仍保持零依赖：用 Node 内置 `http`/`https`/`tls`/`net` 手写隧道，不引入第三方库

> 说明：远程源同步的是**单文件内容**。若要同步整个 Git 仓库/目录，建议配合 `symlink` 使用（先 `git clone` 到 `~/.evokit/` 下，再用软链接分发）。

## 单一事实源

| 作用域 | 源文件 | 同步目标 |
| --- | --- | --- |
| 个人全局 | `~/.evokit/context.md` | 由 `~/.evokit/agents.json` 决定（默认 `~/.claude/CLAUDE.md`、`~/.pi/agent/APPEND_SYSTEM.md`、`~/.codex/AGENTS.md`） |
| 项目级 | `<project>/.evokit/context.md` | 由 `<project>/.evokit/agents.json` 决定（`project` 字段，默认 `CLAUDE.md`、`APPEND_SYSTEM.md`、`AGENTS.md`） |

## 配置文件

| 文件 | 作用 |
| --- | --- |
| `~/.evokit/context.md` | 全局单一事实源（canonical） |
| `~/.evokit/agents.json` | agent 目标清单，新增工具改这里即可 |
| `~/.evokit/resources.json` | 资源清单（type=text/symlink），同步规则/skill 改这里即可 |
| `<project>/.evokit/agents.json` | **项目级 agent 覆盖**（可选，按 id 覆盖全局） |
| `<project>/.evokit/resources.json` | **项目级资源覆盖**（可选，按 id 覆盖全局） |

### 配置分层（项目级覆盖全局）

`agents.json` / `resources.json` 支持**项目级覆盖全局**，采用**按 id 逐项合并**：

- `evokit init --project` 会生成项目级 `<project>/.evokit/context.md` **以及** `agents.json`、`resources.json`（默认等于全局，可自行增删）
- 项目级配置文件里的条目，**按 id 覆盖**全局同名条目（如把 `claude` 的 `project` 入口改成自定义路径）
- 全局有、项目级没写的条目**仍然生效**；项目级新增的条目（全局没有的）**自动并入**
- 项目级命令（`sync -p` / `check -p` / `status -p` / `uninstall -p`）读取的是**合并后**的配置

**示例**：某项目想把 Claude Code 的入口改成 `CLAUDE.local.md`（其余沿用全局），只需在 `<project>/.evokit/agents.json` 里写：

```json
[
  { "id": "claude", "name": "Claude Code", "global": "~/.claude/CLAUDE.md", "project": "CLAUDE.local.md" }
]
```

这样 `evokit sync -p` 只会把 claude 的项目入口改成 `CLAUDE.local.md`，pi、codex 等其他 agent 仍沿用全局配置。

### 路径写法（跨平台，推荐统一用正斜杠 + `~`）

配置文件里所有路径都经过 `expandPath` 展开，支持以下写法：

| 写法 | 示例 | 说明 |
| --- | --- | --- |
| 波浪号 + 正斜杠 | `~/.claude/CLAUDE.md` | **推荐**，三平台通用 |
| 波浪号 + 反斜杠 | `~\.claude\CLAUDE.md` | 自动归一化为 `~/...`（Windows 习惯） |
| Windows 环境变量 | `%USERPROFILE%\.claude\CLAUDE.md` | 展开 `%VAR%` |
| 三平台环境变量 | `${HOME}/.claude/CLAUDE.md` | 展开 `${VAR}` 和 `$VAR` |
| 绝对路径 | `C:\Users\foo\CLAUDE.md` 或 `/home/foo/...` | 原样使用（但仅对应平台有效） |
| 相对路径 | `CLAUDE.md`、`rules/commit.md` | `resolve` 基于当前工作目录（cwd）转绝对路径 |

> **最佳实践**：跨设备/跨平台共享同一份配置时，优先用 `~` 和正斜杠（如 `~/.claude/CLAUDE.md`），避免硬编码 `C:\` 或 `/home/foo` 这类平台专属绝对路径。环境变量未定义时保留原文，方便排查。
>
> **相对路径提醒**：`agents.json` 的 `global` 和 `resources.json` 的 `source`/`targets` 建议用 `~` 开头或绝对路径，避免相对路径被解析到 cwd 造成歧义。项目级入口（`agents.json` 的 `project` 字段）是例外，它固定基于项目目录拼接，不经过 `expandPath`。
>
> **输出统一**：`expandPath` 在展开 `~`/环境变量/反斜杠后，最后统一 `path.resolve` 规范化，保证输出路径**始终是当前平台的标准形式**（Windows 反斜杠、macOS/Linux 正斜杠），不会出现正斜杠/反斜杠混用。

## 工作原理

- 源文件是唯一事实源（canonical），改它，然后 `evokit sync`
- 资源分两类：`text`（写托管块）和 `symlink`（软链接/junction）
- 文本类入口由 `<!-- evokit-managed -->` 注释包裹，不要手动改托管块内部
- **sync 绝不整文件覆盖**：只更新托管块内部，块外你手写的内容原样保留；若目标文件本就没有托管块，则追加到末尾（不破坏已有内容）
- 软链接类**无需重复 sync**：改源目录，所有链接目标实时生效
- `evokit check` 会做两层检查：① 各入口是否与源一致 ② 调 `ctxlint` 做内容健康检查
- `evokit uninstall` 只移除托管块，**保留块外的用户内容**，不覆盖任何东西

### 数据安全（sync 与 uninstall 共用同一原则）

`sync` 和 `uninstall` 都遵循「**只动托管块，绝不整文件覆盖**」：

| 操作 | 托管块内部 | 托管块外部（用户内容） |
| --- | --- | --- |
| `sync`（目标已有托管块） | 更新为最新源 | 原样保留 |
| `sync`（目标无托管块） | 追加到末尾 | 原样保留 |
| `sync`（目标不存在） | 新建并写入 | — |
| `uninstall` | 移除 | 原样保留（纯托管块文件则删除） |

这样即使你的 `CLAUDE.md` 里既有 evokit 托管的偏好，也有自己手写的规则，`sync` 更新偏好时也**不会抹掉你手写的部分**。

## 卸载说明

`evokit uninstall` 的安全策略：
- 只删除 `<!-- evokit-managed -->` 标记的托管块
- **保留** 用户在托管块之外手动添加的内容
- 若入口文件原本就是空的（仅含托管块），则删除该文件
- **不做备份**：因为 sync/uninstall 都只操作托管块、绝不整文件覆盖，你的用户内容从不会被改动，所以无需备份

`evokit uninstall --project` 卸载**项目级**托管：
- 移除当前项目入口（`<project>/CLAUDE.md`、`<project>/AGENTS.md` 等）的托管块
- 同样**保留**块外用户内容；纯托管块文件则删除
- **保留**项目级源 `.evokit/context.md`（如需一并删除请手动移除）

## 说明

- 零运行时依赖，纯 Node.js（>=18）
- **跨平台**：Windows / macOS / Linux 全支持
  - 路径统一用 `path` 模块处理（`~` 展开、`dirname` 等），不手写分隔符
  - 配置路径支持 `~`、反斜杠归一化、`%VAR%` / `$VAR` / `${VAR}` 环境变量（见「路径写法」）
  - 软链接自动探测：Windows 用 junction（无需管理员），macOS/Linux 用符号链接
  - `npx` 调用自动加 `.cmd` 后缀（Windows）
- 本地优先，无云端、无遥测
- 内容健康检查复用开源的 `@ctxlint/ctxlint`（`npx` 拉取，不内置）

## 代码结构

```
cli/
├── evokit.mjs          # 入口：解析 argv，按命令分派
├── package.json
└── src/
    ├── paths.js        # 路径常量 + expandPath 跨平台路径展开
    ├── defaults.js     # 默认 agent / 资源 / 源内容
    ├── config.js       # agents.json / resources.json 读写 + 过滤器
    ├── fs-utils.js     # 文件工具（托管块、软链接、ensureSource）
    ├── syncers.js      # 同步器分派（text / symlink / remote）
    ├── remote.js       # 远程源拉取（内置 fetch + HTTP CONNECT 代理，本地缓存）
    └── commands/       # 各命令实现（按命令族拆分）
        ├── index.js    # 汇总导出（统一入口）
        ├── init.js     # initGlobal / initProject
        ├── sync.js     # syncGlobal / syncProject / syncResources
        ├── check.js    # check + ctxlint 内容健康检查
        ├── status.js   # status（全局 / 项目级）
        ├── uninstall.js# uninstallGlobal / uninstallProject
        ├── list.js     # listAgents / listResources
        └── help.js     # help
```

| 模块 | 职责 |
| --- | --- |
| `paths.js` | `HOME`、`EVOKIT_DIR`、各文件路径常量、`BEGIN`/`END` 标记、`expandPath` |
| `defaults.js` | `DEFAULT_AGENTS`、`DEFAULT_RESOURCES`、`DEFAULT_CONTEXT` |
| `config.js` | `loadAgents`、`loadResources`、`parseAgentFilter`、`parseResourceFilter`、过滤器 |
| `fs-utils.js` | `readSource`、`applyBlock`、`applyManagedBlock`、`ensureSource`、`makeSymlink` |
| `syncers.js` | `SYNCERS` 分派、`syncText`、`syncSymlink`、`syncRemote`、`resolveSyncer` |
| `remote.js` | `fetchRemote`、`isRemote`、`resolveProxy`（远程源拉取 + 代理 + 本地缓存） |
| `commands/index.js` | 汇总导出所有命令 |
| `commands/init.js` | `initGlobal`、`initProject` |
| `commands/sync.js` | `syncGlobal`、`syncProject`、`syncResources` |
| `commands/check.js` | `check` + ctxlint 内容健康检查 |
| `commands/status.js` | `status`（全局 / 项目级） |
| `commands/uninstall.js` | `uninstallGlobal`、`uninstallProject` |
| `commands/list.js` | `listAgents`、`listResources` |
| `commands/help.js` | `help` |

依赖方向单一（paths/defaults → config/fs-utils/remote → syncers → commands → 入口），无循环依赖。

## 测试

```bash
node test-local.mjs        # 隔离测试（EVOKIT_HOME 重定向到临时目录）
```

覆盖 init / sync / check / status / uninstall（含项目级 check/status/uninstall）/ agents / resources、`--agent`/`--resource` 过滤、位置参数回退、错误提示意图猜测、新增 agent/资源零代码改动、软链接、跨平台路径展开、远程源、代理、数据保护（sync 保留块外用户内容）等 62 项断言。
