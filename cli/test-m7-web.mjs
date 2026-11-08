#!/usr/bin/env node
/**
 * EvoKit web 服务端测试（M7）
 *
 * 通过 EVOKIT_HOME 把数据根重定向到临时目录，进程内启动 web 服务（listen 0 取实际端口），
 * 用 fetch 验证：13 个端点契约、只读纪律（目录快照零变化）、安全边界（穿越/白名单/未匹配方法）、
 * 稳定性（handler 抛错后进程不退出）、优雅关闭、静态托管与产物缺失降级。
 *
 * 运行：node cli/test-m7-web.mjs
 * 纪律：EVOKIT_HOME 必须在任何 cli/src 模块动态 import 之前设置（paths.js 在模块加载时读环境变量）。
 * 夹具铺设在 test-m7-fixture.mjs（纯 fs，无 cli/src 依赖）。
 */

import { writeFileSync, rmSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildFixture } from './test-m7-fixture.mjs';

let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}
function fail(name, detail) {
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
}
function assert(cond, name, detail) {
  cond ? ok(name) : fail(name, typeof detail === 'string' ? detail : JSON.stringify(detail));
}

// ── 夹具：EVOKIT_HOME 必须最先设置 ──
const fx = buildFixture();
process.env.EVOKIT_HOME = fx.tmp;

// ── 此后才能动态 import cli/src 模块 ──
const { startServer } = await import('./src/web/server.js');
const { collectPartsForTarget, joinParts } = await import('./src/entry-content.js');

// ── 入口文件夹具：consistent / drifted / missing 三态 ──
function writeEntry(file, block) {
  writeFileSync(file, `<!-- evokit-managed:start -->\n${block}\n<!-- evokit-managed:end -->\n`, 'utf-8');
}
const expectedClaude = joinParts(collectPartsForTarget(fx.claudeEntry).present);
writeEntry(fx.claudeEntry, expectedClaude); // 与期望一致 → consistent
const expectedPi = joinParts(collectPartsForTarget(fx.piEntry).present);
writeEntry(fx.piEntry, `${expectedPi}\n（人工追加，制造漂移）`); // 块内容不一致 → drifted
// codex 入口不写文件 → missing

// ── 只读纪律：目录快照（路径 → size:mtime）──
function snapshot() {
  const out = new Map();
  walk(fx.tmp, '');
  return out;
  function walk(abs, rel) {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      const p = join(abs, entry.name);
      if (entry.isDirectory()) walk(p, r);
      else {
        const st = statSync(p);
        out.set(r, `${st.size}:${st.mtimeMs}`);
      }
    }
  }
}

async function jget(path, init) {
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* 非 JSON 响应保持 null */ }
  return { status: res.status, body, text, headers: res.headers };
}

const before = snapshot();
const srv = await startServer({
  port: 0,
  staticRoot: fx.staticDir,
  extraRoutes: [{ path: '/api/__boom', handler: () => { throw new Error('炸了'); } }],
});
const base = srv.url;
console.log(`\n—— web 服务端测试（${base}）——`);

// ── 1. overview ──
{
  const r = await jget('/api/overview');
  assert(r.status === 200, 'overview 200', r.status);
  assert(r.body?.counts?.confirmed === 3 && r.body?.counts?.pending === 1
    && r.body?.counts?.archive === 1 && r.body?.counts?.rejected === 1,
  'overview 计数 3/1/1/1', r.body?.counts);
  assert(r.body?.indexEntries === 2, 'overview 索引行数 2', r.body?.indexEntries);
  assert(r.body?.syncSummary?.consistent === 1 && r.body?.syncSummary?.drifted === 1
    && r.body?.syncSummary?.missing === 1,
  'overview 同步摘要 1/1/1', r.body?.syncSummary);
  if (fx.gitOk) assert(!!r.body?.lastKnowledgeCommit?.hash, 'overview 最近提交存在', r.body?.lastKnowledgeCommit);
}

// ── 2. 卡片列表（默认 updated 降序 + type/tag 筛选）──
{
  const r = await jget('/api/cards');
  assert(r.status === 200 && r.body?.cards?.length === 3, 'cards 列表 3 张 confirmed', r.body?.cards?.length);
  assert(r.body?.cards?.[0]?.id === fx.ids.A, 'cards 默认 updated 降序（A 在前）', r.body?.cards?.[0]?.id);
  assert(Array.isArray(r.body?.cards?.[0]?.front?.tags), 'cards front.tags 为数组');
  const rType = await jget('/api/cards?type=fact');
  assert(rType.body?.cards?.length === 1 && rType.body?.cards?.[0]?.id === fx.ids.B, 'cards?type=fact 过滤');
  const rTag = await jget(`/api/cards?tag=${encodeURIComponent('软链接')}`);
  assert(rTag.body?.cards?.length === 1 && rTag.body?.cards?.[0]?.id === fx.ids.A, 'cards?tag=软链接 过滤');
}

// ── 3. 卡片详情 ──
{
  const r = await jget(`/api/cards/${fx.ids.A}`);
  assert(r.status === 200 && r.body?.front?.title === '夹具卡A 软链接主题', '详情 front 正确', r.body?.front?.title);
  assert(r.body?.body?.includes('夹具卡A正文'), '详情 body 正确');
  assert(r.body?.recallHits === 2, '详情 recallHits=2', r.body?.recallHits);
  assert(typeof r.body?.hasGit === 'boolean', '详情 hasGit 为布尔');
  assert(r.body?.zone === '已入库', '详情 zone 标签', r.body?.zone);
  const miss = await jget('/api/cards/nope');
  assert(miss.status === 404 && miss.body?.error?.code === 'not_found', '详情不存在 → 404 JSON', miss.status);
  const cn = await jget(`/api/cards/${encodeURIComponent(fx.ids.CN)}`);
  assert(cn.status === 200 && cn.body?.front?.title === '中文卡测试用例', '中文 id 详情（路由参数解码）', cn.status);
  const traversal = await jget('/api/cards/..%2F..%2Fsettings.json');
  assert(traversal.status === 404, '详情 id 穿越载荷 → 404', traversal.status);
}

// ── 4. 三分区 ──
{
  const pending = await jget('/api/pending');
  assert(pending.body?.cards?.length === 1 && pending.body?.cards?.[0]?.id === fx.ids.DRAFT, 'pending 1 张');
  const archive = await jget('/api/archive');
  assert(archive.body?.cards?.length === 1 && archive.body?.cards?.[0]?.id === fx.ids.ARCHIVE, 'archive 1 张');
  const rejected = await jget('/api/rejected');
  assert(rejected.body?.cards?.length === 1 && rejected.body?.cards?.[0]?.id === fx.ids.REJECT, 'rejected 1 张');
}

// ── 5. 检索（与 recall 同口径，且不写 references）──
{
  const r1 = await jget(`/api/search?q=${encodeURIComponent('软链接')}`);
  assert(Array.isArray(r1.body) && r1.body?.length === 1 && r1.body?.[0]?.id === fx.ids.A && r1.body?.[0]?.score === 3,
    'search 标签全等 ×3', JSON.stringify(r1.body));
  const r2 = await jget(`/api/search?q=${encodeURIComponent('夹具')}`);
  assert(Array.isArray(r2.body) && r2.body?.length === 2 && r2.body?.[0]?.id === fx.ids.A,
    'search 标题子串 ×2 且引用数决胜（A 在前）', JSON.stringify(r2.body));
  const empty = await jget('/api/search?q=');
  assert(empty.status === 400 && empty.body?.error?.code === 'bad_request', 'search 空 q → 400', empty.status);
}

// ── 6. 同步状态 ──
{
  const r = await jget('/api/sync-status');
  const byId = Object.fromEntries((r.body?.entries ?? []).map((e) => [e.id, e]));
  assert((r.body?.entries ?? []).length === 3, 'sync-status 三个入口', r.body?.entries?.length);
  assert(byId.claude?.status === 'consistent', 'claude consistent', byId.claude?.status);
  assert(byId.pi?.status === 'drifted', 'pi drifted', byId.pi?.status);
  assert(byId.codex?.status === 'missing' && byId.codex?.lastSyncAt === null, 'codex missing', byId.codex?.status);
  assert(!!byId.claude?.lastSyncAt, 'claude lastSyncAt 非空', byId.claude?.lastSyncAt);
}

// ── 7. git 历史 ──
{
  const r = await jget('/api/history');
  if (fx.gitOk) {
    assert(r.body?.available === true && (r.body?.commits?.length ?? 0) >= 1, 'history available + 提交≥1', r.body?.available);
    assert(r.body?.commits?.[0]?.hash?.length === 40, 'history hash 40 位', r.body?.commits?.[0]?.hash);
    assert(r.body?.commits?.[0]?.subject?.includes('fixture'), 'history 提交主题', r.body?.commits?.[0]?.subject);
    const one = await jget(`/api/history/${fx.ids.A}`);
    assert(one.body?.available === true && (one.body?.commits?.length ?? 0) >= 1, '单卡 --follow 历史', one.body?.commits?.length);
  } else {
    assert(r.body?.available === false, '无 git → available:false（降级）', r.body?.available);
  }
  const ghost = await jget('/api/history/no-such-id');
  assert(ghost.body?.commits?.length === 0, '未知卡 id → commits 空');
}

// ── 8. 召回统计 ──
{
  const r = await jget('/api/recall-stats');
  assert(r.body?.total === 3, 'recall-stats total=3', r.body?.total);
  assert(r.body?.byCard?.[0]?.cardId === fx.ids.A && r.body?.byCard?.[0]?.count === 2, '按卡 Top：A 2 次', JSON.stringify(r.body?.byCard?.[0]));
  assert(r.body?.byCard?.[0]?.title?.includes('夹具卡A'), 'byCard 带标题');
  assert(JSON.stringify(r.body?.byDay) === JSON.stringify([
    { day: '2026-11-07', count: 1 }, { day: '2026-11-08', count: 2 },
  ]), '按日分布升序', JSON.stringify(r.body?.byDay));
}

// ── 9. 报告库 ──
{
  const r = await jget('/api/reports');
  assert(r.body?.reports?.length === 1 && r.body?.reports?.[0]?.name === 'evokit-inventory-20261108.md', 'reports 清单 1 份');
  assert(typeof r.body?.reports?.[0]?.size === 'number' && !!r.body?.reports?.[0]?.mtime, 'reports 带 size/mtime');
  const one = await jget('/api/reports/evokit-inventory-20261108.md');
  assert(one.status === 200 && one.body?.raw?.includes('审计报告'), '报告原文可读');
  const nope = await jget('/api/reports/nope.md');
  assert(nope.status === 404, '报告白名单：不存在 → 404', nope.status);
  const traversal = await jget('/api/reports/%2e%2e%2fsettings.json');
  assert(traversal.status === 404, '报告白名单：穿越载荷 → 404', traversal.status);
}

// ── 10. 采集概览 ──
{
  const r = await jget('/api/inbox');
  assert(r.body?.sources?.length === 1 && r.body?.sources?.[0]?.id === 'claude-sessions', 'inbox 源列表');
  assert(r.body?.sources?.[0]?.events === 42 && r.body?.sources?.[0]?.files === 3, 'inbox 聚合计数（不吐明细）',
    JSON.stringify(r.body?.sources?.[0]));
  assert(r.body?.distill?.filesTracked === 2 && !!r.body?.distill?.lastRunAt, 'distill 水位线聚合', JSON.stringify(r.body?.distill));
}

// ── 11. context ──
{
  const r = await jget('/api/context');
  assert(r.status === 200 && r.body?.raw?.includes('测试偏好'), 'context raw');
  assert((r.body?.targets ?? []).length === 3 && r.body?.targets?.[0]?.id === 'claude', 'context targets 3 入口');
}

// ── 12. 静态托管 ──
{
  const home = await jget('/');
  assert(home.status === 200 && home.text?.includes('夹具页'), 'GET / → index.html');
  const js = await jget('/assets/app.js');
  assert(js.status === 200 && (js.headers?.get('content-type') ?? '').includes('text/javascript'), 'assets js + content-type');
  const fallback = await jget('/some/deep/link');
  assert(fallback.status === 200 && fallback.text?.includes('夹具页'), '无扩展名路径兜底 index.html');
  const traversal = await jget('/assets/..%2f..%2f..%2f.evokit%2fsettings.json');
  assert(traversal.status >= 400 && traversal.status < 500, '静态穿越载荷 → 4xx', traversal.status);
}

// ── 13. 方法与未知端点 ──
{
  const post = await jget('/api/cards', { method: 'POST' });
  assert(post.status === 404 && post.body?.error?.code === 'not_found', 'POST → 统一 404 JSON', post.status);
  const unknown = await jget('/api/nope');
  assert(unknown.status === 404 && unknown.body?.error?.code === 'not_found', '未知 API → 404 JSON');
}

// ── 14. 错误边界：handler 抛错 → 500 且进程存活 ──
{
  const boom = await jget('/api/__boom');
  assert(boom.status === 500 && boom.body?.error?.code === 'internal', 'boom → 500 internal', boom.status);
  const alive = await jget('/api/overview');
  assert(alive.status === 200, 'boom 后服务仍响应（进程不退出）');
}

// ── 15. 只读纪律：快照对比 ──
{
  const after = snapshot();
  const changed = [...after.keys()].filter((k) => before.get(k) !== after.get(k));
  assert(changed.length === 0, `全端点遍历后数据目录零变化（${before.size} 个文件）`, changed.join(', '));
}

// ── 16. 优雅关闭 + 产物缺失降级 ──
{
  await srv.close();
  let refused = false;
  try { await fetch(`${base}/api/overview`); } catch { refused = true; }
  assert(refused, 'close() 后端口不再响应');

  const srv2 = await startServer({ port: 0, staticRoot: join(fx.tmp, 'no-such-dist') });
  const r = await fetch(`${srv2.url}/`);
  const body = await r.json();
  assert(r.status === 503 && body?.error?.message?.includes('构建'), '产物缺失 → 503 + 构建提示', r.status);
  await srv2.close();
}

rmSync(fx.tmp, { recursive: true, force: true });
console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exitCode = 1;
