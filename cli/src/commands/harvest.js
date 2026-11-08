// harvest 命令（T-M1.5）：采集各源新会话到 inbox（水位线增量 + 收割即脱敏）
// 编排逻辑导出为 runHarvest(options)，learn 命令（T-M2.5）复用同一实现。
// 报告风格仿 inventory：逐源计数 + skipped 原因 + 总耗时。

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { DEFAULT_SOURCES, DEFAULT_KNOWLEDGE } from '../defaults.js';
import { INBOX_DIR, STATE_FILE } from '../paths.js';
import { loadState, pickChangedFiles, saveState, updateSource } from '../state.js';
import { redact } from '../redact.js';
import { ADAPTERS } from '../harvest/adapters.js';

/**
 * 读取记忆引擎配置块：老 settings.json 缺 sources/knowledge 时回填默认值。
 * （config.js 本轮不在改动范围，回填收敛在这里，distill/learn 共用。）
 */
export function loadEngineConfig() {
  const cfg = loadConfig();
  return {
    config: cfg,
    sources: Array.isArray(cfg.sources) ? cfg.sources : DEFAULT_SOURCES,
    knowledge: { ...DEFAULT_KNOWLEDGE, ...(cfg.knowledge && typeof cfg.knowledge === 'object' ? cfg.knowledge : {}) },
  };
}

/** 解析 `--flag <value>` 形式参数；缺失/疑似漏值返回 null 并置退出码 */
function flagValue(args, flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  const v = args[i + 1];
  if (!v || v.startsWith('-')) {
    console.error(`✗ ${flag} 需要跟一个值`);
    process.exitCode = 1;
    return null;
  }
  return v;
}

/**
 * `evokit harvest` 入口
 * @param {string[]} args 参数（不含 'harvest' 本身）：--full / --source <id> / --dry-run
 */
export function harvestCommand(args) {
  const full = args.includes('--full');
  const dryRun = args.includes('--dry-run');
  const source = flagValue(args, '--source');
  if (process.exitCode === 1) return;
  const report = runHarvest({ full, dryRun, source });
  if (report.unknownSource) process.exitCode = 1;
}

/**
 * 执行一轮采集（harvest 与 learn 共用）。
 * @param {{ full?: boolean, dryRun?: boolean, source?: string | null, quiet?: boolean }} options
 *   full    忽略水位线全量处理
 *   dryRun  只报告不写盘（不写 inbox、不更新水位线、不清理过期文件）
 *   source  只跑指定 id 的源
 *   quiet   只返回报告对象不打印（编程复用时用）
 * @returns {{ rows: Array, totals: object, durationMs: number, unknownSource?: boolean }}
 */
export function runHarvest(options = {}) {
  const { full = false, dryRun = false, source = null, quiet = false } = options;
  const startedAt = Date.now();
  const { sources, knowledge } = loadEngineConfig();
  const extraPatterns = knowledge.redact && Array.isArray(knowledge.redact.extraPatterns)
    ? knowledge.redact.extraPatterns
    : [];
  const state = loadState(STATE_FILE);

  if (source && !sources.some((s) => s.id === source)) {
    if (!quiet) console.error(`✗ 未找到采集源「${source}」，可用：${sources.map((s) => s.id).join(', ')}`);
    return { rows: [], totals: { written: 0, enabled: 0, disabled: 0, failed: 0, removedExpired: 0, dryRun }, durationMs: Date.now() - startedAt, unknownSource: true };
  }

  const rows = [];
  for (const src of sources) {
    if (source && src.id !== source) continue;
    if (!src.enabled) {
      rows.push({ id: src.id, adapter: src.adapter, status: 'disabled' });
      continue;
    }
    const adapter = ADAPTERS[src.adapter];
    if (!adapter) {
      rows.push({ id: src.id, adapter: src.adapter, status: 'unknown-adapter' });
      continue;
    }
    let result;
    try {
      result = adapter(src);
    } catch (e) {
      // 单源失败计入报告继续（计划 §2.4 失败降级）
      rows.push({ id: src.id, adapter: src.adapter, status: 'error', error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    // 水位线增量：只处理变更文件产生的事件（适配器返回全量事件，按 meta.file 过滤；--full 忽略水位线）
    const { changed, unchanged } = pickChangedFiles(state, src.id, result.files);
    const changedSet = new Set((full ? result.files : changed).map((f) => f.path));
    const kept = result.events.filter((ev) => changedSet.has(ev.meta && ev.meta.file));
    // 收割即脱敏（FR-04 第一落点）
    let redactHits = 0;
    const cleanEvents = kept.map((ev) => {
      const r = redact(ev.text, extraPatterns);
      if (r.hits.length > 0) redactHits += r.hits.reduce((n, h) => n + h.count, 0);
      return r.text === ev.text ? ev : { ...ev, text: r.text };
    });
    const written = dryRun ? kept.length : appendEventsToInbox(src.id, cleanEvents);
    if (!dryRun) {
      updateSource(state, src.id, {
        files: result.files,
        counts: { events: kept.length, files: result.files.length, skipped: result.skipped.length },
      });
    }
    rows.push({
      id: src.id,
      adapter: src.adapter,
      status: 'ok',
      events: result.events.length,
      kept: kept.length,
      written,
      files: result.files.length,
      changedFiles: full ? result.files.length : changed.length,
      unchangedFiles: full ? 0 : unchanged,
      redactHits,
      skipped: result.skipped,
    });
  }
  if (!dryRun) saveState(STATE_FILE, state);
  const removedExpired = dryRun ? 0 : cleanInbox(knowledge.inboxRetentionDays);

  const totals = {
    written: rows.reduce((n, r) => n + (r.written || 0), 0),
    events: rows.reduce((n, r) => n + (r.events || 0), 0),
    enabled: rows.filter((r) => r.status === 'ok').length,
    disabled: rows.filter((r) => r.status === 'disabled').length,
    failed: rows.filter((r) => r.status === 'error' || r.status === 'unknown-adapter').length,
    removedExpired,
    dryRun,
  };
  const durationMs = Date.now() - startedAt;
  if (!quiet) printHarvestReport(rows, totals, durationMs);
  return { rows, totals, durationMs };
}

/**
 * RawEvent 按 meta.file 分组落盘：~/.evokit/inbox/<source>/<YYYYMMDD>-<hash8>.jsonl
 * hash = 本组 JSONL 内容 sha256 前 8 位；追加前按行去重（mtime 变化但内容相同的文件不重复落盘）。
 * @returns {number} 实际新写入的事件行数
 */
function appendEventsToInbox(sourceId, events) {
  if (events.length === 0) return 0;
  const byFile = new Map();
  for (const ev of events) {
    const key = (ev.meta && ev.meta.file) || '_nofile';
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(ev);
  }
  const dir = join(INBOX_DIR, sanitizeSegment(sourceId));
  mkdirSync(dir, { recursive: true });
  let written = 0;
  for (const evs of byFile.values()) {
    const lines = evs.map((ev) => JSON.stringify(ev));
    const hash = createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 8);
    const target = join(dir, `${stampDate()}-${hash}.jsonl`);
    const existing = existsSync(target)
      ? new Set(readFileSync(target, 'utf-8').split(/\r?\n/).filter(Boolean))
      : new Set();
    const fresh = lines.filter((l) => !existing.has(l));
    if (fresh.length === 0) continue;
    appendFileSync(target, fresh.join('\n') + '\n', 'utf-8');
    written += fresh.length;
  }
  return written;
}

/** inbox 子目录名：只保留文件名安全字符 */
function sanitizeSegment(name) {
  return String(name).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'source';
}

/** 本地日期 YYYYMMDD（inbox 文件名前缀） */
function stampDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/**
 * 清理超 inboxRetentionDays 的旧 inbox 文件（D11：distill 消费后保留 30 天）。
 * retentionDays 非正数时跳过（视为不清理）。
 * @returns {number} 删除的文件数
 */
function cleanInbox(retentionDays) {
  if (!(Number(retentionDays) > 0) || !existsSync(INBOX_DIR)) return 0;
  const cutoff = Date.now() - Number(retentionDays) * 86400000;
  let removed = 0;
  let entries;
  try {
    entries = readdirSync(INBOX_DIR, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = join(INBOX_DIR, ent.name);
    let files;
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      const p = join(dir, f);
      try {
        if (statSync(p).mtimeMs < cutoff) {
          rmSync(p);
          removed += 1;
        }
      } catch { /* 单文件失败不中断 */ }
    }
  }
  return removed;
}

/** 打印 harvest 报告（inventory 风格：逐源计数 + skipped 原因 + 总耗时） */
function printHarvestReport(rows, totals, durationMs) {
  const secs = (durationMs / 1000).toFixed(1);
  if (totals.dryRun) {
    console.log(`🌾 harvest（dry-run 试算，不写盘）— ${rows.length} 源 · 拟入库事件 ${totals.written} 条 · 总耗时 ${secs}s\n`);
  } else {
    const parts = [`${rows.length} 源（${totals.enabled} 处理 / ${totals.disabled} 未启用`];
    if (totals.failed > 0) parts.push(`${totals.failed} 失败`);
    console.log(`🌾 harvest — ${parts.join(' / ')}) · 新增事件 ${totals.written} 条 · 过期清理 ${totals.removedExpired} 文件 · 总耗时 ${secs}s\n`);
  }
  for (const r of rows) {
    if (r.status === 'disabled') {
      console.log(`  ○ ${r.id}  未启用（enabled: false）`);
      continue;
    }
    if (r.status === 'unknown-adapter') {
      console.log(`  ✗ ${r.id}  未知适配器「${r.adapter}」，跳过`);
      continue;
    }
    if (r.status === 'error') {
      console.log(`  ✗ ${r.id}  采集失败：${r.error}`);
      continue;
    }
    const head = `  ✓ ${r.id}  事件 ${r.events} · 入库 ${r.written} · 文件 ${r.files}（变更 ${r.changedFiles}${r.unchangedFiles ? `，未变 ${r.unchangedFiles}` : ''}）`;
    console.log(head + (r.redactHits > 0 ? ` · 脱敏 ${r.redactHits} 处` : ''));
    for (const s of r.skipped || []) console.log(`      · ${s.reason}: ${s.path}`);
  }
  if (totals.dryRun) console.log('\n（dry-run：以上为拟写入量；去掉 --dry-run 实际执行。）');
}
