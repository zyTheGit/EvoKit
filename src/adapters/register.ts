/**
 * EvoKit — 适配器注册
 *
 * 导入此文件即注册所有内置适配器。
 * 从 index.ts 中分离，避免 core → adapters/index 循环依赖。
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
