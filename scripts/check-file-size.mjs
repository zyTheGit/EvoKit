#!/usr/bin/env node
// 文件规模检查（网页端技术设计 D7）：任何单文件超过 400 行必须拆分
// 范围：cli/src/**、cli/web/src/**（前端源码）、cli/*.mjs（入口+测试套件）、scripts/*.mjs
// 豁免：存量超限文件逐个登记理由（风格仿 check-docs-sync.mjs），待作者单独授权后拆分
// 用法：node scripts/check-file-size.mjs

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MAX_LINES = 400;

// 存量超限豁免表：文件路径（'/' 分隔）→ 理由。这些文件在本规则建立前已存在，
// 为「最小意外」原则不在网页端任务中顺带重构，拆分由作者单独授权后另立任务。
const EXEMPTIONS = {
  'cli/src/distill.js': '存量超限，待单独授权拆分',
  'cli/src/commands/review.js': '存量超限，待单独授权拆分',
  'cli/src/harvest/adapters.js': '存量超限，待单独授权拆分',
  'cli/test-local.mjs': '存量超限（测试套件），待单独授权拆分',
  'cli/test-m1-lib.mjs': '存量超限（测试套件），待单独授权拆分',
  'cli/test-m2.mjs': '存量超限（测试套件），待单独授权拆分',
  'cli/test-m6.mjs': '存量超限（测试套件），待单独授权拆分',
};

/** 递归收集指定扩展名的文件（'/' 分隔相对路径） */
function collect(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) collect(p, exts, out);
    else if (exts.some((ext) => entry.name.toLowerCase().endsWith(ext))) out.push(p.replaceAll('\\', '/'));
  }
  return out;
}

/** 行数统计：与 wc -l 口径一致（末尾换行不额外计一行） */
function lineCount(file) {
  const content = readFileSync(file, 'utf-8');
  if (content.length === 0) return 0;
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
}

const files = new Set(collect('cli/src', ['.js']));
for (const f of collect('cli/web/src', ['.js', '.vue'])) files.add(f);
if (existsSync('cli')) {
  for (const f of readdirSync('cli')) {
    if (f.endsWith('.mjs')) files.add(`cli/${f}`);
  }
}
if (existsSync('scripts')) {
  for (const f of readdirSync('scripts')) {
    if (f.endsWith('.mjs')) files.add(`scripts/${f}`);
  }
}

const violations = [];
const exempted = [];
for (const file of [...files].sort()) {
  const lines = lineCount(file);
  if (lines <= MAX_LINES) continue;
  if (EXEMPTIONS[file]) exempted.push({ file, lines, reason: EXEMPTIONS[file] });
  else violations.push({ file, lines });
}

for (const { file, lines, reason } of exempted) {
  console.log(`ℹ 豁免：${file}（${lines} 行）— ${reason}`);
}
if (violations.length === 0) {
  console.log(`✅ 文件规模检查：${files.size} 个文件全部 ≤ ${MAX_LINES} 行（豁免 ${exempted.length} 个）`);
} else {
  console.error(`❌ 文件规模检查：${violations.length} 个文件超过 ${MAX_LINES} 行，必须拆分：`);
  for (const { file, lines } of violations) {
    console.error(`   - ${file}（${lines} 行）`);
  }
  process.exitCode = 1;
}
