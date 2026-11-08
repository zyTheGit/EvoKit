#!/usr/bin/env node
/**
 * EvoKit CLI M6 定时学习管理测试（schedule enable/disable/list + learn --assist）
 *
 * 自包含：直接 `node cli/test-m6.mjs` 运行；任一断言失败退出码 1。
 * 隔离与安全：schedule 全部经注入 deps={run, platform} 的假 runner 驱动，绝不真调 schtasks / launchctl / crontab；
 *   learn 走隔离 EVOKIT_HOME（进程级重定向 + CLI 子进程注入 env），不触碰真实知识根。
 *
 * 覆盖：
 *  - enable 缺省参数：schtasks /Create 参数正确（/TN EvoKit Learn、/SC DAILY、/ST 02:00、/F，
 *    /TR=包装脚本绝对路径）、包装脚本写盘三行（@echo off / cd /d EVOKIT_DIR / node+script+learn --auto）、
 *    PowerShell 读回校验（action 含包装脚本路径 → ✓）、注册信息与三条 ℹ 说明输出、PowerShell 查询单行 -NoProfile。
 *  - enable 参数校验：--time 非法 / --mode 非法 / --task 非法 → exit 1 且不调用任何外部命令。
 *  - enable 幂等：两次 enable 都带 /F；第二次 pre-query 读到任务 → 提示「已覆盖既有任务」。
 *  - enable 读回校验失败：读回 action 不含包装脚本路径（或不可解析）→ ✗「存储命令不完整」exit 1；
 *    读回通过但包装脚本第三行缺 learn --mode → ✗「包装脚本内容异常」exit 1。
 *  - disable：存在 → /Delete /TN <task> /F + 包装脚本删除；不存在（stderr 含 ERROR: The scheduled task）→ exit 0 友好提示。
 *  - list：不支持平台（freebsd）→ exit 1「当前平台暂不支持定时管理」且不调 run；win32 解析 JSON → 表格含任务名/下次运行/
 *    结果 0=成功/非 0 标 ⚠/learn --mode；空 JSON → 「无正在运行的 EvoKit 定时任务」；--json 输出原始 JSON 数组；
 *    action 不含对应包装脚本路径 → 「脚本已移动」提示；--task 精确名查询。
 *  - learn --assist：与 --auto 互斥 exit 1；--assist 单独生效（learnRun automation 临时覆盖为 assist，
 *    未传时仍按 settings 默认 manual；CLI 层输出 assist 档）。
 *  - schedule 注册：KNOWN_COMMANDS（拼错 schedul 建议 schedule）、help 文案含 enable/disable/list、未知子命令用法 exit 1。
 *  - 跨平台（darwin/linux 后端）：enable 写 LaunchAgent plist（launchctl unload→load→list 读回）/ crontab 托管块
 *    （读改写→stdin 写回→读回校验），失败路径（读回不含 label / load 失败 / 无 crontab 命令）；disable 幂等
 *    （unload+删 plist / 删块写回 / 无任务 exit 0）；list 解析 launchctl list 与 crontab 托管块（--json 行形状同 win32）。
 */

import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, 'evokit.mjs');
// schedule.js 读回/注册使用的 evokit.mjs 绝对路径（与 schedule.js 的解析方式等价：cli/evokit.mjs）
const EXPECTED_SCRIPT = resolve(__dirname, 'evokit.mjs');

let passed = 0;
let failed = 0;
function ok(name) { passed++; console.log(`  ✓ ${name}`); }
function fail(name, detail) { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
function assert(cond, name, detail) { cond ? ok(name) : fail(name, detail); }

const tmpRoot = mkdtempSync(join(tmpdir(), 'evokit-m6-'));
// 先设隔离 env 再动态 import：paths.js 在模块加载时读取 EVOKIT_HOME
process.env.EVOKIT_HOME = tmpRoot;
const { scheduleCommand } = await import('./src/commands/schedule.js');
const learn = await import('./src/commands/learn.js');

const EVOKIT_DIR = join(tmpRoot, '.evokit'); // 与 paths.js 同源
const SCHEDULE_DIR = join(EVOKIT_DIR, 'schedule');
const LAUNCHAGENTS_DIR = join(tmpRoot, 'Library', 'LaunchAgents'); // darwin LaunchAgents（EVOKIT_HOME 隔离到 tmp）
/** darwin plist 路径（label=com.evokit.<slug>） */
const darwinPlistFor = (slug) => join(LAUNCHAGENTS_DIR, `com.evokit.${slug}.plist`);

/** 构造注入 deps：run 记录每次调用并按命令分派（powershell → ps，其余 → st），platform 可指定 */
const makeDeps = ({ platform = 'win32', ps = () => ({ status: 0, stdout: '', stderr: '' }), st = () => ({ status: 0, stdout: '', stderr: '' }) } = {}) => {
  const calls = [];
  const run = (cmd, args, input) => {
    calls.push({ cmd, args, input });
    if (cmd === 'powershell') return ps(args, calls.length);
    return st(args, calls.length, input);
  };
  return { deps: { run, platform }, calls };
};

/** 构造多命令注入 deps：按 cmd 分派假 runner（handlers[cmd](args, input, idx)），记录 {cmd,args,input}；未命中命令返回 status 0 */
const makeDepsByCmd = ({ platform, handlers = {} } = {}) => {
  const calls = [];
  const run = (cmd, args, input) => {
    calls.push({ cmd, args, input });
    const h = handlers[cmd];
    return h ? h(args, input, calls.length) : { status: 0, stdout: '', stderr: '' };
  };
  return { deps: { run, platform }, calls };
};

/** 捕获 console.log/error 输出并返回 fn 的返回值（in-process 调用命令时用） */
const capture = (fn) => {
  const out = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a) => out.push(a.map(String).join(' '));
  console.error = (...a) => out.push(a.map(String).join(' '));
  let result;
  try { result = fn(); } finally { console.log = origLog; console.error = origErr; }
  return { text: out.join('\n'), result };
};

/** in-process 调 scheduleCommand：每次调用前重置 exitCode，返回 {code, text}；异常折算为 exit 1 */
const runSchedule = (args, deps) => {
  process.exitCode = undefined;
  let text = '';
  try {
    text = capture(() => scheduleCommand(args, deps)).text;
  } catch (e) {
    text = 'THROWN: ' + (e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
  return { code: process.exitCode === undefined ? 0 : process.exitCode, text };
};

/** 在隔离 CLI 子进程里跑 evokit（home 决定 EVOKIT_HOME） */
const runCli = (args, home) => {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, EVOKIT_HOME: home },
    encoding: 'utf-8',
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
};

/** 查询读回用的任务行（action 指向当前 node + evokit.mjs + learn --<mode>） */
const taskRow = (name, mode, actionOverride) => ({
  name,
  state: 'Ready',
  action: actionOverride !== undefined ? actionOverride : `"${process.execPath}" "${EXPECTED_SCRIPT}" learn --${mode}`,
  info: { NextRunTime: '2026/11/9 2:00:00', LastRunTime: '2026/11/8 2:00:00', LastTaskResult: 0 },
});

console.log(`隔离测试 home: ${tmpRoot}\n`);

// ── 1. enable 缺省参数：/Create 参数 + 包装脚本写盘 + 读回校验通过 ──
console.log('【1. enable 缺省参数注册】');
{
  const wrapperPath = join(SCHEDULE_DIR, 'EvoKitLearn.cmd');
  const { deps, calls } = makeDeps({
    platform: 'win32',
    ps: (_args, idx) => (idx === 1 // 第一次 powershell = 重复注册检测（任务不存在）
      ? { status: 1, stdout: '', stderr: 'NoMatching' }
      : { status: 0, stdout: JSON.stringify([taskRow('EvoKit Learn', 'auto', wrapperPath)]), stderr: '' }),
  });
  const r = runSchedule(['enable'], deps);
  assert(r.code === 0, `enable exit 0（实际 ${r.code}）`, r.text.slice(0, 200));
  const create = calls.find((c) => c.cmd === 'schtasks' && c.args[0] === '/Create');
  assert(!!create, 'run 收到 schtasks /Create');
  if (create) {
    const a = create.args;
    assert(a[1] === '/F' && a[2] === '/TN' && a[3] === 'EvoKit Learn' && a[4] === '/SC' && a[5] === 'DAILY' && a[6] === '/ST' && a[7] === '02:00' && a[8] === '/TR',
      `/Create 参数正确（/F /TN EvoKit Learn /SC DAILY /ST 02:00 /TR，实际 ${JSON.stringify(a)}）`);
    assert(a[9] === wrapperPath,
      `/TR=包装脚本绝对路径（实际 ${JSON.stringify(a[9])}）`);
  }
  assert(existsSync(wrapperPath), '包装脚本已写盘（~/.evokit/schedule/EvoKitLearn.cmd）');
  if (existsSync(wrapperPath)) {
    const lines = readFileSync(wrapperPath, 'utf-8').split(/\r?\n/).filter(Boolean);
    assert(lines.length === 3, `包装脚本内容三行（实际 ${lines.length} 行）`, JSON.stringify(lines));
    if (lines.length === 3) {
      assert(lines[0] === '@echo off', '第 1 行 @echo off');
      assert(lines[1] === `cd /d "${EVOKIT_DIR}"`, '第 2 行 cd /d EVOKIT_DIR');
      assert(lines[2] === `"${process.execPath}" "${EXPECTED_SCRIPT}" learn --auto`, '第 3 行含 node/script 路径与 learn --auto');
    }
  }
  assert(r.text.includes('✓'), '输出 ✓ 注册信息');
  assert(r.text.includes('02:00') && r.text.includes('learn --auto') && r.text.includes(wrapperPath), '注册信息含时间/档位/包装脚本');
  assert(r.text.includes('下次运行') && r.text.includes('2026/11/9 2:00:00'), '注册信息含下次运行（读回 info）');
  assert(r.text.includes('LLM 费用') && r.text.includes('evokit schedule disable')
    && r.text.includes('cwd=~/.evokit（wrapper 已 cd）') && r.text.includes('settings sources 配 root'), '三条 ℹ 说明齐全（费用/卸载/cwd=wrapper 已 cd）');
  assert(r.text.includes('新建任务') || !r.text.includes('已覆盖既有任务'), '首次注册不提示已覆盖');
  const psCall = calls.find((c) => c.cmd === 'powershell');
  assert(!!psCall && psCall.args[0] === '-NoProfile' && psCall.args[1] === '-Command' && !psCall.args[2].includes('\n'),
    'PowerShell 查询为单行 -NoProfile -Command');
}

// ── 2. enable 参数校验：非法输入 exit 1 且不调外部命令 ─────
console.log('\n【2. enable 参数校验】');
{
  const t1 = makeDeps({ platform: 'win32' });
  const r1 = runSchedule(['enable', '--time', '25:00'], t1.deps);
  assert(r1.code === 1, `--time 25:00 → exit 1（实际 ${r1.code}）`);
  assert(t1.calls.length === 0, '非法 --time 不调用任何外部命令');
  assert(r1.text.includes('✗'), '输出 ✗ 错误提示');

  const t2 = makeDeps({ platform: 'win32' });
  const r2 = runSchedule(['enable', '--time', '2:0'], t2.deps);
  assert(r2.code === 1 && t2.calls.length === 0, `--time 2:0 → exit 1 且不调命令（实际 ${r2.code}/${t2.calls.length}）`);

  const t3 = makeDeps({ platform: 'win32' });
  const r3 = runSchedule(['enable', '--mode', 'yolo'], t3.deps);
  assert(r3.code === 1, `--mode yolo → exit 1（实际 ${r3.code}）`);
  assert(t3.calls.length === 0, '非法 --mode 不调用任何外部命令');
  assert(r3.text.includes('auto|assist'), '提示只允许 auto|assist');

  const t4 = makeDeps({ platform: 'win32' });
  const r4 = runSchedule(['enable', '--task', 'MyTask'], t4.deps);
  assert(r4.code === 1 && t4.calls.length === 0, `--task MyTask → exit 1 且不调命令（实际 ${r4.code}/${t4.calls.length}）`);
}

// ── 3. enable 幂等：第二次仍 /F 且提示已覆盖 ────────────────
console.log('\n【3. enable 幂等（重复注册）】');
{
  const { deps, calls } = makeDeps({
    platform: 'win32',
    ps: () => ({ status: 0, stdout: JSON.stringify([taskRow('EvoKit Twice', 'auto', join(SCHEDULE_DIR, 'EvoKitTwice.cmd'))]), stderr: '' }),
  });
  const r1 = runSchedule(['enable', '--task', 'EvoKit Twice'], deps);
  const r2 = runSchedule(['enable', '--task', 'EvoKit Twice'], deps);
  assert(r1.code === 0 && r2.code === 0, `两次 enable 均 exit 0（实际 ${r1.code}/${r2.code})`);
  const creates = calls.filter((c) => c.cmd === 'schtasks' && c.args[0] === '/Create');
  assert(creates.length === 2, `两次 enable 各触发一次 /Create（实际 ${creates.length}）`);
  assert(creates.every((c) => c.args.includes('/F')), '两次 /Create 都带 /F（可覆盖）');
  assert(r2.text.includes('已覆盖既有任务'), '第二次 enable 提示「已覆盖既有任务」');
}

// ── 4. enable 读回/包装脚本校验失败：action 不含 wrapper 路径 →「存储命令不完整」；第三行缺 learn --mode →「包装脚本内容异常」 ──
console.log('\n【4. enable 读回校验失败】');
{
  const t1 = makeDeps({
    platform: 'win32',
    ps: (_args, idx) => (idx === 1
      ? { status: 1, stdout: '', stderr: '' }
      : { status: 0, stdout: JSON.stringify([taskRow('EvoKit Moved', 'auto', 'C:\\old\\path\\node.exe learn --auto')]), stderr: '' }),
  });
  const r1 = runSchedule(['enable', '--task', 'EvoKit Moved'], t1.deps);
  assert(r1.code === 1, `读回不含 script 路径 → exit 1（实际 ${r1.code}）`);
  assert(r1.text.includes('存储命令不完整'), '提示「存储命令不完整，请检查路径空格/改用手动模板」');
  assert(t1.calls.some((c) => c.cmd === 'schtasks' && c.args[0] === '/Create'), 'schtasks /Create 已发生（先注册后校验）');

  const t2 = makeDeps({
    platform: 'win32',
    ps: (_args, idx) => (idx === 1
      ? { status: 1, stdout: '', stderr: '' }
      : { status: 0, stdout: 'not-json', stderr: '' }),
  });
  const r2 = runSchedule(['enable', '--task', 'EvoKit Bad', '--mode', 'assist'], t2.deps);
  assert(r2.code === 1 && r2.text.includes('存储命令不完整'), '读回不可解析 → 同样 ✗ exit 1');
  const create2 = t2.calls.find((c) => c.cmd === 'schtasks' && c.args[0] === '/Create');
  const badWrapper = join(SCHEDULE_DIR, 'EvoKitBad.cmd');
  assert(!!create2 && create2.args[9] === badWrapper, '--mode assist 时 /TR 仍=包装脚本绝对路径（实际 ' + (create2 ? JSON.stringify(create2.args[9]) : '未调用') + '）');
  assert(readFileSync(badWrapper, 'utf-8').includes('learn --assist'), '--mode assist 记录在包装脚本第三行（不在 TR）');

  // 4c. 读回通过但包装脚本第三行缺 learn --mode → ✗「包装脚本内容异常」exit 1（st 在 /Create 时篡改 wrapper，模拟内容被改坏）
  {
    const brokenWrapper = join(SCHEDULE_DIR, 'EvoKitBroken.cmd');
    const t3 = makeDeps({
      platform: 'win32',
      ps: (_args, idx) => (idx === 1
        ? { status: 1, stdout: '', stderr: '' }
        : { status: 0, stdout: JSON.stringify([taskRow('EvoKit Broken', 'auto', brokenWrapper)]), stderr: '' }),
      st: (args) => {
        if (args[0] === '/Create') writeFileSync(brokenWrapper, '@echo off\r\ncd /d "x"\r\nREM broken\r\n', 'utf-8');
        return { status: 0, stdout: '', stderr: '' };
      },
    });
    const r3 = runSchedule(['enable', '--task', 'EvoKit Broken'], t3.deps);
    assert(r3.code === 1, `包装脚本第三行缺 learn --mode → exit 1（实际 ${r3.code}）`);
    assert(r3.text.includes('包装脚本内容异常'), '提示「包装脚本内容异常」');
    assert(t3.calls.some((c) => c.cmd === 'schtasks' && c.args[0] === '/Create'), '/Create 已发生（先写 wrapper、注册，再校验内容）');
  }
}

// ── 5. disable：存在 → /Delete + 包装脚本删除 ───────────────
console.log('\n【5. disable 存在】');
{
  mkdirSync(SCHEDULE_DIR, { recursive: true });
  const w = join(SCHEDULE_DIR, 'EvoKitAlive.cmd');
  writeFileSync(w, 'placeholder', 'utf-8');
  const { deps, calls } = makeDeps({ platform: 'win32' });
  const r = runSchedule(['disable', '--task', 'EvoKit Alive'], deps);
  assert(r.code === 0, `disable 存在 → exit 0（实际 ${r.code}）`);
  const del = calls.find((c) => c.cmd === 'schtasks');
  assert(!!del && del.args[0] === '/Delete' && del.args[1] === '/TN' && del.args[2] === 'EvoKit Alive' && del.args[3] === '/F',
    `/Delete /TN EvoKit Alive /F（实际 ${del ? JSON.stringify(del.args) : '未调用'}）`);
  assert(!existsSync(w), '包装脚本一并删除');
  assert(r.text.includes('✓'), '成功输出 ✓');
}

// ── 6. disable 不存在：stderr 含 ERROR: The scheduled task → exit 0 ──
console.log('\n【6. disable 任务不存在（幂等）】');
{
  const { deps, calls } = makeDeps({
    platform: 'win32',
    st: () => ({ status: 1, stdout: '', stderr: 'ERROR: The scheduled task "EvoKit Ghost" does not exist.' }),
  });
  const r = runSchedule(['disable', '--task', 'EvoKit Ghost'], deps);
  assert(r.code === 0, `任务不存在 → exit 0（实际 ${r.code}）`);
  assert(r.text.includes('ℹ'), '输出 ℹ 友好提示');
  assert(calls.filter((c) => c.cmd === 'schtasks').length === 1, '仍调用了一次 /Delete');
}

// ── 7. 不支持平台（freebsd）：✗ 提示 + exit 1 ───────────────
console.log('\n【7. 不支持平台（freebsd）】');
{
  const { deps, calls } = makeDeps({ platform: 'freebsd' });
  const r = runSchedule(['list'], deps);
  assert(r.code === 1, `不支持平台 → exit 1（实际 ${r.code}）`);
  assert(calls.length === 0, '不调用任何外部命令');
  assert(r.text.includes('当前平台暂不支持定时管理'), '提示「当前平台暂不支持定时管理（支持 Windows / macOS / Linux）」');
}

// ── 8. list win32：解析 JSON → 表格 + 脚本已移动提示 ────────
console.log('\n【8. list win32 表格输出】');
{
  const oldRow = taskRow('EvoKit Old', 'auto', 'C:\\repo-old\\cli\\evokit.mjs learn --auto');
  oldRow.info.LastTaskResult = 1; // 真失败码：表格应标 ⚠
  const notYetRow = taskRow('EvoKit NotYet', 'auto');
  notYetRow.info.LastTaskResult = 267011; // 信息性状态码：尚未运行，不应标 ⚠
  const psJson = JSON.stringify([taskRow('EvoKit Learn', 'auto'), oldRow, notYetRow]);
  const { deps, calls } = makeDeps({ platform: 'win32', ps: () => ({ status: 0, stdout: psJson, stderr: '' }) });
  const r = runSchedule(['list'], deps);
  assert(r.code === 0, `list exit 0（实际 ${r.code}）`, r.text.slice(0, 200));
  assert(r.text.includes('EvoKit Learn') && r.text.includes('EvoKit Old'), '表格含任务名');
  assert(r.text.includes('2026/11/9 2:00:00'), '表格含下次运行');
  assert(r.text.includes('成功 (0)'), '上次结果 0 → 成功');
  assert(r.text.includes('⚠ 1'), '真失败码 → 标 ⚠');
  assert(r.text.includes('尚未运行 (267011)'), '267011=任务尚未运行（信息性，不标 ⚠）');
  assert(r.text.includes('learn --auto'), '计划动作含 learn --mode');
  assert(r.text.includes('脚本已移动'), 'action 不含当前 script 路径 → 脚本已移动提示');
  const psCall = calls.find((c) => c.cmd === 'powershell');
  assert(!!psCall && psCall.args[0] === '-NoProfile' && psCall.args[2].includes("Get-ScheduledTask -TaskName 'EvoKit *'"),
    '无 --task 时按 EvoKit * 前缀通配查询');

  const t2 = makeDeps({ platform: 'win32', ps: () => ({ status: 0, stdout: psJson, stderr: '' }) });
  runSchedule(['list', '--task', 'EvoKit Learn'], t2.deps);
  const ps2 = t2.calls.find((c) => c.cmd === 'powershell');
  assert(!!ps2 && ps2.args[2].includes("Get-ScheduledTask -TaskName 'EvoKit Learn'"), '--task 时按精确名查询');
}

// ── 9. list 空 JSON → 无任务提示 ────────────────────────────
console.log('\n【9. list 空结果】');
{
  const t1 = makeDeps({ platform: 'win32', ps: () => ({ status: 0, stdout: '', stderr: '' }) });
  const r1 = runSchedule(['list'], t1.deps);
  assert(r1.code === 0, `空结果 exit 0（实际 ${r1.code}）`);
  assert(r1.text.includes('无正在运行的 EvoKit 定时任务'), '提示「无正在运行的 EvoKit 定时任务」');

  const t2 = makeDeps({ platform: 'win32', ps: () => ({ status: 0, stdout: 'garbage-not-json', stderr: '' }) });
  const r2 = runSchedule(['list'], t2.deps);
  assert(r2.code === 0 && r2.text.includes('无正在运行的 EvoKit 定时任务'), 'JSON 不可解析按空结果处理');
}

// ── 10. list --json：输出原始 JSON 数组 ─────────────────────
console.log('\n【10. list --json】');
{
  const { deps } = makeDeps({
    platform: 'win32',
    ps: () => ({ status: 0, stdout: JSON.stringify(taskRow('EvoKit Solo', 'assist')), stderr: '' }), // 单任务对象（非数组）
  });
  const r = runSchedule(['list', '--json'], deps);
  let arr = null;
  try { arr = JSON.parse(r.text.trim()); } catch { arr = null; }
  assert(Array.isArray(arr), '--json 输出原始 JSON 数组（单任务对象归一为数组）');
  assert(!!arr && arr.length === 1 && arr[0].name === 'EvoKit Solo' && arr[0].info.LastTaskResult === 0,
    'JSON 字段原样保留（name/info.LastTaskResult）');
  const t2 = makeDeps({ platform: 'win32', ps: () => ({ status: 0, stdout: '', stderr: '' }) });
  const r2 = runSchedule(['list', '--json'], t2.deps);
  assert(r2.text.trim() === '[]', '空结果 --json 输出 []');
}

// ── 11. learn --assist：与 --auto 互斥 ──────────────────────
console.log('\n【11. learn --auto 与 --assist 互斥】');
{
  const home = mkdtempSync(join(tmpRoot, 'learn-mutex-'));
  const r = runCli(['learn', '--auto', '--assist', '--no-distill'], home);
  assert(r.code === 1, `同传 --auto --assist → exit 1（实际 ${r.code}）`);
  assert((r.stderr + r.stdout).includes('互斥'), '提示互斥');
}

// ── 12. learn --assist 单独生效 ─────────────────────────────
console.log('\n【12. learn --assist 单独生效】');
{
  // 12a 直调 learnRun（进程级 EVOKIT_HOME 已隔离；--no-distill 跳过提纯，harvest 在空 home 上为空跑）
  const a1 = capture(() => learn.learnRun({ assist: true, noDistill: true, quietHarvest: true }));
  assert(a1.result && a1.result.automation === 'assist', `--assist → automation==='assist'（实际 ${a1.result && a1.result.automation}）`);
  const a2 = capture(() => learn.learnRun({ noDistill: true, quietHarvest: true }));
  assert(a2.result && a2.result.automation === 'manual', `未传 --assist 仍按 settings 默认 manual（实际 ${a2.result && a2.result.automation}）`);
  const a3 = capture(() => learn.learnRun({ auto: true, noDistill: true, quietHarvest: true }));
  assert(a3.result && a3.result.automation === 'auto', `--auto 仍生效（实际 ${a3.result && a3.result.automation}）`);

  // 12b CLI 层：--assist 输出 assist 档
  const home = mkdtempSync(join(tmpRoot, 'learn-assist-'));
  const r = runCli(['learn', '--assist', '--no-distill'], home);
  assert(r.code === 0, `learn --assist --no-distill exit 0（实际 ${r.code}）`, (r.stderr || '').slice(0, 160));
  assert(r.stdout.includes('assist 档'), 'CLI 输出 assist 档');
}

// ── 13. schedule 注册：KNOWN_COMMANDS + help 文案 ───────────
console.log('\n【13. schedule 命令注册】');
{
  const regHome = mkdtempSync(join(tmpRoot, 'reg-'));
  const h = runCli(['help'], regHome);
  assert(h.code === 0 && h.stdout.includes('evokit schedule enable [--time HH:MM] [--mode auto|assist]'), 'help 含 schedule enable 文案');
  assert(h.stdout.includes('evokit schedule disable [--task <name>]'), 'help 含 schedule disable 文案');
  assert(h.stdout.includes('evokit schedule list'), 'help 含 schedule list 文案');
  const typo = runCli(['schedul'], regHome);
  assert(typo.code === 1 && (typo.stdout + typo.stderr).includes('schedule'), `拼错 schedul 建议 schedule（实际 exit ${typo.code}）`);

  const { deps, calls } = makeDeps({ platform: 'win32' });
  const r = runSchedule(['bogus'], deps);
  assert(r.code === 1 && r.text.includes('用法'), '未知子命令打印用法并 exit 1');
  assert(calls.length === 0, '未知子命令不调用外部命令');
}

// ── 14. darwin enable：写 plist + launchctl unload→load→list 读回 ──
console.log('\n【14. darwin enable】');
{
  const plist = darwinPlistFor('EvoKitLearn');
  const logPath = join(EVOKIT_DIR, 'schedule', 'logs', 'EvoKitLearn.log');
  const { deps, calls } = makeDepsByCmd({
    platform: 'darwin',
    handlers: {
      launchctl: (args) => (args[0] === 'list'
        ? { status: 0, stdout: '-\t0\tcom.evokit.EvoKitLearn\n', stderr: '' }
        : { status: 0, stdout: '', stderr: '' }),
    },
  });
  const r = runSchedule(['enable'], deps);
  assert(r.code === 0, `darwin enable exit 0（实际 ${r.code}）`, r.text.slice(0, 200));
  assert(existsSync(plist), 'plist 已写盘（~/Library/LaunchAgents/com.evokit.EvoKitLearn.plist）');
  if (existsSync(plist)) {
    const xml = readFileSync(plist, 'utf-8');
    assert(xml.includes('<key>Label</key>') && xml.includes('<string>com.evokit.EvoKitLearn</string>'), 'plist 含 Label=com.evokit.EvoKitLearn');
    assert(xml.includes(`<string>${process.execPath}</string>`) && xml.includes(`<string>${EXPECTED_SCRIPT}</string>`), 'ProgramArguments 含 node 与 evokit.mjs 绝对路径');
    assert(/<string>learn<\/string>\s*<string>--auto<\/string>/.test(xml), 'ProgramArguments 含 learn --auto');
    assert(/<key>Hour<\/key>\s*<integer>2<\/integer>/.test(xml) && /<key>Minute<\/key>\s*<integer>0<\/integer>/.test(xml), 'StartCalendarInterval Hour=2 Minute=0（默认 02:00）');
    assert(xml.includes(`<string>${EVOKIT_DIR}</string>`), 'WorkingDirectory=EVOKIT_DIR');
    assert(xml.includes(`<string>${logPath}</string>`), 'StandardOutPath/StandardErrorPath 指向 ~/.evokit/schedule/logs/');
  }
  assert(calls.length === 3, `launchctl 恰好 3 次调用（实际 ${calls.length}）`);
  assert(calls[0].args[0] === 'unload' && calls[1].args[0] === 'load' && calls[2].args[0] === 'list', 'launchctl 顺序 unload→load→list（读回）');
  assert(calls[1].args[1] === plist, 'load 指向 plist 绝对路径');
  assert(r.text.includes('✓') && r.text.includes('02:00') && r.text.includes('learn --auto') && r.text.includes('日志文件'), '输出 ✓ 与 计划/档位/日志文件');

  // 读回不含 label → ✗ exit 1
  const t2 = makeDepsByCmd({
    platform: 'darwin',
    handlers: { launchctl: (args) => (args[0] === 'list' ? { status: 0, stdout: '-\t0\tcom.other.Thing\n', stderr: '' } : { status: 0, stdout: '', stderr: '' }) },
  });
  const r2 = runSchedule(['enable'], t2.deps);
  assert(r2.code === 1, `读回不含 label → exit 1（实际 ${r2.code}）`);
  assert(r2.text.includes('✗'), '输出 ✗');

  // load 失败 → ✗ exit 1
  const t3 = makeDepsByCmd({
    platform: 'darwin',
    handlers: { launchctl: (args) => (args[0] === 'load' ? { status: 1, stdout: '', stderr: 'Load failed: 5: Input/output error' } : { status: 0, stdout: '', stderr: '' }) },
  });
  const r3 = runSchedule(['enable', '--task', 'EvoKit LoadFail'], t3.deps);
  assert(r3.code === 1 && r3.text.includes('load 失败'), `launchctl load 失败 → exit 1（实际 ${r3.code}）`);
}

// ── 15. darwin disable：unload + 删 plist（幂等） ────────────
console.log('\n【15. darwin disable】');
{
  mkdirSync(LAUNCHAGENTS_DIR, { recursive: true });
  const plist = darwinPlistFor('EvoKitAlive');
  writeFileSync(plist, '<plist/>', 'utf-8');
  const { deps, calls } = makeDepsByCmd({ platform: 'darwin' });
  const r = runSchedule(['disable', '--task', 'EvoKit Alive'], deps);
  assert(r.code === 0, `darwin disable 存在 → exit 0（实际 ${r.code}）`);
  assert(calls.length === 1 && calls[0].args[0] === 'unload' && calls[0].args[1] === plist, 'launchctl unload 指向 plist');
  assert(!existsSync(plist), 'plist 已删除');
  assert(r.text.includes('✓'), '输出 ✓');

  // 不存在 → 幂等 exit 0（unload 仍尝试，失败容忍）
  const t2 = makeDepsByCmd({ platform: 'darwin', handlers: { launchctl: () => ({ status: 1, stdout: '', stderr: 'Could not find service' }) } });
  const r2 = runSchedule(['disable', '--task', 'EvoKit Ghost'], t2.deps);
  assert(r2.code === 0, `darwin disable 不存在 → exit 0（实际 ${r2.code}）`);
  assert(r2.text.includes('ℹ'), '输出 ℹ 幂等提示');
  assert(t2.calls.length === 1 && t2.calls[0].args[0] === 'unload', '仍尝试 unload（失败容忍）');
}

// ── 16. darwin list：launchctl list + 逐 label 读 plist ──────
console.log('\n【16. darwin list】');
{
  mkdirSync(LAUNCHAGENTS_DIR, { recursive: true });
  writeFileSync(darwinPlistFor('EvoKitLearn'), '<?xml version="1.0"?><plist version="1.0"><dict>'
    + '<key>Label</key><string>com.evokit.EvoKitLearn</string>'
    + '<key>ProgramArguments</key><array><string>/node</string><string>/cli/evokit.mjs</string><string>learn</string><string>--assist</string></array>'
    + '<key>StartCalendarInterval</key><dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>30</integer></dict>'
    + '</dict></plist>', 'utf-8');
  // com.evokit.EvoKitGhost 有 launchctl 记录但 plist 不存在 → action='—'；not.evokit. 前缀被过滤
  const { deps } = makeDepsByCmd({
    platform: 'darwin',
    handlers: { launchctl: () => ({ status: 0, stdout: '-\t0\tcom.evokit.EvoKitLearn\n12345\t15\tcom.evokit.EvoKitGhost\n999\t0\tnot.evokit.Other\n', stderr: '' }) },
  });
  const r = runSchedule(['list'], deps);
  assert(r.code === 0, `darwin list exit 0（实际 ${r.code}）`, r.text.slice(0, 200));
  assert(r.text.includes('com.evokit.EvoKitLe') && r.text.includes('com.evokit.EvoKitGh'), '表格含两个 com.evokit. 任务名（22 字符截到 19+…，与 win32 列宽一致；完整 label 由 --json 断言）');
  assert(r.text.includes('learn --assist'), '表格含 learn --assist（来自 plist ProgramArguments）');
  assert(!r.text.includes('not.evokit.Other'), '非 com.evokit. 前缀被过滤');
  const t2 = makeDepsByCmd({
    platform: 'darwin',
    handlers: { launchctl: () => ({ status: 0, stdout: '-\t0\tcom.evokit.EvoKitLearn\n', stderr: '' }) },
  });
  const r2 = runSchedule(['list', '--json'], t2.deps);
  let arr = null;
  try { arr = JSON.parse(r2.text.trim()); } catch { arr = null; }
  assert(Array.isArray(arr) && arr.length === 1, '--json 输出数组（长度 1）');
  assert(!!arr && arr[0].name === 'com.evokit.EvoKitLearn' && arr[0].state === 'loaded'
    && arr[0].info.NextRunTime === '—' && arr[0].info.LastRunTime === '—' && arr[0].info.LastTaskResult === 0,
    'JSON 行形状同 win32（name/state/action/info，Next/LastRunTime=—，LastTaskResult=launchctl 第二列）');
  assert(!!arr && arr[0].action.includes('learn --assist') && arr[0].action.includes('03:30'), 'action 含 learn --assist 与 HH:MM（来自 plist）');

  // 空 launchctl list → 无任务提示
  const t3 = makeDepsByCmd({ platform: 'darwin', handlers: { launchctl: () => ({ status: 0, stdout: '', stderr: '' }) } });
  const r3 = runSchedule(['list'], t3.deps);
  assert(r3.code === 0 && r3.text.includes('无正在运行的 EvoKit 定时任务'), '空结果 → 无任务提示');
}

// ── 17. linux enable：crontab 读改写 + 读回校验 ──────────────
console.log('\n【17. linux enable】');
{
  const oldCrontab = [
    'SHELL=/bin/bash',
    '# EVOKIT:BEGIN EvoKit Learn',
    '0 3 * * * cd "/old" && "/old/node" "/old/evokit.mjs" learn --assist >> "/old/log" 2>&1',
    '# EVOKIT:END EvoKit Learn',
    '30 4 * * * user-job --flag',
  ].join('\n') + '\n';
  let writtenInput = null;
  const { deps, calls } = makeDepsByCmd({
    platform: 'linux',
    handlers: {
      crontab: (args, input, idx) => {
        if (args[0] === '-') { writtenInput = input; return { status: 0, stdout: '', stderr: '' }; }
        return idx === 1 ? { status: 0, stdout: oldCrontab, stderr: '' } : { status: 0, stdout: writtenInput || '', stderr: '' };
      },
    },
  });
  const r = runSchedule(['enable'], deps);
  assert(r.code === 0, `linux enable exit 0（实际 ${r.code}）`, r.text.slice(0, 200));
  const write = calls.find((c) => c.cmd === 'crontab' && c.args[0] === '-');
  assert(!!write, 'crontab - 收到 stdin 写回调用');
  const nextContent = write ? String(write.input) : '';
  assert(nextContent.includes('# EVOKIT:BEGIN EvoKit Learn') && nextContent.includes('# EVOKIT:END EvoKit Learn'), '新全文含 BEGIN/END 托管块');
  assert(nextContent.includes('0 2 * * * cd "') && nextContent.includes(`cd "${EVOKIT_DIR}"`), 'cron 时间分钟在前（0 2 * * *）且 cd 到 EVOKIT_DIR');
  assert(nextContent.includes(`"${process.execPath}" "${EXPECTED_SCRIPT}" learn --auto`), 'cron 行含 node/script 绝对路径与 learn --auto');
  assert(nextContent.includes(join(EVOKIT_DIR, 'schedule', 'logs', 'EvoKitLearn.log')) && nextContent.includes('2>&1'), '日志重定向到 ~/.evokit/schedule/logs/ 且含 2>&1');
  assert(!nextContent.includes('--assist') && (nextContent.match(/# EVOKIT:BEGIN EvoKit Learn/g) || []).length === 1, '旧块被替换（--assist 消失，同名块仅一份）');
  assert(nextContent.includes('30 4 * * * user-job --flag'), '用户既有 crontab 行保留');
  assert(nextContent.endsWith('\n'), '新全文以换行结尾');

  // 无 crontab 命令 → ✗ exit 1
  const t2 = makeDepsByCmd({ platform: 'linux', handlers: { crontab: () => ({ status: null, stdout: '', stderr: '' }) } });
  const r2 = runSchedule(['enable'], t2.deps);
  assert(r2.code === 1 && r2.text.includes('未检测到 crontab'), `无 crontab 命令 → exit 1（实际 ${r2.code}）`);

  // no crontab for → 视为空表，正常注册
  let emptyInput = null;
  const t3 = makeDepsByCmd({
    platform: 'linux',
    handlers: {
      crontab: (args, input, idx) => {
        if (args[0] === '-') { emptyInput = input; return { status: 0, stdout: '', stderr: '' }; }
        return idx === 1 ? { status: 1, stdout: '', stderr: 'no crontab for zy' } : { status: 0, stdout: emptyInput || '', stderr: '' };
      },
    },
  });
  const r3 = runSchedule(['enable'], t3.deps);
  assert(r3.code === 0 && r3.text.includes('✓'), `no crontab for → 视为空表并注册成功（实际 ${r3.code}）`);
  assert(!!emptyInput && emptyInput.startsWith('# EVOKIT:BEGIN EvoKit Learn'), '空表时新全文仅含托管块');
}

// ── 18. linux disable：删块写回（幂等） ──────────────────────
console.log('\n【18. linux disable】');
{
  const crontabWithBlock = [
    '30 4 * * * user-job',
    '# EVOKIT:BEGIN EvoKit Learn',
    '0 2 * * * cd "/x" && "/node" "/e.mjs" learn --auto >> log 2>&1',
    '# EVOKIT:END EvoKit Learn',
  ].join('\n') + '\n';
  let writtenInput = null;
  const { deps, calls } = makeDepsByCmd({
    platform: 'linux',
    handlers: {
      crontab: (args, input) => {
        if (args[0] === '-') { writtenInput = input; return { status: 0, stdout: '', stderr: '' }; }
        return { status: 0, stdout: crontabWithBlock, stderr: '' };
      },
    },
  });
  const r = runSchedule(['disable', '--task', 'EvoKit Learn'], deps);
  assert(r.code === 0, `linux disable 存在 → exit 0（实际 ${r.code}）`);
  assert(!!writtenInput && !writtenInput.includes('# EVOKIT:BEGIN') && writtenInput.includes('30 4 * * * user-job'), '写回全文已删托管块且保留用户行');
  assert(r.text.includes('✓'), '输出 ✓');
  assert(calls.filter((c) => c.args[0] === '-').length === 1, 'crontab - 恰好一次');

  // 无 crontab → 幂等 exit 0
  const t2 = makeDepsByCmd({ platform: 'linux', handlers: { crontab: () => ({ status: 1, stdout: '', stderr: 'no crontab for zy' }) } });
  const r2 = runSchedule(['disable', '--task', 'EvoKit Learn'], t2.deps);
  assert(r2.code === 0 && r2.text.includes('ℹ'), `无 crontab → 幂等 exit 0（实际 ${r2.code}）`);

  // crontab 存在但无 EVOKIT 块 → 幂等 exit 0 且不写回
  const t3 = makeDepsByCmd({
    platform: 'linux',
    handlers: { crontab: (args) => (args[0] === '-l' ? { status: 0, stdout: '30 4 * * * user-job\n', stderr: '' } : { status: 0, stdout: '', stderr: '' }) },
  });
  const r3 = runSchedule(['disable', '--task', 'EvoKit Ghost'], t3.deps);
  assert(r3.code === 0 && r3.text.includes('ℹ'), `无托管块 → 幂等 exit 0（实际 ${r3.code}）`);
  assert(t3.calls.filter((c) => c.args[0] === '-').length === 0, '无块时不写回 crontab');
}

// ── 19. linux list：解析 crontab 托管块 ──────────────────────
console.log('\n【19. linux list】');
{
  const crontab = [
    '30 4 * * * user-job',
    '# EVOKIT:BEGIN EvoKit Learn',
    '0 2 * * * cd "/x" && "/node" "/e.mjs" learn --auto >> log 2>&1',
    '# EVOKIT:END EvoKit Learn',
    '# EVOKIT:BEGIN EvoKit Night',
    '30 3 * * * cd "/x" && "/node" "/e.mjs" learn --assist >> log 2>&1',
    '# EVOKIT:END EvoKit Night',
  ].join('\n') + '\n';
  const { deps } = makeDepsByCmd({ platform: 'linux', handlers: { crontab: () => ({ status: 0, stdout: crontab, stderr: '' }) } });
  const r = runSchedule(['list'], deps);
  assert(r.code === 0, `linux list exit 0（实际 ${r.code}）`, r.text.slice(0, 200));
  assert(r.text.includes('EvoKit Learn') && r.text.includes('EvoKit Night'), '表格含两个托管块任务名');
  assert(r.text.includes('learn --auto') && r.text.includes('learn --assist'), '计划动作含 learn --mode 段');
  const t2 = makeDepsByCmd({ platform: 'linux', handlers: { crontab: () => ({ status: 0, stdout: crontab, stderr: '' }) } });
  const r2 = runSchedule(['list', '--json'], t2.deps);
  let arr = null;
  try { arr = JSON.parse(r2.text.trim()); } catch { arr = null; }
  assert(Array.isArray(arr) && arr.length === 2, '--json 输出数组（长度 2）');
  assert(!!arr && arr[0].name === 'EvoKit Learn' && arr[0].state === 'scheduled' && arr[0].action === 'learn --auto'
    && arr[0].info.NextRunTime === '—' && arr[0].info.LastRunTime === '—' && arr[0].info.LastTaskResult === '—',
    'JSON 行形状同 win32（mac/linux 无的信息用 —）');

  // 读不到 crontab → 按空结果
  const t3 = makeDepsByCmd({ platform: 'linux', handlers: { crontab: () => ({ status: 1, stdout: '', stderr: 'no crontab for zy' }) } });
  const r3 = runSchedule(['list'], t3.deps);
  assert(r3.code === 0 && r3.text.includes('无正在运行的 EvoKit 定时任务'), '读不到 crontab → 无任务提示');
}

// ── 20. 跨平台不支持（freebsd）：enable/disable 均 ✗ exit 1 ──
console.log('\n【20. 跨平台不支持（freebsd）】');
{
  const t1 = makeDepsByCmd({ platform: 'freebsd' });
  const r1 = runSchedule(['enable'], t1.deps);
  assert(r1.code === 1 && r1.text.includes('当前平台暂不支持定时管理'), `freebsd enable → exit 1（实际 ${r1.code}）`);
  assert(t1.calls.length === 0, '不调用任何外部命令');
  const t2 = makeDepsByCmd({ platform: 'freebsd' });
  const r2 = runSchedule(['disable'], t2.deps);
  assert(r2.code === 1 && r2.text.includes('当前平台暂不支持定时管理'), `freebsd disable → exit 1（实际 ${r2.code}）`);
}

// ── 清理与汇总 ────────────────────────────────────────────
console.log('\n【清理测试目录】');
try { rmSync(tmpRoot, { recursive: true, force: true }); ok('临时目录已清理'); } catch (e) { fail('临时目录清理', e.message); }

console.log(`\n========== 测试结果：${passed} 通过 / ${failed} 失败 ==========`);

process.exit(failed > 0 ? 1 : 0);
