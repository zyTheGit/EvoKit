/**
 * EvoKit — Reverse Settings.json Merge
 *
 * Reverses the settings.json merge performed during installation.
 * Removes EvoKit-added hook entries, env vars, autoMemoryEnabled,
 * and permissions entries, while preserving any user-added values.
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import fse from 'fs-extra';
import type { AdapterManifest } from './manifest.js';

/** Result of reversing a settings.json merge */
export interface ReverseMergeResult {
  /** Whether any changes were made (or would be made in dry-run) */
  changed: boolean;
  /** Number of hook matcher groups removed */
  hooksRemoved: number;
  /** Number of env vars removed */
  envVarsRemoved: number;
  /** Whether autoMemoryEnabled was reverted */
  autoMemoryEnabledReverted: boolean;
  /** Number of permissions allow entries removed */
  permissionsAllowRemoved: number;
  /** Number of permissions deny entries removed */
  permissionsDenyRemoved: number;
  /** If the file was deleted because it became empty */
  fileDeleted: boolean;
}

/**
 * Reverse the settings.json merge — remove EvoKit-added entries.
 *
 * Compares entries precisely using JSON.stringify for hook matcher groups,
 * and exact key+value match for env vars.  Preserves any user-added values.
 * If the file becomes effectively empty (only `$schema` remains), deletes it.
 * Writes atomically via temp file + rename.
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

  // 1. Read current settings — if missing or invalid, return unchanged
  let settings: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    settings = JSON.parse(raw);
  } catch (e: any) {
    // File doesn't exist or invalid JSON → nothing to reverse
    return result;
  }

  // 2. Remove hook entries
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

    // Clean up empty hooks object
    if (Object.keys(hooks).length === 0) {
      delete settings.hooks;
    }
  }

  // 3. Remove env vars
  if (manifest.envVars.length > 0 && settings.env && typeof settings.env === 'object') {
    const env = settings.env as Record<string, string>;
    for (const { key, value } of manifest.envVars) {
      if (env[key] === value) {
        delete env[key];
        result.envVarsRemoved++;
        result.changed = true;
      }
    }

    // Clean up empty env object
    if (Object.keys(env).length === 0) {
      delete settings.env;
    }
  }

  // 4. Revert autoMemoryEnabled
  if (manifest.autoMemoryEnabledSet && 'autoMemoryEnabled' in settings) {
    delete settings.autoMemoryEnabled;
    result.autoMemoryEnabledReverted = true;
    result.changed = true;
  }

  // 5. Remove permissions entries
  // Claude's settings.json stores permissions under permissions.allow / permissions.deny (nested)
  if (
    manifest.permissionsAllow.length > 0 &&
    settings.permissions &&
    typeof settings.permissions === 'object'
  ) {
    const perms = settings.permissions as Record<string, unknown>;
    if (Array.isArray(perms.allow)) {
      const allow = perms.allow as string[];
      const manifestAllowSet = new Set(manifest.permissionsAllow);
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
    manifest.permissionsDeny.length > 0 &&
    settings.permissions &&
    typeof settings.permissions === 'object'
  ) {
    const perms = settings.permissions as Record<string, unknown>;
    if (Array.isArray(perms.deny)) {
      const deny = perms.deny as string[];
      const manifestDenySet = new Set(manifest.permissionsDeny);
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

  // 6. Clean up empty permissions object
  if (
    settings.permissions &&
    typeof settings.permissions === 'object' &&
    Object.keys(settings.permissions as Record<string, unknown>).length === 0
  ) {
    delete settings.permissions;
  }

  if (!result.changed) return result;

  if (dryRun) return result;

  // 7. Check if settings is effectively empty (only $schema remains)
  const keysWithoutSchema = Object.keys(settings).filter((k) => k !== '$schema');
  if (keysWithoutSchema.length === 0) {
    fse.removeSync(settingsPath);
    result.fileDeleted = true;
    return result;
  }

  // 8. Write atomically: tmp → rename
  const tmpPath = settingsPath + '.reverse.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

  // Validate written JSON
  try {
    JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
  } catch {
    /* written JSON is corrupt — discard temp file and abort write */
    fse.removeSync(tmpPath);
    return result;
  }

  try {
    fs.renameSync(tmpPath, settingsPath);
  } catch {
    /* atomic rename failed (cross-device or permissions) — discard temp file */
    fse.removeSync(tmpPath);
  }

  return result;
}
