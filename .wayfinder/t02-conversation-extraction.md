# 对话提取的 AI 识别 prompt

> **wayfinder:grilling** · 阻塞：T01 · 状态：decided

## Question

/evokit-learn 的核心是 AI 在对话中识别"项目知识"并静默标记。识别 prompt 怎么写？如何区分"项目知识"和"任务指令"？

## 决策结论

### 1. 识别 prompt 载体

混合方案：CLAUDE.md 放简短指令 + `/evokit-learn` skill 放详细识别规则和确认流程。

**CLAUDE.md 层**（2-3 行，始终加载）：

```
当你在对话中识别到项目/个人专属知识（约定、偏好、架构决策、工作流规则），
静默写入 .claude/memory/evokit/.pending/{type}-{slug}.md，不要在回复中提及。
```

**Skill 层**（按需加载）：`/evokit-learn` 触发时加载完整识别规则、确认流程、信号清单。

**决策理由**：对话提取是核心机制，需要自动识别（不能依赖用户手动触发）；CLAUDE.md 极短不增加上下文负担；skill 详细规则按需加载。

### 2. 静默标记实现

写入 `.pending/` 临时文件，frontmatter 加 `status: pending`。

```
evokit/
  .pending/
    convention-result-throw.md    # status: pending
    preference-uv-over-pip.md
  knowledge-index.md
  knowledge/
```

AI 识别知识 → Write `.pending/{type}-{slug}.md` → 回复中不提及（CLAUDE.md 指令约束）。

**决策理由**：持久化是刚需（对话压缩/中断会丢失上下文标记）；Claude Code Stop 钩子只能检查文件系统，不写文件则无法触发确认流程；"打断"通过 CLAUDE.md 指令"不要在回复中提及"缓解。

### 3. 用户确认交互

Skill 输出待确认列表 → 用户在对话中回复（自然语言）→ AI 解析并执行。

流程：

1. 用户：`/evokit-learn`
2. Skill：展示 `.pending/` 中的条目列表
3. 用户："确认 1 和 3，拒绝 2" 或 "全部确认" 或 "2 的 type 改成 architecture"
4. AI：执行操作，输出结果

**决策理由**：Claude Code skill 的天然交互方式就是对话；实现最简；自然语言交互灵活性高（可修改 type、内容等）；CLI 交互式菜单在 skill 机制中不可行。

### 4. 触发方式

三种都支持：

- `/evokit-learn` — 回顾对话 + 确认 `.pending/` 待处理条目
- `/evokit-learn "使用 Result<T> 不用 throw"` — 显式声明，直接写入 knowledge/（跳过 .pending）
- Stop 钩子 — 检查 `.pending/` 非空 → 输出提示"有 N 条待确认知识，运行 /evokit-learn 确认"（不自动确认）

**决策理由**：ADR 确认"对话提取为主，显式声明为兜底"，两者必须都支持；Stop 钩子只提示不确认，避免会话结束时强制交互。

### 5. 识别信号

两层定义：

**CLAUDE.md 层**：简短指令，只说"做什么"。

**Skill 层**：详细信号清单。

| 信号类别   | 示例模式                                        | 对应 type             |
| ---------- | ----------------------------------------------- | --------------------- |
| 项目约定   | "我们项目总是…"/"在这个项目里…"/"我们的规范是…" | convention            |
| 个人偏好   | "我讨厌…"/"我更喜欢…"/"我习惯用…"               | preference            |
| 架构决策   | "X 是 Y 的上游"/"这个模块负责…"/"依赖方向是…"   | architecture          |
| 工作流规则 | "提交时…"/"发布前…"/"PR 需要…"                  | workflow              |
| 纠正反馈   | "不对，应该是…"/"别用…用…"/"我纠正一下…"        | 根据 content 判断     |
| 隐性知识   | AI 多次犯同一错误后用户纠正                     | convention/preference |

**排除规则**（不应识别为知识的）：

- 一次性任务指令："帮我重构这个函数"
- 通用编程常识："用 const 而非 let"
- 临时上下文："当前分支是 feature/xxx"
- 未确认的猜测："我觉得可能是…"

**决策理由**：纠正反馈是重要信号（旧系统 corrections.jsonl 的精神延续）；排除规则防止噪声（通用常识和一次性指令是最常见的误识别来源）。

## 影响范围

- 新增 `template/claude/skills/evokit-learn/SKILL.md`
- 新增 `template/claude/commands/evokit-learn.md`
- `template/claude/hooks/stop.sh` — 检查 .pending/ 并提示
- `template/claude/CLAUDE.md` — 新增 2-3 行识别指令
- `src/commands/` — 新增 learn 命令（如果需要 CLI 支持）

## 依赖此票的后续票

- T03（钩子重写）、T04（CLAUDE.md 重写）
