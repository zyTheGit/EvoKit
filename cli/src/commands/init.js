// init 命令：初始化全局源 / 项目级源

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GLOBAL_SOURCE, CONFIG_FILE } from '../paths.js';
import { DEFAULT_CONTEXT, DEFAULT_CONFIG } from '../defaults.js';
import { loadConfig } from '../config.js';
import { ensureSource } from '../fs-utils.js';

export function initGlobal() {
  ensureSource(GLOBAL_SOURCE, DEFAULT_CONTEXT);
  loadConfig(); // 确保 settings.json 首次生成
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

  // 生成项目级配置（按 id/key 覆盖全局；这里默认等于全局，可自行增删覆盖项）
  if (!existsSync(projDir)) mkdirSync(projDir, { recursive: true });
  const projConfig = join(projDir, 'settings.json');
  if (!existsSync(projConfig)) {
    writeFileSync(projConfig, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf-8');
    console.log(`✓ 已创建 ${projConfig}`);
  } else {
    console.log(`ℹ ${projConfig} 已存在，跳过`);
  }
}
