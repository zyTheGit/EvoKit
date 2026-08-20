/**
 * 模板回查测试（spec #36 T6 #42 验收 seam）。
 *
 * 断言 template/ 下各 adapter 模板：
 * 1. 含 v1.0 知识库 seed 结构（memory/evokit/：knowledge-index.md、knowledge/、.pending/）
 * 2. 不含 v0.x 废弃概念（corrections/observations/learned-rules/evolution-log/
 *    sessions/violations / evokit-evolve / record-* / 旧路径），
 *    排除作为"已废弃"文档说明出现的行
 * 3. codex/opencode/pi 含 v1.0 知识生命周期指引（.pending、knowledge、evokit learn）
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATE_DIR = path.join(ROOT, 'template');

const ADAPTERS = ['claude', 'codex', 'opencode', 'pi'];

/** 废弃概念：出现在模板中（非"废弃说明"上下文）即视为残留 */
const DEPRECATED_PATTERNS = [
  'corrections.jsonl',
  'observations.jsonl',
  'learned-rules.md',
  'evolution-log.md',
  'sessions.jsonl',
  'violations.jsonl',
  'evokit-evolve',
  'evokit-memory',
  'record-correction',
  'record-observation',
  '.claude/memory/evokit',
  '.codex/memory/evokit',
  '.config/opencode/memory',
  '/evolve',
  'Self-Evolving System Protocol',
];

/** 行若含这些词，视为"废弃说明"（明确声明废弃，非残留使用） */
const DEPRECATION_MARKERS = ['废弃', 'deprecated', '不再使用', '已废弃', 'v0.x', 'v0.0'];

function listFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(fp, out);
    } else {
      out.push(fp);
    }
  }
  return out;
}

function isTextual(filePath: string): boolean {
  return /\.[a-z0-9]+$/i.test(filePath) && !filePath.endsWith('.gitkeep');
}

describe('模板 v1.0 知识引擎一致性（T6 验收 seam）', () => {
  describe('seed 结构', () => {
    for (const adapter of ADAPTERS) {
      it(`${adapter} memory/evokit/ 含 knowledge-index/knowledge/.pending`, () => {
        const evokitDir = path.join(TEMPLATE_DIR, adapter, 'memory', 'evokit');
        expect(fs.existsSync(path.join(evokitDir, 'knowledge-index.md'))).toBe(true);
        expect(fs.existsSync(path.join(evokitDir, 'knowledge'))).toBe(true);
        expect(fs.existsSync(path.join(evokitDir, '.pending'))).toBe(true);
      });
    }
  });

  describe('无 v0 废弃概念残留', () => {
    for (const adapter of ADAPTERS) {
      it(`${adapter} 模板不引用废概念（文档声明除外）`, () => {
        const dir = path.join(TEMPLATE_DIR, adapter);
        const hits: string[] = [];
        for (const fp of listFiles(dir)) {
          if (!isTextual(fp)) continue;
          const lines = fs.readFileSync(fp, 'utf-8').split('\n');
          lines.forEach((line, i) => {
            const isDeprecationDoc = DEPRECATION_MARKERS.some((m) => line.includes(m));
            if (isDeprecationDoc) return; // 文档声明废弃，跳过
            for (const pat of DEPRECATED_PATTERNS) {
              if (line.includes(pat)) {
                hits.push(`${path.relative(dir, fp)}:${i + 1}: ${line.trim()}`);
              }
            }
          });
        }
        expect(hits).toEqual([]);
      });
    }
  });

  describe('codex/opencode/pi 含 v1.0 知识指引', () => {
    const v1Adapters = ['codex', 'opencode', 'pi'];
    for (const adapter of v1Adapters) {
      it(`${adapter} 含 .pending / knowledge-index / evokit learn 指引`, () => {
        const dir = path.join(TEMPLATE_DIR, adapter);
        const all = listFiles(dir)
          .filter(isTextual)
          .map((fp) => fs.readFileSync(fp, 'utf-8'))
          .join('\n');
        expect(all).toMatch(/\.pending/);
        expect(all).toMatch(/knowledge-index\.md|knowledge\//);
        expect(all).toMatch(/evokit learn|evokit-learn/);
      });
    }
  });

  describe('opencode/pi learn 入口透传 --git-history（ADR 0004）', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['opencode', 'tools/evokit-learn.ts'],
      ['pi', 'extensions/evokit-learn.ts'],
    ];
    for (const [adapter, rel] of cases) {
      it(`${adapter} evokit-learn 源码透传 --git-history（git_history 参数）`, () => {
        const src = fs.readFileSync(path.join(TEMPLATE_DIR, adapter, rel), 'utf-8');
        expect(src).toMatch(/git_history/);
        expect(src).toMatch(/--git-history/);
      });
    }
  });
});
