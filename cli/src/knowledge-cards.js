// 知识卡片读写器（ADR 0009 §2/§6）：受限 frontmatter 解析/序列化、id 生成、校验、CRUD
// 纪律：未知键保留不删除；CRLF/BOM 容忍（读侧）；写侧统一 LF、无 BOM

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

// 卡片枚举（受限校验用）
export const CARD_TYPES = ['fact', 'preference', 'pattern', 'pitfall', 'workflow'];
export const CARD_STATUSES = ['draft', 'confirmed', 'retired'];

/**
 * 受限 frontmatter 解析：仅扁平键 + 单层数组；数组支持 `[a, b]` 与逐行 `- x` 两形态。
 * 值不解析类型（全部保留字符串）；未知键原样保留。
 * CRLF / UTF-8 BOM 容忍：内部统一 LF；body 同样规范化为 LF 且去掉末尾单个换行。
 * @param {string} mdText 卡片 markdown 原文
 * @returns {{ front: Record<string, string|string[]>, body: string } | null} 无 frontmatter / 分隔符不完整返回 null
 */
export function parseCard(mdText) {
  if (typeof mdText !== 'string') return null;
  let text = mdText.replace(/^\uFEFF/, ''); // 去 BOM
  if (text.includes('\r\n')) text = text.replace(/\r\n/g, '\n'); // CRLF → LF
  const lines = text.split('\n');
  if ((lines[0] ?? '').trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return null;

  const front = {};
  let curKey = null; // 正在收集逐行数组的键
  for (let i = 1; i < end; i++) {
    const raw = lines[i];
    if (raw.trim() === '') { // 空行结束逐行数组上下文
      if (curKey !== null && front[curKey] === undefined) front[curKey] = '';
      curKey = null;
      continue;
    }
    const listM = raw.match(/^[ \t]*-[ \t]+(.*)$/);
    if (listM && curKey !== null) { // 逐行数组元素
      if (front[curKey] === undefined) front[curKey] = [];
      if (!Array.isArray(front[curKey])) front[curKey] = [String(front[curKey])];
      front[curKey].push(cleanScalar(listM[1]));
      continue;
    }
    const kvM = raw.match(/^([^\s:][^:]*?)\s*:\s*(.*)$/);
    if (!kvM) continue; // 受限解析不支持的行（嵌套等）跳过，不报错
    if (curKey !== null && front[curKey] === undefined) front[curKey] = ''; // 上一键无元素也无值
    curKey = null;
    const key = kvM[1].trim();
    const val = kvM[2].trim();
    if (val === '') { curKey = key; continue; } // 值为空：可能是逐行数组的开头
    front[key] = parseValue(val);
  }
  if (curKey !== null && front[curKey] === undefined) front[curKey] = '';

  // body：结束 --- 之后，去掉紧随的一个分隔空行与末尾单个换行
  let bodyLines = lines.slice(end + 1);
  if (bodyLines.length > 0 && bodyLines[0] === '') bodyLines = bodyLines.slice(1);
  const body = bodyLines.join('\n').replace(/\n$/, '');
  return { front, body };
}

/** 解析单值：`[a, b]` → 数组；其余标量字符串（去包裹引号） */
function parseValue(val) {
  if (val.startsWith('[') && val.endsWith(']')) {
    const inner = val.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((s) => cleanScalar(s));
  }
  return cleanScalar(val);
}

/** 标量清洗：trim + 去一层成对的单/双引号 */
function cleanScalar(s) {
  const t = s.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * 序列化卡片为 markdown（写侧统一 LF、无 BOM；数组统一逐行 `- x` 形态，空数组 `key: []`）。
 * @param {Record<string, string|string[]>} front
 * @param {string} body 正文（可为空）
 */
export function serializeCard(front, body) {
  const out = ['---'];
  for (const [k, v] of Object.entries(front || {})) {
    if (Array.isArray(v)) {
      if (v.length === 0) { out.push(`${k}: []`); continue; }
      out.push(`${k}:`);
      for (const item of v) out.push(`  - ${item}`);
    } else {
      out.push(`${k}: ${v ?? ''}`);
    }
  }
  out.push('---');
  let md = out.join('\n');
  if (body) md += '\n\n' + body;
  return md;
}

/**
 * 生成卡片 id：`kYYYYMMDD-8hex`（sha256(title|source|ts) 前 8 位，ADR 0009 §4）。
 * @param {string} title 卡片标题
 * @param {string} source 来源（可回溯出处）
 * @param {Date|number|string} [ts] 时间（默认现在）；同一天内靠 hash 消歧
 */
export function makeCardId(title, source, ts) {
  const d = ts instanceof Date ? ts : new Date(ts ?? Date.now());
  const day = Number.isNaN(d.getTime()) ? new Date() : d;
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, '0');
  const dd = String(day.getDate()).padStart(2, '0');
  const stamp = day.toISOString();
  const hex = createHash('sha256').update(`${title}|${source}|${stamp}`).digest('hex').slice(0, 8);
  return `k${y}${m}${dd}-${hex}`;
}

/** 本地日期 YYYY-MM-DD（validUntil 双时态置值用） */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 校验卡片 frontmatter，返回错误串数组（空数组 = 合法）。
 * 规则：缺 title/type/source/status 拒绝；confidence ∈ [0,1]；type/status 枚举。
 * @param {Record<string, unknown>} front
 * @returns {string[]}
 */
export function validateCard(front) {
  const errors = [];
  if (!front || typeof front !== 'object') return ['frontmatter 缺失或不是对象'];
  for (const key of ['title', 'type', 'source', 'status']) {
    if (front[key] === undefined || front[key] === null || String(front[key]).trim() === '') {
      errors.push(`缺少必填字段 ${key}`);
    }
  }
  if (front.confidence !== undefined && front.confidence !== '') {
    const n = Number(front.confidence);
    if (Number.isNaN(n) || n < 0 || n > 1) errors.push(`confidence 必须在 [0,1] 内，当前为「${front.confidence}」`);
  }
  if (front.type !== undefined && !CARD_TYPES.includes(String(front.type))) {
    errors.push(`type 必须是 ${CARD_TYPES.join('/')} 之一，当前为「${front.type}」`);
  }
  if (front.status !== undefined && !CARD_STATUSES.includes(String(front.status))) {
    errors.push(`status 必须是 ${CARD_STATUSES.join('/')} 之一，当前为「${front.status}」`);
  }
  return errors;
}

/**
 * 写卡片到目录：文件名 `<id>.md`；无 id 则按 title|source|updated 生成并注入 front。
 * 写前先校验，非法卡直接抛错（红线 #10：只认带 source 的卡片）。
 * @param {string} dir 目标目录
 * @param {{ front: Record<string, unknown>, body?: string }} card
 * @returns {string} 卡片 id
 */
export function writeCard(dir, { front, body }) {
  const errors = validateCard(front);
  if (errors.length > 0) {
    throw new Error(`卡片不合法，拒绝写入：\n  - ${errors.join('\n  - ')}`);
  }
  const f = { ...front };
  const id = f.id ? String(f.id) : makeCardId(f.title, f.source, f.updated ?? Date.now());
  f.id = id;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  let md = serializeCard(f, body ?? '');
  if (!md.endsWith('\n')) md += '\n'; // 文本文件统一补尾换行
  writeFileSync(join(dir, `${id}.md`), md, 'utf-8');
  return id;
}

/**
 * 按 id 读卡片（文件名 `<id>.md`）；不存在或解析失败返回 null。
 * @param {string} dir
 * @param {string} id
 */
export function readCardById(dir, id) {
  if (!id || /[\\/]/.test(id) || id.includes('..')) return null; // 防 id 携带路径片段
  const file = join(dir, `${id}.md`);
  if (!existsSync(file)) return null;
  return parseCard(readFileSync(file, 'utf-8'));
}

/**
 * 递归列出目录下全部 .md 卡片（解析失败的文件跳过）。
 * @param {string} dir
 * @param {{ excludeHidden?: boolean }} [opts] excludeHidden：跳过 `.` 开头的子目录（.pending/.rejected/.archive 等）
 * @returns {Array<{ id: string, file: string, front: Record<string, unknown>, body: string }>}
 */
export function listCards(dir, opts = {}) {
  const out = [];
  if (!existsSync(dir)) return out;
  walk(dir, '');
  out.sort((a, b) => a.file.localeCompare(b.file));
  return out;

  function walk(abs, rel) {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const name = entry.name;
      if (entry.isDirectory()) {
        if (opts.excludeHidden && name.startsWith('.')) continue;
        walk(join(abs, name), rel ? `${rel}/${name}` : name);
        continue;
      }
      if (!name.toLowerCase().endsWith('.md')) continue;
      const file = rel ? `${rel}/${name}` : name;
      const card = parseCard(readFileSync(join(abs, name), 'utf-8'));
      if (!card) continue;
      out.push({ id: card.front.id ? String(card.front.id) : name.replace(/\.md$/i, ''), file, front: card.front, body: card.body });
    }
  }
}

/** 向 front 的数组键追加去重值（conflictWith 等互指语义用） */
function pushUnique(front, key, val) {
  const cur = front[key];
  if (cur === undefined || cur === '') front[key] = [val];
  else if (Array.isArray(cur)) { if (!cur.includes(val)) cur.push(val); }
  else if (cur !== val) front[key] = [String(cur), val];
}

/**
 * 退役卡片：status: retired + mergedInto（可选）+ validUntil 置今天（双时态，不删除）。
 * @param {string} dir
 * @param {string} id
 * @param {{ mergedInto?: string }} [opts]
 * @returns {boolean} 是否发生写盘
 */
export function retireCard(dir, id, opts = {}) {
  const card = readCardById(dir, id);
  if (!card) return false;
  card.front.status = 'retired';
  if (opts.mergedInto) card.front.mergedInto = opts.mergedInto;
  card.front.validUntil = today();
  writeCardRaw(dir, id, card);
  return true;
}

/**
 * 合并卡片：drop 卡 retired + mergedInto: keepId + validUntil 置今天；keep 卡不动。
 * @param {string} dir
 * @param {string} keepId canonical 卡 id
 * @param {string} dropId 被并卡 id
 * @returns {{ keep: object, drop: object }} 两卡合并后的 { front, body }
 */
export function mergeCards(dir, keepId, dropId) {
  const keep = readCardById(dir, keepId);
  if (!keep) throw new Error(`canonical 卡不存在：${keepId}`);
  const drop = readCardById(dir, dropId);
  if (!drop) throw new Error(`被并卡不存在：${dropId}`);
  drop.front.status = 'retired';
  drop.front.mergedInto = keepId;
  drop.front.validUntil = today();
  writeCardRaw(dir, dropId, drop);
  return { keep, drop };
}

/**
 * 冲突标记：两张结论相反的卡互设 conflictWith（双保留，review 人工裁决）。
 * @param {string} dir
 * @param {string} idA
 * @param {string} idB
 */
export function setConflict(dir, idA, idB) {
  const a = readCardById(dir, idA);
  if (!a) throw new Error(`卡片不存在：${idA}`);
  const b = readCardById(dir, idB);
  if (!b) throw new Error(`卡片不存在：${idB}`);
  pushUnique(a.front, 'conflictWith', idB);
  pushUnique(b.front, 'conflictWith', idA);
  writeCardRaw(dir, idA, a);
  writeCardRaw(dir, idB, b);
}

/** 按已知 id 原位写回（不经 validate：退役/冲突标记不改必填字段） */
function writeCardRaw(dir, id, card) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  let md = serializeCard(card.front, card.body);
  if (!md.endsWith('\n')) md += '\n';
  writeFileSync(join(dir, `${id}.md`), md, 'utf-8');
}
