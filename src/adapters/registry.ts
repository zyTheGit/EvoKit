/**
 * EvoKit — 适配器注册表
 *
 * @public — 公共适配器 API 的一部分。
 *
 * 所有适配器安装器的中央注册表。新适配器在此注册后，
 * 即可自动被 `evokit install` 使用，无需修改其他文件。
 *
 * 用法：
 *   registerAdapter(new ClaudeAdapter());
 *   registerAdapter(new CodexAdapter());
 *   const installer = getInstaller('codex');
 *
 * @packageDocumentation
 */

import type { AdapterInstaller } from './types.js';

const registry = new Map<string, AdapterInstaller>();

/**
 * 注册适配器安装器。幂等操作 — 重复注册相同 id 会替换之前的条目（并输出警告）。
 */
export function registerAdapter(installer: AdapterInstaller): void {
  if (registry.has(installer.id)) {
    console.warn(`  ⚠ 适配器 "${installer.id}" 已注册 — 正在替换`);
  }
  registry.set(installer.id, installer);
}

/**
 * 根据 id 获取安装器。若 id 未知则抛出异常。
 */
export function getInstaller(id: string): AdapterInstaller {
  const installer = registry.get(id);
  if (!installer) {
    const known = Array.from(registry.keys()).join(', ');
    throw new Error(`未知的适配器: "${id}"。可用适配器: ${known || '(无已注册适配器)'}`);
  }
  return installer;
}

/**
 * 列出所有已注册的适配器。
 */
export function listAdapters(): AdapterInstaller[] {
  return Array.from(registry.values());
}

/**
 * 检查指定 id 的适配器是否存在。
 */
export function hasAdapter(id: string): boolean {
  return registry.has(id);
}
