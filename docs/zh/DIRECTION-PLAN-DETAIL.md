# EvoKit 2.0 详细技术蓝图：单一事实源编译器

> 版本：v2.1 ｜ 日期：2026-10-25 ｜ 前置阅读：DIRECTION-PLAN.md（v2.0 方向）
> 本文回答"具体怎么落地"——数据模型、编译规则、漂移检测算法、命令形态、与旧代码的映射。

---

## 1. 一句话定义产品

**EvoKit 2.0 = 一个"上下文构建系统"（Context Build System），就像 Make 之于代码编译，EvoKit 之于 AI 上下文。**

- 输入：一份人写的 canonical 上下文（分层的 Markdown/YAML）
- 构建：编译成各 AI 工具原生读取的目标文件
- 校验：检测目标文件之间的漂移、裁剪冗余、审计敏感信息

**类比**：`Makefile` → `evokit/context.yaml`；`make` → `evokit compile`；`make clean` → `evokit drift --fix`。

---

## 2. 核心数据模型

### 2.1 单一事实源布局（人写，Git 管理）

```
evokit/
  context.yaml                  # 项目级清单：声明有哪些层、哪些目标
  always/                       # 层1：常驻指令（每次会话都加载）
    overview.md                 #   项目是什么、目录布局、架构一句话
    commands.md                 #   构建/测试/lint 的确切命令
    conventions.md              #   代码风格、命名、必须遵守的约定
    guardrails.md               #   "Don't" 清单：别碰什么、别加什么依赖
  on-demand/                    # 层2：按需能力（触发时才加载，节省 token）
    postgres-migration/
      SKILL.md                  #   name + description + 指令体
      scripts/apply.sh
  scoped/                       # 层3：路径规则（只对匹配文件生效）
    api-conventions.md          #   frontmatter: paths: ["src/api/**"]
    billing-rules.md            #   frontmatter: paths: ["src/billing/**"]
  memory/                       # 层4：稳定记忆（人工晋升、长期有效的事实）
    decisions.md                #   架构决策 + 为什么（含影响范围）
    gotchas.md                  #   踩过的坑、不能碰的约束
```

### 2.2 `context.yaml`（构建清单）

```yaml
version: 2
project: my-app

# 目标：编译到哪些工具的原生格式
targets:
  agnets-md:          # 目标 id
    format: agents-md  # 目标格式（可插拔 adapter）
    output: AGENTS.md
  claude:
    format: claude-md
    output: CLAUDE.md
  cursor:
    format: cursor-rules
    output: .cursor/rules/
  skills:
    format: skills
    output: .claude/skills/

# 每个层编译进哪些目标（默认全部常驻层 → agnets-md/claude）
sections:
  always:   [agnets-md, claude]           # 常驻层 → AGENTS.md + CLAUDE.md
  on-demand: [skills]                      # 按需层 → SKILL.md
  scoped:   [cursor, claude]               # 路径规则 → .cursor/rules + .claude/rules
  memory:   []                             # 记忆层不编译，仅本地审计（见 §5）
```

### 2.3 目标格式适配器（可插拔）

每个 `format` 是一个 adapter，负责"一个 section 的内容 → 一种目标文件格式"。这与旧 EvoKit 的"助手适配器"不同——旧的是"给助手装东西"，新的是"生成助手读的文件"。

| format | 产物 | 关键规则 |
| --- | --- | --- |
| `agents-md` | `AGENTS.md` | 纯 Markdown，section 顺序拼接 |
| `claude-md` | `CLAUDE.md` | 支持 `@path` import；常驻层内联 |
| `cursor-rules` | `.cursor/rules/*.mdc` | frontmatter `description/globs/alwaysApply` |
| `skills` | `.claude/skills/*/SKILL.md` | frontmatter `name/description`，body 按需 |
| `copilot` | `.github/copilot-instructions.md` | 纯 Markdown |

---

## 3. 编译引擎（`evokit compile`）

### 3.1 编译流程

```
读取 context.yaml
  → 遍历每个 section（always / on-demand / scoped / memory）
    → 遍历每个 target
      → 调对应 format adapter 渲染
        → 原子写产物文件（复用旧 atomic-write.ts）
  → 输出构建摘要（哪些产物更新、token 预算估算）
```

### 3.2 关键编译规则

1. **常驻层合并**：`always/*.md` 按文件名排序拼接，注入"这是生成文件，勿手改"头注释。
2. **`claude-md` 的 @import**：如果 `always/` 太大，可配置为 `CLAUDE.md` 只写 `@always/overview.md` 等 import，而非内联——这是 Claude 独有能力，别的 target 没有。
3. **scoped 层 → frontmatter**：`paths` 转成 `.mdc` 的 `globs` 和 `.claude/rules` 的 `paths`。
4. **on-demand 层 → SKILL.md**：`SKILL.md` 的 `name`/`description` 从 frontmatter 提取，`description` 是触发信号（≤1024 字符，必须写清"何时触发"）。

### 3.3 token 预算估算（新能力）

编译时统计每个产物"常驻层会占多少 token"，输出类似：

```
AGENTS.md      常驻 ~1.2k tokens  (目标 < 200 行)
CLAUDE.md      常驻 ~1.2k tokens
.cursor/rules  按需，不占常驻
```

这直接呼应 2026 年"上下文成本"的痛点——帮用户看到并控制"每次会话白付多少 token"。

---

## 4. 漂移检测引擎（`evokit drift`，核心差异化）

### 4.1 什么是"漂移"

**同一事实，在多个产物里说法不一致**，或**产物手改后与 canonical 源不同步**。

典型场景：团队里 A 用 Claude 手改了 `CLAUDE.md` 里的测试命令，B 用 Cursor 改了 `AGENTS.md`，canonical 里的 `commands.md` 没动——三个地方三个版本。

### 4.2 检测算法（确定性，不依赖 embedding）

对每个 target 产物，做**双向指纹比对**：

```
1. 为 canonical 的每个 section 生成规范化指纹（去空白/大小写/标点后 hash）
2. 为每个产物中"由 EvoKit 编译出的段落"生成同样的指纹
3. 比对：
   - 产物段落 ∉ canonical → "孤儿"（有人手改或该源已删）
   - canonical 段落 ∉ 产物 → "未同步"（源改了但没重新 compile）
   - 两者都有但内容 hash 不同 → "漂移"（同一逻辑块两边不一致）
```

关键：EvoKit 在编译产物时**注入可定位的边界标记**（HTML 注释），用于精确切片比对，而不是整文件盲比。

### 4.3 产物里的边界标记

```markdown
<!-- evokit:section always/commands.md -->
## 测试
pnpm test
<!-- /evokit:section always/commands.md -->
```

`evokit drift` 只对比这些标记区间的 hash，用户手改标记外的内容（比如自己加的本地偏好）不误报。

### 4.4 drift 输出

```
✗ 漂移 (3)
  AGENTS.md            § commands.md  源已更新，产物落后（compile 可修复）
  CLAUDE.md            § guardrails.md 产物被手改，与源不一致
  .cursor/rules/api.mdc § api-conventions.md 孤儿：源已删除

→ evokit drift --fix    # 交互式三选：以源为准 / 以产物为准 / 保留两边
```

**这复用旧 EvoKit 的"人工背书 + 三选合并"哲学（ADR 0005），但把对象从"知识条目"换成"上下文段落"**——保留了对的基因，换到对的战场。

---

## 5. 裁剪引擎（`evokit prune`）

对应 Claude Code `/doctor` 的"裁掉模型能从代码推出来的内容"，但做成**跨工具通用**、**可自动化**。

```
evokit prune
  → 扫描 always/ 每个文件
    → 用启发式标记"疑似冗余"：
      · 目录布局/依赖列表（模型读 package.json 就知道）
      · 复述 linter 已强制的规则（ESLint/Prettier 已配）
      · 和代码里写的一样的话（"The code IS the documentation"）
  → 输出建议清单（只建议，不自动删）
  → 用户确认后移出常驻层（降级到 on-demand 或删除）
```

呼应 ETH Zurich 的发现：62% 的 agent 文件在复述 linter 已强制的东西。prune 帮用户把这些删掉，省 token。

---

## 6. 审计层（`evokit doctor` 重写）

保留 `doctor` 命令名，语义从"知识库健康"重写为"上下文健康"：

| 检查项 | 说明 |
| --- | --- |
| canonical 完整性 | context.yaml 合法、section 文件存在、frontmatter 合法 |
| 产物可读性 | 每个 target 产物存在且由 EvoKit 生成 |
| 敏感信息扫描 | 复用旧 git-history 的 SENSITIVE 正则，扫 always/ 是否误写密钥/路径 |
| 漂移 | 委托给 drift 引擎，汇总报告 |
| 冗余 | 委托给 prune 引擎，汇总建议 |

---

## 7. 记忆层（`evokit memory`，收编而非删除旧能力）

v1 的"知识引擎"不整个砍掉，而是**收编进 layer 4 memory**，并转向"人工晋升"：

| v1 概念 | v2 归宿 |
| --- | --- |
| `convention/preference` | → 归入 `always/conventions.md`（常驻，人写） |
| `architecture` + 影响范围 | → 归入 `memory/decisions.md`（保留推理链，这是 EvoKit 的原生差异化，值得留） |
| `workflow` | → 归入 `always/commands.md` 或 `guardrails.md` |
| `confidence` 状态机 | → 简化为 `memory` 条目的 `status: active/stale`，保留二分复审但去掉过度设计 |
| `conversation` 来源 | → **降级**：AI 自动提取不再入库，只生成"建议写入"的提示，人决定 |

**关键转向**：v1 是"AI 学，人背书"；v2 是"人写，AI 裁剪/同步建议"。记忆层的架构决策推理链（`## 影响范围`/`## 相关决策`）是 EvoKit 唯一该保留的自有资产，其余交给生态标准。

---

## 8. 命令总表（重构后）

| 命令 | 作用 | 来源 |
| --- | --- | --- |
| `evokit init` | 生成 canonical 骨架（context.yaml + 四个空层） | 新 |
| `evokit compile` | canonical → 各目标产物 | 新（核心） |
| `evokit drift [--fix]` | 检测/修复产物漂移 | 新（差异化） |
| `evokit prune` | 建议裁剪冗余上下文 | 新 |
| `evokit doctor` | 上下文健康 + 审计 + 漂移汇总 | 重写 |
| `evokit memory <promote/stale>` | 记忆层人工晋升/复审 | 收编旧 learn/review |
| `evokit migrate` | 旧 v1 知识条目 → canonical 一次性迁移 | 保留重写 |

**删除**：`install/uninstall/update`（不再装适配器）、`project`（规范生成器，被 init 取代）、`export/import`（本地文件本就 Git 管理，导出无意义）。

---

## 9. 与旧代码的映射（迁移路径）

| 旧文件 | 处置 |
| --- | --- |
| `src/adapters/*`（claude/codex/opencode/pi） | **删除**，被 `src/compile/format-*.ts` 取代 |
| `src/core/atomic-write.ts` | **保留**，编译产物原子写复用 |
| `src/core/knowledge.ts`（frontmatter 解析） | **保留**，canonical frontmatter 解析复用 |
| `src/core/health.ts` | **重写**为 drift 引擎（指纹比对 + 边界标记） |
| `src/core/git-history.ts` | 敏感信息正则**抽离**复用；commit 提取器删除 |
| `src/core/dedup.ts` | 归一化指纹逻辑**复用**到 drift |
| `src/core/types.ts` | **重写**：KnowledgeType 保留，KnowledgeSource 删除 conversation/git-history |
| `src/commands/learn.ts/review.ts` | 合并进 `memory.ts` |
| `src/commands/install.ts/uninstall.ts/update.ts` | 删除 |

---

## 10. 最小可行里程碑（MVP 边界）

**第一刀只做三件事，跑通端到端再扩展：**

1. `evokit init` —— 生成 `context.yaml` + `always/` 骨架
2. `evokit compile` —— 只支持 `agents-md` + `claude-md` 两个 target
3. `evokit drift` —— 只做 `always` 层的指纹漂移检测

这三件交付后，就能回答最关键的问题：**"一份 canonical 源，编译到 AGENTS.md 和 CLAUDE.md，并在手改后能检测出漂移"是否真的解决了多工具团队的痛点。**

---

## 11. 现在需要你拍板的（已收敛为 3 个）

1. **是否砍掉"AI 自动提取知识"**（`conversation` 来源），改为"人写为主"？
2. **是否删除四助手适配器**，全面转向"编译到 AGENTS.md 等标准"？
3. **是否接受把记忆层的"架构决策推理链"作为唯一保留的自有资产**，其余交给生态？

这三个"Yes"确认后，我即可进入 M0，从 `evokit init` + `compile` 的最小实现开始落地。
