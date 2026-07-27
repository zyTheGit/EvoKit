<div align="center">

[**English**](README.en.md) · [**中文**](README.md)

<br>

# 🧠⚡ EvoKit

**AI 编程助手的自进化框架**

_让 AI 编程助手越用越聪明 — 跨会话持久化纠错、观察和规则_

[![Version](https://img.shields.io/github/v/release/zyTheGit/EvoKit?include_prereleases&style=flat-square&label=版本)](CHANGELOG.md)
[![License](https://img.shields.io/github/license/zyTheGit/EvoKit?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/zyTheGit/EvoKit?style=flat-square)](https://github.com/zyTheGit/EvoKit/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/zyTheGit/EvoKit/ci.yml?branch=main&style=flat-square)](https://github.com/zyTheGit/EvoKit/actions)
[![npm](https://img.shields.io/npm/v/%40zythegit%2Fevokit?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@zythegit/evokit)

---

**EvoKit** 是一个开源的 **自进化系统框架**，专为 AI 编程助手设计。它能让 Claude Code、Codex、OpenCode 等 AI 工具**越用越聪明**——通过跨会话持久化纠错、观察和规则，实现知识的自动积累与晋升。

| 核心思想          | 说明                                                     |
| ----------------- | -------------------------------------------------------- |
| 🧠 **跨会话记忆** | 纠错和观察跨会话保留，永不丢失                           |
| 📈 **自动晋升**   | 重复出现的模式自动晋升为永久规则                         |
| 🔌 **Hook 驱动**  | 会话生命周期全自动管理                                   |
| 🚚 **一键迁移**   | 跨机器无缝迁移学习数据                                   |
| 🔒 **隐私优先**   | 所有数据本地存储，无云端、无遥测                         |
| 🤖 **多智能体**   | 适配器架构，支持 Claude Code / Codex / OpenCode / Pi CLI |

</div>

---

## 快速开始

### 前置条件

- [Claude Code](https://claude.ai/code) ≥ 2.1.220（或其他支持钩子/工具的 AI 编程助手）
- **bash 4.0+**（Linux / macOS / WSL / Git Bash）
- **Node.js ≥ 20.12.0**

### 安装

```bash
# npm 安装（推荐）
npm install -g @zythegit/evokit
evokit init

# Homebrew 安装
brew tap zyTheGit/homebrew-evokit
brew install evokit

# 一行命令安装（交互式选择适配器）
curl -fsSL https://raw.githubusercontent.com/zyTheGit/EvoKit/main/bin/install.sh | bash
```

安装时可通过交互式菜单选择适配器：

| 适配器           | 安装目录               |
| ---------------- | ---------------------- |
| **Claude Code**  | `~/.claude/`           |
| **Codex CLI**    | `~/.codex/`            |
| **OpenCode CLI** | `.opencode/`（项目级） |
| **Pi CLI**       | `~/.pi/agent/`         |

也支持 `--adapter claude,codex` 参数跳过菜单（适用于 CI 自动化）。

### 升级

已安装 EvoKit 的老用户，新版本发布后更新模板文件：

```bash
evokit update        # 更新所有已安装适配器
```

update 会自动覆盖框架文件（hooks、rules、commands、agents、skills），保留用户数据（CLAUDE.md、MEMORY.md、memory/）。

### CLI 命令

```bash
evokit init         初始化安装
evokit update       升级模板文件
evokit evolve       运行进化审计
evokit doctor       系统健康检查
evokit export       导出学习数据
evokit import <包>  导入迁移包
```

### 验证

启动 AI 助手，运行：

```
/boot
```

---

## 内置命令

安装后在 AI 助手内可用以下斜杠命令：

| 命令             | 运行时机      | 功能                         |
| ---------------- | ------------- | ---------------------------- |
| `/boot`          | 每次会话启动  | 验证系统完整性               |
| `/evolve`        | 每 ~10 次会话 | 晋升模式、修剪过时规则       |
| `/evokit-review` | 提交代码前    | 通过审查员智能体进行代码审查 |

---

## 适配器版本

| 适配器           | 版本   | 助手版本兼容                  |
| ---------------- | ------ | ----------------------------- |
| **Claude Code**  | v0.2.0 | Claude Code ≥ 2.1.220（CLI）  |
| **Codex CLI**    | v0.4.0 | Codex CLI ≥ 0.145.0（OpenAI） |
| **OpenCode CLI** | v0.5.0 | OpenCode CLI ≥ 1.18.4         |
| **Pi CLI**       | v0.6.0 | Pi CLI ≥ 0.82.0               |

---

## 文档

| 文档                                       | 说明                     |
| ------------------------------------------ | ------------------------ |
| [ARCHITECTURE.md](docs/zh/ARCHITECTURE.md) | 四层架构深度解析         |
| [EVOLUTION.md](docs/zh/EVOLUTION.md)       | 进化流水线详解           |
| [INSTALL.md](docs/zh/INSTALL.md)           | 跨平台安装指南           |
| [MIGRATION.md](docs/zh/MIGRATION.md)       | 跨机迁移指南             |
| [CUSTOMIZE.md](docs/zh/CUSTOMIZE.md)       | 自定义规则、智能体、命令 |
| [MULTI_AGENT.md](docs/zh/MULTI_AGENT.md)   | 多智能体适配器架构       |
| [FAQ.md](docs/zh/FAQ.md)                   | 常见问题                 |
| [ROADMAP.md](ROADMAP.md)                   | 路线图与规划             |

---

## 贡献

欢迎贡献代码！请阅读[贡献指南](CONTRIBUTING.md)。

[更新日志](CHANGELOG.md) · [路线图](ROADMAP.md) · [贡献指南](CONTRIBUTING.md)

---

## 许可证

MIT © 2026 EvoKit Contributors

_用 ❤️ 为开源 AI 生态构建。_
