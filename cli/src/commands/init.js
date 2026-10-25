// init 命令：初始化全局源 / 项目级源

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GLOBAL_SOURCE } from '../paths.js';
import { DEFAULT_CONTEXT, DEFAULT_AGENTS, DEFAULT_RESOURCES } from '../defaults.js';
import { loadAgents, loadResources } from '../config.js';
import { ensureSource } from '../fs-utils.js';

export function initGlobal() {
  ensureSource(GLOBAL_SOURCE, DEFAULT_CONTEXT);
  loadAgents(); // 确保 agents.json 首次生成
  loadResources(); // 确保 resources.json 首次生成
}

export function initProject() {
  const cwd = resolve(process.cwd());
  const projDir = join(cwd, '.evokit');
  const projSource = join(projDir, 'context.md');
  const projContent = `# 项目规则（单一事实源）

> 本文件是唯一源（canonical）。改这里，然后运行 \`evokit sync --project\` 同步到该项目入口。

## 项目规则

<!-- 在此添加仅本项目生效的规则，例如：本项目使用 pnpm 而非 npm -->
`;
  ensureSource(projSource, projContent);

  // 生成项目级配置（按 id 覆盖全局；这里默认等于全局，可自行增删覆盖项）
  if (!existsSync(projDir)) mkdirSync(projDir, { recursive: true });
  const projAgents = join(projDir, 'agents.json');
  const projResources = join(projDir, 'resources.json');
  if (!existsSync(projAgents)) {
    writeFileSync(projAgents, JSON.stringify(DEFAULT_AGENTS, null, 2) + '\n', 'utf-8');
    console.log(`✓ 已创建 ${projAgents}`);
  } else {
    console.log(`ℹ ${projAgents} 已存在，跳过`);
  }
  if (!existsSync(projResources)) {
    writeFileSync(projResources, JSON.stringify(DEFAULT_RESOURCES, null, 2) + '\n', 'utf-8');
    console.log(`✓ 已创建 ${projResources}`);
  } else {
    console.log(`ℹ ${projResources} 已存在，跳过`);
  }
}
