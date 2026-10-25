# EvoKit 项目路线图（个人版，最终定稿）

> 版本：v1.0-final ｜ 日期：2026-10-25
> 背景：经过方向研究 → 四人评审 → 证据核查 → 竞品核查 → 用户定位确认，最终结论如下。

---

## 项目定位（已定）

**EvoKit 是"个人多工具协作的偏好同步工具"，不是面向大众的开源产品。**

一句话：**一份偏好，多个 AI 工具共享，不用重复维护。**

动机（用户自述）：解决自己多工具协作的痛点；基本个人项目；可集成开源。

---

## 为什么不做 v2.0 重构（已决策）

按"不重复造轮子"原则核查，EvoKit 设想中的能力均已有成熟开源实现：

| 能力 | 已有轮子 |
| --- | --- |
| 单一事实源→多工具编译 | rulesync（MIT，1.5k stars）、Ruler |
| 漂移检测 / token 预算 / explain | rulesync fork（receipt/explain） |
| 上下文健康检查 | ctxlint（@ctxlint/ctxlint）、instrlint |

**结论：不再重构，转为轻量个人工具。**

---

## 路线图（自用迭代）

### 阶段 0 — 单一事实源 + 三入口同步（✅ 已完成）

- [x] 建立 `~/.evokit/context.md` 作为唯一源
- [x] 同步到 Claude Code（CLAUDE.md）、Pi（APPEND_SYSTEM.md）、Codex（AGENTS.md）
- [x] 同步脚本 `~/.evokit/evokit.mjs`（sync / check 两个命令）
- [x] 备份原文件到 `~/.evokit/backup/`（**注：后续改为「只动托管块、不整文件覆盖」后，备份已废弃**，见 cli/README.md）

### 阶段 1 — 接入剩余入口（⏭️ 跳过，用户决定不做）

- ~~摸清 WorkBuddy / Qoder 的全局规则文件路径~~
- ~~加入同步脚本 TARGETS 列表~~

### 阶段 2 — 分层能力（✅ 已完成）

- [x] 个人全局（跨项目）：`~/.evokit/context.md` → 全局入口
- [x] 项目级（跟仓库走）：`<project>/.evokit/context.md` → 项目入口
- [x] 命令：`evokit sync`（全局） / `evokit sync --project`（项目）

### 阶段 3 — 集成 ctxlint 健康检查（✅ 已完成）

- [x] `evokit check` 调用 `npx @ctxlint/ctxlint check`
- [x] ctxlint 作为辅助信息，不阻塞退出码（对全局偏好文件的 stale-command 可能误报）

### 阶段 4 — 若未来想要用户（📋 规划中）

- [ ] 回到"用户三问"重新判断，届时 ctxlint/rulesync 可能又进化
- [ ] 若做分享：优先做"包装 + 最佳实践编排"，不重造 lint/编译器引擎

---

## 当前交付物清单

| 文件 | 位置 | 说明 |
| --- | --- | --- |
| CLI 源码 | `cli/evokit.mjs` | 零依赖，`npx @evokit/cli` 或 `npm install -g` |
| CLI 包配置 | `cli/package.json` | 包名 `@evokit/cli`，bin 为 `evokit` |
| CLI 文档 | `cli/README.md` | 安装与用法 |
| 单一事实源 | `~/.evokit/context.md` | 唯一源，改这里 |
| 备份 | ~~`~/.evokit/backup/`~~（已废弃，见 cli/README.md） | 迁移前的原文件备份 |

---

## 使用方式

```bash
# 安装（二选一）
npm install -g @evokit/cli       # 全局安装
# 或直接 npx 跑（无需安装）
npx @evokit/cli sync

# 初始化
evokit init                       # 全局源
evokit init --project             # 项目源

# 改偏好后同步
evokit sync                       # 全局
evokit sync --project             # 项目

# 检查
evokit check                      # 一致性 + ctxlint 健康检查
```
