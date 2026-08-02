import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../src/adapters/register.js';
import { listAdapters } from '../../src/adapters/registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATE_DIR = path.join(ROOT, 'template');

/**
 * AdapterInstaller 接口契约测试 — 验证所有注册适配器满足公共接口约束。
 *
 * description 已从 AdapterInternal 提升到 AdapterInstaller，
 * 此测试确保所有适配器都提供了非空描述。
 */
describe('AdapterInstaller 接口契约', () => {
  it('所有适配器提供非空 description', () => {
    const adapters = listAdapters();
    expect(adapters.length).toBeGreaterThan(0);

    for (const adapter of adapters) {
      expect(adapter.id).toBeTruthy();
      expect(adapter.label).toBeTruthy();
      expect(adapter.description).toBeTruthy();
      expect(typeof adapter.description).toBe('string');
    }
  });

  it('seedMemory 模板含 evokit 结构、无 v0 废弃种子（spec #36 T6）', () => {
    const adapters = listAdapters();
    const deprecatedSeeds = [
      'corrections.jsonl',
      'observations.jsonl',
      'learned-rules.md',
      'evolution-log.md',
      'sessions.jsonl',
      'violations.jsonl',
    ];
    for (const adapter of adapters) {
      const memoryDir = path.join(TEMPLATE_DIR, adapter.id, 'memory');
      // 模板 memory 目录必须存在
      expect(fs.existsSync(memoryDir)).toBe(true);
      // seedMemory 应含 evokit 结构：knowledge-index.md / knowledge / .pending
      const evokitDir = path.join(memoryDir, 'evokit');
      for (const entry of ['knowledge-index.md', 'knowledge', '.pending']) {
        expect(fs.existsSync(path.join(evokitDir, entry))).toBe(true);
      }
      // 不含任何 v0 废弃种子文件
      for (const seed of deprecatedSeeds) {
        expect(fs.existsSync(path.join(memoryDir, seed))).toBe(false);
        expect(fs.existsSync(path.join(evokitDir, seed))).toBe(false);
      }
    }
  });
});
