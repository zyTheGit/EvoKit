---
name: learning-recorder
description: 项目上下文引擎知识识别记录 — 何时把项目/个人知识静默写入 .pending/ 待确认
disable-model-invocation: true
---

# 知识识别记录（v1.0）

本技能提供对话提取的知识识别准则。识别到项目/个人专属知识时，**静默写入 `.pending/`**（不猜测 scope），用户确认后持久化。

## 何时写入 `.pending/`

| 情形 | 写入 | 示例 |
|------|------|------|
| 用户纠正你的做法（新事实） | `<project>/.evokit/.pending/{type}-{slug}.md` | "使用 Result<T> 而非 throw" |
| 发现项目专属模式/约定 | 同上 | "项目用 kebab-case 命名文件" |
| 架构决策/依赖关系 | type=architecture | "packages/api 是上游" |
| 工作流规则 | type=workflow | "commit 用 conventional 格式" |

**不去写**：一次性命令、通用常识、临时上下文、未确认的猜测、已入库的重复。

## 写入格式（.pending 草稿 frontmatter）

```yaml
---
id: convention-use-named-exports   # {type}-{slug}，跨 knowledge/+pending 去重
status: pending                     # 未背书
type: convention                    # convention | preference | architecture | workflow
source: conversation
created: 2026-08-02
---
## 内容
（具体内容描述）
```

`.pending/` 草稿**无 scope/confidence**（识别时不猜作用域，确认时人工裁定）。架构型写路径自带 `## 影响范围` 占位。

## 准则
1. **专属/确定性** — 项目或个人专属、确定的事实才写；通用知识不写
2. **不猜测 scope** — 场景在确认时由人工（用户）裁定，非识别时
3. **静默** — 写入后不主动提及，会话末/提示时引导 `evokit learn` 确认
4. **去重** — 隐性知识出现 ≥2 次（去重合并）才产候选

v0.x 的 corrections/observations/violations/learned-rules 记录方式在 v1.0 废弃，改以上述 `.pending/` + 确认背书取代。
