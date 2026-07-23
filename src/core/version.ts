/**
 * EvoKit — 版本工具
 *
 * 从 package.json 读取 EvoKit 版本号。
 * 提取为共享函数，避免各适配器重复实现。
 *
 * @packageDocumentation
 */

import { createRequire } from 'node:module';

/** 从 package.json 读取 EvoKit 版本，失败时回退到 '0.0.0'。 */
export function getEvokitVersion(): string {
  try {
    const require2 = createRequire(import.meta.url);
    const pkg = require2('../../package.json') as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}
