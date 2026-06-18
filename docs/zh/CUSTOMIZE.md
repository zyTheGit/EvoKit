# 定制指南

EvoKit 设计为可定制的。本指南涵盖了主要的扩展点。

## 自定义规则

规则是 `.claude/rules/` 中的 markdown 文件，包含 `paths` 前置元数据字段。

### 基础规则

```markdown
---
paths: "*/terraform*"
---

# Terraform 约定

- 每次提交前使用 `terraform fmt`
- 后端配置必须使用 `s3`，决不要用 local
```

### 路径模式

`paths` 字段控制规则的加载时机：

| 模式 | 加载时机 |
|------|---------|
| `"*/terraform*"` | 编辑路径中包含 "terraform" 的任何文件时 |
| `"*"` | 始终加载 |
| `"src/*"` | 编辑 `src/` 中的文件时 |

### 含有验证检查的规则

当规则从学习中毕业时，它包含一条验证命令：

```markdown
- **使用 uv 而非 pip**
  <!-- verify: grep -r 'pip install' ~/ --include='*.md' --include='*.sh' && exit 1 || exit 0 -->
```

## 自定义代理

代理是 `.claude/agents/` 中带有前置元数据的 markdown 文件。

### 创建代理

```markdown
---
name: my-agent
description: 此代理的功能描述
model: haiku
tools: [Read, Bash, Grep]
disallowedTools: [Write, Edit]
memory: project
isolation: worktree
maxTurns: 10
---

# My Agent

给代理的指令...
```

### 可用选项

| 字段 | 必填 | 描述 |
|------|------|------|
| `name` | 是 | 代理名称，用作 `claude agent <name>` |
| `description` | 是 | 用于发现的一行描述 |
| `model` | 是 | sonnet / haiku / opus |
| `tools` | 是 | 允许的工具名称数组 |
| `disallowedTools` | 否 | 明确禁用的工具数组 |
| `maxTurns` | 否 | 最大工具使用轮次（默认：20） |
| `memory` | 否 | 记忆范围：`user`、`project`、`local` |
| `isolation` | 否 | 设置为 `worktree` 以使用隔离的 git worktree |
| `background` | 否 | 设置为 `true` 以在后台执行任务 |

## 自定义技能

技能是 `.claude/skills/<name>/SKILL.md` 中的自动调用工作流定义。

### 创建技能

```markdown
---
name: my-skill
description: 此技能自动调用时的功能描述
disable-model-invocation: true
---

# My Skill

供 Claude 在技能相关时遵循的详细指令...
```

### 技能前置元数据

| 字段 | 必填 | 描述 |
|------|------|------|
| `name` | 是 | 显示名称（kebab-case，最多 64 字符） |
| `description` | 是 | 技能功能描述（最多 1024 字符） |
| `disable-model-invocation` | 否 | 防止自动加载（默认：false） |
| `context` | 否 | 在隔离的子代理上下文中运行（`fork`） |
| `allowed-tools` | 否 | 无需询问即可使用的工具 |
| `model` | 否 | 模型覆盖 |

### 技能的工作原理

技能使用**渐进式披露**——只有 `description`（约 30-50 token）被加载到上下文中。当 Claude 判断技能相关时，完整指令会按需加载。你可以拥有 100 个以上的技能而不会显著影响上下文。

## 自定义命令

命令是 `.claude/commands/` 中带有前置元数据的 markdown 文件。

### 创建命令

```markdown
---
description: 在 /help 中显示的一行描述
---

# /mycommand -- 我的命令

此命令的功能及使用方式。
```

命令以 `/mycommand` 的形式调用，并且可以传递参数。

## 自定义钩子

钩子在 `settings.json` 中配置。每个钩子事件可以触发 shell 命令、HTTP 请求或 LLM 提示。

### 添加自定义钩子

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/my-custom-hook.sh",
            "async": true,
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### 钩子类型

| 类型 | 描述 |
|------|------|
| `command` | 执行 shell 脚本 |
| `http` | 发送 HTTP POST 请求 |
| `prompt` | 委托决策给 LLM |
| `agent` | 使用子代理进行验证 |

### 钩子退出码

| 码 | 含义 |
|-----|-------|
| 0 | 允许/成功 |
| 1 | 非阻塞警告 |
| 2 | 阻止该操作（仅 PreToolUse） |

请参阅 [ARCHITECTURE.md](ARCHITECTURE.md) 的第 4 层部分，了解 17 个以上可用钩子事件的完整列表。

## 自动记忆

Claude Code 内置的自动记忆功能可自动保存笔记：
- 笔记存储在 `~/.claude/projects/<slug>/memory/`
- 通过 `settings.json` 中的 `autoMemoryEnabled` 控制
- 通过 `autoMemoryDirectory` 自定义路径
- 使用 `/memory` 查看，使用 `/toggle-memory` 开关

在 settings.json 中设置 `"autoMemoryEnabled": false` 或设置环境变量 `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` 可将其禁用。

## 调整轮换阈值

轮换和置信度衰减阈值位于钩子和进化命令中：

1. **`pre-compact.sh`** 和 **`export-system.sh`** —— 轮换步骤中的 Python 代码：
   - `max_lines=500` —— 触发轮换
   - `max_days=30` —— 归档阈值
   - `confidence_decay_max_days=60` —— 衰减阈值
   - `confidence_threshold=0.3` —— 衰减后归档

2. **`commands/evolve.md`** —— 记录阈值（需更新以保持一致）

## 多代理设置

参见 [MULTI_AGENT.md](MULTI_AGENT.md) 了解与其他 AI 编码助手的集成。
