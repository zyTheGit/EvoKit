// web API：杂项端点的纯数据函数（context / recall 统计 / inventory 报告 / 采集概览）
// 纪律：不 import h3；只读；state.json 只输出聚合统计，绝不吐逐文件明细

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  EVOKIT_DIR,
  GLOBAL_SOURCE,
  KNOWLEDGE_DIR,
  PENDING_DIR,
  ARCHIVE_DIR,
  REJECTED_DIR,
  REFERENCES_FILE,
  STATE_FILE,
} from '../../paths.js';
import { listCards } from '../../knowledge-cards.js';
import { readReferences } from '../../references.js';
import { loadAgents } from '../../config.js';
import { httpError } from '../respond.js';

// inventory 报告默认目录（paths.js 未单独建常量，与 inventory --output 默认落点一致）
const REPORTS_DIR = join(EVOKIT_DIR, 'reports');

/** GET /api/context：全局偏好源全文 + 三入口目标清单 */
export function contextData() {
  if (!existsSync(GLOBAL_SOURCE)) throw httpError(404, `未找到全局偏好源：${GLOBAL_SOURCE}`);
  const agents = loadAgents();
  return {
    raw: readFileSync(GLOBAL_SOURCE, 'utf-8'),
    targets: agents.map((a) => ({ id: a.id, name: a.name, file: a.global })),
  };
}

/** 跨四区构建 id → 标题映射（召回统计展示用） */
function buildTitleMap() {
  const map = new Map();
  for (const dir of [KNOWLEDGE_DIR, PENDING_DIR, ARCHIVE_DIR, REJECTED_DIR]) {
    for (const card of listCards(dir)) map.set(card.id, String(card.front.title ?? ''));
  }
  return map;
}

/** GET /api/recall-stats：references.jsonl 聚合（按卡 Top + 按日分布） */
export function recallStats() {
  const refs = readReferences(REFERENCES_FILE);
  const titles = buildTitleMap();
  const byCardMap = new Map();
  for (const rec of refs) byCardMap.set(rec.cardId, (byCardMap.get(rec.cardId) || 0) + 1);
  const byCard = [...byCardMap.entries()]
    .map(([cardId, count]) => ({ cardId, title: titles.get(cardId) ?? '', count }))
    .sort((a, b) => b.count - a.count || a.cardId.localeCompare(b.cardId));
  const byDayMap = new Map();
  for (const rec of refs) {
    const day = String(rec.ts ?? '').slice(0, 10);
    if (day) byDayMap.set(day, (byDayMap.get(day) || 0) + 1);
  }
  const byDay = [...byDayMap.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));
  return { total: refs.length, byCard, byDay };
}

/** GET /api/reports：inventory 报告清单（新在前，文件名含时间戳） */
export function reportsList() {
  if (!existsSync(REPORTS_DIR)) return { reports: [] };
  const reports = [];
  for (const entry of readdirSync(REPORTS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
    const st = statSync(join(REPORTS_DIR, entry.name));
    reports.push({ name: entry.name, size: st.size, mtime: st.mtime.toISOString() });
  }
  reports.sort((a, b) => b.name.localeCompare(a.name));
  return { reports };
}

/** GET /api/reports/:name：报告原文（文件名白名单校验，防目录穿越） */
export function reportData(name) {
  if (!name || /[\\/]/.test(name) || name.includes('..') || !name.toLowerCase().endsWith('.md')) {
    throw httpError(404, `报告不存在：${name ?? ''}`);
  }
  if (!existsSync(REPORTS_DIR)) throw httpError(404, `报告不存在：${name}`);
  const files = readdirSync(REPORTS_DIR);
  if (!files.includes(name)) throw httpError(404, `报告不存在：${name}（reports/ 白名单校验未通过）`);
  return { name, raw: readFileSync(join(REPORTS_DIR, name), 'utf-8') };
}

/** GET /api/inbox：采集水位线聚合（9 源 × 计数；distill 缺失 → null） */
export function inboxData() {
  let state = {};
  if (existsSync(STATE_FILE)) {
    try {
      state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
      if (!state || typeof state !== 'object') state = {};
    } catch { state = {}; }
  }
  const sources = state.sources && typeof state.sources === 'object'
    ? Object.entries(state.sources).map(([id, v]) => ({
        id,
        events: v?.counts?.events ?? 0,
        files: v?.files && typeof v.files === 'object' ? Object.keys(v.files).length : 0,
        lastRunAt: v?.lastRunAt ?? null,
      }))
    : [];
  sources.sort((a, b) => a.id.localeCompare(b.id));
  const distill = state.distill && typeof state.distill === 'object'
    ? {
        filesTracked: state.distill.files && typeof state.distill.files === 'object'
          ? Object.keys(state.distill.files).length
          : 0,
        lastRunAt: state.distill.lastRunAt ?? null,
      }
    : null;
  return { sources, distill };
}
