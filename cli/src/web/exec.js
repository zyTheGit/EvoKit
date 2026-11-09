// 命令执行引擎（网页端 FR-13）：在网页上执行白名单内的 evokit CLI 命令
// 安全边界（技术设计 D9）：
//   1. 命令白名单精确匹配第一 token，白名单外一律 400；'web' / 'hook' 永久禁止（防递归/防钩子副作用）
//   2. spawn 不走 shell（无命令注入面）；参数数组逐项传递
//   3. 全局互斥：同一时刻只允许一个命令在跑（busy → 409），避免 review/sync 并发互踩
//   4. 超时保护（默认 5 分钟；超时 kill 并在结果元数据里标记 timedOut）
//   5. 流式输出（2026-11-09 实时进度）：stdout/stderr 直通响应流，服务端不留存输出（无截断上限需求）；
//      子进程环境注入 NO_COLOR / FORCE_COLOR=0 等，从源头减少 ANSI 转义（前端另有 SGR→HTML 着色兜底）
// 确认分级：safe = 直接执行；confirm = 前端弹二次确认（服务端不做二次区分，白名单是唯一闸门）

import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// cli/src/web/exec.js → cli/evokit.mjs
const CLI_ENTRY = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), 'evokit.mjs');

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
 * 校验一次执行请求（白名单 / 参数 / 互斥），不产生副作用。
 * @returns {{ ok: true, command: string, safeArgs: string[] } | { ok: false, status: number, message: string }}
 */
export function validateExecution(cmd, args) {
  const command = String(cmd ?? '').trim();
  if (!command || !EXEC_WHITELIST[command]) {
    return { ok: false, status: 400, message: `命令不在白名单：${command || '（空）'}。允许：${Object.keys(EXEC_WHITELIST).join('、')}` };
  }
  const safeArgs = (Array.isArray(args) ? args : []).map(String);
  if (safeArgs.includes('web') || safeArgs.includes('hook')) {
    return { ok: false, status: 400, message: '参数不允许包含 web / hook（网页端禁止递归与钩子命令）' };
  }
  if (running) {
    return { ok: false, status: 409, message: `已有命令在执行：${running.cmd}（${Math.round((Date.now() - running.startedAt) / 1000)}s），请稍后再试` };
  }
  return { ok: true, command, safeArgs };
}

/**
 * 启动执行（调用前必须先过 validateExecution）。
 * stdout/stderr 直通写入返回的 PassThrough 流（实时进度），命令结束由调用方写元数据行后 end 流。
 * @returns {{ stream: import('node:stream').PassThrough, done: Promise<{cmd,args,tier,exitCode,timedOut,durationMs}> }}
 */
export function startExecution(command, safeArgs, options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();
  running = { cmd: command, startedAt };
  let timedOut = false;

  const child = spawn(process.execPath, [CLI_ENTRY, command, ...safeArgs], {
    cwd: dirname(CLI_ENTRY),
    env: {
      ...process.env,
      NO_COLOR: '1',        // 无颜色标准（https://no-color.org/）
      FORCE_COLOR: '0',     // chalk/支持该变量的库
      CLICOLOR: '0',
      CLICOLOR_FORCE: '0',
    },
  });

  const stream = new PassThrough();
  child.stdout.on('data', (chunk) => stream.write(chunk));
  child.stderr.on('data', (chunk) => stream.write(chunk));

  const done = new Promise((resolvePromise) => {
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch { /* 进程已退出 */ }
    }, timeoutMs);

    const finish = (exitCode) => {
      clearTimeout(timer);
      running = null;
      resolvePromise({
        cmd: command,
        args: safeArgs,
        tier: EXEC_WHITELIST[command],
        exitCode,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    };
    child.on('error', () => finish(-1));
    child.on('close', (code) => finish(code ?? (timedOut ? -1 : 0)));
  });

  return { stream, done, child };
}
