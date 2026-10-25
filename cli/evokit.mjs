#!/usr/bin/env node
/**
 * EvoKit CLI — 个人多工具偏好同步工具（零依赖）
 *
 * 单一事实源：
 *   - 个人全局：~/.evokit/context.md          → 全局入口（所有项目生效）
 *   - 项目级：  <project>/.evokit/context.md   → 该项目入口（仅该项目生效）
 *
 * 同步目标：
 *   - Claude Code : 全局 ~/.claude/CLAUDE.md ｜ 项目 <project>/CLAUDE.md
 *   - Pi          : 全局 ~/.pi/agent/APPEND_SYSTEM.md ｜ 项目 <project>/.pi/APPEND_SYSTEM.md
 *   - Codex       : 全局 ~/.codex/AGENTS.md ｜ 项目 <project>/AGENTS.md
 *
 * 用法：
 *   evokit sync              同步个人全局规则到所有全局入口
 *   evokit sync --project    同步当前项目规则到该项目入口
 *   evokit check             检查全局一致性 + 调 ctxlint 做内容健康检查
 *   evokit init              初始化 ~/.evokit/context.md（若不存在）
 *   evokit init --project    初始化当前项目 .evokit/context.md（若不存在）
 *   evokit --help            帮助
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const HOME = homedir();
const EVOKIT_DIR = join(HOME, '.evokit');
const GLOBAL_SOURCE = join(EVOKIT_DIR, 'context.md');

// 全局入口（个人规则，跨项目生效）
const GLOBAL_TARGETS = [
  { name: 'Claude Code', file: join(HOME, '.claude', 'CLAUDE.md') },
  { name: 'Pi', file: join(HOME, '.pi', 'agent', 'APPEND_SYSTEM.md') },
  { name: 'Codex', file: join(HOME, '.codex', 'AGENTS.md') },
];

// 项目入口（项目规则，仅该项目生效）
const PROJECT_TARGETS = [
  { name: 'Claude Code (项目)', file: 'CLAUDE.md' },
  { name: 'Codex (项目)', file: 'AGENTS.md' },
];

const BEGIN = '<!-- evokit-managed:start -->';
const END = '<!-- evokit-managed:end -->';

const DEFAULT_CONTEXT = `# 全局偏好（单一事实源）

> 本文件是唯一源（canonical）。改这里，然后运行 \`evokit sync\` 同步到各 AI 工具。
> 由 EvoKit 维护，勿在各工具入口文件中直接改规则。

## 语言

- 默认使用中文进行所有交流和回复
- 代码注释、Git 提交信息、文档说明使用中文
- 变量名、函数名等代码标识符保持英文
- 术语保留原文：API、CLI、PR 等
- 当用户使用其他语言提问时，跟随用户使用的语言回复

## 工具链

- Node.js 版本切换优先使用 fnm，而非 nvm 或 n
- Python 环境/依赖/脚本执行优先使用 uv，而非 pip、conda、poetry

## 行为规则

- 任务开始前先判断是否有适用技能，必要时调用
- 只做用户要求的任务，不擅自扩大范围或额外优化，除非明确授权
- 渐进提交：合理拆分，避免巨型 commit
- 宣称完成前必须运行验证命令确认结果
- 最小意外：只修改任务相关的文件，不改无关代码
`;

function readSource(file) {
  return readFileSync(file, 'utf-8').trim();
}

function applyBlock(source) {
  return `${BEGIN}\n${source}\n${END}\n`;
}

function writeTarget(file, content, label) {
  const dir = join(file, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, content, 'utf-8');
  console.log(`✓ 已同步 ${label}  → ${file}`);
}

function ensureSource(file, content) {
  if (existsSync(file)) {
    console.log(`ℹ ${file} 已存在，跳过`);
    return false;
  }
  const dir = join(file, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, content, 'utf-8');
  console.log(`✓ 已创建 ${file}`);
  return true;
}

function initGlobal() {
  ensureSource(GLOBAL_SOURCE, DEFAULT_CONTEXT);
}

function initProject() {
  const cwd = resolve(process.cwd());
  const projSource = join(cwd, '.evokit', 'context.md');
  const projContent = `# 项目规则（单一事实源）

> 本文件是唯一源（canonical）。改这里，然后运行 \`evokit sync --project\` 同步到该项目入口。

## 项目规则

<!-- 在此添加仅本项目生效的规则，例如：本项目使用 pnpm 而非 npm -->
`;
  ensureSource(projSource, projContent);
}

function syncGlobal() {
  if (!existsSync(GLOBAL_SOURCE)) {
    console.log(`✗ 未找到全局源：${GLOBAL_SOURCE}`);
    console.log('  请先运行 evokit init 创建。');
    process.exitCode = 1;
    return;
  }
  const source = readSource(GLOBAL_SOURCE);
  for (const t of GLOBAL_TARGETS) {
    writeTarget(t.file, applyBlock(source), t.name);
  }
  console.log(`\n完成。全局源：${GLOBAL_SOURCE}`);
}

function syncProject() {
  const cwd = resolve(process.cwd());
  const projSource = join(cwd, '.evokit', 'context.md');
  if (!existsSync(projSource)) {
    console.log(`✗ 未找到项目级源：${projSource}`);
    console.log('  请先运行 evokit init --project 创建。');
    process.exitCode = 1;
    return;
  }
  const source = readSource(projSource);
  for (const t of PROJECT_TARGETS) {
    writeTarget(join(cwd, t.file), applyBlock(source), t.name);
  }
  console.log(`\n完成。项目源：${projSource}`);
}

function checkGlobal() {
  if (!existsSync(GLOBAL_SOURCE)) {
    console.log(`✗ 未找到全局源：${GLOBAL_SOURCE}`);
    return false;
  }
  const source = readSource(GLOBAL_SOURCE);
  let allOk = true;
  for (const t of GLOBAL_TARGETS) {
    if (!existsSync(t.file)) {
      console.log(`✗ ${t.name}：入口文件不存在`);
      allOk = false;
      continue;
    }
    const content = readFileSync(t.file, 'utf-8');
    if (!content.includes(BEGIN) || !content.includes(END)) {
      console.log(`✗ ${t.name}：未托管`);
      allOk = false;
      continue;
    }
    const start = content.indexOf(BEGIN) + BEGIN.length;
    const end = content.indexOf(END);
    const managed = content.slice(start, end).trim();
    if (managed === source) {
      console.log(`✓ ${t.name}：一致`);
    } else {
      console.log(`✗ ${t.name}：不一致（需 sync）`);
      allOk = false;
    }
  }
  return allOk;
}

function runCtxlint() {
  console.log('\n—— ctxlint 内容健康检查（辅助，不阻塞） ——');
  try {
    const dir = join(HOME, '.claude');
    execSync(`npx --yes @ctxlint/ctxlint check "${dir}" --severity warn`, {
      stdio: 'inherit',
      cwd: dir,
    });
  } catch (e) {
    // ctxlint 返回非 0 表示有 warning/error；对全局偏好文件，
    // stale-command 等规则可能误报。结果仅作参考。
  }
}

function check() {
  const ok = checkGlobal();
  runCtxlint();
  process.exitCode = ok ? 0 : 1;
}

function help() {
  console.log(`EvoKit CLI — 个人多工具偏好同步工具（零依赖）

用法:
  evokit init               初始化全局源 ~/.evokit/context.md
  evokit init --project     初始化当前项目 .evokit/context.md
  evokit sync               同步全局规则到所有入口
  evokit sync --project     同步项目规则到该项目入口
  evokit check              检查同步一致性 + ctxlint 内容健康检查

单一事实源:
  个人全局  ~/.evokit/context.md
  项目级    <project>/.evokit/context.md
`);
}

const args = process.argv.slice(2);
const cmd = args[0] || 'help';
const isProject = args.includes('--project');

switch (cmd) {
  case 'init':
    isProject ? initProject() : initGlobal();
    break;
  case 'sync':
    isProject ? syncProject() : syncGlobal();
    break;
  case 'check':
    check();
    break;
  case 'help':
  case '--help':
  case '-h':
    help();
    break;
  default:
    console.log(`未知命令：${cmd}\n`);
    help();
    process.exitCode = 1;
}
