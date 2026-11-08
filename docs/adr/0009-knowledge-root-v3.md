# ADR 0009 — v3 知识根契约：卡片、索引读写与个人根单根

## 状态

已接受（2026-11-06）。本 ADR 取代 ADR 0008 的全部读写契约，是记忆引擎 v3（见 `docs/zh/MEMORY-ENGINE-DESIGN.md` 与 `docs/zh/MEMORY-ENGINE-IMPLEMENTATION-PLAN.md`）M0 地基的实现依据。0008 记录的事故教训（未知 section 物理删除、索引行三套格式并存、双根扫描复杂度）在本 ADR 中以硬约束形式复活。

## 背景

v1.x 的知识根随 v2.0 转向整体删除，ADR 0006–0008 已标记为历史决策。v3 记忆引擎重新引入知识根 `~/.evokit/knowledge/`，由纯 JS、零依赖的 `cli/src/knowledge-cards.js` 与 `cli/src/knowledge-index.js` 实现读写。v1.x 的三类事故必须在 v3 实现里从契约层面杜绝：

1. 一次索引重建就把用户手写的第三个 section 物理删除（0008 §3）；
2. 索引行存在代码/文档/模板三套格式，导致悬空与孤儿误报（0008 §5）；
3. 双根（个人根 + 项目根）扫描带来的 `.pending` 可见性事故与实现复杂度（0008 §6）。

## 决策

### 1. 个人根单根

v3 只有 `~/.evokit/knowledge/`（`EVOKIT_HOME` 环境变量可整体覆盖，供测试隔离）。项目从属用卡片 `scope` 字段表达（`global` 或 `project:<munge>`），不再维护 `<project>/.evokit/` 双根。

### 2. 索引 section 语义

`## EvoKit 知识` 是唯一可重建桶；其余任何 `##` 段（如 `## 助手原生记忆`、`## 随手记`）为**透传段**：读侧逐字收集，写侧逐字写回，永不重建、永不删除。透传段不参与 id 提取与预算滚动——只保证不删，不做托管。

### 3. 旧 header 永久别名

读侧把 `## 个人知识` 映射进 EvoKit 桶、`## 项目知识` 映射进透传桶；写侧只输出新 header。别名无失效期、约 2 行成本，承接 0008 §2 的立场。

### 4. 索引行单一格式

`- [id] 摘要`；类型标记（`⚠` pitfall / `🏛` pattern / `🔧` workflow）位于摘要前缀位，不进中括号。提取规则统一为 `/^- \[([^\]]+)\]/`，全链路（读写、体检、recall）只用这一套。卡片 id 形如 `kYYYYMMDD-8hex`（sha256 前 8 位）。

### 5. 预算滚动

L1 索引硬上限 `indexBudget`（默认 60 行）。溢出时按（最近引用时间 desc、confidence desc、updated desc）挤出；`pitfall` 类型与 forge 父卡带粘性权重。被挤出卡片保留在库文件中，L2 按路径读取与 `recall` 检索仍可命中。

### 6. 生命周期

`draft → confirmed → retired`。失效 = 置 `validUntil`（双时态，不删除）；合并 = 被并卡 `retired` + `mergedInto` 指向 canonical；结论相反 = 互设 `conflictWith` 双保留。物理清理只由显式的 `evokit knowledge gc` 执行（归档至 `.archive/`）。

### 7. 知识库版本化

知识根独立 `git init`，不配置 remote。review 接受草稿即 `git commit -m "learn: <title>"`；git 身份未配置时打印警告并跳过 commit，不阻塞入库（卡片照常落盘）。

## 取舍

- **单根而非双根**：0008 §6 的双根扫描在 v1.x 造成 `.pending` 盲区事故；v3 用 `scope` 字段表达项目从属，把复杂度留在元数据层而非文件系统层。若未来确需项目根，再立新 ADR。
- **透传而非托管未知段**：与 0008 §3 立场一致——未知段仍是诊断盲区，报告里如实说明；「保证不删」优先于「参与管理」。
- **frontmatter 受限解析而非完整 YAML**：扁平键 + 单层数组、格式自控、配往返单测；换取消除 js-yaml 依赖（零依赖红线）。

## 验收条件

1. 含第三个手写 section 的索引在重建/写回后逐字仍在（数据丢失回归的第一硬验收）。
2. 仅含旧 header 的索引可读且归桶正确；一次写后 header 变新名、条目行数量不变。
3. 索引行提取只认 `- [id]` 形式；超预算滚动后常驻 ≤60 行，被挤出卡片文件仍在且可检索。
4. `draft`/`retired` 卡不进 L1 索引；merge 后索引只保留 canonical 行。
