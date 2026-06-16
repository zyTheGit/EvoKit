<div align="center">

[**English**](README.en.md) · [**中文**](README.md)

<br>

# 🧠⚡ EvoKit

**AI 编程助手的自进化框架**

*让 AI 编程助手越用越聪明 — 跨会话持久化纠错、观察和规则*

[![Version](https://img.shields.io/github/v/release/zyTheGit/EvoKit?include_prereleases&style=flat-square&label=版本)](CHANGELOG.md)
[![License](https://img.shields.io/github/license/zyTheGit/EvoKit?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/zyTheGit/EvoKit?style=flat-square)](https://github.com/zyTheGit/EvoKit/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/zyTheGit/EvoKit/ci.yml?branch=main&style=flat-square)](https://github.com/zyTheGit/EvoKit/actions)
[![GitHub issues](https://img.shields.io/github/issues/zyTheGit/EvoKit?style=flat-square)](https://github.com/zyTheGit/EvoKit/issues)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20WSL-blue?style=flat-square)]()
[![npm](https://img.shields.io/npm/v/%40zythegit%2Fevokit?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@zythegit/evokit)

---

**EvoKit** 是一个开源的 **自进化系统框架**，专为 AI 编程助手设计。它能让 Claude Code、Codex、OpenCode 等 AI 工具**越用越聪明**——通过跨会话持久化纠错、观察和规则，实现知识的自动积累与晋升。

| 核心思想 | 说明 |
|---------|------|
| 🧠 **跨会话记忆** | 纠错和观察跨会话保留，永不丢失 |
| 📈 **自动晋升** | 重复出现的模式自动晋升为永久规则 |
| 🔌 **Hook 驱动** | 会话生命周期全自动管理 |
| 🚚 **一键迁移** | 跨机器无缝迁移学习数据 |
| 🔒 **隐私优先** | 所有数据本地存储，无云端、无遥测 |
| 🤖 **多智能体** | 适配器架构，支持 Claude Code / Codex / OpenCode / Aider |

</div>

---

## 预览

```
╔═══════════════════════════════════════════╗
║   EvoKit — Self-Evolving System Install   ║
╚═══════════════════════════════════════════╝

  ┌─────────────────────────────────────────────┐
  │  Select AI assistants to configure:          │
  ├─────────────────────────────────────────────┤
  │                                             │
  │  [1] Claude Code (recommended)  ~/.claude/  │
  │  [2] Codex CLI (v0.3.0)         ~/.codex/   │
  │  [3] OpenCode CLI (v0.4.0)      .opencode/  │
  │                                             │
  │  [4] All of the above                       │
  │  [5] Codex CLI + OpenCode                   │
  │                                             │
  │  Enter numbers separated by spaces.          │
  │  Press ENTER for default: [1] Claude Code    │
  └─────────────────────────────────────────────┘

  → 1

📁 Creating directories...
  ✓ .claude/rules/    ✓ .claude/agents/
  ✓ .claude/commands/ ✓ .claude/memory/
  ✓ .claude/hooks/
📄 Installing template files...
  ✓ CLAUDE.md    ✓ MEMORY.md
  ✓ settings.json   ✓ hooks/  ✓ rules/
  ✓ agents/      ✓ commands/
🔒 Setting permissions...
✅ EvoKit installed successfully!
```

| 🔍 `/boot` | 🔄 `/evolve` |
|:--:|:--:|
| <pre>[EVOLUTION BOOT] ═══════════════════════<br>  Self-Evolving System: checking integrity...<br>  ✓ .claude/rules/<br>  ✓ .claude/agents/<br>  ✓ .claude/commands/<br>  ✓ .claude/memory/<br>  ✓ .claude/hooks/<br>  ✓ CLAUDE.md: N lines (limit 150)<br>  ✓ learned-rules.md: N lines (limit 50)<br>═══════════════════════════════════════</pre> | <pre>[EVOLUTION AUDIT] ═════════════════════<br>  Rotating: corrections.jsonl (12 kept, 5 archived)<br>  Rotating: observations.jsonl (8 kept, 3 archived)<br>  Analyzing corrections...<br>  ✓ Promoted: "use uv instead of pip" (2×)<br>  ✓ Promoted: "no console.log in prod" (3×)<br>  ✓ learned-rules.md: 6 lines (limit 50)<br>═══════════════════════════════════════</pre> |
| 📦 `export-system.sh` | |
| <pre>📦 Creating migration package...<br>  ✓ system files copied<br>  ✓ rotation applied<br>  ✓ install.sh generated<br>🗜️  Packaging...<br>✅ claude-evolution-20260611.tar.gz<br><br>📊 Data overview:<br>  corrections:  12 entries<br>  observations: 8 entries<br>  learned-rules: 6 lines</pre> | |

---

## 架构

EvoKit 采用 **4 层架构**，逐层精化 AI 行为——从通用原则到具体的已学规则。

```
┌─────────────────────────────────────────────────┐
│  L1: 认知核心 (CLAUDE.md)                        │
│  思考框架 · 进化协议                              │
│  每次会话加载 · 上限 150 行                        │
├─────────────────────────────────────────────────┤
│  L2: 路径规则 (.claude/rules/)                   │
│  按编辑文件路径自动加载                             │
│  安全规则 · 编码规范 · 核心不变量                   │
├─────────────────────────────────────────────────┤
│  L3: 子智能体 (.claude/agents/)                  │
│  专业化智能体定义                                  │
│  architect（规划师）· reviewer（审查员）             │
├─────────────────────────────────────────────────┤
│  L4: 进化引擎 (.claude/memory/)                  │
│  纠错 → 观察 → 晋升 → 审计                        │
│  命令: /boot · /evolve · /review                 │
└─────────────────────────────────────────────────┘
```

### 进化流水线

```
用户纠正 AI
      ↓
corrections.jsonl ← 记录（仅追加，永不删除）
      ↓ (同一模式出现 2+ 次)
learned-rules.md ← 晋升带自动化验证行
      ↓ (10+ 会话通过验证)
CLAUDE.md / rules/ ← 毕业为永久规则
      ↓
被拒规则 → evolution-log.md（永不重提）
```

详见 [ARCHITECTURE.md](docs/ARCHITECTURE.md) 和 [EVOLUTION.md](docs/EVOLUTION.md)。

---

## 快速开始

### 前置条件

- [Claude Code](https://claude.ai/code)（或其他支持钩子的 AI 编程助手）
- **bash 4.0+**（Linux / macOS / WSL / Git Bash）
- **Node.js 18+**（用于 npm 安装或 CLI 使用）

### 安装

选择以下任意一种方式：

```bash
# npm 安装（推荐）
npm install -g @zythegit/evokit
evokit init

# Homebrew 安装
brew tap zyTheGit/homebrew-evokit
brew install evokit

# 一行命令安装（交互式选择适配器）
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash

# 指定适配器（跳过交互式菜单）
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash -s -- --adapter claude,codex

# 从 Git 克隆安装
git clone https://github.com/zyTheGit/EvoKit.git
cd EvoKit
bash bin/install.sh
```

安装过程中会显示交互式菜单，你可以选择安装到以下 AI 助手：
- **Claude Code**（推荐）— `~/.claude/`
- **Codex CLI** — `~/.codex/`
- **OpenCode CLI** — `.opencode/`（项目级）
- 也支持多选：输入 `1 3` 同时安装 Claude Code + OpenCode

也可以使用 `--adapter` 参数跳过菜单直接指定（适用于 CI 自动化）：

### CLI 命令参考

安装后可使用 `evokit` 命令管理系统：

| 命令 | 功能 |
|------|------|
| `evokit init` | 初始化 EvoKit（安装模板到 `~/.claude/`） |
| `evokit evolve` | 运行进化审计（旋转归档、晋升模式、修剪规则） |
| `evokit export` | 导出系统状态（用于跨机迁移） |
| `evokit import <包>` | 导入迁移包 |
| `evokit doctor` | 系统健康检查 |

```bash
# 查看所有命令
evokit --help

# 查看具体命令帮助
evokit init --help
evokit evolve --help
```

### 验证

启动 Claude Code，运行以下命令：

```
/boot
```

预期输出：

```
[EVOLUTION BOOT] ═══════════════════════
  Self-Evolving System: checking integrity...
  ✓ .claude/rules/
  ✓ .claude/agents/
  ✓ .claude/commands/
  ✓ .claude/memory/
  ✓ .claude/hooks/
  ✓ CLAUDE.md: N lines (limit 150)
  ✓ learned-rules.md: N lines (limit 50)
═══════════════════════════════════════
```

---

## 功能详解

### 内置命令

| 命令 | 运行时机 | 功能 |
|------|---------|------|
| `/boot` | 每次会话启动 | 验证系统完整性 |
| `/evolve` | 每 ~10 次会话 | 晋升模式、修剪过时规则 |
| `/review` | 提交代码前 | 通过审查员智能体进行代码审查 |

### 核心文件

| 文件 | 作用 |
|------|------|
| `CLAUDE.md` | 认知核心 — 思考框架、进化协议（上限 150 行） |
| `.claude/rules/` | 路径规则（安全、编码、不变量） |
| `.claude/agents/` | 子智能体定义（规划师、审查员） |
| `.claude/commands/` | 斜杠命令（/boot, /evolve, /review） |
| `.claude/memory/` | 学习数据 — 纠错、观察、已学规则、会话记录 |
| `.claude/hooks/` | 会话生命周期钩子（启动、停止、导出） |

### 示例

查看 [examples/](examples/) 目录获取完整的自定义示例：

| 示例 | 说明 |
|------|------|
| [自定义规则](examples/custom-rules/) | Jest 测试规则、Docker 规范、Python 项目配置 |
| [自定义智能体](examples/custom-agents/) | 测试生成器、数据库迁移助手 |
| [自定义命令](examples/custom-commands/) | `/changelog` 生成、部署检查 |

---

## 迁移

```bash
# 1. 旧机器导出
bash ~/.claude/hooks/export-system.sh

# 2. 传输到新机器
scp claude-evolution-*.tar.gz new-machine:~/

# 3. 新机器导入
cd ~/ && tar xzf claude-evolution-*.tar.gz && bash install.sh
```

详见: [MIGRATION.md](docs/MIGRATION.md)

---

## 文档

| 文档 | 说明 |
|------|------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 四层架构深度解析 |
| [EVOLUTION.md](docs/EVOLUTION.md) | 进化流水线详解 |
| [INSTALL.md](docs/INSTALL.md) | 跨平台安装指南 |
| [MIGRATION.md](docs/MIGRATION.md) | 跨机迁移指南 |
| [CUSTOMIZE.md](docs/CUSTOMIZE.md) | 自定义规则、智能体、命令 |
| [MULTI_AGENT.md](docs/MULTI_AGENT.md) | 多智能体适配器架构 |
| [FAQ.md](docs/FAQ.md) | 常见问题 |

---

## 路线图

### 已完成 ✅

**v0.1.0** — 核心模板 + 安装脚本 + 文档 + Git 发布
- ✅ 4 层自进化架构（CLAUDE.md → rules/ → agents/ → commands/ → memory/）
- ✅ SessionStart / Stop 钩子
- ✅ 进化审计（/evolve）含旋转归档和置信度衰减
- ✅ 一键迁移（export-system.sh）
- ✅ 跨平台支持（Linux / macOS / WSL / Git Bash）
- ✅ 隐私优先：零遥测、全本地存储

**v0.2.0** — 独立 CLI 工具
- ✅ `evokit` 命令行（TypeScript/Node.js，替代 bash 脚本）
- ✅ `evokit init` — 支持 `--template`、`--branch`、`--dry-run`、`--verify`
- ✅ `evokit evolve` — 旋转、置信度衰减、晋升、修剪
- ✅ `evokit export` / `evokit import` — 跨机迁移管理
- ✅ `evokit doctor` — 系统完整性验证
- ✅ npm 包发布（`@zythegit/evokit`）+ Homebrew 支持
- ✅ 41 个 vitest 测试用例

**v0.3.0 — Codex 适配器** 🆕
- ✅ Codex CLI 集成适配器（`~/.codex/` 模板、AGENTS.md、hooks.json、config.toml）
- ✅ Codex 钩子机制映射（SessionStart / Stop / PreToolUse）
- ✅ 跨助手学习数据同步（共享 `~/.claude/memory/`）
- ✅ 交互式适配器选择菜单（带 box-drawing UI，支持多选和默认回车）
- ✅ 29 个新测试（适配器 + 共享内存）

### 规划中 🔜

**v0.4.0 — OpenCode + Aider 适配器**
- ☐ OpenCode CLI 插件集成
- ☐ Aider convention 文件集成
- ☐ 统一适配器接口注册表

**v0.5.0 — 进化引擎独立化**
- ☐ 独立的规则晋升引擎（可脱离 Claude Code 运行）
- ☐ Web UI 管理面板
- ☐ 可视化学习数据

### 未来展望 🔮

**v1.0.0 — 稳定 API + 生态系统**
- ☐ 稳定适配器 API
- ☐ GitHub Action 集成
- ☐ 社区插件市场
- ☐ 企业级权限管理

---

## 贡献

欢迎贡献代码！请阅读[贡献指南](CONTRIBUTING.md)。

### 贡献方向

- 编写自定义规则、智能体、命令示例
- 实现新适配器（Codex、OpenCode、Aider）
- 改进文档和截图
- 报告 bug 或提功能建议
- 完善测试覆盖

---

## 许可证

MIT © 2026 EvoKit Contributors

## 致谢

灵感来源于中文开发者社区的自进化 Claude Code 系统实践。感谢所有开源贡献者。

*用 ❤️ 为开源 AI 生态构建。*
