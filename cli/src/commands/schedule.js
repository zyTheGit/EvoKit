// schedule 命令（T-M6）：Windows 任务计划定时学习管理 —— enable / disable / list
// 外部调用全部经 deps.run 注入（默认 spawnSync，encoding utf-8，返回 {status, stdout, stderr}），
//   测试注入假 runner，绝不真调 schtasks /Create、/Delete；平台经 deps.platform 注入（默认 process.platform）。
// TR 构造：注册的是包装脚本绝对路径（不加额外引号）——schtasks 无 cwd 参数，TR=完整命令行时定时任务 cwd=系统目录，
//   夜间会让 daily-log 适配器递归扫描 System32（性能+junction 环路风险）；wrapper 内已 cd /d "<EVOKIT_DIR>" 解决。
//   PowerShell 读回 Actions 拼接后应含包装脚本路径；仓库挪动/路径被截断都会在读回校验中暴露
//   （读回不符 → ✗「存储命令不完整，请检查路径空格/改用手动模板」）。
// 包装脚本：~/.evokit/schedule/<task 杀空格>.cmd，三行内容（@echo off / cd /d "<EVOKIT_DIR>" / 完整命令），
//   既是注册命令的可读记录与手动备用入口，也是任务计划真正执行的入口（TR 即指向它）；
//   读回通过后再断言其存在且第三行含 learn --<mode>（不符 → ✗「包装脚本内容异常」）。

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVOKIT_DIR } from '../paths.js';

/** 默认外部调用：spawnSync 返回 {status, stdout, stderr}（deps.run 可注入替换） */
const defaultRun = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf-8' });

/** 解析 `--flag <value>`；缺失或值像另一个 flag 时返回 null */
function flagValue(args, flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  const v = args[i + 1];
  return v && !v.startsWith('-') ? v : null;
}

/** 用法文本（未知/缺失子命令打印并 exit 1） */
const USAGE = `用法：evokit schedule enable|disable|list [选项]

  evokit schedule enable [--time HH:MM] [--mode auto|assist] [--task <name>]  注册每日定时学习（Windows 任务计划）
  evokit schedule disable [--task <name>]  取消定时任务（同时清理 ~/.evokit/schedule/ 下的包装脚本）
  evokit schedule list [--task <name>] [--json]  查看正在定时跑的 EvoKit 任务（Windows）

  选项：--time 默认 02:00（24 小时制 HH:MM）；--mode 默认 auto（auto=全部自动入库 / assist=高置信自动入库其余留审）；
  --task 默认 EvoKit Learn（需以 EvoKit 开头）；--json 仅 list 生效，输出原始 JSON 数组。
  schtasks 为 Windows 专属：注册后每日到点真实执行 learn，产生 LLM 费用，可用 disable 随时取消。`;

/** 校验每日时间（24 小时制 HH:MM） */
const isValidTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
/** 校验任务名：EvoKit 前缀 + 字母/数字/下划线/空格/连字符 */
const isValidTask = (t) => /^EvoKit[\w -]*$/.test(t);
/** 任务名 → 包装脚本路径（任务名去空白 + .cmd） */
const wrapperPathFor = (task) => join(EVOKIT_DIR, 'schedule', task.replace(/\s+/g, '') + '.cmd');
/** evokit.mjs 脚本绝对路径（本文件位于 cli/src/commands/，向上两级到 cli/） */
const scriptPathOf = () => resolve(dirname(fileURLToPath(import.meta.url)), '../../evokit.mjs');

/** 构造 PowerShell 单行查询（-NoProfile）：输出 name/state/action(Actions 拼接)/info(NextRunTime/LastRunTime/LastTaskResult) */
function buildQueryScript(taskName) {
  return "Get-ScheduledTask -TaskName '" + taskName + "' | ForEach-Object { $t = $_; $i = $_ | Get-ScheduledTaskInfo; $act = (($t.Actions | ForEach-Object { [string]$_.Execute + ' ' + [string]$_.Arguments }) -join ' '); [pscustomobject]@{ name = $t.TaskName; state = [string]$t.State; action = $act; info = [pscustomobject]@{ NextRunTime = [string]$i.NextRunTime; LastRunTime = [string]$i.LastRunTime; LastTaskResult = $i.LastTaskResult } } } | ConvertTo-Json -Compress";
}

/** 经 deps.run 执行 PowerShell 查询并解析（查询失败/空结果/解析失败都返回 []，语义由调用方决定） */
function queryTasks(taskName, run) {
  const r = run('powershell', ['-NoProfile', '-Command', buildQueryScript(taskName)]);
  if (!r || r.status !== 0 || typeof r.stdout !== 'string' || r.stdout.trim() === '') return [];
  try {
    const parsed = JSON.parse(r.stdout);
    return Array.isArray(parsed) ? parsed : [parsed]; // 单任务时 ConvertTo-Json 输出对象而非数组，归一为长度 1 的数组
  } catch {
    return [];
  }
}

// ── enable：注册每日定时学习 ──────────────────────────────
function enableSub(args, run) {
  const time = flagValue(args, '--time') || '02:00';
  if (!isValidTime(time)) {
    console.error(`✗ enable：--time 需为 24 小时制 HH:MM（如 02:00），实际「${time}」`);
    process.exitCode = 1;
    return;
  }
  const mode = flagValue(args, '--mode') || 'auto';
  if (mode !== 'auto' && mode !== 'assist') {
    console.error(`✗ enable：--mode 只允许 auto|assist，实际「${mode}」`);
    process.exitCode = 1;
    return;
  }
  const task = flagValue(args, '--task') || 'EvoKit Learn';
  if (!isValidTask(task)) {
    console.error(`✗ enable：--task 需以 EvoKit 开头、只含字母/数字/下划线/空格/连字符，实际「${task}」`);
    process.exitCode = 1;
    return;
  }

  // ① 路径解析：node 绝对路径 + evokit.mjs 绝对路径
  const nodePath = process.execPath;
  const scriptPath = scriptPathOf();

  // ② 写包装脚本（三行：@echo off / cd /d "<EVOKIT_DIR>" / "<node>" "<script>" learn --<mode>；CRLF，cmd.exe 兼容）
  const wrapperPath = wrapperPathFor(task);
  try {
    mkdirSync(join(EVOKIT_DIR, 'schedule'), { recursive: true });
    writeFileSync(wrapperPath, `@echo off\r\ncd /d "${EVOKIT_DIR}"\r\n"${nodePath}" "${scriptPath}" learn --${mode}\r\n`, 'utf-8');
  } catch (e) {
    console.error(`✗ enable：包装脚本写入失败（${wrapperPath}）：${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
    return;
  }

  // 重复注册检测（best-effort：读回失败按新注册处理，不阻断注册流程）
  const preExisting = queryTasks(task, run).some((row) => row && row.name === task);

  // ③ 注册每日任务：/F 允许覆盖同名任务；TR=包装脚本绝对路径（不加额外引号；wrapper 第二行已 cd /d EVOKIT_DIR，
  //   避免任务 cwd=系统目录；含空格的包装脚本路径会在 ④ 读回校验失败并提示）
  const tr = wrapperPath;
  const created = run('schtasks', ['/Create', '/F', '/TN', task, '/SC', 'DAILY', '/ST', time, '/TR', tr]);
  if (!created || created.status !== 0) {
    const detail = created && typeof created.stderr === 'string' && created.stderr.trim()
      ? created.stderr.trim()
      : (created && created.status === null ? 'schtasks 无法启动（本命令仅支持 Windows）' : '未知错误');
    console.error(`✗ enable：schtasks 注册失败：${detail}`);
    process.exitCode = 1;
    return;
  }

  // ④ 验证：PowerShell 读回存储命令，须含包装脚本绝对路径（路径含空格被截断时在此暴露；模式/参数不在 TR 里，不在此查）
  const rows = queryTasks(task, run);
  const row = rows.find((x) => x && x.name === task) || null;
  const storedAction = row && typeof row.action === 'string' ? row.action : '';
  if (!storedAction.includes(wrapperPath)) {
    console.error('✗ enable：存储命令不完整，请检查路径空格/改用手动模板（scripts/schedule/）');
    process.exitCode = 1;
    return;
  }

  // ⑤ 包装脚本内容校验：文件存在且第三行含 learn --<mode>（模式与参数记录在 wrapper 内容里）
  let wrapperOk = false;
  try {
    const lines = readFileSync(wrapperPath, 'utf-8').split(/\r?\n/).filter(Boolean);
    wrapperOk = lines.length >= 3 && lines[2].includes(`learn --${mode}`);
  } catch { wrapperOk = false; } // 文件不存在/不可读
  if (!wrapperOk) {
    console.error(`✗ enable：包装脚本内容异常（${wrapperPath} 需存在且第三行含 learn --${mode}）`);
    process.exitCode = 1;
    return;
  }

  // ⑥ 输出注册信息 + 说明
  const next = row && row.info && typeof row.info.NextRunTime === 'string' ? row.info.NextRunTime : '';
  console.log(`✓ 每日定时学习已注册${preExisting ? '（已覆盖既有任务）' : ''}`);
  console.log(`  任务名：${task}`);
  console.log(`  计划：每日 ${time}`);
  console.log(`  档位：learn --${mode}`);
  console.log(`  包装脚本：${wrapperPath}`);
  console.log(`  下次运行：${next || '—'}`);
  console.log('ℹ 说明：');
  console.log(`  a. 每日 ${time} 会真实调用本机 agent CLI 执行 learn --${mode}，产生 LLM 费用；`);
  console.log('  b. 卸载：evokit schedule disable');
  console.log('  c. 定时运行 cwd=~/.evokit（wrapper 已 cd），项目内 workbuddy 日报需在 settings sources 配 root');
}

// ── disable：取消定时任务（成功/幂等路径同时清理包装脚本） ──
function disableSub(args, run) {
  const task = flagValue(args, '--task') || 'EvoKit Learn';
  if (!isValidTask(task)) {
    console.error(`✗ disable：--task 需以 EvoKit 开头、只含字母/数字/下划线/空格/连字符，实际「${task}」`);
    process.exitCode = 1;
    return;
  }
  const r = run('schtasks', ['/Delete', '/TN', task, '/F']);
  const stderr = r && typeof r.stderr === 'string' ? r.stderr : '';
  if (r && r.status === 0) {
    console.log(`✓ 已取消定时任务：${task}`);
  } else if (r && r.status !== 0 && stderr.includes('ERROR: The scheduled task')) {
    console.log(`ℹ 定时任务不存在（或已删除），无需重复取消：${task}`); // 幂等卸载：exit 0
  } else {
    const detail = stderr.trim() || (r && r.status === null ? 'schtasks 无法启动（本命令仅支持 Windows）' : '未知错误');
    console.error(`✗ disable：schtasks 删除失败：${detail}`);
    process.exitCode = 1;
    return; // 删除失败时保留包装脚本，便于排查后重试
  }
  // 同时删除包装脚本（存在才删；删除失败仅提示，不改变主结果）
  const wrapperPath = wrapperPathFor(task);
  try {
    if (existsSync(wrapperPath)) rmSync(wrapperPath, { force: true });
  } catch {
    console.error(`⚠ 包装脚本删除失败（可手动删除）：${wrapperPath}`);
  }
}

// ── list：查看正在定时跑的 EvoKit 任务 ────────────────────
function listSub(args, run, platform) {
  if (platform !== 'win32') {
    console.log('ℹ 当前平台暂未内置定时管理，请参考 scripts/schedule/');
    process.exitCode = 1;
    return;
  }
  const task = flagValue(args, '--task');
  const rows = queryTasks(task || 'EvoKit *', run); // 无 --task 时按前缀通配，有 --task 时精确名
  if (args.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (rows.length === 0) {
    console.log('ℹ 无正在运行的 EvoKit 定时任务');
    return;
  }
  const cell = (s, w) => (s.length > w ? s.slice(0, Math.max(1, w - 1)) + '…' : s.padEnd(w));
  const widths = [20, 8, 16, 22, 10, 12];
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
    const result = resultRaw === undefined || resultRaw === null
      ? '—'
      : (Number(resultRaw) === 0 ? `成功 (${resultRaw})` : `⚠ ${resultRaw}`);
    const hasWrapper = existsSync(wrapperPathFor(name));
    console.log([cell(name, widths[0]), cell(state, widths[1]), cell(seg, widths[2]), cell(next || '—', widths[3]), cell(result, widths[4]), hasWrapper ? '✓' : '—'].join('  '));
  }
  // 存储命令不含该任务对应的包装脚本路径 → 仓库挪动/改名后注册信息已过期
  const moved = rows.filter((r) => {
    if (!r || typeof r.action !== 'string' || r.action === '') return false;
    const name = typeof r.name === 'string' && r.name ? r.name : '';
    return !r.action.includes(wrapperPathFor(name));
  });
  if (moved.length > 0) {
    console.log('ℹ 部分任务存储命令不含其包装脚本路径（脚本已移动，建议 disable 后重新 enable）');
  }
}

/**
 * `evokit schedule <子命令>` 入口
 * @param {string[]} args 子命令及参数（不含 'schedule' 本身）
 * @param {{ run?: (cmd: string, args: string[]) => { status: number | null, stdout?: string, stderr?: string },
 *           platform?: string }} deps 可注入依赖：run 外部命令执行器（测试用假 runner），platform 平台标识
 */
export function scheduleCommand(args, deps = {}) {
  const run = typeof deps.run === 'function' ? deps.run : defaultRun;
  const platform = typeof deps.platform === 'string' && deps.platform ? deps.platform : process.platform;
  const sub = args[0] || '';
  if (sub === 'enable') return enableSub(args.slice(1), run);
  if (sub === 'disable') return disableSub(args.slice(1), run);
  if (sub === 'list') return listSub(args.slice(1), run, platform);
  console.log(USAGE);
  process.exitCode = 1;
}
