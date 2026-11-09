// web API：settings.json 读取与受控编辑（需求三次变更 FR-14）
// 写入安全链：JSON 解析 → 结构校验 → 时间戳备份 → 临时文件原子替换；仅支持全局 settings.json
// （项目级 settings.json 编辑不在本期范围；校验只拦「会破坏 EvoKit 解析」的结构错误，不做语义级校验）

import { copyFileSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { CONFIG_FILE } from '../../paths.js';
import { httpError } from '../respond.js';

/** 资源类型白名单（与 sync.js 的资源分派口径一致） */
const RESOURCE_TYPES = new Set(['text', 'symlink']);

/**
 * settings.json 结构校验：返回错误消息数组（空数组 = 通过）。
 * 只校验「解析层必需」的结构：agents/resources 数组形状与关键字段类型、prompts/knowledge 对象形状。
 */
export function validateSettings(parsed) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return ['顶层必须是 JSON 对象'];
  }
  const errors = [];
  if (parsed.agents !== undefined) {
    if (!Array.isArray(parsed.agents)) {
      errors.push('agents 必须是数组');
    } else {
      parsed.agents.forEach((a, i) => {
        const at = `agents[${i}]`;
        if (!a || typeof a !== 'object' || Array.isArray(a)) { errors.push(`${at} 必须是对象`); return; }
        if (typeof a.id !== 'string' || !a.id.trim()) errors.push(`${at}.id 必须是非空字符串`);
        if (a.cli !== undefined && (a.cli === null || typeof a.cli !== 'object' || Array.isArray(a.cli) || typeof a.cli.bin !== 'string')) {
          errors.push(`${at}.cli 若存在必须是对象且含字符串 bin`);
        }
      });
    }
  }
  if (parsed.resources !== undefined) {
    if (!Array.isArray(parsed.resources)) {
      errors.push('resources 必须是数组');
    } else {
      parsed.resources.forEach((r, i) => {
        const at = `resources[${i}]`;
        if (!r || typeof r !== 'object' || Array.isArray(r)) { errors.push(`${at} 必须是对象`); return; }
        if (typeof r.id !== 'string' || !r.id.trim()) errors.push(`${at}.id 必须是非空字符串`);
        if (!RESOURCE_TYPES.has(String(r.type))) errors.push(`${at}.type 必须是 text 或 symlink`);
        if (typeof r.source !== 'string' || !r.source.trim()) errors.push(`${at}.source 必须是非空字符串`);
        if (!Array.isArray(r.targets) || r.targets.length === 0 || r.targets.some((t) => typeof t !== 'string' || !t.trim())) {
          errors.push(`${at}.targets 必须是非空字符串数组`);
        }
      });
    }
  }
  for (const key of ['prompts', 'knowledge']) {
    if (parsed[key] !== undefined && (parsed[key] === null || typeof parsed[key] !== 'object' || Array.isArray(parsed[key]))) {
      errors.push(`${key} 必须是对象`);
    }
  }
  return errors;
}

/** GET /api/settings：返回 settings.json 全文（前端编辑器用） */
export function getSettings() {
  if (!existsSync(CONFIG_FILE)) throw httpError(404, `未找到配置文件：${CONFIG_FILE}`);
  return {
    file: CONFIG_FILE,
    raw: readFileSync(CONFIG_FILE, 'utf-8'),
    mtime: statSync(CONFIG_FILE).mtime.toISOString(),
  };
}

/** 时间戳后缀 YYYYMMDD-HHmmss（备份文件名用） */
function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * PUT /api/settings（body { raw }）：校验 → 备份 → 原子写。
 * 校验不过抛 400（附全部错误）；原文件未动。写入成功返回备份路径。
 */
export function putSettings(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw httpError(400, '请求体需含非空字符串字段 raw（settings.json 全文）');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw httpError(400, `JSON 解析失败：${e instanceof Error ? e.message : String(e)}`);
  }
  const errors = validateSettings(parsed);
  if (errors.length > 0) throw httpError(400, `结构校验未通过：${errors.join('；')}`);

  let backup = null;
  if (existsSync(CONFIG_FILE)) {
    backup = `${CONFIG_FILE}.bak-${stamp(new Date())}`;
    copyFileSync(CONFIG_FILE, backup);
  }
  // 原子替换：临时文件写完再 rename，进程中断不会留下半截 settings.json
  const tmp = `${CONFIG_FILE}.tmp-webedit`;
  writeFileSync(tmp, raw.endsWith('\n') ? raw : `${raw}\n`, 'utf-8');
  renameSync(tmp, CONFIG_FILE);
  return { saved: true, backup, bytes: Buffer.byteLength(raw, 'utf-8') };
}
