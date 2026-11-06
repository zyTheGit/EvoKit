// sync 命令：把源同步到各 agent 入口（全局 / 项目级 / 资源）
//
// v3 记忆引擎（T-M3.1）：同一入口文件可能被多个 text 资源指向（context + knowledge-index）。
// 托管块保持「一文件一块」不变量（uninstall/check/status 均按单块解析），因此同步时把
// 指向同一文件的全部 text 资源内容合并进同一托管块，后同步者不再覆盖先同步者。
// 缺失源按可恢复性降级：知识根下（可由 git/卡片重建）提示后跳过；其余（如 context.md
// 用户唯一手写源）缺失时拒绝部分写入，避免清掉托管块里现存的该资源内容。
// 详见 cli/src/entry-content.js。

import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { GLOBAL_SOURCE, CONFIG_FILE, expandPath } from '../paths.js';
import { loadAgents, loadResources, filterAgents, filterResources } from '../config.js';
import { readSource, applyManagedBlock } from '../fs-utils.js';
import { SYNCERS, resolveSyncer } from '../syncers.js';
import { isTextResource, collectPartsForTarget, joinParts } from '../entry-content.js';

const hintedMissing = new Set();

/** 知识根资源（knowledge-index）缺失的统一提示（每次运行最多提示一次） */
function hintMissing(id) {
  if (id !== 'knowledge-index' || hintedMissing.has(id)) return;
  console.log('ℹ knowledge-index 未初始化（运行 evokit knowledge init），本次未并入索引');
  hintedMissing.add(id);
}

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
    // 指向同一入口的其他 text 资源（如 knowledge-index）并入同一托管块
    const { present, missing } = collectPartsForTarget(file);
    const parts = [source, ...present.filter((p) => p.id !== 'context').map((p) => p.content)];
    for (const m of missing) hintMissing(m.id);
    // 只更新托管块，保留块外用户内容（绝不整文件覆盖）
    applyManagedBlock(file, parts.join('\n\n'));
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
    // 项目级入口不参与 resources 合并（resources 只定义全局目标），维持单源写入
    applyManagedBlock(file, source);
    console.log(`✓ 已同步 ${a.name} (项目)  → ${file}`);
  }
  console.log(`\n完成。项目源：${projSource}`);
}

export async function syncResources(filter) {
  const resources = filterResources(loadResources(), filter);
  for (const r of resources) {
    if (r.enabled === false) {
      console.log(`ℹ 资源 ${r.id} 已禁用（enabled: false），跳过`);
      continue;
    }
    const syncFn = resolveSyncer(r);
    if (!syncFn) {
      console.error(`✗ 资源 ${r.id} 的 type 不支持：${r.type}（支持：${Object.keys(SYNCERS).join(', ')}）`);
      process.exit(1);
    }
    if (isTextResource(r)) {
      const srcFile = expandPath(r.source);
      if (!existsSync(srcFile)) {
        if (r.id === 'knowledge-index') {
          // 知识根未初始化 → 跳过并提示，不报错（exit 0）
          console.log('ℹ knowledge-index 未初始化（运行 evokit knowledge init），跳过');
          hintedMissing.add('knowledge-index');
          continue;
        }
        // 其余 text 资源源缺失：维持原行为（readSource 抛 ENOENT → ✗）
        for (const target of r.targets || []) {
          try {
            await syncFn(r.source, target, r.proxy);
            console.log(`✓ 已同步 ${r.id} (${r.type || 'text'})  → ${target}`);
          } catch (e) {
            console.error(`✗ 同步 ${r.id} → ${target} 失败：${e.message}`);
            process.exitCode = 1;
          }
        }
        continue;
      }
      for (const target of r.targets || []) {
        const file = expandPath(target);
        const { present, missing } = collectPartsForTarget(target);
        const critical = missing.filter((m) => !m.recoverable);
        if (critical.length > 0 && present.length > 0) {
          // 不可恢复资源（如 context.md）缺失：拒绝部分写入，保护托管块现存的该资源内容
          console.error(`✗ 同步 ${r.id} → ${target} 失败：同块资源源缺失（${critical.map((m) => m.id).join(', ')}），拒绝部分写入以保护托管块内容`);
          process.exitCode = 1;
          continue;
        }
        if (present.length === 0) {
          console.error(`✗ 同步 ${r.id} → ${target} 失败：源缺失（${missing.map((m) => m.id).join(', ') || r.id}）`);
          process.exitCode = 1;
          continue;
        }
        for (const m of missing) hintMissing(m.id);
        // 合并写入：一文件一块，全部指向该文件的 text 资源内容共存
        applyManagedBlock(file, joinParts(present));
        console.log(`✓ 已同步 ${r.id} (${r.type || 'text'})  → ${file}`);
      }
      continue;
    }
    // symlink / remote：维持原逻辑
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
