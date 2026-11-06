# EvoKit 统一配置方案（agents + resources + cli + prompts 合流）

> 版本：v2.1 ｜ 日期：2026-10-25 ｜ 状态：需求定稿（待实现）
> 触发背景：`inventory` 调用 pi 时报 `401 api_key_expired`，暴露 `AGENT_CLIS` 硬编码在代码里、
> 无法按机器自定义的问题。用户需求演进：先「支持 agents 手动配置」→ 「agents.json 与 resources.json 合并」→ 「独立输出格式」→「系统内置提示词也可配置」。
> 最终目标：**一个配置文件统一管理 agent 同步目标 + 资源 + CLI 调用 + 提示词**，零代码增删改。

---

## 0. 需求来源与目标

### 0.1 痛点（现状）

当前有**三套割裂的配置**：

| 配置 | 位置 | 管什么 | 能否不改代码增删 |
| --- | --- | --- | --- |
| `agents.json` | `defaults.js` 的 `DEFAULT_AGENTS` 生成 | agent 同步目标（`id/name/global/project`） | ✅ 能 |
| `resources.json` | `defaults.js` 的 `DEFAULT_RESOURCES` 生成 | 资源（`id/type/source/targets/proxy`） | ✅ 能 |
| `AGENT_CLIS` | `agents-cli.js` 硬编码 | CLI 调用方式（`id/name/bin/build`） | ❌ 不能 |

导致的问题：
1. pi 换 key、改登录方式、加 Gemini/Qoder → 都得改 `agents-cli.js` + 重新发布。
2. 超时（120s）、CLI 路径（fnm vs PATH）、模型/供应商选择全部写死，无法按机器自定义。
3. 两个 JSON 文件 + 一份硬编码，割裂成三处，心智负担大；`AGENT_CLIS` 更是唯一一处「零代码增删」没覆盖到的。

### 0.2 用户决策（已确认，累计）

1. **CLI 调用配置合流**：不再硬编码，纳入配置文件。
2. **通用方案**：由 EvoKit 定一套通用 schema，覆盖三 agent 且可扩展。
3. **边界**：不管登录/凭证（api key 仍由各 agent 自己的 `login` 管）；但要支持**指定模型、供应商**等调用选项。
4. **agents + resources 也合并**：`agents.json` 与 `resources.json` 合成**一个配置文件**。
5. **输出格式可配置**：`cli` 字段加 `outputFormat`，支持结构化输出解析。
6. **系统内置提示词也可配置**：`inventory` 等命令的内置 prompt 模板纳入配置文件，用户可自定义。

### 0.3 合并后的配置文件形态

一个文件（`~/.evokit/settings.json`），用三个顶层 key 区分（`prompts` 可选）：

```json
{
  "agents": [
    { "id": "claude", "name": "Claude Code", "global": "~/.claude/CLAUDE.md", "project": "CLAUDE.md",
      "cli": { "bin": "claude", "args": ["-p", "{prompt}"], "timeout": 120, "outputFormat": "text" } },
    { "id": "codex", "name": "Codex", "global": "~/.codex/AGENTS.md", "project": "AGENTS.md",
      "cli": { "bin": "codex", "args": ["exec", "{prompt}"], "timeout": 120, "outputFormat": "text" } },
    { "id": "pi", "name": "Pi", "global": "~/.pi/agent/APPEND_SYSTEM.md", "project": "APPEND_SYSTEM.md",
      "cli": { "bin": "pi", "args": ["--print", "{prompt}"], "timeout": 120, "outputFormat": "text" } }
  ],
  "resources": [
    { "id": "context", "type": "text", "source": "~/.evokit/context.md",
      "targets": ["~/.claude/CLAUDE.md", "~/.pi/agent/APPEND_SYSTEM.md", "~/.codex/AGENTS.md"] }
  ],
  "prompts": {
    "inventory": "你是 {agent}，正在做冗余体检……\n{inventory}\n请输出 5 区块报告……"
  }
}
```

**文件名**：`~/.evokit/settings.json`（已定）。

---

## 1. 方案设计

### 1.1 核心：统一配置文件的 `agents[]` 每个条目新增 `cli` 字段

把「同步目标」和「CLI 调用」两套配置合流到同一个 agent 条目：

```json
{
  "id": "pi",
  "name": "Pi",
  "global": "~/.pi/agent/APPEND_SYSTEM.md",
  "project": "APPEND_SYSTEM.md",
  "cli": {
    "bin": "pi",
    "binPath": "~/AppData/Roaming/fnm/node-versions/v24.18.0/installation/pi.cmd",
    "args": ["--print", "{prompt}"],
    "timeout": 120
  }
}
```

`cli` 字段**可选**：不写就代表「该 agent 不参与 inventory 的 CLI 调用」（比如某个 agent 只做同步、不做体检）。这与现有的「按 id 覆盖」分层机制天然兼容——项目级可以覆盖全局某个 agent 的 `cli`。

### 1.2 字段定义

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `bin` | string | 是 | 命令名（如 `claude`/`pi`/`codex`），用于探测与 fallback |
| `binPath` | string | 否 | CLI 的绝对/`~` 路径，覆盖 `bin`（解决 fnm 安装目录不在 PATH 的问题） |
| `args` | string[] | 是 | 完整参数序列，prompt 用占位符 `{prompt}` 表示 |
| `model` | string | 否 | 指定模型（映射为各家 `--model`，见 §1.3） |
| `provider` | string | 否 | 指定供应商（映射为各家参数，见 §1.3） |
| `timeout` | number | 否 | 单次调用超时秒数，默认 120 |
| `outputFormat` | string | 否 | 输出格式：`text`（默认，原样回显 stdout）\| `json`（结构化解析，见 §1.5） |

### 1.3 模型 / 供应商的映射（关键设计）

用户要求「支持指定模型、供应商」，但三家的参数名和语义不同。EvoKit 用**统一字段 `model`/`provider`，内部映射到各家的参数**，用户不必记各家的差异：

| agent | `model` 字段映射 | `provider` 字段映射 |
| --- | --- | --- |
| claude | `--model <model>` | claude 无 CLI 直选供应商，忽略并告警（供应商走登录态/环境） |
| codex | `--model <model>` | `--model-provider <provider>` |
| pi | `--model <model>` | pi 无独立 `--model-provider`，忽略并告警（供应商走 `~/.pi/agent` 配置） |

映射规则：
- 写 `model` 就自动拼 `--model <值>`（各家 flag 相同，只是 prompt 位置不同，已由 `args` 占位符兜底）。
- 写 `provider` 时：codex 拼 `--model-provider`；claude/pi 不支持 CLI 直选，**忽略并打一行告警**（不报错、不阻塞），提示用户「该 agent 的供应商由登录态/配置决定」。
- `model`/`provider` 通过**独立字段**声明，而非写死在 `args` 里——这样 EvoKit 能识别、能告警、未来能加「校验模型名是否合法」等能力。

### 1.4 `args` 占位符规则（通用、可扩展）

- `args` 是**完整参数数组**（不含 `bin` 本身），`{prompt}` 是唯一占位符，运行前替换为实际 prompt 文本。
- 因为三家的 prompt 位置都不同（claude `-p <p>`、codex `exec <p>`、pi `--print <p>`），**占位符模板是唯一能统一覆盖的通用方案**（固定「末尾追加」不适用于 codex）。
- 若 `args` 里没有 `{prompt}`，则 EvoKit 把 prompt 追加到 `args` 末尾（兜底约定）。

### 1.5 输出格式（`outputFormat` 字段）

用户要求「独立输出格式」：允许每个 agent 用结构化格式输出，EvoKit 解析出**统一的 `{ text, cost, tokens }` 结构**，供后续汇总/提取/对比。三家的结构化格式完全不同，需各自解析：

| `outputFormat` | agent | 底层参数（由 EvoKit 自动拼，用户不用写进 `args`） | 输出形态 | 解析方式 |
| --- | --- | --- | --- | --- |
| `text`（默认） | 全部 | 无（保持现有 `-p`/`exec`/`--print`） | 纯文本 stdout | 原样回显，不解析 |
| `json` | claude | `--output-format json` | 单个 JSON 对象 | 读 `.result`（正文）、`.total_cost_usd`、`.usage` |
| `json` | codex | `--json`（exec 模式） | JSONL 事件流 | 取最后一条 assistant 消息文本 |
| `json` | pi | `--mode json` | JSONL 事件流 | 组装 `message_end.message.content[].text` |

**统一解析结果**（`runAgentCli` 返回时，`json` 格式额外带结构化字段）：

```
{ ok, output, error,          # 原有
  meta?: {                     # 仅 outputFormat='json' 时存在
    text: string,              # 报告正文（统一提取）
    costUsd?: number,          # claude 有，codex/pi 视情况
    tokens?: { input, output } # claude 有 usage，codex/pi 视事件流
  } }
```

**关键设计取舍**：
1. **`outputFormat` 只决定「EvoKit 怎么解析」**，不直接拼参数——具体参数（`--output-format json`/`--json`/`--mode json`）由 EvoKit 按 agent 自动映射，用户只写 `"outputFormat": "json"` 即可，不必记三家差异（与 `model`/`provider` 同一理念）。
2. **`text` 是默认值**，保持现有 `inventory` 回显行为不变；`json` 是可选增强，当前第一档「只回显」用 `text` 就够，第二/三档要「汇总/提取」时切 `json`。
3. **codex/pi 的 JSONL 解析较复杂**（事件流、delta 组装），且 codex `--json` 的精确字段名需实测确认；故**首版只实现 claude 的 `json` 解析**（单 JSON 最简单可靠），codex/pi 的 `json` 标注「待实测后实现」，先落 `text`。

> 边界：`outputFormat` 管的是「机器如何消费 agent 返回」，不影响 agent 的行为（仍然是只读分析、不改文件）。

### 1.6 默认值（内置三 agent，等价于现在硬编码的行为）

首次生成统一配置文件时，`DEFAULT_CONFIG.agents` 内置带 `cli` 的三条目，行为与现状完全一致：

```json
[
  { "id": "claude", "name": "Claude Code", "global": "~/.claude/CLAUDE.md", "project": "CLAUDE.md",
    "cli": { "bin": "claude", "args": ["-p", "{prompt}"], "timeout": 120 } },
  { "id": "codex", "name": "Codex", "global": "~/.codex/AGENTS.md", "project": "AGENTS.md",
    "cli": { "bin": "codex", "args": ["exec", "{prompt}"], "timeout": 120 } },
  { "id": "pi", "name": "Pi", "global": "~/.pi/agent/APPEND_SYSTEM.md", "project": "APPEND_SYSTEM.md",
    "cli": { "bin": "pi", "args": ["--print", "{prompt}"], "timeout": 120 } }
]
```

### 1.7 兼容性（`cli` 字段可选）

- **向后兼容**：旧 `agents.json`（无 `cli` 字段）仍能正常同步；只有 `inventory` 需要 CLI 调用时，才要求该 agent 有 `cli` 字段。无 `cli` 的 agent 在 `inventory` 里提示「未配置 CLI 调用，跳过」。
- **`AGENT_CLIS` 的处置**：`agents-cli.js` 里的硬编码 `AGENT_CLIS` 改为「内置默认值」，`detectAgentClis()` 改为**从 `loadConfig()` 读 `agents[].cli` 字段**，`AGENT_CLIS` 仅作无配置时的兜底。
- **`findInFnm` 保留**：作为 `binPath` 未显式指定时的自动探测兜底（用户不写 `binPath`，仍能自动找到 fnm 下的 codex/pi）。

### 1.8 系统内置提示词可配置（`prompts` 顶层字段）

`inventory` 里的「通用整理 prompt」（现在是 `buildPrompt` 硬编码）也纳入配置。**语义是「内置默认 + 覆盖」，不是「整体替换」**：

- 系统内置一套**完整的默认 prompt 集**（`DEFAULT_PROMPTS`，现含 `inventory`，未来加 `trim`/`drift`）。
- 用户/项目配置只**覆盖**其中某几项，**没覆盖的 key 仍用默认**。
- 这与 `agents`/`resources` 的 `mergeById` 同构，只是 `prompts` 是对象（按 key 覆盖）而非数组（按 id 覆盖）。

**配置形态**（`settings.json` 顶层可选 `prompts` 对象，只写想覆盖的项）：

```json
"prompts": {
  "inventory": "你是 {agent}，正在做知识库冗余体检。\n清单：\n{inventory}\n请找重复/冲突/断链，输出 5 区块报告。"
}
```

**占位符规则**（与 `cli.args` 的 `{prompt}` 同一套机制）：

| 占位符 | 含义 | 来源 |
| --- | --- | --- |
| `{agent}` | agent 名（如「Claude Code」） | 调用时按当前 agent 填 |
| `{inventory}` | 扫描出的知识库清单文本 | `serializeInventory()` 结果 |

**合并语义（三层叠加）**：

```
最终 prompt = DEFAULT_PROMPTS  ← 全局 settings.json 的 prompts 覆盖  ← 项目级 settings.json 的 prompts 覆盖
```

- 每层都是**浅合并**：同名 key 覆盖，上层没写的 key 保留下层。
- 例：默认有 `inventory`，全局只覆盖 `inventory`，项目级只覆盖 `inventory` → 最终用项目级的 `inventory`；若未来默认加了 `trim` 而用户没写，`trim` 仍用默认。

**关键设计**：
1. **内置默认 prompt 降级为「默认值」**：`buildPrompt` 改为「读最终合并后的 `prompts.inventory`，存在则用模板 + 替换占位符；不存在则用代码内置默认」。用户不写 `prompts` 时，行为与现状完全一致。
2. **占位符统一**：`cli.args` 的 `{prompt}` 和 `prompts` 模板的 `{agent}`/`{inventory}` 共用同一个「占位符替换函数」，一套机制多处用。
3. **可扩展**：未来第二档「裁剪 prompt」、第三档「漂移说明」等新 prompt，都进 `prompts` 对象（如 `prompts.trim`、`prompts.drift`），默认内置、用户可覆盖，无需改代码。

> 边界：`prompts` 只替换「模板文本」，不改「扫描逻辑」「调用逻辑」。用户自定义 prompt 若占位符缺失，EvoKit 按「保留未替换占位符原文」处理（与 `expandPath` 未定义环境变量的策略一致），便于排错。

---

## 2. 文件合并（agents.json + resources.json → 统一配置）

### 2.1 合并目标

把 `agents.json` 和 `resources.json` 两个文件合成**一个配置文件**，用顶层 key 区分（`prompts` 为本次新增的第三块）：

| 旧文件 | 合并后 |
| --- | --- |
| `~/.evokit/agents.json`（数组） | `settings.json` 的 `agents` 字段（数组） |
| `~/.evokit/resources.json`（数组） | `settings.json` 的 `resources` 字段（数组） |
| （硬编码 `buildPrompt`） | `settings.json` 的 `prompts` 字段（对象，可选） |

### 2.2 影响面（所有需要改动的点）

| 文件 | 现状 | 合并后改动 |
| --- | --- | --- |
| `paths.js` | `AGENTS_FILE` / `RESOURCES_FILE` 两个常量 | 改为 `CONFIG_FILE`（一个） |
| `defaults.js` | `DEFAULT_AGENTS` / `DEFAULT_RESOURCES` 分开 | 改为 `DEFAULT_CONFIG = { agents, resources, prompts }` |
| `config.js` | `loadAgents()` / `loadResources()` 各读一个文件 | 改为 `loadConfig()` 读一个文件，返回 `{ agents, resources, prompts }`；项目级覆盖也读同一个 `<project>/.evokit/settings.json`，分别按 id/key 合并 |
| `init.js` | `initGlobal` 调 `loadAgents`+`loadResources`；`initProject` 写两个文件 | 改为生成/写一个 `settings.json` |
| `list.js` | `listAgents`/`listResources` 各读一个文件 | 读 `loadConfig()`，分别列 `agents`/`resources`，提示文案改文件名 |
| `commands/inventory.js` | `buildPrompt` 硬编码模板 | 改为读 `config.prompts.inventory` + 替换占位符，内置默认兜底 |
| `commands/*` | 各自 `loadAgents`/`loadResources` | 改为 `loadConfig()` 后取 `.agents`/`.resources` |
| `help.js` / README / evokit.mjs 注释 | 提及 `agents.json`/`resources.json` | 改为统一配置文件名 |

### 2.3 分层覆盖（项目级）语义

- 旧：`<project>/.evokit/agents.json` + `resources.json` 分别覆盖全局。
- 新：`<project>/.evokit/settings.json` 一个文件，`agents`/`resources` 各自按 id 覆盖全局同名条目；`prompts` 按 prompt 名（key）覆盖全局同名模板。`mergeById` 逻辑不变（`prompts` 是对象，用对象浅合并覆盖同名 key）。

**统一的「默认 + 覆盖」语义**（三块一致）：

| 块 | 默认值 | 全局覆盖 | 项目级覆盖 |
| --- | --- | --- | --- |
| `agents` | `DEFAULT_AGENTS` | 按 id 覆盖 | 再按 id 覆盖 |
| `resources` | `DEFAULT_RESOURCES` | 按 id 覆盖 | 再按 id 覆盖 |
| `prompts` | `DEFAULT_PROMPTS` | 按 key 覆盖 | 再按 key 覆盖 |

> 说明：**不做旧文件自动迁移**（用户已明确）。旧 `agents.json`/`resources.json` 直接作废，新版只读 `settings.json`，首次 `init` 时生成。

---

## 3. 实现要点（供后续动手参考）

1. `defaults.js`：`DEFAULT_AGENTS`（含 `cli`）+ `DEFAULT_RESOURCES` + `DEFAULT_PROMPTS` 合并为 `DEFAULT_CONFIG = { agents, resources, prompts }`。
2. `paths.js`：`AGENTS_FILE`/`RESOURCES_FILE` → `CONFIG_FILE`。
3. `config.js`：
   - 新增 `loadConfig(projectDir)`：读 `CONFIG_FILE`，返回 `{ agents, resources, prompts }`；项目级读 `<project>/.evokit/settings.json`，`agents`/`resources` 分别 `mergeById`，`prompts` 用对象浅合并覆盖同名 key。
   - 保留 `loadAgents`/`loadResources` 作为薄封装（`loadConfig().agents` / `.resources`），减少各命令的改动量。
4. `agents-cli.js`：
   - `detectAgentClis()` 改为「读 `loadConfig().agents` 的 `cli` 字段」构建可用列表，`AGENT_CLIS` 仅兜底。
   - `runAgentCli()` 增加：解析 `{prompt}` 占位符、拼 `--model`/`--model-provider`、读 `timeout`、`binPath` 优先于 `bin`。
   - `runAgentCli()` 按 `outputFormat` 分支：`text` 原样回显；`json` 自动拼参数（claude `--output-format json` / codex `--json` / pi `--mode json`）并解析出 `meta`。
5. `commands/inventory.js`：`buildPrompt` 改为「读 `config.prompts.inventory` 模板 + 替换 `{agent}`/`{inventory}` 占位符」，无配置则用内置默认模板。
6. `init.js`：`initGlobal`/`initProject` 改为写一个 `settings.json`。
7. `list.js`、`help.js`、README、evokit.mjs 注释：改统一配置文件名。
8. 测试：新增「统一配置读写」「自定义 `cli`（binPath/args/model/provider/outputFormat）」「自定义 `prompts.inventory` 模板 + 占位符替换」「无 `cli` 的 agent 在 inventory 跳过」「占位符替换」「model/provider 映射」「claude json 解析」等用例。

---

## 4. 已明确 / 待确认

### 4.1 已明确（无需再议）

- **不迁移旧文件**：旧 `agents.json`/`resources.json` 作废，只读 `settings.json`。
- **`provider` 在 claude/pi 上**：忽略 + 打一行告警（不阻塞）。
- **输出格式**：`cli` 字段新增 `outputFormat`（`text` 默认 / `json`），`json` 时 EvoKit 自动拼各家参数并解析出统一 `meta`。**首版只实现 claude 的 `json` 解析**（单 JSON 最可靠），codex/pi 的 `json` 标注待实测后实现。
- **提示词可配置（默认 + 覆盖）**：系统内置完整 `DEFAULT_PROMPTS`（默认常驻），`settings.json` 顶层可选 `prompts` 对象只**覆盖**想改的 key，未覆盖的仍用默认。三层叠加：`DEFAULT_PROMPTS` ← 全局 `prompts` 覆盖 ← 项目级 `prompts` 覆盖，均为浅合并。`buildPrompt` 读合并结果 + 替换 `{agent}`/`{inventory}` 占位符。

### 4.2 待确认

- [ ] codex `--json` 的精确输出字段名需实测确认（首版先落 `text`，是否接受？）
- [ ] pi `--mode json` 的事件流解析（delta 组装）较复杂，首版是否也先跳过？
