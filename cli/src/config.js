// 配置读写（agents.json / resources.json）与过滤器解析

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS_FILE, RESOURCES_FILE, EVOKIT_DIR } from './paths.js';
import { DEFAULT_AGENTS, DEFAULT_RESOURCES } from './defaults.js';

/** 读取 JSON 配置文件；不存在则用默认值生成一份（仅对全局配置自动生成） */
function loadJson(file, defaults, label) {
  if (!existsSync(file)) {
    if (!existsSync(EVOKIT_DIR)) mkdirSync(EVOKIT_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(defaults, null, 2) + '\n', 'utf-8');
  }
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch (e) {
    console.error(`✗ ${label} 解析失败：${e.message}`);
    process.exit(1);
  }
}

/**
 * 按 id 逐项合并：以 base 为基础，用 override 里的同名 id 条目覆盖。
 * override 中 id 不存在的条目会追加；base 里有而 override 没有的条目保留。
 */
function mergeById(base, override) {
  if (!Array.isArray(override) || override.length === 0) return base;
  const map = new Map(base.map((item) => [item.id, item]));
  for (const item of override) {
    map.set(item.id, item);
  }
  return [...map.values()];
}

/**
 * 读取 agents.json（支持项目级覆盖全局）。
 * @param {string} projectDir 项目目录；传入则读 <projectDir>/.evokit/agents.json 覆盖全局同名 id
 */
export function loadAgents(projectDir) {
  const global = loadJson(AGENTS_FILE, DEFAULT_AGENTS, 'agents.json');
  if (!projectDir) return global;
  const projFile = join(projectDir, '.evokit', 'agents.json');
  if (!existsSync(projFile)) return global;
  const proj = JSON.parse(readFileSync(projFile, 'utf-8'));
  return mergeById(global, proj);
}

/**
 * 读取 resources.json（支持项目级覆盖全局）。
 * @param {string} projectDir 项目目录；传入则读 <projectDir>/.evokit/resources.json 覆盖全局同名 id
 */
export function loadResources(projectDir) {
  const global = loadJson(RESOURCES_FILE, DEFAULT_RESOURCES, 'resources.json');
  if (!projectDir) return global;
  const projFile = join(projectDir, '.evokit', 'resources.json');
  if (!existsSync(projFile)) return global;
  const proj = JSON.parse(readFileSync(projFile, 'utf-8'));
  return mergeById(global, proj);
}

/** 解析 --<flag> 参数（含短别名），返回逗号分隔的 id 集合；未指定返回 null（=全部） */
function parseFilter(args, flag, shortFlag, example) {
  // 优先匹配长选项，其次短别名
  let idx = args.indexOf(flag);
  let usedFlag = flag;
  if (idx === -1 && shortFlag) {
    idx = args.indexOf(shortFlag);
    usedFlag = shortFlag;
  }
  if (idx === -1) return null;
  const val = args[idx + 1];
  if (!val) {
    console.error(`✗ ${usedFlag} 需要一个值，例如 ${example}`);
    process.exit(1);
  }
  return new Set(val.split(',').map((s) => s.trim()).filter(Boolean));
}

/** 解析 --agent 参数（短别名 -a） */
export function parseAgentFilter(args) {
  return parseFilter(args, '--agent', '-a', '--agent claude 或 --agent claude,codex');
}

/** 解析 --resource 参数（短别名 -r） */
export function parseResourceFilter(args) {
  return parseFilter(args, '--resource', '-r', '--resource context 或 --resource context,my-skill');
}

/** 编辑距离（Levenshtein），用于猜测用户是否打错 id */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[m][n];
}

/** 在候选中找编辑距离 ≤ 2 的最近项 */
function suggestId(input, candidates) {
  let best = null, bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(input, c);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return bestDist <= 2 ? best : null;
}

/** 按过滤器筛出要操作的 agents */
export function filterAgents(all, filter) {
  if (filter === null) return all;
  const out = all.filter((a) => filter.has(a.id));
  if (out.length === 0) {
    const ids = all.map((a) => a.id);
    const input = [...filter].join(', ');
    console.error(`✗ 未匹配到任何 agent：「${input}」`);
    const guess = suggestId([...filter][0], ids);
    if (guess) console.error(`  你是不是想用 \`--agent ${guess}\`？`);
    console.error(`  可用 agent：${ids.join(', ')}`);
    process.exit(1);
  }
  return out;
}

/** 按过滤器筛出要操作的资源 */
export function filterResources(all, filter) {
  if (filter === null) return all;
  const out = all.filter((r) => filter.has(r.id));
  if (out.length === 0) {
    const ids = all.map((r) => r.id);
    const input = [...filter].join(', ');
    console.error(`✗ 未匹配到任何资源：「${input}」`);
    const guess = suggestId([...filter][0], ids);
    if (guess) console.error(`  你是不是想用 \`--resource ${guess}\`？`);
    console.error(`  可用资源：${ids.join(', ')}`);
    process.exit(1);
  }
  return out;
}
