#!/usr/bin/env node
/**
 * EvoKit CLI 记忆引擎 M0 地基测试（T-M0.2 ~ T-M0.5）
 *
 * 自包含：直接 `node cli/test-m0.mjs` 运行；任一断言失败退出码 1。
 * 隔离：库函数测试用独立 mkdtemp 临时目录；CLI 冒烟通过 EVOKIT_HOME 重定向家目录
 *（paths.js 加载时读 env，故先设 env 再动态 import）。
 *
 * 覆盖：frontmatter 往返全等（CRLF/BOM/两种数组/未知键/中文+emoji）、非法卡校验、
 * id 格式、第三 section 逐字保留（硬验收）、旧 header 别名、61 卡预算滚动、
 * merge/conflictWith 语义、references 追加与损坏行容错、CLI 冒烟（init/review/help/拼错建议）。
 */

import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deepStrictEqual } from 'node:assert';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, 'evokit.mjs');

let passed = 0;
let failed = 0;
function ok(name) { passed++; console.log(`  ✓ ${name}`); }
function fail(name, detail) { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
function assert(cond, name, detail) { cond ? ok(name) : fail(name, detail); }
function throws(fn, name) {
  try { fn(); fail(name, '未抛出异常'); } catch { ok(name); }
}
const tmpRoot = mkdtempSync(join(tmpdir(), 'evokit-m0-'));
// 先设隔离 env 再动态 import：paths.js 在模块加载时读取 EVOKIT_HOME
process.env.EVOKIT_HOME = tmpRoot;
const paths = await import('./src/paths.js');
const cards = await import('./src/knowledge-cards.js');
const index = await import('./src/knowledge-index.js');
const refs = await import('./src/references.js');

console.log(`隔离测试 home: ${tmpRoot}\n`);

// ── 1. frontmatter 受限解析：往返全等（parse → serialize → parse 全等）──
console.log('【1. frontmatter 往返全等】');
const roundtripCases = [
  {
    name: '基本扁平键',
    md: ['---', 'title: 用户偏好 fnm', 'type: preference', 'source: session-abc', 'status: confirmed', 'confidence: 0.9', '---', '', '正文内容。'].join('\n'),
  },
  {
    name: 'CRLF + 逐行数组',
    md: ['---', 'title: CRLF 卡', 'type: fact', 'source: src-1', 'status: draft', 'tags:', '  - node', '  - hook', '---', '', '第一段。', '', '第二段。'].join('\r\n'),
  },
  {
    name: 'BOM + [a,b] 行内数组',
    md: ['\uFEFF---', 'title: BOM 卡', 'type: pattern', 'source: src-2', 'status: confirmed', 'tags: [a, b, c]', '---', '', '内容'].join('\n'),
  },
  {
    name: '未知键保留 + 中文 + emoji',
    md: ['---', 'title: 🐛 pitfall 卡：⚠ 谨慎', 'type: pitfall', 'source: 会话史 #12', 'status: confirmed', 'customKey: 自定义未知值', 'customList:', '  - 甲', '  - 乙', '---', '', '正文含 emoji 🎉 与中文。'].join('\n'),
  },
  {
    name: '两形态混合 + 空数组 + 引号标量',
    md: ['---', 'title: 混合卡', 'type: workflow', 'source: src-3', 'status: confirmed', 'empty: []', 'quoted: "带引号的值"', 'rowTags:', '  - x, y', '---', '', 'body'].join('\n'),
  },
  {
    name: '纯标量无数组 + 空 body',
    md: ['---', 'title: 纯标量卡', 'type: fact', 'source: src-4', 'status: retired', '---'].join('\n'),
  },
  {
    name: 'body 以前导空行 + 多空行开头',
    md: ['---', 'title: 空 body 变体', 'type: fact', 'source: src-5', 'status: draft', '---', '', '', '第二行才是正文'].join('\n'),
  },
];
for (const c of roundtripCases) {
  try {
    const p1 = cards.parseCard(c.md);
    assert(p1 !== null, `${c.name}：parse 非 null`);
    if (!p1) continue;
    const md2 = cards.serializeCard(p1.front, p1.body);
    const p2 = cards.parseCard(md2);
    let same = false;
    try { deepStrictEqual(p2, p1); same = true; } catch (e) { same = false; }
    assert(same, `${c.name}：parse(serialize(parse)) 全等`, '两次 parse 结果不一致');
    deepStrictEqual(cards.serializeCard(p2.front, p2.body), md2);
    ok(`${c.name}：serialize 幂等`);
    assert(!md2.includes('\r') && !md2.startsWith('\uFEFF'), `${c.name}：写侧 LF 无 BOM`);
  } catch (e) {
    fail(`${c.name}：往返`, e.message);
  }
}

// ── 2. 非法卡校验 ─────────────────────────────────────────
console.log('\n【2. 非法卡校验】');
const legal = { title: '合法卡', type: 'fact', source: 's', status: 'draft' };
deepStrictEqual(cards.validateCard(legal), []);
ok('合法卡无错误');
const badCases = [
  ['缺 title', { type: 'fact', source: 's', status: 'draft' }, 'title'],
  ['缺 type', { title: 't', source: 's', status: 'draft' }, 'type'],
  ['缺 source', { title: 't', type: 'fact', status: 'draft' }, 'source'],
  ['缺 status', { title: 't', type: 'fact', source: 's' }, 'status'],
  ['confidence 1.5', { ...legal, confidence: '1.5' }, 'confidence'],
  ['confidence -0.1', { ...legal, confidence: '-0.1' }, 'confidence'],
  ['confidence abc', { ...legal, confidence: 'abc' }, 'confidence'],
  ['type 越界', { ...legal, type: 'news' }, 'type'],
  ['status 越界', { ...legal, status: 'archived' }, 'status'],
];
for (const [name, front, expectKey] of badCases) {
  const errs = cards.validateCard(front);
  assert(errs.length > 0 && errs.join('\n').includes(expectKey), `拒绝：${name}`, JSON.stringify(errs));
}
throws(() => cards.writeCard(join(tmpRoot, 'no-such-dir'), { front: { ...legal, status: 'archived' } }), 'writeCard 非法卡抛错');
deepStrictEqual(cards.parseCard('没有 frontmatter 的普通 markdown'), null);
ok('无 frontmatter 返回 null');
deepStrictEqual(cards.parseCard(['---', 'title: 只有开头', ''].join('\n')), null);
ok('frontmatter 未闭合返回 null');

// ── 3. id 格式 ────────────────────────────────────────────
console.log('\n【3. 卡片 id】');
const id1 = cards.makeCardId('标题', 'src', new Date('2026-11-06T08:00:00Z'));
assert(/^k\d{8}-[0-9a-f]{8}$/.test(id1), `id 格式 kYYYYMMDD-8hex（实际 ${id1}）`);
assert(id1.startsWith('k20261106-'), 'id 日期部分按本地日期');
assert(cards.makeCardId('标题', 'src', new Date('2026-11-06T08:00:00Z')) === id1, '同输入幂等');
assert(cards.makeCardId('标题', 'src', new Date('2026-11-06T09:00:00Z')) !== id1, '不同 ts 不同 id');

// ── 4. 第三 section 逐字保留（硬验收）+ 旧 header 别名 ────
console.log('\n【4. 索引读写：透传段逐字 + 旧 header 别名】');
const idxDir = mkdtempSync(join(tmpRoot, 'idx-'));
const idxFile = join(idxDir, 'knowledge-index.md');
const handWritten = [
  '# EvoKit 知识索引',
  '',
  '## EvoKit 知识',
  '',
  '- [k20261106-aaaaaaaa] ⚠ 示例卡 #node',
  '- [k20261106-bbbbbbbb] 🏛 模式卡',
  '',
  '## 随手记',
  '',
  '今天买了咖啡 ☕',
  '记得给花浇水',
  '',
  '## 助手原生记忆',
  '',
  '- 助手自己的备注（2026-11-06）',
  '',
].join('\n');
writeFileSync(idxFile, handWritten, 'utf-8');
const r1 = index.readIndex(idxFile);
assert(r1.evokit.length === 2, `EvoKit 桶提取 2 行（实际 ${r1.evokit.length}）`);
assert(r1.unknown.length === 2, `透传段 2 个（实际 ${r1.unknown.length}）`);
const note1 = r1.unknown.find((u) => u.header === '## 随手记');
const note2 = r1.unknown.find((u) => u.header === '## 助手原生记忆');
assert(note1 && note1.text === '\n今天买了咖啡 ☕\n记得给花浇水\n', '随手记段逐字（含 header 后空行与尾空行）');
assert(note2 && note2.text === '\n- 助手自己的备注（2026-11-06）\n', '助手原生记忆段逐字');

// 重建（全新行）后手写段逐字仍在 —— ADR 0009 验收 1
index.writeIndex(idxFile, ['- [k20261106-cccccccc] 重建后的新行'], r1.unknown);
const rebuilt = readFileSync(idxFile, 'utf-8');
assert(rebuilt.includes('## 随手记\n\n今天买了咖啡 ☕\n记得给花浇水\n'), '硬验收：重建后随手记段逐字仍在');
assert(rebuilt.includes('## 助手原生记忆\n\n- 助手自己的备注（2026-11-06）'), '硬验收：重建后助手原生记忆段仍在');
const r2 = index.readIndex(idxFile);
assert(r2.unknown[0].text === note1.text, '二次读写 unknown text 全等');
assert(r2.evokit.length === 1 && r2.evokit[0].id === 'k20261106-cccccccc', '重建桶被整体替换');

// 旧 header 别名：## 个人知识 → EvoKit 桶（写后变新名、条目行数量不变）
const legacyFile = join(idxDir, 'legacy-personal.md');
writeFileSync(legacyFile, ['## 个人知识', '', '- [k20261106-dddddddd] 旧个人条目一', '- [k20261106-eeeeeeee] 旧个人条目二', '- [k20261106-ffffffff] 旧个人条目三', ''].join('\n'), 'utf-8');
const lp = index.readIndex(legacyFile);
assert(lp.evokit.length === 3 && lp.unknown.length === 0, '## 个人知识 归 EvoKit 桶');
index.writeIndex(legacyFile, lp.evokit.map((e) => e.text), lp.unknown);
const lpAfter = readFileSync(legacyFile, 'utf-8');
assert(lpAfter.includes('## EvoKit 知识') && !lpAfter.includes('## 个人知识'), '写后 header 变新名');
assert((lpAfter.match(/^- \[/gm) || []).length === 3, '条目行数量不变');

// 旧 header 别名：## 项目知识 → 透传桶（保留原文）
const legacyProjFile = join(idxDir, 'legacy-project.md');
writeFileSync(legacyProjFile, ['## 项目知识', '', '项目私有备注', ''].join('\n'), 'utf-8');
const lpr = index.readIndex(legacyProjFile);
assert(lpr.evokit.length === 0 && lpr.unknown.length === 1 && lpr.unknown[0].header === '## 项目知识', '## 项目知识 归透传桶');
index.writeIndex(legacyProjFile, [], lpr.unknown);
assert(readFileSync(legacyProjFile, 'utf-8').includes('## 项目知识\n\n项目私有备注'), '## 项目知识 段写回逐字保留');

// extractIdFromLine / buildIndexLine
assert(index.extractIdFromLine('- [k20261106-7f3a2c] ⚠ fnm 钩子内 node 不可用 #hook') === 'k20261106-7f3a2c', 'extractIdFromLine 提取 id');
assert(index.extractIdFromLine('- 普通列表行') === null, 'extractIdFromLine 非 - [id] 行返回 null');
const line = index.buildIndexLine({ id: 'k20261106-12345678', front: { title: '标题', type: 'pitfall', tags: ['node', 'hook'] } });
assert(line === '- [k20261106-12345678] ⚠ 标题 #node #hook', `buildIndexLine pitfall 标记 + tags（实际 ${line}）`);
assert(index.buildIndexLine({ id: 'k1', front: { title: 't', type: 'fact' } }) === '- [k1] t', 'buildIndexLine 其余类型无标记');
assert(index.buildIndexLine({ id: 'k2', front: { title: 't', type: 'pattern' } }) === '- [k2] 🏛 t', 'buildIndexLine pattern 标记');
assert(index.buildIndexLine({ id: 'k3', front: { title: 't', type: 'workflow' } }) === '- [k3] 🔧 t', 'buildIndexLine workflow 标记');

// ── 5. 预算滚动：61 张 confirmed → 索引 ≤60 行，被挤出者文件仍在 ──
console.log('\n【5. 预算滚动 61 卡】');
const cardsDir = mkdtempSync(join(tmpRoot, 'cards-'));
const idByTitle = new Map();
for (let i = 1; i <= 61; i++) {
  const front = {
    title: `滚动卡 ${String(i).padStart(3, '0')}`,
    type: i % 7 === 0 ? 'pitfall' : 'fact',
    source: 'test-suite',
    status: 'confirmed',
    confidence: String((i % 100) / 100),
    updated: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
    tags: ['t' + i],
  };
  idByTitle.set(i, cards.writeCard(cardsDir, { front, body: `正文 ${i}` }));
}
const all = cards.listCards(cardsDir);
assert(all.length === 61, `listCards 递归列出 61 张（实际 ${all.length}）`);
const refFile = join(cardsDir, 'references.jsonl');
const rebuilt61 = index.rebuildIndex(cardsDir, all, 60);
assert(rebuilt61.lines.length === 60, `索引行数 ≤60（实际 ${rebuilt61.lines.length}）`);
assert(rebuilt61.dropped.length === 1, `挤出 1 张（实际 ${rebuilt61.dropped.length}）`);
const droppedId = rebuilt61.dropped[0];
assert(droppedId === idByTitle.get(1), '无引用数据时按 updated 挤出最旧者（卡 1）');
assert(cards.readCardById(cardsDir, droppedId) !== null, '被挤出卡片文件仍在库中');
// 写入引用后：最近引用的卡最优先（even 被挤过的卡）
refs.appendReference(refFile, { type: 'recall', cardId: droppedId });
const rebuiltWithRef = index.rebuildIndex(cardsDir, cards.listCards(cardsDir), 60);
assert(rebuiltWithRef.lines[0].includes(`[${droppedId}]`), '最近引用 desc：被引用卡排最前');
assert(rebuiltWithRef.dropped.length === 1 && rebuiltWithRef.dropped[0] !== droppedId, '挤出者换成未引用的最旧卡');
// draft/retired 不进索引
const draftFront = { title: '草稿卡', type: 'fact', source: 't', status: 'draft' };
const draftId = cards.writeCard(cardsDir, { front: draftFront });
const retiredId = idByTitle.get(2);
cards.retireCard(cardsDir, retiredId, {});
const rebuilt3 = index.rebuildIndex(cardsDir, cards.listCards(cardsDir), 60);
assert(!rebuilt3.lines.some((l) => l.includes(`[${draftId}]`)), 'draft 卡不进索引');
assert(!rebuilt3.lines.some((l) => l.includes(`[${retiredId}]`)), 'retired 卡不进索引');

// ── 6. merge / conflictWith 语义 ──────────────────────────
console.log('\n【6. merge / conflictWith】');
const mergeDir = mkdtempSync(join(tmpRoot, 'merge-'));
const keepId = cards.writeCard(mergeDir, { front: { title: 'canonical 卡', type: 'fact', source: 't', status: 'confirmed' } });
const dropId = cards.writeCard(mergeDir, { front: { title: '重复卡', type: 'fact', source: 't', status: 'confirmed' } });
cards.mergeCards(mergeDir, keepId, dropId);
const dropAfter = cards.readCardById(mergeDir, dropId);
const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
assert(dropAfter.front.status === 'retired', 'merge 后 drop 卡 status=retired');
assert(dropAfter.front.mergedInto === keepId, 'merge 后 drop 卡 mergedInto 指向 canonical');
assert(dropAfter.front.validUntil === todayStr, `validUntil 置今天（实际 ${dropAfter.front.validUntil}）`);
const keepAfter = cards.readCardById(mergeDir, keepId);
assert(keepAfter.front.status === 'confirmed' && keepAfter.front.mergedInto === undefined, 'keep 卡不动');
const mergedLines = index.rebuildIndex(mergeDir, cards.listCards(mergeDir), 60).lines;
assert(mergedLines.length === 1 && mergedLines[0].includes(`[${keepId}]`), 'merge 后索引只留 canonical');
throws(() => cards.mergeCards(mergeDir, 'k20990101-00000000', dropId), 'merge canonical 不存在抛错');
// conflictWith 互写 + 数组扩展
const aId = cards.writeCard(mergeDir, { front: { title: '结论 A', type: 'fact', source: 't', status: 'confirmed' } });
const bId = cards.writeCard(mergeDir, { front: { title: '结论 B', type: 'fact', source: 't', status: 'confirmed' } });
const cId = cards.writeCard(mergeDir, { front: { title: '结论 C', type: 'fact', source: 't', status: 'confirmed' } });
cards.setConflict(mergeDir, aId, bId);
assert(cards.readCardById(mergeDir, aId).front.conflictWith.includes(bId), 'A 卡 conflictWith 含 B');
assert(cards.readCardById(mergeDir, bId).front.conflictWith.includes(aId), 'B 卡 conflictWith 含 A');
cards.setConflict(mergeDir, aId, cId);
const aAfter = cards.readCardById(mergeDir, aId).front.conflictWith;
assert(Array.isArray(aAfter) && aAfter.includes(bId) && aAfter.includes(cId), '多次冲突数组扩展');
throws(() => cards.setConflict(mergeDir, aId, 'k20990101-00000000'), 'conflict 对象不存在抛错');
assert(cards.retireCard(mergeDir, 'k20990101-00000000', {}) === false, 'retire 不存在卡返回 false');

// ── 7. references.jsonl ───────────────────────────────────
console.log('\n【7. references 追加与容错】');
const refDir = mkdtempSync(join(tmpRoot, 'refs-'));
const refFile2 = join(refDir, 'references.jsonl');
refs.appendReference(refFile2, { type: 'recall', cardId: 'c1' });
refs.appendReference(refFile2, { type: 'l2', cardId: 'c2', note: 'L2 命中' });
refs.appendReference(refFile2, { type: 'review-update', cardId: 'c3' });
refs.appendReference(refFile2, { type: 'forge-use', cardId: 'c4' });
appendFileSync(refFile2, '这一行是损坏的 JSON\n\n', 'utf-8');
const allRefs = refs.readReferences(refFile2);
assert(allRefs.length === 4, `损坏行与空行跳过，读回 4 条（实际 ${allRefs.length}）`);
assert(allRefs[1].note === 'L2 命中', 'note 字段保留');
throws(() => refs.appendReference(refFile2, { type: 'bogus', cardId: 'c1' }), '非法引用类型抛错');
const manualRef = join(refDir, 'manual.jsonl');
writeFileSync(manualRef, ['{"ts":"2026-01-01T00:00:00.000Z","type":"recall","cardId":"c1"}', '{"ts":"2026-06-01T00:00:00.000Z","type":"recall","cardId":"c1"}', '{"ts":"2026-03-01T00:00:00.000Z","type":"l2","cardId":"c2"}', ''].join('\n'), 'utf-8');
const lm = refs.lastRefMap(manualRef);
assert(lm.get('c1') === '2026-06-01T00:00:00.000Z', 'lastRefMap 取最近 ts');
assert(lm.get('c2') === '2026-03-01T00:00:00.000Z', 'lastRefMap 单条透传');
deepStrictEqual(refs.readReferences(join(refDir, 'no-such.jsonl')), []);
ok('文件不存在返回空数组');

// ── 8. diffIndex 悬空/孤儿 ────────────────────────────────
console.log('\n【8. diffIndex 悬空/孤儿】');
const diffDir = mkdtempSync(join(tmpRoot, 'diff-'));
const daId = cards.writeCard(diffDir, { front: { title: '入库卡', type: 'fact', source: 't', status: 'confirmed', updated: '2026-05-01T00:00:00.000Z' } });
cards.writeCard(diffDir, { front: { title: '草稿卡', type: 'fact', source: 't', status: 'draft' } });
const db = index.rebuildIndex(diffDir, cards.listCards(diffDir), 60);
index.writeIndex(join(diffDir, 'knowledge-index.md'), db.lines, []);
let d1 = index.diffIndex(diffDir);
assert(d1.dangling.length === 0, `正式卡无悬空（实际 ${JSON.stringify(d1.dangling)}）`);
assert(d1.orphan.length === 1, `draft 草稿为孤儿（实际 ${JSON.stringify(d1.orphan)}）`);
// 手工制造悬空：索引指向不存在的 id
const cur = index.readIndex(join(diffDir, 'knowledge-index.md'));
index.writeIndex(join(diffDir, 'knowledge-index.md'), ['- [k20990101-ffffffff] 幽灵行'], cur.unknown);
d1 = index.diffIndex(diffDir);
assert(d1.dangling.includes('k20990101-ffffffff'), '索引行无对应文件 → dangling');

// ── 9. CLI 冒烟（隔离 EVOKIT_HOME，spawnSync node cli/evokit.mjs）──
console.log('\n【9. CLI 冒烟】');
const smokeHome = mkdtempSync(join(tmpRoot, 'smoke-'));
const runCli = (args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, EVOKIT_HOME: smokeHome },
    encoding: 'utf-8',
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
};
const hasGit = spawnSync('git', ['--version'], { encoding: 'utf-8' }).status === 0;

let initR = runCli(['knowledge', 'init']);
assert(initR.code === 0, `knowledge init 退出码 0（实际 ${initR.code}，${initR.stderr.slice(0, 120)}）`);
const kDir = join(smokeHome, '.evokit', 'knowledge');
const kIdxFile = join(kDir, 'knowledge-index.md');
const kPendingDir = join(kDir, '.pending');
assert(existsSync(kDir), 'knowledge/ 目录已创建');
assert(existsSync(join(kDir, '.pending')), '.pending/ 目录已创建');
assert(existsSync(join(kDir, '.rejected')), '.rejected/ 目录已创建');
assert(existsSync(kIdxFile), 'knowledge-index.md 骨架已创建');
const skeleton = readFileSync(kIdxFile, 'utf-8');
assert(skeleton.includes('## EvoKit 知识'), '索引骨架含 ## EvoKit 知识 空桶');
assert(existsSync(join(kDir, '.gitignore')) && readFileSync(join(kDir, '.gitignore'), 'utf-8').includes('.pending/'), '.gitignore 忽略 .pending/');
if (hasGit) {
  assert(existsSync(join(kDir, '.git')), 'git init 产出 .git（本机 git 可用）');
  // 身份缺失仅警告不失败：本机通常已配置，无法稳定制造缺失场景，改为直接断言 init 仍 exit 0（上面已覆盖）
}
// 幂等：手写段 + 重复 init 不覆盖
appendFileSync(kIdxFile, '\n## 手写段\n\n手写内容\n', 'utf-8');
initR = runCli(['knowledge', 'init']);
assert(initR.code === 0 && readFileSync(kIdxFile, 'utf-8').includes('手写内容'), '重复 init 不覆盖已有索引');

let reviewR = runCli(['review']);
assert(reviewR.code === 0, 'review 空库退出码 0');
assert(reviewR.stdout.includes('暂无待审草稿'), 'review 空库友好输出');
// 有草稿时列出摘要
const draftCardId = cards.writeCard(kPendingDir, {
  front: { title: 'CLI 冒烟草稿', type: 'fact', source: 'smoke', status: 'draft', confidence: '0.8', related: ['k20260101-11111111'] },
});
reviewR = runCli(['review']);
assert(reviewR.stdout.includes(draftCardId) && reviewR.stdout.includes('CLI 冒烟草稿'), 'review 列出草稿 id 与标题');
assert(reviewR.stdout.includes('k20260101-11111111'), 'review 列出 related');
assert(reviewR.stdout.includes('--accept'), 'review 打印裁决命令提示');
const acceptR = runCli(['review', '--accept', draftCardId]);
assert(acceptR.stdout.includes('尚未实现') || acceptR.stderr.includes('尚未实现'), '裁决参数提示未实现（M2 提供）');
// help 与拼错建议
const helpR = runCli(['help']);
assert(helpR.stdout.includes('knowledge') && helpR.stdout.includes('review'), 'help 含 knowledge/review');
const typoR = runCli(['revie']);
assert(typoR.code === 1, `拼错 revie 退出码 1（实际 ${typoR.code}）`);
assert((typoR.stdout + typoR.stderr).includes('review'), '拼错 revie 建议_review');
const unknownSubR = runCli(['knowledge', 'unknown-sub']);
assert(unknownSubR.code === 1 && unknownSubR.stdout.includes('knowledge'), 'knowledge 未知子命令打印用法并退出 1');

// ── 清理与汇总 ────────────────────────────────────────────
console.log('\n【清理测试目录】');
try { rmSync(tmpRoot, { recursive: true, force: true }); ok('临时目录已清理'); } catch (e) { fail('临时目录清理', e.message); }

console.log(`\n========== 测试结果：${passed} 通过 / ${failed} 失败 ==========`);
process.exit(failed > 0 ? 1 : 0);
