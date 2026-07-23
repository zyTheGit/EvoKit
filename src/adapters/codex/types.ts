/**
 * EvoKit — Codex 适配器类型
 *
 * 仅由 Codex 适配器使用的 Codex 专用类型。
 * 核心/共享类型位于 `src/core/types.ts`。
 *
 * @packageDocumentation
 */

/** 支持的 Codex CLI 钩子事件名称 */
export type CodexHookEventName =
  | 'SessionStart'
  | 'SubagentStart'
  | 'PreToolUse'
  | 'PermissionRequest'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'PreCompact'
  | 'PostCompact'
  | 'UserPromptSubmit'
  | 'SubagentStop'
  | 'Stop';

/** Codex 钩子事件的作用域 */
export type CodexHookScope = 'thread' | 'turn' | 'subagent';

/** 单个 Codex 钩子处理器的配置 */
export interface CodexHookHandler {
  type: 'command';
  command: string;
  command_windows?: string;
  timeout?: number;
  statusMessage?: string;
  async?: boolean;
}

/** Codex 事件的匹配器分组（含钩子） */
export interface CodexHookMatcherGroup {
  matcher: string;
  hooks: CodexHookHandler[];
}

/** 完整的 hooks.json 结构 */
export interface CodexHooksJson {
  hooks: Partial<Record<CodexHookEventName, CodexHookMatcherGroup[]>>;
}

/** Codex 适配器选项 */
export interface CodexAdapterOptions {
  codexHome?: string;
  sharedMemoryDir?: string;
  dryRun?: boolean;
  verify?: boolean;
}

/** Codex 专用安装配置 */
export interface CodexInstallConfig {
  homeDir: string;
  templateDir: string;
  codexHome?: string;
  dryRun?: boolean;
}

/** Codex 钩子脚本执行结果 */
export interface CodexHookResult {
  continue: boolean;
  stopReason?: string;
  systemMessage?: string;
  permissions?: Record<string, 'allow' | 'deny' | 'prompt'>;
  additionalContext?: string;
}
