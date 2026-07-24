/**
 *
 * @internal — 内部辅助工具，不属于公共适配器 API。
 * EvoKit — settings.json 合并工具
 *
 * 将模板 settings.json 中的 hook 配置深度合并到
 * 现有用户 settings.json 中。仅添加缺失的 hook 事件——
 * 不会覆盖已有的 hook 或用户偏好。
 *
 * 替代 template/merge/merge-settings.js
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import fse from 'fs-extra';
import { replaceHomeInObject } from './replace-home.js';

export interface SettingsMergeResult {
  changed: boolean;
  reason?: string;
  /** 合并详情记录（用于清单收集） */
  detail?: {
    hooksAdded: Array<{ event: string; entry: Record<string, unknown> }>;
    envVarsAdded: Array<{ key: string; value: string }>;
    autoMemoryEnabledSet: boolean;
    /** 本次合并添加的 permissions.allow 规则 */
    permissionsAllowAdded: string[];
  };
}

/**
 *
 * @internal — 内部辅助工具，不属于公共适配器 API。
 * 将模板配置深度合并到现有 settings.json 中。
 *
 * 策略：
 * 1. Hooks — 仅添加用户设置中不存在的 hook 事件
 * 2. autoMemoryEnabled — 用户配置中缺失时设置
 * 3. env — 添加未设置的 env 变量（不会覆盖已有值）
 *
 * 通过临时文件 + 重命名实现原子写入，并创建 .bak.evokit 备份。
 */
export function mergeSettings(
  settingsPath: string,
  templatePath: string,
  homeDir: string = process.env.HOME || '',
  allowWorkflow: boolean = false,
): SettingsMergeResult {
  // 1. 读取现有设置
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      return { changed: false, reason: `文件未找到: ${settingsPath}` };
    }
    return { changed: false, reason: `无效 JSON: ${e.message}` };
  }

  // 2. 读取并解析模板（在 __HOME__ 替换之前解析，
  //    以避免 Windows 反斜杠问题——例如 C:\Users\x 在原始
  //    字符串中替换后会产生 \U 等无效 JSON 转义序列）
  let templateRaw: string;
  try {
    templateRaw = fs.readFileSync(templatePath, 'utf-8');
  } catch {
    return { changed: false, reason: `模板未找到: ${templatePath}` };
  }

  let template: Record<string, unknown>;
  try {
    template = JSON.parse(templateRaw);
  } catch (e: any) {
    return {
      changed: false,
      reason: `无效的模板 JSON: ${e.message}`,
    };
  }

  // 在已解析的对象中替换 __HOME__ — JSON.stringify 写入时
  // 会自动转义反斜杠，生成有效的 JSON。
  template = replaceHomeInObject(template, homeDir);

  let changed = false;

  // 清单收集的详情跟踪
  const detail: NonNullable<SettingsMergeResult['detail']> = {
    hooksAdded: [],
    envVarsAdded: [],
    autoMemoryEnabledSet: false,
    permissionsAllowAdded: [],
  };

  // 3. 合并 hooks — 仅添加缺失的 hook 事件
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
        // 记录添加事件中的每个匹配器组
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

  // 5. 环境变量 — 添加缺失项，不覆盖
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

  // 6. permissions.allow — 仅在 allowWorkflow: true 时合并
  if (allowWorkflow) {
    const tPerms = (template.permissions as Record<string, unknown>) || {};
    const tAllow = (tPerms.allow as string[]) || [];
    if (tAllow.length > 0) {
      const ePerms = (
        settings.permissions && typeof settings.permissions === 'object'
          ? { ...(settings.permissions as Record<string, unknown>) }
          : {}
      ) as Record<string, unknown>;
      const eAllow = (Array.isArray(ePerms.allow) ? ePerms.allow : []) as string[];
      const mAllow = [...eAllow];
      for (const rule of tAllow) {
        if (!mAllow.includes(rule)) {
          mAllow.push(rule);
          changed = true;
          detail.permissionsAllowAdded.push(rule);
        }
      }
      if (changed) {
        ePerms.allow = mAllow;
        settings.permissions = ePerms;
      }
    }
  }

  if (!changed) {
    return { changed: false, reason: 'SKIPPED' };
  }

  // 6. 原子写入：临时文件 → 备份 → 重命名
  const tmpPath = settingsPath + '.merge.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

  // 验证写入的 JSON
  try {
    JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
  } catch {
    fse.removeSync(tmpPath);
    return { changed: false, reason: '写入验证失败' };
  }

  const backupPath = settingsPath + '.bak.evokit';
  fse.removeSync(backupPath);
  try {
    fs.renameSync(settingsPath, backupPath);
  } catch (e: any) {
    fse.removeSync(tmpPath);
    return { changed: false, reason: `无法备份: ${e.message}` };
  }

  try {
    fs.renameSync(tmpPath, settingsPath);
  } catch (e: any) {
    // 回滚
    try {
      fs.renameSync(backupPath, settingsPath);
    } catch {
      // 备份也失败——灾难性错误
    }
    fse.removeSync(tmpPath);
    return { changed: false, reason: `无法写入: ${e.message}` };
  }

  fse.removeSync(settingsPath + '.bak.merge');
  return { changed: true, detail };
}
