/**
 * EvoKit — Interactive Adapter Selection
 *
 * Replaces raw TTY / readline menus with @clack/prompts multiselect.
 *
 * @packageDocumentation
 */

import { selectAdapters as clackSelectAdapters, toChoice } from '../cli/adapter-selector.js';
import type { MenuAdapter } from '../cli/adapter-selector.js';

export type { MenuAdapter };

const DEFAULT_ADAPTERS: MenuAdapter[] = [
  { key: 'claude', label: 'Claude Code (recommended)', description: '~/.claude/' },
  { key: 'codex', label: 'Codex CLI (v0.3.0)', description: '~/.codex/' },
  { key: 'opencode', label: 'OpenCode CLI (v0.4.0)', description: '.opencode/' },
];

/**
 * Show an interactive adapter selector using Clack's multiselect.
 *
 * Supports ↑↓ navigation, Space to toggle, Enter to confirm, ESC to cancel.
 *
 * @param adapters - Available adapters to choose from (default: built-in list)
 * @returns Array of selected adapter keys (never empty — defaults to ['claude'])
 */
export async function selectAdapters(
  adapters: MenuAdapter[] = DEFAULT_ADAPTERS,
): Promise<string[]> {
  const choices = adapters.map(toChoice);
  return clackSelectAdapters(choices, ['claude']);
}
