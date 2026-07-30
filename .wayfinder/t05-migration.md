# 旧数据迁移策略

> **wayfinder:grilling** · 阻塞：T01 · 状态：decided

## Question

已确认"推倒重来 + learned-rules.md 自动转换 + 手动确认"。但自动转换器的具体实现策略是什么？

## 决策结论

### 1. learned-rules.md 解析

处理两种格式变体：

**变体 1：模板空文本**

```markdown
No rules have been promoted yet. Run `/evolve` after accumulating corrections.
```

→ 跳过（不是知识）

**变体 2：已提升规则**

```markdown
- **描述** — 补充说明
  <!-- verify: 命令 -->
  <!-- promoted: 日期 from corrections.jsonl (pattern: xxx, count: N) -->
```

转换规则：

- `**描述** — 解释` → type=convention, source=explicit, confidence=0.9（已提升=高置信度）
- `<!-- verify: ... -->` → 丢弃（新系统不保留 verify）
- `<!-- promoted: 日期 ... -->` → 提取日期作为 created

无法解析的条目跳过并警告。额外需要处理：

- 代码生成格式：`# 已学习规则`（中文标题）+ `- **描述**`（无补充说明）
- deprecated 标记：`- **描述** (deprecated)` → 跳过

**决策理由**：实际变体只有 2-3 种，解析器覆盖即可；无法解析的极少，手动补录成本低；跳过而非保留旧文件，避免新旧并存。

### 2. 转换时机

- `evokit migrate` — 独立命令，执行迁移 + 展示待确认列表
- `evokit update` — 检测到旧数据时提示"运行 evokit migrate 迁移"
- `evokit init` — 不涉及迁移（全新安装）

**决策理由**：迁移是一次性操作，不应混入 init/update 主流程；用户需要主动确认（转换后需手动确认）；update 提示确保用户不会遗漏。

### 3. 确认交互

批量展示 + 用户选择：

```
迁移 learned-rules.md → 知识条目

1. [convention] 数据派生优先用 useMemo 而非 useEffect + setState
2. [convention] ...

输入操作（a=全部接受, n=全部拒绝, 或指定条目如 "1 e" 编辑）: a
```

**决策理由**：与 /evokit-learn 的确认流程模式一致；learned-rules.md 条目少（0-5 条），批量展示不会过载；支持全部接受（大多数用户会全部接受）。

### 4. 旧文件归档

归档到 `evokit/archive/v0/`：

```
evokit/
  archive/
    v0/
      corrections.jsonl
      observations.jsonl
      evolution-log.md
      violations.jsonl
      learned-rules.md
  knowledge-index.md
  knowledge/
```

- sessions.jsonl 保留原位（不在 evokit/ 职责范围内）
- learned-rules.md 迁移后归档（转换可能有信息损失，归档保留原始数据）

**决策理由**：归档成本极低（只是移动文件）；安全网——迁移出错可从归档恢复；删除不可逆，归档更安全。

### 5. 降级路径

不支持自动降级。迁移前提示："此操作将转换旧数据为 v1.0 格式，旧文件归档到 evokit/archive/v0/。v1.0 不支持自动降级。"

用户可以通过 `npm install @zythegit/evokit@0.6.10` 安装旧版，但旧版无法读取 v1.0 的知识库格式。归档保留了原始数据，技术上可手动恢复。

**决策理由**：实际用户量小，降级需求极低；归档已提供安全网；实现降级工具成本不值得。

## 影响范围

- 新增 `src/commands/migrate.ts`
- `src/commands/update.ts` — 添加旧数据检测提示
- `src/core/promote.ts` → 删除（解析 learned-rules.md 的逻辑在 migrate.ts 中重新实现）
- `src/core/rotate.ts` → 删除
- `src/core/memory.ts` → 重写
- `src/core/types.ts` → 重写

## 依赖此票的后续票

- T06（CLI 清理）
