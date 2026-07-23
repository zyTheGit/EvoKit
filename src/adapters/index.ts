/**
 * EvoKit — 适配器索引
 *
 * 在导入时注册所有内置适配器。
 * 只需导入此文件一次即可使所有适配器可用。
 *
 * @packageDocumentation
 */

import { registerAdapter } from './registry.js';
import { ClaudeAdapter } from './claude/adapter.js';
import { CodexAdapter } from './codex/adapter.js';
import { OpenCodeAdapter } from './opencode/adapter.js';
import { PiAdapter } from './pi/adapter.js';

// 注册内置适配器
registerAdapter(new ClaudeAdapter());
registerAdapter(new CodexAdapter());
registerAdapter(new OpenCodeAdapter());
registerAdapter(new PiAdapter());

export { registerAdapter, getInstaller, listAdapters, hasAdapter } from './registry.js';
export { BaseAdapter } from './base-adapter.js';
export type {
  AdapterInstaller,
  AdapterInstallConfig,
  AdapterInstallResult,
  AdapterVerifyCheck,
  AdapterStatus,
} from './types.js';
export {
  ClaudeAdapter,
  getLayout as getClaudeLayout,
  verifyClaudeInstallation,
} from './claude/adapter.js';
export { CodexAdapter, resolveCodexHome } from './codex/adapter.js';
export { OpenCodeAdapter, resolveOpenCodeProjectDir } from './opencode/adapter.js';
export {
  PiAdapter,
  resolvePiHome,
  installPi,
  verifyPiInstallation,
  injectPiMemory,
  exportPiMemory,
  recordPiSession,
  getPiStatus,
} from './pi/adapter.js';
