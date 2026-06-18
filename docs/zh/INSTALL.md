# EvoKit 安装指南

## 前置要求

- **支持的 AI 编码助手：**
  - **Claude Code**（通过 `~/.claude/`）— ✅ v0.4+
  - **Codex CLI**（通过 `~/.codex/`）— ✅ v0.3.0+
  - **OpenCode**（通过 `~/.config/opencode/` + `.opencode/`）— ✅ v0.5.0+
- **操作系统：** Linux、macOS 或 Windows（WSL/Git Bash）
- **Shell：** bash 4.0+
- **工具：** `curl` 或 `wget`（用于远程安装）

## 快速安装（推荐）

### npm（Node.js 18+）

```bash
# 通过 npm 全局安装
npm install -g @zythegit/evokit

# 交互式选择——选择要配置哪些助手
evokit install

# 或直接指定助手
evokit install --adapter claude
evokit install --adapter claude,codex
evokit install --adapter claude,opencode
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

> **注意：** 通过 pipe（`curl | bash`）安装时，stdin 不是终端，无法显示交互式适配器选
> 择菜单。请使用 `--adapter` 参数指定助手：

```bash
# 仅为 Claude Code 安装（pipe 安全）
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --adapter claude

# 为多个助手安装
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --adapter claude,codex,opencode
```

安装指定版本：

```bash
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --branch v0.1.0 --adapter claude
```

### 从本地克隆安装

```bash
git clone https://github.com/zyTheGit/EvoKit.git
cd EvoKit

# 交互式选择（需要终端）
bash bin/install.sh

# 或直接指定助手
bash bin/install.sh --adapter claude,codex,opencode
```

## 适配器特定安装

### Claude Code

安装到 `~/.claude/`，包含 settings.json hooks、markdown 规则和斜杠命令：

```bash
evokit install --adapter claude
```

安装完成后，启动 Claude Code 并运行 `/boot`。

**安装的文件：**

```
~/.claude/
├── MEMORY.md              # 记忆索引
├── settings.json          # 钩子配置
├── rules/                 # 路径作用域规则（编码、安全、不变性）
├── agents/                # 子代理定义（架构师、审查者）
├── commands/              # 斜杠命令（/boot、/evolve、/review）
├── hooks/                 # 生命周期钩子（session-start、stop、export-system）
├── skills/                # 可复用技能
└── memory/                # 学习数据（纠正、观察、规则）
~/CLAUDE.md                # L1 认知核心
```

### Codex CLI

安装到 `~/.codex/`，包含 hooks.json 生命周期钩子、Starlark 规则和 AGENTS.md：

```bash
evokit install --adapter codex
```

安装完成后，启动 Codex CLI — 启动验证会在每次会话启动时通过 PreToolUse 钩子自动运行。运行 `evokit doctor` 验证健康状态。

**安装的文件：**

```
~/.codex/
├── AGENTS.md              # L1 认知核心
├── hooks.json             # 钩子配置
├── rules/                 # Starlark 规则
├── hooks-scripts/         # 生命周期 shell 钩子
└── memory/                # 学习数据
```

Codex CLI 专属选项：

```bash
# 带验证
evokit install --adapter codex --verify

# 预览（空跑）
evokit install --adapter codex --dry-run
```

**注意：** Codex CLI 支持需要 Codex v0.1+ 并启用 hooks 功能（默认启用）。

### OpenCode CLI

安装全局配置到 `~/.config/opencode/`，项目级别工具到 `.opencode/`：

```bash
evokit install --adapter opencode

# 指定项目目录（默认为当前目录）
evokit install --adapter opencode --project-dir /path/to/project
```

**全局配置（`~/.config/opencode/`）：**

```
~/.config/opencode/
├── AGENTS.md              # L1 认知核心（与项目级合并使用）
├── opencode.json          # 全局配置
├── agent/                 # 子代理定义（架构师、审查者）
├── memory/                # 学习数据（纠正、观察、规则）
└── skills/                # 可复用技能
```

**项目级别（`.opencode/`）：**

```
.opencode/
├── tools/                 # 自定义 EvoKit 工具（evokit-boot、evokit-evolve 等）
├── agent/                 # 项目级代理覆盖
└── memory/                # 项目级记忆覆盖
```

安装完成后，启动 OpenCode 并调用 `evokit-boot` 工具验证。

## 安装选项

| 标志 | 描述 |
|------|------|
| `--adapter <names>` | 逗号分隔的适配器名称：`claude`、`codex`、`opencode`。省略则进入交互式选择。 |
| `--dry-run` | 预览将要安装的内容，不修改任何文件 |
| `--template <path>` | 从本地模板目录安装，而非 GitHub |
| `--branch <name>` | 从指定分支或标签下载（如 `main`、`v0.1.0`） |
| `--verify` | 安装后运行启动验证 |
| `--project-dir <path>` | 项目目录（OpenCode 用于创建 `.opencode/`） |

### 交互式 vs 非交互式

- **终端（交互式）：** 直接运行 `evokit install` 或 `bash bin/install.sh`，会弹出多选菜单选择要配置的 AI 助手。
- **Pipe / CI（非交互式）：** 使用 `--adapter` 参数指定助手，安装程序不会弹出提示。

```bash
# 交互式（需要终端）
bash bin/install.sh

# 非交互式（pipe 安全、CI 安全）
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --adapter claude
```

### 空跑模式

提交前预览安装效果：

```bash
bash bin/install.sh --dry-run --adapter claude
```

适用于 CI 验证或检查新版本会带来哪些变化。

## 手动安装

如果你倾向于手动安装，或想了解安装程序的具体操作：

### Claude Code

```bash
# 1. 创建 .claude 目录结构
mkdir -p ~/.claude/{rules,agents,commands,memory,hooks,skills}

# 2. 复制模板文件
cp template/CLAUDE.md ~/
cp template/MEMORY.md ~/.claude/
cp template/settings.json ~/.claude/
cp template/hooks/*.sh ~/.claude/hooks/
cp template/rules/*.md ~/.claude/rules/
cp template/agents/*.md ~/.claude/agents/
cp template/commands/*.md ~/.claude/commands/
cp -r template/skills/* ~/.claude/skills/
cp template/memory/* ~/.claude/memory/

# 3. 替换 settings.json 中的路径占位符
sed -i 's|__HOME__|'"$HOME"'|g' ~/.claude/settings.json

# 4. 设置权限
chmod +x ~/.claude/hooks/*.sh
chmod 600 ~/.claude/memory/*.jsonl

# 5. 完成！启动 Claude Code 并运行 /boot
```

> **注意：** `__HOME__` 占位符仅在 `settings.json` 中使用（用于钩子命令路径）。钩子脚本本身原生使用 `$HOME`，无需替换。

### OpenCode

```bash
# 1. 创建全局配置目录
mkdir -p ~/.config/opencode/{agent,memory,skills}

# 2. 复制全局配置文件
cp template/opencode/AGENTS.md ~/.config/opencode/
cp template/opencode/opencode.json ~/.config/opencode/
cp template/opencode/agent/*.md ~/.config/opencode/agent/
cp template/opencode/memory/* ~/.config/opencode/memory/

# 3. 替换路径占位符
sed -i 's|__HOME__|'"$HOME"'|g' ~/.config/opencode/opencode.json

# 4. 创建项目级目录
mkdir -p .opencode/{tools,agent,memory}

# 5. 复制项目级工具
cp template/opencode/tools/*.ts .opencode/tools/

# 6. 复制项目根文件
cp template/opencode/AGENTS.md ./
cp template/opencode/opencode.json ./
sed -i 's|__HOME__|'"$HOME"'|g' opencode.json
```

## 验证安装

### Claude Code

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

### OpenCode

启动 OpenCode 并调用 `evokit-boot` 工具。输出显示全局配置、项目文件和记忆数据的状态。

## 平台特定说明

### Linux
一切开箱即用。

### macOS
一切开箱即用。

### Windows（WSL）
1. 安装 WSL：`wsl --install`（管理员 PowerShell）
2. 在 WSL 内安装 Node.js 和 AI 编码助手
3. 在 WSL 内运行安装程序

**Pipe 安装说明：** 一行命令 `curl ... | bash` 在 WSL 上可用，但由于 stdin 是 pipe，
无法显示交互式菜单。请使用 `--adapter` 参数：

```bash
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --adapter claude
```

如需交互式选择，先下载脚本再运行：

```bash
wget -qO- https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh > /tmp/evokit.sh
bash /tmp/evokit.sh
```

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
bash bin/install.sh --template template --adapter claude
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
npx evokit install

# 场景 2：全局安装但 PATH 缺失
# 找到 npm 全局 bin 目录并将其添加到 PATH
npm root -g
# 然后添加到 ~/.bashrc 或 ~/.zshrc：
export PATH="$(npm root -g)/../bin:$PATH"
```

## 升级

升级现有安装只需重新运行安装程序 — 它将：

- **保留** 你现有的配置和记忆数据（不会被覆盖）
- **更新** 钩子、规则、代理和命令到最新版本
- **创建** 任何新增的文件

```bash
# 从 GitHub 升级
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --adapter claude

# 从本地仓库升级
cd EvoKit && git pull && bash bin/install.sh
```

升级后，运行 `/boot`（Claude Code）或 `evokit-boot`（OpenCode）验证一切正常。
