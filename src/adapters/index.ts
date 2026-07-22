/**
 * EvoKit — Adapter Index
 *
 * Registers all built-in adapters at import time.
 * Import this file once to make all adapters available.
 *
 * @packageDocumentation
 */

import { registerAdapter } from './registry.js';
import { ClaudeAdapter } from './claude/adapter.js';
import { CodexAdapter } from './codex/adapter.js';
import { OpenCodeAdapter } from './opencode/adapter.js';
import { PiAdapter } from './pi/adapter.js';

// Register built-in adapters
registerAdapter(new ClaudeAdapter());
registerAdapter(new CodexAdapter());
registerAdapter(new OpenCodeAdapter());
registerAdapter(new PiAdapter());

export { registerAdapter, getInstaller, listAdapters, hasAdapter } from './registry.js';
export type {
  AdapterInstaller,
  AdapterInstallConfig,
  AdapterInstallResult,
  AdapterVerifyCheck,
  AdapterStatus,
} from './types.js';
export { ClaudeAdapter, getLayout as getClaudeLayout } from './claude/adapter.js';
export { CodexAdapter, resolveCodexHome } from './codex/adapter.js';
export { OpenCodeAdapter, resolveOpenCodeProjectDir } from './opencode/adapter.js';
export { PiAdapter } from './pi/adapter.js';
