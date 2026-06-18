# EvoKit 安装指南

## 前置要求

- **支持的 AI 编码助手：**
  - **Claude Code**（通过 `~/.claude/`）— ✅ 已完成
  - **Codex CLI**（通过 `~/.codex/`）— ✅ v0.3.0
  - **OpenCode / Aider** — 🔜 计划中
- **操作系统：** Linux、macOS 或 Windows（WSL/Git Bash）
- **Shell：** bash 4.0+
- **工具：** `curl` 或 `wget`（用于远程安装）

## 快速安装（推荐）

### npm（Node.js 18+）

```bash
# 通过 npm 全局安装
npm install -g @zythegit/evokit

# 为 Claude Code 初始化 EvoKit（默认）
evokit init

# 或为 Codex CLI 初始化
evokit init --adapter codex
```

### Homebrew

```bash
# 添加 tap 源并安装
brew tap zyTheGit/homebrew-evokit
brew install evokit
```

### 一行命令安装（curl | bash）— 经典方式

```bash
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash
```

安装指定版本：

```bash
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --branch v0.1.0
```

### 从本地克隆安装

```bash
git clone https://github.com/zyTheGit/EvoKit.git
cd EvoKit

# 运行安装程序（自动检测本地 template/ 目录）
bash bin/install.sh

# 或指定特定的模板目录
bash bin/install.sh --template /path/to/template
```

## 适配器特定安装

### Claude Code

安装到 `~/.claude/`，包含 settings.json hooks、markdown 规则和斜杠命令：

```bash
evokit init --adapter claude
```

安装完成后，启动 Claude Code 并运行 `/boot`。

### Codex CLI

安装到 `~/.codex/`，包含 hooks.json 生命周期钩子、Starlark 规则和 AGENTS.md：

```bash
evokit init --adapter codex
```

安装完成后，启动 Codex CLI — `/boot` 的等效操作会在每次会话启动时通过 SessionStart 钩子自动运行。运行 `evokit doctor` 验证健康状态。

Codex CLI 专属选项：

```bash
# 带验证
evokit init --adapter codex --verify

# 预览（空跑）
evokit init --adapter codex --dry-run
```

**注意：** Codex CLI 支持需要 Codex v0.1+ 并启用 hooks 功能（默认启用）。

## 安装选项

| 标志 | 描述 |
|------|------|
| `--dry-run` | 预览将要安装的内容，不修改任何文件 |
| `--template <path>` | 从本地模板目录安装，而非 GitHub |
| `--branch <name>` | 从指定分支或标签下载（如 `main`、`v0.1.0`、`develop`） |
| `--prefix <path>` | 安装到自定义前缀目录，而非 `~/.claude/` |

### 空跑模式

提交前预览安装效果：

```bash
bash bin/install.sh --dry-run
```

适用于 CI 验证或检查新版本会带来哪些变化。

## 手动安装

如果你倾向于手动安装，或想了解安装程序的具体操作：

```bash
# 1. 创建 .claude 目录结构
mkdir -p ~/.claude/{rules,agents,commands,memory,hooks}

# 2. 复制模板文件
cp template/CLAUDE.md ~/
cp template/MEMORY.md ~/.claude/
cp template/settings.json ~/.claude/
cp template/hooks/*.sh ~/.claude/hooks/
cp template/rules/*.md ~/.claude/rules/
cp template/agents/*.md ~/.claude/agents/
cp template/commands/*.md ~/.claude/commands/
cp template/memory/* ~/.claude/memory/

# 3. 替换 settings.json 中的路径占位符
sed -i 's|__HOME__|'"$HOME"'|g' ~/.claude/settings.json

# 4. 设置权限
chmod +x ~/.claude/hooks/*.sh
chmod 600 ~/.claude/memory/*.jsonl

# 5. 完成！启动 Claude Code 并运行 /boot
```

> **注意：** `__HOME__` 占位符仅在 `settings.json` 中使用（用于钩子命令路径）。钩子脚本本身原生使用 `$HOME`，无需替换。

## 验证安装

启动 Claude Code 并运行：

```
/boot
```

预期输出：

```
[EVOLUTION BOOT] ═══════════════════════
  ✓ .claude/rules/
  ✓ .claude/agents/
  ✓ .claude/commands/
  ✓ .claude/memory/
  ✓ .claude/hooks/
  ✓ CLAUDE.md: N 行（限制 150）
  ✓ learned-rules.md: N 行（限制 50）
═══════════════════════════════════════
```

## 安装内容

安装完成后，你的 `~/.claude/` 将包含以下内容：

```
~/.claude/
├── MEMORY.md              # 记忆索引（Claude 只读）
├── settings.json          # 钩子配置（路径已解析）
├── rules/
│   ├── coding.md          # 编码规范
│   ├── core-invariants.md # 不可变系统不变性
│   └── security.md        # 安全规则
├── agents/
│   ├── architect.md       # 规划代理定义
│   └── reviewer.md        # 代码审查代理定义
├── commands/
│   ├── boot.md            # /boot — 系统完整性验证
│   ├── evolve.md          # /evolve — 规则晋升审计
│   └── review.md          # /review — 代码审查运行器
├── hooks/
│   ├── session-start.sh   # 会话启动时运行（启动验证）
│   ├── stop.sh            # 会话结束时运行（指标记录）
│   └── export-system.sh   # 导出系统状态供调试使用
└── memory/
    ├── README.md          # 记忆系统文档
    ├── learned-rules.md   # 已晋升的永久规则（≤50 行）
    ├── evolution-log.md   # /evolve 审计追踪
    ├── corrections.jsonl  # 用户纠正（仅追加）
    ├── observations.jsonl # 自动检测的模式（仅追加）
    ├── violations.jsonl   # /boot 发现的规则违反记录
    └── sessions.jsonl     # Stop 钩子记录的会话指标
```

而 `~/CLAUDE.md` 将包含 L1 认知核心。

## 平台特定说明

### Linux
一切开箱即用。

### macOS
一切开箱即用。

### Windows（WSL）
1. 安装 WSL：`wsl --install`（管理员 PowerShell）
2. 在 WSL 内安装 Claude Code
3. 在 WSL 内运行安装程序
4. **注意：** 通过 `curl` 的一行命令安装可在 WSL 中正常工作；请避免在 Windows 宿主机上使用 Claude Code 配合此安装程序

### Windows（Git Bash）
1. 从 https://git-scm.com 安装 Git Bash
2. 打开 Git Bash
3. 运行安装程序
4. **注意：** 确保 `bash` 在 `/bin/bash` 可用（Git Bash 默认如此）

## 故障排除

### "hooks must be an array of matchers"
**问题：** `settings.json` 中的 hooks 使用了旧格式（v0.1.0 之前的版本）。
**修复：** 使用模板中的 `settings.json` 或重新运行安装程序：

```bash
bash bin/install.sh --template template
```

### "Permission denied" 钩子无执行权限
**问题：** 钩子脚本没有可执行权限。
**修复：**

```bash
chmod +x ~/.claude/hooks/*.sh
```

### /boot 命令未找到
**问题：** 命令未正确安装。
**修复：** 确认命令文件存在，然后重启 Claude Code：

```bash
ls -la ~/.claude/commands/boot.md   # 应存在
```

### SessionStart 钩子未运行
**问题：** `settings.json` 中的钩子路径与实际文件位置不匹配。
**修复：** 检查 `~/.claude/settings.json` 中的 `__HOME__` 是否已正确解析为你的实际主目录：

```bash
grep hooks ~/.claude/settings.json
```

命令路径应类似于 `/home/user/.claude/hooks/session-start.sh`，而不是 `__HOME__/.claude/hooks/...`。

### 钩子使用 `uv` 但未安装
**问题：** `stop.sh` 钩子优先尝试 `uv run --isolated python3` 进行 JSON 处理，失败时回退到 `python3`。
**修复：** 安装 `uv`（推荐）或确保 `python3` 可用：

```bash
# 安装 uv（推荐）
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### npm 安装后提示 `evokit: command not found`
**问题：** `evokit` 二进制文件已安装但不在系统 PATH 中。

**修复：** 检查你的安装类型：

```bash
# 场景 1：本地安装（没有 -g）— 使用 npx
npx evokit init

# 场景 2：全局安装但 PATH 缺失
# 找到 npm 全局 bin 目录并将其添加到 PATH
npm root -g
# 然后添加到 ~/.bashrc 或 ~/.zshrc：
export PATH="$(npm root -g)/../bin:$PATH"
```

## 升级

升级现有安装只需重新运行安装程序 — 它将：

- **保留** 你现有的 `CLAUDE.md`、`settings.json` 和记忆数据（不会被覆盖）
- **更新** 钩子、规则、代理和命令到最新版本
- **创建** 任何新增的文件

```bash
# 从 GitHub 升级
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash

# 从本地仓库升级
cd EvoKit && git pull && bash bin/install.sh
```

升级后，运行 `/boot` 验证一切正常。
