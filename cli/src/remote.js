// 远程源拉取（零依赖，用 Node 内置 http/https/tls/net）

import { EVOKIT_DIR } from './paths.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import net from 'node:net';

/** 判断是否远程源（http/https） */
export function isRemote(source) {
  return /^https?:\/\//i.test(source);
}

/** 根据 URL 生成稳定的本地缓存文件名 */
function cacheKey(url) {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

/** 本地缓存目录 ~/.evokit/cache/ */
function cacheDir() {
  const dir = join(EVOKIT_DIR, 'cache');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 解析代理配置：
 *   1. 优先用资源上的 proxy 字段
 *   2. 回退到环境变量 HTTPS_PROXY / https_proxy / HTTP_PROXY / http_proxy
 * 返回 { host, port, auth } 或 null。
 */
export function resolveProxy(proxyField) {
  const raw = proxyField
    || process.env.HTTPS_PROXY
    || process.env.https_proxy
    || process.env.HTTP_PROXY
    || process.env.http_proxy
    || null;
  if (!raw) return null;

  try {
    const u = new URL(raw);
    const host = u.hostname;
    const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
    const auth = u.username
      ? 'Basic ' + Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password || '')}`).toString('base64')
      : null;
    return { host, port, auth, isHttpsProxy: u.protocol === 'https:' };
  } catch {
    // URL 解析失败，回退简单 host:port 解析
    const m = raw.match(/^(?:https?:\/\/)?(?:[^@]+@)?([^:]+):(\d+)/);
    if (!m) return null;
    return { host: m[1], port: Number(m[2]), auth: null, isHttpsProxy: false };
  }
}

/**
 * 通过 HTTP CONNECT 隧道建立到目标 host:port 的 TCP 连接（用于 HTTPS 目标）。
 */
function connectTunnel(proxy, host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxy.port, proxy.host);
    const headers = [
      `CONNECT ${host}:${port} HTTP/1.1`,
      `Host: ${host}:${port}`,
    ];
    if (proxy.auth) headers.push(`Proxy-Authorization: ${proxy.auth}`);
    headers.push('', '');

    socket.once('connect', () => {
      socket.write(headers.join('\r\n'));
    });
    socket.once('error', reject);

    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString('latin1');
      const idx = buf.indexOf('\r\n\r\n');
      if (idx === -1) return;
      const statusLine = buf.slice(0, idx).split('\r\n')[0];
      socket.removeListener('data', onData);
      const m = statusLine.match(/^HTTP\/\d\.\d\s+(\d+)/);
      if (m && m[1] === '200') {
        resolve(socket);
      } else {
        socket.destroy();
        reject(new Error(`代理 CONNECT 失败：${statusLine}`));
      }
    };
    socket.on('data', onData);
  });
}

/**
 * 通过代理拉取 http(s) 内容。
 * HTTP 目标：向代理发绝对 URI 的 GET；
 * HTTPS 目标：CONNECT 隧道 + TLS。
 */
function fetchViaProxy(urlObj, proxy) {
  return new Promise((resolve, reject) => {
    const isHttps = urlObj.protocol === 'https:';

    if (!isHttps) {
      // HTTP 目标：直接向代理发绝对 URI 请求
      const agent = proxy.isHttpsProxy ? new https.Agent({}) : new http.Agent({});
      const reqOpts = {
        host: proxy.host,
        port: proxy.port,
        method: 'GET',
        path: urlObj.href,
        agent,
        headers: {
          Host: urlObj.host,
        },
      };
      if (proxy.auth) reqOpts.headers['Proxy-Authorization'] = proxy.auth;
      const mod = proxy.isHttpsProxy ? https : http;
      const req = mod.request(reqOpts, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
          else reject(new Error(`HTTP ${res.statusCode}`));
        });
      });
      req.on('error', reject);
      req.end();
      return;
    }

    // HTTPS 目标：CONNECT 隧道 + TLS
    connectTunnel(proxy, urlObj.hostname, urlObj.port || 443)
      .then((socket) => {
        const tlsSocket = tls.connect({
          socket,
          servername: urlObj.hostname,
        }, () => {
          tlsSocket.write(
            `GET ${urlObj.pathname}${urlObj.search} HTTP/1.1\r\n` +
            `Host: ${urlObj.host}\r\n` +
            `Connection: close\r\n\r\n`
          );
        });
        let data = '';
        tlsSocket.on('data', (c) => { data += c.toString('utf-8'); });
        tlsSocket.on('end', () => {
          const body = data.split('\r\n\r\n').slice(1).join('\r\n\r\n');
          resolve(body);
        });
        tlsSocket.on('error', reject);
      })
      .catch(reject);
  });
}

/**
 * 拉取远程源内容（带本地缓存 + 可选代理）。
 * @param {string} url 远程 URL
 * @param {{ force?: boolean, proxy?: string }} [opts]
 * @returns {Promise<string>} 远程内容
 */
export async function fetchRemote(url, opts = {}) {
  const cacheFile = join(cacheDir(), cacheKey(url));
  if (!opts.force && existsSync(cacheFile)) {
    return readFileSync(cacheFile, 'utf-8');
  }

  const proxy = resolveProxy(opts.proxy);
  const urlObj = new URL(url);

  let text;
  if (proxy) {
    text = await fetchViaProxy(urlObj, proxy);
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    text = await res.text();
  }

  writeFileSync(cacheFile, text, 'utf-8');
  return text;
}
