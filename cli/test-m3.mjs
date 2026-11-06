#!/usr/bin/env node
/**
 * EvoKit CLI 记忆引擎 M3 分发层测试（T-M3.1 + T-M3.3 + T-M0.3 遗留粘性权重）
 *
 * 自包含：直接 `node cli/test-m3.mjs` 运行；任一断言失败退出码 1。
 * 隔离：库函数测试用独立 mkdtemp 临时目录（路径均为显式入参）；CLI 冒烟通过
 * EVOKIT_HOME 重定向家目录（paths.js 加载时读 env，故先设 env 再动态 import）。
 *
 * 覆盖：
 *  - T-M3.1：knowledge-index 内置资源 → sync 后三入口托管块含「## EvoKit 知识」+ 索引行，
 *    块外内容逐字保留（含索引手写透传段）；源缺失时 sync 跳过并提示（exit 0，其他资源照常）。
 *  - 粘性权重（ADR 0009 §5）：61 卡 1 张最旧 pitfall 重建后仍在索引、无引用 workflow 被挤出；
 *    forge-use 引用同样产生粘性。
 *  - T-M3.3：recall 评分序（tag×3 ＞ 标题×2 ＞ 正文×1）、大小写不敏感、多 token 取最大分、
 *    --limit 解析容错、命中写 references、--json 单 JSON、无命中 exit 0、命令注册（help/拼错建议）。
 */

import { mkdtempSync, rmSync, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
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

const tmpRoot = mkdtempSync(join(tmpdir(), 'evokit-m3-'));
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

console.log(`隔离测试 home: ${tmpRoot}\n`);

// ── 1. T-M3.1：knowledge-index 资源 sync 分发 ──────────────
console.log('【1. T-M3.1 sync 分发三入口】');
const syncHome = mkdtempSync(join(tmpRoot, 'sync-'));
const entryFiles = {
  claude: join(syncHome, '.claude', 'CLAUDE.md'),
  pi: join(syncHome, '.pi', 'agent', 'APPEND_SYSTEM.md'),
  codex: join(syncHome, '.codex', 'AGENTS.md'),
};
const userContent = '# 我的手写规则\n自定义内容甲\n## 我的手写段\n手写未知段内容乙\n';
for (const f of Object.values(entryFiles)) {
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, userContent, 'utf-8'); // 预置块外用户内容（sync 只追加托管块，不得破坏）
}

// 1a. 源缺失（知识根未初始化）→ 跳过并提示，exit 0（readSource 本会抛 ENOENT，见报告）
const skipRun = runCli(['sync', '--resource', 'knowledge-index'], syncHome);
assert(skipRun.code === 0, `源缺失时 sync --resource knowledge-index 退出码 0（实际 ${skipRun.code}）`,
  (skipRun.stderr || skipRun.stdout).slice(0, 160));
assert(skipRun.stdout.includes('knowledge-index 未初始化') && skipRun.stdout.includes('knowledge init'),
  '源缺失输出「未初始化（运行 evokit knowledge init）」提示');
assert(!skipRun.stdout.includes('✗') && !skipRun.stderr.includes('✗'), '源缺失不输出 ✗ 错误');

// 1b. 初始化 + 写 3 张 confirmed 卡 + 重建索引（含手写透传段）后 sync
assert(runCli(['init'], syncHome).code === 0, 'evokit init 退出码 0');
assert(runCli(['knowledge', 'init'], syncHome).code === 0, 'knowledge init 退出码 0');
const kDir = join(syncHome, '.evokit', 'knowledge');
const idxFile = join(kDir, 'knowledge-index.md');
const cardIds = [];
for (let i = 1; i <= 3; i++) {
  cardIds.push(cards.writeCard(kDir, {
    front: {
      title: `分发卡 ${i}`,
      type: ['pitfall', 'pattern', 'fact'][i - 1],
      source: 'test-m3',
      status: 'confirmed',
      confidence: '0.9',
      updated: `2026-06-0${i}T00:00:00.000Z`,
      tags: [`t${i}`],
    },
    body: `分发卡正文 ${i}`,
  }));
}
appendFileSync(idxFile, '\n## 随手记\n\n手写透传内容\n', 'utf-8'); // 模拟用户手写透传段
{
  const { lines } = index.rebuildIndex(kDir, cards.listCards(kDir, { excludeHidden: true }), 60);
  const { unknown } = index.readIndex(idxFile);
  index.writeIndex(idxFile, lines, unknown); // 与 review.refreshIndex 同法重建
}
assert(runCli(['sync'], syncHome).code === 0, 'evokit sync（全局）退出码 0');
const resSync = runCli(['sync', '--resource', 'knowledge-index'], syncHome);
assert(resSync.code === 0, `sync --resource knowledge-index 退出码 0（实际 ${resSync.code}，${resSync.stderr.slice(0, 160)}）`);
for (const [id, file] of Object.entries(entryFiles)) {
  const content = readFileSync(file, 'utf-8');
  assert(content.includes('<!-- evokit-managed:start -->') && content.includes('<!-- evokit-managed:end -->'),
    `${id} 入口含托管块`);
  assert(content.includes('## EvoKit 知识'), `${id} 托管块含「## EvoKit 知识」桶 header`);
  assert(content.includes('全局偏好'), `${id} 同文件双资源合并：context 偏好内容与索引同块共存（不被覆盖）`);
  for (const cid of cardIds) assert(content.includes(`- [${cid}]`), `${id} 托管块含索引行 ${cid}`);
  assert(content.includes('## 随手记') && content.includes('手写透传内容'),
    `${id} 托管块含手写透传段（索引未知段随分发透传）`);
  assert(content.includes('自定义内容甲') && content.includes('手写未知段内容乙'),
    `${id} 块外用户内容逐字保留`);
}

// ── 1c. 隐式内置：老 settings 无 knowledge-index 条目时仍分发；enabled:false 可关闭 ──
console.log('\n【1c. 隐式内置资源（兼容老 settings）】');
{
  const legacyHome = mkdtempSync(join(tmpRoot, 'legacy-'));
  assert(runCli(['init'], legacyHome).code === 0, 'legacy home evokit init 退出码 0');
  // 模拟 v2.0 时代 settings：resources 剔除 knowledge-index（loadJson 不回填新增默认项）
  const legacyCfgPath = join(legacyHome, '.evokit', 'settings.json');
  const legacyCfg = JSON.parse(readFileSync(legacyCfgPath, 'utf-8'));
  legacyCfg.resources = legacyCfg.resources.filter((r) => r.id !== 'knowledge-index');
  writeFileSync(legacyCfgPath, JSON.stringify(legacyCfg, null, 2) + '\n', 'utf-8');
  assert(runCli(['knowledge', 'init'], legacyHome).code === 0, 'legacy home knowledge init 退出码 0');
  const legacyKDir = join(legacyHome, '.evokit', 'knowledge');
  const legacyIdx = join(legacyKDir, 'knowledge-index.md');
  cards.writeCard(legacyKDir, {
    front: { title: '老设置兼容卡', type: 'fact', source: 'test-m3', status: 'confirmed', confidence: '0.9' },
    body: '老设置兼容',
  });
  const { lines } = index.rebuildIndex(legacyKDir, cards.listCards(legacyKDir, { excludeHidden: true }), 60);
  const { unknown } = index.readIndex(legacyIdx);
  index.writeIndex(legacyIdx, lines, unknown);
  assert(runCli(['sync'], legacyHome).code === 0, 'legacy home sync 退出码 0');
  const legacyClaude = join(legacyHome, '.claude', 'CLAUDE.md');
  assert(readFileSync(legacyClaude, 'utf-8').includes('## EvoKit 知识'),
    '老 settings 缺 knowledge-index 条目时 sync 仍分发知识索引（隐式内置资源）');
  // enabled:false 显式关闭 → 重新 sync 后索引从托管块移除（只留 context）
  legacyCfg.resources.push({
    id: 'knowledge-index', type: 'text',
    source: '~/.evokit/knowledge/knowledge-index.md',
    targets: ['~/.claude/CLAUDE.md', '~/.pi/agent/APPEND_SYSTEM.md', '~/.codex/AGENTS.md'],
    enabled: false,
  });
  writeFileSync(legacyCfgPath, JSON.stringify(legacyCfg, null, 2) + '\n', 'utf-8');
  assert(runCli(['sync'], legacyHome).code === 0, '禁用后 sync 退出码 0');
  assert(!readFileSync(legacyClaude, 'utf-8').includes('## EvoKit 知识'),
    'enabled:false 后 sync 把知识索引从托管块移除（显式退出生效）');
  rmSync(legacyHome, { recursive: true, force: true });
}

// ── 2. 粘性权重（T-M0.3 遗留，ADR 0009 §5）────────────────
console.log('\n【2. 粘性权重：pitfall / forge-use】');
// 2a. 61 卡（1 张 pitfall 最旧）→ pitfall 留在索引，最旧的无引用 workflow 被挤出
const stickyDir = mkdtempSync(join(tmpRoot, 'sticky-'));
for (let i = 1; i <= 59; i++) {
  cards.writeCard(stickyDir, {
    front: {
      title: `填充卡 ${String(i).padStart(2, '0')}`,
      type: 'fact',
      source: 'test-m3',
      status: 'confirmed',
      confidence: '0.9',
      updated: new Date(Date.UTC(2026, 0, 3, 0, 0, i)).toISOString(),
    },
    body: `正文 ${i}`,
  });
}
const pitfallId = cards.writeCard(stickyDir, {
  front: {
    title: '最旧的坑卡', type: 'pitfall', source: 'test-m3', status: 'confirmed',
    confidence: '0.9', updated: '2026-01-01T00:00:00.000Z', // 全场最旧
  },
  body: '最旧 pitfall 正文',
});
const workflowId = cards.writeCard(stickyDir, {
  front: {
    title: '无引用工作流', type: 'workflow', source: 'test-m3', status: 'confirmed',
    confidence: '0.9', updated: '2026-01-02T00:00:00.000Z', // 非 sticky 层最旧
  },
  body: '无引用 workflow 正文',
});
{
  const r = index.rebuildIndex(stickyDir, cards.listCards(stickyDir, { excludeHidden: true }), 60);
  assert(r.lines.length === 60 && r.dropped.length === 1,
    `61 卡预算 60：索引 60 行挤出 1 张（实际 ${r.lines.length}/${r.dropped.length}）`);
  assert(r.lines.some((l) => l.includes(`[${pitfallId}]`)), '最旧 pitfall 因粘性仍在索引内');
  assert(!r.lines.some((l) => l.includes(`[${workflowId}]`)) && r.dropped[0] === workflowId,
    '被挤出的是无引用 workflow（非 sticky 层最旧）');
  const pitfallLine = r.lines.find((l) => l.includes(`[${pitfallId}]`));
  assert(pitfallLine.startsWith(`- [${pitfallId}] ⚠ `), `pitfall 行带 ⚠ 标记（实际 ${pitfallLine}）`);
}
// 2b. forge-use 引用同样产生粘性：最旧的 fact 被 forge-use 引用后反而存活
const forgeDir = mkdtempSync(join(tmpRoot, 'forge-'));
const mkDated = (dir, title, updated) => cards.writeCard(dir, {
  front: { title, type: 'fact', source: 'test-m3', status: 'confirmed', confidence: '0.5', updated },
  body: `${title} 正文`,
});
const oldestId = mkDated(forgeDir, '最旧但被技能引用', '2026-01-01T00:00:00.000Z');
const midId = mkDated(forgeDir, '中间卡', '2026-01-02T00:00:00.000Z');
const newestId = mkDated(forgeDir, '最新卡', '2026-01-03T00:00:00.000Z');
refs.appendReference(join(forgeDir, 'references.jsonl'), { type: 'forge-use', cardId: oldestId });
{
  const r = index.rebuildIndex(forgeDir, cards.listCards(forgeDir, { excludeHidden: true }), 2);
  assert(r.dropped.length === 1 && r.dropped[0] === midId,
    `forge-use 粘性：预算 2 挤出的是中间卡（实际 ${JSON.stringify(r.dropped)}）`);
  assert(r.lines.some((l) => l.includes(`[${oldestId}]`)) && r.lines.some((l) => l.includes(`[${newestId}]`)),
    '最旧 forge-use 卡与新卡都留在索引');
}

// ── 3. T-M3.3：recall 评分检索 ────────────────────────────
console.log('\n【3. recall 评分/计数/JSON】');
const recallHome = mkdtempSync(join(tmpRoot, 'recall-'));
assert(runCli(['knowledge', 'init'], recallHome).code === 0, 'recallHome knowledge init 退出码 0');
const rDir = join(recallHome, '.evokit', 'knowledge');
const G_ID = cards.writeCard(rDir, { // tag 命中 ×3（标题不含 fnm）
  front: { title: 'Node 版本切换工作流', type: 'workflow', source: 'test-m3', status: 'confirmed',
    confidence: '0.9', updated: '2026-06-01T00:00:00.000Z', tags: ['fnm', 'node'] },
  body: '切换 Node 版本的固定步骤。',
});
const T_ID = cards.writeCard(rDir, { // 标题子串命中 ×2
  front: { title: 'fnm 钩子内 node 不可用', type: 'pitfall', source: 'test-m3', status: 'confirmed',
    confidence: '0.8', updated: '2026-06-02T00:00:00.000Z', tags: ['node', 'hook'] },
  body: '钩子内用绝对路径调用 node。',
});
const B_ID = cards.writeCard(rDir, { // 正文子串命中 ×1；正文超 100 字符验摘要截断
  front: { title: '每日站会记录流程', type: 'fact', source: 'test-m3', status: 'confirmed',
    confidence: '0.7', updated: '2026-06-03T00:00:00.000Z', tags: ['meeting'] },
  body: '站会后在白板记录 fnm 相关问题，' + '细节待补充。'.repeat(30),
});
cards.writeCard(rDir, { // draft 不参与
  front: { title: '草稿不该出现', type: 'fact', source: 'test-m3', status: 'draft', tags: ['fnm'] },
  body: '草稿正文',
});
const retiredId = cards.writeCard(rDir, { // retired 不参与
  front: { title: '退役不该出现', type: 'fact', source: 'test-m3', status: 'confirmed', tags: ['fnm'] },
  body: '退役正文',
});
cards.retireCard(rDir, retiredId, {});

// 3a. 人类模式：评分序 tag ＞ 标题 ＞ 正文，行格式与标记
const humanRun = runCli(['recall', 'fnm'], recallHome);
assert(humanRun.code === 0, `recall 命中退出码 0（实际 ${humanRun.code}）`);
const iG = humanRun.stdout.indexOf(`[${G_ID}]`);
const iT = humanRun.stdout.indexOf(`[${T_ID}]`);
const iB = humanRun.stdout.indexOf(`[${B_ID}]`);
assert(iG !== -1 && iT !== -1 && iB !== -1, '三张卡均命中');
assert(iG < iT && iT < iB, '评分序：tag(3) 在标题(2) 前、标题(2) 在正文(1) 前');
assert(humanRun.stdout.includes(`[${G_ID}] 🔧 Node 版本切换工作流 (workflow, 3)`), 'workflow 卡行带 🔧 标记与 (type, score)');
assert(humanRun.stdout.includes(`[${T_ID}] ⚠ fnm 钩子内 node 不可用 (pitfall, 2)`), 'pitfall 卡行带 ⚠ 标记');
assert(humanRun.stdout.includes(`[${B_ID}] 每日站会记录流程 (fact, 1)`), 'fact 卡行无标记');
assert(humanRun.stdout.includes('路径: ') && humanRun.stdout.includes('摘要: '), '每条命中含路径行与摘要行');
const summaryLine = humanRun.stdout.split('\n').find((l) => l.startsWith('  摘要: ') && l.includes('站会后'));
{
  const text = summaryLine ? summaryLine.slice('  摘要: '.length) : '';
  assert(text.length === 100 && text.endsWith('…'), `摘要截断 ≤100 字符（实际 ${text.length}）`);
}
// draft/retired 不出现
assert(!humanRun.stdout.includes('草稿不该出现') && !humanRun.stdout.includes('退役不该出现'),
  'draft/retired 卡不参与检索');

// 3b. 命中写 references.jsonl（recall 事件）
const rFile = join(rDir, 'references.jsonl');
const recallEvents = refs.readReferences(rFile).filter((e) => e.type === 'recall');
assert(recallEvents.length === 3, `命中后 references.jsonl 出现 3 条 recall 事件（实际 ${recallEvents.length}）`);
assert([G_ID, T_ID, B_ID].every((id) => recallEvents.some((e) => e.cardId === id)),
  'recall 事件覆盖三张命中卡');

// 3c. --json：单个合法 JSON 数组，字段齐全，评分序一致
const jsonRun = runCli(['recall', 'fnm', '--json'], recallHome);
assert(jsonRun.code === 0, `recall --json 退出码 0（实际 ${jsonRun.code}）`);
let arr = null;
try { arr = JSON.parse(jsonRun.stdout.trim()); } catch { arr = null; }
assert(Array.isArray(arr) && arr.length === 3, '--json 输出单个合法 JSON 数组（3 元素）');
if (Array.isArray(arr)) {
  assert(arr[0].id === G_ID, `--json 评分序第一为 tag 命中卡（实际 ${arr[0].id}）`);
  const g = arr[0];
  assert(['id', 'title', 'type', 'score', 'path', 'tags'].every((k) => k in g), '--json 元素含 id/title/type/score/path/tags');
  assert(g.score === 3 && g.type === 'workflow' && Array.isArray(g.tags) && g.tags.includes('fnm'), '--json 字段取值正确');
  assert(existsSync(g.path), '--json path 指向真实卡片文件');
}

// 3d. 大小写不敏感（tags 全等）
const upperRun = runCli(['recall', 'FNM', '--json'], recallHome);
let upperArr = null;
try { upperArr = JSON.parse(upperRun.stdout.trim()); } catch { upperArr = null; }
assert(Array.isArray(upperArr) && upperArr[0] && upperArr[0].id === G_ID, 'tags 全等不分大小写（FNM 命中 fnm）');

// 3e. 多 token 取最大得分：B 卡 标题「站会」×2、正文 fnm ×1 → 取 2（非求和 3、非最小 1）
const multiRun = runCli(['recall', 'fnm', '站会', '--json'], recallHome);
let multiArr = null;
try { multiArr = JSON.parse(multiRun.stdout.trim()); } catch { multiArr = null; }
const bHit = Array.isArray(multiArr) ? multiArr.find((x) => x.id === B_ID) : null;
assert(bHit && bHit.score === 2, `多 token 取最大得分：B 卡 score=2（实际 ${bHit ? bHit.score : '未命中'}）`);
assert(Array.isArray(multiArr) && multiArr[0].id === G_ID, '多 token 场景 G 卡仍以 tag×3 居首');

// 3f. --limit：生效 + 解析容错
const limitRun = runCli(['recall', 'fnm', '--limit', '1', '--json'], recallHome);
let limitArr = null;
try { limitArr = JSON.parse(limitRun.stdout.trim()); } catch { limitArr = null; }
assert(Array.isArray(limitArr) && limitArr.length === 1 && limitArr[0].id === G_ID, '--limit 1 只输出 1 条');
const badLimitRun = runCli(['recall', 'fnm', '--limit', 'abc', '--json'], recallHome);
let badArr = null;
try { badArr = JSON.parse(badLimitRun.stdout.trim()); } catch { badArr = null; }
assert(badLimitRun.code === 0 && Array.isArray(badArr) && badArr.length === 3,
  '--limit abc 解析容错：回落默认值且 exit 0');
assert(badLimitRun.stderr.includes('不合法'), '--limit 非法值输出容错提示（stderr）');
const bareLimitRun = runCli(['recall', 'fnm', '--limit'], recallHome);
assert(bareLimitRun.code === 0 && (bareLimitRun.stdout.match(/\[k\d{8}-[0-9a-f]{8}\]/g) || []).length >= 1,
  '--limit 缺值容错：不崩溃且正常输出');

// 3g. 无命中 exit 0（人类模式友好提示 / --json 输出 []）
const missRun = runCli(['recall', '绝不存在的词zzz'], recallHome);
assert(missRun.code === 0, `无命中人类模式退出码 0（实际 ${missRun.code}）`);
assert(missRun.stdout.includes('未命中'), '无命中输出友好提示');
const missJsonRun = runCli(['recall', '绝不存在的词zzz', '--json'], recallHome);
assert(missJsonRun.code === 0 && missJsonRun.stdout.trim() === '[]', '--json 无命中输出 [] 且 exit 0');

// 3h. query 缺失 → 用法 + exit 1
const noQueryRun = runCli(['recall'], recallHome);
assert(noQueryRun.code === 1, `缺 query 退出码 1（实际 ${noQueryRun.code}）`);
assert(noQueryRun.stdout.includes('用法'), '缺 query 打印用法');

// ── 4. recall 命令注册（KNOWN_COMMANDS / help / 拼错建议）──
console.log('\n【4. recall 命令注册】');
const helpRun = runCli(['help'], recallHome);
assert(helpRun.stdout.includes('recall'), 'help 含 recall');
const typoRun = runCli(['recal'], recallHome);
assert(typoRun.code === 1, `拼错 recal 退出码 1（实际 ${typoRun.code}）`);
assert((typoRun.stdout + typoRun.stderr).includes('recall'), '拼错 recal 建议_recall');

// ── 清理与汇总 ────────────────────────────────────────────
console.log('\n【清理测试目录】');
try { rmSync(tmpRoot, { recursive: true, force: true }); ok('临时目录已清理'); } catch (e) { fail('临时目录清理', e.message); }

console.log(`\n========== 测试结果：${passed} 通过 / ${failed} 失败 ==========`);
process.exit(failed > 0 ? 1 : 0);
