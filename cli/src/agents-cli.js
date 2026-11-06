// agents cli 调用：探测可用 CLI + 非交互调用（供 inventory 委托 agent 整理）
// 调用配置从 settings.json 的 agents[].cli 读取，支持零代码增删改。

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadConfig } from './config.js';
import { expandPath } from './paths.js';
import { debug, textMeta } from './debug.js';

const IS_WIN = process.platform === 'win32';

/**
 * 兜底默认 CLI 定义（仅当 settings.json 里某个 agent 没有 cli 字段时使用）。
 * - bin: 命令名
 * - args: 参数模板，{prompt} 占位符
 */
const AGENT_CLIS_FALLBACK = {
  claude: { bin: 'claude', args: ['-p', '{prompt}'] },
  codex: { bin: 'codex', args: ['exec', '-'], input: 'stdin' },
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
    } else if (cli.bin === 'pi') {
      // pi 要求 --provider 必须配合 --model 使用
      if (!cli.model) {
        warnings.push(`pi 的 \`--provider\` 需要配合 \`--model\` 使用，请同时在 cli.model 指定模型（或改用 model: "provider/id" 形式）；本次已跳过 provider`);
      } else {
        extraArgs.push('--provider', cli.provider);
      }
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
  const startedAt = Date.now();
  if (!cliDef.available || !cli) {
    debug('agents-cli', 'end', { agent: cliDef.id, outcome: 'unavailable', durationMs: Date.now() - startedAt });
    return { ok: false, output: '', error: `未检测到 ${cliDef.name} 的 CLI 调用配置` };
  }
  // 构造参数：替换 {prompt} 占位符 + 追加 model/provider/outputFormat 参数
  const tpl = cli.args || AGENT_CLIS_FALLBACK[cliDef.id]?.args || [];
  const { extraArgs, warnings } = buildExtraArgs(cli);
  // codex/pi 官方非交互姿势都是从 stdin 读完整指令，避免长 prompt 走 argv 位置参数被当作消息片段或触发挂起。
  // 差异：codex 需要显式 `-` 占位符（`codex exec -`）；pi 只需 `--print`（无位置参数时自动读 stdin，不接受 `-`）。
  // 兼容旧配置 `['exec', '{prompt}']` / `['--print', '{prompt}']`：识别含 {prompt} 的占位符用法后统一改成 stdin 输入。
  const stdinMode = cli.input === 'stdin'
    || ((cli.bin === 'codex' || cli.bin === 'pi') && tpl.some((a) => typeof a === 'string' && a.includes('{prompt}')));
  const promptTpl = stdinMode
    ? tpl.filter((a) => typeof a !== 'string' || !a.includes('{prompt}'))
    : tpl;
  const args = promptTpl.map((a) => renderTemplate(a, { prompt }));
  if (stdinMode && cli.bin === 'codex' && !args.includes('-')) args.push('-');
  if (!stdinMode && !promptTpl.some((a) => typeof a === 'string' && a.includes('{prompt}'))) {
    args.push(prompt); // 无 {prompt} 占位符则兜底追加
  }
  const fullArgs = [...args, ...extraArgs];
  const effectiveTimeout = (cli.timeout ?? timeout ?? 120) * 1000;
  const { command, args: spawnArgs } = toSpawn(cliDef.binPath || cli.bin, fullArgs);
  const safeArgs = fullArgs.map((arg) => {
    if (typeof arg === 'string' && arg.includes(prompt)) return `<prompt chars=${prompt.length} bytes=${Buffer.byteLength(prompt, 'utf8')}>`;
    return typeof arg === 'string' && arg.startsWith('-') ? arg : `<arg chars=${arg.length}>`;
  });
  debug('agents-cli', 'start', {
    agent: cliDef.id,
    bin: cli.bin,
    binPath: cliDef.binPath,
    timeoutSeconds: effectiveTimeout / 1000,
    outputFormat: cli.outputFormat || 'text',
    command,
    args: safeArgs,
    stdin: stdinMode ? textMeta(prompt) : undefined,
  });
  try {
    const result = spawnSync(command, spawnArgs, {
      encoding: 'utf-8',
      timeout: effectiveTimeout,
      maxBuffer: 10 * 1024 * 1024,
      input: stdinMode ? prompt : undefined,
    });
    debug('agents-cli', 'end', {
      agent: cliDef.id,
      durationMs: Date.now() - startedAt,
      exitCode: result.status,
      signal: result.signal || null,
      errorCode: result.error?.code,
      stdout: textMeta(result.stdout),
      stderr: textMeta(result.stderr),
    });
    const durationMs = Date.now() - startedAt;
    if (result.error) {
      const code = result.error.code;
      if (code === 'ETIMEDOUT') {
        return { ok: false, output: '', error: `调用超时（EvoKit 等待超过 ${Math.round(effectiveTimeout / 1000)} 秒，进程未退出）`, warnings };
      }
      return { ok: false, output: '', error: `进程启动失败：${result.error.message || code}`, warnings };
    }
    if (result.signal) {
      return { ok: false, output: '', error: `进程被 ${result.signal} 终止（约 ${Math.round(durationMs / 1000)} 秒），可能是环境限制或超时`, warnings };
    }
    const out = (result.stdout || '').trim();
    if (!out) {
      const stderr = (result.stderr || '').trim();
      const exitNote = typeof result.status === 'number' ? `（进程退出码 ${result.status}，约 ${Math.round(durationMs / 1000)} 秒）` : '';
      const hint = stderr ? `（stderr: ${stderr}）` : '';
      // 底层 agent 自报超时（非 EvoKit 强制 kill）：补充诊断提示
      let timeoutHint = '';
      if (/timed?\s*out|timeout|超时/i.test(stderr)) {
        timeoutHint = `（诊断：底层 ${cli.bin} 自报超时，通常是其自身的模型/供应商配置或网络问题，而非 EvoKit 超时；可尝试在 settings.json 指定 cli.model 或 cli.provider，或直接改用 --prompt 手动喂给其他 agent）`;
      }
      return { ok: false, output: '', error: `无输出${exitNote}${hint}${timeoutHint}`, warnings };
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
    debug('agents-cli', 'end', {
      agent: cliDef.id,
      outcome: 'exception',
      durationMs: Date.now() - startedAt,
      errorName: e instanceof Error ? e.name : 'Error',
    });
    return { ok: false, output: '', error: `调用异常：${e.message}`, warnings };
  }
}
