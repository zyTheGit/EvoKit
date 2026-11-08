// 引用计数（ADR 0009 §5 / 计划 §2.3.5）：references.jsonl 追加器
// 只追加、损坏行跳过；供索引滚动评分、forge 重复信号、月度体检使用

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

// 允许的引用事件类型（计划 §2.3.5）
export const REFERENCE_TYPES = ['recall', 'l2', 'review-update', 'forge-use'];

/**
 * 追加一条引用事件（JSONL，单行 JSON + \n）。
 * @param {string} file references.jsonl 路径
 * @param {{ type: string, cardId: string, note?: string }} ref
 * @returns {{ ts: string, type: string, cardId: string, note?: string }} 实际写入的记录
 */
export function appendReference(file, { type, cardId, note }) {
  if (!REFERENCE_TYPES.includes(type)) {
    throw new Error(`非法引用类型「${type}」，允许：${REFERENCE_TYPES.join('|')}`);
  }
  if (!cardId || typeof cardId !== 'string') throw new Error('cardId 不能为空');
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const rec = { ts: new Date().toISOString(), type, cardId };
  if (note !== undefined && note !== '') rec.note = String(note);
  appendFileSync(file, JSON.stringify(rec) + '\n', 'utf-8');
  return rec;
}

/**
 * 读取全部引用记录：逐行 JSON.parse，损坏行/空行跳过（不中断整个文件）。
 * @param {string} file
 * @returns {Array<{ ts: string, type: string, cardId: string, note?: string }>}
 */
export function readReferences(file) {
  if (!existsSync(file)) return [];
  const out = [];
  const lines = readFileSync(file, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() === '') continue;
    try {
      const rec = JSON.parse(line);
      if (rec && typeof rec === 'object' && rec.cardId) out.push(rec);
    } catch { // 单行畸形跳过，不中断
    }
  }
  return out;
}

/**
 * cardId → 最近引用时间（ISO 字符串字典序即时间序，同 UTC 格式）。
 * @param {string} file
 * @returns {Map<string, string>}
 */
export function lastRefMap(file) {
  const map = new Map();
  for (const rec of readReferences(file)) {
    const ts = String(rec.ts ?? '');
    const prev = map.get(rec.cardId);
    if (!prev || ts > prev) map.set(rec.cardId, ts);
  }
  return map;
}
