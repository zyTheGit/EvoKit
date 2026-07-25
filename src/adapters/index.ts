/**
 * EvoKit — 适配器索引
 *
 * 导入此文件即注册所有内置适配器并 re-export 公共 API。
 * 注册逻辑在 register.ts 中，与 re-export 分离以避免循环依赖。
 *
 * @packageDocumentation
 */

// 注册内置适配器（副作用导入 — 触发 register.ts 中的 registerAdapter 调用）
import './register.js';

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
  buildClaudeExtraChecks,
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
