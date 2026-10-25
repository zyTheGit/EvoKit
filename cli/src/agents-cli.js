// agents cli 调用：探测可用 CLI + 非交互调用（供 inventory 委托 agent 整理）

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const IS_WIN = process.platform === 'win32';

/**
 * 支持的 agent CLI 定义。
 * - bin: 命令名
 * - build: 非交互调用时的参数构造（prompt -> args 数组）
 */
const AGENT_CLIS = [
  {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    build: (prompt) => ['-p', prompt],
  },
  {
    id: 'codex',
    name: 'Codex',
    bin: 'codex',
    build: (prompt) => ['exec', prompt],
  },
  {
    id: 'pi',
    name: 'Pi',
    bin: 'pi',
    build: (prompt) => ['--print', prompt],
  },
];

/** 找 fnm 管理的某个全局命令的绝对路径（codex/pi 装在 node 24 下） */
function findInFnm(bin) {
  const home = homedir();
  const roots = [
    join(home, 'AppData', 'Roaming', 'fnm', 'node-versions'), // Windows
    join(home, 'Library', 'Application Support', 'fnm', 'node-versions'), // macOS
    join(home, '.local', 'share', 'fnm', 'node-versions'), // Linux XDG
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    try {
      for (const ver of readdirSync(root)) {
        const instDir = join(root, ver, 'installation');
        if (!existsSync(instDir)) continue;
        const candidate = join(instDir, bin + (IS_WIN ? '.cmd' : ''));
        if (existsSync(candidate)) return candidate;
      }
    } catch {
      /* 忽略 */
    }
  }
  return null;
}

/**
 * 把「可执行目标 + 参数」转换成 spawnSync 需要的 (command, args)。
 * Windows 上 .cmd 文件必须用 cmd.exe /c 包装；直接 exe/命令用数组参数。
 */
function toSpawn(binPath, args) {
  if (IS_WIN && binPath.toLowerCase().endsWith('.cmd')) {
    return { command: 'cmd.exe', args: ['/c', binPath, ...args] };
  }
  return { command: binPath, args };
}

/** 探测某 agent CLI 是否可用（能跑 --version） */
function probe(cliDef) {
  const binPath = findInFnm(cliDef.bin) || cliDef.bin;
  const { command, args } = toSpawn(binPath, ['--version']);
  try {
    const r = spawnSync(command, args, { encoding: 'utf-8', timeout: 15000, stdio: 'ignore' });
    return { binPath, available: r.error === undefined };
  } catch {
    return { binPath, available: false };
  }
}

/** 探测所有 agent CLI 的可用性，返回 { id, name, bin, binPath, available }[] */
export function detectAgentClis() {
  return AGENT_CLIS.map((c) => {
    const { binPath, available } = probe(c);
    return { ...c, binPath, available };
  });
}

/**
 * 调用某个 agent CLI，非交互地把 prompt 喂进去，返回 stdout 字符串。
 * 若不可用或失败，返回 null（由调用方提示跳过）。
 */
export function runAgentCli(cliDef, prompt, { timeout = 120000 } = {}) {
  if (!cliDef.available) return null;
  const args = cliDef.build(prompt);
  const { command, args: spawnArgs } = toSpawn(cliDef.binPath, args);
  try {
    const result = spawnSync(command, spawnArgs, {
      encoding: 'utf-8',
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.error) return null;
    const out = (result.stdout || '').trim();
    return out || null;
  } catch {
    return null;
  }
}
