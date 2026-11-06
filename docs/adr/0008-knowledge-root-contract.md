# ADR 0008 — 知识根读写契约：索引 section 正名、未知 section 止血、双根默认扫描

## 状态

**已被取代（Superseded，2026-10-27）**——v2.0 不再有 `knowledge-index.md`、section 桶与双根扫描（`src/` 已随提交 `7f78090` 删除），本 ADR 的四项读写契约不再实施。保留作历史决策记录，但它要治的病灶**并未消失**：托管块的 section 归属换成了 `<!-- evokit-managed:* -->` 边界标记，而"解析边界时存在一条会把用户内容物理删除的分支"在 v2.0 以新形态复现（见 `docs/DIAGNOSIS-2026-10-v1.2-recall-loop.md` §9.3 P0）。

~~已接受（2026-10 方向复盘；依据 `docs/DIAGNOSIS-2026-10-v1.2-recall-loop.md` 诊断 B / C / E）~~

## 背景

`knowledge-index.md` 是 ADR 0001:32 定的唯一查询入口（"索引常驻"），但它的 section 语义在三处各不相同，且读写实现里藏着一条会删数据的分支。

**代码**（`src/core/knowledge.ts:147-148`）：

```ts
const INDEX_HEADER = '## 个人知识';   // → 桶 evokit（可被 regenerateIndex 全量重建）
const CLAUDE_HEADER = '## 项目知识';  // → 桶 claude（原样透传，不参与重建）
```

**文档**（`CONTEXT.md:146-152`）示范的却是 `## EvoKit 知识` / `## Claude 原生记忆`。
**模板**（四份 `template/*/memory/evokit/knowledge-index.md:8,12`）注释教条目写成 `- [标题](evokit/knowledge/<id>.md)`。

三个后果：

1. **桶名与标题名的语义正好错位**。`evokit` 桶装的是「个人知识」段的行，`claude` 桶装的是「项目知识」段的行。而在**项目知识根**下，`appendIndex`（`src/core/repository.ts:262-272`）把新条目**无条件追加进 `evokit` 桶**——即项目级条目全被写进字面写着「个人知识」的段里。`regenerateIndex`（`:308-317`）同样只重建该桶。所以这两个桶的真实语义是"**EvoKit 托管 / 助手原生记忆**"，标题却把它们命名成了 scope。
2. **未知 section 会被物理删除**。`readKnowledgeIndex` 遇到任何不等于上述两常量的 `## ` 行即 `section = null`（`knowledge.ts:174-177`），该段所有行在解析阶段被丢弃；`writeKnowledgeIndex`（`:202-230`）随后只重新输出两个常量标题（`:212-224`）。**一次 `regenerateIndex` / `doctor --fix` / `confirmDraft` 就会把用户手写的第三个 section 从文件里抹掉**。这是本仓库现存唯一一条已知能删用户数据的分支。
3. **落在「项目知识」段的行脱离管理域**。`claude` 桶既不随 `regenerateIndex` 重建，`removeIndexEntry` 也只按 `target: 'evokit'` 默认过滤（`knowledge.ts:255-268`；`dedup.ts:268-282` 的调用即传 `'evokit'`），因此 ADR 0005 的冲突合并在删索引行时**看不见这一段**——不报错，只是不同步。

另外两处相关失配：**索引行格式**——模板教链接式，而 `idFromIndexLine`（`src/core/health.ts:54-57`）与 `boot.ts:88-92` 按 `/^- \[([^\]]+)\]/` 取"中括号里的文本"当 id，于是手写标题被当成 id → **悬空/孤儿误报**；bash 钩子 `session-start.sh:28` 用的又是第三套提取规则（按链接目标）。三套规则并存直接污染 v1.1/v1.2 产出的诊断可信度。

**写侧根扫描**：`evokit learn` 无 `--project-dir` 时 `knowledgeRoots = [getPersonalKnowledgeRoot(homeDir)]`（`src/commands/learn.ts:204`），Stop 钩子只查 `~/.evokit/knowledge/.pending`（`template/claude/hooks/stop.sh:5`），而 `template/claude/CLAUDE.md:63-64` 教 AI 静默写入**项目根** `<project>/.evokit/.pending/`。主干路径产生的草稿闸门看不见（诊断 B）。正确姿势已在别处实现过：`evokit-lifecycle.ts:33-41,57` 与 `tools/evokit-session.ts:21-24` 都扫双根。

## 决策

### 1. 索引 section 按真实语义正名

```
## EvoKit 知识        ← 可重建桶（现 INDEX_HEADER '## 个人知识'）
## 助手原生记忆        ← 保留不重建桶（现 CLAUDE_HEADER '## 项目知识'）
```

- scope 由**知识根目录**决定（`~/.evokit/knowledge/` = 个人，`<project>/.evokit/` = 项目），**不进 section 命名**。这也让 `## Claude 原生记忆` 的错误命名一并纠正——知识根是 4 助手共享、agent 无关的（ADR 0001:34），叫"Claude"名不副实。
- `CONTEXT.md:146-152` 的示范与新 header 一致（文档侧本来就写的是 `## EvoKit 知识`），差异只剩第二段的"助手"字样。

### 2. 永久保留旧 header 的只读别名，但承认"首次写入即完成改名"

- `readKnowledgeIndex` **永久**把 `## 个人知识` 映射进 EvoKit 桶、`## 项目知识` 映射进原生记忆桶（实现成本约 2 行的别名表，不设失效时间）。
- `writeKnowledgeIndex` 只输出新 header。
- **必须说清的副作用**：这意味着任何一次写（确认草稿、`--fix` 重建、追加索引）都会把用户文件里的旧 header **就地改成新 header**。这是无损的格式收敛——条目行本身一行不动、不需要 `doctor --fix` 之类的迁移工具、不需要"双读一个版本"的过渡期——但它**不是零影响**：外部若有人按字面 `## 个人知识` grep 该文件，会失配。本 ADR 明确承认这一点，不包装成"完全兼容"。
- 之所以不做带时限的迁移三件套：改动面是全仓硬编码 header 常量 + 4 份测试文件断言，而 ADR 0001:68 已就同类情形表态"现有用户量小，推倒重来"。

### 3. 止血优先于改名：未知 section 原样保留

`readKnowledgeIndex` 增加"未知 section"收集，`writeKnowledgeIndex` 把这些段**按原文写回**，不再物理删除。**本条独立于第 1/2 条**，即使不改 header 也必须做——它是数据丢失修复，优先级最高，应作为 v1.3 第一颗示踪弹单独合入。

- 已知代价：未知段的行仍是文本，不参与任何桶的 id 提取，因此仍不会被 `regenerateIndex`/`removeIndexEntry` 同步。本 ADR 只承诺"不再删除"，不承诺"托管未知段"。

### 4. 修 `appendIndex` 的语义倒置

`repository.ts:262-272` 追加行时按桶语义（EvoKit 托管）写入，与 `regenerateIndex` 保持同一个桶；同时消除"项目根下条目落在字面写着『个人知识』的段里"这一表述矛盾（正名后自动消解）。`repository.ts:305` 的注释同步改写，不再以 scope 描述两个桶。

### 5. 统一索引行格式为 `- [id] 摘要`

- 代码侧维持现有提取规则（`health.ts:54`、`boot.ts:88-92`），**不改提取器**；
- 四份 `template/*/memory/evokit/knowledge-index.md` 的注释示例改为与提取规则一致；
- 架构型 `🏛` 追索标记保持在摘要前缀位（`CLAUDE.md:67-71` / `codex AGENTS.md:75-79` 的检索分裂指令依赖它），不得挪进中括号；
- 目标：消除悬空/孤儿**误报**，使 `doctor`/`boot` 的漂移报告可信（诊断 E）。

### 6. 写侧默认扫双根

`learn` / `review` / `evokit hook stop` 默认扫描 **个人根 + `cwd/.evokit`**：

- 保留 `--project-dir <path>` 覆盖项目根；
- 新增 `--personal-only` 回退（供只想处理个人级的场景与测试用）；
- 验收须含：**两个根下存在同名 id 草稿时，各出现一次、各裁定一次**。现实现按根各自写回（`learn.ts:44-62` 的 `PendingCandidate` 携带 `repo` + `knowledgeRoot`），**不产生文件冲突**，此项是行为断言而非风险规避。

### 7. 否掉的方案

- 把 scope 编进 section 名（`## 项目知识` 留在项目根）：同一份读写代码要在两种根下用不同 header，`regenerateIndex` 需按根分支，复杂度换不到任何收益——scope 已由目录表达。
- 用 `doctor --fix` 做 header 迁移 + "双读一个版本"：多一个用户必须记得跑的步骤，且迁移窗口内新旧 header 都得兼容，等于把永久别名写得更复杂。
- 让提取器同时接受链接式与 `- [id]` 式：三套规则并存变成四套，误报源头留着。

## 改动面（供 ROADMAP 工作量估算；本 ADR 不动代码）

| 位置 | 改什么 |
| --- | --- |
| `src/core/knowledge.ts:147-148` | header 常量 + 旧 header 别名表 |
| `src/core/knowledge.ts:174-177` | 未知 section 不再丢弃（改为收集） |
| `src/core/knowledge.ts:202-230` | `writeKnowledgeIndex` 输出新 header + 回写未知段 |
| `src/core/knowledge.ts:236-269` | `appendToKnowledgeIndex` / `removeIndexEntry` 随返回形状调整 |
| `src/core/repository.ts:262-272` | `appendIndex` 语义修正 |
| `src/core/repository.ts:305-317` | `regenerateIndex` 注释与桶名同步 |
| `src/commands/review.ts:23,111` | `readKnowledgeIndex` / `removeIndexEntry` 调用点 |
| `src/commands/migrate.ts:150` | `appendToKnowledgeIndex` 调用点 |
| `src/commands/boot.ts:76,78-83,197` | 双 section 断言改新 header（含合法别名） |
| `src/core/health.ts:54,79` | 提取规则不变，消费端随返回形状调整 |
| `src/adapters/claude/adapter.ts:385-390` | 模板索引初始化内容 |
| 四份 `template/*/memory/evokit/knowledge-index.md` | header + 行格式注释 |
| `CONTEXT.md:143-153` | 格式示范 |
| `docs/{zh,en}/KNOWLEDGE.md` | 索引格式章节（双语同步义务） |
| `src/commands/learn.ts:204` | 双根默认扫描 |

**测试硬编码点（会直接失败的地方）**：`tests/core/knowledge.test.ts:304-385`、`tests/adapters/claude-adapter.test.ts:268`、`tests/core/repository.test.ts`、`tests/core/uninstall-engine.test.ts:208`。

> **返回形状变更是本次最大的隐藏成本**：`readKnowledgeIndex` 若新增未知段集合，则 `boot.ts:76`、`health.ts:79`、`review.ts:23`、`migrate.ts:150`、`knowledge.ts:236-269` 全部消费点都要跟着改；`writeKnowledgeIndex` 若扩参，`repository.ts:271,315` 亦须改。**只改 `knowledge.ts:202-230` 不足以止血**——评审轮指出这一点后本 ADR 才把改动面补全。

## 取舍

### 选"永久别名"而非"迁移期 + 迁移命令"

- **放弃**：一个干净的最终状态（旧 header 永远还有读到它的可能）
- **获得**：用户不需要知道这次改名发生过，也不需要跑迁移；代码成本约 2 行且不退场
- **代价**：别名成为永久负担，且首次写入即就地改名（第 2 条已明写）

### 选"不托管未知段，只保证不删"

- **放弃**：任意 section 都能被 `doctor` 一致性校验覆盖的完整性
- **获得**：止血改动可以很小、可以单独成一个 PR 先落地
- **代价**：未知段仍是诊断盲区，须在报告与 ADR 里如实说明

### 选"统一提取规则、改模板注释"而非"提取器兼容两种写法"

- **放弃**：用户手写链接式索引的向后兼容（这类行将被当作 id 提取并可能报悬空）
- **获得**：一套格式一个提取器，误报根因消除
- **代价**：已在真实使用链接式手写索引的用户会看到新报错；考虑到本仓 `.evokit/` 尚零条目，此代价当前接近于 0

## 验收条件

1. **止血用例**：索引含第三个 `## 随手记` 段 → 跑 `regenerateIndex` / `doctor --fix` 后该段**逐字仍在**。
2. **别名用例**：仅含旧 header 的索引能被正常读取并归入对应桶；写一次后 header 变为新名，条目行数量不变。
3. **倒置修正用例**：项目根下确认草稿，索引行落在 `## EvoKit 知识` 段（而非字面「个人知识」段）。
4. **格式统一用例**：四份模板索引文件不含链接式示例；`health.ts` 的 dangling/orphan 报告在手写示例条目上不误报。
5. **双根用例**：个人根与项目根各有一份 `.pending/` 时默认扫描都命中；同名 id 草稿各裁定一次；`--personal-only` 只扫个人根。
6. **防回退**：`boot.ts` 的 section 合法性断言同时接受新 header 与旧别名（避免存量索引被报格式非法）。
