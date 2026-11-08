# EvoKit 知识库网页端展示需求文档

> 状态：**v0.1 草案，待作者评审**（2026-11-08 与作者对齐四项产品决策后整理；未提交 git，未立项未实施）
> 定位：只读的知识库本机控制台。写操作（review 裁决、编辑、删除）仍走 CLI，本功能不碰。

## 1. 背景与目标

全局偏好与知识索引目前只以纯文本托管块存在于三个入口文件（`~/.claude/CLAUDE.md`、`~/.pi/agent/APPEND_SYSTEM.md`、`~/.codex/AGENTS.md`）；知识卡、待审草稿、归档、召回命中、采集水位线、inventory 报告分散在 `~/.evokit` 各处，只能用 CLI 逐条查看。

目标：提供 `evokit web` 一类的本机网页端，把「当前 AI 工具们遵守的偏好 + 知识库全量内容 + 运行状态」在一个浏览器页面里可视化浏览与检索，替代「逐个 CLI 命令查看」的体验。

## 2. 已确认的产品决策（2026-11-08）

| 决策项 | 结论 |
| --- | --- |
| 部署形态 | **本机本地服务**：`evokit web` 起 localhost 服务，实时读取 `~/.evokit`，数据不出本机，改动即时可见；不做静态快照、不做远程部署 |
| 交互范围 | 浏览只读 + **白名单命令执行**（2026-11-08 二次变更：网页可直接执行 CLI 命令；浏览类端点仍零写入，命令执行走白名单 + 二次确认 + 互斥 + 超时，见 FR-13） |
| 实现载体 | **EvoKit CLI 新子命令**：进主仓库带测试，复用现有模块保证口径一致 |
| 技术栈 | **前端与服务端均采用开源框架**（2026-11-08 确认：脚手架/UI 框架优先开源；服务端可用 H3/Koa 等，以服务稳定为首要标准，定稿 h3 见 [WEB-VIEWER-TECH-DESIGN.md](./WEB-VIEWER-TECH-DESIGN.md)）；CLI 核心命令保持零依赖 |
| 内容范围 | 基线功能 + 五个增强面板全做（同步状态、git 历史、recall 统计、报告库、采集概览） |

## 3. 数据源盘点（实测 2026-11-08）

| # | 数据 | 路径 | 现状 | 服务于 |
| --- | --- | --- | --- | --- |
| 1 | 全局偏好源 | `~/.evokit/context.md` | 托管块源文件（偏好段落 + 知识索引段） | 偏好页 |
| 2 | 知识索引 | `~/.evokit/knowledge/knowledge-index.md` | 7 行索引条目 | 索引页 |
| 3 | 已入库卡 | `~/.evokit/knowledge/*.md` | 7 张 confirmed，YAML frontmatter（id/title/type/status/source/confidence/updated/verdict/tags/evidence/acceptedBy/acceptedAt）+ 短正文 | 卡片列表/详情 |
| 4 | 待审草稿 | `~/.evokit/knowledge/.pending/*.md` | 1 张真草稿 | 待审列表 |
| 5 | 归档卡 | `~/.evokit/knowledge/.archive/` | 2 张（retired） | 归档列表 |
| 6 | 已拒卡 | `~/.evokit/knowledge/.rejected/` | 1 张 | 已拒列表 |
| 7 | 召回命中 | `~/.evokit/knowledge/references.jsonl` | 6 条 `{ts,type,cardId}` | 召回统计面板 |
| 8 | 采集水位线 | `~/.evokit/state.json` | 9 个采集源（逐文件 hash/mtime/counts）+ distill 游标；文件较大（约 1800 行），API 只输出聚合 | 采集概览面板 |
| 9 | 入口配置 | `~/.evokit/settings.json` | agents 3 入口 + resources + prompts | 同步状态面板 |
| 10 | 入口文件实况 | 上述三个全局入口 | 托管块与源的一致性待比对 | 同步状态面板 |
| 11 | inventory 报告 | `~/.evokit/reports/*.md` | 2 份审计报告 | 报告库 |
| 12 | 知识根版本史 | `~/.evokit/knowledge/.git` | 9 个提交（learn 入库自动 commit） | git 历史面板 |

卡片本身就是「frontmatter + 短正文」的 Markdown，无二级派生格式，网页渲染无额外数据准备成本。

## 4. 用户与使用场景

单用户（作者本人），本机桌面浏览器使用。

- S1 随时打开浏览器，看「AI 工具们当前遵守的偏好与知识」全貌
- S2 learn 入库后浏览新卡片，按类型/标签筛选
- S3 用网页检索找卡，口径与 `evokit recall` 一致
- S4 检查三入口托管块是否漂移、采集水位线是否推进
- S5 看哪些知识卡真的被召回过，评估索引价值
- S6 回看 inventory 冗余审计报告与知识库变更时间线

## 5. 范围

### 5.1 功能需求（v1 全做）

| 编号 | 需求 | 说明 |
| --- | --- | --- |
| FR-1 | 启动命令 `evokit web` | 默认绑定 `127.0.0.1`，`--port` 可覆盖；启动即打印可点击 URL；Ctrl+C 停止；不做后台守护 |
| FR-2 | 总览页 | 卡片计数（confirmed/pending/archive/rejected）、索引行数、三入口同步状态摘要、最近 learn/入库时间（可取自 state.json 或知识根 git log）、各面板入口 |
| FR-3 | 全局偏好页 | 渲染 `context.md`（语言/工具链/行为规则 + 知识索引段），标注托管块边界 |
| FR-4 | 知识卡列表 | confirmed 全量；按 type/tags 筛选、按 updated 排序；显示 type 徽标、tags、confidence、updated；点击进详情 |
| FR-5 | 卡片详情 | frontmatter 元数据表 + 正文渲染；source/evidence 路径展示；该卡召回次数；该卡 git 修订历史入口 |
| FR-6 | 待审/归档/已拒列表 | 三个分区独立展示，待审醒目提示；样式与 confirmed 区分 |
| FR-7 | 检索 | 关键词检索，复用 recall 评分（tags×3 ＞ 标题×2 ＞ 正文×1），结果与 `evokit recall "<词>"` 同词同序；检索纯只读，不写引用计数（与 CLI recall 的唯一差异，避免浏览污染命中统计） |
| FR-8 | 三入口同步状态面板 | 每个入口的托管块一致性判定（与 `evokit check` 结论一致）、最后同步时间 |
| FR-9 | git 历史面板 | 知识根提交时间线；单卡历史（`git log --follow -- <id>.md`） |
| FR-10 | recall 命中统计面板 | `references.jsonl` 聚合：按卡计数、按时间分布 |
| FR-11 | inventory 报告库 | `reports/` 目录列表 + Markdown 渲染阅读 |
| FR-12 | inbox 采集概览面板 | 9 源 × 事件数/文件数/最近采集时间 + distill 水位线状态；**纯统计数字，不展示会话原文** |
| FR-13 | 命令执行（2026-11-08 二次变更新增） | 「命令执行」页执行白名单内 CLI 命令：安全命令（check/status/agents/resources/recall/help）直接执行，confirm 类（sync/review/knowledge/harvest/learn/forge/inventory/schedule/uninstall）前端二次确认；服务端互斥 + 5 分钟超时 + 输出截断 512KB；`web`/`hook` 永久禁止；待审草稿详情页提供 accept/reject 快捷按钮 |

### 5.2 明确不做（v1 Out of Scope）

- 细粒度写操作：编辑/删除知识卡正文、直接改配置文件——仍走 CLI（网页侧仅提供 FR-13 白名单命令与 accept/reject 快捷按钮）
- 鉴权、多用户、远程/公网部署、静态导出快照
- 项目级知识根（`<project>/.evokit`）展示——v3 首版本就只做个人知识根
- inbox 会话原文、`state.json` 逐文件 hash 明细展示
- 移动端深度适配（桌面优先，基础自适应即可）

## 6. 非功能需求

| 编号 | 需求 |
| --- | --- |
| NFR-1 | **依赖分层**：CLI 核心命令保持零依赖；`evokit web` 采用开源服务端框架 h3（软依赖，未安装时友好降级提示，不影响其他命令）+ 前端开源栈（Vite + Vue 3 + Element Plus 等，仅构建期 devDependencies，产物预编译入库后由服务端静态托管） |
| NFR-2 | **只读分层**：13 个浏览类端点全程零写入（AC-6 快照断言）；命令执行是唯一写通道（POST /api/exec：白名单 + 互斥 + 超时，FR-13） |
| NFR-3 | **仅绑定 127.0.0.1**：不监听 0.0.0.0，不暴露局域网；远程访问属未来独立需求 |
| NFR-4 | **路径安全**：静态资源与文件类端点走白名单/规范化校验，拒绝目录穿越 |
| NFR-5 | **性能**：当前规模（卡 <100、references 万行内）所有页面秒开；数据每次请求现读，无守护进程、无缓存失效问题 |
| NFR-6 | **不干扰主线**：web 进程不触发 autoSync、不推进水位线、不写 `state.json` |
| NFR-7 | **测试**：新增一套测试（如 `test-m7-web.mjs`）纳入现有九套体系，覆盖：API 数据正确性（对照 CLI 输出）、只读保证、路径穿越拒绝 |
| NFR-8 | **中文 UI**：术语与 CLI 现有中文文案一致（已入库/待审草稿/归档等） |

## 7. 页面结构草案（文字线框）

```
┌ 左侧导航 ────────────┬ 右侧内容 ─────────────────────────┐
│ 总览                 │ 计数卡 + 同步状态摘要 + 最近动态    │
│ 全局偏好             │ context.md 渲染（托管块边界标注）   │
│ 知识索引             │ 7 行索引，行内可跳转对应卡片        │
│ 知识卡（已入库）      │ 筛选条（type/tags/排序）+ 卡片列表  │
│ 待审草稿 / 归档 / 已拒│ 分区列表，计数徽标                  │
│ 检索                 │ 搜索框 + 命中列表（含评分依据）     │
│ 同步状态             │ 三入口 × 一致性/最后同步时间        │
│ 变更历史             │ git 时间线 → 单卡历史下钻           │
│ 召回统计             │ 按卡命中 Top + 时间分布             │
│ 报告库 / 采集概览     │ 报告阅读器 / 9 源统计表             │
└──────────────────────┴────────────────────────────────────┘
```

卡片详情页 = 元数据表（frontmatter 全字段）+ 正文 + 召回次数 + 「查看该卡历史」。

## 8. 技术方案取向（供实施计划细化，非最终裁定）

- **载体**：`cli/src/commands/web.js` + `cli/src/web/`（服务端，开源框架 h3 + 按域拆分的 API 模块）+ `cli/web/`（前端源码）；前端单页应用，`/api/*` 返回 JSON。
- **API 草案**：`/api/overview`、`/api/context`、`/api/cards`、`/api/cards/:id`、`/api/pending`、`/api/archive`、`/api/rejected`、`/api/search?q=`、`/api/sync-status`、`/api/history`、`/api/history/:id`、`/api/recall-stats`、`/api/reports`、`/api/reports/:name`、`/api/inbox`。
- **复用现有模块**（口径一致是本功能的核心价值）：recall 评分逻辑、entry-content/check 的托管块比对、knowledge-cards 的 frontmatter 解析；git 历史通过只读 `git log` 子进程获取。
- **Markdown 渲染**：开源渲染器 markdown-it（2026-11-08 起随开源前端栈确定）；渲染异常时降级显示原文，不丢内容。完整技术栈、仓库结构与构建链路见 [WEB-VIEWER-TECH-DESIGN.md](./WEB-VIEWER-TECH-DESIGN.md)。
- **端口**：默认值实施时定（建议避开常用端口的高位段），`--port` 覆盖，占用时报错并提示。

## 9. 待确认项（不阻塞评审，实施前逐项敲定）

| # | 事项 | 备注 |
| --- | --- | --- |
| Q1 | 子命令命名 | `web` / `serve` / `view` 三选一，默认倾向 `web` |
| Q2 | 默认端口值 | 实施时定 |
| Q3 | Markdown 渲染位置 | 服务端预渲染 vs 客户端渲染，实施时按复杂度定 |
| Q4 | （范围外提醒）仓库根 `.evokit/knowledge/` 存有 3 张 v1.x 时代项目级旧卡（引用旧 TypeScript 代码结构 `src/core/repository.ts` 等），与本功能无关 | 是否清理另行决定 |
| Q5 | （范围外提醒）schedule 定时任务状态未列入面板 | 如需要可作 v2 增补 |

## 10. 验收标准（供实施计划引用）

| 编号 | 验收项 |
| --- | --- |
| AC-1 | `evokit web` 启动后打开总览页，计数与目录实测一致（当前：confirmed 7 / pending 1 / archive 2 / rejected 1 / 索引 7 行） |
| AC-2 | 卡片详情与对应 `.md` 文件内容一致，frontmatter 字段全展示 |
| AC-3 | 检索结果与 `evokit recall "<同词>"` 同词同序 |
| AC-4 | 同步状态面板判定与 `evokit check` 结论一致（一致/漂移判定相同） |
| AC-5 | git 历史面板条目与知识根 `git log --oneline` 一致（当前 9 个提交） |
| AC-6 | 只读验证：遍历全部页面后 `~/.evokit` 无任何文件内容/mtime 变化、无新增文件 |
| AC-7 | 安全验证：构造 `../` 路径请求被拒绝 |
| AC-8 | 新增测试套件全绿，现有九套不回归 |
| AC-9 | 真机演练：三类卡（confirmed/pending/archive）+ 报告 + git 历史 + 召回统计全部可见且数据正确 |

## 11. 分期与预估

- **v1（本文档范围）**：FR-1～FR-12 一次做完，其中核心阅读线（FR-1~7）先行、状态线（FR-8~12）随后。预估 **2~3 个工作日**（含测试与真机验收）。
- **v2 储备（均不在本次）**：`--export` 静态快照导出、网页裁决（写操作 + 防误触）、远程部署 + 鉴权、项目级知识根、schedule 面板、深浅色主题。

## 12. 风险与对策

| # | 风险 | 对策 |
| --- | --- | --- |
| R1 | Markdown 渲染长尾语法缺口 | 改用成熟开源渲染器 markdown-it 后风险已大幅降低；渲染失败仍降级显示原文 |
| R2 | 复用 check 比对逻辑出现口径偏差 | AC-4 以 CLI 输出为基准做一致性测试 |
| R3 | `state.json` 体积大（约 1800 行逐文件明细） | API 只输出聚合统计，不整包下发 |
| R4 | 知识根非 git 仓库时历史面板无数据 | 优雅降级为「未初始化」提示，不报错 |
| R5 | 知识内容含本机路径等隐私（harvest 已脱敏，但不为零） | 127.0.0.1 绑定 + 纯只读为默认防线；远程部署必须另立需求加鉴权 |
