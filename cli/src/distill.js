// distill 提纯引擎（T-M2.2 分批器 + T-M2.3 委托执行与解析容错）
// 流程：inbox RawEvent → project×时间窗分批 → 阶段A 抽卡（委托 agent）→ 阶段B 裁决 → .pending 草稿
// 水位线：无显式范围时按 state.distill.files 游标只取各 inbox 文件新增行（harvest 追加写保证行号稳定）；
//   显式范围（events 注入 / --session）不走水位线；批次失败不推进，下次整箱重试（阶段 B 去重兜底）。
// 纪律：解析三段容错（整体 JSON → 逐块 {...} → orphan 落盘，绝不丢弃，FR-06）；
//       source 必须命中本批文件清单（防幻觉来源）；prompt 模板含委托纪律（红线 #9）。

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INBOX_DIR, KNOWLEDGE_DIR, ORPHAN_DIR, PENDING_DIR, STATE_FILE } from './paths.js';
import { loadState, saveState } from './state.js';
import { CARD_TYPES, listCards, writeCard } from './knowledge-cards.js';
import { detectAgentClis, runAgentCli } from './agents-cli.js';
import { loadEngineConfig } from './commands/harvest.js';
import { DEFAULT_PROMPTS } from './defaults.js';

/** 单批产卡上限（写入 prompt 的纪律条目，计划 T-M2.2） */
export const MAX_CARDS_PER_BATCH = 10;

// ── 分批器（T-M2.2）──

/**
 * 会话分组：有 sessionId 的按 project|sessionId 聚合；无 sessionId 的事件（memory-card、daily-log 等）
 * 每条自成一个会话（按 file:line 定位）。返回按 project + 最新事件时间排序的会话数组。
 * @param {Array<{ project?: string, sessionId?: string, ts?: string, text: string, meta?: { file?: string, line?: number } }>} events
 */
export function groupSessions(events) {
  const map = new Map();
  for (const ev of events) {
    const sid = typeof ev.sessionId === 'string' ? ev.sessionId : '';
    const project = typeof ev.project === 'string' ? ev.project : '';
    const file = ev.meta && ev.meta.file ? String(ev.meta.file) : '';
    const line = ev.meta && ev.meta.line !== undefined ? ev.meta.line : '';
    const key = sid ? `s|${project}|${sid}` : `e|${file}|${line}`;
    let s = map.get(key);
    if (!s) {
      s = { key, project, sessionId: sid, events: [], files: new Set(), tsMax: '' };
      map.set(key, s);
    }
    s.events.push(ev);
    if (file) s.files.add(file);
    const ts = String(ev.ts || '');
    if (ts > s.tsMax) s.tsMax = ts;
  }
  const sessions = [...map.values()];
  // 时间窗 = 同 project 内按最新事件时间顺序排序后的连续切块
  sessions.sort((a, b) => a.project.localeCompare(b.project) || a.tsMax.localeCompare(b.tsMax) || a.key.localeCompare(b.key));
  return sessions;
}

/** UTF-8 字节截断：保头部逐步收缩（事件文本量级小，够用） */
function truncateUtf8(str, maxBytes) {
  let s = String(str);
  while (s.length > 0 && Buffer.byteLength(s, 'utf8') > maxBytes) {
    s = s.slice(0, Math.max(0, Math.floor(s.length * 0.9)));
  }
  return s;
}

/** 渲染单会话文本（含来源标注，供阶段 A 的 evidence 引用）；capBytes > 0 时截断 */
function renderSessionText(s, capBytes) {
  const files = [...s.files].join(', ');
  const meta = [s.project ? `project: ${s.project}` : '', s.tsMax ? `最新: ${s.tsMax}` : '', files ? `来源: ${files}` : '']
    .filter(Boolean).join('；');
  const header = `### 会话 ${s.key}${meta ? `（${meta}）` : ''}\n`;
  const text = header + s.events.map((ev) => String(ev.text || '')).join('\n---\n');
  if (capBytes > 0 && Buffer.byteLength(text, 'utf8') > capBytes) {
    return truncateUtf8(text, capBytes) + '\n…[本会话超限截断]';
  }
  return text;
}

/** 渲染整批文本；单会话批为模板预留 2KB 空间做截断，多会话批不截断交给尺寸二分 */
function renderBatchText(chunk, limitBytes) {
  const cap = chunk.length === 1 ? Math.max(1024, limitBytes - 2048) : 0;
  return chunk.map((s) => renderSessionText(s, cap)).join('\n\n');
}

/**
 * 分批：project 内按时间顺序切块（每块 ≤ maxSessions 个会话，即一个连续时间窗）；
 * 拼批后超 maxPromptKB 的继续二分拆批；单会话超限截断文本（保头部 + 截断标记）。
 * @returns {Array<{ project: string, sessions: Array, text: string, files: string[] }>}
 */
export function makeBatches(events, { maxSessions = 8, maxPromptKB = 24 } = {}) {
  const limitBytes = Math.max(1, Number(maxPromptKB) || 24) * 1024;
  const maxSess = Math.max(1, Number(maxSessions) || 8);
  const sessions = groupSessions(events);
  const batches = [];

  const flush = (chunk, project) => {
    const text = renderBatchText(chunk, limitBytes);
    if (Buffer.byteLength(text, 'utf8') <= limitBytes || chunk.length === 1) {
      const files = new Set();
      for (const s of chunk) s.files.forEach((f) => files.add(f));
      batches.push({ project, sessions: chunk, text, files: [...files] });
      return;
    }
    const mid = Math.ceil(chunk.length / 2);
    flush(chunk.slice(0, mid), project);
    flush(chunk.slice(mid), project);
  };

  let i = 0;
  while (i < sessions.length) {
    const project = sessions[i].project;
    let j = i;
    while (j < sessions.length && sessions[j].project === project && j - i < maxSess) j += 1;
    flush(sessions.slice(i, j), project);
    i = j;
  }
  return batches;
}

// ── 解析容错三段（T-M2.3 / FR-06）──

/**
 * 从 agent 输出提取 JSON 对象数组：
 *   ① 整体 JSON.parse（数组，或含 cards/items/result/data 数组的对象）
 *   ② 括号配平逐块提取 {...}（字符串感知，引号内的括号不破坏配平）
 *   ③ 都失败 → items 为空（调用方负责把原文写 orphan，绝不丢弃）
 * @returns {{ items: object[], strategy: 'whole' | 'blocks' | 'none' }}
 */
export function parseLooseJsonArray(text) {
  const items = [];
  if (typeof text !== 'string' || !text.trim()) return { items, strategy: 'none' };
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  // ① 整体解析
  try {
    const v = JSON.parse(t);
    if (Array.isArray(v)) return { items: v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)), strategy: 'whole' };
    if (v && typeof v === 'object') {
      for (const k of ['cards', 'items', 'result', 'data']) {
        if (Array.isArray(v[k])) return { items: v[k].filter((x) => x && typeof x === 'object' && !Array.isArray(x)), strategy: 'whole' };
      }
    }
  } catch { /* 进入逐块提取 */ }
  // ② 括号配平逐块提取
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          const seg = t.slice(start, i + 1);
          try {
            const v = JSON.parse(seg);
            if (v && typeof v === 'object' && !Array.isArray(v)) items.push(v);
          } catch { /* 单块坏 JSON 跳过 */ }
          start = -1;
        }
      }
    }
  }
  return { items, strategy: items.length > 0 ? 'blocks' : 'none' };
}

let orphanSeq = 0;

/** 原始输出落盘 orphan：.pending/orphan/<ts>-<n>.txt（绝不丢弃）；返回写入路径 */
export function writeOrphan(rawText, ts = stampMs()) {
  mkdirSync(ORPHAN_DIR, { recursive: true });
  orphanSeq += 1; // 同一次运行内递增；跨运行靠 ts（含毫秒）区分
  const file = join(ORPHAN_DIR, `${ts}-${orphanSeq}.txt`);
  writeFileSync(file, String(rawText ?? ''), 'utf-8');
  return file;
}

/** 时间戳：YYYYMMDD-HHmmssSSS（文件名安全，含毫秒防撞） */
function stampMs() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`;
}

// ── 既有候选粗筛（阶段 B 输入，T-M2.3）──

/** 标题分词：常见分隔符切分（中英文通用，粗筛够用） */
function titleTokens(title) {
  return String(title || '').split(/[\s,，。;；、:：!！?？()[\]{}"'`~\-_/\\|]+/u).filter(Boolean);
}

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

/**
 * 为一批新卡挑选既有卡摘要（tags 倒排计分 + 标题 Jaccard，共享 tag ×2 + Jaccard，≤limit 条去重）。
 * @param {Array<{ title: string, tags: string[] }>} newCards 清洗后的新卡
 * @param {Array<{ id: string, front: object }>} confirmedCards 既有 confirmed 卡
 */
export function pickCandidates(newCards, confirmedCards, limit = 20) {
  const picked = new Map(); // id → { card, score }
  for (const nc of newCards) {
    const ntags = new Set((Array.isArray(nc.tags) ? nc.tags : []).map(String));
    const ntok = titleTokens(nc.title);
    for (const c of confirmedCards) {
      const ctags = Array.isArray(c.front.tags) ? c.front.tags.map(String) : [];
      const shared = ctags.filter((t) => ntags.has(t)).length;
      const jac = jaccard(titleTokens(String(c.front.title || '')), ntok);
      const score = shared * 2 + jac;
      if (score <= 0) continue;
      const prev = picked.get(c.id);
      if (!prev || prev.score < score) picked.set(c.id, { card: c, score });
    }
  }
  return [...picked.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit))
    .map((x) => x.card);
}

/** 既有卡摘要行：`- [id] 标题（type, confidence=x）#tag1 #tag2` */
export function summarizeCard(card) {
  const tags = Array.isArray(card.front.tags) ? card.front.tags.map((t) => `#${t}`).join(' ') : '';
  const conf = card.front.confidence !== undefined ? `confidence=${card.front.confidence}` : 'confidence=-';
  return `- [${card.id}] ${card.front.title}（${card.front.type || '-'}, ${conf}）${tags ? ' ' + tags : ''}`;
}

// ── 卡片清洗与落盘 ──

/**
 * 清洗 agent 产出的一张卡：字段补齐、枚举纠偏、置信度钳制。
 * @returns {{ error: string } | { title, statement, type, confidence, tags, evidence, source, suspect }}
 */
function sanitizeCard(raw, batchFileSet) {
  const title = String(raw.title || '').trim();
  const statement = String(raw.statement || raw.description || '').trim();
  if (!title) return { error: '缺 title' };
  if (!statement) return { error: '缺 statement' };
  let type = String(raw.type || '').trim();
  if (!CARD_TYPES.includes(type)) type = 'fact';
  let confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  confidence = Math.min(1, Math.max(0, confidence));
  const tags = (Array.isArray(raw.tags) ? raw.tags : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 8);
  const evidence = (Array.isArray(raw.evidence) ? raw.evidence : []).map((e) => String(e).trim()).filter(Boolean);
  const source = String(raw.source || evidence[0] || '').trim();
  if (!source) return { error: '缺 source（红线 #10：只认带来源的卡）' };
  // 防幻觉来源：source 必须命中本批文件清单，否则打 suspect 标记仍写入（留人工审）
  const suspect = !batchFileSet.has(source);
  return { title, statement, type, confidence, tags, evidence, source, suspect };
}

function slugify(title) {
  let s = String(title || '').trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  if (s.length > 40) s = s.slice(0, 40).replace(/-+$/, '');
  return s || 'card';
}

/** .pending 内唯一草稿 id：`<YYYYMMDD-HHmmss>-<slug>`（writeCard 以 front.id 命名文件） */
function uniquePendingId(base) {
  let name = base;
  let i = 2;
  while (existsSync(join(PENDING_DIR, `${name}.md`))) {
    name = `${base}-${i}`;
    i += 1;
  }
  return name;
}

function stampSeconds() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 草稿落盘 .pending/<ts>-<slug>.md：status=draft，confidence/related/tags/source 全带 */
function writePendingDraft(clean, verdictInfo) {
  const id = uniquePendingId(`${stampSeconds()}-${slugify(clean.title)}`);
  const related = [...new Set([
    ...((verdictInfo.related || []).map(String)),
    ...(verdictInfo.oldId ? [String(verdictInfo.oldId)] : []),
    ...(verdictInfo.mergeInto ? [String(verdictInfo.mergeInto)] : []),
  ])].filter(Boolean);
  const front = {
    id,
    title: clean.title,
    type: clean.type,
    status: 'draft',
    source: clean.source,
    confidence: clean.confidence,
    updated: new Date().toISOString(),
    verdict: verdictInfo.verdict || 'ADD',
  };
  if (clean.tags.length > 0) front.tags = clean.tags;
  if (clean.evidence.length > 0) front.evidence = clean.evidence;
  if (related.length > 0) front.related = related;
  if (verdictInfo.oldId) front.oldId = String(verdictInfo.oldId);
  if (verdictInfo.mergeInto) front.mergeInto = String(verdictInfo.mergeInto);
  if (verdictInfo.change) front.change = String(verdictInfo.change);
  if (clean.suspect) front.suspect = true;
  writeCard(PENDING_DIR, { front, body: clean.statement });
  return id;
}

// ── inbox 读取 ──

/** 读取全部 inbox RawEvent：~/.evokit/inbox/<source>/*.jsonl 逐行解析，畸形行计数跳过 */
export function readInboxEvents() {
  const events = [];
  let malformed = 0;
  if (!existsSync(INBOX_DIR)) return { events, malformed };
  let sources;
  try {
    sources = readdirSync(INBOX_DIR, { withFileTypes: true });
  } catch {
    return { events, malformed };
  }
  for (const ent of sources) {
    if (!ent.isDirectory()) continue;
    const dir = join(INBOX_DIR, ent.name);
    let files;
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      let content = '';
      try {
        content = readFileSync(join(dir, f), 'utf-8');
      } catch {
        continue;
      }
      for (const line of content.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        try {
          const obj = JSON.parse(t);
          if (obj && typeof obj === 'object' && typeof obj.text === 'string' && obj.text) events.push(obj);
        } catch {
          malformed += 1;
        }
      }
    }
  }
  events.sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')));
  return { events, malformed };
}

/** distill 水位线游标表（懒初始化）：state.distill = { files: { "<inbox 文件绝对路径>": <已处理行数> } } */
function distillCursorMap(state) {
  if (!state.distill || typeof state.distill !== 'object' || Array.isArray(state.distill)) state.distill = {};
  if (!state.distill.files || typeof state.distill.files !== 'object' || Array.isArray(state.distill.files)) state.distill.files = {};
  return state.distill.files;
}

/**
 * 水位线增量读取 inbox（全量增量路径专用）：递归遍历 INBOX_DIR 下各 source 目录的 *.jsonl，
 * 逐文件数总行数，只解析「已记录行数之后」的新行为 RawEvent；未记录过的文件从第 0 行起。
 * inbox 文件由 harvest 追加写（每行一个事件、\n 结尾），行号稳定，行数即游标；损坏行照旧计数跳过。
 * 顺带清理已不存在文件的键（inbox 超 inboxRetentionDays 清理后的残留），是否落盘由调用方决定。
 * @param {object} state loadState 产物（就地读写 distill.files；只动 distill 键，不碰 sources）
 * @returns {{ events: object[], malformed: number, touched: Map<string, number>, pruned: number }}
 *   touched: 本次遍历到的文件 绝对路径 → 当前总行数（处理成功后写回游标）；pruned: 清理的残留键数
 */
export function readNewInboxEvents(state) {
  const events = [];
  let malformed = 0;
  let pruned = 0;
  const touched = new Map();
  const cursors = distillCursorMap(state);
  // 先清已不存在文件的键（后续任何早退都不漏清理；真正落盘由调用方决定）
  for (const k of Object.keys(cursors)) {
    if (!existsSync(k)) {
      delete cursors[k];
      pruned += 1;
    }
  }
  if (!existsSync(INBOX_DIR)) return { events, malformed, touched, pruned };
  let sources;
  try {
    sources = readdirSync(INBOX_DIR, { withFileTypes: true });
  } catch {
    return { events, malformed, touched, pruned };
  }
  for (const ent of sources) {
    if (!ent.isDirectory()) continue;
    const dir = join(INBOX_DIR, ent.name);
    let files;
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const abs = join(dir, f);
      let content = '';
      try {
        content = readFileSync(abs, 'utf-8');
      } catch {
        continue;
      }
      const lines = content.split(/\r?\n/);
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop(); // 去掉结尾换行产生的空段
      const total = lines.length;
      touched.set(abs, total);
      // 已记录行数超过当前总行数（文件被重写/截断，违反追加写假设）→ 从头重读，宁多勿漏
      const from = Number.isInteger(cursors[abs]) && cursors[abs] >= 0 && cursors[abs] <= total ? cursors[abs] : 0;
      for (let i = from; i < total; i++) {
        const t = lines[i].trim();
        if (!t) continue;
        try {
          const obj = JSON.parse(t);
          if (obj && typeof obj === 'object' && typeof obj.text === 'string' && obj.text) events.push(obj);
        } catch {
          malformed += 1;
        }
      }
    }
  }
  events.sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')));
  return { events, malformed, touched, pruned };
}

// ── 执行者链 ──

/**
 * 解析 distill 执行者：--agent 显式覆盖（允许 claude，打印超时风险）；否则按
 * knowledge.distillAgentOrder 收集探测可用的执行者（claude 不进自动链），运行时按链降级。
 * @returns {{ ok: true, chain: object[] } | { ok: false, error: string }}
 */
export function resolveDistillAgent(agentOverride, order, clis) {
  if (agentOverride) {
    const def = clis.find((c) => c.id === agentOverride);
    if (!def) {
      return { ok: false, error: `未知执行者「${agentOverride}」，可用：${clis.map((c) => c.id).join(', ') || '（无）'}` };
    }
    if (agentOverride === 'claude') {
      console.log('⚠ claude 不在自动执行者链（长 prompt 超时 bug，见交接文档）；已按 --agent 显式指定，注意超时风险。');
    }
    if (!def.available) return { ok: false, error: `${agentOverride} 的 CLI 不可用（未检测到可执行文件）` };
    return { ok: true, chain: [def] };
  }
  const chain = (Array.isArray(order) && order.length > 0 ? order : ['codex', 'pi'])
    .filter((id) => id !== 'claude')
    .map((id) => clis.find((c) => c.id === id))
    .filter((c) => c && c.available);
  return { ok: true, chain };
}

/** 模板占位符替换：{key} → vars[key]；未提供的占位符保留原文 */
export function renderPrompt(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

/** 按链顺序调用 agent，首个成功即返回（执行者降级，计划 §2.4） */
function runWithChain(chain, prompt) {
  let lastErr = '';
  for (const def of chain) {
    const r = runAgentCli(def, prompt);
    if (r.ok) return { ...r, agentId: def.id };
    lastErr = r.error || '未知错误';
  }
  return { ok: false, error: lastErr };
}

/**
 * 执行一轮提纯（learn 与测试共用入口）。
 * @param {{ agent?: string | null, session?: string | null, events?: Array | null, quiet?: boolean }} options
 *   agent    显式执行者 id（跳过降级链；允许 claude，打印超时风险）
 *   session  只提纯指定 sessionId 的事件（meta.sessionId / 顶层 sessionId 均匹配）
 *   events   直接给定事件（测试注入 / learn 会话过滤路径；显式范围，不推进水位线）
 *   quiet    不打印报告块
 *   events 缺省且无 session 时为全量增量路径：按 state.distill 水位线只读各 inbox 文件新增行，
 *   处理完成后把涉及文件游标累加写回（批次失败则不推进，下次整箱重试）。
 * @returns {{ ok: boolean, reason?: string, note?: string, batches: number, drafts: number, suspects: number,
 *             orphans: number, noops: number, invalid: number, failedBatches: number, malformed: number,
 *             agentId: string | null, notes: string[], durationMs: number, advanced: boolean }}
 */
export function runDistill(options = {}) {
  const { agent = null, session = null, events = null, quiet = false } = options;
  const startedAt = Date.now();
  const { config, knowledge } = loadEngineConfig();
  const tplA = (config.prompts && config.prompts.distillA) || DEFAULT_PROMPTS.distillA;
  const tplB = (config.prompts && config.prompts.distillB) || DEFAULT_PROMPTS.distillB;
  const report = {
    ok: true, batches: 0, drafts: 0, suspects: 0, orphans: 0, noops: 0,
    invalid: 0, failedBatches: 0, malformed: 0, agentId: null, notes: [], durationMs: 0, advanced: false,
  };

  // 1. 事件：三路取数——events 数组（注入/会话过滤，显式范围不动水位线）；--session 直调（全量读，
  //    显式范围要能看到全部历史，不走水位线）；其余 = 全量增量（learn 无 triggers/--session）：
  //    按水位线只读新增行，处理完成后推进
  let allEvents;
  let wm = null; // 全量增量路径上下文：收尾时推进 state.distill 水位线
  if (Array.isArray(events)) {
    allEvents = events;
  } else if (session) {
    const r = readInboxEvents();
    allEvents = r.events;
    report.malformed = r.malformed;
  } else {
    const state = loadState(STATE_FILE);
    const r = readNewInboxEvents(state);
    allEvents = r.events;
    report.malformed = r.malformed;
    wm = { state, touched: r.touched, pruned: r.pruned };
  }
  if (session) {
    allEvents = allEvents.filter((ev) => ev.sessionId === session || (ev.meta && ev.meta.sessionId === session));
  }
  if (allEvents.length === 0) {
    // 增量路径空转：只把顺带清理掉的残留键落盘，游标一律不推进
    if (wm && wm.pruned > 0) {
      try { saveState(STATE_FILE, wm.state); } catch { /* 落盘失败留待下次清理 */ }
    }
    report.note = '无待提纯事件';
    if (!quiet) console.log('⚗ distill — 无待提纯事件，跳过。');
    report.durationMs = Date.now() - startedAt;
    return report;
  }

  // 2. 分批
  const batches = makeBatches(allEvents, knowledge);
  report.batches = batches.length;

  // 3. 执行者链
  const clis = detectAgentClis();
  const chainRes = resolveDistillAgent(agent, knowledge.distillAgentOrder, clis);
  if (!chainRes.ok) {
    report.ok = false;
    report.reason = chainRes.error;
    if (!quiet) console.log(`✗ distill — ${chainRes.error}`);
    report.durationMs = Date.now() - startedAt;
    return report;
  }
  if (chainRes.chain.length === 0) {
    report.ok = false;
    report.reason = 'no-agent';
    if (!quiet) {
      console.log('✗ distill — 无可用执行者（distillAgentOrder 内均未检测到 CLI）');
      console.log('  降级方案：把 settings prompts.distillA / prompts.distillB 模板手动喂给任意本机 agent，按 JSON 约定产出后人工建卡；');
      console.log('  或在 settings.json 的 agents[].cli 配置 codex/pi 的 CLI 调用后重试 learn。');
    }
    report.durationMs = Date.now() - startedAt;
    return report;
  }

  // 4. 既有 confirmed 卡（阶段 B 候选池，整轮读一次）
  const confirmed = listCards(KNOWLEDGE_DIR, { excludeHidden: true })
    .filter((c) => c.front.status === 'confirmed');

  // 5. 逐批：阶段 A 抽卡 → 阶段 B 裁决 → 草稿落盘
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const batchFileSet = new Set(batch.files);
    const promptA = renderPrompt(tplA, { events: batch.text });
    const resA = runWithChain(chainRes.chain, promptA);
    if (!resA.ok) {
      report.failedBatches += 1;
      report.notes.push(`批次 ${bi + 1} 阶段A 失败：${resA.error}`);
      continue;
    }
    report.agentId = resA.agentId;
    const parsedA = parseLooseJsonArray(resA.output);
    if (parsedA.items.length === 0) {
      const f = writeOrphan(resA.output);
      report.orphans += 1;
      report.notes.push(`批次 ${bi + 1} 阶段A 无法解析 → orphan ${f}`);
      continue;
    }
    // 清洗 + 超上限丢弃计数
    const cleans = [];
    const overflow = parsedA.items.slice(MAX_CARDS_PER_BATCH);
    for (const raw of parsedA.items.slice(0, MAX_CARDS_PER_BATCH)) {
      const c = sanitizeCard(raw, batchFileSet);
      if (c.error) {
        report.invalid += 1;
        report.notes.push(`批次 ${bi + 1} 丢弃 1 张卡：${c.error}`);
        continue;
      }
      cleans.push(c);
    }
    if (overflow.length > 0) {
      report.invalid += overflow.length;
      report.notes.push(`批次 ${bi + 1} 超出单批 ${MAX_CARDS_PER_BATCH} 卡上限，丢弃 ${overflow.length} 张`);
    }
    if (cleans.length === 0) {
      report.notes.push(`批次 ${bi + 1} 无有效卡`);
      continue;
    }
    // 阶段 B：既有候选粗筛 ≤20 条摘要随 prompt
    const candidates = pickCandidates(cleans, confirmed, 20);
    const promptB = renderPrompt(tplB, {
      cards: JSON.stringify(cleans, null, 1),
      existing: candidates.map(summarizeCard).join('\n') || '（暂无）',
    });
    const resB = runWithChain(chainRes.chain, promptB);
    let verdicts = null;
    if (resB.ok) {
      report.agentId = resB.agentId;
      const parsedB = parseLooseJsonArray(resB.output);
      if (parsedB.items.length > 0) {
        verdicts = parsedB.items;
      } else {
        const f = writeOrphan(resB.output);
        report.orphans += 1;
        report.notes.push(`批次 ${bi + 1} 阶段B 无法解析 → orphan ${f}`);
      }
    } else {
      report.notes.push(`批次 ${bi + 1} 阶段B 失败：${resB.error}`);
    }
    // 裁决配对：同序同题优先 → 同题兜底 → 同序兜底；缺裁决按 ADD（留人工审）
    for (let ci = 0; ci < cleans.length; ci++) {
      const clean = cleans[ci];
      let v = null;
      if (verdicts) {
        if (verdicts[ci] && String(verdicts[ci].title || '') === clean.title) v = verdicts[ci];
        else v = verdicts.find((x) => x && String(x.title || '') === clean.title) || verdicts[ci] || null;
      }
      const verdict = v && typeof v.verdict === 'string' ? v.verdict.toUpperCase() : 'ADD';
      if (verdict === 'NOOP') {
        report.noops += 1;
        continue;
      }
      const info = {
        verdict,
        oldId: v && v.oldId,
        mergeInto: v && v.mergeInto,
        change: v && v.change,
        related: v && Array.isArray(v.related) ? v.related : [],
      };
      try {
        writePendingDraft(clean, info);
        report.drafts += 1;
        if (clean.suspect) report.suspects += 1;
      } catch (e) {
        report.invalid += 1;
        report.notes.push(`批次 ${bi + 1} 写卡失败：${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  // 6. 全量增量路径收尾：全部批次处理完成才推进水位线（游标 = 涉及文件当前总行数，即旧游标累加新行数）；
  //    有批次失败视为本轮未完成 → 不推进，下次整箱重试（阶段 B NOOP/MERGE 去重兜底）
  if (wm) {
    if (report.failedBatches === 0) {
      const cursors = distillCursorMap(wm.state);
      let advFiles = 0;
      let advLines = 0;
      for (const [abs, total] of wm.touched) {
        const old = Number.isInteger(cursors[abs]) && cursors[abs] >= 0 ? cursors[abs] : 0;
        if (total > old) {
          advFiles += 1;
          advLines += total - old;
        }
        cursors[abs] = total;
      }
      try {
        saveState(STATE_FILE, wm.state);
        report.advanced = true;
        if (advFiles > 0) report.notes.push(`水位线推进 ${advFiles} 文件 · +${advLines} 行`);
      } catch (e) {
        report.notes.push(`水位线写入失败（下次重试）：${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      report.notes.push(`${report.failedBatches} 批失败，水位线不推进（下次重试，阶段 B 去重兜底）`);
    }
  }
  report.durationMs = Date.now() - startedAt;
  if (!quiet) printDistillReport(report);
  return report;
}

/** 打印 distill 报告块 */
function printDistillReport(report) {
  const secs = ((report.durationMs || 0) / 1000).toFixed(1);
  const flags = [];
  if (report.suspects) flags.push(`suspect ${report.suspects}`);
  if (report.orphans) flags.push(`orphan ${report.orphans}`);
  if (report.noops) flags.push(`noop ${report.noops}`);
  if (report.invalid) flags.push(`丢弃 ${report.invalid}`);
  if (report.failedBatches) flags.push(`失败批 ${report.failedBatches}`);
  if (report.malformed) flags.push(`畸形行 ${report.malformed}`);
  console.log(`⚗ distill — ${report.batches} 批 · 执行者 ${report.agentId || '—'} · 草稿 ${report.drafts} 张${flags.length ? `（${flags.join(' · ')}）` : ''} · ${secs}s`);
  for (const n of report.notes) console.log(`  · ${n}`);
}
