/**
 * health.ts 测试 — 知识库健康诊断（ADR 0003）
 *
 * 覆盖：双向索引漂移（孤儿/悬空）、frontmatter 合法性、pending/stale/retired 积压、分布。
 */

import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { KnowledgeRepository } from '../../src/core/repository.js';
import { writeKnowledgeEntry, writeKnowledgeIndex } from '../../src/core/knowledge.js';
import { inspectKnowledgeHealth } from '../../src/core/health.js';
import type { KnowledgeEntry } from '../../src/core/types.js';

const tmpDirs: string[] = [];

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-health-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** 直接写一条 active 条目（可绕过索引，用于构造漂移）。 */
function writeEntry(root: string, overrides: Partial<KnowledgeEntry>): string {
  const entry: KnowledgeEntry = {
    id: 'convention-test',
    scope: 'personal',
    type: 'convention',
    source: 'explicit',
    confidence: 0.9,
    created: '2026-07-30',
    context: '使用 uv 代替 pip',
    ...overrides,
  } as KnowledgeEntry;
  const knowledgeDir = path.join(root, 'knowledge');
  fs.mkdirSync(knowledgeDir, { recursive: true });
  writeKnowledgeEntry(
    path.join(knowledgeDir, `${entry.id}.md`),
    entry,
    `## 内容\n\n${entry.context ?? ''}`,
  );
  return entry.id;
}

describe('inspectKnowledgeHealth', () => {
  it('健康知识库：无漂移、正确计数与分布', () => {
    const root = tmpRoot();
    const r = new KnowledgeRepository({ knowledgeRoot: root });
    r.createDraft({ type: 'convention', content: '使用 uv 代替 pip' });
    r.confirmDraft(r.listPending()[0], 'personal');

    const h = inspectKnowledgeHealth(root);
    expect(h.activeCount).toBe(1);
    expect(h.pendingCount).toBe(0);
    expect(h.orphanEntries).toEqual([]);
    expect(h.danglingEntries).toEqual([]);
    expect(h.invalidEntries).toEqual([]);
    expect(h.distribution.scope).toEqual({ personal: 1 });
    expect(h.distribution.type).toEqual({ convention: 1 });
    expect(h.distribution.confidence).toEqual({ '0.9': 1 });
  });

  it('孤儿条目：knowledge/ 有但索引未引用', () => {
    const root = tmpRoot();
    writeEntry(root, { id: 'convention-orphan' });
    // 不写索引文件 → 索引视为空，条目成孤儿
    const h = inspectKnowledgeHealth(root);
    expect(h.orphanEntries).toEqual(['convention-orphan']);
    expect(h.activeCount).toBe(1);
  });

  it('悬空条目：索引引用但 knowledge/ 缺失', () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root), { recursive: true });
    writeKnowledgeIndex(path.join(root, 'knowledge-index.md'), ['- [ghost] 幻影'], []);
    const h = inspectKnowledgeHealth(root);
    expect(h.danglingEntries).toEqual(['ghost']);
    expect(h.orphanEntries).toEqual([]);
  });

  it('frontmatter 非法（confidence 非三档）→ 计入 invalid，不计入 active', () => {
    const root = tmpRoot();
    writeEntry(root, { id: 'convention-bad', confidence: 0.3 } as never);
    const h = inspectKnowledgeHealth(root);
    expect(h.invalidEntries).toEqual(['convention-bad']);
    expect(h.activeCount).toBe(0);
  });

  it('STALE/RETIRED 积压计数', () => {
    const root = tmpRoot();
    writeEntry(root, { id: 'convention-fresh', confidence: 0.9, context: '新鲜' });
    writeEntry(root, { id: 'convention-stale', confidence: 0.5, context: '待复审' });
    writeEntry(root, { id: 'convention-retired', confidence: 0.1, context: '疑失效' });
    const h = inspectKnowledgeHealth(root);
    expect(h.staleCount).toBe(1);
    expect(h.retiredCount).toBe(1);
    expect(h.distribution.confidence).toEqual({ '0.9': 1, '0.5': 1, '0.1': 1 });
  });

  it('根不存在时返回全空健康报告（不崩溃）', () => {
    const h = inspectKnowledgeHealth(tmpRoot());
    expect(h.activeCount).toBe(0);
    expect(h.pendingCount).toBe(0);
    expect(h.orphanEntries).toEqual([]);
    expect(h.danglingEntries).toEqual([]);
    expect(h.duplicateGroups).toEqual([]);
  });

  it('归一化全等重复簇表面化（ADR 0005）', () => {
    const root = tmpRoot();
    const r = new KnowledgeRepository({ knowledgeRoot: root });
    r.createDraft({ type: 'convention', content: '使用 uv 代替 pip' });
    r.confirmDraft(r.listPending()[0], 'personal');
    r.createDraft({ type: 'convention', content: '使用 uv 代替 pip' });
    r.confirmDraft(r.listPending()[0], 'personal');

    const h = inspectKnowledgeHealth(root);
    expect(h.duplicateGroups).toHaveLength(1);
    expect(h.duplicateGroups[0].members).toHaveLength(2);
    expect(h.duplicateGroups[0].type).toBe('convention');
  });
});
