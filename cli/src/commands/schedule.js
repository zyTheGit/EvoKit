// schedule 命令（T-M6）：每日定时学习管理 —— enable / disable / list（Windows 任务计划 / macOS launchd / Linux cron）
// 按 deps.platform 分发到 cli/src/schedule/ 平台后端（win32 / darwin / linux）；win32 行为零变化（原实现迁至 schedule/win32.js）。
// 外部调用全部经 deps.run 注入（默认 spawnSync，encoding utf-8，返回 {status, stdout, stderr}；第三参为 stdin 全文，
//   Linux crontab 写回用），测试注入假 runner，绝不真调 schtasks / launchctl / crontab；platform 经 deps.platform 注入
//   （默认 process.platform）；不支持的平台（非 win32/darwin/linux）→ ✗「当前平台暂不支持定时管理」exit 1。
// 本文件职责：CLI 子命令分发 + enable/disable 公共参数解析与校验 + 跨后端共享工具（校验/路径/表格渲染），
//   以命名导出提供给各后端 import（后端不重复实现）。

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVOKIT_DIR } from '../paths.js';
import * as win32Backend from '../schedule/win32.js';
import * as darwinBackend from '../schedule/darwin.js';
import * as linuxBackend from '../schedule/linux.js';

/** 默认外部调用：spawnSync 返回 {status, stdout, stderr}（deps.run 可注入替换；input 为 stdin 全文，crontab 写回用） */
const defaultRun = (cmd, args, input) => spawnSync(cmd, args, { encoding: 'utf-8', input });

/** 用法文本（未知/缺失子命令打印并 exit 1） */
const USAGE = `用法：evokit schedule enable|disable|list [选项]

  evokit schedule enable [--time HH:MM] [--mode auto|assist] [--task <name>]  注册每日定时学习（Windows 任务计划 / macOS launchd / Linux cron）
  evokit schedule disable [--task <name>]  取消定时任务（Windows 同时清理包装脚本；macOS 删除 LaunchAgent plist；Linux 移除 crontab 托管块）
  evokit schedule list [--task <name>] [--json]  查看正在定时跑的 EvoKit 任务（Windows / macOS / Linux）

  选项：--time 默认 02:00（24 小时制 HH:MM）；--mode 默认 auto（auto=全部自动入库 / assist=高置信自动入库其余留审）；
  --task 默认 EvoKit Learn（需以 EvoKit 开头）；--json 仅 list 生效，输出原始 JSON 数组。
  注册后每日到点真实执行 learn，产生 LLM 费用，可用 disable 随时取消。`;

/** 解析 `--flag <value>`；缺失或值像另一个 flag 时返回 null */
export function flagValue(args, flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  const v = args[i + 1];
  return v && !v.startsWith('-') ? v : null;
}

/** 校验每日时间（24 小时制 HH:MM） */
export function isValidTime(t) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

/** 校验任务名：EvoKit 前缀 + 字母/数字/下划线/空格/连字符 */
export function isValidTask(t) {
  return /^EvoKit[\w -]*$/.test(t);
}

/** 任务名 → 包装脚本路径（任务名去空白 + .cmd，win32 注册载体） */
export function wrapperPathFor(task) {
  return join(EVOKIT_DIR, 'schedule', task.replace(/\s+/g, '') + '.cmd');
}

/** 任务名 → 定时运行日志路径（~/.evokit/schedule/logs/<task 去空白>.log，darwin/linux 共用） */
export function logPathFor(task) {
  return join(EVOKIT_DIR, 'schedule', 'logs', task.replace(/\s+/g, '') + '.log');
}

/** evokit.mjs 脚本绝对路径（本文件位于 cli/src/commands/，向上两级到 cli/） */
export function scriptPathOf() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../evokit.mjs');
}

/** 参数校验失败提示：打印 ✗（期望格式 + 实际值）并置 exitCode=1；kind ∈ time|mode|task */
export function hintMissing(sub, kind, actual) {
  const expects = {
    time: '--time 需为 24 小时制 HH:MM（如 02:00）',
    mode: '--mode 只允许 auto|assist',
    task: '--task 需以 EvoKit 开头、只含字母/数字/下划线/空格/连字符',
  };
  console.error(`✗ ${sub}：${expects[kind] || kind}，实际「${actual}」`);
  process.exitCode = 1;
}

/** enable 公共参数解析与校验（--time/--mode/--task，三平台一致）；非法时打印 ✗ 并返回 null */
export function parseEnableArgs(args, sub = 'enable') {
  const time = flagValue(args, '--time') || '02:00';
  if (!isValidTime(time)) {
    hintMissing(sub, 'time', time);
    return null;
  }
  const mode = flagValue(args, '--mode') || 'auto';
  if (mode !== 'auto' && mode !== 'assist') {
    hintMissing(sub, 'mode', mode);
    return null;
  }
  const task = flagValue(args, '--task') || 'EvoKit Learn';
  if (!isValidTask(task)) {
    hintMissing(sub, 'task', task);
    return null;
  }
  return { time, mode, task };
}

/** disable 公共参数解析与校验（--task）；非法时打印 ✗ 并返回 null */
export function parseDisableArgs(args, sub = 'disable') {
  const task = flagValue(args, '--task') || 'EvoKit Learn';
  if (!isValidTask(task)) {
    hintMissing(sub, 'task', task);
    return null;
  }
  return { task };
}

/** 任务计划信息性状态码（非失败）：0x41301 运行中 / 0x41303 尚未运行 / 0x41306 已终止（表格渲染用） */
const SCHED_INFO_CODES = { 267009: '运行中', 267011: '尚未运行', 267014: '已终止' };

/** list 表格渲染（全平台共用）：6 列定宽（任务名/状态/计划动作/下次运行/上次结果/包装脚本），超宽截断加 …；
 *  尾列默认查 win32 包装脚本存在性（✓/—），darwin/linux 无包装脚本载体，传 lastCellOf 返回 '—' */
export function buildTable(rows, lastCellOf = null) {
  const cell = (s, w) => (s.length > w ? s.slice(0, Math.max(1, w - 1)) + '…' : s.padEnd(w));
  const widths = [20, 8, 16, 22, 16, 12];
  const headers = ['任务名', '状态', '计划动作', '下次运行', '上次结果', '包装脚本'];
  console.log(headers.map((h, i) => cell(h, widths[i])).join('  '));
  for (const r of rows) {
    const name = r && typeof r.name === 'string' && r.name ? r.name : '(unknown)';
    const state = r && typeof r.state === 'string' ? r.state : '';
    const action = r && typeof r.action === 'string' ? r.action : '';
    // 计划动作列：优先提取 learn --<mode> 段（存储命令很长，整段展示不可读），无匹配再截断原文
    const seg = (action.match(/learn --(?:auto|assist)/) || [])[0] || (action || '（未知）');
    const info = r && r.info ? r.info : {};
    const next = typeof info.NextRunTime === 'string' ? info.NextRunTime : '';
    const resultRaw = info ? info.LastTaskResult : undefined;
    const result = resultRaw === undefined || resultRaw === null || resultRaw === '—'
      ? '—'
      : (Number(resultRaw) === 0
        ? `成功 (${resultRaw})`
        : (SCHED_INFO_CODES[Number(resultRaw)] ? `${SCHED_INFO_CODES[Number(resultRaw)]} (${resultRaw})` : `⚠ ${resultRaw}`));
    const last = lastCellOf ? lastCellOf(r) : (existsSync(wrapperPathFor(name)) ? '✓' : '—');
    console.log([cell(name, widths[0]), cell(state, widths[1]), cell(seg, widths[2]), cell(next || '—', widths[3]), cell(result, widths[4]), last].join('  '));
  }
}

/** 平台 → 后端模块（cli/src/schedule/<platform>.js，均导出 enableSub/disableSub/listSub） */
const BACKENDS = { win32: win32Backend, darwin: darwinBackend, linux: linuxBackend };

/**
 * `evokit schedule <子命令>` 入口：解析子命令 → 按 platform 分发到后端
 * @param {string[]} args 子命令及参数（不含 'schedule' 本身）
 * @param {{ run?: (cmd: string, args: string[], input?: string) => { status: number | null, stdout?: string, stderr?: string },
 *           platform?: string }} deps 可注入依赖：run 外部命令执行器（测试用假 runner），platform 平台标识
 */
export function scheduleCommand(args, deps = {}) {
  const run = typeof deps.run === 'function' ? deps.run : defaultRun;
  const platform = typeof deps.platform === 'string' && deps.platform ? deps.platform : process.platform;
  const sub = args[0] || '';
  if (sub !== 'enable' && sub !== 'disable' && sub !== 'list') {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }
  const backend = BACKENDS[platform];
  if (!backend) {
    console.error('✗ 当前平台暂不支持定时管理（支持 Windows / macOS / Linux）');
    process.exitCode = 1;
    return;
  }
  if (sub === 'enable') return backend.enableSub(args.slice(1), run);
  if (sub === 'disable') return backend.disableSub(args.slice(1), run);
  return backend.listSub(args.slice(1), run);
}
