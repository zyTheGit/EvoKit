#!/usr/bin/env node
/**
 * EvoKit CLI 记忆引擎 M5 自动化层测试（T-M5.1 hook learn-enqueue + learn triggers 消费；
 * T-M5.3 knowledge gc 实实现 + inventory 知识库区块）
 *
 * 自包含：直接 `node cli/test-m5.mjs` 运行；任一断言失败退出码 1。
 * 隔离：库函数测试用显式路径入参；CLI 冒烟通过 EVOKIT_HOME 重定向家目录（spawnSync 子进程注入 env）。
 *
 * 覆盖：
 *  - T-M5.1 hook learn-enqueue：正常写触发文件 + exit 0；--json stdout 单一合法 JSON 且 queued:true；
 *    TRIGGERS_DIR 被同名文件占用 → 仍 exit 0、错误只在 stderr（--json 时 stdout 单 JSON queued:false、不含 stack）；
 *    未知子命令用法 + exit 1。
 *  - learn 消费：触发文件被删（消费即删，含损坏文件）、报告「收到 N 条会话学习触发」、无触发不误报。
 *  - T-M5.3 knowledge gc：--dry-run 不移动不清理；正式 gc 归档 retired + validUntil 过期卡到 .archive/
 *    （validUntil=今天不归档）、索引重建无已归档行且未知透传段保留、.rejected 超期文件被清（utimes 伪造 mtime）、
 *    汇总输出归档/清理/剩余 confirmed。
 *  - inventory：知识根存在 → 扫描输出含知识库区块且 prompt 含卡片行（id/title/type/status/tags）；
 *    不存在 → 一行提示且不影响其他区块。
 *  - 命令注册：hook 进 KNOWN_COMMANDS（拼错建议）与 help；knowledge gc 进 help；未知子命令 usage + exit 1。
 */

import { mkdtempSync, rmSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, 'evokit.mjs');

let passed = 0;
let failed = 0;
function ok(name) { passed++; console.log(`  ✓ ${name}`); }
function fail(name, detail) { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
function assert(cond, name, detail) { cond ? ok(name) : fail(name, detail); }

const tmpRoot = mkdtempSync(join(tmpdir(), 'evokit-m5-'));
// 先设隔离 env 再动态 import：paths.js 在模块加载时读取 EVOKIT_HOME
process.env.EVOKIT_HOME = tmpRoot;
const cards = await import('./src/knowledge-cards.js');
const index = await import('./src/knowledge-index.js');
const refs = await import('./src/references.js');

/** 在隔离 CLI 子进程里跑 evokit（home 参数决定 EVOKIT_HOME） */
const runCli = (args, home) => {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, EVOKIT_HOME: home },
    encoding: 'utf-8',
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
};

/** 列出目录下的非隐藏文件名（不存在返回 []） */
const listFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => !n.startsWith('.')) : []);

/** 本地日期 YYYY-MM-DD（validUntil 边界用，与 gc 的 --before 缺省同源逻辑） */
const today = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

console.log(`隔离测试 home: ${tmpRoot}\n`);

// ── 1. hook learn-enqueue 正常入队 ────────────────────────
console.log('【1. hook learn-enqueue 正常写入触发文件】');
const hookHome = mkdtempSync(join(tmpRoot, 'hook-'));
const trigDir = join(hookHome, '.evokit', 'triggers');
const h1 = runCli(['hook', 'learn-enqueue', '--session', 'sess-abc-123'], hookHome);
assert(h1.code === 0, `exit 0（实际 ${h1.code}）`, (h1.stderr || '').slice(0, 160));
const tFiles = listFiles(trigDir);
assert(tFiles.length === 1 && /^learn-.*\.json$/.test(tFiles[0]),
  `触发文件写入 learn-*.json（实际 ${JSON.stringify(tFiles)}）`);
if (tFiles.length === 1) {
  const payload = JSON.parse(readFileSync(join(trigDir, tFiles[0]), 'utf-8'));
  assert(payload.session === 'sess-abc-123', `--session 透传到触发文件（实际 ${JSON.stringify(payload.session)}）`);
  assert(typeof payload.ts === 'string' && !Number.isNaN(new Date(payload.ts).getTime()), 'ts 为 ISO 时间');
  assert(payload.cwd === process.cwd(), 'cwd 记录进程工作目录');
}
assert(h1.stdout.trim() === '', '非 --json 成功路径 stdout 静默（钩子 stdout 可能进模型上下文）');

// ── 2. hook --json：stdout 单一合法 JSON ─────────────────
console.log('\n【2. hook --json 单一合法 JSON】');
const h2 = runCli(['hook', 'learn-enqueue', '--json', '--session', 'sess-json'], hookHome);
assert(h2.code === 0, `exit 0（实际 ${h2.code}）`);
let h2Json = null;
try { h2Json = JSON.parse(h2.stdout.trim()); } catch { h2Json = null; }
assert(h2Json !== null, `stdout 可整体 JSON.parse（实际 ${h2.stdout.slice(0, 120)}）`);
if (h2Json) {
  assert(h2Json.ok === true && h2Json.queued === true, `--json 成功形如 {"ok":true,"queued":true,…}（实际 ${JSON.stringify(h2Json)}）`);
  assert(typeof h2Json.file === 'string' && /^learn-.*\.json$/.test(h2Json.file), `file 为触发文件名（实际 ${JSON.stringify(h2Json.file)}）`);
  if (typeof h2Json.file === 'string') {
    assert(existsSync(join(trigDir, h2Json.file)), 'file 指向真实存在的触发文件');
    if (existsSync(join(trigDir, h2Json.file))) {
      assert(JSON.parse(readFileSync(join(trigDir, h2Json.file), 'utf-8')).session === 'sess-json',
        '--json 路径同样透传 session');
    }
  }
}
// 无 --session：仍入队成功（session 键为 null）
const h2b = runCli(['hook', 'learn-enqueue', '--json'], hookHome);
let h2bJson = null;
try { h2bJson = JSON.parse(h2b.stdout.trim()); } catch { h2bJson = null; }
assert(h2b.code === 0 && h2bJson && h2bJson.queued === true && typeof h2bJson.file === 'string',
  '无 --session 也入队成功（queued:true）');

// ── 3. TRIGGERS_DIR 被同名文件占用 → 仍 exit 0，错误只进 stderr ──
console.log('\n【3. TRIGGERS_DIR 被文件占用仍 exit 0】');
const blockedHome = mkdtempSync(join(tmpRoot, 'blocked-'));
mkdirSync(join(blockedHome, '.evokit'), { recursive: true });
writeFileSync(join(blockedHome, '.evokit', 'triggers'), 'occupied', 'utf-8'); // 同名路径预置为文件，使 mkdirSync 失败
const h3 = runCli(['hook', 'learn-enqueue'], blockedHome);
assert(h3.code === 0, `非 --json：仍 exit 0（实际 ${h3.code}）`);
assert(h3.stderr.trim().length > 0, '错误信息出现在 stderr');
assert(h3.stdout.trim() === '', '非 --json：stdout 无输出（错误不进 stdout，堆栈不泄漏）');
const h3j = runCli(['hook', 'learn-enqueue', '--json'], blockedHome);
assert(h3j.code === 0, `--json：仍 exit 0（实际 ${h3j.code}）`);
let h3Json = null;
try { h3Json = JSON.parse(h3j.stdout.trim()); } catch { h3Json = null; }
assert(h3Json !== null, `--json stdout 可整体 JSON.parse（实际 ${h3j.stdout.slice(0, 200)}）`);
if (h3Json) {
  assert(h3Json.ok === true && h3Json.queued === false && typeof h3Json.error === 'string' && h3Json.error.length > 0,
    `--json 出错形如 {"ok":true,"queued":false,"error":"…"}（实际 ${JSON.stringify(h3Json)}）`);
}
assert(!h3j.stdout.toLowerCase().includes('stack'), 'stdout 不含 stack 字样（堆栈禁入 stdout）');

// ── 4. learn 消费 triggers（消费即删）─────────────────────
console.log('\n【4. learn 消费 triggers】');
const learnHome = mkdtempSync(join(tmpRoot, 'learn-'));
const learnTrigDir = join(learnHome, '.evokit', 'triggers');
mkdirSync(learnTrigDir, { recursive: true });
writeFileSync(join(learnTrigDir, 'learn-20261105T010101-ab12.json'),
  JSON.stringify({ ts: '2026-11-05T01:01:01.000Z', session: 'sess-t1', cwd: learnHome }), 'utf-8');
writeFileSync(join(learnTrigDir, 'learn-20261105T010202-cd34.json'),
  JSON.stringify({ ts: '2026-11-05T01:02:02.000Z', session: null, cwd: learnHome }), 'utf-8'); // 合法但无 session：计入条数不进集合
writeFileSync(join(learnTrigDir, 'learn-20261105T010303-ee99.json'), '{broken json', 'utf-8'); // 损坏文件：删除跳过不计数
const l1 = runCli(['learn', '--no-distill'], learnHome);
assert(l1.code === 0, `learn exit 0（实际 ${l1.code}）`, (l1.stderr || '').slice(0, 200));
assert(listFiles(learnTrigDir).length === 0, '触发文件全部删除（消费即删，含损坏文件）');
assert(l1.stdout.includes('收到 2 条会话学习触发'),
  `报告收到条数（实际命中：${(l1.stdout.match(/收到[^\n]*/) || ['（无）'])[0].slice(0, 60)}）`);
// 再次运行：无触发时不误报
const l2 = runCli(['learn', '--no-distill'], learnHome);
assert(l2.code === 0 && !l2.stdout.includes('会话学习触发'), '无触发时不误报，learn 照常全量增量');
// --session 与触发共存：消费照常进行
writeFileSync(join(learnTrigDir, 'learn-20261105T030303-ef56.json'),
  JSON.stringify({ ts: '2026-11-05T03:03:03.000Z', session: 'sess-t2', cwd: learnHome }), 'utf-8');
const l3 = runCli(['learn', '--no-distill', '--session', 'sess-cli'], learnHome);
assert(l3.code === 0 && l3.stdout.includes('收到 1 条会话学习触发'),
  `--session 并入集合时 learn 正常消费（实际 ${l3.code}）`);

// ── 5. knowledge gc --dry-run 只列表不移动 ────────────────
console.log('\n【5. knowledge gc --dry-run】');
const gcHome = mkdtempSync(join(tmpRoot, 'gc-'));
assert(runCli(['knowledge', 'init'], gcHome).code === 0, 'knowledge init 退出码 0');
const kDir = join(gcHome, '.evokit', 'knowledge');
const idxFile = join(kDir, 'knowledge-index.md');
const idRetired = cards.writeCard(kDir, {
  front: { title: '已退役卡', type: 'fact', source: 'test-m5', status: 'retired', confidence: '0.8', updated: '2026-01-01T00:00:00.000Z' },
  body: 'retired 正文',
});
const idExpired = cards.writeCard(kDir, {
  front: { title: 'validUntil 过期卡', type: 'fact', source: 'test-m5', status: 'confirmed', confidence: '0.8', updated: '2026-01-02T00:00:00.000Z', validUntil: '2026-01-15' },
  body: '过期正文',
});
const idToday = cards.writeCard(kDir, {
  front: { title: 'validUntil 今天卡', type: 'fact', source: 'test-m5', status: 'confirmed', confidence: '0.8', updated: '2026-01-03T00:00:00.000Z', validUntil: today() },
  body: '今天到期（严格 < before，不归档）',
});
const idKeep = cards.writeCard(kDir, {
  front: { title: '长期有效卡', type: 'fact', source: 'test-m5', status: 'confirmed', confidence: '0.9', updated: '2026-01-04T00:00:00.000Z' },
  body: '保留正文',
});
mkdirSync(join(kDir, '.rejected'), { recursive: true });
writeFileSync(join(kDir, '.rejected', 'old-reject.md'), '---\ntitle: 旧拒绝\n---\n旧正文\n', 'utf-8');
writeFileSync(join(kDir, '.rejected', 'new-reject.md'), '---\ntitle: 新拒绝\n---\n新正文\n', 'utf-8');
const oldMs = Date.now() - 100 * 86400000; // 100 天前（> 默认 90 天保留期）
const oldDate = new Date(oldMs); // Windows 上 utimesSync 需 Date/秒，毫秒数会 EINVAL
utimesSync(join(kDir, '.rejected', 'old-reject.md'), oldDate, oldDate); // 伪造 mtime
// gc 前建索引（过期 confirmed 卡在索引内，归档后应消失）+ 手写透传段（gc 后必须保留）
{
  const { lines } = index.rebuildIndex(kDir, cards.listCards(kDir, { excludeHidden: true }), 60);
  const { unknown } = index.readIndex(idxFile);
  index.writeIndex(idxFile, lines, unknown);
  appendFileSync(idxFile, '\n## 随手记\n\n手写透传内容\n', 'utf-8');
}
const g1 = runCli(['knowledge', 'gc', '--dry-run'], gcHome);
assert(g1.code === 0, `gc --dry-run exit 0（实际 ${g1.code}）`, (g1.stderr || '').slice(0, 160));
assert(g1.stdout.includes(idRetired) && g1.stdout.includes(idExpired), 'dry-run 列出 retired 与 validUntil 过期卡');
assert(!g1.stdout.includes(idToday) && !g1.stdout.includes(idKeep), 'validUntil=今天 与长期有效卡不列入归档');
assert(g1.stdout.includes('old-reject.md'), 'dry-run 列出超期 .rejected 文件');
assert(!g1.stdout.includes('new-reject.md'), '未超期 .rejected 文件不列出');
assert(existsSync(join(kDir, `${idRetired}.md`)) && existsSync(join(kDir, `${idExpired}.md`)), 'dry-run 不移动卡片');
assert(existsSync(join(kDir, '.rejected', 'old-reject.md')), 'dry-run 不清理 .rejected');

// ── 6. knowledge gc 正式执行：归档 + 清理 + 索引重建 ──────
console.log('\n【6. knowledge gc 归档/清理/索引重建】');
const g2 = runCli(['knowledge', 'gc'], gcHome);
assert(g2.code === 0, `gc exit 0（实际 ${g2.code}）`, (g2.stderr || '').slice(0, 160));
const arcDir = join(kDir, '.archive');
const arcFiles = listFiles(arcDir);
assert(arcFiles.length === 2, `归档 2 张卡到 .archive/（实际 ${JSON.stringify(arcFiles)}）`);
assert(arcFiles.some((n) => n.startsWith(idRetired)) && arcFiles.some((n) => n.startsWith(idExpired)),
  'retired 与过期卡都在 .archive/');
assert(!existsSync(join(kDir, `${idRetired}.md`)) && !existsSync(join(kDir, `${idExpired}.md`)), '原位置卡片已移走');
assert(existsSync(join(kDir, `${idToday}.md`)) && existsSync(join(kDir, `${idKeep}.md`)),
  'validUntil=今天 与长期有效卡保留在 knowledge/');
assert(!existsSync(join(kDir, '.rejected', 'old-reject.md')) && existsSync(join(kDir, '.rejected', 'new-reject.md')),
  '仅超期 .rejected 文件被清理');
const idxAfter = index.readIndex(idxFile);
assert(idxAfter.evokit.length === 2, `索引重建后 2 行（实际 ${idxAfter.evokit.length}）`);
assert(idxAfter.evokit.every((l) => l.id !== idRetired && l.id !== idExpired),
  '索引重建无 retired/已归档卡行');
assert(idxAfter.evokit.some((l) => l.id === idToday) && idxAfter.evokit.some((l) => l.id === idKeep),
  '索引仍含保留卡行');
assert(idxAfter.unknown.some((s) => s.header === '## 随手记' && s.text.includes('手写透传内容')),
  'gc 后未知透传段逐字保留（红线 #1）');
assert(g2.stdout.includes('归档 2 张') && g2.stdout.includes('清理 .rejected 1 个') && g2.stdout.includes('剩余 confirmed 2 张'),
  `汇总输出归档/清理/剩余 confirmed（实际：${(g2.stdout.match(/📊[^\n]*/) || ['（无）'])[0].slice(0, 120)}）`);

// ── 7. inventory 知识库区块 ───────────────────────────────
console.log('\n【7. inventory 知识库区块】');
const invHome = mkdtempSync(join(tmpRoot, 'inv-'));
assert(runCli(['knowledge', 'init'], invHome).code === 0, 'knowledge init 退出码 0');
const ikDir = join(invHome, '.evokit', 'knowledge');
const invA = cards.writeCard(ikDir, {
  front: { title: '体检卡甲', type: 'pattern', source: 'test-m5', status: 'confirmed', confidence: '0.9', tags: ['t-a'], updated: '2026-05-01T00:00:00.000Z' },
  body: '甲',
});
cards.writeCard(ikDir, {
  front: { title: '体检卡乙', type: 'pitfall', source: 'test-m5', status: 'confirmed', confidence: '0.7', tags: ['t-b'], updated: '2026-05-02T00:00:00.000Z' },
  body: '乙',
});
cards.writeCard(ikDir, {
  front: { title: '退役计数卡', type: 'fact', source: 'test-m5', status: 'retired', confidence: '0.5' },
  body: '退',
});
cards.writeCard(join(ikDir, '.pending'), {
  front: { title: '待审草稿', type: 'fact', source: 'test-m5', status: 'draft', confidence: '0.6' },
  body: '草',
});
refs.appendReference(join(ikDir, 'references.jsonl'), { type: 'recall', cardId: invA });
refs.appendReference(join(ikDir, 'references.jsonl'), { type: 'recall', cardId: invA });
{
  const { lines } = index.rebuildIndex(ikDir, cards.listCards(ikDir, { excludeHidden: true }), 60);
  const { unknown } = index.readIndex(join(ikDir, 'knowledge-index.md'));
  index.writeIndex(join(ikDir, 'knowledge-index.md'), lines, unknown);
}
const i1 = runCli(['inventory', '--prompt'], invHome);
assert(i1.code === 0, `inventory --prompt exit 0（实际 ${i1.code}）`, (i1.stderr || '').slice(0, 160));
assert(i1.stdout.includes('## 知识库'), '扫描输出（{inventory} 输入）含知识库区块');
assert(i1.stdout.includes('confirmed 2 · draft 0 · retired 1 · .pending 草稿 1 · references 事件 2 · 索引行 2'),
  '计数行齐全（三态卡/.pending/references/索引行）');
assert(i1.stdout.includes(`- [${invA}] 体检卡甲（type=pattern, status=confirmed） #t-a`),
  'prompt 输出含卡片行（id/title/type/status/tags）');
assert(i1.stdout.includes('体检卡乙'), 'prompt 输出含其余卡片行');
// 知识根不存在：一行提示，不影响其他区块
const invEmpty = mkdtempSync(join(tmpRoot, 'inv-empty-'));
const i2 = runCli(['inventory', '--prompt'], invEmpty);
assert(i2.code === 0, `无知识根 inventory --prompt exit 0（实际 ${i2.code}）`);
assert(i2.stdout.includes('知识根未初始化（evokit knowledge init）'), '知识根未初始化输出一行提示');
assert(i2.stdout.includes('# 全局（个人）知识库清单'), '其他区块不受影响（全局清单头仍在）');

// ── 8. hook / knowledge gc 命令注册 ──────────────────────
console.log('\n【8. hook / knowledge gc 命令注册】');
const regHome = mkdtempSync(join(tmpRoot, 'reg-'));
const helpOut = runCli(['help'], regHome);
assert(helpOut.code === 0 && helpOut.stdout.includes('hook learn-enqueue'), 'help 含 hook learn-enqueue');
assert(helpOut.stdout.includes('knowledge gc'), 'help 含 knowledge gc');
const typo1 = runCli(['hok'], regHome);
assert(typo1.code === 1 && (typo1.stdout + typo1.stderr).includes('hook'),
  `拼错 hok 建议 hook（KNOWN_COMMANDS 已注册，实际 ${typo1.code}）`);
const typo2 = runCli(['hook', 'unknown-sub'], regHome);
assert(typo2.code === 1 && typo2.stdout.includes('用法'), 'hook 未知子命令打印用法并 exit 1');
const typo3 = runCli(['knowledge', 'gcc'], regHome);
assert(typo3.code === 1 && typo3.stdout.includes('用法'), 'knowledge 未知子命令打印用法并 exit 1');

// ── 清理与汇总 ────────────────────────────────────────────
console.log('\n【清理测试目录】');
try { rmSync(tmpRoot, { recursive: true, force: true }); ok('临时目录已清理'); } catch (e) { fail('临时目录清理', e.message); }

console.log(`\n========== 测试结果：${passed} 通过 / ${failed} 失败 ==========`);

process.exit(failed > 0 ? 1 : 0);
