/**
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

export interface SettingsMergeResult {
  changed: boolean;
  reason?: string;
}

/**
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

  // 2. Read template
  let templateRaw: string;
  try {
    templateRaw = fs.readFileSync(templatePath, 'utf-8');
  } catch {
    return { changed: false, reason: `Template not found: ${templatePath}` };
  }

  let template: Record<string, unknown>;
  try {
    template = JSON.parse(templateRaw.replace(/__HOME__/g, homeDir));
  } catch (e: any) {
    return {
      changed: false,
      reason: `Invalid template JSON after __HOME__ replacement: ${e.message}`,
    };
  }

  let changed = false;

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
    }
  }
  settings.env = mEnv;

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
  return { changed: true };
}
