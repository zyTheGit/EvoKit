/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * EvoKit — File Permission Utilities
 *
 * Sets standard permissions on installed files:
 *   - Hook scripts → executable (0o755)
 *   - JSONL memory files → 0o600 (personal data)
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Set permissions on hook scripts (*.sh) to executable.
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
      // Skip unreadable files
    }
  }
  return set;
}

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Set permissions on JSONL memory files to 0o600 (owner read/write only).
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
      // Skip
    }
  }
  return set;
}

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Quick check that a file has executable bits.
 */
export function isExecutable(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    return !!(stats.mode & 0o111);
  } catch {
    return false;
  }
}
