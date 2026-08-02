# EvoKit 知识系统

## 概述

EvoKit v1.0 的核心是**知识生命周期管理** — 让 AI 持久化项目/个人专属知识，从识别到确认到过期检测。

## 知识生命周期

```
对话中识别知识 → 静默写入 .pending/ → 用户确认 → 移入 knowledge/ → 过期检测
                    ↓                              ↓
               Stop 钩子提示                    更新 knowledge-index.md
```

### 1. 识别

AI 在对话中识别项目/个人专属知识，静默写入 `.pending/{type}-{slug}.md`，不在回复中提及。

**识别信号：**

| 信号类别 | 示例模式 | 知识类型 |
|----------|----------|----------|
| 项目约定 | "我们项目总是…" | convention |
| 个人偏好 | "我更喜欢…" | preference |
| 架构决策 | "X 是 Y 的上游" | architecture |
| 工作流规则 | "提交时…" | workflow |
| 纠正反馈 | "不对，应该是…" | 按 content 判断 |
| 隐性知识 | AI 多次犯错后被用户纠正 | convention/preference |

**排除范围：** 一次性指令、通用编程常识、临时上下文、未确认猜测。

### 2. 待确认

写入 `.pending/` 的条目带有 `status: pending` frontmatter。Stop 钩子检测到 `.pending/` 非空时，提示用户运行 `/evokit-learn` 确认。

### 3. 确认

通过 `/evokit-learn` 执行确认流程：

1. 展示所有待确认条目
2. 用户回复："确认 1 和 3，拒绝 2"
3. 确认的条目移入 `knowledge/` 并更新 `knowledge-index.md`
4. 拒绝的条目从 `.pending/` 删除

### 4. 持久化

确认后的知识条目存储在 `knowledge/` 目录下，格式为 `{type}-{slug}.md`，包含 YAML frontmatter + 正文。

### 5. 过期检测（规划中）

v1.0 暂不实现。规划方案：
- 定期检查知识条目是否仍然适用（通过 verify 命令或 Git 历史分析）
- 长期未被引用的条目降低置信度
- 置信度低于阈值的条目标记为待审查

## 显式声明

用户可以通过 `/evokit-learn "内容"` 直接创建知识条目，跳过 .pending/ 确认流程。适用于：
- 用户主动告知项目约定
- 从文档/README 中提取的架构决策
- 团队规范中的工作流规则

## 知识条目数据结构

### Frontmatter

```yaml
id: string           # 必填，= 文件名去掉 .md
scope: personal | project  # 必填
type: convention | preference | architecture | workflow  # 必填
source: conversation | explicit | git-history  # 必填
confidence: number   # 必填，0.0–1.0
created: string      # 必填，ISO 8601
updated?: string     # 可选，ISO 8601
context?: string     # 可选，单行摘要
tags?: string[]      # 可选，标签数组
```

### 正文区段

- `## 适用范围`（可选）— 展开 context 的详细描述
- `## 内容`（必填）— 知识的具体描述
- `## 来源上下文`（可选）— 识别来源、原始对话片段

### 文件命名

`{type}-{slug}.md`，完整 type 名，slug 为 kebab-case。冲突加数字后缀。

## 知识索引

`knowledge-index.md` 始终加载，提供所有知识条目的摘要行。AI 通过索引快速了解项目知识全貌，按需加载具体条目。

```markdown
## 个人知识

- [convention-uv-pip] 使用 uv 而非 pip
- [preference-dark-mode] 偏好暗色主题

## 项目知识

- [architecture-api-upstream] packages/api 是 packages/web 的上游
```

## 作用域

| 层级 | 存储位置 | 生命周期 | 说明 |
|------|----------|----------|------|
| 个人 | `~/.evokit/knowledge/` | 跨项目持久 | 个人偏好、工具链偏好（4 助手共享） |
| 项目 | `<project>/.evokit/` | 跟项目走，可提交 git | 项目约定、架构决策（4 助手共享） |

## 与 Claude Code Memory 的关系

**增强，不替代。**

- Claude Code memory = 存储层（文件系统、索引、加载机制）
- EvoKit = 智能层（对话提取、结构化、确认、过期检测、多助手同步）
- EvoKit 在 `evokit/` 子目录下工作，不修改 Claude Code 原生 memory 文件
- `knowledge-index.md` 可引用上层 Claude Code 原生条目，AI 一次查询覆盖所有知识
