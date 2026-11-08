#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { extractHeadings } from './lib/markdown-headings.mjs';

const ROOT = process.cwd();
const ZH_DIR = join(ROOT, 'docs', 'zh');
const EN_DIR = join(ROOT, 'docs', 'en');

// 双语对称豁免表：文件名 → 不补齐另一侧的理由。
// v2.0 转向（提交 7f78090）删除了 v1.x 的双语文档集与「中英双语成对维护」规范
// （原 docs/{zh,en}/DEV_STANDARDS.md 等仅存 main），本分支留下的都是单一语言的
// 历史决策/交接记录，因此逐份登记理由，而不是补写无人阅读的镜像译文。
const EXEMPTIONS = {
  '2.0-DEVELOPMENT-HANDOFF.md': 'v2.0 会话交接记录（中文），面向本项目后续开发者，无英文读者需求',
  'AGENTS-CLI-CONFIG-DESIGN.md': 'v2.0 agent CLI 配置设计（中文），英文侧由 cli/README.md 承担',
  'FINAL-DECISION.md': '方向终判记录（中文），引用大量中文讨论上下文，直译会失真',
  'INVENTORY-DESIGN.md': 'v2.0 inventory 功能设计（中文），使用说明已在 cli/README.md 透出',
  'MEMORY-ENGINE-DESIGN.md': '记忆引擎设计方案（中文，2026-11）：方向裁决与里程碑文档，已实现（2026-11-08，见实施计划完成状态）；英文版随 v3.0 发布补译',
  'MEMORY-ENGINE-IMPLEMENTATION-PLAN.md': '记忆引擎实施计划（中文，2026-11）：技术方案、任务拆分与完成状态，已实现；英文版随 v3.0 发布补译',
  'WEB-VIEWER-REQUIREMENTS.md': '知识库网页端展示需求文档（中文，2026-11）：只读本机控制台需求草案，待评审；英文版随实现补译',
  'WEB-VIEWER-TECH-DESIGN.md': '知识库网页端技术设计文档（中文，2026-11）：开源前端栈+零依赖服务端技术方案，待评审；英文版随实现补译',
  'AI-DEVELOPMENT-STANDARDS.md': 'v1.x 遗留的英文版规范；其中文版随 v2.0 转向已从本分支删除（仅存 main）',
};

async function listMd(dir) {
  const files = await readdir(dir);
  return new Set(files.filter((f) => f.endsWith('.md')));
}

async function main() {
  const errors = [];

  const [zhFiles, enFiles] = await Promise.all([listMd(ZH_DIR), listMd(EN_DIR)]);
  const exemptedNames = new Set(Object.keys(EXEMPTIONS));

  const zhOnly = [...zhFiles].filter((f) => !enFiles.has(f) && !exemptedNames.has(f));
  const enOnly = [...enFiles].filter((f) => !zhFiles.has(f) && !exemptedNames.has(f));

  if (zhOnly.length > 0) {
    errors.push(
      `❌ 文件集合不对称：docs/zh 存在但 docs/en 缺失 ${zhOnly.length} 个文件\n` +
      zhOnly.map((f) => `    - ${f}`).join('\n') +
      `\n   修复建议：补英文版，或在 scripts/check-docs-sync.mjs EXEMPTIONS 表登记豁免理由`
    );
  }
  if (enOnly.length > 0) {
    errors.push(
      `❌ 文件集合不对称：docs/en 存在但 docs/zh 缺失 ${enOnly.length} 个文件\n` +
      enOnly.map((f) => `    - ${f}`).join('\n') +
      `\n   修复建议：补中文版，或登记豁免`
    );
  }

  const commonFiles = [...zhFiles].filter((f) => enFiles.has(f));
  const mismatch = [];
  for (const file of commonFiles) {
    const [zhHeadings, enHeadings] = await Promise.all([
      extractHeadings(join(ZH_DIR, file)),
      extractHeadings(join(EN_DIR, file)),
    ]);
    const zhSeq = zhHeadings.map((h) => h.level).join(',');
    const enSeq = enHeadings.map((h) => h.level).join(',');
    if (zhSeq !== enSeq) {
      mismatch.push({ file, zhCount: zhHeadings.length, enCount: enHeadings.length });
    }
  }
  if (mismatch.length > 0) {
    errors.push(
      `❌ 标题层级序列不对齐：${mismatch.length} 个文件\n` +
      mismatch.map((m) => `    - ${m.file}（zh=${m.zhCount} 节 vs en=${m.enCount} 节）`).join('\n') +
      `\n   修复建议：对齐双侧标题层级序列，保持结构对称`
    );
  }

  if (errors.length > 0) {
    console.error(`双语文档同步校验失败（${errors.length} 项）\n`);
    for (const err of errors) console.error(err + '\n');
    process.exit(1);
  }

  console.log(`✅ 双语文档同步：${commonFiles.length} 对文件标题层级对齐，${exemptedNames.size} 项豁免`);
}

main().catch((err) => {
  console.error('脚本执行失败：', err.message);
  process.exit(2);
});