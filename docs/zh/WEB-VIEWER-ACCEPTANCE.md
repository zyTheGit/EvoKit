# EvoKit 网页端验收记录（AC-1～9）

> 2026-11-08 · 对应需求文档 [WEB-VIEWER-REQUIREMENTS.md](./WEB-VIEWER-REQUIREMENTS.md) §10、技术设计 [WEB-VIEWER-TECH-DESIGN.md](./WEB-VIEWER-TECH-DESIGN.md)
> 环境：Windows、Node 24.20.0、真实知识根 `~/.evokit`（实现提交 b4f9d61 / 52d5b44 / e4a7c3c）

## 结论：九条验收标准全部通过

## 第二轮验收（2026-11-08 追加：菜单收敛 + FR-13 命令执行 + 轻量美化）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 菜单收敛 | ✅ | 13 项平铺 → 2 组 11 项（内容 / 运行与操作）；待审/归档/拒绝并入「知识卡」页内 tab，旧路由重定向兼容 |
| FR-13 命令执行 | ✅ | test-m7 增至 67 断言：白名单外 400 bad_request、参数含 web/hook 400、help/recall 真实执行、CLI 写口径（网页执行 recall 后 references +2，与浏览检索不写形成对照）；confirm 类前端二次确认；互斥 409 conflict 映射 |
| 真机冒烟 | ✅ | 4177 重启后总览/抽查端点全 200；命令执行页 check/recall --json 实跑正常 |
| 轻量美化 | ✅ | 品牌区渐变字、菜单分组与圆角、命令输出终端风深色块；深度美化（暗色主题等）列后续 |
| 流式实时输出 + ANSI 着色（2026-11-09 追加） | ✅ | POST /api/exec 改 text/plain 直通流（输出逐块实时回显、自动滚动），末尾 `---evokit-exit---` 元数据行；子进程注入 NO_COLOR/FORCE_COLOR=0 + 前端手写 SGR→HTML 着色兑底，终端不再出现 `[90m`/`[33m` 类占位符；test-m7 增至 69 断言 |
| 命令文档面板（2026-11-09 追加） | ✅ | `GET /api/exec/docs` 返回 15 条命令说明，与白名单逐项一致（command-docs.js 内置一致性校验，不同步即抛错）；前端「选即显」面板 + 全部文档 tab + 示例点击回填；test-m7 断言 docs 端点契约 |
| D4 产物不入库（2026-11-09 追加） | ✅ | `git ls-files cli/web-dist` 0 个跟踪文件 + .gitignore 已含 `cli/web-dist/`；产物缺失时静态层统一 503 并提示构建命令（test-m7 断言）；本地产物在 4177 正常服务（首页/端点 200），配套 README×2 / 技术设计 R3 / vite 注释同步收口 |

以下为第一轮（纯只读基线）验收记录：

| AC | 验收项 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-1 | 总览计数与实测一致 | ✅ | `/api/overview` 返回 confirmed 7 / pending 1 / archive 2 / rejected 1、索引 7 行，与目录实测一致；syncSummary 3/0/0 与 `evokit check` 三入口全一致；最近提交 042f3f4e「gc: archive 2 cards」与知识根 git log 第 1 条一致 |
| AC-2 | 卡片详情与文件一致 | ✅ | 浏览器实测中文 id 卡详情：frontmatter 全字段（id/title/type/status/source/confidence/updated/verdict/tags/evidence/acceptedBy/acceptedAt）+ 正文 + 来源路径完整渲染 |
| AC-3 | 检索与 recall 同词同序 | ✅ | `GET /api/search?q=软链接` 与 `evokit recall 软链接 --json` 输出同序同分（score 3 → 1，两卡顺序一致）；网页检索不写 references（口径差异见需求 FR-7） |
| AC-4 | 同步判定与 check 一致 | ✅ | `/api/sync-status` 三入口 consistent == `evokit check` 三行「一致」（期望块 = context + knowledge-index 合并） |
| AC-5 | git 历史一致 | ✅ | `/api/history` available=true、commits=9，与知识根 `git log --oneline` 条数一致 |
| AC-6 | 全程零写入 | ✅ | 浏览器遍历全部页面 + 全部 API 调用前后，`~/.evokit` 355 个文件的（路径,size,mtime）聚合指纹完全一致；夹具级快照断言在 test-m7 同样通过 |
| AC-7 | 路径穿越拒绝 | ✅ | `/api/cards/..%2F..%2Fsettings.json`、`/api/reports/%2e%2e%2fsettings.json`、`/assets/..%2f…` 三类载荷均 4xx；POST 未注册路径统一 404 JSON |
| AC-8 | 测试全绿不回归 | ✅ | 十套 866 断言全绿：test-local 141 / m0 113 / m1-lib 33 / m2 158 / m3 77 / m4 67 / m4-lib 25 / m5 59 / m6 134 / **m7-web 59（新增）**；`check-file-size` 82 个文件 ≤400 行（7 个存量豁免）；`check-docs-sync` 通过 |
| AC-9 | 真机演练全量可见 | ✅ | 浏览器实机遍历：总览（计数+同步摘要+最近提交）、知识卡列表（7 张+筛选器）、卡片详情、召回统计（ECharts 双图渲染）、采集概览（9 源水位线+distill 空态）、同步状态（三入口）；软依赖冒烟：移除 h3 后 `evokit web` 友好报错 exit 1、恢复后核心命令无恙 |

## 实现期发现并修复的问题

1. **h3 v2 路由语义**：`use()` 均属「中间件阶段」先于路由表执行，`app.use('/**', 兜底)` 会全量拦截 API——改为 `/api/**` 模式守卫挂载 + 裸静态中间件殿后（详见技术设计 §1 实现期修订）。
2. **getRouterParam 不解码**：中文 id 404（夹具纯 ASCII 未能提前暴露）——server 层统一 decodeURIComponent + 夹具补中文 id 卡防回归。
3. **h3 serveStatic 与 query 串**：event.path 携带 search 会污染资源 id——静态层改自实现（query 剥离 + resolve 前缀防穿越）。
4. **显式端口被占**：`--port 4177` 被旧进程占用时报错退出按设计工作（验收期间实际发生一次）。

## 已知小项（不阻塞）

- RecallStatsView chunk 约 518KB（gzip 176KB）：ECharts 按需引入后的体积，本机应用不作硬性指标（技术设计 R4）。
- 存量 7 个超 400 行文件已登记豁免，拆分待作者单独授权（技术设计 §11）。
- 根 README「零运行时依赖」表述：CLI 核心命令仍零依赖，`evokit web` 为软依赖（h3），描述已在 package.json 与 cli/README 精确化。
