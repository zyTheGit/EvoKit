#!/usr/bin/env node
// M1 收割层库模块自测（T-M1.1 state / T-M1.2 redact / T-M1.3+T-M1.4 adapters）
// 自包含：运行时在临时目录动态生成 fixtures；node cli/test-m1-lib.mjs 直接运行，失败 exit 1。
// zstd 相关用例做运行时特性检测（typeof zlib.zstdCompressSync / zstdDecompressSync），不支持则标 skip。

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import zlib from 'node:zlib';

import { fileFingerprint, loadState, pickChangedFiles, saveState, updateSource } from './src/state.js';
import { DEFAULT_REDACT_RULES, redact } from './src/redact.js';
import { ADAPTERS } from './src/harvest/adapters.js';

// ── 微型测试框架 ──
let passCount = 0, failCount = 0, skipCount = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passCount += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failCount += 1;
    failures.push(name);
    console.error(`  ✗ ${name}\n      ${e && e.message}`);
  }
}

/** cond 为 true 时跳过（zstd 运行时不支持） */
function testSkip(cond, name, fn) {
  if (cond) {
    skipCount += 1;
    console.log(`  - SKIP ${name}（运行时无 zstd 能力）`);
    return;
  }
  test(name, fn);
}

function section(title) {
  console.log(`\n■ ${title}`);
}

// ── fixtures 帮助 ──
const ROOT = mkdtempSync(join(tmpdir(), 'evokit-m1-'));

function wf(p, content) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content, 'utf-8');
}

/** 写 JSONL：数组元素为对象（序列化）或字符串（原样写入，用于畸形/空行） */
function wfJsonl(p, items) {
  wf(p, items.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n') + '\n');
}

const ZSTD_COMPRESS_OK = typeof zlib.zstdCompressSync === 'function';
const ZSTD_DECOMPRESS_OK = typeof zlib.zstdDecompressSync === 'function';

/** 结果形态断言：三数组齐全 + counts 与数组等长（整源级跳过的 counts 全 0 用例单独断言） */
function assertShape(res, { events, files, skipped } = {}) {
  assert.ok(Array.isArray(res.events) && Array.isArray(res.files) && Array.isArray(res.skipped), 'events/files/skipped 三数组齐全');
  assert.deepEqual(res.counts, { events: res.events.length, files: res.files.length, skipped: res.skipped.length }, 'counts 与数组等长');
  if (events !== undefined) assert.equal(res.events.length, events, `events 数 = ${events}`);
  if (files !== undefined) assert.equal(res.files.length, files, `files 数 = ${files}`);
  if (skipped !== undefined) assert.equal(res.skipped.length, skipped, `skipped 数 = ${skipped}`);
}

// ════════ T-M1.1 state.js 水位线 ════════
section('T-M1.1 state.js 水位线');

const stateFile = join(ROOT, 'state', 'state.json');

test('loadState：文件不存在 → 空结构', () => {
  assert.deepEqual(loadState(stateFile), { sources: {} });
});

test('saveState/loadState 往返一致 + .tmp 不残留', () => {
  const st = {
    sources: {
      s1: { lastRunAt: '2026-11-06T00:00:00.000Z', counts: { events: 3, files: 2, skipped: 1 }, files: { 'C:/x': { size: 1, mtime: 2, hash: 'ab' } } },
    },
  };
  saveState(stateFile, st);
  assert.deepEqual(loadState(stateFile), st);
  assert.ok(!existsSync(`${stateFile}.tmp`), 'tmp 已 rename 消失');
});

test('fileFingerprint：size/mtime/hash（sha1 前 8 hex）', () => {
  const f = join(ROOT, 'state', 'a.txt');
  wf(f, 'hello m1');
  const fp = fileFingerprint(f);
  assert.equal(fp.size, 8);
  assert.equal(typeof fp.mtime, 'number');
  assert.match(fp.hash, /^[0-9a-f]{8}$/);
  wf(f, 'hello m1!');
  assert.notEqual(fileFingerprint(f).hash, fp.hash, '内容变化 → hash 变');
});

test('pickChangedFiles：新路径 / size/mtime/hash 任一变化算 changed', () => {
  const f = join(ROOT, 'state', 'a.txt');
  const fp = { path: f, ...fileFingerprint(f) };
  assert.equal(pickChangedFiles({ sources: {} }, 's', [fp]).changed.length, 1, '空水位线全 changed（模拟 --full）');
  const st = { sources: {} };
  updateSource(st, 's', { files: [fp], counts: { events: 0, files: 1, skipped: 0 }, lastRunAt: 'now' });
  assert.deepEqual(pickChangedFiles(st, 's', [fp]), { changed: [], unchanged: 1 }, '同指纹二跑 0 changed');
  assert.equal(pickChangedFiles(st, 's', [{ ...fp, mtime: fp.mtime + 999 }]).changed.length, 1, 'mtime 变 → changed');
  assert.equal(pickChangedFiles(st, 's', [{ ...fp, hash: 'ffffffff' }]).changed.length, 1, 'hash 变 → changed');
  assert.equal(pickChangedFiles(st, 's', [{ ...fp, size: fp.size + 1 }]).changed.length, 1, 'size 变 → changed');
});

test('updateSource：写入结构符合 §2.3.6 契约（路径映射）', () => {
  const st = { sources: {} };
  const rec = updateSource(st, 's1', { files: [{ path: 'C:/x', size: 1, mtime: 2, hash: 'ab' }], counts: { events: 1, files: 1, skipped: 0 } });
  assert.deepEqual(rec.files['C:/x'], { size: 1, mtime: 2, hash: 'ab' });
  assert.ok(rec.lastRunAt);
  assert.deepEqual(rec.counts, { events: 1, files: 1, skipped: 0 });
});

test('损坏自愈：坏 JSON → 备份 .bak-<ts> + 空结构', () => {
  const bad = join(ROOT, 'state', 'broken.json');
  const badText = '{ "sources": { 非法';
  wf(bad, badText);
  assert.deepEqual(loadState(bad), { sources: {} });
  const baks = readdirSync(dirname(bad)).filter(n => n.startsWith('broken.json.bak-'));
  assert.equal(baks.length, 1, '生成一个备份文件');
  assert.equal(readFileSync(join(dirname(bad), baks[0]), 'utf-8'), badText, '备份保留原文');
});

// ════════ T-M1.2 redact.js 脱敏 ════════
section('T-M1.2 redact.js 脱敏');

test('默认规则表共 7 类', () => {
  const names = DEFAULT_REDACT_RULES.map(r => r.name);
  assert.equal(names.length, 7);
  for (const n of ['openai-key', 'aws-key', 'bearer-token', 'secret-kv', 'private-ip', 'auth-header', 'jdbc-url']) {
    assert.ok(names.includes(n), `含 ${n}`);
  }
});

test('① sk- 开头 API Key', () => {
  const r = redact('我的 key 是 sk-abc123XYZDEF456GHY789IJK0 请收好');
  assert.ok(!r.text.includes('sk-abc123'), '原文不再可见');
  assert.ok(r.text.includes('[REDACTED]'));
  assert.deepEqual(r.hits, [{ rule: 'openai-key', count: 1 }]);
});

test('② AKIA AWS AccessKeyId', () => {
  const r = redact('配置里写着 AKIAIOSFODNN7EXAMPLE 别外传');
  assert.ok(!r.text.includes('AKIAIOSFODNN7EXAMPLE'));
  assert.deepEqual(r.hits, [{ rule: 'aws-key', count: 1 }]);
});

test('③ Bearer token', () => {
  const r = redact('curl -H "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0" api');
  assert.ok(!r.text.includes('eyJhbGci'));
  assert.ok(r.hits.some(h => h.rule === 'bearer-token' && h.count === 1));
});

test('④ 键值形态 password/token/api_key 命中', () => {
  for (const sample of ['password: hunter2', 'api_key = "xyz123"', 'DB_TOKEN:abc456', 'passwd=hunter', 'access_key: AK-value-99']) {
    const r = redact(sample);
    assert.ok(r.text.includes('[REDACTED]'), `命中：${sample} → 实际输出 ${r.text}`);
  }
});

test('⑤ 私网 IPv4/端口命中（10/172.16-31/192.168）', () => {
  for (const sample of ['http://192.168.1.10:8080/api', 'http://10.0.0.5/db', 'conn 172.16.3.4:3000 ok']) {
    const r = redact(sample);
    assert.ok(r.text.includes('[REDACTED]'), `命中：${sample}`);
    assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(r.text.replace(/\[REDACTED\]/g, '')), '替换后无残留 IP');
  }
});

test('⑤ 127.0.0.1 保留不脱敏', () => {
  const r = redact('本机调试 http://127.0.0.1:3000/health');
  assert.ok(r.text.includes('127.0.0.1:3000'), '回环地址保留');
  assert.equal(r.hits.length, 0);
});

test('⑥ Authorization 请求头', () => {
  const r = redact('Authorization: Basic dXNlcjpwYXNzd29yZA==');
  assert.ok(!r.text.includes('dXNlcjpwYXNzd29yZA'));
  assert.ok(r.hits.some(h => h.rule === 'auth-header'));
});

test('⑦ jdbc 连接串（mysql/postgresql）', () => {
  const r = redact('url=jdbc:mysql://root:p455w0rd@localhost:3306/app');
  assert.ok(!r.text.includes('p455w0rd'));
  assert.ok(r.hits.some(h => h.rule === 'jdbc-url'));
  const r2 = redact('jdbc:postgresql://db.internal/prod');
  assert.ok(r2.text.includes('[REDACTED]'));
});

test('「token」一词的正常句子不误伤', () => {
  for (const s of ['The token expires at noon today', 'we should token refresh soon', 'tokenize: demo text']) {
    const r = redact(s);
    assert.equal(r.text, s, `原文保留：${s}`);
    assert.equal(r.hits.length, 0, `零命中：${s}`);
  }
});

test('extraPatterns 生效（命名 custom-<序号>）', () => {
  const r = redact('调用 foo-bar-12345 完成', ['foo-bar-\\d+']);
  assert.ok(!r.text.includes('foo-bar-12345'));
  assert.deepEqual(r.hits, [{ rule: 'custom-1', count: 1 }]);
});

test('坏正则/非法输入静默跳过不抛异常', () => {
  const r = redact('nothing here', ['[unclosed', '(?P<x>bad', 42, '']);
  assert.equal(r.text, 'nothing here');
  assert.equal(r.hits.length, 0);
});

test('同一规则多命中计数正确', () => {
  const r = redact('sk-aaaaaaaa11 和 sk-bbbbbbbb22 两个 key');
  assert.deepEqual(r.hits.filter(h => h.rule === 'openai-key'), [{ rule: 'openai-key', count: 2 }]);
});

// ════════ T-M1.3 + T-M1.4 适配器 ════════
section('T-M1.3 claude-projects / codex-rollout / memory-cards / trae-session-memory');

// ── claude-projects fixtures ──
const claudeRoot = join(ROOT, 'adapters', 'claude');
wfJsonl(join(claudeRoot, 'proj-a', 'session-1.jsonl'), [
  { type: 'user', message: { role: 'user', content: [{ type: 'text', text: '帮我查 fnm 用法' }] }, cwd: '/work/demo', sessionId: 's1', timestamp: '2026-11-01T10:00:00Z' },
  { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '用 fnm use 22' }, { type: 'tool_use', name: 'Bash', input: {} }] }, cwd: '/work/demo', sessionId: 's1', timestamp: '2026-11-01T10:00:05Z' },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { cmd: 'ls' } }] }, cwd: '/work/demo', sessionId: 's1' },
  { type: 'user', isMeta: true, message: { content: [{ type: 'text', text: 'meta 行不应出现' }] }, cwd: '/work/demo' },
  '{broken json 行',
]);
wfJsonl(join(claudeRoot, 'proj-a', 'subagents', 'side.jsonl'), [
  { type: 'user', message: { content: [{ type: 'text', text: '子代理不该出现' }] }, cwd: '/work/demo' },
]);
wfJsonl(join(claudeRoot, 'proj-b', 'session-2.jsonl'), [
  { type: 'user', message: { content: [{ type: 'text', text: '第二个项目的问题' }] }, cwd: '/work/other', sessionId: 's2', timestamp: '2026-11-02T09:00:00Z' },
]);

const claudeRes = ADAPTERS['claude-projects']({ id: 'claude-sessions', adapter: 'claude-projects', root: claudeRoot });

test('claude-projects：events/files/skipped 计数（isMeta 与 subagents 跳过、畸形行计数）', () => {
  assertShape(claudeRes, { events: 3, files: 2, skipped: 1 });
  assert.ok(claudeRes.skipped.some(s => s.reason.startsWith('malformed-line')), '畸形行计入 skipped');
});

test('claude-projects：text 块拼接、tool_use 忽略、cwd→project、ts ISO 归一', () => {
  const [e1, e2] = claudeRes.events;
  assert.equal(e1.kind, 'session');
  assert.equal(e1.source, 'claude-sessions');
  assert.equal(e1.project, '/work/demo');
  assert.equal(e1.sessionId, 's1');
  assert.equal(e1.ts, '2026-11-01T10:00:00.000Z');
  assert.equal(e1.text, '帮我查 fnm 用法');
  assert.equal(e2.text, '用 fnm use 22', 'tool_use 块不进 text');
  assert.ok(e2.meta.line >= 2, 'meta.line 指回原始行号');
  assert.ok(claudeRes.events.every(e => !e.text.includes('meta 行') && !e.text.includes('子代理')), 'isMeta 与 subagents 内容不出现');
});

test('claude-projects：files 指纹形态（8 hex / 不含 subagents）', () => {
  assert.ok(claudeRes.files.every(f => /^[0-9a-f]{8}$/.test(f.hash) && typeof f.mtime === 'number' && f.size > 0));
  assert.ok(claudeRes.files.every(f => !f.path.includes('subagents')));
});

test('claude-projects：cfg.since 按文件 mtime 过滤', () => {
  const old = join(claudeRoot, 'proj-b', 'session-2.jsonl');
  const past = new Date('2020-01-01T00:00:00Z');
  utimesSync(old, past, past);
  const r = ADAPTERS['claude-projects']({ id: 'claude-sessions', root: claudeRoot, since: '2026-08-01' });
  assert.ok(r.events.every(e => e.sessionId !== 's2'), '早于 since 的文件不产事件');
  assert.ok(r.skipped.some(s => s.reason === 'before-since'));
});

// ── codex-rollout fixtures ──
const codexRoot = join(ROOT, 'adapters', 'codex');
const codexCfg = { id: 'codex-sessions', adapter: 'codex-rollout', root: codexRoot };
wf(join(codexRoot, 'rollout-bad.jsonl.zst'), 'this is not zstd bytes'); // 解压必失败的坏文件
if (ZSTD_COMPRESS_OK) {
  const goodLines = [
    JSON.stringify({ timestamp: '2026-11-03T08:00:00Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'codex 用户问题' }] }, cwd: '/work/cx', sessionId: 'cx1' }),
    JSON.stringify({ timestamp: '2026-11-03T08:00:10Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'codex 助手回答' }] } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'agent_reasoning', text: '非 message 轮次不取' } }),
    '{broken',
    '', // 空行忽略不计畸形
  ];
  const zstFile = join(codexRoot, 'rollout-2026-11-03.jsonl.zst');
  // zstd 压缩输出是二进制，必须以 Buffer 直写（writeFileSync 不经编码转换）
  mkdirSync(dirname(zstFile), { recursive: true });
  writeFileSync(zstFile, zlib.zstdCompressSync(Buffer.from(goodLines.join('\n'), 'utf-8')));
}

testSkip(!ZSTD_COMPRESS_OK || !ZSTD_DECOMPRESS_OK, 'codex-rollout：zstd 解压 + 逐行提取 + 畸形行/坏文件跳过', () => {
  const r = ADAPTERS['codex-rollout'](codexCfg);
  assertShape(r, { events: 2, files: 1, skipped: 2 }); // skipped = 解压失败 1 + 畸形行 1
  assert.equal(r.events[0].text, 'codex 用户问题');
  assert.equal(r.events[0].project, '/work/cx');
  assert.equal(r.events[1].text, 'codex 助手回答');
  assert.ok(r.skipped.some(s => s.reason === 'decompress-failed'), '坏 zst 文件计 skipped');
  assert.ok(r.skipped.some(s => s.reason.startsWith('malformed-line')), '解压后畸形行计 skipped');
  assert.ok(r.files.every(f => !f.path.includes('rollout-bad')), '解压失败文件不进水位线');
  assert.ok(!r.events.some(e => e.text.includes('agent_reasoning')), '非 message 轮次不取');
});

testSkip(ZSTD_DECOMPRESS_OK, 'codex-rollout：运行时无 zstd → 整源 skipped（counts 全 0）', () => {
  const r = ADAPTERS['codex-rollout'](codexCfg);
  assert.deepEqual(r.counts, { events: 0, files: 0, skipped: 0 });
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].reason, 'node-zstd-unsupported');
});

// ── memory-cards fixtures ──
const memRoot = join(ROOT, 'adapters', 'memory');
wf(join(memRoot, 'feedback-1.md'), '记忆卡 A：fnm 比 nvm 快');
wf(join(memRoot, 'feedback-2.md'), '记忆卡 B：uv 替代 pip');
wf(join(memRoot, 'notes', 'MEMORY.md'), '子目录记忆卡 C');
wf(join(memRoot, 'readme.txt'), '非 md 不收');

test('memory-cards：glob 过滤 + kind=memory-card + 全文 text + 非递归缺省', () => {
  const r = ADAPTERS['memory-cards']({ id: 'qoder-cn-memory', root: memRoot, glob: 'feedback-*.md' });
  assertShape(r, { events: 2, files: 2, skipped: 0 });
  assert.ok(r.events.every(e => e.kind === 'memory-card'));
  assert.equal(r.events[0].text, '记忆卡 A：fnm 比 nvm 快');
  assert.ok(r.files.every(f => !f.path.includes('notes')), '非递归只扫根层');
});

test('memory-cards：recursive:true 收子目录、缺省 glob *.md', () => {
  const r = ADAPTERS['memory-cards']({ id: 'codearts-memory', root: memRoot, recursive: true });
  assertShape(r, { events: 3, files: 3, skipped: 0 });
  assert.ok(r.files.some(f => f.path.includes('notes')), '子目录 md 被收集');
});

test('memory-cards：超长全文截断到 4096 字符', () => {
  wf(join(memRoot, 'big-card.md'), '长'.repeat(5000));
  const r = ADAPTERS['memory-cards']({ id: 'q', root: memRoot, glob: 'big-card.md' });
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].text.length, 4096);
});

// ── trae-session-memory fixtures ──
const traeRoot = join(ROOT, 'adapters', 'trae');
wfJsonl(join(traeRoot, 'session_memory_p1.jsonl'), [
  { intent: '配置 fnm', actions: ['安装 fnm', '写入 shell 钩子'], outcome: '成功', learned: '钩子内 node 要用绝对路径', sessionId: 't1', timestamp: '2026-11-04T10:00:00Z' },
  { intent: 'deploy', actions: ['build'], outcome: 'ok', learned: '镜像要预热' },
  '{broken',
]);

test('trae-session-memory：四字段拼装成卡 + 畸形行跳过', () => {
  const r = ADAPTERS['trae-session-memory']({ id: 'trae-memory', root: traeRoot });
  assertShape(r, { events: 2, files: 1, skipped: 1 });
  const e = r.events[0];
  assert.equal(e.kind, 'memory-card');
  assert.ok(e.text.startsWith('intent: 配置 fnm'));
  assert.ok(e.text.includes('actions: 安装 fnm; 写入 shell 钩子'), 'actions 数组以 ; 拼接');
  assert.ok(e.text.includes('outcome: 成功'));
  assert.ok(e.text.includes('learned: 钩子内 node 要用绝对路径'));
  assert.equal(e.sessionId, 't1');
  assert.equal(r.events[1].text, 'intent: deploy\nactions: build\noutcome: ok\nlearned: 镜像要预热');
  assert.ok(r.skipped.some(s => s.reason.startsWith('malformed-line')));
});

// ════════ T-M1.4 P1 适配器 ════════
section('T-M1.4 jsonl-fields / pi-sessions / daily-log');

const histFile = join(ROOT, 'adapters', 'jsonl', 'history.jsonl');
wfJsonl(histFile, [
  { display: '查上海天气', timestamp: '2026-11-02T09:00:00Z', project: '/w/a', sessionId: 'h1' },
  { text: '纯 text 历史行', project: '/w/b' },
  { prompt: 'prompt 字段行' },
  { unrelated: '三个字段都没有的行不产事件' },
  '{broken',
]);

test('jsonl-fields：display|text|prompt 取值 + kind=history + 畸形行跳过', () => {
  const r = ADAPTERS['jsonl-fields']({ id: 'claude-history', root: histFile });
  assertShape(r, { events: 3, files: 1, skipped: 1 });
  assert.equal(r.events[0].kind, 'history');
  assert.equal(r.events[0].text, '查上海天气');
  assert.equal(r.events[0].project, '/w/a');
  assert.equal(r.events[0].ts, '2026-11-02T09:00:00.000Z');
  assert.equal(r.events[0].sessionId, 'h1');
  assert.equal(r.events[1].text, '纯 text 历史行');
  assert.equal(r.events[2].text, 'prompt 字段行');
  assert.ok(r.skipped.some(s => s.reason.startsWith('malformed-line')));
});

const piRoot = join(ROOT, 'adapters', 'pi');
wfJsonl(join(piRoot, 's1.jsonl'), [
  { role: 'user', content: [{ type: 'text', text: 'pi 用户问题' }] },
  { type: 'assistant', content: 'pi 助手回答字符串' },
  { role: 'tool', content: '工具输出不进事件' },
  { text: '裸 text 字段兜底' },
  '{broken',
]);

test('pi-sessions：宽松提取用户/助手文本 + tool 角色排除', () => {
  const r = ADAPTERS['pi-sessions']({ id: 'pi-sessions', root: piRoot });
  assertShape(r, { events: 3, files: 1, skipped: 1 });
  assert.equal(r.events[0].kind, 'session');
  assert.equal(r.events[0].text, 'pi 用户问题');
  assert.equal(r.events[1].text, 'pi 助手回答字符串');
  assert.equal(r.events[2].text, '裸 text 字段兜底');
  assert.ok(!r.events.some(e => e.text.includes('工具输出')), 'tool 角色不进事件');
  assert.ok(r.skipped.some(s => s.reason.startsWith('malformed-line')));
});

const dailyRoot = join(ROOT, 'adapters', 'daily', 'proj');
wf(join(dailyRoot, '.workbuddy', 'memory', '2026-11-05.md'), '# 日报一：记忆引擎 M1');
wf(join(dailyRoot, '.workbuddy', 'memory', '2026-11-06.md'), '# 日报二：适配器测试');
wf(join(dailyRoot, 'README.md'), '不在 .workbuddy 下，不收');

test('daily-log：缺省 glob 命中 **/.workbuddy/memory/*.md + kind=daily-log', () => {
  const r = ADAPTERS['daily-log']({ id: 'workbuddy-log', root: dailyRoot });
  assertShape(r, { events: 2, files: 2, skipped: 0 });
  assert.equal(r.events[0].kind, 'daily-log');
  assert.equal(r.events[0].text, '# 日报一：记忆引擎 M1');
  assert.ok(r.files.every(f => !f.path.endsWith('README.md')), 'glob 外文件不收');
});

// ════════ 横切：root-missing / 端到端增量闭环 ════════
section('横切用例');

test('全部 7 适配器：root 不存在 → root-missing 结构、counts 全 0、不抛异常', () => {
  const names = Object.keys(ADAPTERS);
  assert.equal(names.length, 7);
  for (const name of names) {
    const r = ADAPTERS[name]({ id: 'x', root: join(ROOT, 'no-such', name) });
    assert.ok(Array.isArray(r.events) && Array.isArray(r.files) && Array.isArray(r.skipped), `${name} 返回三数组`);
    assert.deepEqual(r.events, [], `${name} events 空`);
    assert.deepEqual(r.files, [], `${name} files 空`);
    assert.equal(r.skipped.length, 1, `${name} skipped 明细 1 条`);
    assert.equal(r.skipped[0].reason, 'root-missing', name);
    assert.deepEqual(r.counts, { events: 0, files: 0, skipped: 0 }, `${name} counts 全 0`);
  }
});

test('端到端：适配器 files × 水位线，二跑 0 changed、新增文件 changed', () => {
  const e2e = join(ROOT, 'e2e');
  wf(join(e2e, 'a.md'), '卡 A');
  wf(join(e2e, 'b.md'), '卡 B');
  const cfg = { id: 'e2e-src', root: e2e };
  const state = { sources: {} };
  const r1 = ADAPTERS['memory-cards'](cfg);
  assert.equal(pickChangedFiles(state, cfg.id, r1.files).changed.length, 2, '首跑全 changed');
  updateSource(state, cfg.id, { files: r1.files, counts: r1.counts });
  const r2 = ADAPTERS['memory-cards'](cfg);
  assert.deepEqual(pickChangedFiles(state, cfg.id, r2.files), { changed: [], unchanged: 2 }, '二跑 0 changed');
  wf(join(e2e, 'c.md'), '新卡 C');
  const r3 = ADAPTERS['memory-cards'](cfg);
  assert.equal(pickChangedFiles(state, cfg.id, r3.files).changed.length, 1, '新增文件 → changed');
});

// ── 收尾报告与清理 ──
console.log(`\n断言 ${passCount} 通过 / ${failCount} 失败 / ${skipCount} 跳过（zstd 运行时特性）`);
if (failCount > 0) {
  console.error(`失败用例：\n  - ${failures.join('\n  - ')}`);
  process.exitCode = 1;
}
try {
  rmSync(ROOT, { recursive: true, force: true });
} catch { /* Windows 偶发目录占用，清理失败不影响结果 */ }
