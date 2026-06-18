# EvoKit 进化管线

## 概述

进化管线将原始纠正信息转化为永久性的行为规则。它是使 EvoKit 具备"自我进化"能力的核心机制。该管线由用户交互和**自动钩子**共同驱动，持续捕获学习数据。

## 钩子驱动的学习流程

```
                    Hook 事件
                         |
     +-------------------+--------------------+
     |                   |                    |
  PreToolUse         PostToolUse          PreCompact
  (注入规则)         (追踪编辑)        (快照状态)
     |                   |                    |
     v                   v                    v
  learned-rules.md   observations.jsonl   .compact_state
     |                   |
     v                   v
  /boot 验证         /evolve 晋升
```

## 管线阶段

### 阶段 1：捕获

学习数据从多个来源捕获：

**来源 1：用户纠正（手动）**
当用户在对话中纠正 AI 时，Claude 会记录如下：

```json
{"timestamp":"2026-06-11T14:30:00","pattern":"使用 uv 替代 pip","context":"用户将 pip install 纠正为 uv pip install","count":1}
```

**来源 2：PostToolUse 钩子（自动）**
每次通过 `PostToolUse` 钩子进行的文件编辑都会记录一条观察记录，包含文件扩展名、行数和路径。这构建了哪些文件类型被最频繁编辑的使用情况画像。

**来源 3：PreCompact 钩子（上下文保留）**
在上下文压缩之前，保存学习状态快照（包括纠正/观察计数），以防止数据丢失。

**格式：** `corrections.jsonl`（仅追加，永不删除），`observations.jsonl`（仅追加，自动填充）

### 阶段 2：轮转（自动）

当 `corrections.jsonl` 或 `observations.jsonl` 超过 **500 行**时：

1. **超过 30 天**的条目被移动到 `archive/`
2. **超过 1000 行**的归档文件被 gzip 压缩
3. 活跃文件保持精简，以便快速执行 `/evolve` 处理

对于 `observations.jsonl`：
- **超过 60 天**的条目置信度减半
- 衰减后**低于 0.3 阈值**的条目被归档

### 阶段 3：晋升（/evolve）

每约 10 个会话运行 `/evolve`，以：

1. **按 `pattern` 字段分组**纠正记录
2. 将出现 **2 次以上**的模式**晋升**到 `learned-rules.md`
3. 每条晋升规则包含：
   - 一条人类可读的描述
   - 一条 `<!-- verify: ... -->` 注释（机器可检查）
   - 一条晋升日期注解

```markdown
- **使用 uv 而非 pip 进行 Python 包管理**
  <!-- verify: grep -r 'pip install' --include='*.md' ~/.claude/ && exit 1 || exit 0 -->
  <!-- promoted: 2026-06-11 from corrections.jsonl -->
```

### 阶段 4：验证（/boot）

每次会话启动时运行 `/boot`（通过 SessionStart 钩子）：

1. 读取 `learned-rules.md` 中的所有规则
2. 运行每条规则的 `verify` 命令
3. 通过 → 静默。失败 → 记录到 `violations.jsonl`
4. 报告摘要："N 项通过，M 项失败"

### 阶段 5：毕业（/evolve）

当一条规则已连续通过 **10+ 个会话**的验证且无违规后：

1. `/evolve` 可能会提议将其移至 `rules/` 或 `CLAUDE.md`
2. 该提议被记录在 `evolution-log.md` 中
3. 如果被接受，该规则成为永久规则（L2 或 L1）
4. 该晋升条目从 `learned-rules.md` 中移除

### 阶段 6：拒绝

如果某条规则不合理或已被其他规则覆盖：

1. `/evolve` 将拒绝记录到 `evolution-log.md`
2. 该模式**永不重新提议**（防止振荡）

## 文件生命周期

```
corrections.jsonl     learned-rules.md        rules/*.md / CLAUDE.md
┌──────────┐         ┌──────────────┐         ┌──────────────────┐
│ 阶段 1   │──2×──►  │  阶段 3      │──10×──► │  阶段 5           │
│ 捕获     │         │  晋升        │  验证   │  毕业             │
└──────────┘         └──────────────┘         └──────────────────┘
     │                      │                         │
     ▼ (30d+)               ▼ (拒绝)                   │
┌──────────┐         ┌──────────────┘                 │
│ archive/ │         │                                │
│ (gzip)   │         ▼                                │
└──────────┘   evolution-log.md                       │
     │              (永不重新提议)                      │
     ▼                                                │
  删除                                                │
    (TTL 到期后)                                      │
                                                     ▼
                                              永久性行为变更
                                              （极少更改）
```

## 配置

管线具有适用于大多数用户的合理默认值：

| 参数 | 默认值 | 描述 |
|-----------|---------|-------------|
| `max_lines` | 500 | 文件超过此行数时触发轮转 |
| `max_days` | 30 | 归档超过此天数的条目 |
| `max_lines_archive` | 1000 | 压缩大于此行数的归档文件 |
| `confidence_decay_days` | 60 | 超过此天数后置信度减半 |
| `confidence_threshold` | 0.3 | 归档低于此置信度的观察记录 |
| `promote_threshold` | 2 | 模式出现此次数后晋升 |
| `graduate_sessions` | 10 | 提议毕业前的会话数 |
| `learned_rules_max` | 50 行 | learned-rules.md 的硬限制 |
| `claude_md_max` | 150 行 | CLAUDE.md 的硬限制 |

这些参数可以在 `/evolve` 命令实现中进行调整。
