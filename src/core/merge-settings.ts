/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * EvoKit — settings.json Merge Utility
 *
 * Deep-merges hook configurations from a template settings.json into an
 * existing user settings.json.  Only adds missing hook events — never
 * overwrites existing hooks or user preferences.
 *
 * Replaces template/merge/merge-settings.js
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import fse from 'fs-extra';
import { replaceHomeInObject } from './replace-home.js';

export interface SettingsMergeResult {
  changed: boolean;
  reason?: string;
  /** Detailed record of what was merged (for manifest collection) */
  detail?: {
    hooksAdded: Array<{ event: string; entry: Record<string, unknown> }>;
    envVarsAdded: Array<{ key: string; value: string }>;
    autoMemoryEnabledSet: boolean;
    permissionsAllow: string[];
    permissionsDeny: string[];
  };
}

/**
 *
 * @internal — Internal helper, not part of the public adapter API.
 * Deep-merge template settings into an existing settings.json.
 *
 * Strategy:
 * 1. Hooks — only add hook events NOT already present in user settings
 * 2. autoMemoryEnabled — set if missing from user config
 * 3. env — add env vars not already set (does NOT overwrite existing values)
 *
 * Writes atomically via temp file + rename, with a .bak.evokit backup.
 */
export function mergeSettings(
  settingsPath: string,
  templatePath: string,
  homeDir: string = process.env.HOME || '',
): SettingsMergeResult {
  // 1. Read existing settings
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      return { changed: false, reason: `File not found: ${settingsPath}` };
    }
    return { changed: false, reason: `Invalid JSON: ${e.message}` };
  }

  // 2. Read and parse template (before __HOME__ replacement to avoid
  //    Windows backslash issues — e.g. C:\Users\x produces invalid
  //    JSON escape sequences like \U when replaced in raw strings)
  let templateRaw: string;
  try {
    templateRaw = fs.readFileSync(templatePath, 'utf-8');
  } catch {
    return { changed: false, reason: `Template not found: ${templatePath}` };
  }

  let template: Record<string, unknown>;
  try {
    template = JSON.parse(templateRaw);
  } catch (e: any) {
    return {
      changed: false,
      reason: `Invalid template JSON: ${e.message}`,
    };
  }

  // Replace __HOME__ in parsed object — JSON.stringify will escape
  // backslashes automatically when writing, producing valid JSON.
  template = replaceHomeInObject(template, homeDir);

  let changed = false;

  // Detail tracking for manifest collection
  const detail: NonNullable<SettingsMergeResult['detail']> = {
    hooksAdded: [],
    envVarsAdded: [],
    autoMemoryEnabledSet: false,
    permissionsAllow: [],
    permissionsDeny: [],
  };

  // 3. Merge hooks — add only missing hook events
  const tHooks = (template.hooks as Record<string, unknown>) || {};
  if (Object.keys(tHooks).length > 0) {
    const eHooks = (
      settings.hooks && typeof settings.hooks === 'object'
        ? { ...(settings.hooks as Record<string, unknown>) }
        : {}
    ) as Record<string, unknown>;
    const mHooks = { ...eHooks };
    for (const [event, hooksList] of Object.entries(tHooks)) {
      if (!(event in eHooks)) {
        mHooks[event] = hooksList;
        changed = true;
        // Record each matcher group in the added event
        if (Array.isArray(hooksList)) {
          for (const entry of hooksList) {
            detail.hooksAdded.push({ event, entry: entry as Record<string, unknown> });
          }
        }
      }
    }
    if (changed) {
      settings.hooks = mHooks;
    }
  }

  // 4. autoMemoryEnabled
  const tAuto = template.autoMemoryEnabled !== false;
  if ((settings.autoMemoryEnabled as boolean | undefined) !== tAuto) {
    settings.autoMemoryEnabled = tAuto;
    changed = true;
    detail.autoMemoryEnabledSet = true;
  }

  // 5. Env vars — add missing, never overwrite
  const tEnv = (template.env as Record<string, string>) || {};
  const eEnv = (
    settings.env && typeof settings.env === 'object'
      ? { ...(settings.env as Record<string, string>) }
      : {}
  ) as Record<string, string>;
  const mEnv = { ...eEnv };
  for (const [k, v] of Object.entries(tEnv)) {
    if (!(k in eEnv)) {
      mEnv[k] = v as string;
      changed = true;
      detail.envVarsAdded.push({ key: k, value: v as string });
    }
  }
  settings.env = mEnv;

  // 6. Record permissions from template for manifest tracking
  //    (permissions are not merged — they're only set on fresh install —
  //    but we record them in the detail so the manifest knows what EvoKit owns)
  const tPerms = template.permissions as Record<string, unknown> | undefined;
  if (tPerms && typeof tPerms === 'object') {
    if (Array.isArray(tPerms.allow)) {
      detail.permissionsAllow = (tPerms.allow as string[]).map(String);
    }
    if (Array.isArray(tPerms.deny)) {
      detail.permissionsDeny = (tPerms.deny as string[]).map(String);
    }
  }

  if (!changed) {
    return { changed: false, reason: 'SKIPPED' };
  }

  // 6. Write atomically: tmp → backup → rename
  const tmpPath = settingsPath + '.merge.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

  // Validate written JSON
  try {
    JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
  } catch {
    fse.removeSync(tmpPath);
    return { changed: false, reason: 'Write validation failed' };
  }

  const backupPath = settingsPath + '.bak.evokit';
  fse.removeSync(backupPath);
  try {
    fs.renameSync(settingsPath, backupPath);
  } catch (e: any) {
    fse.removeSync(tmpPath);
    return { changed: false, reason: `Cannot backup: ${e.message}` };
  }

  try {
    fs.renameSync(tmpPath, settingsPath);
  } catch (e: any) {
    // Rollback
    try {
      fs.renameSync(backupPath, settingsPath);
    } catch {
      // Backup also failed — catastrophic
    }
    fse.removeSync(tmpPath);
    return { changed: false, reason: `Cannot write: ${e.message}` };
  }

  fse.removeSync(settingsPath + '.bak.merge');
  return { changed: true, detail };
}
