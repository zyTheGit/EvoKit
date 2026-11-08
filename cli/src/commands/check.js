// check 命令：一致性检查 + ctxlint 内容健康检查（辅助）

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { HOME, GLOBAL_SOURCE, BEGIN, END, expandPath } from '../paths.js';
import { loadAgents, filterAgents } from '../config.js';
import { readSource } from '../fs-utils.js';
import { collectPartsForTarget, joinParts } from '../entry-content.js';

/** 通用一致性检查：对比源内容与各入口托管块是否一致 */
function checkEntries(source, sourceLabel, entries, isProject = false, expectedFn = null) {
  let allOk = true;
  let missingCount = 0;
  for (const { name, file } of entries) {
    if (!existsSync(file)) {
      console.log(`✗ ${name}：入口文件不存在`);
      missingCount++;
      allOk = false;
      continue;
    }
    const content = readFileSync(file, 'utf-8');
    if (!content.includes(BEGIN) || !content.includes(END)) {
      console.log(`✗ ${name}：未托管`);
      allOk = false;
      continue;
    }
    const start = content.indexOf(BEGIN) + BEGIN.length;
    const end = content.indexOf(END);
    const managed = content.slice(start, end).trim();
    // v3：期望块 = 指向该入口的全部 text 资源合并内容（context + knowledge-index）
    const expected = expectedFn ? expectedFn(file) : source;
    if (managed === expected) {
      console.log(`✓ ${name}：一致`);
    } else {
      console.log(`✗ ${name}：不一致（需 sync）`);
      allOk = false;
    }
  }
  // 意图猜测：所有入口都不存在，说明还没同步过
  if (missingCount > 0 && missingCount === entries.length) {
    console.log('\n  提示：所有入口都不存在，可能还没有同步过。');
    if (isProject) {
      console.log('  请先运行：evokit init --project  然后  evokit sync --project');
    } else {
      console.log('  请先运行：evokit init  然后  evokit sync');
    }
  } else if (missingCount > 0) {
    console.log(`\n  提示：有 ${missingCount} 个入口尚未同步，运行 evokit sync${isProject ? ' --project' : ''} 补齐。`);
  }
  return allOk;
}

function checkGlobal(filter) {
  if (!existsSync(GLOBAL_SOURCE)) {
    console.log(`✗ 未找到全局源：${GLOBAL_SOURCE}`);
    console.log('  请先运行 evokit init 创建。');
    return false;
  }
  const source = readSource(GLOBAL_SOURCE);
  const agents = filterAgents(loadAgents(), filter);
  const entries = agents.map((a) => ({ name: a.name, file: expandPath(a.global) }));
  // v3：同文件多 text 资源合并进同一托管块，一致性按合并后期望值判定
  const expectedFn = (file) => joinParts(collectPartsForTarget(file).present).trim();
  return checkEntries(source, GLOBAL_SOURCE, entries, false, expectedFn);
}

function checkProject(filter) {
  const cwd = resolve(process.cwd());
  const projSource = join(cwd, '.evokit', 'context.md');
  if (!existsSync(projSource)) {
    console.log(`✗ 未找到项目级源：${projSource}`);
    console.log('  请先运行 evokit init --project 创建。');
    return false;
  }
  const source = readSource(projSource);
  const agents = filterAgents(loadAgents(cwd), filter).filter((a) => a.project);
  const entries = agents.map((a) => ({ name: `${a.name} (项目)`, file: join(cwd, a.project) }));
  return checkEntries(source, projSource, entries, true);
}

/**
 * 定位 npm-cli.js，返回 { nodeExe, npmCli } 或 null。
 * 优先用「node + npm-cli.js exec」直接驱动 npm，规避 Windows 上 npx.cmd 的
 * npm-prefix 解析 bug（npx.cmd 会基于 cwd 向上找 node_modules，导致
 * Cannot find module .../npm-prefix.js 报错栈泄漏）。
 */
function findNpmCommand() {
  const nodeExe = process.execPath; // 当前 node 可执行文件
  // 与 node 同级的 node_modules/npm/bin/npm-cli.js（官方 Node 发行版标准布局）
  const candidate = join(dirname(nodeExe), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existsSync(candidate)) {
    return { nodeExe, npmCli: candidate };
  }
  return null;
}

function runCtxlint() {
  console.log('\n—— ctxlint 内容健康检查（辅助，不阻塞） ——');
  const dir = join(HOME, '.claude');
  if (!existsSync(dir)) {
    console.log('（无 .claude 目录，跳过）');
    return;
  }
  let stdout = '';
  let stderr = '';
  try {
    // 优先用 node + npm-cli.js exec 直接驱动，规避 npx.cmd 的 npm-prefix 解析 bug
    const cmd = findNpmCommand();
    let command;
    if (cmd) {
      command = `"${cmd.nodeExe}" "${cmd.npmCli}" exec --yes @ctxlint/ctxlint check "${dir}" --severity warn`;
    } else {
      const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      command = `"${npx}" --yes @ctxlint/ctxlint check "${dir}" --severity warn`;
    }
    // stdio 必须 'pipe' 捕获子进程全部输出，任何环境异常都不让原始栈泄漏到终端
    const out = execSync(command, {
      stdio: 'pipe',
      env: { ...process.env, NO_UPDATE_NOTIFIER: '1', FORCE_COLOR: '0' },
    });
    stdout = out.toString();
  } catch (e) {
    stdout = (e.stdout || '').toString();
    stderr = (e.stderr || '').toString();
  }

  // 区分两种情况：
  //   ① npm/模块加载失败（Cannot find module 等）→ 环境问题，只给一行友好提示，绝不打印原始栈
  //   ② ctxlint 正常运行（无论退出码）→ 正常展示其业务输出
  const hasModuleError = /Cannot find module|npm-cli|npm-prefix|MODULE_NOT_FOUND|npm error|ERR_INVALID/i.test(stderr);

  if (hasModuleError) {
    console.log('（ctxlint 因 npm 环境问题未运行，已跳过。这是可选的辅助检查，不影响同步结果。）');
    console.log('  如需启用，请确认 npm/npx 可用：npx --version');
  } else if (stdout.trim()) {
    // ctxlint 正常输出了检查结果（可能含 warning、非 0 退出）
    console.log(stdout.trimEnd());
    console.log('（ctxlint 检查完成，上述 warning 仅作参考。）');
  } else {
    console.log('（ctxlint 未安装或不可用，已跳过。可手动运行 `npx @ctxlint/ctxlint --help` 检查）');
    console.log('  提示：内容健康检查是辅助功能，不影响同步结果。');
  }
}

export function check(filter, isProject = false) {
  const ok = isProject ? checkProject(filter) : checkGlobal(filter);
  if (!isProject && filter === null) runCtxlint();
  process.exitCode = ok ? 0 : 1;
}
