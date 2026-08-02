# EvoKit — 项目上下文引擎

本项目上下文引擎让 Pi 秒懂项目，持久化 AI 不可能知道的项目/个人专属知识。

## 核心机制

1. **对话提取** — AI 识别项目知识，静默写入 `.pending/`，用户确认后持久化
2. **知识索引** — `knowledge-index.md` 始终加载，条目按需加载
3. **过期检测** — 定期检查知识条目是否仍然适用

## 命令 / 工具

- `evokit-boot` — 知识库完整性深度检查
- `evokit learn` — 回顾对话提取知识 / 显式声明知识
- `evokit review` — 复审过期知识（confidence ≤ 0.5）

## 思维框架

1. **理解** — 读取相关文件，确认变更范围
2. **规划** — 复杂任务先列方案，简单任务直接执行
3. **验证** — 运行测试，确认无回归
4. **学习** — 识别项目知识，静默写入 `.pending/`，用户确认后持久化

### 自检

**行动前：**

- 已读取要修改的文件？
- 理解现有模式？
- 有可复用的工具/约定？

**变更后：**

- 测试通过？无 TODO/FIXME/console.log/debugger 残留？
- 识别到项目知识？→ 静默写入 `<project>/.evokit/.pending/`

## 知识系统

知识条目存储在统一知识根下（4 个助手共享，agent 无关），结构与 `CONTEXT.md` 一致：

- **项目知识**：`<project>/.evokit/`（随 git 走，可提交）
- **个人知识**：`~/.evokit/knowledge/`（跨项目共享）

### 目录布局

```
<project>/.evokit/        # 项目知识根
  knowledge-index.md      # 索引（始终加载）
  knowledge/              # 条目（按需加载）
  .pending/               # 待确认条目

~/.evokit/knowledge/      # 个人知识根
  knowledge-index.md
  knowledge/
  .pending/
```

### 知识类型

| 类型         | 说明       | 示例                          |
| ------------ | ---------- | ----------------------------- |
| convention   | 项目约定   | "使用 Result<T> 而非 throw"   |
| preference   | 个人偏好   | "使用 uv 而非 pip"            |
| architecture | 架构决策   | "packages/api 是上游"         |
| workflow     | 工作流规则 | "commit 用 conventional 格式" |

### 知识识别

对话中识别到项目/个人专属知识时，静默写入当前项目 `<project>/.evokit/.pending/`，不在回复中提及。用户确认后入 `knowledge/`（个人入 `~/.evokit/knowledge/`）。

### 架构型条目（索引带 🏛 标记）

规则型（convention/preference/workflow）摘要即知识，看索引即可；**架构型（architecture）摘要不足** —— 讨论模块依赖/服务划分/数据流时，索引见到 `🏛` 条目应打开对应 `knowledge/` 全文追索，而非只看摘要。

### 作用域

| 层级 | 位置                     | 说明         |
| ---- | ------------------------ | ------------ |
| 项目 | `<project>/.evokit/`     | 跟项目走     |
| 个人 | `~/.evokit/knowledge/`   | 跨项目共享   |

## 会话末提示

`session_shutdown` 时扩展会检查 `.pending/`；非空则提示运行 `evokit learn` 确认。

## EvoKit 扩展

扩展安装在 `~/.pi/agent/extensions/`，处理知识生命周期：

| Extension            | Purpose                                                        | 触发        |
| -------------------- | -------------------------------------------------------------- | ----------- |
| **evokit-lifecycle** | session_start→boot 检查、session_shutdown→提示待确认           | ✅ pi.on()  |
| **evokit-boot**      | 知识库完整性深度检查命令                                        | evokit-boot |
| **evokit-learn**     | 确认背书 / 显式声明知识（调 `evokit learn`）                    | evokit learn  |

## 完整性规则

- **先读后改** — 未读取的文件不编辑
- **不删未授权文件** — 用户未要求的不删除
- **不硬编码个人路径** — 模板用 `__HOME__` 占位符
- **不跳过测试** — 变更后必须验证
- **错误如实报告** — 不假装成功，不静默重试
- **多方案先问** — 2+ 合理方案时列出让用户决定
