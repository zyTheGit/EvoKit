# EvoKit 知识库网页端技术设计文档

> 状态：**v0.2.1，已实现收口**（2026-11-08；实现提交 b4f9d61 服务端 / 52d5b44 前端与产物 / e4a7c3c 测试与脚本）
> 上游需求：[WEB-VIEWER-REQUIREMENTS.md](./WEB-VIEWER-REQUIREMENTS.md)
> 证据来源：h3 / Koa / Fastify / Express 现状调查（2026-11-08，含来源 URL 的调研记录）+ 本机 PoC 实测（Windows、Node 24.20.0）+ 真机验收（见 [WEB-VIEWER-ACCEPTANCE.md](./WEB-VIEWER-ACCEPTANCE.md)）

## 1. 变更记录

- **v0.1 → v0.2（2026-11-08，作者新约束后修订）**：
  1. 服务端放开使用开源框架（H3、Koa 等均可尝试），首要标准为**服务稳定**——完成四框架调查 + h3/Koa 双 PoC 实测，定稿 **h3 ^2.0.8**（原「手写路由零依赖」方案废止，改为「CLI 核心零依赖 + web 子命令软依赖」）；
  2. 新增**文件规模纪律**：任何单文件超过 400 行必须拆分（含存量文件盘点与强制检查脚本计划）；
  3. 新增**页面/模块模块化纪律**：前端 views / components / composables 三层拆分 + 路由懒加载，服务端 API 按域拆分；
  4. 服务端设计、测试方案、风险、任务拆分相应更新。
- **v0.2 → v0.2.1 实现期修订（2026-11-08，随实现收口补记的三处踩坑）**：
  1. **静态托管改自实现**：h3 v2 的 serveStatic 从 event.path 推导资源 id，而 event.path 会携带 query 串；改为自实现（query 剥离 + resolve 前缀防穿越 + SPA 兑底），防护语义等效且行为完全可控；
  2. **h3 v2 路由语义**（PoC 未暴露、真机集成时发现）：use() 无论带不带 pattern 都属于「中间件阶段」，先于路由表（.get/createRouter）执行——`app.use('/**', 兕底)` 会全量拦截包括 API 在内的一切请求。最终结构：API 路由器以 `app.use('/api/**', withBase('/api', router.handler))` 模式守卫挂载，静态层作为裸中间件殿后；
  3. **getRouterParam 返回未解码 URL 段**（中文 id 场景，夹具纯 ASCII 未能提前暴露）：server 层统一 decodeURIComponent（解码后仍有 /[\\/] 穿越守卫兑底），夹具补充中文 id 卡防回归；
  4. 存量超限文件盘点扩展到测试套件（+4 个，见 §11）；最终实跑十套 866 断言全绿。

## 2. 决策摘要

| # | 决策 | 结论 |
| --- | --- | --- |
| D1 | 总体架构 | 服务端 = 开源框架 h3（Node）；前端 = Vue 3 SPA 构建产物（纯静态）；CLI 核心命令保持零依赖，`evokit web` 为软依赖（未安装时给出友好提示，不影响其他命令） |
| D2 | 前端技术栈 | Vite + Vue 3 + Element Plus + Vue Router + markdown-it + ECharts（全部 MIT/Apache-2.0，仅 devDependencies） |
| D3 | 服务端框架 | **h3 ^2.0.8**（MIT）：PoC 全绿 + 依赖仅 3 包 + ESM 原生 + 错误边界/穿越防护内置；Koa 3 为第一备选、Fastify 5 为组织化维护最强备选；**h3 的 import 收敛在 `cli/src/web/` 目录内**，业务模块不感知框架 |
| D4 | 构建产物 | **不入库**（2026-11-09 依工作区 .gitignore 改动收口，取代原「预编译入库」方案）：`cli/web-dist/` 已从 git 跟踪移除；clone 后需 `cd cli/web && npm install && npm run build` 生成产物，首次使用前需构建一次 |
| D5 | 命令与端口 | `evokit web`；默认 127.0.0.1:4177，`--port` 覆盖，未显式指定时占用自动探测（至多 +10）；`--open` 可选 |
| D6 | 前端语言 | JavaScript（不用 TypeScript），与仓库纯 JS 一致 |
| D9 | 命令执行（2026-11-08 二次变更） | POST /api/exec **流式响应**（text/plain 直通，实时回传输出，末尾 `---evokit-exit---{json}` 元数据行）：safe 直接执行、confirm 前端二次确认；spawn 不走 shell、全局互斥、5 分钟超时；`web`/`hook` 永久禁止；子进程注入 NO_COLOR/FORCE_COLOR=0，前端手写 SGR→HTML 着色兑底（详见 §7 命令执行段） |
| D7 | **文件规模上限** | **任何单文件 >400 行必须拆分**（含注释空行）；新增代码由 `scripts/check-file-size.mjs` 强制；存量超限文件仅登记、本次不动（见 §11） |
| D8 | **模块化要求** | 前端：views（一页一文件）/ components（公共组件）/ composables（数据获取）三层，路由级懒加载；服务端：`api/` 按域拆分（cards / sync / history / misc），每模块只做「取数 → 纯数据对象」 |

## 3. 总体架构

```
┌─ 浏览器（本机 127.0.0.1）──────────────────────────────┐
│  Vue 3 SPA（cli/web-dist/，路由懒加载，无 CDN/外联）    │
│  views/ + components/ + composables/ · markdown-it ·   │
│  ECharts（按需）                                       │
└───────────────▲────────────────────────────────────────┘
                │ http://127.0.0.1:4177
┌───────────────┴────────────────────────────────────────┐
│  evokit web（软依赖：h3 ^2.0.8，3 个 npm 包）           │
│  node:http + h3 createApp/createRouter/toNodeHandler   │
│  api/cards.js · api/sync.js · api/history.js ·         │
│  api/misc.js        ← 纯函数：取数→数据对象，不碰框架    │
│  server.js（装配/端口/优雅关闭）· static.js（托管 web-  │
│  dist，内置 serveStatic 穿越防护）· git.js（只读 log）  │
└───────────────▲────────────────────────────────────────┘
                │ 只读 fs / 只读 spawn(git)
┌───────────────┴────────────────────────────────────────┐
│  数据源 ~/.evokit（全程零写入）                          │
│  context.md · knowledge/（卡+索引+references）·         │
│  state.json · settings.json · reports/ · knowledge/.git │
└─────────────────────────────────────────────────────────┘
```

数据流：每次请求现读现聚合，无缓存层、无后台任务；web 进程对 `~/.evokit` 只有 `readFile/readdir/stat` 与只读 `git log`。

## 4. 服务端框架选型（定稿 h3 ^2.0.8）

### 4.1 候选调查摘要（2026-11-08）

| 维度 | **h3 2.0.8** | Koa 3.3.0 | Fastify 5.12.8 | Express 5.3.0 |
| --- | --- | --- | --- | --- |
| 许可证 / 依赖包数（实测安装） | MIT / **3** | MIT / ~53（本体+router+static） | MIT / 较多（插件体系） | MIT / 28 |
| 维护方 | UnJS（pi0），repo h3js/h3 | koajs 社区团队（Express 原班设计；**正在招募维护者**） | OpenJS 基金会，5 lead + 约 30 人团队 | OpenJS，TC 8 人，维护已复苏 |
| 发布节奏（近 12 月） | 43 个版本（15 stable） | 4 次发版；2.x 安全双线同日修复 | 高频 patch，安全公告次日配套 | v5.3.0（2026-10）活跃 |
| 生态采用 | 月下载 1.43 亿；Nuxt/Nitro 全生态；Nitro 3 已用 v2 | 35.6k stars，Egg 等基于它 | 33k stars；@fastify/static 周下载 143 万 | 最大存量 |
| ESM | **原生 ESM** | CJS 本体 + mjs wrapper | 双格式 | CJS |
| 错误输出 | **内置结构化 JSON**（PoC 证实） | 默认 text/plain，需自写中间件 | 内置 JSON（schema 体系） | HTML 默认 |
| 静态托管 | 内置 serveStatic（v2 需 ~20 行 fs 适配，**穿越防护内置**） | **官方 @koa/static 已从 npm registry 消失（实测 404）**，用社区 koa-static@5 | @fastify/static（生态健康） | 社区包 |
| 主要顾虑 | v2 稳定线仅自 2026-10-03（~5 周）；核心维护者集中于 pi0（bus factor） | 维护人手偏紧；静态中间件生态动摇 | 对 13 端点 GET-only 小服务偏重 | 风格老旧、无内建校验 |

关键事实：h3 近期修复过 serveStatic 路径穿越漏洞 [CVE-2026-86253](https://nvd.nist.gov/vuln/detail/CVE-2026-86253)（修复于 1.15.6 / 2.0.1-rc.15，2.0.8 含修复）；h3 v1 线 2026-04 后停更，**v2 是唯一未来**；Nuxt 4 稳定线仍在 h3 v1（生产验证参考）。

### 4.2 本机 PoC 实测（同规格对照，全部通过项见 ✓）

| 实测项 | h3 2.0.8 | Koa 3.3.0 |
| --- | --- | --- |
| GET / 返回 JSON | ✓ 200 | ✓ 200 |
| 列表 / `:param` 路由 | ✓ | ✓ |
| handler 抛错（/api/boom） | ✓ 500 + 结构化 JSON `{status,statusText,message}` | 500 + text/plain（需自写错误中间件） |
| 静态文件 + content-type | ✓（内置 serveStatic + fs 适配 ~20 行） | ✓（koa-static，社区包） |
| 404 | ✓ JSON | ✓ text |
| 未定义方法（POST） | 404 | **405**（allowedMethods） |
| 编码穿越 `/static/..%2fserver.mjs` | ✓ **404**（防护内置） | ✓ 403（koa-send 检查） |
| 明文穿越 `--path-as-is` | ✓ 404 | ✓ 403 |

### 4.3 定稿理由与风险缓解

- **选 h3**：依赖面 3 vs ~53（供应链与升级风险最小）；ESM 原生与仓库纯 ESM 天然契合；错误边界与穿越防护内置且 PoC 证实；UnJS 生态采用量极大；「服务稳定」在这台机器上的可验证形态 = 最小依赖 + 内置安全基线 + 锁版本。
- **v2 偏新的缓解**：lockfile 锁定 2.0.8；只用 v2 核心 API 面（createApp / createRouter / defineEventHandler / getRouterParam / serveStatic / toNodeHandler / withBase，类型定义已核实）；**框架隔离纪律**——h3 只允许在 `cli/src/web/server.js` 与 `static.js` 出现，`api/*.js` 为纯函数，未来换 Koa/Fastify 只重写两个装配文件。
- **备选预案**：Koa 3（第一备选，迁移成本 = 重写装配层）；Fastify 5（若未来对组织化维护要求更高）。

## 5. 前端技术栈总表

| 用途 | 选型 | 许可证 | 引入方式 | 备注 |
| --- | --- | --- | --- | --- |
| 脚手架/构建 | Vite（create-vue 初始化） | MIT | devDep | 官方 Vue 生态默认 |
| UI 框架 | Vue 3 | MIT | devDep | 备选 React 18 + Ant Design |
| 组件库 | Element Plus（unplugin-vue-components 按需） | MIT | devDep | 表格/标签/描述/时间线组件与本控制台一一对应 |
| 路由 | Vue Router 4 | MIT | devDep | 路由级懒加载（每页独立 chunk） |
| Markdown | markdown-it（html:false） | MIT | devDep | 渲染失败降级显示原文 |
| 图表 | ECharts（echarts/core 按需：Bar/Line） | Apache-2.0 | devDep | 仅召回统计/采集概览两处 |
| 状态管理 | 不引入 | — | — | 服务端是真源，composables + fetch 足够 |

约束：全部仅 devDependencies；构建期 Node ≥ 20.19（本机 24 满足），运行期静态文件 + Node ≥18；离线纪律（无 CDN、无外部字体、无遥测）；lockfile 提交。

## 6. 仓库结构与构建链路（含 400 行拆分设计）

```
cli/
  web/                          # 前端源码（node_modules 不入库）
    package.json / vite.config.js / index.html
    src/
      main.js                   # 入口装配（<80 行）
      router.js                 # 路由表 + 懒加载（<120 行）
      composables/useApi.js     # fetch 封装 + 错误约定（<100 行）
      components/               # 公共组件：CardMeta / MarkdownView /
        ...                     #   CountCard / StatusTag（各 <200 行）
      views/                    # 一页一文件（各 <250 行，见 §10）
  web-dist/                     # 构建产物（不入库，.gitignore；服务端读磁盘）
  src/
    commands/web.js             # 参数解析 + 软依赖探测 + 启动横幅（<120 行）
    web/
      server.js                 # h3 装配 / 端口策略 / 优雅关闭（<200 行）
      static.js                 # web-dist 托管（serveStatic + fs 适配）（<120 行）
      api/cards.js              # overview / cards / detail / 三分区 / search（<250 行）
      api/sync.js               # sync-status（<100 行）
      api/history.js            # git 历史两端点（<100 行）
      api/misc.js               # context / recall-stats / reports / inbox（<250 行）
      git.js                    # 只读 git log 封装 + 降级（<100 行）
  package.json                  # dependencies: h3 ^2.0.8；files += web-dist
```

- 每个文件标注了预估行数上限，均 <400（D7）。
- **软依赖设计**：`evokit web` 启动时 `await import('h3')` 失败 → 打印「`evokit web` 需要 web 服务端依赖：请在 `cli/` 目录执行 `npm install`」后退出（exit 1）；其余 CLI 命令不受 node_modules 是否存在影响。npm 发布时 h3 进 `dependencies`，正常安装即含。
- `.gitignore` 追加 `cli/web/node_modules/`。
- 构建链路：`cd cli/web && npm install`（一次性）→ 开发期 `node cli/evokit.mjs web` + `npm run dev`（Vite 5173 代理 /api）→ `npm run build` 产物仅存本地（不入库，2026-11-09 策略收口）→ 产物模式即最终形态。npm 发布前需先构建（files 白名单仍含 web-dist）。

## 7. 服务端设计（h3 实现细节）

- **装配**：`createApp()` + `createRouter()`；`createServer(toNodeHandler(app)).listen(4177, '127.0.0.1')`（v2 无 `app.listen`，PoC 已验证此形态）。
- **路由**：只读端点全部显式 `router.get(...)` 注册；命令执行是唯一写通道（`router.post('/exec')` + `router.get('/exec/status')`，白名单见 `src/web/exec.js`）；未匹配请求统一落 JSON 404 兜底 handler。
- **错误边界**：全局 `onError` 统一输出 `{ "error": { "code", "message" } }`（h3 抛出的 `createError` 保留其 status；未知异常 500 且**进程不退出**，PoC 已验证抛错后服务继续可用）。
- **静态托管**：自实现静态解析（repl 内置 serveStatic，理由见 §1 实现期修订）：query 剥离、`resolve + startsWith(root)` 穿越校验、Content-Type 白名单、`assets/` 带 hash 资源 immutable、index.html no-cache；无扩展名路径兜底回 index.html；staticRoot 缺失时全量 503 并提示构建命令（服务不崩，真机验证）。
- **端口策略**：默认 4177；显式 `--port` 被占用 → 报错退出；未显式 → 4177 起自动探测至多 +10，打印实际 URL；`--open` 可选（Windows `start`，失败仅提示）。
- **稳定性纪律**：单请求异常不影响进程；`SIGINT/SIGTERM` → `server.close()` + 3 秒超时兜底退出；浏览类端点无任何写调用、不触发 autoSync、不推进水位线。
- **命令执行（FR-13 / D9）**：`src/web/exec.js` 白名单制（6 个 safe + 9 个 confirm），spawn 直传参数不走 shell、全局互斥（busy → 409 conflict）、默认 5 分钟超时（超时 kill 并标记 timedOut）；`web`/`hook` 在命令与参数两级永久禁止。**流式输出（2026-11-09）**：响应为 text/plain 直通流（Readable.toWeb(PassThrough)），stdout/stderr 逐块实时回传，服务端不留存输出（无截断上限需求）；命令结束后追加 `---evokit-exit---{exitCode,timedOut,durationMs,tier}` 元数据行供前端解析。子进程环境注入 NO_COLOR / FORCE_COLOR=0 / CLICOLOR=0 减少 ANSI 转义，前端 `src/web/../utils/ansi.js` 手写 SGR→HTML 着色兑底（前景 8+8 色/粗体/dim，非 SGR 转义剥离，先转义再注入 span 无 XSS 面）。

## 8. API 规格（全部 GET）

| 路径 | 返回要点 | 数据来源（复用） |
| --- | --- | --- |
| `/api/overview` | 四区计数、索引行数、同步摘要、最近入库时间 | listCards + knowledge-index + git log -1 |
| `/api/context` | `{ raw, targets[] }` | context.md + settings.agents |
| `/api/cards` | confirmed 列表（front 全字段 + 摘要），`?type=&tag=&sort=` | knowledge-cards.listCards(excludeHidden) |
| `/api/cards/:id` | `{ front, body, recallHits, hasGit }` | readCardById + references 计数 |
| `/api/pending` `/api/archive` `/api/rejected` | 分区列表 | listCards(对应目录) |
| `/api/search?q=` | `{ id, title, type, score, tags }[]`，同词同序对齐 CLI | tokenScore + refCount 排序 |
| `/api/sync-status` | 每入口 `{ agent, status, lastSyncAt }` | entry-content.collectPartsForTarget + BEGIN/END |
| `/api/history` | `{ available, commits[] }` | git.js（无 .git 降级） |
| `/api/history/:id` | 单卡历史 | git log --follow |
| `/api/recall-stats` | `{ total, byCard[], byDay[] }` | references.jsonl 聚合 |
| `/api/reports` `/api/reports/:name` | 列表 / `{ raw }` | readdir + 文件名白名单 |
| `/api/inbox` | `{ sources[], distill }`（聚合，不吐逐文件明细） | state.json |

**口径差异（唯一）**：CLI `evokit recall` 展示命中会写 references.jsonl；web 检索只读不复写，避免浏览污染命中统计。评分与排序口径与 CLI 完全一致（AC-3 不受影响）。

## 9. 复用与必要小改动清单（已核实）

| 复用点 | 现状 | 动作 |
| --- | --- | --- |
| 知识根隔离 | `paths.js` 已支持 `EVOKIT_HOME` | 无需改动 |
| 卡片解析 | `knowledge-cards.js` parseCard / listCards / readCardById 等已导出 | 直接复用 |
| 检索评分 | `tokenScore` 在 `commands/recall.js` 内部未导出 | 加 `export`（行为不变） |
| 引用日志 | `references.js` readReferences / appendReference | 只用 read |
| 托管块期望值 | `entry-content.js` collectPartsForTarget 已导出 | 直接复用，不改 check 命令 |
| git 历史 | 无现成封装 | 新增 `web/git.js`（spawn 只读，降级） |
| 索引解析 | `knowledge-index.js` 已有 | 直接复用 |

## 10. 前端页面与模块化（D8）

路由（13 页，一页一 SFC，均 <250 行）：

| 路由 | 页面 | FR |
| --- | --- | --- |
| `/` | 总览：计数卡 + 同步摘要 + 最近动态 | FR-2 |
| `/context` | 全局偏好渲染 + 托管块边界标注 | FR-3 |
| `/index` | 知识索引（行内跳卡片） | FR-4 |
| `/cards` `/cards/:id` | 知识卡列表（筛选/排序）/ 详情（元数据+正文+召回次数+历史入口） | FR-4/5 |
| `/pending` `/archive` `/rejected` | 三分区列表（待审醒目） | FR-6 |
| `/search` | 检索（评分可见） | FR-7 |
| `/sync` | 三入口同步状态 | FR-8 |
| `/history` | git 时间线 → 单卡下钻 | FR-9 |
| `/recall-stats` | 按卡 Top 柱状 + 按日趋势（ECharts） | FR-10 |
| `/reports` `/reports/:name` | 报告库 / 阅读器 | FR-11 |
| `/inbox` | 9 源统计 + distill 水位线 | FR-12 |

模块化纪律：公共 UI 抽到 `components/`（CardMeta、MarkdownView、CountCard、StatusTag）；数据获取统一 `composables/useApi.js`；**路由级懒加载**（`() => import('./views/X.vue')`，每页独立 chunk）；单 SFC >250 行即审视拆分，硬上限 400 行。

## 11. 文件规模纪律（D7：>400 行必须拆分）

- **规则**：本次新增的所有文件（服务端 + 前端 + 测试 + 脚本）≤400 行（含空行注释）；拆分导向 = 按域/按职责（§6 预估已按此设计）。
- **强制**：W3 阶段新增 `scripts/check-file-size.mjs`（扫 `cli/src/**`、`cli/web/src/**`，>400 行即非零退出），纳入测试清单与 `evokit web` 完工验收。
- **存量盘点（2026-11-08 实测）**：超限 7 个——`src/distill.js`（698）、`src/commands/review.js`（490）、`src/harvest/adapters.js`（450）、四个既有测试套件 `test-local.mjs`（755）/ `test-m2.mjs`（766）/ `test-m6.mjs`（646）/ `test-m1-lib.mjs`（461）。**本次全部不触碰**（不在任务范围、不擅改无关代码），已在 `scripts/check-file-size.mjs` EXEMPTIONS 表登记，拆分待作者单独授权后再立任务。

## 12. 验收标准映射

| AC（需求文档 §10） | 实现点 / 验证方式 |
| --- | --- |
| AC-1 计数一致 | /api/overview；测试断言 + 真机对照 |
| AC-2 详情一致 | /api/cards/:id；front 全字段断言 |
| AC-3 检索同词同序 | tokenScore 复用；fixture 对拍 |
| AC-4 同步判定同 check | 复用 collectPartsForTarget；真机对拍 |
| AC-5 git 历史一致 | /api/history；断言条数与主题 |
| AC-6 全程零写入 | 目录快照前后对比 |
| AC-7 穿越拒绝 | 静态与 `:name` 白名单；PoC 同款载荷复测 |
| AC-8 测试全绿 | test-m7-web 新增；九套 + check-file-size 不回归 |
| AC-9 真机演练 | 产物模式按清单手工过 |

## 13. 测试方案（cli/test-m7-web.mjs）

1. **夹具**：临时 `EVOKIT_HOME`（现成机制），2 confirmed + 1 pending + 1 archive + 1 rejected + index + references 3 行 + settings.json；有 git 则 init + 1 commit。
2. **启动**：server 支持 `listen(0)` 供测试取实际端口；`fetch` 断言端点状态码与关键字段。
3. **只读断言**：全部端点遍历前后，夹具目录树（路径,size,mtime）快照零变化。
4. **安全断言**：`/api/reports/..%2F..%2Fsettings.json`、静态穿越载荷（编码 + 明文，PoC 同款）→ 4xx；POST 未注册路径 → 404 JSON。
5. **口径对拍**：search 输出 vs tokenScore 规则手算同序同分。
6. **稳定性断言**：/api/boom 触发 500 后，继续请求 / 仍 200（进程不退出）；`server.close()` 优雅退出测试。
7. **软依赖断言**：模拟 h3 import 失败（如重命名 node_modules 临时目录）→ web 命令打印安装提示并 exit 1，`evokit check` 等命令不受影响。
8. **前端冒烟**：`npm run build` 成功 + `web-dist/index.html` 存在 + 各 view chunk 生成；UI 交互按 AC-9 手工验收。

## 14. 任务拆分与预估

| 阶段 | 内容 | 预估 |
| --- | --- | --- |
| W0 | h3 接入（软依赖 + server.js 装配 + 错误边界 + 优雅关闭）+ create-vue 脚手架 + 构建入库链路 | 0.5 天 |
| W1 | api/ 四模块全部端点 + 基线页面（总览/偏好/索引/卡片/详情/三分区/检索） | 1 天 |
| W2 | 五面板（同步/历史/召回统计/报告库/采集概览）+ components 抽取 | 0.5~1 天 |
| W3 | test-m7-web + check-file-size.mjs + 真机验收（AC-1~9）+ cli/README 与 docs 增补 | 0.5 天 |

合计 **2.5~3 个工作日**。

## 15. 风险与对策

| # | 风险 | 对策 |
| --- | --- | --- |
| R1 | h3 v2 稳定线年轻（~5 周）+ 核心维护者集中 | lockfile 锁 2.0.8；只用核心 API 面；框架隔离纪律（换框架只动 server.js/static.js）；Koa/Fastify 备选预案 |
| R2 | web 引入运行时依赖（h3）改变「clone 即用」 | 软依赖 + 友好降级提示；核心 CLI 命令零依赖不受影响 |
| R3 | 产物不入库（D4 2026-11-09 变更）后 clone 忘构建，页面打不开 | static.js 降级已内置：产物缺失时静态请求统一 503 并提示构建命令（test-m7 有断言）；文档注明构建步骤；原「入库 diff 噪音」风险随 D4 变更消除 |
| R4 | 组件/图表体积 | unplugin 按需 + echarts/core；路由懒加载分 chunk |
| R5 | 手写 http 边界（编码/长度）已由 h3 承担 | 保留响应 Content-Length 显式设置 |
| R6 | git 不可用 / 知识根未 init | history 降级 `{available:false}` |
| R7 | 依赖升级破坏构建/运行 | lockfile 提交；运行依赖仅 h3 一项，升级走显式 commit |

## 16. 待评审确认项

| # | 事项 | 默认方案 | 推翻成本 |
| --- | --- | --- | --- |
| D3 | 服务端框架 | **h3 ^2.0.8**（PoC + 调查定稿） | 换 Koa 3：重写 server.js/static.js 装配层（~半天）；换 Fastify 5：同量级 |
| D1 | 软依赖策略 | h3 进 cli dependencies，web 命令降级提示 | 改 optionalDependencies：安装失败静默，代价是报错时机后移 |
| D7 | 400 行规则范围 | 本次新增文件强制 + 存量 3 文件登记不动 | 存量也立即拆：需单独授权，预计 +0.5 天 |
| D4/D5/D6 | 产物入库 / 端口 4177 / 前端不用 TS | 同 v0.1 | 一行常量 |
