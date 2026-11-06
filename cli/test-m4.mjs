#!/usr/bin/env node
/**
 * EvoKit CLI 记忆引擎 M4 锻造层测试（T-M4.2 forge 生成链 + T-M4.3 review --skill 分发 + T-M4.4 --audit）
 *
 * 自包含：`node cli/test-m4.mjs` 直接运行；任一断言失败退出码 1。
 * 隔离：CLI 用例各自独立 EVOKIT_HOME 临时目录（子进程读 env，互不串扰）。
 * mock agent 手法仿 test-m2.mjs：settings agents codex cli.binPath=process.execPath
 * args=[fakeScript] input:'stdin'，fake 脚本按 EVOKIT_FAKE_OUT_FILE 输出合法 SKILL.md 全文。
 *
 * 覆盖：
 *  - T-M4.2：无参 forge 列达标簇；--from-tags 生成草稿（SKILL.md 落盘 + generation.json 字段全对 +
 *    status trial + 不建 symlink）；--topic 关键词选卡 + 名称冲突 -2 后缀；agent 失败不落半成品；卡数不足报错。
 *  - T-M4.3：review --skill 列草稿；--skill-accept 双落点 symlink + distributedTo 回写 + confirmed +
 *    forge-use 引用；.skill-lock.json 三态（不存在不创建 / 合法数组无损追加 / 损坏跳过不破坏）；--skill-veto。
 *  - T-M4.4：forge --audit 退役（symlink 回收 + 目录入 .retired/ + 副本置 retired）/ vetoed 提示 /
 *    父卡过半 validUntil 过期提示重审；命令注册（KNOWN_COMMANDS / help / 拼错 forg 建议）。
 */

import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, 'evokit.mjs');

// ── 微型测试框架 ──
let passed = 0, failed = 0;
function ok(name) { passed++; console.log(`  ✓ ${name}`); }
function fail(name, detail) { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
function assert(cond, name, detail) { cond ? ok(name) : fail(name, detail); }
function section(title) { console.log(`\n■ ${title}`); }

// ── 帮助函数 ──
const homes = [];
function mkHome(prefix) {
  const h = mkdtempSync(join(tmpdir(), `evokit-m4-${prefix}-`));
  homes.push(h);
  return h;
}

function runCli(home, args, env = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, EVOKIT_HOME: home, EVOKIT_DEBUG: '', ...env },
    encoding: 'utf-8',
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out: (r.stdout || '') + (r.stderr || '') };
}

function wf(p, content) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content, 'utf-8');
  return p;
}

/** 链接/junction 判定：readlink 成功即链接（symlink 与 Windows junction 均可 readlink，真实目录会抛错） */
function isLinkLike(p) {
  try {
    readlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

/** 本地日期 YYYY-MM-DD（validUntil 构造用，与 forge --audit 的比较口径一致） */
function localDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// mock agent：stdin 收 prompt（追加进 EVOKIT_FAKE_LOG 供断言），stdout 输出 EVOKIT_FAKE_OUT_FILE 文件内容
const FAKE_AGENT_SRC = `
const fs = require('fs');
let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { stdin += d; });
process.stdin.on('end', () => {
  if (process.env.EVOKIT_FAKE_LOG) fs.appendFileSync(process.env.EVOKIT_FAKE_LOG, '\\n==PROMPT==\\n' + stdin);
  try { process.stdout.write(fs.readFileSync(process.env.EVOKIT_FAKE_OUT_FILE, 'utf-8')); } catch (e) { process.stdout.write('FAKE-MISSING: ' + e.message); }
});
`;
/** 永远失败的 mock：退出码 1、无输出 */
const BROKEN_AGENT_SRC = 'process.exit(1);\n';

const mockCli = (script) => ({ bin: 'codex', binPath: process.execPath, args: [script], input: 'stdin', timeout: 20, outputFormat: 'text' });
const brokenCli = (script) => ({ bin: 'codex', binPath: process.execPath, args: [script], input: 'stdin', timeout: 10, outputFormat: 'text' });

/** 写 settings.json：claude/pi 指向不存在的 binPath（探测不可用，避免触碰真机 CLI）；codex 指向给定 mock */
function writeSettings(home, codexCli) {
  const missing = join(home, 'missing-bin');
  const agents = [
    { id: 'claude', name: 'Claude Code', global: '~/.claude/CLAUDE.md', project: 'CLAUDE.md', cli: { bin: 'claude', binPath: missing, args: ['-p'], timeout: 5 } },
    { id: 'pi', name: 'Pi', global: '~/.pi/agent/APPEND_SYSTEM.md', project: 'APPEND_SYSTEM.md', cli: { bin: 'pi', binPath: missing, args: ['--print'], input: 'stdin', timeout: 5 } },
    { id: 'codex', name: 'Codex', global: '~/.codex/AGENTS.md', project: 'AGENTS.md', cli: codexCli },
  ];
  const cfg = { agents, resources: [], prompts: {}, sources: [], knowledge: { forgeClusterMin: 3 } };
  wf(join(home, '.evokit', 'settings.json'), JSON.stringify(cfg, null, 2) + '\n');
}

/** 合法 SKILL.md 全文（frontmatter name+description + 正文） */
const FAKE_SKILL = [
  '---',
  'name: pms-release-flow',
  'description: 当需要执行 PMS 发布流程（构建、验证、发布、回滚）时使用本技能。',
  '---',
  '',
  '# PMS 发布流程',
  '',
  '## 快速开始',
  '1. 拉取最新代码并安装依赖',
  '2. 运行发布脚本并观察验证输出',
  '',
  '## 细节',
  '回滚预案：保留上一版本产物，验证失败时立即回滚。',
].join('\n');

// knowledge-cards 与 EVOKIT_HOME 无关（目录均为显式入参），进程内动态 import 用于造 fixture
const cards = await import('./src/knowledge-cards.js');

/** 知识根 + n 张同 tags 的 confirmed workflow 卡（达标簇 fixture）；返回卡片 id 数组 */
function writeForgeFixtures(home, n = 3, tags = ['pms', 'release']) {
  runCli(home, ['knowledge', 'init']);
  const kDir = join(home, '.evokit', 'knowledge');
  const ids = [];
  for (let i = 1; i <= n; i++) {
    ids.push(cards.writeCard(kDir, {
      front: {
        title: `PMS 发布流程${i}`,
        type: 'workflow',
        source: 'test-m4',
        status: 'confirmed',
        confidence: '0.9',
        updated: '2026-11-01T00:00:00.000Z',
        tags: [...tags],
      },
      body: `PMS 发布流程步骤 ${i}：构建 → 验证 → 发布，失败按回滚预案处理。`,
    }));
  }
  return ids;
}

/** 手工构造一个技能目录（SKILL.md + generation.json），用于 accept/veto/audit 场景 */
function writeHandSkill(home, name, { generatedAt = new Date().toISOString(), status = 'trial', uses = 0, vetoed = false, distributedTo = [], parentCards = [] } = {}) {
  const dir = join(home, '.agents', 'skills', name);
  wf(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: 手工构造的测试技能。\n---\n\n正文\n`);
  wf(join(dir, 'generation.json'), JSON.stringify({
    generatedBy: 'evokit forge',
    generatedAt,
    parentCards,
    sourceType: 'evokit',
    topic: '',
    tags: [],
    review: { status, uses, vetoed },
    distributedTo,
  }, null, 2) + '\n');
  return dir;
}

// ═══ S1. 无参 forge：列出达标簇 ═══
section('S1 无参 forge：列出达标簇（3 张同 tags workflow 卡）');
{
  const home1 = mkHome('list');
  const ids1 = writeForgeFixtures(home1, 3);
  const r1 = runCli(home1, ['forge']);
  assert(r1.code === 0, `forge 无参退出码 0（实际 ${r1.code}）`, r1.out.slice(0, 200));
  assert(r1.stdout.includes('#pms') && r1.stdout.includes('#release'), '输出簇 tags（#pms #release）');
  assert(ids1.every((id) => r1.stdout.includes(id)), '输出全部 cardIds');
  assert(r1.stdout.includes('forge --from-tags'), '输出建议命令');

  const home1b = mkHome('list2');
  writeForgeFixtures(home1b, 2); // 2 张卡不足 minSize=3
  const r1b = runCli(home1b, ['forge']);
  assert(r1b.code === 0 && r1b.stdout.includes('暂无达标簇'), '2 张卡不足 3 → 暂无达标簇且 exit 0', r1b.out.slice(0, 160));
}

// ═══ S2. forge --from-tags：生成草稿 ═══
section('S2 forge --from-tags：SKILL.md 落盘 + generation.json 全对 + trial + 不建 symlink');
const home2 = mkHome('gen');
const ids2 = writeForgeFixtures(home2, 3);
const fakeOutFile = wf(join(home2, 'fake-out.md'), FAKE_SKILL);
writeSettings(home2, mockCli(wf(join(home2, 'fake-agent.js'), FAKE_AGENT_SRC)));
const fakeLog = join(home2, 'fake-log.txt');
{
  const r2 = runCli(home2, ['forge', '--from-tags', 'pms'], { EVOKIT_FAKE_OUT_FILE: fakeOutFile, EVOKIT_FAKE_LOG: fakeLog });
  assert(r2.code === 0, `forge --from-tags 退出码 0（实际 ${r2.code}）`, r2.out.slice(0, 300));
  const skillDir = join(home2, '.agents', 'skills', 'pms-release-flow');
  assert(existsSync(join(skillDir, 'SKILL.md')), 'SKILL.md 已落盘');
  assert(existsSync(join(skillDir, 'generation.json')), 'generation.json 已落盘');
  assert(readFileSync(join(skillDir, 'SKILL.md'), 'utf-8') === FAKE_SKILL, 'SKILL.md 内容 = agent 原始输出（trim）');
  let gen2 = null;
  try { gen2 = JSON.parse(readFileSync(join(skillDir, 'generation.json'), 'utf-8')); } catch { /* 保持 null */ }
  assert(gen2 !== null, 'generation.json 可解析');
  assert(gen2 && gen2.generatedBy === 'evokit forge' && gen2.sourceType === 'evokit', 'generatedBy=evokit forge / sourceType=evokit');
  assert(gen2 && Array.isArray(gen2.parentCards) && gen2.parentCards.length === 3 && ids2.every((id) => gen2.parentCards.includes(id)), 'parentCards = 3 张 fixture 卡');
  assert(gen2 && gen2.topic === 'pms', 'topic = 传入标签 pms');
  assert(gen2 && Array.isArray(gen2.tags) && gen2.tags.includes('pms') && gen2.tags.includes('release'), 'tags = 父卡标签并集');
  assert(gen2 && !Number.isNaN(Date.parse(gen2.generatedAt)), 'generatedAt 为合法 ISO 时间');
  assert(gen2 && gen2.review && gen2.review.status === 'trial' && gen2.review.uses === 0 && gen2.review.vetoed === false, 'review = {status:trial, uses:0, vetoed:false}');
  assert(gen2 && Array.isArray(gen2.distributedTo) && gen2.distributedTo.length === 0, 'distributedTo 初始为空');
  assert(!existsSync(join(home2, '.claude', 'skills', 'pms-release-flow')), '未建 symlink（.claude/skills 无落点）');
  assert(!existsSync(join(home2, '.codex', 'skills', 'pms-release-flow')), '未建 symlink（.codex/skills 无落点）');
  const promptLogged = existsSync(fakeLog) ? readFileSync(fakeLog, 'utf-8') : '';
  assert(promptLogged.includes('PMS 发布流程1'), 'prompt 含父卡内容');
  assert(promptLogged.includes('渐进披露') && promptLogged.includes('触发时机'), 'prompt 含模板要求（渐进披露/触发时机）');
}

// ═══ S3. forge --topic：关键词选卡 + 冲突后缀 ═══
section('S3 forge --topic：关键词选卡 + 名称冲突加 -2 后缀');
{
  const r3 = runCli(home2, ['forge', '--topic', '发布'], { EVOKIT_FAKE_OUT_FILE: fakeOutFile });
  assert(r3.code === 0, `forge --topic 退出码 0（实际 ${r3.code}）`, r3.out.slice(0, 300));
  assert(existsSync(join(home2, '.agents', 'skills', 'pms-release-flow-2', 'generation.json')), '同名冲突 → pms-release-flow-2 目录');
  const r3b = runCli(home2, ['forge', '--topic', '绝不匹配的词xyz'], { EVOKIT_FAKE_OUT_FILE: fakeOutFile });
  assert(r3b.code === 1 && r3b.out.includes('不足'), `--topic 无匹配 → 报错退出 1（实际 ${r3b.code}）`, r3b.out.slice(0, 160));
}

// ═══ S4. 失败路径 ═══
section('S4 失败路径：agent 失败不落半成品 / 卡数不足报错');
{
  const home3 = mkHome('fail');
  writeForgeFixtures(home3, 3);
  writeSettings(home3, brokenCli(wf(join(home3, 'broken-agent.js'), BROKEN_AGENT_SRC)));
  const r4 = runCli(home3, ['forge', '--from-tags', 'pms']);
  assert(r4.code === 1, `agent 失败退出码 1（实际 ${r4.code}）`);
  assert(r4.out.includes('✗'), '失败输出 ✗ 错误');
  assert(!existsSync(join(home3, '.agents', 'skills', 'pms-release-flow')), 'agent 失败不落半成品（目录不存在）');

  const home3b = mkHome('few');
  writeForgeFixtures(home3b, 1);
  const r4b = runCli(home3b, ['forge', '--from-tags', 'pms']);
  assert(r4b.code === 1 && r4b.out.includes('不足'), `1 张卡不足 minSize=3 → 报错退出 1（实际 ${r4b.code}）`);
  assert(!existsSync(join(home3b, '.agents', 'skills')), '卡数不足不建技能目录');
}

// ═══ S5. review --skill：列出 trial 草稿 ═══
section('S5 review --skill：列出 trial 草稿');
{
  const r5 = runCli(home2, ['review', '--skill']);
  assert(r5.code === 0, `review --skill 退出码 0（实际 ${r5.code}）`, r5.out.slice(0, 200));
  assert(r5.stdout.includes('pms-release-flow') && r5.stdout.includes('pms-release-flow-2'), '列出两个草稿');
  assert(r5.stdout.includes('父卡 3'), '显示 parentCards 数');
  assert(r5.stdout.includes('trial'), '标注 trial');
}

// ═══ S6. --skill-accept：分发 + 回写 + 引用 + lock 不创建 ═══
section('S6 --skill-accept：双落点 symlink + distributedTo + confirmed + forge-use 引用 + 不创建 lock');
const skillDir1 = join(home2, '.agents', 'skills', 'pms-release-flow');
{
  const link1 = join(home2, '.claude', 'skills', 'pms-release-flow');
  const link2 = join(home2, '.codex', 'skills', 'pms-release-flow');
  assert(!existsSync(join(home2, '.agents', 'skills', '.skill-lock.json')), 'accept 前 .skill-lock.json 不存在');
  const r6 = runCli(home2, ['review', '--skill-accept', 'pms-release-flow']);
  assert(r6.code === 0, `--skill-accept 退出码 0（实际 ${r6.code}）`, r6.out.slice(0, 300));
  assert(isLinkLike(link1), '.claude/skills/pms-release-flow 是 symlink/junction');
  assert(isLinkLike(link2), '.codex/skills/pms-release-flow 是 symlink/junction');
  const gen6 = JSON.parse(readFileSync(join(skillDir1, 'generation.json'), 'utf-8'));
  assert(gen6.review.status === 'confirmed', 'review.status → confirmed');
  assert(Array.isArray(gen6.distributedTo) && gen6.distributedTo.length === 2, 'distributedTo 回写 2 处');
  const refsLines = readFileSync(join(home2, '.evokit', 'knowledge', 'references.jsonl'), 'utf-8').split(/\r?\n/).filter((l) => l.trim());
  const forgeUse = refsLines.map((l) => JSON.parse(l)).filter((r) => r.type === 'forge-use');
  assert(ids2.every((id) => forgeUse.some((r) => r.cardId === id)), '每个父卡都有 forge-use 引用');
  assert(!existsSync(join(home2, '.agents', 'skills', '.skill-lock.json')), '.skill-lock.json 原不存在 → 不创建');
  const r6b = runCli(home2, ['review', '--skill-accept', 'pms-release-flow']);
  assert(r6b.code === 1, `重复 accept 已 confirmed 技能 → 退出码 1（实际 ${r6b.code}）`);
}

// ═══ S7. .skill-lock.json 合法数组无损追加 ═══
section('S7 .skill-lock.json：合法数组无损追加');
const lockFile = join(home2, '.agents', 'skills', '.skill-lock.json');
{
  wf(lockFile, JSON.stringify([{ name: 'pre-existing-skill', sourceType: 'manual' }], null, 2) + '\n');
  const r7 = runCli(home2, ['review', '--skill-accept', 'pms-release-flow-2']);
  assert(r7.code === 0, `accept 第二个草稿退出码 0（实际 ${r7.code}）`, r7.out.slice(0, 200));
  let lock = null;
  try { lock = JSON.parse(readFileSync(lockFile, 'utf-8')); } catch { /* 保持 null */ }
  assert(Array.isArray(lock) && lock.length === 2, 'lock 追加为 2 条');
  assert(lock && lock[0] && lock[0].name === 'pre-existing-skill' && lock[0].sourceType === 'manual', '既有条目无损保留');
  assert(lock && lock[1] && lock[1].name === 'pms-release-flow-2' && lock[1].sourceType === 'evokit'
    && Array.isArray(lock[1].parentCards) && lock[1].parentCards.length === 3
    && typeof lock[1].generatedAt === 'string', '新条目 {name, sourceType, generatedAt, parentCards} 完整');
}

// ═══ S8. .skill-lock.json 损坏跳过 ═══
section('S8 .skill-lock.json：损坏时跳过且不破坏原文件');
{
  const brokenLockRaw = '{"broken": true,,';
  wf(lockFile, brokenLockRaw);
  writeHandSkill(home2, 'hand-made', { parentCards: ['kx-test'] });
  const r8 = runCli(home2, ['review', '--skill-accept', 'hand-made']);
  assert(r8.code === 0, `损坏 lock 时 accept 仍完成（退出码 ${r8.code}）`, r8.out.slice(0, 200));
  assert(readFileSync(lockFile, 'utf-8') === brokenLockRaw, '损坏 lock 原文未动（逐字节相等）');
  assert(r8.out.includes('跳过'), '输出跳过提示');
}

// ═══ S9. --skill-veto + 不存在 name ═══
section('S9 --skill-veto：置 vetoed；不存在的 name 报错 exit 1');
{
  writeHandSkill(home2, 'vetome');
  const r9 = runCli(home2, ['review', '--skill-veto', 'vetome']);
  assert(r9.code === 0, `--skill-veto 退出码 0（实际 ${r9.code}）`, r9.out.slice(0, 160));
  const genV = JSON.parse(readFileSync(join(home2, '.agents', 'skills', 'vetome', 'generation.json'), 'utf-8'));
  assert(genV.review.vetoed === true && genV.review.status === 'vetoed', 'vetoed=true 且 status=vetoed');
  const r9b = runCli(home2, ['review', '--skill']);
  assert(r9b.code === 0 && !r9b.stdout.includes('vetome'), 'vetoed 后不再出现在 --skill 草稿清单');
  const r9c = runCli(home2, ['review', '--skill-accept', '不存在xyz']);
  assert(r9c.code === 1, `不存在的 name → 退出码 1（实际 ${r9c.code}）`);
}

// ═══ S10. forge --audit：退役 / vetoed 提示 / 父卡过半过期需重审 ═══
section('S10 --audit：trial 满期退役（回收链接 + .retired） / vetoed 不动 / 需重审清单');
{
  const home4 = mkHome('audit');
  runCli(home4, ['knowledge', 'init']);
  const kDir4 = join(home4, '.evokit', 'knowledge');
  const past = localDate(Date.now() - 86400000);
  const future = localDate(Date.now() + 30 * 86400000);
  const p1 = cards.writeCard(kDir4, { front: { title: '过期卡一', type: 'workflow', source: 'test-m4', status: 'confirmed', validUntil: past, updated: past }, body: 'x' });
  const p2 = cards.writeCard(kDir4, { front: { title: '过期卡二', type: 'workflow', source: 'test-m4', status: 'confirmed', validUntil: past, updated: past }, body: 'x' });
  const p3 = cards.writeCard(kDir4, { front: { title: '有效卡', type: 'pattern', source: 'test-m4', status: 'confirmed', validUntil: future, updated: past }, body: 'x' });

  // ① 90 天前 trial + 已建 symlink → 退役
  const staleDir = writeHandSkill(home4, 'stale-skill', {
    generatedAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    distributedTo: [join(home4, '.claude', 'skills', 'stale-skill')],
  });
  const staleLink = join(home4, '.claude', 'skills', 'stale-skill');
  mkdirSync(dirname(staleLink), { recursive: true });
  symlinkSync(staleDir, staleLink, process.platform === 'win32' ? 'junction' : 'dir');
  assert(isLinkLike(staleLink), '前置：stale-skill 分发链接已建');

  // ② vetoed（不动）+ 未满期 trial + confirmed 需重审 + confirmed 正常
  writeHandSkill(home4, 'vetoed-one', { status: 'vetoed', vetoed: true, uses: 5 });
  writeHandSkill(home4, 'fresh-skill', { generatedAt: new Date().toISOString() });
  writeHandSkill(home4, 'reviewme', { status: 'confirmed', parentCards: [p1, p2] });
  writeHandSkill(home4, 'okskill', { status: 'confirmed', parentCards: [p3] });

  const r10 = runCli(home4, ['forge', '--audit']);
  assert(r10.code === 0, `forge --audit 退出码 0（实际 ${r10.code}）`, r10.out.slice(0, 300));
  assert(!existsSync(staleLink) && !existsSync(staleDir), '退役后 symlink 消失、原位置目录不存在');
  const retiredCopy = join(home4, '.agents', 'skills', '.retired', 'stale-skill');
  assert(existsSync(join(retiredCopy, 'generation.json')), '目录已移入 .retired/stale-skill');
  let genR = null;
  try { genR = JSON.parse(readFileSync(join(retiredCopy, 'generation.json'), 'utf-8')); } catch { /* 保持 null */ }
  assert(genR && genR.review.status === 'retired', '.retired 副本 review.status → retired');
  assert(existsSync(join(home4, '.agents', 'skills', 'vetoed-one', 'generation.json')), 'vetoed 技能不动');
  assert(existsSync(join(home4, '.agents', 'skills', 'fresh-skill', 'generation.json')), '未满期 trial 不退役');
  assert(r10.stdout.includes('vetoed'), '输出 vetoed 提示');
  assert(r10.stdout.includes('reviewme') && r10.stdout.includes('需重审'), '父卡过半过期 → 需重审清单含 reviewme');
  assert(!r10.stdout.includes('okskill'), '父卡未过半的 okskill 不进重审清单');
}

// ═══ S11. forge 命令注册 ═══
section('S11 forge 命令注册（KNOWN_COMMANDS / help / 拼错建议）');
{
  const r11a = runCli(home2, ['help']);
  assert(r11a.stdout.includes('forge'), 'help 含 forge');
  const r11b = runCli(home2, ['forg']);
  assert(r11b.code === 1, `拼错 forg 退出码 1（实际 ${r11b.code}）`);
  assert(r11b.out.includes('forge'), '拼错 forg 建议 forge');
}

// ── 清理与汇总 ──
console.log('\n【清理测试目录】');
let cleaned = true;
for (const h of homes) {
  try { rmSync(h, { recursive: true, force: true }); } catch (e) { cleaned = false; fail('临时目录清理', e.message); }
}
if (cleaned) ok('临时目录已清理');

console.log(`\n========== 测试结果：${passed} 通过 / ${failed} 失败 ==========`);
process.exit(failed > 0 ? 1 : 0);
