#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseAdrFile } from './lib/adr-parser.mjs';
import { parseRoadmap } from './lib/roadmap-parser.mjs';

const ROOT = process.cwd();
const ADR_DIR = join(ROOT, 'docs', 'adr');
const ROADMAP_FILE = join(ROOT, 'ROADMAP.md');

async function main() {
  const errors = [];

  const adrFiles = (await readdir(ADR_DIR))
    .filter((f) => /^\d{4}-.*\.md$/.test(f))
    .sort();

  const allDeferred = [];
  const skippedSuperseded = [];
  for (const file of adrFiles) {
    const { items, superseded } = await parseAdrFile(join(ADR_DIR, file));
    if (superseded) {
      skippedSuperseded.push(`ADR-${file.slice(0, 4)}`);
      continue;
    }
    allDeferred.push(...items);
  }

  let roadmap = [];
  let roadmapMissing = false;
  try {
    roadmap = await parseRoadmap(ROADMAP_FILE);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    roadmapMissing = true;
  }
  const roadmapAdrRefs = new Map();
  for (const entry of roadmap) {
    for (const item of entry.items) {
      if (item.adrRef) {
        if (!roadmapAdrRefs.has(item.adrRef)) {
          roadmapAdrRefs.set(item.adrRef, []);
        }
        roadmapAdrRefs.get(item.adrRef).push({ version: entry.version, text: item.text });
      }
    }
  }

  const adrIdsWithDeferred = new Set(allDeferred.map((d) => d.adrId));
  const roadmapAdrIds = new Set(roadmapAdrRefs.keys());

  if (roadmapMissing && allDeferred.length > 0) {
    const examples = allDeferred
      .slice(0, 5)
      .map((d) => `    - ${d.adrId}「${d.section}」：${d.description.slice(0, 80)}`)
      .join('\n');
    errors.push(
      `❌ 本分支没有 ROADMAP.md（v2.0 转向已删除），但有 ${allDeferred.length} 项有效 ADR 推后事项无处登记\n` +
      `${examples}\n` +
      `   修复建议：恢复 ROADMAP.md 并登记这些推后项；若该 ADR 的机制已随转向作废，请在其「## 状态」段落写明「已被取代」，本脚本会整份跳过`
    );
  }

  for (const adrId of adrIdsWithDeferred) {
    if (!roadmapAdrIds.has(adrId)) {
      const examples = allDeferred
        .filter((d) => d.adrId === adrId)
        .slice(0, 3)
        .map((d) => `    - ${d.section}: ${d.description.slice(0, 80)}`)
        .join('\n');
      errors.push(
        `❌ 幽灵事项：${adrId} 声明了 Won't-do / 推后项，但 ROADMAP 中无任何 adr-ref 登记\n` +
        `   推后项示例：\n${examples}\n` +
        `   修复建议：在 ROADMAP 对应版本章节补条目并加 adr-ref: ${adrId}，或显式从 ADR 移除推后标记`
      );
    }
  }

  const validAdrIds = new Set(
    adrFiles.map((f) => `ADR-${f.slice(0, 4)}`)
  );
  for (const adrId of roadmapAdrIds) {
    if (!validAdrIds.has(adrId)) {
      errors.push(
        `❌ 虚引用：ROADMAP 引用了 ${adrId}，但 docs/adr/ 中不存在该 ADR 文件\n` +
        `   引用位置：${roadmapAdrRefs.get(adrId).map((r) => `${r.version}`).join(', ')}\n` +
        `   修复建议：修正 adr-ref 编号或补充对应 ADR 文件`
      );
    }
  }

  for (const item of allDeferred) {
    if (!item.deferredTo) continue;
    const refs = roadmapAdrRefs.get(item.adrId) || [];
    if (refs.length === 0) continue;
    const hasMatchingVersion = refs.some((r) => r.version.startsWith('v') && item.deferredTo.startsWith('v')
      ? r.version.replace(/\.x$/, '') === item.deferredTo.replace(/\.x$/, '')
      : false);
    if (!hasMatchingVersion && item.deferredTo !== 'future') {
      errors.push(
        `❌ 版本错位：${item.adrId} 在「${item.section}」声明推后到 ${item.deferredTo}，但 ROADMAP 登记版本为 ${refs.map((r) => r.version).join(', ')}\n` +
        `   修复建议：对齐 ADR 推后目标版本或调整 ROADMAP 章节归属`
      );
    }
  }

  if (errors.length > 0) {
    console.error(`ADR ↔ ROADMAP 一致性校验失败（${errors.length} 项）\n`);
    for (const err of errors) console.error(err + '\n');
    process.exit(1);
  }

  const skipNote = roadmapMissing
    ? '（本分支无 ROADMAP.md，仅校验有效 ADR 的推后项无处登记这一条）'
    : '';
  const supersededNote = skippedSuperseded.length > 0
    ? `，${skippedSuperseded.length} 份已被取代的 ADR 已跳过（${skippedSuperseded.join(' / ')}）`
    : '';
  console.log(`✅ ADR ↔ ROADMAP 一致：${adrIdsWithDeferred.size} 个 ADR 推后项均在 ROADMAP 登记，${roadmapAdrIds.size} 个 ROADMAP 引用均可回溯${supersededNote}${skipNote}`);
}

main().catch((err) => {
  console.error('脚本执行失败：', err.message);
  process.exit(2);
});