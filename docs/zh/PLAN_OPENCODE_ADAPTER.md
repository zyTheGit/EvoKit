# OpenCode CLI 适配器 — 开发计划

> **分支:** `feat/opencode-adapter`
> **目标版本:** EvoKit v0.4.0
> **状态:** ✅ 已完成（v0.5.0 发布）

## 架构概述

与 Claude Code（通过 `settings.json` 使用 hooks）和 Codex CLI（通过 `hooks.json` 使用 hooks）不同，**OpenCode 没有生命周期钩子系统**。该适配器使用其自定义工具系统来替代。

### EvoKit 功能映射

| EvoKit 特性   | OpenCode 机制                       | 详情                                          |
| ------------- | ----------------------------------- | --------------------------------------------- |
| L1 认知核心   | `AGENTS.md`                         | 项目根目录下的主规则文件                      |
| 进化命令      | **自定义工具** (`.opencode/tools/`) | 使用 `@opencode-ai/plugin` 的 TypeScript 工具 |
| 启动验证      | 自定义工具 `evokit-boot.ts`         | 替代 SessionStart 钩子                        |
| 会话记录      | 自定义工具 `evokit-session.ts`      | 替代 Stop 钩子                                |
| 规则/记忆注入 | 自定义工具 `evokit-memory.ts`       | 替代 PreToolUse 钩子                          |
| 子代理        | `.opencode/agents/` Markdown 文件   | 架构师、审查者                                |
| 学习数据      | `.opencode/memory/`                 | **每个适配器独立**，不共享                    |
| 配置          | `opencode.json`                     | 使用 `instructions` 字段引入额外规则文件      |

### ⚠️ 关键不对称性：没有钩子

OpenCode 没有 SessionStart/Stop/PreToolUse 钩子。这意味着：

- **会话记录不是自动的** — 必须指示 AI（在 `AGENTS.md` 中）在结束前调用 `evokit-session.ts`
- **启动验证不是自动的** — 必须指示 AI 在会话开始时调用 `evokit-boot.ts`
- **可靠性策略**：`AGENTS.md` 将包含显式提醒；工具本身是幂等的，多次调用安全

---

## 内存架构决策

### 原则：每个适配器的 memory 放在自己的目录下

```
~/.claude/memory/              ← Claude Code 的 memory
.opencode/memory/              ← OpenCode 的 memory（项目根目录 .opencode/ 下）
~/.codex/memory/               ← Codex CLI 的 memory
```

### 修改范围

需要修改已有的 **Claude Code** 和 **Codex CLI** 适配器：

#### Claude Code（当前状态）

当前 memory 在 `~/.claude/memory/` —— 本来就属于 Claude Code，**无需改动**，这是它的"自留地"。

#### Codex CLI

当前 `template/codex/AGENTS.md` 和 `codex-adapter.ts` 中指向 `~/.claude/memory/` 作为共享 memory。需要改为 `~/.codex/memory/`。

- 修改 `template/codex/AGENTS.md` 中的 `__HOME__/.claude/memory/` → `__HOME__/.codex/memory/`
- 修改 `src/adapters/codex-adapter.ts` 中的 `SHARED_MEMORY_DIR`
- 修改 `src/adapters/codex-installer.ts` 中的 memory 目录创建

#### OpenCode（新建）

memory 放在 `.opencode/memory/`（项目级），全局回退到 `~/.config/opencode/memory/`。

- `template/opencode/AGENTS.md` 引用 `.opencode/memory/`
- Custom tool 读写 `.opencode/memory/`

### 为什么这样设计

| 维度                  | 共享式（旧方案）                 | 分目录式（新方案）                    |
| --------------------- | -------------------------------- | ------------------------------------- |
| **心智模型**          | "我的数据放在别人家"             | "各管各的"                            |
| **卸载清理**          | 卸载 OpenCode 不敢删 `.claude/`  | 删 `.opencode/` 就行                  |
| **依赖关系**          | OpenCode 依赖 `.claude/` 存在    | **无外部依赖**                        |
| **权限隔离**          | 需要处理文件权限 600             | 天然隔离                              |
| **异步写入冲突**      | 两个 agent 可能同时写同一文件    | 完全独立                              |
| **跨 agent 融合价值** | 目前 EvoKit 无融合逻辑，收益为 0 | 不损失，未来可通过 `evokit sync` 实现 |

---

## 计划结构

### 阶段 0：背景研究 ✅（已完成）

- [x] 阅读 OpenCode 中文文档（代理、规则、工具、MCP）
- [x] 研究 EvoKit 适配器接口（`MULTI_AGENT.md`）
- [x] 分析现有适配器（Claude Code, Codex CLI）
- [x] 识别缺失的钩子 → 自定义工具替代策略
- [x] 每个适配器独立 memory 的架构决策

### 阶段 1：修复现有适配器 — 内存隔离

**目标**：将 Codex CLI 的 memory 从 `~/.claude/memory/` 移至 `~/.codex/memory/`。

**需要修改的文件：**

| 文件                              | 变更内容                                                            |
| --------------------------------- | ------------------------------------------------------------------- |
| `src/adapters/codex-adapter.ts`   | `SHARED_MEMORY_DIR` → `.codex/memory`                               |
| `src/adapters/codex-installer.ts` | 添加 `memory` 到 `CODEX_SUBDIRS`，移除共享 `~/.claude/memory/` 创建 |
| `template/codex/AGENTS.md`        | `__HOME__/.claude/memory/` → `__HOME__/.codex/memory/`              |

### 阶段 2：OpenCode 模板与安装器（3 个文件）

**目标**：创建可安装的 OpenCode 模板和安装器模块。

#### 2.1 创建 `template/opencode/` 目录结构

```
template/opencode/
├── AGENTS.md                  # L1 认知核心
├── opencode.json               # 配置参考
├── tools/
│   ├── evokit-boot.ts          # 启动验证工具
│   ├── evokit-evolve.ts        # 进化审计工具
│   ├── evokit-memory.ts        # 内存管理工具
│   └── evokit-session.ts       # 会话记录工具
├── agents/
│   ├── architect.md            # 架构师子代理
│   └── reviewer.md             # 审查者子代理
└── memory/
    └── README.md               # 说明 .opencode/memory/ 的用途
```

**需要创建的文件：**

1. `template/opencode/AGENTS.md` — 为 OpenCode 适配的认知核心
2. `template/opencode/opencode.json` — `$schema` + `instructions` + 代理配置
3. `template/opencode/memory/README.md` — 解释每个适配器独立 memory 的设计

#### 2.2 创建 `src/adapters/opencode-installer.ts`

**导出的函数：**

- `resolveOpenCodeHome(homeDir)` — 返回 `~/.config/opencode/`（遵循 `XDG_CONFIG_HOME`）
- `resolveOpenCodeProjectDir(projectDir)` — 从项目根目录返回 `.opencode/`
- `installOpenCodeTemplate(config)` — 复制模板，替换 `__HOME__` 占位符
- `verifyOpenCodeInstallation()` — 完整性检查

**模板安装逻辑：**

1. 复制 `template/opencode/AGENTS.md` → 项目根目录 `AGENTS.md`（存在则跳过，`--force` 强制覆盖）
2. 复制 `template/opencode/opencode.json` → 项目根目录 `opencode.json`（存在则跳过）
3. 复制 `.opencode/tools/*.ts` → 项目 `.opencode/tools/`
4. 复制 `.opencode/agents/*.md` → 项目 `.opencode/agents/`
5. 复制 `.opencode/memory/*` → 项目 `.opencode/memory/`
6. 替换所有已安装文件中的 `__HOME__` 占位符
7. 设置权限

### 阶段 3：完整适配器实现（2 个文件）

**目标**：用 TypeScript 实现 `AgentAdapter` 接口。

#### 3.1 重写 `src/adapters/opencode-adapter.ts`

**实现内容：**

- `name` → `'opencode'`
- `install(config)` → 委托给 `installOpenCodeTemplate()`
- `setupHooks(events)` → **空操作**（OpenCode 没有钩子；如果传入了 events 则记录警告）
- `injectMemory(data)` → 写入 `.opencode/memory/`（通过自定义工具的 `context.directory`）
- `exportMemory()` → 从 `.opencode/memory/` 读取
- `runCommand(name, args)` → 注入使用对应自定义工具的指引

**需要添加到 `src/core/types.ts` 的新类型：**

```typescript
export interface OpenCodeAdapterOptions {
  opencodeConfigDir?: string; // 默认：~/.config/opencode/
  opencodeProjectDir?: string; // 默认：.opencode/
  dryRun?: boolean;
}
```

#### 3.2 创建 `src/adapters/opencode-hooks.ts`

由于 OpenCode 没有钩子，该文件包含**工具源代码生成器**：

- `generateBootToolSource()` → 返回 `evokit-boot.ts` 的 TypeScript 源码
- `generateEvolveToolSource()` → 返回 `evokit-evolve.ts` 的 TypeScript 源码
- `generateMemoryToolSource()` → 返回 `evokit-memory.ts` 的 TypeScript 源码
- `generateSessionToolSource()` → 返回 `evokit-session.ts` 的 TypeScript 源码

当 EvoKit 在其自身进化后更新工具时，可以编程方式使用这些生成器。

### 阶段 4：自定义工具实现（4 个文件）

**目标**：为 `.opencode/tools/` 创建 TypeScript 自定义工具。

#### 4.1 `evokit-boot.ts` — 启动验证

```typescript
import { tool } from '@opencode-ai/plugin';

export default tool({
  description: '运行 EvoKit 启动验证 — 检查系统完整性和已学习的规则',
  args: {},
  async execute(args, context) {
    // 1. 从 .opencode/memory/ 读取 learned-rules.md
    // 2. 运行每个验证命令
    // 3. 读取 violations.jsonl
    // 4. 检查 AGENTS.md、opencode.json、.opencode/ 结构
    // 5. 返回结构化的完整性报告
  },
});
```

#### 4.2 `evokit-evolve.ts` — 进化审计

参数：`dryRun`（布尔值，可选）

逻辑：

1. 读取 `corrections.jsonl`，按 pattern 分组
2. 将出现次数 >= 2 的模式提升到 `learned-rules.md`
3. 将决策记录到 `evolution-log.md`
4. 处理置信度衰减、轮转、归档

#### 4.3 `evokit-memory.ts` — 内存管理

参数：`action`（"inject" | "export" | "record-correction"），`pattern`?，`context`?

逻辑：

- `inject`：加载 AGENTS.md + learned-rules.md 上下文
- `export`：读取所有 JSONL 文件
- `record-correction`：追加到 corrections.jsonl

#### 4.4 `evokit-session.ts` — 会话记录

参数：`action`（"start" | "end"），`duration`?

逻辑：

- 将会话条目写入 sessions.jsonl，带有 `assistant: "opencode"` 标签

### 阶段 5：代理定义（2 个文件）

#### 5.1 `.opencode/agents/architect.md`

```markdown
---
description: 为复杂的多步骤任务设计方案
mode: subagent
temperature: 0.1
tools:
  write: false
  edit: false
  bash: false
---

你是 EvoKit 架构师...
```

#### 5.2 `.opencode/agents/reviewer.md`

```markdown
---
description: 审查代码质量、错误和安全性
mode: subagent
temperature: 0.1
tools:
  write: false
  edit: false
  bash: false
---

你是 EvoKit 审查者...
```

### 阶段 6：集成与注册（3 个文件）

#### 6.1 更新 `src/adapters/index.ts`

导出 OpenCode 适配器函数。

#### 6.2 CLI 连接

支持 `evokit init --adapter opencode`、`evokit doctor --adapter opencode`。

#### 6.3 测试

创建 `tests/opencode-adapter/`：

- `installer.test.ts` — 模板安装、占位符替换
- `adapter.test.ts` — 适配器接口合规性
- `tools.test.ts` — 自定义工具代码生成

### 阶段 7：文档（2 个文件）

#### 7.1 更新 `MULTI_AGENT.md`

添加 OpenCode 行，包含准确信息：

| 方面     | 实现方式                              |
| -------- | ------------------------------------- |
| 安装     | 模板复制到项目根目录 `.opencode/`     |
| 钩子     | 无 — 由自定义工具替代                 |
| 内存     | `.opencode/memory/`（每个适配器独立） |
| 命令     | `.opencode/tools/` 中的自定义工具     |
| 认知核心 | 项目根目录 `AGENTS.md`                |
| 配置     | 项目根目录 `opencode.json`            |
| 子代理   | `.opencode/agents/` Markdown 文件     |

同时更新 Claude Code 和 Codex 行以指示每个适配器独立 memory。

#### 7.2 更新 `src/adapters/adapter-spec.md`

将 OpenCode 标记为 "🔜 开发中 v0.4.0"。

## 实施顺序

```
阶段 1 ──► 阶段 2 ──► 阶段 3 ──► 阶段 4 ──► 阶段 5 ──► 阶段 6 ──► 阶段 7
  │            │            │            │            │            │
  ├─ codex     ├─ AGENTS   ├─ adapter   ├─ boot.ts   ├─ architect ├─ index.ts
  │  memory    │  .md       │  .ts        │            │  .md       │
  │  isolation │            │            ├─ evolve   ├─ reviewer ├─ CLI
  ├─ codex     ├─ installer├─ hooks      │  .ts        │  .md       │  wiring
  │  installer │  .ts       │  .ts        │            │            │
  │            │            │            ├─ memory   │            ├─ tests
  └─ codex     └─ opencode └─ types      │  .ts        │            │
     AGENTS      .json       更新         │            │            └─ MULTI_
     .md                                  ├─ session  │              AGENT.md
  (Codex 修复)                            │  .ts        │
                                          └───────────┘
```

## 关键设计决策

1. **自定义工具替代钩子** — OpenCode 缺少钩子系统，因此 EvoKit 命令变为 `@opencode-ai/plugin` 自定义工具
2. **AGENTS.md 作为主规则文件** — 使用 OpenCode 的原生格式
3. **每个适配器独立 memory** — `.opencode/memory/` 替代共享的 `~/.claude/memory/`。Claude Code 保留 `~/.claude/memory/`，Codex CLI 获得 `~/.codex/memory/`
4. **opencode.json 的 `instructions` 字段** — 用于通过 glob 模式引入额外规则文件
5. **最小化 AGENTS.md** — 不超过 150 行，与 CLAUDE.md 的限制相同
6. **缺失钩子的可靠性策略** — AGENTS.md 指示 AI 调用启动/会话工具；工具是幂等的
