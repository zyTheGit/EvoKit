/**
 * EvoKit — Codex Adapter Types
 *
 * Codex-specific types that are only used by the Codex adapter.
 * Core/shared types remain in `src/core/types.ts`.
 *
 * @packageDocumentation
 */

/** Supported Codex CLI hook event names */
export type CodexHookEventName =
  | 'SessionStart'
  | 'SubagentStart'
  | 'PreToolUse'
  | 'PermissionRequest'
  | 'PostToolUse'
  | 'PreCompact'
  | 'PostCompact'
  | 'UserPromptSubmit'
  | 'SubagentStop'
  | 'Stop';

/** Scope of a Codex hook event */
export type CodexHookScope = 'thread' | 'turn' | 'subagent';

/** Configuration for a single Codex hook handler */
export interface CodexHookHandler {
  type: 'command';
  command: string;
  command_windows?: string;
  timeout?: number;
  statusMessage?: string;
  async?: boolean;
}

/** A matcher group with hooks for a Codex event */
export interface CodexHookMatcherGroup {
  matcher: string;
  hooks: CodexHookHandler[];
}

/** Full hooks.json structure */
export interface CodexHooksJson {
  hooks: Partial<Record<CodexHookEventName, CodexHookMatcherGroup[]>>;
}

/** Options for the Codex adapter */
export interface CodexAdapterOptions {
  codexHome?: string;
  sharedMemoryDir?: string;
  dryRun?: boolean;
  verify?: boolean;
}

/** Codex-specific installation config */
export interface CodexInstallConfig {
  homeDir: string;
  templateDir: string;
  codexHome?: string;
  dryRun?: boolean;
}

/** Result from a Codex hook script execution */
export interface CodexHookResult {
  continue: boolean;
  stopReason?: string;
  systemMessage?: string;
  permissions?: Record<string, 'allow' | 'deny' | 'prompt'>;
  additionalContext?: string;
}
