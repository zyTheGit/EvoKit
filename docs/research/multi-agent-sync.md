# 研究笔记 — 多助手同步落地：4 adapter 的确认钩子 / 共享目录 / 信号桥接评估

> 关联车票：GitHub #32（wayfinder:research，被 #31 解锁后并行）。
> 性质：**前置研究**，非 ADR。产出是「多助手同步 v1.0（读无关 / 写各自确认）在 4 个 adapter
> 上各自落地在哪、共享目录如何归拢、信号差异如何桥接」的现状评估 + 建议，供后续 task 消费。
> 本文援引的**主数据源是适配器模板源码**（`template/<adapter>/`）与 `src/core/memory.ts`。

## 1. 模型约束（来自 CONTEXT.md / ADR 0002，非新决策）

- **v1.0 最小承诺：读助手无关 / 写经各自确认**。所有助手**共享同一份 `knowledge/` + 索引**（读无关）；
  写入/确认仍经各助手自己提取 → `.pending/` → 同一道人工确认（写时助手相关）。
- **不引入本地 merge 状态机 / 冲突合并**（v1.x 才做，见 map Out of scope）。
- 只有**唯一写入闸门 = 人工背书**；多助手只是消费方扩展，不是第二条写入通道。

## 2. 主证据：4 个 adapter 的现状（模板源码）

| adapter | 钩子/工具载体 | memory 路径（`src/core/memory.ts`） | 确认流程现状 |
|---------|--------------|-------------------------------------|--------------|
| **claude** | SessionStart / Stop **shell 钩子**（`hooks/session-start.sh`、`hooks/stop.sh`）+ **命令**（`commands/evokit-learn.md` 等） | `~/.claude/memory` | Stop 钩子提示 `/evokit-learn`；有完整 learn/boot/review 命令 |
| **codex** | hooks.json → SessionStart / Stop **shell 钩子脚本**（`hooks-scripts/*.sh`） | `~/.codex/memory` | Stop 钩子脚本提示；hooks 里只挂了完整性/会话记录，**无独立 learn 命令** |
| **opencode** | **自定义工具**（`tools/evokit-boot.ts`、`evokit-memory.ts`、`evokit-session.ts`；`opencode.json` 注册） | `~/.config/opencode/memory` | 无 Stop 钩子（AGENTS.md 明确「OpenCode 无自动 Stop」），靠**显式调用 `evokit-session --action end`**；无 learn 确认工具 |
| **pi** | **扩展**（`extensions/evokit-lifecycle.ts`、`evokit-boot.ts`、`evokit-memory.ts`、`evokit-session.ts`）+ **skills**；`session_start`/`session_shutdown`/`tool_call` 事件 | `~/.pi/agent/memory` | `session_shutdown` 事件记会话；无 learn 确认扩展 |

> 关键结论 A：**共享 memory 路径不存在**——4 个 adapter 分别用各自独立路径
> （`~/.claude` / `~/.codex` / `~/.config/opencode` / `~/.pi`）。这与 CONTEXT.md「所有助手共享同一份
> `knowledge/`」的 `knowledge/` 落在 evokit 子目录（各 memory 路径下的 `evokit/knowledge/`）直接冲突，
> 是 #32 必须解决的**首要分歧点**。

## 3. 关键发现：4 个 adapter 全部仍锁死在 v0.x 废弃管线

逐一核对了 `template/{claude,codex,opencode,pi}/AGENTS.md` 与扩展/工具源码，**没有任何一个** adapter
落到 v1.0 知识引擎（`.pending/` / `knowledge/` / `/evokit-learn`），全部仍是已废弃的「纠错晋升管线」：

| 残留 | claude | codex | opencode | pi |
|------|:------:|:-----:|:--------:|:--:|
| `corrections.jsonl` | ✓ | ✓ | ✓ | ✓ |
| `observations.jsonl` | ✓ | ✓ | ✓ | ✓ |
| `learned-rules.md` | ✓ | ✓ | ✓ | ✓ |
| `evolution-log.md` | ✓ | ✓ | ✓ | ✓ |
| `violations.jsonl` | ✓ | ✓ | ✓ | ✓ |
| `sessions.jsonl` | ✓ | ✓ | ✓ | ✓ |
| `/evokit-evolve` 或 `evokit-evolve` | ✓ | ✓ | ✓ | ✓ |
| `evokit-memory`（`record-correction`/`record-observation`） | — | — | ✓ | ✓ |
| `.pending` / `knowledge` / `evokit / **learn** | ✓* | ✗ | ✗ | ✗ |

> \* claude 是唯一有 `.pending/`+`knowledge/`（模板目录）+ `/evokit-learn` 命令的 adapter——但**其 AGENTS.md
> 仍同时含 v0.x 管线**（前端只有 claude 走新模型）。codex / opencode / pi 连 knowledge 目录都没有，仍是纯 v0.x。

这个发现把 #32 从「4 个 adapter 各自加一个确认钩子」放大为「**先把其余 3 个 adapter 的模板从废弃管线
平移到 v0.0 知识引擎 + 统一共享知识目录**」——否则「共享 knowledge/」无从谈起。

## 4. 三问的现状回答（#32 body）

### 4.1 各 adapter 的确认流程该挂在哪个钩子/入口

| adapter | 挂载点（现状/建议） |
|---------|---------------------|
| **claude** | 已有：`Stop` 钩子提示待确认 + `/evokit-learn` 命令（确认背书 / 显式声明双路径，本会话已实现） |
| **codex** | 建议：`Stop` 钩子脚本沿用 claude 模式（`hooks-scripts/stop.sh` 提示）+ 新增 `/evokit-learn` 等价入口（codex 用 AGENTS.md 指令 + hooks 触发，无 slash 命令则靠 AI 触发） |
| **opencode** | 无 Stop 钩子 → 确认无法靠会话末自动触发；需 `evokit-memory.yaml`（读 .pending）+ 靠 AGENTS.md 指令让 AI 在会话中主动调用确认 |
| **pi** | 建议：`session_shutdown` 事件检查 `.pending/` 非空则提示；新增 `evokit-learn` 扩展（读 .pending / confirmDraft / rejectDraft） |

> 统一收口：**确认必须落在「同一道人工背书」**——即 4 个 adapter 都读/写**同一份** `.pending/` + 调**同一推理】
> 的确认逻辑（content 无关，人工在同一处背书）。实现上建议把 learn 的确认逻辑做成**引擎层纯函数**
> （非 CLI），4 个 adapter 各用自己的入口壳去调它，而非各写一份确认逻辑。

### 4.2 共享 knowledge/ 目录：统一 vs 各 adapter 各自路径

- **现状**：`src/core/memory.ts` 的 `ADAPTER_MEMORY_PATHS` 为各 adapter 各自路径——**不共享**。
- **与模型冲突**：CONTEXT.md 多助手小节要求「所有助手共享同一份 `knowledge/` + 索引」。
- **矛盾根因**：`knowledge/` 在 `memory.ts` 下按 adapter 解析（`getMemoryDir(home, adapterId)` → `.../evokit/knowledge/`），
  adapterId 不同 → 目录不同 → 无共享。
- **建议**（供 task 决策，非本票拍板）：
  1. **方案 X（共享物理目录，推荐方向）**：选一个 canonical memory root（默认 `~/.claude/memory`，因 claude adapter 最新），
     其余 3 个 adapter 的 `getMemoryDir` 改为**映射到同一 root 下的 `evokit/`**；代码层把「知识目录」从
     adapter 私有 memory 解耦，`getMemoryDir` 只保留 adapter 各自的历史/非知识数据，`evokit/` 子目录统一收口。
  2. 方案 Y（软链/引用）：各 adapter 私有目录放符号链接/索引引用指向 canonical —— 复杂、易碎，不推荐。
- **注意**：这个决定把「个人级 shared root」定死，会影响 `getMemoryDir`/`ADAPTER_MEMORY_PATHS` 的改造面（当前
  `src/core/memory.ts` + 4 adapter 模板 + boot/review 命令的目录解析），需单独 task 落地。

### 4.3 识别/钩子信号差异如何桥接

| 能力 | claude | codex | opencode | pi |
|------|:------:|:-----:|:--------:|:--:|
| 会话末自动触发（Stop/end） | Stop 钩子 | Stop 钩子 | ❌ 无 Stop，靠显式 `evokit-session --action end` | `session_shutdown` 事件 |
| 会话中事件拦截 | ToolUse/PostToolUse 钩子 | hooks（弱） | tool 调用 | `tool_call` 事件 |
| 显式声明入口 | `/evokit-learn "内容"` | ❌ | ❌ | ❌ |

- 桥接建议：把「**会话末批量落 `.pending/` + 提示确认**」（#31 D4 的触发时机）做成**每个 adapter 各自的等价触发点**：
  - 有 Stop 的（claude/codex）→ Stop 处批量落盘 + 提示；
  - 无 Stop 的（opencode）→ 靠 AGENTS.md 强指令「AI 会话结束前显式调用 `evokit-session --action flush_pending`（新增动作）」；
  - 有 end 事件的（pi）→ `session_shutdown` 批量落盘 + 提示。
- 识别判定（#31 D3）本身是**助手无关的判据式逻辑** → 放引擎层，各 adapter 只负责在自己的事件点触发同一套判定。

## 5. 明确不引入

- 不做助手间同条目实时协商 / 冲突合并（v1.0 只「读无关/写各自确认」，无 merge 状态机）。
- 不做团队级共享（v1.0 搁置）。
- 不做各写各的「本地确认逻辑」（违背共享同一道人工背书闸门）。

## 6. 落地建议（供后续 task 消费）

1. **先做模板平移**：把 codex / opencode / pi 的 AGENTS.md 从 v0.x 废弃管线改到 v1.0 知识引擎
   （清 corrections/observations/learned-rules/evolution-log/violations，指引 `.pending/`+`knowledge/`+`/evokit-learn`）。
2. **共享知识目录**：定 canonical `evokit/` root，`getMemoryDir` 解耦出「知识目录」与「adapter 私有目录」。
3. **确认逻辑引擎化**：把 learn 确认做成纯函数，4 个 adapter 各用入口壳调用，保证「同一道人工背书」。
4. **触发器对齐**：每个 adapter 有等价「会话末批量落盘 + 提示」（claude/codex=Stop、opencode=flush 动作、pi=session_shutdown）。

## 7. 主数据源清单

- `src/core/memory.ts`：`ADAPTER_MEMORY_PATHS`（4 adapter memory 路径）。
- `template/{claude,codex,opencode,pi}/AGENTS.md`：各 adapter 记忆/学习协议（v0.x 残留实证）。
- `template/claude/commands/evokit-learn.md`、`template/claude/hooks/stop.sh`：claude 确认背书/Stop 提示（唯一走新模型）。
- `template/codex/hooks.json`：codex 钩子载体。
- `template/opencode/tools/*.ts`、`template/opencode/AGENTS.md`：opencode 工具载体（无 Stop 的显式 end 语义）。
- `template/pi/extensions/evokit-lifecycle.ts`、`template/pi/AGENTS.md`：pi 扩展事件载体。
- `CONTEXT.md` 多助手同步小节：读无关/写各自确认、共享 knowledge/、无 merge 状态机。
- 本会话范畴 B 实现：`src/core/repository.ts`（knowledge 引擎），`src/commands/learn.ts`（确认+显式声明）。
