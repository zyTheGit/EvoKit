import { describe, it, expect } from 'vitest';
import '../../src/adapters/register.js';
import { listAdapters } from '../../src/adapters/registry.js';

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
});
