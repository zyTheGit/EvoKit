// agents cli 调用：探测可用 CLI + 非交互调用（供 inventory 委托 agent 整理）
// 调用配置从 settings.json 的 agents[].cli 读取，支持零代码增删改。

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadConfig } from './config.js';
import { expandPath } from './paths.js';

const IS_WIN = process.platform === 'win32';

/**
 * 兜底默认 CLI 定义（仅当 settings.json 里某个 agent 没有 cli 字段时使用）。
 * - bin: 命令名
 * - args: 参数模板，{prompt} 占位符
 */
const AGENT_CLIS_FALLBACK = {
  claude: { bin: 'claude', args: ['-p', '{prompt}'] },
  codex: { bin: 'codex', args: ['exec', '{prompt}'] },
  pi: { bin: 'pi', args: ['--print', '{prompt}'] },
};

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
function probe(bin, binPath) {
  const effective = binPath || bin;
  const { command, args } = toSpawn(effective, ['--version']);
  try {
    const r = spawnSync(command, args, { encoding: 'utf-8', timeout: 15000, stdio: 'ignore' });
    return { binPath: effective, available: r.error === undefined };
  } catch {
    return { binPath: effective, available: false };
  }
}

/**
 * 探测所有 agent CLI 的可用性，返回 { id, name, bin, binPath, cli, available }[]。
 * 从 settings.json 的 agents[].cli 读取调用配置；无 cli 字段的 agent 标记 available=false。
 */
export function detectAgentClis() {
  const { agents } = loadConfig();
  return agents.map((a) => {
    const cli = a.cli || AGENT_CLIS_FALLBACK[a.id];
    if (!cli) {
      // 无 cli 字段且无兜底默认：不参与 CLI 调用
      return { id: a.id, name: a.name, bin: null, binPath: null, cli: null, available: false };
    }
    const bin = cli.bin;
    const binPath = cli.binPath ? expandPath(cli.binPath) : (findInFnm(bin) || bin);
    const { available } = probe(bin, binPath);
    return { id: a.id, name: a.name, bin, binPath, cli, available };
  });
}

/** 替换模板里的 {name} 占位符；未提供的 key 保留原文 */
function renderTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
}

/**
 * 根据 cli 配置构造「模型/供应商/输出格式」参数，追加到 args 之后。
 * - model → 三家都映射为 --model <model>
 * - provider → codex 映射 --model-provider；claude/pi 不支持，返回告警
 * - outputFormat 'json' → claude --output-format json / codex --json / pi --mode json
 * 返回 { extraArgs, warnings }
 */
function buildExtraArgs(cli) {
  const extraArgs = [];
  const warnings = [];
  if (cli.model) {
    extraArgs.push('--model', cli.model);
  }
  if (cli.provider) {
    if (cli.bin === 'codex') {
      extraArgs.push('--model-provider', cli.provider);
    } else {
      warnings.push(`「${cli.bin}」不支持通过 CLI 指定供应商（provider 已忽略，由登录态/配置决定）`);
    }
  }
  if (cli.outputFormat === 'json') {
    if (cli.bin === 'claude') extraArgs.push('--output-format', 'json');
    else if (cli.bin === 'codex') extraArgs.push('--json');
    else if (cli.bin === 'pi') extraArgs.push('--mode', 'json');
  }
  return { extraArgs, warnings };
}

/** 解析 claude --output-format json 的单个 JSON 结果，返回 meta 或 null */
function parseClaudeJson(stdout) {
  try {
    const obj = JSON.parse(stdout.trim());
    return {
      text: typeof obj.result === 'string' ? obj.result : stdout.trim(),
      costUsd: typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : undefined,
      tokens: obj.usage
        ? { input: obj.usage.input_tokens, output: obj.usage.output_tokens }
        : undefined,
    };
  } catch {
    return null;
  }
}

/** 按 outputFormat 解析结构化结果，返回 meta 或 null（非 json 或解析失败） */
function parseStructured(cli, stdout) {
  if (cli.outputFormat !== 'json') return null;
  if (cli.bin === 'claude') return parseClaudeJson(stdout);
  // codex(--json)/pi(--mode json) 的 JSONL 事件流解析暂未实现，标注待实测
  return null;
}

/**
 * 调用某个 agent CLI，非交互地把 prompt 喂进去。
 * 返回 { ok, output, error, meta, warnings }：
 *   ok=true   → output 是报告正文（text 格式为 stdout；json 格式为解析出的 meta.text）
 *   ok=false  → error 是可读的失败原因
 *   meta      → 仅 json 格式且解析成功时存在（text/costUsd/tokens）
 *   warnings  → provider 忽略等非阻塞告警
 */
export function runAgentCli(cliDef, prompt, { timeout } = {}) {
  const cli = cliDef.cli;
  if (!cliDef.available || !cli) {
    return { ok: false, output: '', error: `未检测到 ${cliDef.name} 的 CLI 调用配置` };
  }
  // 构造参数：替换 {prompt} 占位符 + 追加 model/provider/outputFormat 参数
  const tpl = cli.args || AGENT_CLIS_FALLBACK[cliDef.id]?.args || [];
  const { extraArgs, warnings } = buildExtraArgs(cli);
  const args = tpl.map((a) => renderTemplate(a, { prompt }));
  if (!tpl.some((a) => typeof a === 'string' && a.includes('{prompt}'))) {
    args.push(prompt); // 无 {prompt} 占位符则兜底追加
  }
  const fullArgs = [...args, ...extraArgs];
  const effectiveTimeout = (cli.timeout ?? timeout ?? 120) * 1000;
  const { command, args: spawnArgs } = toSpawn(cliDef.binPath || cli.bin, fullArgs);
  try {
    const result = spawnSync(command, spawnArgs, {
      encoding: 'utf-8',
      timeout: effectiveTimeout,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.error) {
      const code = result.error.code;
      if (code === 'ETIMEDOUT') {
        return { ok: false, output: '', error: `调用超时（超过 ${Math.round(effectiveTimeout / 1000)} 秒）`, warnings };
      }
      return { ok: false, output: '', error: `进程启动失败：${result.error.message || code}`, warnings };
    }
    if (result.signal) {
      return { ok: false, output: '', error: `进程被终止（signal ${result.signal}），可能是环境限制或鉴权问题`, warnings };
    }
    const out = (result.stdout || '').trim();
    if (!out) {
      const stderr = (result.stderr || '').trim();
      const hint = stderr ? `（stderr: ${stderr.slice(0, 120)}）` : '';
      return { ok: false, output: '', error: `无输出${hint}`, warnings };
    }
    const meta = parseStructured(cli, out);
    return {
      ok: true,
      output: meta ? meta.text : out,
      error: '',
      meta: meta || undefined,
      warnings,
    };
  } catch (e) {
    return { ok: false, output: '', error: `调用异常：${e.message}`, warnings };
  }
}
