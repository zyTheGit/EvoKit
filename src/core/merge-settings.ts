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
import path from 'node:path';
import fse from 'fs-extra';
import { replaceHomeInObject } from './replace-home.js';
import { atomicWriteFile } from './atomic-write.js';
import type { ManifestCollector } from './manifest-collector.js';

export interface SettingsMergeResult {
  changed: boolean;
  reason?: string;
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
 * 如果传入 collector，在合并过程中直接调用 collector.recordXxx() 记录
 * 本次新增的 hooks/env/autoMemory/permissions，省去 detail 中间对象。
 *
 * 当 `settingsPath` 对应的文件不存在或 JSON 无效时：
 * - 若 `allowCreate` 为 true（全新安装/损坏覆盖），将 settings 视为空对象 `{}`，
 *   合并模板全部内容并写入新文件，collector 记录所有条目；
 * - 否则返回 `{ changed: false }`（兼容旧行为）。
 *
 * 通过临时文件 + 重命名实现原子写入，并创建 .bak.evokit 备份。
 */
export function mergeSettings(
  settingsPath: string,
  templatePath: string,
  homeDir: string = process.env.HOME || '',
  allowWorkflow: boolean = false,
  collector?: ManifestCollector,
  allowCreate: boolean = false,
  replaceHome: boolean = true,
): SettingsMergeResult {
  // 1. 读取现有设置 — 支持 allowCreate 模式
  let settings: Record<string, unknown>;
  let isCreate = false;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch (e: any) {
    if (allowCreate) {
      // allowCreate 模式：文件不存在或无效 JSON，均视为空对象
      settings = {};
      isCreate = true;
    } else if (e.code === 'ENOENT') {
      return { changed: false, reason: `文件未找到: ${settingsPath}` };
    } else {
      return { changed: false, reason: `无效 JSON: ${e.message}` };
    }
  }

  // 2. 读取并解析模板（在 __HOME__ 替换之前解析，
  //    以避免 Windows 反斜杠问题——例如 C:\Users\x 在原始
  //    字符串替换后会产生 \U 等无效 JSON 转义序列）
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
  // 当 replaceHome 为 false 时保留原始模板（不替换 __HOME__），
  // 以支持不需要路径替换的 merge-settings section。
  if (replaceHome) {
    template = replaceHomeInObject(template, homeDir);
  }

  // isCreate 模式（全新安装/损坏覆盖）：直接写入完整模板，记录所有条目
  if (isCreate) {
    settings = { ...template };
    // 记录所有模板条目到清单
    if (collector) {
      const tHooks = (template.hooks as Record<string, unknown>) || {};
      if (typeof tHooks === 'object') {
        for (const [event, hooksList] of Object.entries(tHooks)) {
          if (Array.isArray(hooksList)) {
            for (const entry of hooksList) {
              collector.recordHook(event, entry as Record<string, unknown>);
            }
          }
        }
      }
      const tEnv = (template.env as Record<string, string>) || {};
      if (typeof tEnv === 'object') {
        for (const [key, value] of Object.entries(tEnv)) {
          collector.recordEnvVar(key, value);
        }
      }
      if ('autoMemoryEnabled' in template) {
        collector.recordAutoMemoryEnabled();
      }
      const tPerms = (template.permissions as Record<string, unknown>) || {};
      if (typeof tPerms === 'object' && Array.isArray(tPerms.allow)) {
        for (const rule of tPerms.allow as string[]) {
          collector.recordPermissionAllow(rule);
        }
      }
    }

    // 写入文件
    fse.ensureDirSync(path.dirname(settingsPath));
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    return { changed: true };
  }

  let changed = false;

  // 3. 合并 hooks — 对已存在的事件追加 EvoKit hook 组，否则新建
  //     Claude settings.json 的每个事件是数组，支持多个 hook 组（matcher 维度）。
  //     v1.0.3 起不再因事件已被用户占用而跳过，而是追加（去重，保证幂等）。
  const tHooks = (template.hooks as Record<string, unknown>) || {};
  if (Object.keys(tHooks).length > 0) {
    const eHooks = (
      settings.hooks && typeof settings.hooks === 'object'
        ? { ...(settings.hooks as Record<string, unknown>) }
        : {}
    ) as Record<string, unknown>;
    const mHooks = { ...eHooks };
    for (const [event, hooksList] of Object.entries(tHooks)) {
      if (!Array.isArray(hooksList)) continue;
      const existing = (eHooks[event] ?? []) as unknown[];
      // 过滤出尚未安装的 hook 组（按 JSON 精确比对去重，重装/升级时保持幂等）
      const existJson = new Set(existing.map((g) => JSON.stringify(g)));
      const toAdd = hooksList.filter((entry) => !existJson.has(JSON.stringify(entry)));
      if (existing.length === 0) {
        mHooks[event] = toAdd;
      } else if (toAdd.length > 0) {
        mHooks[event] = [...existing, ...toAdd];
      }
      if (toAdd.length > 0) {
        changed = true;
        // 记录新增的每个匹配器组
        for (const entry of toAdd) {
          collector?.recordHook(event, entry as Record<string, unknown>);
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
    collector?.recordAutoMemoryEnabled();
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
      collector?.recordEnvVar(k, v as string);
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
      let permsChanged = false;
      for (const rule of tAllow) {
        if (!mAllow.includes(rule)) {
          mAllow.push(rule);
          permsChanged = true;
          changed = true;
          collector?.recordPermissionAllow(rule);
        }
      }
      if (permsChanged) {
        ePerms.allow = mAllow;
        settings.permissions = ePerms;
      }
    }
  }

  if (!changed) {
    return { changed: false, reason: 'SKIPPED' };
  }

  // 7. 增量合并 —— 原子写入：临时文件 → 验证 → 备份 → 重命名
  const writeResult = atomicWriteFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', {
    tmpSuffix: '.merge.tmp',
    validate: (tmpPath) => {
      try {
        JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
        return true;
      } catch {
        return false;
      }
    },
    backup: '.bak.evokit',
  });

  if (!writeResult.ok) {
    return { changed: false, reason: writeResult.error! };
  }

  fse.removeSync(settingsPath + '.bak.merge');
  return { changed: true };
}
