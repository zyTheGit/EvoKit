// 命令执行引擎（网页端 FR-13）：在网页上执行白名单内的 evokit CLI 命令
// 安全边界（技术设计 D9）：
//   1. 命令白名单精确匹配第一 token，白名单外一律 400；'web' / 'hook' 永久禁止（防递归/防钩子副作用）
//   2. spawn 不走 shell（无命令注入面）；参数数组逐项传递
//   3. 全局互斥：同一时刻只允许一个命令在跑（busy → 409），避免 review/sync 并发互踩
//   4. 超时保护（默认 5 分钟，LLM 类命令足够；超时 kill 并在结果里标记 timedOut）
//   5. 输出各截断 512KB，防止极端输出撑爆内存
// 确认分级：safe = 直接执行；confirm = 前端弹二次确认（服务端不做二次区分，白名单是唯一闸门）

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// cli/src/web/exec.js → cli/evokit.mjs
const CLI_ENTRY = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), 'evokit.mjs');

const OUTPUT_CAP = 512 * 1024;   // stdout/stderr 各自截断上限
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** 命令白名单：cmd → tier（safe 直接执行 / confirm 前端二次确认） */
export const EXEC_WHITELIST = {
  agents: 'safe',
  resources: 'safe',
  check: 'safe',
  status: 'safe',
  recall: 'safe',
  help: 'safe',
  sync: 'confirm',
  review: 'confirm',
  knowledge: 'confirm',
  harvest: 'confirm',
  learn: 'confirm',
  forge: 'confirm',
  inventory: 'confirm',
  schedule: 'confirm',
  uninstall: 'confirm',
};

let running = null; // { cmd, startedAt } —— 进程级互斥锁

/** 当前是否有命令在执行（GET /api/exec/status 用） */
export function execStatus() {
  return running
    ? { busy: true, cmd: running.cmd, startedAt: running.startedAt }
    : { busy: false };
}

/**
 * 执行一条白名单命令，收集完整输出后返回。
 * @param {string} cmd 命令名（白名单第一 token）
 * @param {string[]} args 参数数组（逐项传给 spawn，不走 shell）
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ status: number, body: object }>} HTTP 语义：200 结果 / 400 拒绝 / 409 忙
 */
export function runCommand(cmd, args = [], options = {}) {
  return new Promise((resolvePromise) => {
    const command = String(cmd ?? '').trim();
    if (!command || !EXEC_WHITELIST[command]) {
      resolvePromise({ status: 400, body: { error: { code: 'forbidden', message: `命令不在白名单：${command || '（空）'}。允许：${Object.keys(EXEC_WHITELIST).join('、')}` } } });
      return;
    }
    const safeArgs = (Array.isArray(args) ? args : []).map(String);
    if (safeArgs.includes('web') || safeArgs.includes('hook')) {
      resolvePromise({ status: 400, body: { error: { code: 'forbidden', message: '参数不允许包含 web / hook（网页端禁止递归与钩子命令）' } } });
      return;
    }
    if (running) {
      resolvePromise({ status: 409, body: { error: { code: 'busy', message: `已有命令在执行：${running.cmd}（${Math.round((Date.now() - running.startedAt) / 1000)}s），请稍后再试` } } });
      return;
    }

    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();
    running = { cmd: command, startedAt };
    let timedOut = false;

    const child = spawn(process.execPath, [CLI_ENTRY, command, ...safeArgs], {
      cwd: dirname(CLI_ENTRY),
      env: process.env, // 继承 EVOKIT_HOME（如有）与真实用户环境
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { if (stdout.length < OUTPUT_CAP) stdout += chunk.toString('utf-8'); });
    child.stderr.on('data', (chunk) => { if (stderr.length < OUTPUT_CAP) stderr += chunk.toString('utf-8'); });

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch { /* 进程已退出 */ }
    }, timeoutMs);

    const finish = (exitCode) => {
      clearTimeout(timer);
      running = null;
      resolvePromise({
        status: 200,
        body: {
          cmd: command,
          args: safeArgs,
          tier: EXEC_WHITELIST[command],
          exitCode,
          timedOut,
          durationMs: Date.now() - startedAt,
          stdout,
          stderr,
          truncated: stdout.length >= OUTPUT_CAP || stderr.length >= OUTPUT_CAP,
        },
      });
    };
    child.on('error', (err) => finish(-1));
    child.stderr.on('error', () => { /* 读流异常不致命 */ });
    child.on('close', (code) => finish(code ?? (timedOut ? -1 : 0)));
    // error 与 close 可能都触发：finish 后幂等（running 已置空，resolve 二次调用无效）
  });
}
