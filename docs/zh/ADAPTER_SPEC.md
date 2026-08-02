# 适配器规格文档

> 本文档记录 EvoKit 支持的各 AI 编程助手 CLI 的官方文档摘要、版本号、生命周期事件和扩展机制。
> 当 CLI 提供的 hooks、触发事件、规则等发生变更时，需更新对应章节并注明支持的版本号。

---

## Claude Code

### 版本信息

| 项目              | 版本                        |
| ----------------- | --------------------------- |
| EvoKit 适配器版本 | 0.2.0                       |
| CLI 最低支持版本  | ≥ 2.1.0                     |
| CLI 最新已知版本  | 2.1.217                     |
| npm 包名          | `@anthropic-ai/claude-code` |

### 目录结构

| 路径                                   | 用途                                |
| -------------------------------------- | ----------------------------------- |
| `~/.claude/`                           | 全局配置目录                        |
| `~/.claude/CLAUDE.md`                  | 用户级认知核心（所有项目）          |
| `./CLAUDE.md` 或 `./.claude/CLAUDE.md` | 项目级认知核心                      |
| `./CLAUDE.local.md`                    | 本地指令（仅自己，加入 .gitignore） |
| `~/.claude/settings.json`              | 全局设置                            |
| `.claude/settings.json`                | 项目设置                            |
| `.claude/settings.local.json`          | 本地设置（gitignored）              |
| `~/.claude/rules/`                     | 全局路径规则                        |
| `.claude/rules/`                       | 项目路径规则                        |
| `~/.claude/commands/`                  | 斜杠命令（已合并到 Skills）         |
| `~/.claude/agents/`                    | 子代理定义                          |
| `~/.claude/skills/`                    | 技能定义                            |
| `~/.claude/hooks/`                     | Hook 脚本                           |
| `~/.claude/memory/`                    | 私有数据目录（知识在共享根 `.evokit/`）              |

### 生命周期事件

| 事件                  | 触发时机             | 可阻断 | EvoKit 使用         |
| --------------------- | -------------------- | ------ | ------------------- |
| `SessionStart`        | 会话开始或恢复       | 否     | ✅ session-start.sh |
| `PreToolUse`          | 工具调用执行前       | 是     | ✅ pre-tool-use.sh  |
| `PostToolUse`         | 工具调用成功后       | 否     | ✅ post-tool-use.sh |
| `PreCompact`          | 上下文压缩前         | 是     | ✅ pre-compact.sh   |
| `Stop`                | Claude 完成响应      | 是     | ✅ stop.sh          |
| `SessionEnd`          | 会话终止             | 否     | ❌                  |
| `PostToolUseFailure`  | 工具调用失败后       | 否     | ❌                  |
| `PostToolBatch`       | 并行工具批处理完成后 | 是     | ❌                  |
| `SubagentStart`       | 子代理启动           | 否     | ❌                  |
| `SubagentStop`        | 子代理完成           | 是     | ❌                  |
| `UserPromptSubmit`    | 用户提交提示词       | 是     | ❌                  |
| `UserPromptExpansion` | 用户命令扩展         | 是     | ❌                  |
| `PermissionRequest`   | 权限对话框出现       | 是     | ❌                  |
| `PermissionDenied`    | 工具调用被拒绝       | 否     | ❌                  |
| `Notification`        | 发送通知             | 否     | ❌                  |
| `InstructionsLoaded`  | CLAUDE.md/rules 加载 | 否     | ❌                  |
| `ConfigChange`        | 配置文件变更         | 是     | ❌                  |
| `FileChanged`         | 监视文件变更         | 否     | ❌                  |
| `WorktreeCreate`      | Worktree 创建        | 是     | ❌                  |
| `WorktreeRemove`      | Worktree 移除        | 否     | ❌                  |
| `PostCompact`         | 上下文压缩后         | 否     | ❌                  |
| `TaskCreated`         | 任务创建             | 是     | ❌                  |
| `TaskCompleted`       | 任务完成             | 是     | ❌                  |
| `TeammateIdle`        | Agent team 队友空闲  | 是     | ❌                  |
| `Setup`               | 初始化模式           | 否     | ❌                  |
| `StopFailure`         | API 错误导致停止     | 否     | ❌                  |
| `MessageDisplay`      | 消息显示             | 否     | ❌                  |
| `Elicitation`         | MCP 用户交互请求     | 是     | ❌                  |
| `ElicitationResult`   | MCP 用户交互响应     | 是     | ❌                  |

### Hook Handler 类型

| 类型       | 关键字段                                                                      | 说明                 |
| ---------- | ----------------------------------------------------------------------------- | -------------------- |
| `command`  | `command`, `args`, `async`, `timeout`, `shell`, `if`, `statusMessage`, `once` | Shell 命令执行       |
| `http`     | `url`, `headers`, `allowedEnvVars`, `timeout`                                 | HTTP POST 请求       |
| `mcp_tool` | `server`, `tool`, `input`                                                     | MCP 工具调用         |
| `prompt`   | `prompt`, `model`                                                             | LLM 提示评估         |
| `agent`    | `prompt`, `model`                                                             | 子代理验证（实验性） |

### Hook 退出码语义

| 退出码 | 含义                                       |
| ------ | ------------------------------------------ |
| 0      | 成功，stdout 解析为 JSON 输出              |
| 2      | 阻断错误，stderr 反馈给 Claude，操作被阻止 |
| 其他   | 非阻断错误，执行继续                       |

### 配置位置（按优先级从高到低）

1. 托管策略设置（组织范围）
2. `~/.claude/settings.json`（用户级）
3. `.claude/settings.json`（项目级）
4. `.claude/settings.local.json`（本地级）

### CLAUDE.md 特性

- 支持 `@path/to/import` 语法导入其他文件（最大 4 层递归）
- `AGENTS.md` 可通过 `@AGENTS.md` 导入
- HTML 注释在注入前被剥离，不消耗 token
- 建议每个 CLAUDE.md 不超过 200 行

### Rules 系统

- 支持 YAML frontmatter 的 `paths` 字段限定加载范围
- 无 `paths` 字段的规则在启动时无条件加载
- 支持 glob 模式匹配和符号链接

### Skills 系统

- 位于 `.claude/skills/<name>/SKILL.md`
- 支持 frontmatter 控制：`disable-model-invocation`、`user-invocable`、`allowed-tools`、`model`、`effort`、`paths` 等
- 支持动态上下文注入：`` !`command` `` 语法
- 支持字符串替换：`$ARGUMENTS`、`${CLAUDE_SESSION_ID}` 等

### Agents 系统

- 位于 `.claude/agents/`
- Frontmatter 字段：`name`、`description`、`permission`、`model`、`maxTurns`、`skills`、`mcpServers`、`hooks`、`memory`、`background`、`effort`、`isolation` 等
- Skills/Agent frontmatter 中可定义 Hooks

### 权限系统

- 规则格式：`Tool` 或 `Tool(specifier)`
- 评估顺序：deny > ask > allow
- Specifier 模式：精确匹配、通配符、glob、正则

---

## Codex CLI

### 版本信息

| 项目              | 版本            |
| ----------------- | --------------- |
| EvoKit 适配器版本 | 0.4.0           |
| CLI 最低支持版本  | ≥ 1.0.0         |
| CLI 最新已知版本  | 待确认          |
| npm 包名          | `@openai/codex` |

### 目录结构

| 路径                      | 用途                       |
| ------------------------- | -------------------------- |
| `~/.codex/`               | 全局配置目录               |
| `~/.codex/AGENTS.md`      | 认知核心（类似 CLAUDE.md） |
| `~/.codex/hooks.json`     | 生命周期钩子配置           |
| `~/.codex/config.toml`    | 功能开关、权限、模型设置   |
| `~/.codex/rules/`         | Starlark `.rules` 安全规则 |
| `~/.codex/hooks-scripts/` | Hook 脚本                  |
| `~/.codex/memory/`        | 私有数据目录（知识在共享根 `.evokit/`）     |

### 生命周期事件

| 事件                | 触发时机       | EvoKit 使用         |
| ------------------- | -------------- | ------------------- |
| `SessionStart`      | 会话开始       | ✅ session-start.sh |
| `Stop`              | 会话结束       | ✅ stop.sh          |
| `PreToolUse`        | 工具调用前     | ✅ pre-tool-use.sh  |
| `PostToolUse`       | 工具调用后     | ❌（可选增强）      |
| `SubagentStart`     | 子代理启动     | ❌                  |
| `SubagentStop`      | 子代理完成     | ❌                  |
| `UserPromptSubmit`  | 用户提交提示词 | ❌                  |
| `PermissionRequest` | 权限请求       | ❌                  |

> **注意**：Codex CLI 的官方文档获取受限。PostToolUse 等事件基于 Claude Code hooks 系统推断，标记为可选/实验性。

### Hook 配置格式

```json
{
  "hooks": {
    "<EventName>": [
      {
        "matcher": "<pattern>",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/script.sh",
            "timeout": 30,
            "statusMessage": "描述信息"
          }
        ]
      }
    ]
  }
}
```

也支持内联 TOML 格式（在 `config.toml` 的 `[hooks]` 段）。

### Rules 系统

- 使用 Starlark 语言的 `.rules` 文件
- 支持 `prefix_rule()` 函数定义安全规则
- 字段：`pattern`、`decision`（prompt/allow/deny）、`justification`、`match`、`not_match`

### 配置文件 (config.toml)

```toml
[features]
hooks = true
memories = true
multi_agent = true

approval_policy = "on-request"
sandbox_mode = "workspace-write"

[shell_environment_policy]
include_only = ["PATH", "HOME", "USER"]
```

---

## OpenCode CLI

### 版本信息

| 项目              | 版本                   |
| ----------------- | ---------------------- |
| EvoKit 适配器版本 | 0.5.0                  |
| CLI 最低支持版本  | ≥ 0.1.0                |
| CLI 最新已知版本  | 待确认（无版本号标注） |

### 目录结构

| 路径                               | 用途                     |
| ---------------------------------- | ------------------------ |
| `~/.config/opencode/`              | 全局配置目录（遵循 XDG） |
| `~/.config/opencode/AGENTS.md`     | 全局认知核心             |
| `~/.config/opencode/opencode.json` | 全局配置                 |
| `~/.config/opencode/agents/`       | 全局子代理定义           |
| `~/.config/opencode/memory/`       | 私有数据目录（知识在共享根 `.evokit/`）       |
| `~/.config/opencode/skills/`       | 全局技能                 |
| `.opencode/tools/`                 | 项目级自定义工具         |
| `.opencode/agents/`                | 项目级代理覆盖           |
| `.opencode/memory/`                | 项目级学习数据           |
| `./AGENTS.md`                      | 项目级认知核心           |
| `./opencode.json`                  | 项目级配置               |

### 生命周期事件

**OpenCode 没有生命周期 hooks 系统。** EvoKit 命令通过 `.opencode/tools/` 中的自定义工具实现。

| EvoKit 功能       | OpenCode 实现方式              | 自动触发          |
| ----------------- | ------------------------------ | ----------------- |
| SessionStart hook | `evokit-boot.ts` 自定义工具    | ❌ 需 AI 主动调用 |
| Stop hook         | `evokit-session.ts --action flush_pending`（会话末落盘 .pending） | ❌ 需 AI 主动调用 |
| 确认背书 / 显式声明 | `evokit-learn.ts` 自定义工具   | ❌ 经 CLI `evokit learn` |
| 知识库检查        | `evokit-boot.ts` 自定义工具    | ❌ 需 AI 主动调用 |

### 自定义工具系统

- 使用 `@opencode-ai/plugin` SDK
- 工具定义在 `.opencode/tools/*.ts`
- 工具通过 `tool()` 函数定义，包含 `description`、`args`、`execute`

### 内置工具（12 个）

| 工具        | 权限键      | 说明               |
| ----------- | ----------- | ------------------ |
| `bash`      | `bash`      | 执行 Shell 命令    |
| `edit`      | `edit`      | 精确字符串替换编辑 |
| `write`     | `edit`      | 创建/覆盖文件      |
| `read`      | `read`      | 读取文件内容       |
| `grep`      | `grep`      | 正则内容搜索       |
| `glob`      | `glob`      | 模式文件查找       |
| `lsp`       | `lsp`       | LSP 交互（实验性） |
| `patch`     | `edit`      | 应用补丁文件       |
| `skill`     | `skill`     | 加载 SKILL.md      |
| `todowrite` | `todowrite` | 管理待办列表       |
| `webfetch`  | `webfetch`  | 获取网页内容       |
| `websearch` | `websearch` | Web 搜索（Exa AI） |
| `question`  | `question`  | 向用户提问         |

### opencode.json 配置字段

| 字段                 | 说明          |
| -------------------- | ------------- |
| `model`              | 主模型        |
| `small_model`        | 轻量任务模型  |
| `provider`           | 提供商配置    |
| `tui`                | TUI 设置      |
| `server`             | 服务器设置    |
| `tools`              | 工具启用/禁用（已废弃，使用 permission） |
| `theme`              | 主题          |
| `agent`              | 代理配置      |
| `default_agent`      | 默认代理      |
| `share`              | 分享设置      |
| `command`            | 自定义命令    |
| `keybinds`           | 快捷键        |
| `autoupdate`         | 自动更新      |
| `formatter`          | 代码格式化器  |
| `permission`         | 权限控制      |
| `compaction`         | 上下文压缩    |
| `watcher`            | 文件监视      |
| `mcp`                | MCP 服务器    |
| `plugin`             | 插件列表      |
| `instructions`       | 指令文件列表  |
| `disabled_providers` | 禁用的提供商  |
| `enabled_providers`  | 启用的提供商  |

### 变量替换

- 环境变量：`{env:VARIABLE_NAME}`
- 文件内容：`{file:path/to/file}`

---

## Pi CLI

### 版本信息

| 项目              | 版本                              |
| ----------------- | --------------------------------- |
| EvoKit 适配器版本 | 0.6.0                             |
| CLI 最低支持版本  | ≥ 0.81.0                          |
| CLI 最新已知版本  | 0.81.1                            |
| npm 包名          | `@earendil-works/pi-coding-agent` |

### 目录结构

#### 全局配置 (`~/.pi/agent/`)

| 路径                           | 用途               |
| ------------------------------ | ------------------ |
| `~/.pi/agent/settings.json`    | 全局设置           |
| `~/.pi/agent/trust.json`       | 项目信任决策       |
| `~/.pi/agent/AGENTS.md`        | 全局认知核心       |
| `~/.pi/agent/SYSTEM.md`        | 系统提示词替换     |
| `~/.pi/agent/APPEND_SYSTEM.md` | 系统提示词追加     |
| `~/.pi/agent/extensions/`      | TypeScript 扩展    |
| `~/.pi/agent/skills/`          | 全局 Skills        |
| `~/.pi/agent/prompts/`         | 全局 Prompt 模板   |
| `~/.pi/agent/npm/`             | npm 安装的包       |
| `~/.pi/agent/git/`             | git 安装的包       |
| `~/.pi/agent/models.json`      | 自定义提供商和模型 |

#### 项目级配置 (`.pi/`)

| 路径                   | 用途                 |
| ---------------------- | -------------------- |
| `.pi/settings.json`    | 项目设置（覆盖全局） |
| `.pi/SYSTEM.md`        | 项目系统提示词替换   |
| `.pi/APPEND_SYSTEM.md` | 项目系统提示词追加   |
| `.pi/extensions/`      | 项目级扩展（需信任） |
| `.pi/skills/`          | 项目级 Skills        |
| `.pi/prompts/`         | 项目级 Prompt 模板   |

#### 跨工具共享

| 路径                | 用途                        |
| ------------------- | --------------------------- |
| `~/.agents/skills/` | 跨工具共享 Skills（全局）   |
| `.agents/skills/`   | 跨工具共享 Skills（项目级） |

### 环境变量

| 变量                          | 用途                               |
| ----------------------------- | ---------------------------------- |
| `PI_CODING_AGENT_DIR`         | 覆盖配置目录（默认 `~/.pi/agent`） |
| `PI_CODING_AGENT_SESSION_DIR` | 覆盖会话目录                       |
| `PI_PACKAGE_DIR`              | 覆盖包目录                         |
| `PI_OFFLINE=1`                | 禁用启动网络操作                   |
| `PI_SKIP_VERSION_CHECK=1`     | 跳过版本检查                       |
| `PI_TELEMETRY`                | 控制遥测                           |
| `PI_CACHE_RETENTION=long`     | 扩展 prompt cache 保留             |

### 生命周期事件（通过扩展 `pi.on()` 订阅）

#### 启动流程

| 事件                 | 触发时机     | EvoKit 使用            |
| -------------------- | ------------ | ---------------------- |
| `project_trust`      | 项目信任决策 | ❌                     |
| `session_start`      | 会话启动     | ✅ evokit-lifecycle.ts |
| `resources_discover` | 资源发现     | ❌                     |

#### 用户交互

| 事件                 | 触发时机                   | EvoKit 使用 |
| -------------------- | -------------------------- | ----------- |
| `input`              | 用户输入处理               | ❌          |
| `before_agent_start` | Agent 开始前（可注入消息） | ❌          |
| `agent_start`        | Agent 开始                 | ❌          |

#### 每个 Turn

| 事件          | 触发时机                 | EvoKit 使用            |
| ------------- | ------------------------ | ---------------------- |
| `turn_start`  | Turn 开始                | ❌                     |
| `context`     | 上下文构建（可修改消息） | ❌                     |
| `tool_call`   | 工具调用（可拦截/修改）  | ✅ evokit-lifecycle.ts |
| `tool_result` | 工具结果（可修改）       | ❌                     |
| `turn_end`    | Turn 结束                | ❌                     |

#### 会话生命周期

| 事件                     | 触发时机                | EvoKit 使用            |
| ------------------------ | ----------------------- | ---------------------- |
| `agent_end`              | Agent 结束              | ❌                     |
| `agent_settled`          | Agent 不再自动运行      | ❌                     |
| `session_shutdown`       | 会话关闭                | ✅ evokit-lifecycle.ts |
| `session_before_switch`  | 会话切换前              | ❌                     |
| `session_before_compact` | 压缩前（可取消/自定义） | ❌                     |

### 扩展系统

TypeScript 模块，通过 `jiti` 加载（无需编译）：

```typescript
export default function(pi: ExtensionAPI) {
  pi.registerTool({ name: "deploy", ... });
  pi.registerCommand("stats", { ... });
  pi.on("tool_call", async (event, ctx) => { ... });
  pi.sendMessage("消息内容");
}
```

**核心 API**：

- `pi.registerTool()` — 注册自定义工具
- `pi.registerCommand()` — 注册斜杠命令
- `pi.registerShortcut()` — 注册快捷键
- `pi.registerProvider()` — 注册模型提供商
- `pi.on(event, handler)` — 订阅生命周期事件
- `pi.sendMessage()` / `pi.sendUserMessage()` — 注入消息
- `pi.setActiveTools()` — 动态启用/禁用工具

### Skills 系统

遵循 [Agent Skills 标准](https://agentskills.io)，渐进式披露模型：

```markdown
---
name: my-skill
description: 技能描述
allowed-tools: read write bash
---

# 指令内容...
```

发现路径：`~/.pi/agent/skills/`、`~/.agents/skills/`、`.pi/skills/`、`.agents/skills/`

### 设计哲学

Pi 刻意省略以下功能，通过扩展实现：

- **无 MCP** — 用 Skills 或扩展构建
- **无子代理** — 用 tmux 或扩展构建
- **无权限弹窗** — 用容器或扩展构建
- **无 Plan 模式** — 写入文件或扩展构建
- **无内置 TODO** — 用 TODO.md 或扩展构建
- **无后台 Bash** — 用 tmux

---

## EvoKit → 各 CLI 映射总览

| EvoKit 概念 | Claude Code           | Codex CLI                | OpenCode CLI                 | Pi CLI                   |
| ----------- | --------------------- | ------------------------ | ---------------------------- | ------------------------ |
| 认知核心    | `CLAUDE.md`           | `AGENTS.md`              | `AGENTS.md`                  | `AGENTS.md`              |
| 配置目录    | `~/.claude/`          | `~/.codex/`              | `~/.config/opencode/`        | `~/.pi/agent/`           |
| 项目配置    | `.claude/`            | —                        | `.opencode/`                 | `.pi/`                   |
| 配置格式    | JSON                  | JSON + TOML              | JSON                         | JSON                     |
| Hooks 机制  | settings.json hooks   | hooks.json               | 无（custom tools）           | 扩展事件系统             |
| Rules       | `.claude/rules/` (md) | `.codex/rules/` (.rules) | opencode.json instructions   | AGENTS.md + 扩展         |
| Skills      | `.claude/skills/`     | —                        | —                            | `skills/` (Agent Skills) |
| 子代理      | `.claude/agents/`     | 子代理 + Skills          | `.opencode/agents/`          | 无内置（扩展）           |
| 命令        | `.claude/commands/`   | —                        | `.opencode/tools/`           | 扩展 + prompts/          |
| 学习数据（共享根） | `~/.evokit/knowledge/`（个人） | 同左（4 助手共享） | 同左 | 同左 |
