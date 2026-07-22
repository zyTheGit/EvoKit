# 多智能体适配器架构

> **状态：** 计划中（v0.3+ / v0.4+）
> 本文档定义了用于与其他 AI 编码助手集成的适配器接口。

## 动机

EvoKit 目前通过其钩子系统与 Claude Code 协作。然而，其进化流水线（修正 → 观察 → 提升 → 毕业）是**助手无关的**——任何 AI 编码助手都可以从中受益。

适配器架构将进化引擎与特定 AI 助手解耦，使得学习成果可以在不同工具间共享。

## 适配器接口

```typescript
interface AgentAdapter {
  /** AI 助手的名称 */
  name: string;

  /**
   * 为此助手安装 EvoKit。
   * 复制模板，配置钩子/插件，设置环境。
   */
  install(config: InstallConfig): Promise<InstallResult>;

  /**
   * 注册生命周期钩子。
   * 每个助手的钩子机制不同——此接口将其抽象化。
   */
  setupHooks(events: HookEvent[]): Promise<void>;

  /**
   * 将学习数据注入助手的上下文中。
   * 具体实现方式取决于助手——可能涉及文件、环境变量或 API 调用。
   */
  injectMemory(data: MemoryData): Promise<void>;

  /**
   * 从助手中导出学习数据。
   * 提取助手已学到的内容（修正、观察）。
   */
  exportMemory(): Promise<MemoryData>;

  /**
   * 在助手的上下文中执行命令。
   * 用于 /boot、/evolve、/review 等命令。
   */
  runCommand(name: string, args: string[]): Promise<CommandResult>;
}

// 类型定义

interface InstallConfig {
  targetPath: string; // 安装目标路径（例如 ~/.claude/）
  templatePath: string; // 模板所在路径
  adapterOptions?: Record<string, any>;
}

interface InstallResult {
  success: boolean;
  filesInstalled: string[];
  errors: string[];
}

interface HookEvent {
  event: 'SessionStart' | 'Stop' | 'PreToolUse' | string;
  handler: string; // 命令路径或回调
}

interface MemoryData {
  corrections: Correction[];
  observations: Observation[];
  learnedRules: string;
  evolutionLog: string;
  sessions: SessionRecord[];
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
```

## 已规划的适配器

### Claude Code 适配器（v0.1 — ✅ 当前版本）

| 方面   | 实现方式                           |
| ------ | ---------------------------------- |
| 安装   | 将模板复制到 `~/.claude/`          |
| 钩子   | `settings.json` 钩子配置           |
| 记忆   | 基于文件，存储在 `.claude/memory/` |
| 命令   | `.claude/commands/` 中的斜杠命令   |
| 智能体 | `.claude/agents/` 中的子智能体定义 |
| 状态   | ✅ 已完成                          |

### Codex CLI 适配器（v0.3 — ✅ 已实现）

| 方面     | 实现方式                                                      |
| -------- | ------------------------------------------------------------- |
| 安装     | `evokit init --adapter codex` — 复制到 `~/.codex/`            |
| 钩子     | `hooks.json` — SessionStart、Stop、PreToolUse 事件            |
| 规则     | `~/.codex/rules/` 中的 Starlark `.rules` 文件                 |
| 记忆     | `~/.codex/memory/`（按适配器独立，标记 `assistant: "codex"`） |
| 认知核心 | `~/.codex/AGENTS.md`（类似于 CLAUDE.md）                      |
| 配置     | `~/.codex/config.toml`（功能开关、模型、权限）                |
| 命令     | `evokit evolve`、`evokit doctor`、基于 shell 的 `/boot`       |
| 状态     | ✅ v0.3.0 — 已完成                                            |

#### EvoKit → Codex CLI 映射

| EvoKit 概念                    | Codex CLI 对应项                     |
| ------------------------------ | ------------------------------------ |
| `~/.claude/` + `CLAUDE.md`     | `~/.codex/` + `AGENTS.md`            |
| `.claude/hooks/settings.json`  | `hooks.json` + 内联 `[hooks]` TOML   |
| `.claude/rules/`（markdown）   | `.codex/rules/`（Starlark `.rules`） |
| `.claude/agents/`              | 子智能体 + 技能                      |
| `.claude/commands/`（`/boot`） | SessionStart 钩子 + `codex exec`     |
| `.claude/memory/`（JSONL）     | `~/.codex/memory/`（按适配器独立）   |

#### 安装后结构

使用 `evokit init --adapter codex` 安装后，将创建以下内容：

```
~/.codex/
├── AGENTS.md              # L1 认知核心（思考框架、进化协议）
├── hooks.json             # 生命周期钩子配置
├── config.toml            # 功能开关、权限、模型设置
├── rules/
│   └── evokit-base.rules  # Starlark 安全规则（rm -rf、git push --force、sudo...）
├── hooks-scripts/
│   ├── session-start.sh   # 会话启动时的引导验证
│   ├── stop.sh            # 会话记录到 ~/.codex/memory/
│   └── pre-tool-use.sh    # 已学规则上下文注入
└── memory/
    └── README.md          # 学习数据目录
```

### OpenCode CLI 适配器（v0.4 — ✅ 已实现）

| 方面     | 实现方式                                                         |
| -------- | ---------------------------------------------------------------- |
| 安装     | `evokit init --adapter opencode`（或 `bash install.sh`，选项 3） |
| 钩子     | 无——由 `.opencode/tools/` 中的自定义工具替代                     |
| 记忆     | `.opencode/memory/`（按适配器独立，项目级别）                    |
| 命令     | 使用 `@opencode-ai/plugin` 的自定义工具                          |
| 认知核心 | 项目根目录 `AGENTS.md`                                           |
| 配置     | 项目根目录 `opencode.json`                                       |
| 子智能体 | `.opencode/agents/` Markdown 文件                                |
| 状态     | ✅ v0.4.0 — 已完成                                               |

#### EvoKit → OpenCode CLI 映射

| EvoKit 概念                    | OpenCode 对应项                                         |
| ------------------------------ | ------------------------------------------------------- |
| `~/.claude/` + `CLAUDE.md`     | 项目根目录 `AGENTS.md`                                  |
| `.claude/hooks/settings.json`  | 无——自定义工具替代钩子                                  |
| `.claude/hooks/`（shell 脚本） | `.opencode/tools/`（TypeScript，`@opencode-ai/plugin`） |
| `.claude/rules/`（markdown）   | `opencode.json` → `instructions` 字段（glob 模式）      |
| `.claude/agents/`              | `.opencode/agents/`（Markdown + YAML 前置元数据）       |
| `.claude/commands/`（`/boot`） | `.opencode/tools/evokit-boot.ts`                        |
| `.claude/memory/`（JSONL）     | `.opencode/memory/`（按适配器独立）                     |
| SessionStart 钩子              | 自定义工具 `evokit-boot.ts`（由 AI 调用）               |
| Stop 钩子                      | 自定义工具 `evokit-session.ts`（由 AI 调用）            |

#### 重要提示：无自动钩子

OpenCode 没有 SessionStart/Stop 生命周期钩子，因此：

- **引导验证不会自动执行**——AI 必须调用 `evokit-boot.ts`（通过 `AGENTS.md` 中的指令实现）
- **会话记录不会自动执行**——AI 必须在结束前调用含 `action: "end"` 的 `evokit-session.ts`
- 所有工具都是幂等的——多次调用是安全的

#### 安装后结构

```
project-root/
├── AGENTS.md                          # L1 认知核心
├── opencode.json                      # OpenCode 配置
└── .opencode/
    ├── tools/
    │   ├── evokit-boot.ts             # 引导验证工具
    │   ├── evokit-evolve.ts           # 进化审计工具
    │   ├── evokit-memory.ts           # 记忆管理工具
    │   └── evokit-session.ts          # 会话记录工具
    ├── agents/
    │   ├── architect.md               # 架构师子智能体
    │   └── reviewer.md                # 审查者子智能体
    └── memory/
        └── README.md                  # 学习数据目录
```

### Pi CLI 适配器（v0.4 — 🔜 计划中）

| 方面 | 实现方式                             |
| ---- | ------------------------------------ |
| 安装 | ~/.pi/agent/（全局）+ .pi/（项目级） |
| 钩子 | Pi CLI 扩展 + 技能                   |
| 记忆 | ~/.pi/agent/ 记忆（按适配器独立）    |
| 命令 | Pi CLI 技能                          |

## 按适配器划分的学习数据

每个适配器将其学习数据存储在自己的目录中：

| 适配器       | 记忆路径                      |
| ------------ | ----------------------------- |
| Claude Code  | `~/.claude/memory/`           |
| Codex CLI    | `~/.codex/memory/`            |
| OpenCode CLI | `<project>/.opencode/memory/` |

每条会话记录使用标签标识助手：

```json
{
  "timestamp": "2026-06-11T14:30:00",
  "assistant": "opencode",
  "duration_seconds": 300,
  "corrections": 2,
  "score": "A"
}
```

每条会话记录标识助手：

```json
{
  "timestamp": "2026-06-11T14:30:00",
  "assistant": "claude-code",
  "duration_seconds": 300,
  "corrections": 2,
  "observations": 1,
  "score": "A"
}
```

## 贡献

要添加新的适配器：

1. 实现 `AgentAdapter` 接口
2. 在 `template/adapters/<name>/` 中创建模板
3. 在 `tests/<name>-adapter/` 中编写测试
4. 更新本文档
5. 提交 PR！

参与指南请参见 [CONTRIBUTING.md](../CONTRIBUTING.md)。
