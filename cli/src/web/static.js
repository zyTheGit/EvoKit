// 静态托管（web 唯二允许 import h3 的文件之一）：托管 cli/web-dist 构建产物
// 实现说明：h3 v2 的 serveStatic 从 event.path 推导资源 id，而 event.path 会携带 query 串，
// 故改为自实现静态解析（语义与 serveStatic 等效）：query 剥离 + resolve 前缀防穿越 + SPA 兜底。
// 路由：hash 模式 SPA，只有 '/' 与 /assets/*（Vite 产物）；无扩展名路径一律兜底回 index.html。
// 降级：staticRoot 不存在或缺 index.html → 全部静态请求 503，提示构建命令（服务不崩）。

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { defineEventHandler } from 'h3';
import { jsonError } from './respond.js';

// Content-Type 白名单（Vite 产物实际会出现的类型）
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

/**
 * 构造静态处理器（裸中间件，注册在 API 路由器之后）。
 * @param {string} staticRoot 构建产物目录（默认 cli/web-dist）
 */
export function staticHandler(staticRoot) {
  const root = resolve(staticRoot);
  const ready = existsSync(join(root, 'index.html'));

  return defineEventHandler(async (event) => {
    // query 串剥离（h3 v2 event.path 携带 search；静态资源路径不应包含它）
    const path = (event.path || '/').split('?')[0];
    // API 未匹配路由统一 JSON 404（路由器透传下来的请求）
    if (path === '/api' || path.startsWith('/api/')) {
      return jsonError(404, 'not_found', `未知 API 端点：${path}`);
    }
    if (!ready) return jsonError(503, 'unavailable', '前端构建产物缺失：cd cli/web && npm run build');

    const rel = path === '/' ? 'index.html' : path.slice(1);
    const file = resolve(root, rel);
    // 穿越双保险：resolve 后必须仍位于 root 内（'..' 与编码载荷都会在此被拦下）
    if (file === root || file.startsWith(root + sep)) {
      try {
        const st = statSync(file);
        if (st.isFile()) {
          return new Response(createReadStream(file), {
            headers: {
              'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
              'cache-control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
            },
          });
        }
      } catch { /* 权限/竞态等异常按不存在处理 */ }
    }
    // 无扩展名路径（hash SPA 深链兜底）或根路径 → 回 index.html
    if (rel === 'index.html' || !rel.includes('.')) {
      try {
        return new Response(readFileSync(join(root, 'index.html')), {
          headers: { 'content-type': CONTENT_TYPES['.html'], 'cache-control': 'no-cache' },
        });
      } catch {
        return jsonError(404, 'not_found', '静态文件不存在');
      }
    }
    return jsonError(404, 'not_found', `静态文件不存在：${path}`);
  });
}
