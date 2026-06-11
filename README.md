<div align="center">

# 🧠⚡ EvoKit

**Evolution Kit for AI Coding Agents**

让 AI 编程助手拥有自我进化能力 — *Make AI coding assistants learn and evolve across sessions*

[![Version](https://img.shields.io/github/v/release/zyTheGit/EvoKit?include_prereleases&style=flat-square&label=version)](CHANGELOG.md)
[![License](https://img.shields.io/github/license/zyTheGit/EvoKit?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/zyTheGit/EvoKit?style=flat-square)](https://github.com/zyTheGit/EvoKit/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/zyTheGit/EvoKit/ci.yml?branch=main&style=flat-square)](https://github.com/zyTheGit/EvoKit/actions)
[![GitHub issues](https://img.shields.io/github/issues/zyTheGit/EvoKit?style=flat-square)](https://github.com/zyTheGit/EvoKit/issues)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20WSL-blue?style=flat-square)]()

</div>

---

## 📸 预览 / Preview

<div align="center">

```
╔═══════════════════════════════════════════╗
║   EvoKit — Self-Evolving System Install   ║
╚═══════════════════════════════════════════╝
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

</div>

<table align="center">
  <tr>
    <td width="50%">
      <pre>
[EVOLUTION BOOT] ═══════════════════════
  Self-Evolving System: checking integrity...
  ✓ .claude/rules/
  ✓ .claude/agents/
  ✓ .claude/commands/
  ✓ .claude/memory/
  ✓ .claude/hooks/
  ✓ CLAUDE.md: 55 lines (limit 150)
  ✓ learned-rules.md: 3 lines (limit 50)
═══════════════════════════════════════</pre>
      <p align="center"><b>🔍 <code>/boot</code></b></p>
    </td>
    <td width="50%">
      <pre>
[EVOLUTION AUDIT] ═════════════════════
  Rotating: corrections.jsonl (12 kept, 5 archived)
  Rotating: observations.jsonl (8 kept, 3 archived)
  Analyzing corrections...
  ✓ Promoted: "use uv instead of pip" (2×)
  ✓ Promoted: "no console.log in prod" (3×)
  ✓ learned-rules.md: 6 lines (limit 50)
═══════════════════════════════════════</pre>
      <p align="center"><b>🔄 <code>/evolve</code></b></p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <pre>
📦 Creating migration package...
  ✓ system files copied
  ✓ rotation applied
  ✓ install.sh generated
🗜️  Packaging...
✅ claude-evolution-20260611.tar.gz

📊 Data overview:
  corrections:  12 entries
  observations: 8 entries
  learned-rules: 6 lines</pre>
      <p align="center"><b>📦 <code>export-system.sh</code></b></p>
    </td>
    <td width="50%">
      <p align="center"><i>📷 Screenshots coming&nbsp;soon —<br>contributions welcome!</i></p>
      <p align="center">
        <a href="docs/ARCHITECTURE.md">📖 Architecture</a> ·
        <a href="docs/EVOLUTION.md">🧬 Evolution</a>
      </p>
    </td>
  </tr>
</table>

---

## 🌟 项目介绍 / Introduction

**中文**

EvoKit 是一个开源的 **自进化系统框架**，专为 AI 编程助手设计。它能让 Claude Code、Codex、OpenCode 等 AI 工具**越用越聪明**——通过跨会话持久化纠错、观察和规则，实现知识的自动积累与晋升。

| 核心思想 | 说明 |
|---------|------|
| 🧠 **跨会话记忆** | 纠错和观察跨会话保留，永不丢失 |
| 📈 **自动晋升** | 重复出现的模式自动晋升为永久规则 |
| 🔌 **Hook 驱动** | 会话生命周期全自动管理 |
| 🚚 **一键迁移** | 跨机器无缝迁移学习数据 |
| 🔒 **隐私优先** | 所有数据本地存储，无云端、无遥测 |
| 🤖 **多智能体** | 适配器架构，支持 Claude Code / Codex / OpenCode / Aider |

**English**

EvoKit is an open-source **self-evolving system framework** for AI coding assistants. It enables Claude Code, Codex, OpenCode, and other AI tools to **get smarter over time** — by persisting corrections, observations, and rules across sessions, enabling automatic knowledge accumulation and promotion.

---

## 🏗️ 架构 / Architecture

```
┌────────────────────────────────────────────────┐
│  L1: 认知核心 / Cognitive Core (CLAUDE.md)       │
│  行为编程 · 思考框架 · 自进化协议                  │
├────────────────────────────────────────────────┤
│  L2: 路径规则 / Path Rules (.claude/rules/)      │
│  按文件路径自动加载（安全 · 编码 · 不变量）        │
├────────────────────────────────────────────────┤
│  L3: 子智能体 / Sub-agents (.claude/agents/)    │
│  architect（规划）+ reviewer（审查）               │
├────────────────────────────────────────────────┤
│  L4: 进化引擎 / Evolution Engine (.claude/memory/)│
│  纠错 → 观察 → 晋升 → 审计                       │
└────────────────────────────────────────────────┘
```

### 进化流水线 / Evolution Pipeline

```
用户纠正 AI / User corrects AI
      ↓
corrections.jsonl ← 记录 / Recorded
      ↓ (同一模式出现 2+ 次 / 2+ same pattern)
learned-rules.md ← 晋升带验证行 / Promoted with verify line
      ↓ (10+ 会话通过验证 / 10+ sessions verified)
CLAUDE.md / rules/ ← 毕业 / Graduated
      ↓
被拒规则 → evolution-log.md（永不重提 / Never re-propose）
```

---

## 🚀 快速开始 / Quick Start

### 前置条件 / Prerequisites

- [Claude Code](https://claude.ai/code)（或其他支持钩子的 AI 编程助手）
- bash 4.0+（Linux / macOS / WSL / Git Bash）

### 安装 / Install

```bash
# 从 GitHub 安装 / Install from GitHub
git clone https://github.com/zyTheGit/EvoKit.git
cd EvoKit
bash bin/evokit-install.sh
```

### 验证 / Verify

启动 Claude Code，运行以下命令：

```
/boot
```

预期输出 / Expected output:

```
[EVOLUTION BOOT] ═══════════════════════
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

## 📖 功能详解 / Features

### 🔧 内置命令 / Built-in Commands

| 命令 / Command | 时机 / When | 功能 / What |
|---------------|-------------|-------------|
| `/boot` | 每次会话启动 | 验证系统完整性 / Verify system integrity |
| `/evolve` | 每 ~10 次会话 | 晋升模式、修剪过时规则 / Promote patterns, prune stale rules |
| `/review` | 提交前 / Before commit | 代码审查 / Code review via reviewer agent |

### 📁 核心文件 / Key Files

| 文件 / File | 作用 / Purpose |
|-------------|---------------|
| `CLAUDE.md` | 认知核心 — 思考框架、进化协议（上限 150 行） |
| `.claude/rules/` | 路径规则（安全、编码、不变量） |
| `.claude/agents/` | 子智能体定义（规划师、审查员） |
| `.claude/commands/` | 斜杠命令（/boot, /evolve, /review） |
| `.claude/memory/` | 学习数据 — 纠错、观察、已学规则、会话记录 |
| `.claude/hooks/` | 会话生命周期钩子（启动、停止） |

### 🧪 示例 / Examples

查看 [examples/](examples/) 目录获取完整的自定义示例：

| 示例 | 说明 |
|------|------|
| [自定义规则](examples/custom-rules/) | Jest 测试规则、Docker 规范、Python 项目配置 |
| [自定义智能体](examples/custom-agents/) | 测试生成器、数据库迁移助手 |
| [自定义命令](examples/custom-commands/) | `/changelog` 生成、部署检查 |

---

## 📦 迁移 / Migration

```bash
# 1. 旧机器导出 / Export from old machine
bash ~/.claude/hooks/export-system.sh

# 2. 传输到新机器 / Transfer to new machine
scp claude-evolution-*.tar.gz new-machine:~/

# 3. 新机器安装 / Import on new machine
cd ~/ && tar xzf claude-evolution-*.tar.gz && bash install.sh
```

详见 / See: [MIGRATION.md](docs/MIGRATION.md)

---

## 📚 文档 / Documentation

| 文档 | 说明 |
|------|------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 四层架构深度解析 |
| [EVOLUTION.md](docs/EVOLUTION.md) | 进化流水线详解 |
| [INSTALL.md](docs/INSTALL.md) | 跨平台安装指南 |
| [MIGRATION.md](docs/MIGRATION.md) | 跨机迁移指南 |
| [CUSTOMIZE.md](docs/CUSTOMIZE.md) | 自定义规则/智能体/命令 |
| [MULTI_AGENT.md](docs/MULTI_AGENT.md) | 多智能体适配器架构 |
| [FAQ.md](docs/FAQ.md) | 常见问题 |

---

## 🗺️ 路线图 / Roadmap

### 已完成 / Completed ✅

- **v0.1.0** — 核心模板 + 安装脚本 + 文档 + Git 发布
  - ✅ 4 层自进化架构（CLAUDE.md → rules/ → agents/ → commands/ → memory/）
  - ✅ SessionStart / Stop 钩子
  - ✅ 进化审计（/evolve）含旋转归档和置信度衰减
  - ✅ 一键迁移（export-system.sh）
  - ✅ 跨平台支持（Linux / macOS / WSL / Git Bash）
  - ✅ 隐私优先：零遥测、全本地存储

### 进行中 / In Progress 🔄

- **v0.2.0** — 独立 CLI 工具
  - ☐ `evokit` 命令行（替代 bash 脚本）
  - ☐ `evokit init` — 初始化项目
  - ☐ `evokit evolve` — 运行进化审计
  - ☐ `evokit export` / `evokit import` — 迁移管理
  - ☐ npm / Homebrew 发布

### 规划中 / Planned 🔜

- **v0.3.0 — Codex 适配器**
  - ☐ Codex CLI 集成适配器
  - ☐ Codex 钩子机制映射
  - ☐ 共享 learning data
  - ☐ 跨助手学习数据同步

- **v0.4.0 — OpenCode + Aider 适配器**
  - ☐ OpenCode CLI 插件集成
  - ☐ Aider convention 文件集成
  - ☐ 统一适配器接口注册表

- **v0.5.0 — 进化引擎独立化**
  - ☐ 独立的规则晋升引擎（可脱离 Claude Code 运行）
  - ☐ Web UI 管理面板
  - ☐ 可视化学习数据

### 未来展望 / Future 🔮

- **v1.0.0 — 稳定 API + 生态系统**
  - ☐ 稳定适配器 API
  - ☐ GitHub Action 集成
  - ☐ 社区插件市场
  - ☐ 企业级权限管理

---

## 🤝 贡献 / Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

欢迎贡献代码！请阅读[贡献指南](CONTRIBUTING.md)。

### 💡 贡献方向 / Ideas for Contributors

- 编写自定义规则/智能体/命令示例
- 实现新适配器（Codex、OpenCode、Aider）
- 改进文档和截图
- 报告 bug 或提功能建议
- 完善测试覆盖

## 📄 许可证 / License

MIT © 2026 EvoKit Contributors

## 🙏 致谢 / Acknowledgments

灵感来源于中文开发者社区的自进化 Claude Code 系统实践。感谢所有开源贡献者。

*Built with ❤️ for the open-source AI ecosystem.*
