// status 命令：查看各 agent 入口的同步状态

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GLOBAL_SOURCE, BEGIN, END, expandPath } from '../paths.js';
import { loadAgents, filterAgents } from '../config.js';
import { readSource } from '../fs-utils.js';

/** 通用状态展示：列出各入口的同步状态 */
function showStatus(source, sourceLabel, entries) {
  console.log(`源：${source} ${existsSync(source) ? '' : '（不存在，先 init）'}\n`);
  console.log('入口文件：');
  for (const { name, file } of entries) {
    if (!existsSync(file)) {
      console.log(`  ✗ ${name}  ${file}  — 未托管`);
      continue;
    }
    const content = readFileSync(file, 'utf-8');
    if (!content.includes(BEGIN) || !content.includes(END)) {
      console.log(`  ✗ ${name}  ${file}  — 未托管（无 evokit 块）`);
      continue;
    }
    const start = content.indexOf(BEGIN) + BEGIN.length;
    const end = content.indexOf(END);
    const managed = content.slice(start, end).trim();
    const hasUserContent = content.slice(0, content.indexOf(BEGIN)).trim() !== '' ||
      content.slice(end + END.length).trim() !== '';
    const consistent = existsSync(source) && managed === readSource(source);
    const mark = consistent ? '✓ 一致' : '⚠ 不一致（需 sync）';
    const user = hasUserContent ? '（块外有用户内容）' : '';
    console.log(`  ✓ ${name}  ${file}  — ${mark}${user}`);
  }
}

export function status(filter, isProject = false) {
  console.log('EvoKit 同步状态\n');
  if (isProject) {
    const cwd = resolve(process.cwd());
    const projSource = join(cwd, '.evokit', 'context.md');
    const agents = filterAgents(loadAgents(cwd), filter).filter((a) => a.project);
    const entries = agents.map((a) => ({ name: `${a.name} (项目)`, file: join(cwd, a.project) }));
    showStatus(projSource, projSource, entries);
    console.log('\n（项目级：仅显示支持 project 字段的 agent）');
    return;
  }
  const agents = filterAgents(loadAgents(), filter);
  const entries = agents.map((a) => ({ name: `${a.name} (${a.id})`, file: expandPath(a.global) }));
  showStatus(GLOBAL_SOURCE, GLOBAL_SOURCE, entries);
}
