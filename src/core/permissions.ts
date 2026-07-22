/**
 *
 * @internal — 内部辅助工具，不属于公共适配器 API。
 * EvoKit — 文件权限工具
 *
 * 为已安装文件设置标准权限：
 *   - Hook 脚本 → 可执行 (0o755)
 *   - JSONL 内存文件 → 0o600（个人数据）
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';

/**
 *
 * @internal — 内部辅助工具，不属于公共适配器 API。
 * 将 hook 脚本 (*.sh) 设置为可执行。
 */
export function setHookPermissions(hooksDir: string): string[] {
  const set: string[] = [];
  if (!fse.existsSync(hooksDir)) return set;

  for (const file of fs.readdirSync(hooksDir)) {
    if (!file.endsWith('.sh')) continue;
    const fp = path.join(hooksDir, file);
    try {
      fs.chmodSync(fp, 0o755);
      set.push(file);
    } catch {
      // 跳过不可读文件
    }
  }
  return set;
}

/**
 *
 * @internal — 内部辅助工具，不属于公共适配器 API。
 * 将 JSONL 内存文件权限设置为 0o600（仅所有者可读写）。
 */
export function setMemoryPermissions(memoryDir: string): string[] {
  const set: string[] = [];
  if (!fse.existsSync(memoryDir)) return set;

  for (const file of fs.readdirSync(memoryDir)) {
    if (!file.endsWith('.jsonl')) continue;
    const fp = path.join(memoryDir, file);
    try {
      fs.chmodSync(fp, 0o600);
      set.push(file);
    } catch {
      // 跳过
    }
  }
  return set;
}

/**
 *
 * @internal — 内部辅助工具，不属于公共适配器 API。
 * 快速检查文件是否具有可执行位。
 */
export function isExecutable(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    return !!(stats.mode & 0o111);
  } catch {
    return false;
  }
}
