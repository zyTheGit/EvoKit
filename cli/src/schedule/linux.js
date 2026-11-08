// schedule linux 后端：crontab 托管块 —— enable / disable / list
// enable：crontab -l 读现有表（status!==0 且 stderr 含 'no crontab for' 视为空表；其余失败 → ✗「未检测到 crontab」），
//   移除同名任务旧托管块（# EVOKIT:BEGIN <task> / # EVOKIT:END <task> 标记）后追加新块：
//   `M H * * * cd "<EVOKIT_DIR>" && "<nodePath>" "<scriptPath>" learn --<mode> >> "<日志绝对路径>" 2>&1`
//   （cron 分钟在前：--time HH:MM 转 'M H * * *'）；再经 run('crontab', ['-'], stdin=新全文) 写回（deps.run 第三参），
//   失败 ✗；最后 crontab -l 读回须含 BEGIN 标记，否则 ✗。外部调用全部经注入的 deps.run，测试注入假 runner，绝不真调 crontab。
// disable：读 crontab 删块写回；无 crontab（'no crontab for'）或无本任务块 → 幂等 exit 0 不写回。
// list：读 crontab 解析所有 EVOKIT 托管块 → 行形状与 win32 一致（state='scheduled'，Next/LastRunTime/LastTaskResult='—'，
//   action=learn --mode 段）。

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EVOKIT_DIR } from '../paths.js';
import { buildTable, flagValue, logPathFor, parseDisableArgs, parseEnableArgs, scriptPathOf } from '../commands/schedule.js';

/** crontab 调用失败且 stderr 含 'no crontab for' → 视为空表（用户从未建过 crontab） */
const isNoCrontab = (r) => !!r && r.status !== 0 && typeof r.stderr === 'string' && r.stderr.includes('no crontab for');

/** 失败详情归一（stderr 优先；status=null 表示命令无法启动） */
const detailOf = (r) => (r && typeof r.stderr === 'string' && r.stderr.trim()
  ? r.stderr.trim()
  : (r && r.status === null ? 'crontab 无法启动（请确认已安装 cron）' : '未知错误'));

/**
 * 重组 crontab 全文：移除指定任务的托管块（BEGIN/END 成对，全部移除）；
 * cronLine 非空时在文末追加新块（块前留一个空行分隔；无保留行时不加前导空行）；结果始终以换行结尾
 */
function rebuildCrontab(text, task, cronLine) {
  const begin = `# EVOKIT:BEGIN ${task}`;
  const end = `# EVOKIT:END ${task}`;
  const kept = [];
  let skipping = false;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t === begin) { skipping = true; continue; }
    if (skipping) { if (t === end) skipping = false; continue; }
    kept.push(line);
  }
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
  if (!cronLine) return kept.length ? kept.join('\n') + '\n' : '';
  const block = [begin, cronLine, end];
  return (kept.length ? [...kept, '', ...block] : block).join('\n') + '\n';
}

// ── enable：读改写 crontab 托管块 + 读回验证 ───────────────
export function enableSub(args, run) {
  const parsed = parseEnableArgs(args, 'enable');
  if (!parsed) return;
  const { time, mode, task } = parsed;
  const nodePath = process.execPath;
  const scriptPath = scriptPathOf();
  const logPath = logPathFor(task);

  // ① 读现有 crontab（无 crontab 视为空表；命令不存在/其他错误 → ✗）
  const read = run('crontab', ['-l']);
  let current = '';
  if (read && read.status === 0 && typeof read.stdout === 'string') {
    current = read.stdout;
  } else if (!isNoCrontab(read)) {
    console.error(`✗ enable：未检测到 crontab（请安装 cron，或参考 scripts/schedule/）：${detailOf(read)}`);
    process.exitCode = 1;
    return;
  }

  // ② 预创建日志目录（cron 重定向落点）+ 组装新全文：移除同名旧块、追加新块（cron 分钟在前）
  try {
    mkdirSync(join(EVOKIT_DIR, 'schedule', 'logs'), { recursive: true });
  } catch (e) {
    console.error(`✗ enable：日志目录创建失败（${join(EVOKIT_DIR, 'schedule', 'logs')}）：${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
    return;
  }
  const [h, m] = time.split(':').map(Number);
  const cronLine = `${m} ${h} * * * cd "${EVOKIT_DIR}" && "${nodePath}" "${scriptPath}" learn --${mode} >> "${logPath}" 2>&1`;
  const nextContent = rebuildCrontab(current, task, cronLine);

  // ③ 经 stdin 写回：失败 → ✗
  const wrote = run('crontab', ['-'], nextContent);
  if (!wrote || wrote.status !== 0) {
    console.error(`✗ enable：crontab 写入失败：${detailOf(wrote)}`);
    process.exitCode = 1;
    return;
  }

  // ④ 读回验证：crontab -l 须含本任务托管块标记
  const verify = run('crontab', ['-l']);
  if (!verify || verify.status !== 0 || typeof verify.stdout !== 'string' || !verify.stdout.includes(`# EVOKIT:BEGIN ${task}`)) {
    console.error(`✗ enable：crontab 读回未找到托管块（# EVOKIT:BEGIN ${task}），写入可能未生效`);
    process.exitCode = 1;
    return;
  }

  // ⑤ 输出注册信息 + 说明（cron 无下次运行查询，显示 —）
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

// ── disable：删托管块写回（幂等） ─────────────────────────
export function disableSub(args, run) {
  const parsed = parseDisableArgs(args, 'disable');
  if (!parsed) return;
  const { task } = parsed;
  const read = run('crontab', ['-l']);
  if (!read || read.status !== 0) {
    if (isNoCrontab(read)) {
      console.log(`ℹ 定时任务不存在（crontab 为空），无需重复取消：${task}`); // 幂等卸载：exit 0
      return;
    }
    console.error(`✗ disable：crontab 读取失败：${detailOf(read)}`);
    process.exitCode = 1;
    return;
  }
  const current = typeof read.stdout === 'string' ? read.stdout : '';
  if (!current.includes(`# EVOKIT:BEGIN ${task}`)) {
    console.log(`ℹ 定时任务不存在（或已删除），无需重复取消：${task}`); // 幂等卸载：exit 0，不写回
    return;
  }
  const nextContent = rebuildCrontab(current, task, null); // 只删不追加
  const wrote = run('crontab', ['-'], nextContent);
  if (!wrote || wrote.status !== 0) {
    console.error(`✗ disable：crontab 写回失败：${detailOf(wrote)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ 已取消定时任务：${task}`);
}

// ── list：解析 crontab 中的 EVOKIT 托管块 ─────────────────
export function listSub(args, run) {
  const taskFilter = flagValue(args, '--task');
  const r = run('crontab', ['-l']);
  const current = r && r.status === 0 && typeof r.stdout === 'string' ? r.stdout : '';
  const rows = parseManagedBlocks(current);
  const filtered = taskFilter ? rows.filter((row) => row.name === taskFilter) : rows;
  if (args.includes('--json')) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }
  if (filtered.length === 0) {
    console.log('ℹ 无正在运行的 EvoKit 定时任务');
    return;
  }
  buildTable(filtered, () => '—'); // Linux 无包装脚本载体，尾列恒为 —
}

/** 解析 crontab 全文中所有 EVOKIT 托管块 → 行形状与 win32 一致（name=任务名，action=learn --mode 段） */
function parseManagedBlocks(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(/^# EVOKIT:BEGIN (.+)$/);
    if (!m) continue;
    const name = m[1];
    // 块内找第一条 learn 行，提取 learn --<mode> 段（与 win32 表格列口径一致）
    let action = '—';
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t === `# EVOKIT:END ${name}`) break;
      const seg = (t.match(/learn --(?:auto|assist)/) || [])[0];
      if (seg) { action = seg; break; }
    }
    rows.push({
      name,
      state: 'scheduled',
      action,
      info: { NextRunTime: '—', LastRunTime: '—', LastTaskResult: '—' },
    });
  }
  return rows;
}
