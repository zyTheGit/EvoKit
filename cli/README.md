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
evokit init                 # 初始化全局源 + settings.json
evokit init --project       # 初始化当前项目 .evokit/（context.md + settings.json）
evokit agents               # 列出支持的所有 agent
evokit resources            # 列出管理的所有资源（文本 / 软链接）
evokit inventory            # 盘点知识库 + 委托 agent 找出冗余（调 claude/pi/codex CLI）
evokit inventory --agent claude  # 只让指定 agent 整理（逗号分隔多选）
evokit inventory --prompt   # 只生成通用整理 prompt，不调 CLI（调试用）
evokit inventory --output report.md  # 报告导出到指定 .md（覆盖默认目录）
evokit inventory --no-output  # 禁用导出，只在终端回显
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
evokit knowledge init      # 初始化知识根（目录树 + 索引骨架 + git init + 环境体检）
evokit harvest             # 采集各源新会话到 inbox（--full 全量 / --source <id> / --dry-run）
evokit learn               # harvest→distill→按档位处理草稿（--no-distill / --agent <id> / --session <id> / --auto）
evokit review              # 查看待审草稿清单（--accept / --reject / --merge / --skill / --audit）
evokit recall "<关键词>"     # 本地知识检索 + 命中计数（--limit n / --json）
evokit forge               # 知识卡聚簇锻造技能（--from-tags a,b / --topic "…" / --audit）
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

### 统一调试日志

调试默认关闭。可用以下三种方式开启，优先级为 **`--debug` > `EVOKIT_DEBUG` > `settings.json`**：

```bash
# 命令行（--debug 也可放在命令后）
node cli/evokit.mjs --debug inventory --agent pi

# 环境变量（1/true 开启，0/false 关闭）
EVOKIT_DEBUG=1 evokit inventory --agent pi
```

```jsonc
// ~/.evokit/settings.json 或项目 <cwd>/.evokit/settings.json
{
  "debug": true
}
```

项目级 `debug` 覆盖全局配置；未设置时默认 `false`。所有调试日志都写入 **stderr**，不会污染 `--prompt`、列表或 JSON 等正常 stdout。日志包含命令耗时、实际读取的配置路径、inventory 扫描与 prompt 大小、agent CLI 的退出码/signal/stdout/stderr 元信息等；默认**不记录完整 prompt、完整输出、环境变量或 token 等敏感信息**。agent 自身的 `Request timed out.` 仍按原语义展示，不会被误报为 EvoKit 的 `ETIMEDOUT`。

### 新增 / 自定义 agent（零代码改动）

agent 列表由 `~/.evokit/settings.json` 的 `agents` 驱动，**新增工具无需改 CLI 代码**：

```jsonc
{
  "agents": [
    { "id": "cursor", "name": "Cursor", "global": "~/.cursor/rules/global.mdc", "project": ".cursor/rules/project.mdc",
      "cli": { "bin": "cursor-agent", "args": ["-p", "{prompt}"], "timeout": 120 } }
  ]
}
```

- `id`：`--agent` 引用的短名
- `global`：该 agent 的全局入口文件路径（`~` 会自动展开）
- `project`：该 agent 的项目级入口相对路径
- `cli`（可选）：CLI 调用配置，供 `inventory` 委托 agent 分析用（见「CLI 调用配置」）

编辑后直接 `evokit agents` 查看、`evokit sync --agent cursor` 同步，无需改代码。

### CLI 调用配置（`agents[].cli`）

`inventory` 需要调用各 agent 的 CLI 让它们自己找冗余。`cli` 字段让调用方式可配置（零代码改动）：

| 字段 | 说明 |
| --- | --- |
| `bin` | 命令名（如 `claude`/`pi`/`codex`） |
| `binPath` | CLI 绝对路径（可选，解决 fnm 安装目录不在 PATH 的问题） |
| `args` | 参数数组，`{prompt}` 占位符表示 prompt 位置 |
| `input` | `"stdin"` 表示把 prompt 通过 stdin 传入（`codex exec -` 用，避免长 prompt 走 argv） |
| `model` | 指定模型（自动映射为 `--model`） |
| `provider` | 指定供应商（codex 映射 `--model-provider`，claude/pi 忽略并告警） |
| `timeout` | 超时秒数（默认 120） |
| `outputFormat` | `text`（默认，原样回显）/ `json`（结构化解析，claude 已支持） |

> `model`/`provider`/`outputFormat` 都是**统一字段**，EvoKit 内部映射到各家的实际参数，你无需记三家差异。

### 同步「规则 / skill」等更多资源（零代码改动）

不止 `context.md`。要同步**规则文件**或**用软链接同步整个 skill 目录**，改 `~/.evokit/settings.json` 的 `resources` 即可，无需改 CLI 代码：

```jsonc
{
  "resources": [
    { "id": "context", "type": "text", "source": "~/.evokit/context.md",
      "targets": ["~/.claude/CLAUDE.md", "~/.pi/agent/APPEND_SYSTEM.md"] },

    { "id": "commit-rule", "type": "text", "source": "~/.evokit/rules/commit.md",
      "targets": ["~/.claude/rules/commit.md", "~/.codex/rules/commit.md"] },

    { "id": "my-skill", "type": "symlink", "source": "~/.evokit/skills/my-skill",
      "targets": ["~/.claude/skills/my-skill", "~/.codex/skills/my-skill"] },

    { "id": "team-rules", "type": "remote", "source": "https://example.com/team-rules.md",
      "targets": ["~/.claude/team-rules.md"] }
  ]
}
```

- `type: "text"`：把 `source` 内容写入各 `target` 的托管块（现有行为）
- `type: "symlink"`：把 `source` 目录**软链接**到各 `target`（Windows 用 junction）—— **一处改动，多个工具实时生效，无需重新 sync**
- `type: "remote"`：`source` 是 `http(s)://` URL，同步时**拉取远程内容**写入目标（零依赖，用 Node 内置 `fetch`）

编辑后 `evokit resources` 查看、`evokit sync --resource my-skill` 同步。新增一种资源类型，只需给 `settings.json` 的 `resources` 加一条，代码零改动。

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
| 个人全局 | `~/.evokit/context.md` | 由 `~/.evokit/settings.json` 的 `agents` 决定（默认 `~/.claude/CLAUDE.md`、`~/.pi/agent/APPEND_SYSTEM.md`、`~/.codex/AGENTS.md`） |
| 项目级 | `<project>/.evokit/context.md` | 由 `<project>/.evokit/settings.json` 的 `agents` 决定（`project` 字段，默认 `CLAUDE.md`、`APPEND_SYSTEM.md`、`AGENTS.md`） |

## 配置文件

统一配置 `~/.evokit/settings.json`，三个顶层块：

| 块 | 作用 |
| --- | --- |
| `agents` | agent 目标清单（`id/name/global/project/cli`），新增工具改这里 |
| `resources` | 资源清单（`type=text/symlink/remote`），同步规则/skill 改这里 |
| `prompts` | 内置提示词模板（`inventory` 等），用户只覆盖同名 key，未覆盖仍用默认 |

| 文件 | 作用 |
| --- | --- |
| `~/.evokit/context.md` | 全局单一事实源（canonical） |
| `~/.evokit/settings.json` | 统一配置（agents + resources + prompts） |
| `<project>/.evokit/settings.json` | **项目级覆盖**（可选，按 id/key 覆盖全局） |

### 配置分层（项目级覆盖全局）

`settings.json` 支持**项目级覆盖全局**，采用**按 id/key 逐项合并**：

- `evokit init --project` 会生成项目级 `<project>/.evokit/context.md` **以及** `settings.json`（默认等于全局，可自行增删）
- 项目级配置里的条目，**按 id 覆盖**全局同名条目（如把 `claude` 的 `project` 入口改成自定义路径）；`prompts` 按 key 覆盖
- 全局有、项目级没写的条目**仍然生效**；项目级新增的条目（全局没有的）**自动并入**
- 项目级命令（`sync -p` / `check -p` / `status -p` / `uninstall -p`）读取的是**合并后**的配置

**示例**：某项目想把 Claude Code 的入口改成 `CLAUDE.local.md`（其余沿用全局），只需在 `<project>/.evokit/settings.json` 里写：

```json
{
  "agents": [
    { "id": "claude", "name": "Claude Code", "global": "~/.claude/CLAUDE.md", "project": "CLAUDE.local.md" }
  ]
}
```

这样 `evokit sync -p` 只会把 claude 的项目入口改成 `CLAUDE.local.md`，pi、codex 等其他 agent 仍沿用全局配置。

### 自定义提示词（`prompts`）

`inventory` 的内置整理 prompt 可自定义。系统内置一套**完整默认**，你的配置只**覆盖**想改的 key：

```jsonc
{
  "prompts": {
    "inventory": "你是 {agent}，做冗余体检。清单：\n{inventory}\n请找重复/冲突/断链，输出报告。"
  }
}
```

- 占位符 `{agent}`（agent 名）、`{inventory}`（扫描清单）在运行时替换
- 不写 `prompts` 时用内置默认，行为与默认完全一致
- 未来新 prompt（如裁剪、漂移）也进 `prompts`，同样「默认 + 覆盖」

### 知识库冗余体检（inventory）

`evokit inventory` 是一个**只读的提示词知识库体检工具**，帮你发现散落在各 agent 里的冗余提示词（skill、规则、MCP 配置、全局/项目提示词、缓存等）。

设计思路：EvoKit **不做冗余判定**（那需要语义理解，正是 agent 擅长的），而是：

1. **扫描**：通用扫出各 agent 的知识库清单（路径 + 大小 + 修改时间 + 软链接指向）
2. **生成通用 prompt**：把清单填进一份整理任务 prompt
3. **调用 agents cli**：直接调 `claude` / `pi` / `codex` 的 CLI，让 agent 自己找出重复/冲突/过期/断链
4. **回显**：把 agent 返回的结构化报告展示给你

```bash
evokit inventory                  # 调所有可用 agent 整理并回显
evokit inventory --agent claude   # 只让 claude 整理
evokit inventory --prompt         # 只生成 prompt，不调 CLI（调试/手动喂）
evokit inventory --output report.md  # 报告导出到指定 .md（覆盖默认目录）
evokit inventory --no-output      # 禁用导出，只在终端回显
```

报告默认导出为 Markdown：全局模式写到 `~/.evokit/reports/evokit-inventory-<时间戳>.md`，`--project` 模式写到 `<cwd>/.evokit/reports/evokit-inventory-<时间戳>.md`。`--output <file>`（或 `-o`）可覆盖为任意路径并绝对优先，`--no-output` 完全禁用导出。

> **依赖**：会调用本机的 `claude` / `pi` / `codex` CLI。Pi 和 Codex 依赖 Node 24（经 `fnm` 安装），EvoKit 会自动探测 `fnm` 的 installation 目录。未安装的 agent 会提示「未检测到 CLI，跳过」，不影响其他 agent。
>
> **只读安全**：inventory 只扫描和调用 agent 分析，不修改任何文件。agent 返回的是「建议」，具体整理动作仍需你确认后手动执行。

### 记忆引擎（v3）：harvest / learn / review / forge

经验层流水线 `harvest → distill → review`：把各 AI 工具的会话史提纯成统一知识库（`~/.evokit/knowledge/`，独立 git 版本化，commit 形如 `learn: <标题>`）。

```bash
evokit harvest                  # 采集所有启用源 → ~/.evokit/inbox/（水位线增量 + 收割即脱敏）
evokit harvest --full           # 忽略水位线全量处理
evokit harvest --source claude-sessions  # 只跑指定源
evokit harvest --dry-run        # 只报告不写盘
evokit learn                    # harvest→distill→按档位处理草稿，尾部报告各步计数
evokit learn --no-distill       # 只采集，不提纯
evokit learn --agent claude     # 显式指定提纯执行者（claude 不在自动链，注意超时风险）
evokit learn --session <id>     # 只提纯指定会话
evokit learn --auto             # 本次临时用 auto 档（全部自动入库）
evokit review                   # 待审草稿清单
evokit review --accept <id>     # 接受草稿入库（confirmed + 索引重建 + git commit）
evokit review --reject <id>     # 拒绝草稿（移入 .rejected/）
evokit review --merge <id> <into>  # 并入既有卡（retired + mergedInto，canonical 保留）
evokit review --audit           # 近期自动入库抽查（acceptedBy=auto + git log）
evokit review --skill           # forge 技能草稿清单（trial）
evokit review --skill-accept <name>  # 技能草稿通过并分发（symlink + distributedTo + forge-use 引用 + skill-lock 登记）
evokit review --skill-veto <name>    # 否决技能草稿（vetoed）
evokit forge                    # 列出可锻造的达标知识卡簇
evokit forge --from-tags a,b    # 按标签取卡 → 委托 agent 生成单文件 SKILL.md 草稿（trial，不直接分发）
evokit forge --topic "发布流程"   # 按主题关键词取卡锻造（--agent <id> 显式指定执行者）
evokit forge --audit            # 试用期审计：trial 满期退役 / vetoed 提示 / 父卡失效提示重审
evokit recall "fnm"              # 本地检索 confirmed 卡（tags×3 ＞ 标题×2 ＞ 正文×1，命中写 references 计数）
evokit recall "fnm" --limit 5    # 只显示前 5 条
evokit recall "fnm" --json       # 输出单个 JSON 数组（供程序/AI 消费）
```

- 源清单与分批/档位参数在 `settings.json` 的 `sources` / `knowledge` 块配置；`knowledge.automation` 默认 `manual`（人在环），`assist` 按 `autoThreshold`（默认 0.9）自动入库，`auto` 全自动。
- distill 委托本机 agent CLI（默认 codex→pi 降级链，claude 不进自动链），解析失败的内容落 `.pending/orphan/` 绝不丢弃；来源可疑的卡打 `suspect` 标记留审；RawEvent 与卡片入库前双点脱敏。
- L1 分发：内置 `knowledge-index` 资源经 `sync --resource knowledge-index` 把 ≤60 行索引写入三入口托管块；索引重建时 pitfall / 被 forge-use 引用的卡带粘性权重（优先保留），源缺失（未 `knowledge init`）时 sync 跳过并提示。
- forge 锻造（D5/D6）：confirmed 且 type ∈ workflow|pattern 的卡按 tags Jaccard ≥ 0.5 聚簇，≥ `knowledge.forgeClusterMin`（默认 3）张达标；`evokit forge` 列出达标簇，`--from-tags a,b` / `--topic "…"` 委托本机 agent 生成单文件 SKILL.md 草稿到 `~/.agents/skills/<name>/`（附 generation.json，`review.status: trial`，parentCards 记录父卡），执行者链同 distill（claude 不进自动链，`--agent` 显式覆盖）。`review --skill` 人工过目；`--skill-accept <name>` 以 symlink 分发到 `~/.claude/skills`、`~/.codex/skills`，回写 `distributedTo`、对每个父卡追加 `forge-use` 引用，并向 `~/.agents/skills/.skill-lock.json` 无损追加登记（解析失败/非数组则跳过并提示，绝不破坏原文件）；`--skill-veto <name>` 否决。`forge --audit` 月度体检：trial 超 30 天且 0 uses 退役移入 `~/.agents/skills/.retired/<name>/` 并按 distributedTo 回收链接（只删链接/junction，绝不删真实目录）；vetoed 技能提示；confirmed 技能父卡过半 `validUntil` 过期时提示「技能需重审」。

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
> **相对路径提醒**：`settings.json` 的 `agents[].global` 和 `resources[].source/targets` 建议用 `~` 开头或绝对路径，避免相对路径被解析到 cwd 造成歧义。项目级入口（`agents[].project` 字段）是例外，它固定基于项目目录拼接，不经过 `expandPath`。
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
    ├── defaults.js     # 默认配置（agents/resources/prompts）+ 源内容
    ├── config.js       # settings.json 读写 + 过滤器
    ├── fs-utils.js     # 文件工具（托管块、软链接、ensureSource）
    ├── syncers.js      # 同步器分派（text / symlink / remote）
    ├── remote.js       # 远程源拉取（内置 fetch + HTTP CONNECT 代理，本地缓存）
    ├── agents-cli.js   # agents CLI 探测与调用（inventory 委托 agent 整理用）
    └── commands/       # 各命令实现（按命令族拆分）
        ├── index.js    # 汇总导出（统一入口）
        ├── init.js     # initGlobal / initProject
        ├── sync.js     # syncGlobal / syncProject / syncResources
        ├── check.js    # check + ctxlint 内容健康检查
        ├── status.js   # status（全局 / 项目级）
        ├── uninstall.js# uninstallGlobal / uninstallProject
        ├── inventory.js# inventory 盘点 + 委托 agent 找冗余
        ├── list.js     # listAgents / listResources
        └── help.js     # help
```

| 模块 | 职责 |
| --- | --- |
| `paths.js` | `HOME`、`EVOKIT_DIR`、`CONFIG_FILE`、`BEGIN`/`END` 标记、`expandPath` |
| `defaults.js` | `DEFAULT_CONFIG`（`DEFAULT_AGENTS`、`DEFAULT_RESOURCES`、`DEFAULT_PROMPTS`）、`DEFAULT_CONTEXT` |
| `config.js` | `loadConfig`、`loadAgents`、`loadResources`、`loadPrompts`、过滤器 |
| `fs-utils.js` | `readSource`、`applyBlock`、`applyManagedBlock`、`ensureSource`、`makeSymlink` |
| `syncers.js` | `SYNCERS` 分派、`syncText`、`syncSymlink`、`syncRemote`、`resolveSyncer` |
| `remote.js` | `fetchRemote`、`isRemote`、`resolveProxy`（远程源拉取 + 代理 + 本地缓存） |
| `agents-cli.js` | `detectAgentClis`、`runAgentCli`（agents CLI 探测 + fnm 路径解析 + 非交互调用） |
| `commands/index.js` | 汇总导出所有命令 |
| `commands/init.js` | `initGlobal`、`initProject` |
| `commands/sync.js` | `syncGlobal`、`syncProject`、`syncResources` |
| `commands/check.js` | `check` + ctxlint 内容健康检查 |
| `commands/status.js` | `status`（全局 / 项目级） |
| `commands/uninstall.js` | `uninstallGlobal`、`uninstallProject` |
| `commands/inventory.js` | `inventory`（扫描 + 通用 prompt + 委托 agent 找冗余） |
| `commands/list.js` | `listAgents`、`listResources` |
| `commands/help.js` | `help` |

依赖方向单一（paths/defaults → config/fs-utils/remote/agents-cli → syncers → commands → 入口），无循环依赖。

## 测试

```bash
node test-local.mjs        # 隔离测试（EVOKIT_HOME 重定向到临时目录）
```

覆盖 init / sync / check / status / uninstall（含项目级 check/status/uninstall）/ agents / resources / inventory、`--agent`/`--resource` 过滤、位置参数回退、错误提示意图猜测、新增 agent/资源零代码改动、软链接、跨平台路径展开、远程源、代理、数据保护（sync 保留块外用户内容）、配置分层、统一配置（settings.json 三块结构 + prompts 覆盖 + cli 字段）等 87 项断言。
