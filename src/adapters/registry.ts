/**
 * EvoKit — Adapter Registry
 *
 * @public — Part of the public adapter API.
 *
 * Central registry for all adapter installers.  New adapters register
 * here and are automatically available to `evokit install` without
 * modifying any other file.
 *
 * Usage:
 *   registerAdapter(new ClaudeAdapter());
 *   registerAdapter(new CodexAdapter());
 *   const installer = getInstaller('codex');
 *
 * @packageDocumentation
 */

import type { AdapterInstaller } from './types.js';

const registry = new Map<string, AdapterInstaller>();

/**
 * Register an adapter installer.  Idempotent — re-registering the same
 * id replaces the previous entry (with a warning).
 */
export function registerAdapter(installer: AdapterInstaller): void {
  if (registry.has(installer.id)) {
    console.warn(`  ⚠ Adapter "${installer.id}" already registered — replacing`);
  }
  registry.set(installer.id, installer);
}

/**
 * Get an installer by id.  Throws if unknown.
 */
export function getInstaller(id: string): AdapterInstaller {
  const installer = registry.get(id);
  if (!installer) {
    const known = Array.from(registry.keys()).join(', ');
    throw new Error(`Unknown adapter: "${id}". Available: ${known || '(none registered)'}`);
  }
  return installer;
}

/**
 * List all registered adapters.
 */
export function listAdapters(): AdapterInstaller[] {
  return Array.from(registry.values());
}

/**
 * Check if an adapter id exists.
 */
export function hasAdapter(id: string): boolean {
  return registry.has(id);
}
