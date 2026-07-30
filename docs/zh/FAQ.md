# 常见问题解答

## 通用问题

### 什么是 EvoKit？

EvoKit 是一个开源的**项目上下文引擎**，让 AI 编程助手（Claude Code、Codex 等）能够持久化项目/个人专属知识，在跨会话中保持对项目的理解。它通过对话提取知识、知识索引和过期检测，让 AI 秒懂项目。

### 这是 Anthropic 的官方产品吗？

不是。EvoKit 是一个社区项目，通过 Claude Code 的钩子和配置系统扩展其功能。它与 Anthropic 没有关联。

### EvoKit 会把我的数据发送到任何地方吗？

**不会。** 所有数据都保存在本地的 `evokit/` 知识库目录中（如 `~/.claude/memory/evokit/`）。无云端、无遥测、不进行任何外部 API 调用。

## 知识系统

### AI 如何学习？

EvoKit 通过**对话提取**机制工作：AI 在对话中识别项目/个人专属知识（项目约定、个人偏好、架构决策等），静默写入 `.pending/` 目录。用户通过 `/evokit-learn` 确认后，知识持久化到 `knowledge/` 目录并更新索引。用户也可以通过 `/evokit-learn "内容"` 显式声明知识。

### 知识有哪些类型？

| 类型         | 说明       | 示例                          |
| ------------ | ---------- | ----------------------------- |
| convention   | 项目约定   | "使用 Result<T> 而非 throw"   |
| preference   | 个人偏好   | "使用 uv 而非 pip"            |
| architecture | 架构决策   | "packages/api 是上游"         |
| workflow     | 工作流规则 | "commit 用 conventional 格式" |

### 如何使用 /evokit-learn？

- `/evokit-learn` — 展示 `.pending/` 中的待确认条目 + 回顾对话中识别到的新知识
- `/evokit-learn "内容"` — 显式声明知识，直接写入 `knowledge/`

**待确认条目确认流程：**

1. 运行 `/evokit-learn`，展示所有待确认条目
2. 用户在对话中回复（自然语言），例如："确认 1 和 3，拒绝 2"
3. 确认的条目移入 `knowledge/` 并更新 `knowledge-index.md`；拒绝的条目从 `.pending/` 删除

### 如何确认待确认知识？

运行 `/evokit-learn`，它会展示所有待确认条目。你可以：
- 用自然语言确认或拒绝（如"确认 1 和 3，拒绝 2"）
- 逐条审查并决定是否接受

确认的条目会从 `.pending/` 移入 `knowledge/` 并更新索引；拒绝的条目会被删除。

### 我纠正了 AI，但什么也没发生

EvoKit 提供的是知识持久化的**基础设施**。知识的实际提取取决于 AI 是否遵循 CLAUDE.md 中的知识识别协议。如果知识未被记录，请检查：

1. SessionStart 钩子是否在运行（`/evokit-boot` 正常工作）
2. `evokit/.pending/` 目录是否存在
3. 您是否运行了兼容版本的 Claude Code

### 如何运行知识库完整性检查？

```
/evokit-boot
```

这会对知识库执行深度完整性检查，包括目录结构、索引格式、条目完整性、frontmatter 合法性和待确认条目。SessionStart 钩子会在每次会话启动时自动执行快速检查。

## 安装

### 我看到 "hooks must be an array of matchers" 错误

这意味着您在 `settings.json` 中使用了旧的钩子格式。请使用模板中的 `settings.json`，或查看 `INSTALL.md` 了解正确的格式。

### 我能在 Windows 上安装吗？

可以 — 通过 WSL 或 Git Bash。模板钩子使用 bash 脚本，这两种环境都能运行。

### 我已经有了 .claude/ 目录，安装程序会破坏它吗？

安装程序会先将您现有的配置备份到 `~/.claude/backups/`。现有的 `CLAUDE.md` 和 `settings.json` 会被保留 — 仅添加缺失的内容。

### 如何从 v0.x 迁移到 v1.0？

运行 `evokit migrate` 命令。它会检测旧数据文件（`learned-rules.md`、`corrections.jsonl`、`observations.jsonl` 等），将可迁移的规则转换为 v1.0 知识条目格式，并归档旧文件到 `evokit/archive/v0/`。使用 `--dry-run` 预览迁移结果。

## 多智能体

### EvoKit 支持 Codex 吗？

**支持！** Codex CLI 适配器从 v0.3.0 开始可用。使用以下命令安装：

```bash
evokit install --adapter codex
```

这会将 EvoKit 模板安装到 `~/.codex/`，配置以下内容：

- `AGENTS.md` — 包含思维框架和知识协议的认知核心
- `hooks.json` — 生命周期钩子（SessionStart、Stop、PreToolUse）
- `rules/` — Starlark 安全规则
- 独立的 `~/.codex/memory/evokit/` 知识库目录

### EvoKit 支持 OpenCode 吗？

**支持！** OpenCode CLI 适配器从 v0.5.0 开始可用。使用以下命令安装：

```bash
evokit install --adapter opencode
```

这会将 EvoKit 模板安装到项目目录，配置自定义工具（`evokit-boot.ts`、`evokit-learn.ts` 等）替代生命周期钩子。OpenCode 拥有独立的 `~/.config/opencode/memory/evokit/` 知识库目录。

### EvoKit 支持 Pi CLI 吗？

**支持！** Pi CLI 适配器从 v0.6.0 开始可用。使用以下命令安装：

```bash
evokit install --adapter pi
```

这会将 EvoKit 模板安装到 `~/.pi/agent/`，配置 TypeScript 扩展（`evokit-lifecycle.ts` 等）处理生命周期事件。Pi CLI 拥有独立的 `~/.pi/agent/memory/evokit/` 知识库目录。

### 不同 AI 助手之间共享知识吗？

**不共享。** 每个适配器拥有独立的 `evokit/` 知识库目录（如 `~/.claude/memory/evokit/`、`~/.codex/memory/evokit/`、`~/.config/opencode/memory/evokit/`）。这确保了各助手的知识互不干扰。如需跨助手共享特定知识，可以使用 `/evokit-learn "内容"` 在另一个助手中手动声明。

### 如何检查我的安装是否健康？

```bash
evokit doctor --adapter claude
# 或检查所有适配器：
evokit doctor --adapter all
```

也可以在 Claude Code 中运行 `/evokit-boot` 进行深度知识库完整性检查。

## 故障排除

### SessionStart 钩子没有运行

检查 `~/.claude/settings.json` — 确认钩子命令路径存在且正确。修改后重启 Claude Code。

### /evokit-boot 显示缺少目录

安装程序可能没有复制所有文件。请重新运行安装程序或手动检查每个目录。

### 迁移过程中路径未替换

如果您在钩子或设置中看到旧路径，请手动运行路径修复步骤：

```bash
grep -r "/home/olduser" ~/.claude/  # 查找旧路径
sed -i 's|/home/olduser|/home/newuser|g' ~/.claude/settings.json
sed -i 's|/home/olduser|/home/newuser|g' ~/.claude/hooks/*.sh
```

### 权限问题

```bash
chmod +x ~/.claude/hooks/*.sh
```

### 旧版数据如何处理？

如果你从 v0.x 升级，旧数据文件（`learned-rules.md`、`corrections.jsonl`、`observations.jsonl`）需要通过 `evokit migrate` 迁移到 v1.0 知识条目格式。迁移后旧文件归档到 `evokit/archive/v0/`，不会删除。
