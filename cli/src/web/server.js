// web 服务端装配（M7/W0）：h3 v2 + node:http
// 框架隔离纪律（技术设计 D3）：h3 import 只允许出现在本文件与 static.js；api/*.js 均为纯数据函数
//
// h3 v2 路由语义（实测 2026-11-08，踩坑记录）：
//   use() 无论带不带 pattern 都属于「中间件阶段」，先于路由表（.get/createRouter）执行；
//   因此不能用 app.use('/**', 静态) 做兜底——它会全量拦截包括 API 在内的一切请求。
//   正确结构：API 路由器以带模式守卫的中间件挂载（app.use('/api/**', withBase('/api', router.handler))），
//   静态层作为裸中间件殿后（中间件按注册顺序执行，未匹配的请求依次透传）。
//
// 端口策略：默认 4177；显式 --port 被占 → 报错退出；未显式 → 自动探测 +1..+10
// 稳定性：单请求异常 → 统一 500 JSON（进程不退出）；SIGINT/SIGTERM → server.close + 3s 兜底退出

import { createApp, createRouter, defineEventHandler, toNodeHandler, withBase, getQuery, getRouterParam, readBody } from 'h3';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonError, errorStatusCode, errorCode } from './respond.js';
import { staticHandler } from './static.js';
import { execStatus, runCommand } from './exec.js';
import * as cardsApi from './api/cards.js';
import { syncEntries } from './api/sync.js';
import * as historyApi from './api/history.js';
import * as miscApi from './api/misc.js';

const DEFAULT_PORT = 4177;
const PROBE_EXTRA = 10; // 未显式指定端口时向后探测的额外次数

// cli/src/web/server.js → 包根 cli/（三层 dirname）
const PKG_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** 路由参数统一解码：h3 v2 的 getRouterParam 返回原始 URL 段（中文/特殊字符保持 %xx 形态） */
function param(event, name) {
  const raw = getRouterParam(event, name);
  if (raw === undefined || raw === null) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw; // 畸形编码按原样处理（下游路径守卫会拦截）
  }
}

/** 把纯数据函数包成 h3 事件处理器：统一错误 JSON 形态，任何异常都不击穿进程 */
function wrap(fn) {
  return defineEventHandler(async (event) => {
    try {
      return await fn(event);
    } catch (err) {
      const status = errorStatusCode(err);
      return jsonError(status, errorCode(status), err?.message ?? String(err));
    }
  });
}

/**
 * API 路由器（13 个只读端点 + 2 个命令执行端点）。
 * 注意：经 withBase('/api', ...) 挂载时前缀被剥掉，因此这里注册的路径不带 /api 前缀。
 * 命令执行是唯一的写通道：POST /exec 白名单 + 互斥 + 超时（技术设计 D9）。
 */
function buildRouter(extraRoutes = []) {
  const router = createRouter();
  router.get('/overview', wrap(() => cardsApi.overview()));
  router.get('/context', wrap(() => miscApi.contextData()));
  router.get('/cards', wrap((event) => cardsApi.listCardsFiltered(getQuery(event) ?? {})));
  router.get('/cards/:id', wrap((event) => cardsApi.cardDetail(param(event, 'id'))));
  router.get('/pending', wrap(() => cardsApi.zoneCards('pending')));
  router.get('/archive', wrap(() => cardsApi.zoneCards('archive')));
  router.get('/rejected', wrap(() => cardsApi.zoneCards('rejected')));
  router.get('/search', wrap((event) => cardsApi.searchCards(getQuery(event)?.q)));
  router.get('/sync-status', wrap(() => ({ entries: syncEntries() })));
  router.get('/history', wrap(() => historyApi.historyAll()));
  router.get('/history/:id', wrap((event) => historyApi.historyCard(param(event, 'id'))));
  router.get('/recall-stats', wrap(() => miscApi.recallStats()));
  router.get('/reports', wrap(() => miscApi.reportsList()));
  router.get('/reports/:name', wrap((event) => miscApi.reportData(param(event, 'name'))));
  router.get('/inbox', wrap(() => miscApi.inboxData()));
  // ── 命令执行（FR-13）：唯一写通道，白名单见 src/web/exec.js ──
  router.get('/exec/status', wrap(() => execStatus()));
  router.post('/exec', wrap(async (event) => {
    const body = await readBody(event) ?? {};
    const result = await runCommand(body.cmd, body.args, { timeoutMs: body.timeoutMs });
    // runCommand 返回 {status, body} 包装：非 200 转成带 statusCode 的异常（wrap 统一 JSON 错误），200 直接返回结果体
    if (result.status !== 200) {
      throw Object.assign(new Error(result.body.error.message), { statusCode: result.status });
    }
    return result.body;
  }));
  // 测试注入口（如 /api/__boom 验证错误边界与进程存活）；路径兼容带/不带 /api 前缀两种写法
  for (const route of extraRoutes) {
    const path = route.path.replace(/^\/api(?=\/|$)/, '') || '/';
    router.get(path, wrap(route.handler));
  }
  return router;
}

/**
 * 启动 web 服务（供 commands/web.js 与测试使用）。
 * @param {{ port?: number, staticRoot?: string, extraRoutes?: Array<{path: string, handler: Function}> }} [options]
 *   port：显式端口（0 = 测试用，OS 分配实际端口）；未指定 → 默认 4177 并自动探测 +1..+10
 * @returns {Promise<{ server: import('node:http').Server, url: string, port: number, close: () => Promise<void> }>}
 */
export async function startServer(options = {}) {
  const explicit = options.port !== undefined && options.port !== null;
  const basePort = explicit ? Number(options.port) : DEFAULT_PORT;
  if (explicit && (!Number.isInteger(basePort) || basePort < 0 || basePort > 65535)) {
    throw new Error(`端口不合法：${options.port}`);
  }

  const app = createApp();
  const router = buildRouter(options.extraRoutes ?? []);
  const routerHandler = router.handler ?? router; // h3 v2 H3 实例暴露 .handler
  app.use('/api/**', withBase('/api', routerHandler)); // 带模式守卫：非 /api 路径不进入路由器
  app.use(staticHandler(options.staticRoot ?? join(PKG_ROOT, 'web-dist'))); // 裸中间件殿后：托管产物 + SPA 兜底

  let server = null;
  const lastPort = explicit ? basePort : basePort + PROBE_EXTRA;
  for (let port = basePort; port <= lastPort; port += 1) {
    try {
      server = await new Promise((resolvePromise, reject) => {
        const s = createServer(toNodeHandler(app));
        s.once('error', reject);
        s.listen(port, '127.0.0.1', () => resolvePromise(s));
      });
      break;
    } catch {
      // 端口被占：显式指定时循环只跑一轮即报错；未显式时探测下一个
    }
  }
  if (!server) {
    throw new Error(`端口 ${basePort}${explicit ? '' : `~${lastPort}`} 均不可用，请用 --port 指定其他端口`);
  }

  const url = `http://127.0.0.1:${server.address().port}`;
  const close = () => new Promise((resolvePromise) => server.close(() => resolvePromise()));
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref(); // 兜底：连接未排空也强制退出
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return { server, url, port: server.address().port, close };
}
