/**
 * EvoKit — Codex CLI Hooks Manager
 *
 * Manages lifecycle hooks for Codex CLI by generating
 * hooks.json configurations. Supports both JSON and TOML formats.
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import {
  CodexHookEventName,
  CodexHookHandler,
  CodexHookMatcherGroup,
  CodexHooksJson,
} from './types.js';

/**
 * Builder for constructing hooks.json configurations.
 */
export class CodexHooksBuilder {
  private hooks: Partial<Record<CodexHookEventName, CodexHookMatcherGroup[]>> = {};

  /**
   * Add a hook handler for a specific event.
   */
  addHook(event: CodexHookEventName, matcher: string, handler: CodexHookHandler): this {
    if (!this.hooks[event]) {
      this.hooks[event] = [];
    }

    // Find or create matcher group
    let group = this.hooks[event]!.find((g) => g.matcher === matcher);
    if (!group) {
      group = { matcher, hooks: [] };
      this.hooks[event]!.push(group);
    }

    group.hooks.push(handler);
    return this;
  }

  /**
   * Add a SessionStart hook.
   */
  addSessionStartHook(
    scriptPath: string,
    statusMessage = 'EvoKit: loading session context',
    timeout = 30,
  ): this {
    return this.addHook('SessionStart', 'startup|resume', {
      type: 'command',
      command: scriptPath,
      timeout,
      statusMessage,
    });
  }

  /**
   * Add a Stop hook for session recording.
   */
  addStopHook(scriptPath: string, timeout = 15): this {
    return this.addHook('Stop', '.*', {
      type: 'command',
      command: scriptPath,
      timeout,
      statusMessage: 'EvoKit: recording session',
    });
  }

  /**
   * Add a PreToolUse hook for policy enforcement.
   */
  addPreToolUseHook(scriptPath: string, timeout = 10): this {
    return this.addHook('PreToolUse', '.*', {
      type: 'command',
      command: scriptPath,
      timeout,
      statusMessage: 'EvoKit: checking tool policy',
    });
  }

  /**
   * Add a custom PreToolUse hook that denies a specific tool.
   */
  addToolGuard(toolMatcher: string, scriptPath: string, timeout = 10): this {
    return this.addHook('PreToolUse', toolMatcher, {
      type: 'command',
      command: scriptPath,
      timeout,
      statusMessage: `EvoKit: checking ${toolMatcher} usage`,
    });
  }

  /**
   * Add a PermissionRequest hook for auto-approval rules.
   */
  addPermissionHook(toolMatcher: string, scriptPath: string, timeout = 10): this {
    return this.addHook('PermissionRequest', toolMatcher, {
      type: 'command',
      command: scriptPath,
      timeout,
      statusMessage: `EvoKit: evaluating ${toolMatcher} permissions`,
    });
  }

  /**
   * Build the hooks configuration object.
   */
  build(): CodexHooksJson {
    return { hooks: this.hooks };
  }

  /**
   * Serialize to JSON string.
   */
  toJSON(pretty = true): string {
    return JSON.stringify(this.build(), null, pretty ? 2 : undefined);
  }

  /**
   * Write hooks.json to disk.
   */
  writeToFile(filePath: string, pretty = true): void {
    fse.ensureDirSync(path.dirname(filePath));
    fs.writeFileSync(filePath, this.toJSON(pretty), 'utf-8');
  }

  /**
   * Create a default EvoKit hooks configuration.
   */
  static createDefault(scriptsDir: string): CodexHooksBuilder {
    return new CodexHooksBuilder()
      .addSessionStartHook(path.join(scriptsDir, 'session-start.sh'))
      .addStopHook(path.join(scriptsDir, 'stop.sh'))
      .addPreToolUseHook(path.join(scriptsDir, 'pre-tool-use.sh'));
  }
}

/**
 * Parse a hooks.json file from disk.
 */
export function parseHooksFile(filePath: string): CodexHooksJson | null {
  if (!fse.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as CodexHooksJson;
  } catch {
    return null;
  }
}

/**
 * Merge multiple hooks configurations.
 * Later configs override earlier ones for the same event+matcher.
 */
export function mergeHooksConfigs(...configs: (CodexHooksJson | null)[]): CodexHooksJson {
  const merged: Partial<Record<CodexHookEventName, CodexHookMatcherGroup[]>> = {};

  for (const config of configs) {
    if (!config?.hooks) continue;
    for (const [event, groups] of Object.entries(config.hooks)) {
      const ev = event as CodexHookEventName;
      if (!merged[ev]) {
        merged[ev] = groups;
      } else {
        // Merge groups by matcher, later wins for same matcher
        for (const group of groups) {
          const idx = merged[ev]!.findIndex((g) => g.matcher === group.matcher);
          if (idx >= 0) {
            merged[ev]![idx] = group;
          } else {
            merged[ev]!.push(group);
          }
        }
      }
    }
  }

  return { hooks: merged };
}

/**
 * Generate TOML representation of hooks for inline config.toml usage.
 */
export function hooksToToml(hooksJson: CodexHooksJson): string {
  const lines: string[] = [];

  if (!hooksJson.hooks) return '';

  for (const [event, groups] of Object.entries(hooksJson.hooks)) {
    if (!groups) continue;
    for (const group of groups) {
      lines.push(`[[hooks.${event}]]`);
      lines.push(`matcher = "${group.matcher}"`);
      for (const hook of group.hooks) {
        lines.push(`[[hooks.${event}.hooks]]`);
        lines.push(`type = "${hook.type}"`);
        lines.push(`command = "${hook.command}"`);
        if (hook.command_windows) {
          lines.push(`command_windows = "${hook.command_windows}"`);
        }
        if (hook.timeout) {
          lines.push(`timeout = ${hook.timeout}`);
        }
        if (hook.statusMessage) {
          lines.push(`statusMessage = "${hook.statusMessage}"`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
