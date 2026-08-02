# 多智能体适配器架构

> **状态：** ✅ 已实现 — Claude Code、Codex CLI、OpenCode CLI、Pi CLI 四个适配器均已完成
> 本文档定义了用于与其他 AI 编码助手集成的适配器接口。

## 动机

EvoKit 通过钩子/扩展/工具系统与 4 个 AI 编码助手协作，提供**项目上下文引擎**（对话提取 + 确认背书）。知识是**助手无关**的——任何 AI 编码助手都可以读写同一份知识。

适配器架构将知识引擎与特定 AI 助手解耦，使得知识可以在不同工具间共享（读助手无关 / 写经各自确认）。

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
   * 提取助手已学到的内容（修正、观察）——v0。v1.0 知识在共享根，无需导出。
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
  // v0 形状（已废弃）。v1.0 知识改经由共享知识根 `~/.evokit/knowledge/` + 确认背书，不再有本接口的 corrections/observations/sessions。
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

## 已实现的适配器

### Claude Code 适配器（v0.1 — ✅ 当前版本）

| 方面   | 实现方式                                                      |
| ------ | ------------------------------------------------------------- |
| 安装   | 将模板复制到 `~/.claude/`（全局）+ `.claude/`（项目级，可选） |
| 钩子   | `settings.json` 钩子配置                                      |
| 记忆   | 私有数据在 `.claude/memory/`；共享知识在 `~/.evokit/knowledge/` + `<project>/.evokit/` |
| 命令   | `.claude/commands/` 中的斜杠命令                              |
| 智能体 | `.claude/agents/` 中的子智能体定义                            |
| 状态   | ✅ 已完成                                                     |

#### 项目级安装

Claude Code 同时支持全局（`~/.claude/`）和项目级（项目根目录下的 `.claude/`）配置。项目级设置非常适合团队共享的规则、命令和智能体，可随仓库一起版本管理。

**项目级目录结构：**

| 路径                    | 用途                                    |
| ----------------------- | --------------------------------------- |
| `.claude/settings.json` | 团队共享设置（hooks、permissions、env） |
| `CLAUDE.md`             | 项目级认知核心（项目根目录）            |
| `.claude/rules/`        | 项目级路径规则                          |
| `.claude/commands/`     | 项目级斜杠命令                          |
| `.claude/agents/`       | 项目级子智能体定义                      |
| `.claude/skills/`       | 项目级技能                              |
| `.claude/memory/`       | 私有数据目录（共享知识在 `.evokit/` 共享根）                |

#### EvoKit → Claude Code 项目级映射

| EvoKit 概念（全局）        | Claude Code 项目级对应项           |
| -------------------------- | ---------------------------------- |
| `~/.claude/` + `CLAUDE.md` | `<project>/.claude/` + `CLAUDE.md` |
| `~/.claude/settings.json`  | `<project>/.claude/settings.json`  |
| `~/.claude/rules/`         | `<project>/.claude/rules/`         |
| `~/.claude/commands/`      | `<project>/.claude/commands/`      |
| `~/.claude/agents/`        | `<project>/.claude/agents/`        |
| `~/.claude/memory/`        | `<project>/.claude/memory/`（私有数据；知识在 `.evokit/`）  |
| —                          | `<project>/.claude/skills/`        |

### Codex CLI 适配器（v0.3 — ✅ 已实现）

| 方面     | 实现方式                                                                              |
| -------- | ------------------------------------------------------------------------------------- |
| 安装     | `evokit init --adapter codex` — 复制到 `~/.codex/`（全局）+ `.codex/`（项目级，可选） |
| 钩子     | `hooks.json` — SessionStart、Stop、PreToolUse 事件                                    |
| 规则     | `~/.codex/rules/` 中的 Starlark `.rules` 文件                                         |
| 记忆     | `~/.codex/memory/`（私有数据；共享知识在 `~/.evokit/knowledge/`）                         |
| 认知核心 | `~/.codex/AGENTS.md`（类似于 CLAUDE.md）                                              |
| 配置     | `~/.codex/config.toml`（功能开关、模型、权限）                                        |
| 命令     | `evokit evolve`、`evokit doctor`、基于 shell 的 `/boot`                               |
| 状态     | ✅ v0.4.0 — 已完成（清单写入 + 卸载支持）                                             |

#### 项目级安装

Codex CLI 同时支持全局（`~/.codex/`）和项目级（项目根目录下的 `.codex/`）配置。项目级设置允许团队在仓库内共享规则、智能体和钩子。

**项目级目录结构：**

| 路径                 | 用途                         |
| -------------------- | ---------------------------- |
| `.codex/config.toml` | 项目级配置                   |
| `AGENTS.md`          | 项目级开发规范（项目根目录） |
| `.codex/rules/`      | 项目级 Starlark 权限规则     |
| `.codex/agents/`     | 项目级子智能体               |
| `.codex/skills/`     | 项目级技能                   |
| `.codex/hooks/`      | 项目级生命周期 hook 脚本     |
| `.codex/memory/`     | 私有数据目录（共享知识在 `.evokit/` 共享根）               |

#### EvoKit → Codex CLI 映射

| EvoKit 概念                    | Codex CLI 对应项                     |
| ------------------------------ | ------------------------------------ |
| `~/.claude/` + `CLAUDE.md`     | `~/.codex/` + `AGENTS.md`            |
| `.claude/hooks/settings.json`  | `hooks.json` + 内联 `[hooks]` TOML   |
| `.claude/rules/`（markdown）   | `.codex/rules/`（Starlark `.rules`） |
| `.claude/agents/`              | 子智能体 + 技能                      |
| `.claude/commands/`（`/boot`） | SessionStart 钩子 + `codex exec`     |
| `.claude/memory/`（JSONL）     | `~/.codex/memory/`（私有数据；知识在共享根）   |

#### EvoKit → Codex CLI 项目级映射

| EvoKit 概念（全局）       | Codex CLI 项目级对应项            |
| ------------------------- | --------------------------------- |
| `~/.codex/` + `AGENTS.md` | `<project>/.codex/` + `AGENTS.md` |
| `~/.codex/config.toml`    | `<project>/.codex/config.toml`    |
| `~/.codex/rules/`         | `<project>/.codex/rules/`         |
| `~/.codex/agents/`        | `<project>/.codex/agents/`        |
| `~/.codex/memory/`        | `<project>/.codex/memory/`（私有数据；知识在 `.evokit/`）        |
| —                         | `<project>/.codex/skills/`        |
| —                         | `<project>/.codex/hooks/`         |

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
│   ├── stop.sh            # 会话末提示待确认（知识在 ~/.evokit/knowledge/）
│   └── pre-tool-use.sh    # 已学规则上下文注入
└── memory/
    └── README.md          # 学习数据目录
```

### OpenCode CLI 适配器（v0.4 — ✅ 已实现）

| 方面     | 实现方式                                                         |
| -------- | ---------------------------------------------------------------- |
| 安装     | `evokit init --adapter opencode`（或 `bash install.sh`，选项 3） |
| 钩子     | 无——由 `.opencode/tools/` 中的自定义工具替代                     |
| 记忆     | `.opencode/memory/`（私有数据；共享知识在 `~/.evokit/knowledge/`）                    |
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
| `.claude/memory/`（JSONL）     | `.opencode/memory/`（私有数据；知识在共享根）                     |
| SessionStart 钩子              | 自定义工具 `evokit-boot.ts`（由 AI 调用）               |
| Stop 钩子                      | 自定义工具 `evokit-session.ts`（由 AI 调用）            |

#### 重要提示：无自动钩子

OpenCode 没有 SessionStart/Stop 生命周期钩子，因此：

- **引导验证不会自动执行**——AI 必须调用 `evokit-boot.ts`（通过 `AGENTS.md` 中的指令实现）
- **会话末落盘不会自动执行**——AI 必须在结束前调用含 `action: "flush_pending"` 的 `evokit-session.ts`（无 Stop 钩子的等价触发点）
- 所有工具都是幂等的——多次调用是安全的

#### 安装后结构

```
project-root/
├── AGENTS.md                          # L1 认知核心
├── opencode.json                      # OpenCode 配置
└── .opencode/
    ├── tools/
    │   ├── evokit-boot.ts             # 知识库完整性检查工具
    │   ├── evokit-learn.ts           # 确认背书 / 显式声明工具
    │   └── evokit-session.ts          # 会话末 flush_pending 落盘工具
    ├── agents/
    │   ├── architect.md               # 架构师子智能体
    │   └── reviewer.md                # 审查者子智能体
    └── memory/
        └── README.md                  # 知识根说明（指向共享根）
```

### Pi CLI 适配器（v0.6 — ✅ 已实现）

| 方面     | 实现方式                                                                   |
| -------- | -------------------------------------------------------------------------- |
| 安装     | `evokit init --adapter pi` — 复制到 `~/.pi/agent/` + `.pi/`                |
| 钩子     | TypeScript 扩展 via `pi.on()` — session_start, session_shutdown, tool_call |
| 记忆     | `~/.pi/agent/memory/`（私有数据；共享知识在 `~/.evokit/knowledge/`）              |
| 命令     | 自定义扩展 — evokit-boot, evokit-learn                                   |
| 认知核心 | `~/.pi/agent/AGENTS.md`（类似于 CLAUDE.md）                                |
| 配置     | `~/.pi/agent/settings.json`（skills + extensions）                         |
| 技能     | `~/.pi/agent/skills/evokit/`（Agent Skills 标准）                          |
| 子智能体 | `~/.pi/agent/agent/` Markdown 文件（architect, reviewer）                  |
| 状态     | ✅ v0.6.0 — 已完成（Pi CLI ≥ 0.82.0）                                      |

#### EvoKit → Pi CLI 映射

| EvoKit 概念                    | Pi CLI 对应项                                        |
| ------------------------------ | ---------------------------------------------------- |
| `~/.claude/` + `CLAUDE.md`     | `~/.pi/agent/` + `AGENTS.md`                         |
| `.claude/hooks/settings.json`  | 扩展 via `pi.on()`（TypeScript 事件系统）            |
| `.claude/hooks/`（shell 脚本） | `~/.pi/agent/extensions/`（TypeScript，`pi.on()`）   |
| `.claude/rules/`（markdown）   | `AGENTS.md` + 扩展（无专用 rules 目录）              |
| `.claude/agents/`              | `~/.pi/agent/agent/`（Markdown + YAML 前置元数据）   |
| `.claude/commands/`（`/boot`） | `~/.pi/agent/extensions/evokit-boot.ts`              |
| `.claude/memory/`（JSONL）     | `~/.pi/agent/memory/`（私有数据；知识在共享根）                |
| SessionStart 钩子              | evokit-lifecycle.ts 中的 `pi.on("session_start")`    |
| Stop 钩子                      | evokit-lifecycle.ts 中的 `pi.on("session_shutdown")` |
| PreToolUse 钩子                | evokit-lifecycle.ts 中的 `pi.on("tool_call")`        |

#### 重要提示：基于扩展的生命周期

Pi CLI 使用 TypeScript 扩展处理生命周期事件，而非基于 shell 的钩子：

- **引导验证是自动的** — `evokit-lifecycle.ts` 通过 `pi.on()` 订阅 `session_start`
- **会话末待确认提示是自动的** — `evokit-lifecycle.ts` 订阅 `session_shutdown`，检查 `.pending/` 非空提示
- **确认背书 / 显式声明** — `evokit-learn.ts` 扩展（经 CLI `evokit learn`）
- 手动命令也可通过 `evokit-boot`、`evokit learn` 调用

#### 安装后结构

```
~/.pi/agent/
├── AGENTS.md                  # L1 认知核心（思考框架、进化协议）
├── settings.json              # 技能 + 扩展配置
├── extensions/
│   ├── evokit-lifecycle.ts    # 生命周期事件（session_start, session_shutdown）
│   ├── evokit-boot.ts         # 知识库完整性检查命令
│   └── evokit-learn.ts        # 确认背书 / 显式声明命令
├── skills/evokit/
│   └── SKILL.md               # EvoKit 技能定义
├── agent/
│   ├── architect.md            # 架构师子智能体
│   └── reviewer.md             # 审查者子智能体
└── memory/
    └── README.md               # 知识根说明（指向共享根）
```

## 共享知识根（v1.0）

所有助理共享同一份知识（读助手无关 / 写经各自确认），知识根脱离任一助手私有目录：

| 层级   | 位置                    | 说明                                |
| ------ | ----------------------- | ----------------------------------- |
| 个人   | `~/.evokit/knowledge/`  | 跨项目共享，agent 无关（4 助手共享） |
| 项目   | `<project>/.evokit/`    | 随 git 走，4 助手共享同一 `.evokit/` |

每个知识根含 `knowledge-index.md`（索引）/ `knowledge/`（条目）/ `.pending/`（待确认草稿）。

唯一写入闸门 = **人工背书**：各助手各自触发确认（claude/codex=Stop，opencode=`evokit-session --action flush_pending` 会话末落盘，pi=`session_shutdown`），但都经 `evokit learn` 落到同一套确认语义。

## 废弃概念

v0.x 各助手的独立 `memory/`（corrections.jsonl / observations.jsonl / learned-rules.md / evolution-log.md / sessions.jsonl / violations.jsonl）与 `evokit-evolve` / `evokit-memory` record-* 在 v1.0 已废弃，改为上方的共享知识根 + 对话提取 + 确认背书。

## 贡献

要添加新的适配器：

1. 实现 `AgentAdapter` 接口
2. 在 `template/adapters/<name>/` 中创建模板
3. 在 `tests/<name>-adapter/` 中编写测试
4. 更新本文档
5. 提交 PR！

参与指南请参见 [CONTRIBUTING.md](../CONTRIBUTING.md)。
