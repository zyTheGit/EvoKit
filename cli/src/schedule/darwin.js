// schedule darwin 后端：launchd LaunchAgent（plist）—— enable / disable / list
// enable：写 ~/Library/LaunchAgents/com.evokit.<task去空格>.plist（label 同名），XML 含 Label / ProgramArguments
//   ([nodePath, scriptPath, 'learn', '--<mode>']) / StartCalendarInterval({Hour, Minute}) / WorkingDirectory(EVOKIT_DIR)
//   / StandardOutPath+StandardErrorPath(~/.evokit/schedule/logs/<slug>.log)；随后 launchctl unload（忽略失败）→
//   launchctl load（失败 ✗）→ launchctl list 读回验证须含 label（否则 ✗）。外部调用全部经注入的 deps.run，
//   测试注入假 runner，绝不真调 launchctl。
// disable：launchctl unload（不存在容忍）+ 删 plist；任务不存在时幂等 exit 0。
// list：launchctl list 逐行 'PID\tStatus\tLabel' 过滤 com.evokit. 前缀；每个 label 读对应 plist 文本
//   （不存在 → action='—'）正则提取 ProgramArguments 的 learn --mode 与 StartCalendarInterval 的 Hour/Minute（HH:MM）；
//   state='loaded'，NextRunTime/LastRunTime='—'，LastTaskResult=launchctl 第二列（数字）或 '—'。

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVOKIT_DIR, HOME } from '../paths.js';
import { buildTable, flagValue, logPathFor, parseDisableArgs, parseEnableArgs, scriptPathOf } from '../commands/schedule.js';

/** 任务名 → LaunchAgent plist 绝对路径（label 同源：com.evokit.<task去空格>） */
const plistPathFor = (task) => join(HOME, 'Library', 'LaunchAgents', `com.evokit.${task.replace(/\s+/g, '')}.plist`);

/** XML 文本转义（路径含 & < > ' " 时保证 plist 可解析） */
const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** 构造 LaunchAgent plist XML（LF 行尾，macOS 约定） */
function buildPlistXml({ label, nodePath, scriptPath, mode, hour, minute, workDir, logPath }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(nodePath)}</string>
    <string>${xmlEscape(scriptPath)}</string>
    <string>learn</string>
    <string>--${mode}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(workDir)}</string>
  <key>StandardOutPath</key>
  <string>${xmlEscape(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(logPath)}</string>
</dict>
</plist>
`;
}

// ── enable：写 plist + launchctl load + 读回验证 ──────────
export function enableSub(args, run) {
  const parsed = parseEnableArgs(args, 'enable');
  if (!parsed) return;
  const { time, mode, task } = parsed;
  const nodePath = process.execPath;
  const scriptPath = scriptPathOf();
  const label = `com.evokit.${task.replace(/\s+/g, '')}`;
  const plist = plistPathFor(task);
  const logPath = logPathFor(task);
  const [hour, minute] = time.split(':').map(Number); // StartCalendarInterval 为 plist 整数（02→2）

  // ① 写 plist（LaunchAgents/日志目录可能不存在，递归创建）
  try {
    mkdirSync(join(HOME, 'Library', 'LaunchAgents'), { recursive: true });
    mkdirSync(join(EVOKIT_DIR, 'schedule', 'logs'), { recursive: true });
    writeFileSync(plist, buildPlistXml({ label, nodePath, scriptPath, mode, hour, minute, workDir: EVOKIT_DIR, logPath }), 'utf-8');
  } catch (e) {
    console.error(`✗ enable：plist 写入失败（${plist}）：${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
    return;
  }

  // ② 先 unload 旧实例（可能不存在/未加载，失败忽略）
  run('launchctl', ['unload', plist]);

  // ③ load 新 plist：失败 → ✗ exit 1
  const loaded = run('launchctl', ['load', plist]);
  if (!loaded || loaded.status !== 0) {
    const detail = loaded && typeof loaded.stderr === 'string' && loaded.stderr.trim()
      ? loaded.stderr.trim()
      : (loaded && loaded.status === null ? 'launchctl 无法启动' : '未知错误');
    console.error(`✗ enable：launchctl load 失败：${detail}`);
    process.exitCode = 1;
    return;
  }

  // ④ 读回验证：launchctl list 须含本 label，否则视为未加载成功
  const listed = run('launchctl', ['list']);
  const listedOk = !!(listed && listed.status === 0 && typeof listed.stdout === 'string' && listed.stdout.includes(label));
  if (!listedOk) {
    console.error(`✗ enable：launchctl list 未找到 ${label}，加载可能未生效`);
    process.exitCode = 1;
    return;
  }

  // ⑤ 输出注册信息 + 说明（launchd 无下次运行查询，显示 —）
  console.log('✓ 每日定时学习已注册');
  console.log(`  任务名：${task}`);
  console.log(`  计划：每日 ${time}`);
  console.log(`  档位：learn --${mode}`);
  console.log('  下次运行：—');
  console.log(`  日志文件：${logPath}`);
  console.log('ℹ 说明：');
  console.log(`  a. 每日 ${time} 会真实调用本机 agent CLI 执行 learn --${mode}，产生 LLM 费用；`);
  console.log('  b. 卸载：evokit schedule disable');
  console.log('  c. 若此前从未运行过 learn，首次定时运行会提纯 inbox 全部积压（此后按水位线只提纯新增行）');
}

// ── disable：unload + 删 plist（幂等） ────────────────────
export function disableSub(args, run) {
  const parsed = parseDisableArgs(args, 'disable');
  if (!parsed) return;
  const { task } = parsed;
  const plist = plistPathFor(task);
  // unload 失败容忍（任务可能未加载/已卸载/已删除）
  run('launchctl', ['unload', plist]);
  const existed = existsSync(plist);
  if (existed) {
    try {
      rmSync(plist, { force: true });
      console.log(`✓ 已取消定时任务：${task}`);
    } catch {
      console.error(`⚠ plist 删除失败（可手动删除）：${plist}`);
      console.log(`✓ 已取消定时任务：${task}`); // launchctl 已 unload，主结果仍成功
    }
  } else {
    console.log(`ℹ 定时任务不存在（或已删除），无需重复取消：${task}`); // 幂等卸载：exit 0
  }
}

// ── list：解析 launchctl list + 逐 label 读 plist ─────────
export function listSub(args, run) {
  const taskFilter = flagValue(args, '--task');
  const r = run('launchctl', ['list']);
  const rows = parseLaunchctlList(r && r.status === 0 && typeof r.stdout === 'string' ? r.stdout : '');
  // --task 过滤：接受任务名（EvoKit Learn）或完整 label（com.evokit.EvoKitLearn）
  const filtered = taskFilter
    ? rows.filter((row) => row.name === taskFilter || row.name === `com.evokit.${taskFilter.replace(/\s+/g, '')}`)
    : rows;
  if (args.includes('--json')) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }
  if (filtered.length === 0) {
    console.log('ℹ 无正在运行的 EvoKit 定时任务');
    return;
  }
  buildTable(filtered, () => '—'); // macOS 无包装脚本载体，尾列恒为 —
}

/** 解析 launchctl list 输出（每行 PID\tStatus\tLabel）：过滤 com.evokit. 前缀，读对应 plist 提取 learn --mode 与 HH:MM */
function parseLaunchctlList(stdout) {
  const rows = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.includes('com.evokit.')) continue;
    const parts = line.split('\t').map((s) => s.trim());
    if (parts.length < 3) continue;
    const label = parts[2];
    if (!label.startsWith('com.evokit.')) continue;
    // 读回 plist 提取档位与时间；plist 不存在/不可读/无 learn 段 → action='—'
    let action = '—';
    try {
      const text = readFileSync(join(HOME, 'Library', 'LaunchAgents', `${label}.plist`), 'utf-8');
      const modeM = text.match(/<string>learn<\/string>\s*<string>--(auto|assist)<\/string>/);
      const timeM = text.match(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>\s*<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/);
      if (modeM) {
        const hhmm = timeM ? `（每日 ${timeM[1].padStart(2, '0')}:${timeM[2].padStart(2, '0')}）` : '';
        action = `learn --${modeM[1]}${hhmm}`;
      }
    } catch { action = '—'; } // plist 不存在/不可读
    rows.push({
      name: label,
      state: 'loaded',
      action,
      info: { NextRunTime: '—', LastRunTime: '—', LastTaskResult: /^\d+$/.test(parts[1]) ? Number(parts[1]) : '—' },
    });
  }
  return rows;
}
