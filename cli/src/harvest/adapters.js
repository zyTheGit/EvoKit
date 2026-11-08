// 记忆引擎 M1 收割适配器（T-M1.3 P0 ×4 + T-M1.4 P1 ×3）
// 每个适配器 fn(sourceCfg) 同步返回 { events, files, skipped, counts }：
//   events  RawEvent[]：{ source, kind, project, ts, sessionId, text, meta:{file,line} }
//   files   [{path,size,mtime,hash}]：实际收割过的文件指纹（供水位线增量判定 pickChangedFiles）
//   skipped [{path,reason}]：畸形行/解压失败/不可达等跳过明细
//   counts  {events,files,skipped}：与三个数组长度一致；
//           唯一例外是「整源级跳过」（root-missing / node-zstd-unsupported）——
//           没有发生收割工作，counts 全 0，原因只承载在 skipped 明细里。
// 约束：零依赖纯标准库；text ≤ 4096 字符截断；JSONL 逐行解析，畸形行跳过计数不中断。

import zlib from 'node:zlib';
import { basename, join, relative } from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { expandPath } from '../paths.js';
import { fileFingerprint } from '../state.js';

/** RawEvent text 上限（字符数），超出截断 */
export const MAX_EVENT_TEXT = 4096;

/** Node 的 zstd 解压是运行时特性（≥23.8 才有 zstdDecompressSync），只做特性检测不做版本硬要求 */
const ZSTD_DECOMPRESS_OK = typeof zlib.zstdDecompressSync === 'function';

// ── 通用辅助 ──

function baseResult() {
  return { events: [], files: [], skipped: [] };
}

/** 附加 counts（与三个数组长度严格一致） */
function finalize(res) {
  return { ...res, counts: { events: res.events.length, files: res.files.length, skipped: res.skipped.length } };
}

/** 整源级跳过（root 缺失 / 无 zstd 能力）：明细承载原因，counts 全 0 */
function wholeSourceSkipped(root, reason) {
  return { events: [], files: [], skipped: [{ path: root, reason }], counts: { events: 0, files: 0, skipped: 0 } };
}

/** 截断 RawEvent text 到上限字符 */
function truncateText(text) {
  return text.length > MAX_EVENT_TEXT ? text.slice(0, MAX_EVENT_TEXT) : text;
}

/** 时间值统一为 ISO 字符串；解析失败原样返回（宽松，不丢信息） */
function toIsoTs(v) {
  if (v === undefined || v === null || v === '') return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number') return new Date(v).toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

/** 构造 RawEvent（text 截断在此统一收口） */
function makeEvent(cfg, { kind, project, ts, sessionId = '', text, file, line }) {
  return {
    source: (cfg && cfg.id) || '',
    kind,
    project: project || '',
    ts: toIsoTs(ts),
    sessionId: sessionId || '',
    text: truncateText(String(text || '')),
    meta: { file, line },
  };
}

/** 文件指纹（复用 state.js 的 sha1 前 8 hex 实现，补 path 字段） */
function fingerprint(file) {
  return { path: file, ...fileFingerprint(file) };
}

/** 相对 root、以 / 分隔的路径（glob 匹配用，兼容 Windows 反斜杠） */
function relPosix(root, p) {
  return relative(root, p).replace(/\\/g, '/');
}

/**
 * 简易 glob → RegExp（零依赖）：** 跨目录段（可吞多层或零层），* 段内任意，? 单字符。
 * 匹配对象是 relPosix 形式的相对路径。
 */
export function globToRegExp(glob) {
  let body = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        let j = i + 2;
        while (glob[j] === '*') j += 1;
        if (glob[j] === '/') { body += '(?:.*/)?'; i = j; } // '**/' 兼容零层目录
        else { body += '.*'; i = j - 1; }
      } else {
        body += '[^/]*'; // 单星不跨目录段
      }
    } else if (ch === '?') {
      body += '[^/]';
    } else {
      body += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${body}$`);
}

/** 递归列文件；match(absPath) 决定是否收集。目录读取失败记入 errors 不中断 */
function walkFiles(dir, { recursive = true, match } = {}) {
  const files = [], errors = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    errors.push({ path: dir, reason: 'walk-failed' });
    return { files, errors };
  }
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!recursive) continue;
      const sub = walkFiles(p, { recursive, match });
      files.push(...sub.files);
      errors.push(...sub.errors);
    } else if (ent.isFile()) {
      try {
        if (!match || match(p)) files.push(p);
      } catch { /* match 抛错按不匹配处理 */ }
    }
  }
  return { files, errors };
}

/** 解析 JSONL：空行忽略；畸形行号（1-based）收集，不中断 */
function parseJsonl(content) {
  const records = [], malformed = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    try {
      records.push({ obj: JSON.parse(raw), line: i + 1 });
    } catch {
      malformed.push(i + 1);
    }
  }
  return { records, malformed };
}

/** 从 message/content 提取文本（字符串直取；块数组拼接所有 .text 字段——
  * claude 的 text 块与 codex 的 input_text/output_text 块都带 .text，
  * tool_use/tool_result 块没有 .text 字段，自然被过滤） */
function extractContentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(b => b && typeof b.text === 'string').map(b => b.text).join('\n');
  }
  return '';
}

// ── 1. claude-projects：~/.claude/projects 下会话 JSONL ──

function claudeProjects(cfg) {
  const root = expandPath(cfg.root);
  if (!existsSync(root)) return wholeSourceSkipped(root, 'root-missing');
  const res = baseResult();
  const sinceMs = cfg.since ? Date.parse(cfg.since) : NaN;
  const { files: jsonls, errors } = walkFiles(root, {
    recursive: true,
    match: p => p.endsWith('.jsonl') && !p.includes('subagents'), // 子代理侧链不进 RawEvent
  });
  errors.forEach(e => res.skipped.push(e));
  for (const file of jsonls) {
    try {
      const st = statSync(file);
      if (Number.isFinite(sinceMs) && st.mtimeMs < sinceMs) {
        res.skipped.push({ path: file, reason: 'before-since' }); // 早于 since 的文件整文件跳过
        continue;
      }
      res.files.push(fingerprint(file));
      const { records, malformed } = parseJsonl(readFileSync(file, 'utf-8'));
      malformed.forEach(n => res.skipped.push({ path: file, reason: `malformed-line:${n}` }));
      for (const { obj, line } of records) {
        if (!obj || typeof obj !== 'object' || obj.isMeta) continue; // isMeta 行跳过
        if (obj.type !== 'user' && obj.type !== 'assistant') continue;
        const text = extractContentText(obj.message && obj.message.content);
        if (!text) continue; // 纯 tool_use/tool_result 轮次无文本
        res.events.push(makeEvent(cfg, {
          kind: 'session',
          project: obj.cwd || cfg.project || basename(root), // cwd 映射 project
          ts: obj.timestamp,
          sessionId: obj.sessionId,
          text, file, line,
        }));
      }
    } catch {
      res.skipped.push({ path: file, reason: 'read-failed' });
    }
  }
  return finalize(res);
}

// ── 2. codex-rollout：~/.codex/sessions 下 rollout-*.jsonl.zst ──

function codexRollout(cfg) {
  const root = expandPath(cfg.root);
  if (!existsSync(root)) return wholeSourceSkipped(root, 'root-missing');
  if (!ZSTD_DECOMPRESS_OK) {
    return wholeSourceSkipped(root, 'node-zstd-unsupported'); // 运行时无 zstd：整源跳过不阻塞
  }
  const res = baseResult();
  const { files: zsts, errors } = walkFiles(root, {
    recursive: true,
    match: p => /^rollout-.*\.jsonl\.zst$/.test(basename(p)),
  });
  errors.forEach(e => res.skipped.push(e));
  for (const file of zsts) {
    try {
      let content;
      try {
        content = zlib.zstdDecompressSync(readFileSync(file)).toString('utf-8');
      } catch {
        res.skipped.push({ path: file, reason: 'decompress-failed' }); // 单文件解压失败不中断
        continue;
      }
      res.files.push(fingerprint(file)); // 解压成功才记指纹（没收割的内容不进水位线）
      const { records, malformed } = parseJsonl(content);
      malformed.forEach(n => res.skipped.push({ path: file, reason: `malformed-line:${n}` }));
      for (const { obj, line } of records) {
        const payload = obj && typeof obj.payload === 'object' && obj.payload !== null ? obj.payload : obj;
        if (!payload || payload.type !== 'message') continue; // 只取消息轮次
        if (payload.role !== 'user' && payload.role !== 'assistant') continue;
        const text = extractContentText(payload.content);
        if (!text) continue;
        res.events.push(makeEvent(cfg, {
          kind: 'session',
          project: obj.cwd || cfg.project || basename(root),
          ts: obj.timestamp || payload.timestamp,
          sessionId: obj.sessionId || payload.sessionId,
          text, file, line,
        }));
      }
    } catch {
      res.skipped.push({ path: file, reason: 'read-failed' });
    }
  }
  return finalize(res);
}

// ── 3. memory-cards：Qoder/CodeArts 已提纯的 md 记忆卡直通 ──

function memoryCards(cfg) {
  const root = expandPath(cfg.root);
  if (!existsSync(root)) return wholeSourceSkipped(root, 'root-missing');
  const res = baseResult();
  const re = globToRegExp(cfg.glob || (cfg.recursive ? '**/*.md' : '*.md')); // 递归时缺省收全层
  const { files: mds, errors } = walkFiles(root, {
    recursive: !!cfg.recursive, // 缺省只扫根层，recursive:true 才下钻
    match: p => re.test(relPosix(root, p)),
  });
  errors.forEach(e => res.skipped.push(e));
  for (const file of mds) {
    try {
      const st = statSync(file);
      res.files.push(fingerprint(file));
      const text = readFileSync(file, 'utf-8'); // 一文件一 RawEvent，全文截断
      res.events.push(makeEvent(cfg, {
        kind: 'memory-card',
        project: cfg.project || basename(root),
        ts: st.mtime,
        sessionId: '',
        text, file, line: 0,
      }));
    } catch {
      res.skipped.push({ path: file, reason: 'read-failed' });
    }
  }
  return finalize(res);
}

// ── 4. trae-session-memory：session_memory_*.jsonl 的 {intent,actions,outcome,learned} → 卡片 ──

function traeSessionMemory(cfg) {
  const root = expandPath(cfg.root);
  if (!existsSync(root)) return wholeSourceSkipped(root, 'root-missing');
  const res = baseResult();
  const { files: jsonls, errors } = walkFiles(root, {
    recursive: true,
    match: p => /^session_memory_.*\.jsonl$/.test(basename(p)),
  });
  errors.forEach(e => res.skipped.push(e));
  for (const file of jsonls) {
    try {
      const st = statSync(file);
      res.files.push(fingerprint(file));
      const { records, malformed } = parseJsonl(readFileSync(file, 'utf-8'));
      malformed.forEach(n => res.skipped.push({ path: file, reason: `malformed-line:${n}` }));
      for (const { obj, line } of records) {
        if (!obj || typeof obj !== 'object') continue;
        // 四字段拼装为一张卡片文本
        const parts = [];
        if (obj.intent) parts.push(`intent: ${obj.intent}`);
        if (obj.actions !== undefined && obj.actions !== null && obj.actions !== '') {
          const actions = Array.isArray(obj.actions) ? obj.actions.join('; ') : String(obj.actions);
          if (actions) parts.push(`actions: ${actions}`);
        }
        if (obj.outcome) parts.push(`outcome: ${obj.outcome}`);
        if (obj.learned) parts.push(`learned: ${obj.learned}`);
        if (!parts.length) continue; // 四字段全空不产事件
        res.events.push(makeEvent(cfg, {
          kind: 'memory-card',
          project: obj.project || cfg.project || basename(root),
          ts: obj.timestamp || st.mtime,
          sessionId: obj.sessionId || obj.session_id || '',
          text: parts.join('\n'),
          file, line,
        }));
      }
    } catch {
      res.skipped.push({ path: file, reason: 'read-failed' });
    }
  }
  return finalize(res);
}

// ── 5. jsonl-fields：单文件 JSONL（如 ~/.claude/history.jsonl），每行取 display|text|prompt ──

function jsonlFields(cfg) {
  const root = expandPath(cfg.root);
  if (!existsSync(root)) return wholeSourceSkipped(root, 'root-missing');
  const res = baseResult();
  let st;
  try {
    st = statSync(root);
  } catch {
    res.skipped.push({ path: root, reason: 'read-failed' });
    return finalize(res);
  }
  if (!st.isFile()) {
    res.skipped.push({ path: root, reason: 'not-a-file' }); // 该适配器只接受单文件
    return finalize(res);
  }
  res.files.push(fingerprint(root));
  try {
    const { records, malformed } = parseJsonl(readFileSync(root, 'utf-8'));
    malformed.forEach(n => res.skipped.push({ path: root, reason: `malformed-line:${n}` }));
    for (const { obj, line } of records) {
      if (!obj || typeof obj !== 'object') continue;
      const text = [obj.display, obj.text, obj.prompt].find(v => typeof v === 'string' && v.length > 0);
      if (text === undefined) continue; // 三个字段都没有 → 不产事件
      res.events.push(makeEvent(cfg, {
        kind: 'history',
        project: obj.project || cfg.project || '',
        ts: obj.timestamp || obj.ts || st.mtime,
        sessionId: obj.sessionId || obj.session_id || '',
        text, file: root, line,
      }));
    }
  } catch {
    res.skipped.push({ path: root, reason: 'read-failed' });
  }
  return finalize(res);
}

// ── 6. pi-sessions：~/.pi/agent/sessions 下 *.jsonl，宽松提取用户/助手文本 ──

/** 宽松提取：content 兼容字符串/块数组，兜底 obj.text；tool 等非用户/助手角色不取 */
function pickLooseText(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const role = obj.role
    || (obj.message && obj.message.role)
    || (obj.type === 'user' ? 'user' : obj.type === 'assistant' ? 'assistant' : '');
  if (role && role !== 'user' && role !== 'assistant') return null;
  const content = obj.content !== undefined ? obj.content : (obj.message && obj.message.content);
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    text = content.filter(b => b && typeof b.text === 'string').map(b => b.text).join('\n');
  }
  if (!text && typeof obj.text === 'string') text = obj.text;
  if (!text) return null;
  return { role: role || '', text };
}

function piSessions(cfg) {
  const root = expandPath(cfg.root);
  if (!existsSync(root)) return wholeSourceSkipped(root, 'root-missing');
  const res = baseResult();
  const { files: jsonls, errors } = walkFiles(root, { recursive: true, match: p => p.endsWith('.jsonl') });
  errors.forEach(e => res.skipped.push(e));
  for (const file of jsonls) {
    try {
      const st = statSync(file);
      res.files.push(fingerprint(file));
      const { records, malformed } = parseJsonl(readFileSync(file, 'utf-8'));
      malformed.forEach(n => res.skipped.push({ path: file, reason: `malformed-line:${n}` }));
      for (const { obj, line } of records) {
        const picked = pickLooseText(obj);
        if (!picked) continue;
        res.events.push(makeEvent(cfg, {
          kind: 'session',
          project: obj.project || obj.cwd || cfg.project || basename(root),
          ts: obj.timestamp || obj.ts || st.mtime,
          sessionId: obj.sessionId || obj.session_id || '',
          text: picked.text,
          file, line,
        }));
      }
    } catch {
      res.skipped.push({ path: file, reason: 'read-failed' });
    }
  }
  return finalize(res);
}

// ── 7. daily-log：WorkBuddy 日报 md（root 缺省 = 当前工作目录）──

function dailyLog(cfg) {
  const root = expandPath(cfg.root || process.cwd());
  if (!existsSync(root)) return wholeSourceSkipped(root, 'root-missing');
  const res = baseResult();
  const re = globToRegExp(cfg.glob || '**/.workbuddy/memory/*.md');
  const { files: mds, errors } = walkFiles(root, {
    recursive: true,
    match: p => re.test(relPosix(root, p)),
  });
  errors.forEach(e => res.skipped.push(e));
  for (const file of mds) {
    try {
      const st = statSync(file);
      res.files.push(fingerprint(file));
      const text = readFileSync(file, 'utf-8'); // 一文件一 RawEvent
      res.events.push(makeEvent(cfg, {
        kind: 'daily-log',
        project: cfg.project || basename(root),
        ts: st.mtime,
        sessionId: '',
        text, file, line: 0,
      }));
    } catch {
      res.skipped.push({ path: file, reason: 'read-failed' });
    }
  }
  return finalize(res);
}

// 适配器注册表（key 与 settings.json sources[].adapter 对齐；sqlite 属 P2 储备不在此表）
export const ADAPTERS = {
  'claude-projects': claudeProjects,
  'jsonl-fields': jsonlFields,
  'codex-rollout': codexRollout,
  'memory-cards': memoryCards,
  'trae-session-memory': traeSessionMemory,
  'pi-sessions': piSessions,
  'daily-log': dailyLog,
};
