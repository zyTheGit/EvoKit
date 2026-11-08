// schedule win32 后端：Windows 任务计划（schtasks）—— enable / disable / list
// 从 commands/schedule.js 原样迁出（行为零变化）：参数校验改走共享 parseEnableArgs/parseDisableArgs（提示逐字一致），
//   其余注册/删除/查询逻辑与 PowerShell/schtasks 调用保持不变；外部调用全部经注入的 deps.run，
//   测试注入假 runner，绝不真调 schtasks /Create、/Delete。
// TR 构造：注册的是包装脚本绝对路径（不加额外引号）——schtasks 无 cwd 参数，TR=完整命令行时定时任务 cwd=系统目录，
//   夜间会让 daily-log 适配器递归扫描 System32（性能+junction 环路风险）；wrapper 内已 cd /d "<EVOKIT_DIR>" 解决。
//   PowerShell 读回 Actions 拼接后应含包装脚本路径；仓库挪动/路径被截断都会在读回校验中暴露
//   （读回不符 → ✗「存储命令不完整，请检查路径空格/改用手动模板」）。
// 包装脚本：~/.evokit/schedule/<task 杀空格>.cmd，三行内容（@echo off / cd /d "<EVOKIT_DIR>" / 完整命令），
//   既是注册命令的可读记录与手动备用入口，也是任务计划真正执行的入口（TR 即指向它）；
//   读回通过后再断言其存在且第三行含 learn --<mode>（不符 → ✗「包装脚本内容异常」）。

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVOKIT_DIR } from '../paths.js';
import { buildTable, flagValue, parseDisableArgs, parseEnableArgs, scriptPathOf, wrapperPathFor } from '../commands/schedule.js';

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
export function enableSub(args, run) {
  const parsed = parseEnableArgs(args, 'enable');
  if (!parsed) return;
  const { time, mode, task } = parsed;

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
export function disableSub(args, run) {
  const parsed = parseDisableArgs(args, 'disable');
  if (!parsed) return;
  const { task } = parsed;
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
export function listSub(args, run) {
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
  buildTable(rows);
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
