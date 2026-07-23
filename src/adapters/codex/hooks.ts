/**
 * EvoKit — Codex CLI 钩子管理器
 *
 * 通过生成 hooks.json 配置来管理 Codex CLI 的生命周期钩子。
 * 支持 JSON 和 TOML 两种格式。
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
 * 用于构建 hooks.json 配置的构建器。
 */
export class CodexHooksBuilder {
  private hooks: Partial<Record<CodexHookEventName, CodexHookMatcherGroup[]>> = {};

  /**
   * 为指定事件添加钩子处理器。
   */
  addHook(event: CodexHookEventName, matcher: string, handler: CodexHookHandler): this {
    if (!this.hooks[event]) {
      this.hooks[event] = [];
    }

    // 查找或创建匹配器分组
    let group = this.hooks[event]!.find((g) => g.matcher === matcher);
    if (!group) {
      group = { matcher, hooks: [] };
      this.hooks[event]!.push(group);
    }

    group.hooks.push(handler);
    return this;
  }

  /**
   * 添加 SessionStart 钩子。
   */
  addSessionStartHook(
    scriptPath: string,
    statusMessage = 'EvoKit: 正在加载会话上下文',
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
   * 添加用于会话记录的 Stop 钩子。
   */
  addStopHook(scriptPath: string, timeout = 15): this {
    return this.addHook('Stop', '.*', {
      type: 'command',
      command: scriptPath,
      timeout,
      statusMessage: 'EvoKit: 正在记录会话',
    });
  }

  /**
   * 添加用于策略执行的 PreToolUse 钩子。
   */
  addPreToolUseHook(scriptPath: string, timeout = 10): this {
    return this.addHook('PreToolUse', '.*', {
      type: 'command',
      command: scriptPath,
      timeout,
      statusMessage: 'EvoKit: 正在检查工具策略',
    });
  }

  /**
   * 添加用于编辑追踪/自动格式化的 PostToolUse 钩子。
   */
  addPostToolUseHook(scriptPath: string, matcher = '.*', timeout = 10): this {
    return this.addHook('PostToolUse', matcher, {
      type: 'command',
      command: scriptPath,
      timeout,
      statusMessage: 'EvoKit: 正在追踪工具使用',
    });
  }

  /**
   * 添加用于工具调用失败记录的 PostToolUseFailure 钩子。
   */
  addPostToolUseFailureHook(scriptPath: string, matcher = '.*', timeout = 10): this {
    return this.addHook('PostToolUseFailure', matcher, {
      type: 'command',
      command: scriptPath,
      timeout,
      statusMessage: 'EvoKit: 正在记录工具失败',
    });
  }

  /**
   * 添加用于用户提示处理的 UserPromptSubmit 钩子。
   */
  addUserPromptSubmitHook(scriptPath: string, timeout = 10): this {
    return this.addHook('UserPromptSubmit', '.*', {
      type: 'command',
      command: scriptPath,
      timeout,
      statusMessage: 'EvoKit: 正在处理用户提示',
    });
  }

  /**
   * 添加用于子代理启动追踪的 SubagentStart 钩子。
   */
  addSubagentStartHook(scriptPath: string, timeout = 10): this {
    return this.addHook('SubagentStart', '.*', {
      type: 'command',
      command: scriptPath,
      timeout,
      statusMessage: 'EvoKit: 正在追踪子代理启动',
    });
  }

  /**
   * 添加拒绝特定工具的自定义 PreToolUse 钩子。
   */
  addToolGuard(toolMatcher: string, scriptPath: string, timeout = 10): this {
    return this.addHook('PreToolUse', toolMatcher, {
      type: 'command',
      command: scriptPath,
      timeout,
      statusMessage: `EvoKit: 正在检查 ${toolMatcher} 使用`,
    });
  }

  /**
   * 添加用于自动审批规则的 PermissionRequest 钩子。
   */
  addPermissionHook(toolMatcher: string, scriptPath: string, timeout = 10): this {
    return this.addHook('PermissionRequest', toolMatcher, {
      type: 'command',
      command: scriptPath,
      timeout,
      statusMessage: `EvoKit: 正在评估 ${toolMatcher} 权限`,
    });
  }

  /**
   * 构建钩子配置对象。
   */
  build(): CodexHooksJson {
    return { hooks: this.hooks };
  }

  /**
   * 序列化为 JSON 字符串。
   */
  toJSON(pretty = true): string {
    return JSON.stringify(this.build(), null, pretty ? 2 : undefined);
  }

  /**
   * 将 hooks.json 写入磁盘。
   */
  writeToFile(filePath: string, pretty = true): void {
    fse.ensureDirSync(path.dirname(filePath));
    fs.writeFileSync(filePath, this.toJSON(pretty), 'utf-8');
  }

  /**
   * 创建默认的 EvoKit 钩子配置。
   */
  static createDefault(scriptsDir: string): CodexHooksBuilder {
    return new CodexHooksBuilder()
      .addSessionStartHook(path.join(scriptsDir, 'session-start.sh'))
      .addStopHook(path.join(scriptsDir, 'stop.sh'))
      .addPreToolUseHook(path.join(scriptsDir, 'pre-tool-use.sh'));
  }
}

/**
 * 从磁盘解析 hooks.json 文件。
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
 * 合并多个钩子配置。
 * 对于相同事件+匹配器的配置，后面的覆盖前面的。
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
        // 按匹配器合并分组，相同匹配器以后者为准
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
 * 生成钩子的 TOML 表示，用于内联 config.toml。
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
