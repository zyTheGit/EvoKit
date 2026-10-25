// uninstall 命令：移除托管块，恢复入口文件（保留块外用户内容）

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BEGIN, END, expandPath } from '../paths.js';
import { loadAgents, filterAgents } from '../config.js';

/** 移除单个文件的托管块；返回 'deleted' | 'cleaned' | 'skip' */
function removeManagedBlock(file, label) {
  if (!existsSync(file)) {
    console.log(`  跳过 ${label}（文件不存在）`);
    return 'skip';
  }
  const content = readFileSync(file, 'utf-8');
  if (!content.includes(BEGIN) || !content.includes(END)) {
    console.log(`  跳过 ${label}（无托管块）`);
    return 'skip';
  }
  const start = content.indexOf(BEGIN);
  const end = content.indexOf(END) + END.length;
  const before = content.slice(0, start);
  const after = content.slice(end);
  const restored = (before + after).trim();
  if (restored === '') {
    unlinkSync(file);
    console.log(`  ✓ 已删除 ${label}（原文件仅含托管块）→ ${file}`);
    return 'deleted';
  }
  writeFileSync(file, restored + '\n', 'utf-8');
  console.log(`  ✓ 已清理 ${label}（保留用户内容）→ ${file}`);
  return 'cleaned';
}

export function uninstallGlobal(filter) {
  console.log('卸载 EvoKit（移除托管块，保留块外用户内容）\n');
  const agents = filterAgents(loadAgents(), filter);
  for (const a of agents) {
    removeManagedBlock(expandPath(a.global), a.name);
  }
  console.log('\n完成。托管块已移除，块外用户内容原样保留。');
}

export function uninstallProject(filter) {
  const cwd = resolve(process.cwd());
  console.log('卸载 EvoKit 项目级托管（移除项目入口的托管块，保留块外用户内容）\n');
  const agents = filterAgents(loadAgents(cwd), filter).filter((a) => a.project);
  for (const a of agents) {
    removeManagedBlock(join(cwd, a.project), `${a.name} (项目)`);
  }
  console.log('\n完成。项目级源 .evokit/context.md 保持不变（如需一并删除请手动移除）。');
}
