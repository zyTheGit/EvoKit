// sync 命令：把源同步到各 agent 入口（全局 / 项目级 / 资源）

import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { GLOBAL_SOURCE, CONFIG_FILE, expandPath } from '../paths.js';
import { loadAgents, loadResources, filterAgents, filterResources } from '../config.js';
import { readSource, applyManagedBlock } from '../fs-utils.js';
import { SYNCERS, resolveSyncer } from '../syncers.js';

export function syncGlobal(filter) {
  if (!existsSync(GLOBAL_SOURCE)) {
    console.log(`✗ 未找到全局源：${GLOBAL_SOURCE}`);
    console.log('  请先运行 evokit init 创建。');
    process.exitCode = 1;
    return;
  }
  const source = readSource(GLOBAL_SOURCE);
  const agents = filterAgents(loadAgents(), filter);
  for (const a of agents) {
    const file = expandPath(a.global);
    const dir = dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // 只更新托管块，保留块外用户内容（绝不整文件覆盖）
    applyManagedBlock(file, source);
    console.log(`✓ 已同步 ${a.name} (${a.id})  → ${file}`);
  }
  console.log(`\n完成。全局源：${GLOBAL_SOURCE}`);
}

export function syncProject(filter) {
  const cwd = resolve(process.cwd());
  const projSource = join(cwd, '.evokit', 'context.md');
  if (!existsSync(projSource)) {
    console.log(`✗ 未找到项目级源：${projSource}`);
    console.log('  请先运行 evokit init --project 创建。');
    process.exitCode = 1;
    return;
  }
  const source = readSource(projSource);
  const agents = filterAgents(loadAgents(cwd), filter).filter((a) => a.project);
  for (const a of agents) {
    const file = join(cwd, a.project);
    const dir = dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // 只更新托管块，保留块外用户内容（绝不整文件覆盖）
    applyManagedBlock(file, source);
    console.log(`✓ 已同步 ${a.name} (项目)  → ${file}`);
  }
  console.log(`\n完成。项目源：${projSource}`);
}

export async function syncResources(filter) {
  const resources = filterResources(loadResources(), filter);
  for (const r of resources) {
    const syncFn = resolveSyncer(r);
    if (!syncFn) {
      console.error(`✗ 资源 ${r.id} 的 type 不支持：${r.type}（支持：${Object.keys(SYNCERS).join(', ')}）`);
      process.exit(1);
    }
    for (const target of r.targets) {
      try {
        const file = await syncFn(r.source, target, r.proxy);
        console.log(`✓ 已同步 ${r.id} (${r.type || 'remote'})  → ${file}`);
      } catch (e) {
        console.error(`✗ 同步 ${r.id} → ${target} 失败：${e.message}`);
        process.exitCode = 1;
      }
    }
  }
  console.log(`\n完成。资源定义：${CONFIG_FILE}`);
}
