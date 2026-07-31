/**
 * EvoKit — 反向合并 settings.json
 *
 * 撤销安装时执行的 settings.json 合并操作。
 * 移除 EvoKit 添加的 hook 条目、环境变量、autoMemoryEnabled
 * 和权限条目，同时保留用户添加的值。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import fse from 'fs-extra';
import { atomicWriteFile } from './atomic-write.js';
import type { AdapterManifest } from './manifest.js';

/** 反向合并 settings.json 的结果 */
export interface ReverseMergeResult {
  /** 是否进行了任何更改（或在 dry-run 模式下本应进行的更改） */
  changed: boolean;
  /** 移除的 hook matcher 组数 */
  hooksRemoved: number;
  /** 移除的环境变量数 */
  envVarsRemoved: number;
  /** autoMemoryEnabled 是否被还原 */
  autoMemoryEnabledReverted: boolean;
  /** 移除的 permissions allow 条目数 */
  permissionsAllowRemoved: number;
  /** 移除的 permissions deny 条目数 */
  permissionsDenyRemoved: number;
  /** 文件是否因变为空而被删除 */
  fileDeleted: boolean;
}

/**
 * 反向合并 settings.json — 移除 EvoKit 添加的条目。
 *
 * 使用 JSON.stringify 精确比较 hook matcher 组，
 * 对环境变量使用精确的键+值匹配。保留用户添加的值。
 * 如果文件变为有效空内容（仅剩 `$schema`），则删除它。
 * 通过临时文件+重命名进行原子写入。
 */
export function reverseMergeSettings(
  settingsPath: string,
  manifest: AdapterManifest,
  dryRun = false,
): ReverseMergeResult {
  const result: ReverseMergeResult = {
    changed: false,
    hooksRemoved: 0,
    envVarsRemoved: 0,
    autoMemoryEnabledReverted: false,
    permissionsAllowRemoved: 0,
    permissionsDenyRemoved: 0,
    fileDeleted: false,
  };

  // 1. 读取当前设置 — 如果缺失或无效，返回不变
  let settings: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    settings = JSON.parse(raw);
  } catch (e: any) {
    // 文件不存在或 JSON 无效 → 没有需要撤销的内容
    return result;
  }

  // 2. 移除 hook 条目
  if (manifest.hooks.length > 0 && settings.hooks && typeof settings.hooks === 'object') {
    const hooks = settings.hooks as Record<string, unknown>;
    for (const hookEntry of manifest.hooks) {
      const eventName = hookEntry.event;
      const eventArr = hooks[eventName];
      if (!Array.isArray(eventArr)) continue;

      const filtered = eventArr.filter((group) => {
        return JSON.stringify(group) !== JSON.stringify(hookEntry.entry);
      });

      const removed = eventArr.length - filtered.length;
      if (removed > 0) {
        result.hooksRemoved += removed;
        result.changed = true;

        if (filtered.length === 0) {
          delete hooks[eventName];
        } else {
          hooks[eventName] = filtered;
        }
      }
    }

    // 清理空的 hooks 对象
    if (Object.keys(hooks).length === 0) {
      delete settings.hooks;
    }
  }

  // 3. 移除环境变量
  if (manifest.envVars.length > 0 && settings.env && typeof settings.env === 'object') {
    const env = settings.env as Record<string, string>;
    for (const { key, value } of manifest.envVars) {
      if (env[key] === value) {
        delete env[key];
        result.envVarsRemoved++;
        result.changed = true;
      }
    }

    // 清理空的 env 对象
    if (Object.keys(env).length === 0) {
      delete settings.env;
    }
  }

  // 4. 还原 autoMemoryEnabled
  if (manifest.autoMemoryEnabledSet && 'autoMemoryEnabled' in settings) {
    delete settings.autoMemoryEnabled;
    result.autoMemoryEnabledReverted = true;
    result.changed = true;
  }

  // 5. 移除权限条目（向后兼容：旧清单可能包含 permissions 字段）
  // Claude 的 settings.json 将权限存储在 permissions.allow / permissions.deny 下（嵌套）
  if (
    (manifest.permissionsAllow?.length ?? 0) > 0 &&
    settings.permissions &&
    typeof settings.permissions === 'object'
  ) {
    const perms = settings.permissions as Record<string, unknown>;
    if (Array.isArray(perms.allow)) {
      const allow = perms.allow as string[];
      const manifestAllowSet = new Set(manifest.permissionsAllow ?? []);
      const filtered = allow.filter((entry) => !manifestAllowSet.has(entry));
      result.permissionsAllowRemoved = allow.length - filtered.length;
      if (result.permissionsAllowRemoved > 0) {
        result.changed = true;
        if (filtered.length === 0) {
          delete perms.allow;
        } else {
          perms.allow = filtered;
        }
      }
    }
  }

  if (
    (manifest.permissionsDeny?.length ?? 0) > 0 &&
    settings.permissions &&
    typeof settings.permissions === 'object'
  ) {
    const perms = settings.permissions as Record<string, unknown>;
    if (Array.isArray(perms.deny)) {
      const deny = perms.deny as string[];
      const manifestDenySet = new Set(manifest.permissionsDeny ?? []);
      const filtered = deny.filter((entry) => !manifestDenySet.has(entry));
      result.permissionsDenyRemoved = deny.length - filtered.length;
      if (result.permissionsDenyRemoved > 0) {
        result.changed = true;
        if (filtered.length === 0) {
          delete perms.deny;
        } else {
          perms.deny = filtered;
        }
      }
    }
  }

  // 6. 清理空的 permissions 对象
  if (
    settings.permissions &&
    typeof settings.permissions === 'object' &&
    Object.keys(settings.permissions as Record<string, unknown>).length === 0
  ) {
    delete settings.permissions;
  }

  if (!result.changed) return result;

  if (dryRun) return result;

  // 7. 检查 settings 是否有效为空（仅剩 $schema 或完全为空）
  // 注意：即使只剩 $schema 或为空对象，也不应在非 purge 模式下删除文件。
  // 删除整个文件过于激进——purge 模式下由 reverse-purge-settings section 负责删除。
  const keysWithoutSchema = Object.keys(settings).filter((k) => k !== '$schema');
  if (keysWithoutSchema.length === 0) {
    // 仅保留 $schema 或为空 — 写回文件而非删除
    // （purge 模式下由专门的 reverse-purge-settings section 处理删除）
    atomicWriteFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', {
      tmpSuffix: '.reverse.tmp',
      validate: (tmpPath) => {
        try {
          JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
          return true;
        } catch {
          return false;
        }
      },
    });
    return result;
  }

  // 8. 原子写入：临时文件 → 验证 → 重命名
  atomicWriteFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', {
    tmpSuffix: '.reverse.tmp',
    validate: (tmpPath) => {
      try {
        JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
        return true;
      } catch {
        return false;
      }
    },
  });

  return result;
}
