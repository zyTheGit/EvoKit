// 记忆引擎 M1 水位线状态（T-M1.1）：~/.evokit/state.json 的读写与增量判定
// 契约见 docs/zh/MEMORY-ENGINE-IMPLEMENTATION-PLAN.md §2.3.6：
//   { "sources": { "<id>": { "lastRunAt", "counts": {events,files,skipped},
//       "files": { "<绝对路径>": { "size", "mtime", "hash" } } } } }

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

/** 空水位线结构 */
function emptyState() {
  return { sources: {} };
}

/**
 * 读取水位线 state.json。
 * - 文件不存在 → 空结构（首次全量扫描）
 * - JSON 损坏（解析失败或顶层不是对象）→ 先把原文备份为 <file>.bak-<ts>，再返回空结构（视为全量重扫）
 */
export function loadState(file) {
  if (!existsSync(file)) return emptyState();
  let raw;
  try {
    raw = readFileSync(file, 'utf-8');
  } catch {
    return emptyState(); // 读取失败按不存在处理，交给上层报告
  }
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('state.json 顶层必须是对象');
    if (!obj.sources || typeof obj.sources !== 'object' || Array.isArray(obj.sources)) obj.sources = {};
    return obj;
  } catch {
    // 损坏自愈：原文备份后按空状态处理（时间戳毫秒值保证不覆盖历史备份）
    try { copyFileSync(file, `${file}.bak-${Date.now()}`); } catch { /* 备份失败不阻塞主流程 */ }
    return emptyState();
  }
}

/** 原子保存：先写 <file>.tmp 再 rename 覆盖，避免写一半留下损坏的 state.json */
export function saveState(file, state) {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
  renameSync(tmp, file);
}

/** 文件指纹：size + mtimeMs + 内容 sha1 前 8 位 hex */
export function fileFingerprint(absPath) {
  const st = statSync(absPath);
  const hash = createHash('sha1').update(readFileSync(absPath)).digest('hex').slice(0, 8);
  return { size: st.size, mtime: st.mtimeMs, hash };
}

/**
 * 增量判定：fileList（[{path,size,mtime,hash}]，与适配器 files 输出同形）逐个与
 * state 中该 source 的已记录指纹比较；新路径或 size/mtime/hash 任一变化即 changed。
 * 返回 { changed: [...], unchanged: n }；空水位线时全部 changed（等价 --full 全量）。
 */
export function pickChangedFiles(state, sourceId, fileList) {
  const prev = (state && state.sources && state.sources[sourceId] && state.sources[sourceId].files) || {};
  const changed = [];
  let unchanged = 0;
  for (const f of fileList || []) {
    const old = prev[f.path];
    if (!old || old.size !== f.size || old.mtime !== f.mtime || old.hash !== f.hash) changed.push(f);
    else unchanged += 1;
  }
  return { changed, unchanged };
}

/** 写入/覆盖一个 source 的水位线记录（files 为指纹数组，内部转为路径映射存储） */
export function updateSource(state, sourceId, { files, counts, lastRunAt } = {}) {
  if (!state.sources || typeof state.sources !== 'object') state.sources = {};
  const map = {};
  for (const f of files || []) map[f.path] = { size: f.size, mtime: f.mtime, hash: f.hash };
  state.sources[sourceId] = {
    lastRunAt: lastRunAt || new Date().toISOString(),
    counts: counts || { events: 0, files: 0, skipped: 0 },
    files: map,
  };
  return state.sources[sourceId];
}
