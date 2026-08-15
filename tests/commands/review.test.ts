/**
 * review.ts 测试 — 主动过期复审命令
 *
 * 仅测试导出的纯函数（collectStaleEntries、applyReviewAction、removeIndexEntry、readEntryBody），
 * 不测试 CLI 交互部分（@clack/prompts 依赖）。
 */

import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  collectStaleEntries,
  applyReviewAction,
  removeIndexEntry,
  readEntryBody,
} from '../../src/commands/review.js';
import type { KnowledgeEntry } from '../../src/core/types.js';
import {
  writeKnowledgeEntry,
  appendToKnowledgeIndex,
  readKnowledgeEntry,
  readKnowledgeIndex,
  listKnowledgeEntries,
} from '../../src/core/knowledge.js';

// ─── 测试辅助 ───────────────────────────────────────────────

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-review-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** 在 memoryDir 下写入一条知识条目 */
function writeEntry(memoryDir: string, overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  const entry: KnowledgeEntry = {
    id: 'convention-test',
    scope: 'personal',
    type: 'convention',
    source: 'explicit',
    confidence: 0.9,
    created: '2026-07-30',
    context: '使用 uv 代替 pip',
    ...overrides,
  };
  const knowledgeDir = path.join(memoryDir, 'knowledge');
  writeKnowledgeEntry(
    path.join(knowledgeDir, `${entry.id}.md`),
    entry,
    `## 内容\n\n${entry.context}`,
  );
  return entry;
}

// ─── collectStaleEntries ────────────────────────────────────

describe('collectStaleEntries', () => {
  it('只收集 confidence ≤ 0.5 的条目（按置信度升序）', () => {
    const memoryDir = tmpDir();
    writeEntry(memoryDir, { id: 'fresh-one', confidence: 0.9 });
    writeEntry(memoryDir, { id: 'stale-one', confidence: 0.5 });
    writeEntry(memoryDir, { id: 'retired-one', confidence: 0.1 });

    const stale = collectStaleEntries([memoryDir]);
    expect(stale.map((c) => c.entry.id)).toEqual(['retired-one', 'stale-one']);
  });

  it('同 confidence 档内按 updated 升序（最久未复审优先，ADR 0003）', () => {
    const memoryDir = tmpDir();
    writeEntry(memoryDir, { id: 'old-stale', confidence: 0.5, updated: '2026-01-01' });
    writeEntry(memoryDir, { id: 'new-stale', confidence: 0.5, updated: '2026-06-01' });
    writeEntry(memoryDir, { id: 'no-updated', confidence: 0.5, created: '2026-03-01' });

    const stale = collectStaleEntries([memoryDir]);
    // 同档 STALE：old-stale(2026-01) → no-updated(created 2026-03) → new-stale(2026-06)
    expect(stale.map((c) => c.entry.id)).toEqual(['old-stale', 'no-updated', 'new-stale']);
  });

  it('跨越多个 memory 目录收集', () => {
    const memA = tmpDir();
    const memB = tmpDir();
    writeEntry(memA, { id: 'a-stale', confidence: 0.5 });
    writeEntry(memB, { id: 'b-stale', confidence: 0.1 });

    const stale = collectStaleEntries([memA, memB]);
    expect(stale).toHaveLength(2);
  });

  it('无条目时返回空数组', () => {
    expect(collectStaleEntries([tmpDir()])).toEqual([]);
  });
});

// ─── applyReviewAction ──────────────────────────────────────

describe('applyReviewAction', () => {
  it('confirm 将 STALE 回升 FRESH 并刷新 updated', () => {
    const memoryDir = tmpDir();
    const knowledgeDir = path.join(memoryDir, 'knowledge');
    const indexPath = path.join(memoryDir, 'knowledge-index.md');
    writeEntry(memoryDir, { id: 'stale-one', confidence: 0.5 });
    appendToKnowledgeIndex(indexPath, 'stale-one', '使用 uv 代替 pip');

    const candidates = collectStaleEntries([memoryDir]);
    const result = applyReviewAction(candidates[0], 'confirm');

    expect(result.confidence).toBe(0.9);
    const updated = readKnowledgeEntry(path.join(knowledgeDir, 'stale-one.md'))!;
    expect(updated.confidence).toBe(0.9);
    expect(updated.updated).toBeDefined();
    // 正文保留
    const raw = fs.readFileSync(path.join(knowledgeDir, 'stale-one.md'), 'utf-8');
    expect(raw).toContain('使用 uv 代替 pip');
  });

  it('retire 将 STALE 降为 RETIRED', () => {
    const memoryDir = tmpDir();
    const knowledgeDir = path.join(memoryDir, 'knowledge');
    writeEntry(memoryDir, { id: 'stale-one', confidence: 0.5 });

    const candidates = collectStaleEntries([memoryDir]);
    const result = applyReviewAction(candidates[0], 'retire');

    expect(result.confidence).toBe(0.1);
    const updated = readKnowledgeEntry(path.join(knowledgeDir, 'stale-one.md'))!;
    expect(updated.confidence).toBe(0.1);
  });

  it('delete 删除文件并从索引移除', () => {
    const memoryDir = tmpDir();
    const knowledgeDir = path.join(memoryDir, 'knowledge');
    const indexPath = path.join(memoryDir, 'knowledge-index.md');
    writeEntry(memoryDir, { id: 'stale-one', confidence: 0.1 });
    appendToKnowledgeIndex(indexPath, 'stale-one', '使用 uv 代替 pip');

    const candidates = collectStaleEntries([memoryDir]);
    const result = applyReviewAction(candidates[0], 'delete');

    expect(result.confidence).toBeNull();
    expect(listKnowledgeEntries(knowledgeDir)).toEqual([]);
    const idx = readKnowledgeIndex(indexPath);
    expect(idx.evokit.some((l) => l.includes('stale-one'))).toBe(false);
  });

  it('dry-run 不修改文件', () => {
    const memoryDir = tmpDir();
    const knowledgeDir = path.join(memoryDir, 'knowledge');
    writeEntry(memoryDir, { id: 'stale-one', confidence: 0.5 });

    const candidates = collectStaleEntries([memoryDir]);
    const result = applyReviewAction(candidates[0], 'confirm', true);

    expect(result.confidence).toBe(0.9);
    const unchanged = readKnowledgeEntry(path.join(knowledgeDir, 'stale-one.md'))!;
    expect(unchanged.confidence).toBe(0.5); // 未写回
  });
});

// ─── removeIndexEntry ───────────────────────────────────────

describe('removeIndexEntry', () => {
  it('仅移除指定 id 的行，保留其他', () => {
    const memoryDir = tmpDir();
    const indexPath = path.join(memoryDir, 'knowledge-index.md');
    appendToKnowledgeIndex(indexPath, 'keep-one', '保留');
    appendToKnowledgeIndex(indexPath, 'drop-one', '删除');

    removeIndexEntry(indexPath, 'drop-one', 'evokit');

    const idx = readKnowledgeIndex(indexPath);
    expect(idx.evokit.some((l) => l.includes('drop-one'))).toBe(false);
    expect(idx.evokit.some((l) => l.includes('keep-one'))).toBe(true);
  });
});

// ─── readEntryBody ──────────────────────────────────────────

describe('readEntryBody', () => {
  it('提取 frontmatter 之后的正文', () => {
    const memoryDir = tmpDir();
    const knowledgeDir = path.join(memoryDir, 'knowledge');
    writeEntry(memoryDir, { id: 'body-test', context: '正文内容' });
    const body = readEntryBody(path.join(knowledgeDir, 'body-test.md'));
    expect(body).toContain('正文内容');
  });
});
