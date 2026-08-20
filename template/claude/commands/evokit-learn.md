---
description: 回顾对话提取知识 / 显式声明知识
---

# /evokit-learn — 知识提取与确认

管理对话提取的知识条目：回顾待确认条目、确认或拒绝、或显式声明新知识。

## 用法

- `/evokit-learn` — 展示 `.pending/` 中的待确认条目 + 回顾对话中识别到的新知识
- `/evokit-learn "内容"` — 显式声明知识，直接写入 `knowledge/`
- `evokit learn --git-history` — 从当前项目 commit 历史提取约定候选到 `.pending/` 待确认（ADR 0004；与显式声明互斥，确认仍走无参 `/evokit-learn`）

## 待确认条目确认流程

1. 运行 `/evokit-learn`，展示所有待确认条目
2. 用户在对话中回复（自然语言），例如："确认 1 和 3，拒绝 2"
3. 执行操作：
   - 确认的条目：移入 `knowledge/` 并更新 `knowledge-index.md`
   - 拒绝的条目：从 `.pending/` 删除

## 显式声明

当用户说"记住：xxx"或"这个项目总是 xxx"时，使用显式声明模式：

```
/evokit-learn "使用 uv 而非 pip"
```

AI 自动推断知识类型（convention/preference/architecture/workflow），生成结构化知识条目，直接写入 `knowledge/`。

## 架构型显式声明（必填推理标注）

当声明的知识属 `architecture`（结构 / 依赖 / 系统边界）时，**必须**在正文补 `## 影响范围`（依赖什么前提、影响哪些模块 / 服务 / 数据流），并尽量补 `## 相关决策`。

推荐措辞提示用户补充：

```
/evokit-learn "packages/api 是 packages/web 的上游"  （type=architecture）
→ 追问：影响范围？依赖哪些前提？相关决策？
```

若用户未提供影响范围，写入时补最小占位（`## 影响范围`），并主动询问用户补充具体内容。

## 知识识别信号

| 信号       | 示例模式                | 知识类型     |
| ---------- | ----------------------- | ------------ |
| 项目约定   | "我们项目总是…"         | convention   |
| 个人偏好   | "我更喜欢…"             | preference   |
| 架构决策   | "X 是 Y 的上游"         | architecture |
| 工作流规则 | "提交时…"               | workflow     |
| 纠正反馈   | "不对，应该是…"         | 按 content   |
| 隐性知识   | AI 多次犯错后被用户纠正 | convention   |

**排除**：一次性指令、通用编程常识、临时上下文、未确认猜测。

## 条目格式

每个知识条目是 `knowledge/{type}-{slug}.md`，包含 YAML frontmatter + 正文：

```yaml
---
id: convention-uv-pip
scope: personal
type: convention
source: conversation
confidence: 0.9
created: "2026-07-30"
---
## 内容
使用 uv 代替 pip
```

## 自检

**创建条目前：**
- 这是否为项目/个人专属知识？（排除通用编程常识）
- 是否已存在相同知识的条目？（检查 knowledge-index.md）

**创建条目后：**
- 文件名是否遵循 `{type}-{slug}.md` 格式？
- frontmatter 必填字段是否完整？
- 是否已更新 `knowledge-index.md`？
