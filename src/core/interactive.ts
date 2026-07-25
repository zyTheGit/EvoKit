/**
 *
 * @internal — 内部辅助模块，不属于公共适配器 API。
 * EvoKit — 交互式适配器选择
 *
 * 使用 @clack/prompts 多选菜单替代原始 TTY / readline 菜单。
 *
 * @packageDocumentation
 */

import { selectAdapters as clackSelectAdapters, toChoice } from '../cli/adapter-selector.js';
import type { MenuAdapter } from '../cli/adapter-selector.js';

export type { MenuAdapter };

const DEFAULT_ADAPTERS: MenuAdapter[] = [
  { key: 'claude', label: 'Claude Code（推荐）', description: '~/.claude/' },
  { key: 'codex', label: 'Codex CLI (v0.145.0)', description: '~/.codex/' },
  { key: 'opencode', label: 'OpenCode CLI (v1.18.4)', description: '~/.config/opencode/' },
];

/**
 *
 * @internal — 内部辅助模块，不属于公共适配器 API。
 * 使用 Clack 多选菜单展示交互式适配器选择器。
 *
 * 支持 ↑↓ 导航、空格切换、回车确认、ESC 取消。
 *
 * @param adapters - 可选的适配器列表（默认：内置列表）
 * @returns 已选适配器 key 数组（不会为空 — 默认为 ['claude']）
 */
export async function selectAdapters(
  adapters: MenuAdapter[] = DEFAULT_ADAPTERS,
): Promise<string[]> {
  const choices = adapters.map(toChoice);
  return clackSelectAdapters(choices, ['claude']);
}
