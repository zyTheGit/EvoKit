# 常见问题解答

## 通用问题

### 什么是 EvoKit？
EvoKit 是一个开源框架，能让 AI 编程助手（Claude Code、Codex 等）具备跨会话从纠正中学习的能力。它将知识持久化到文件中，使 AI 随着时间的推移不断进步。

### 这是 Anthropic 的官方产品吗？
不是。EvoKit 是一个社区项目，通过 Claude Code 的钩子和配置系统扩展其功能。它与 Anthropic 没有关联。

### EvoKit 会把我的数据发送到任何地方吗？
**不会。** 所有数据都保存在您的 `~/.claude/memory/` 目录中。无云端、无遥测、进化系统不进行任何外部 API 调用。

## 学习系统

### AI 如何学习？
每次您纠正 AI 时，纠正记录都会被保存在 `corrections.jsonl` 中。同一模式出现 2 次以上后会被晋升到 `learned-rules.md`。经过 10 个以上会话的验证后，它可以毕业成为永久规则。

### 我纠正了 AI，但什么也没发生
EvoKit 提供的是学习所需的**基础设施**。纠正的实际记录取决于 Claude 是否遵循 CLAUDE.md 协议。如果纠正未被记录，请检查：

1. SessionStart 钩子是否在运行（`/boot` 正常工作）
2. `corrections.jsonl` 是否存在于 `~/.claude/memory/`
3. 您是否运行了兼容版本的 Claude Code

### 如何运行进化审计？
```
/evolve
```

每约 10 个会话运行一次，以晋升模式并修剪过时的规则。

### 我的 learned-rules.md 已满
运行 `/evolve`。它会建议哪些规则需要修剪或毕业。

## 安装

### 我看到 "hooks must be an array of matchers" 错误
这意味着您在 `settings.json` 中使用了旧的钩子格式。请使用模板中的 `settings.json`，或查看 `INSTALL.md` 了解正确的格式。

### 我能在 Windows 上安装吗？
可以 — 通过 WSL 或 Git Bash。模板钩子使用 bash 脚本，这两种环境都能运行。

### 我已经有了 .claude/ 目录，安装程序会破坏它吗？
安装程序会先将您现有的配置备份到 `~/.claude/backups/`。现有的 `CLAUDE.md` 和 `settings.json` 会被保留 — 仅添加缺失的内容。

## 多智能体

### EvoKit 支持 Codex 吗？
**支持！** Codex CLI 适配器从 v0.3.0 开始可用。使用以下命令安装：

```bash
evokit init --adapter codex
```

这会将 EvoKit 模板安装到 `~/.codex/`，配置以下内容：
- `AGENTS.md` — 包含思维框架和进化协议的认知核心
- `hooks.json` — 生命周期钩子（SessionStart、Stop、PreToolUse）
- `rules/` — Starlark 安全规则
- 共享的 `~/.claude/memory/` 学习数据目录

在 Codex CLI 会话中做出的纠正会保存到相同的共享内存中，同时惠及 Codex 和 Claude Code。

### EvoKit 支持 OpenCode 吗？
尚未支持。OpenCode 适配器计划在 v0.4.0 中推出。

### 我能在不同的 AI 助手之间共享同一份学习数据吗？
**可以！** 所有适配器共享同一个 `~/.claude/memory/` 目录。每条会话记录都按助手标记（`"assistant": "codex"` 或 `"assistant": "claude"`），因此从一个助手获取的纠正会使所有助手受益。

### 如何检查我的 Codex 安装是否健康？
```bash
evokit doctor --adapter codex
# 或检查所有适配器：
evokit doctor --adapter all
```

## 故障排除

### SessionStart 钩子没有运行
检查 `~/.claude/settings.json` — 确认钩子命令路径存在且正确。修改后重启 Claude Code。

### /boot 显示缺少目录
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
chmod 600 ~/.claude/memory/*.jsonl
```
