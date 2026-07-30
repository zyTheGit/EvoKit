# 知识条目数据模型

> **wayfinder:grilling** · 阻塞：无 · 状态：decided

## Question

知识条目（Knowledge Entry）的精确数据结构是什么？这是整个 v1.0 的地基——所有其他模块都依赖它。

## 决策结论

### 1. YAML frontmatter 字段

```yaml
---
id: string # 必填，= 文件名去掉 .md
scope: personal | project # 必填
type: convention | preference | architecture | workflow # 必填
source: conversation | explicit | git-history # 必填
confidence: number # 必填，0.0–1.0
created: string # 必填，ISO 8601
updated?: string # 可选，ISO 8601，修正时填入
context?: string # 可选，单行摘要，适用范围
tags?: string[] # 可选，标签数组
---
```

正文结构：

```markdown
## 适用范围（可选，展开 context）

详细描述...

## 内容

知识的具体描述...

## 来源上下文（可选）

这条知识是怎么被识别的，原始对话片段等...
```

**决策理由**：

- `updated` 可选：新建时与 `created` 相同省去冗余，修正时填入；过期检测需要时间信息
- `context` 混合方案：frontmatter 放单行摘要（索引层快速过滤），正文 `## 适用范围` 展开细节
- `verify` 不保留：旧系统概念不匹配新定位，过期检测替代，执行 shell 有安全隐患
- `tags` 可选字符串数组：type 粒度太粗，tags 支持跨类型查询，可选避免噪声

### 2. 文件命名规则

`{type}-{slug}.md`，完整 type 名（非缩写），slug 为 kebab-case。

示例：

- `convention-result-throw.md`
- `architecture-api-upstream.md`
- `preference-uv-over-pip.md`
- `workflow-conventional-commits.md`

冲突时加数字后缀：`convention-result-throw-2.md`

**决策理由**：人类可读性是刚需；type 前缀使文件系统排序时同类型自然聚在一起；完整 type 名避免缩写认知负担

### 3. knowledge-index.md 格式

```markdown
## EvoKit 知识

- [convention-result-throw] 使用 Result<T> 而非 throw
- [preference-uv-over-pip] 使用 uv 而非 pip

## Claude 原生记忆

- [sync-readme-languages](../sync-readme-languages.md) — Keep README.md and README.en.md in sync
- [versioning-rule](../versioning-rule.md) — Minor version only for feature milestones
```

**决策理由**：

- 摘要行极简：id 已包含 type 前缀无需重复，索引行越短越好（始终加载，占系统提示词空间）
- 桥接区块：ADR 确认"增强不替代"，AI 一次查询覆盖所有知识；只引用不复制，区块标题区分来源

### 4. evokit/ 子目录结构

扁平存放：

```
evokit/
  knowledge-index.md
  knowledge/
    convention-result-throw.md
    architecture-api-upstream.md
    preference-uv-over-pip.md
    workflow-conventional-commits.md
```

**决策理由**：type 前缀已提供分组；路径更短；避免 4 个子目录各 2-3 个文件的膨胀；id 与路径一致

### 5. 个人级 vs 项目级

目录结构完全相同，仅位置不同：

- 个人级：`~/.claude/memory/evokit/`
- 项目级：`.claude/memory/evokit/`

**决策理由**：代码复用只需一套；AI 查询格式统一；`scope` 字段已区分归属

## 影响范围

- `src/core/types.ts` — 新增 KnowledgeEntry 类型
- `src/core/memory.ts` — 重写为知识条目 CRUD
- `src/core/template.ts` — 新模板文件
- `template/claude/memory/` — 重写
- 所有适配器 — memory 路径变更

## 依赖此票的后续票

- T02（对话提取 prompt）、T03（钩子重写）、T05（迁移）、T06（CLI 重写）
