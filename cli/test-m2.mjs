#!/usr/bin/env node
/**
 * EvoKit CLI 记忆引擎 M2 提纯闭环测试（T-M1.5 harvest 命令 + T-M2.1~T-M2.5）
 *
 * 自包含：`node cli/test-m2.mjs` 直接运行；任一断言失败退出码 1。
 * 隔离：CLI 用例各自独立 EVOKIT_HOME 临时目录（子进程读 env，互不串扰）；
 *       库级用例在进程级 scratch home 下动态 import（paths.js 加载时读 env）。
 * mock agent 手法仿 test-local.mjs 的 codex stdin 测试：
 *       settings agents codex cli.binPath=process.execPath args=[fakeScript] input:'stdin'。
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
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
function mkHome(prefix) { return mkdtempSync(join(tmpdir(), `evokit-m2-${prefix}-`)); }

function runCli(home, args, env = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, EVOKIT_HOME: home, EVOKIT_DEBUG: '', ...env },
    encoding: 'utf-8',
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', code: r.status };
}

function wf(p, content) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content, 'utf-8');
}

/** mock agent：stdin 收 prompt；按「阶段 B」标记从 env 指定文件读应答；prompt 追加进 EVOKIT_FAKE_LOG 供断言 */
const FAKE_AGENT_SRC = `
const fs = require('fs');
let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { stdin += d; });
process.stdin.on('end', () => {
  const isB = stdin.includes('\\u9636\\u6bb5 B');
  const file = isB ? process.env.EVOKIT_FAKE_B : process.env.EVOKIT_FAKE_A;
  let out = '';
  try { out = fs.readFileSync(file, 'utf-8'); } catch (e) { out = 'FAKE-MISSING: ' + e.message; }
  if (process.env.EVOKIT_FAKE_LOG) {
    fs.appendFileSync(process.env.EVOKIT_FAKE_LOG, '\\n==STAGE==' + (isB ? 'B' : 'A') + '\\n' + stdin);
  }
  process.stdout.write(out);
});
`;
function writeFakeAgent(home) {
  const p = join(home, 'fake-agent.js');
  wf(p, FAKE_AGENT_SRC);
  return p;
}
/** 永远失败的 mock（执行者降级用）：无输出退出码 1 */
function writeBrokenAgent(home) {
  const p = join(home, 'broken-agent.js');
  wf(p, 'process.exit(1);\n');
  return p;
}

const mockCli = (script) => ({ bin: 'codex', binPath: process.execPath, args: [script], input: 'stdin', timeout: 20, outputFormat: 'text' });
const brokenCli = (script) => ({ bin: 'codex', binPath: process.execPath, args: [script], input: 'stdin', timeout: 10, outputFormat: 'text' });

/** 写 settings.json：claude/pi 指向不存在的 binPath（探测不可用，避免触碰真机 CLI）；codex 按调用方给 cli */
function writeSettings(home, { sources, knowledge, codexCli } = {}) {
  const missing = join(home, 'missing-bin');
  const agents = [
    { id: 'claude', name: 'Claude Code', global: '~/.claude/CLAUDE.md', project: 'CLAUDE.md', cli: { bin: 'claude', binPath: missing, args: ['-p'], timeout: 5 } },
    { id: 'pi', name: 'Pi', global: '~/.pi/agent/APPEND_SYSTEM.md', project: 'APPEND_SYSTEM.md', cli: { bin: 'pi', binPath: missing, args: ['--print'], input: 'stdin', timeout: 5 } },
    { id: 'codex', name: 'Codex', global: '~/.codex/AGENTS.md', project: 'AGENTS.md', cli: codexCli || { bin: 'codex', binPath: missing, args: ['exec', '-'], input: 'stdin', timeout: 5 } },
  ];
  const cfg = { agents, resources: [], prompts: {}, sources: sources || [], knowledge: knowledge || {} };
  wf(join(home, '.evokit', 'settings.json'), JSON.stringify(cfg, null, 2) + '\n');
  return cfg;
}

/** memory-cards 源 fixtures：两个 md（a.md 含密钥样本用于脱敏断言，b.md 正常） */
function writeHarvestFixtures(home) {
  const fx = join(home, 'fixtures', 'mem');
  wf(join(fx, 'a.md'), '# 记忆 A\n\n用户偏好：Node 用 fnm 切版本，不用 nvm。样例密钥 sk-abcdefghijklmnopqrst 应被脱敏。\n');
  wf(join(fx, 'b.md'), '# 记忆 B\n\n踩坑：Windows 下 junction 需要管理员权限时改用符号链接回退。\n');
  return fx;
}

// git 提交类测试统一注入身份（子进程继承），避免依赖本机全局 git config
process.env.GIT_AUTHOR_NAME = 'EvoKit M2 Test';
process.env.GIT_AUTHOR_EMAIL = 'm2@test.local';
process.env.GIT_COMMITTER_NAME = 'EvoKit M2 Test';
process.env.GIT_COMMITTER_EMAIL = 'm2@test.local';

// ── 库级动态 import：scratch home 先设 env 再 import（paths.js 加载时读 EVOKIT_HOME）──
const scratchHome = mkHome('lib');
process.env.EVOKIT_HOME = scratchHome;
const distill = await import('./src/distill.js');
const cardsMod = await import('./src/knowledge-cards.js');

console.log(`隔离 scratch home: ${scratchHome}`);

// ═══ S1. 分批器（T-M2.2）═══
section('分批器：9 会话→2 批 · >24KB 拆批 · 单会话截断 · project 隔离');
{
  const fxDir = join(scratchHome, 'fx');
  const mkEv = (sid, text, file, project = 'proj') => ({
    source: 't', kind: 'session', project, ts: `2026-11-06T00:00:${String(sid).length}s`, sessionId: sid, text, meta: { file, line: 1 },
  });

  const evs9 = Array.from({ length: 9 }, (_, i) => mkEv(`s${i}`, `事件${i} 内容`, join(fxDir, `f${i}.jsonl`)));
  const b1 = distill.makeBatches(evs9, {});
  assert(b1.length === 2, `9 会话默认分 2 批（实际 ${b1.length}）`);
  assert(b1[0].sessions.length === 8 && b1[1].sessions.length === 1, `批大小 8+1（实际 ${b1[0].sessions.length}+${b1[1].sessions.length}）`);
  assert(b1[0].files.length === 8, '批携带本批文件清单（供 source 校验）');

  const big = 'x'.repeat(13 * 1024);
  const evsBig = [1, 2, 3].map((i) => mkEv(`big${i}`, big, join(fxDir, `big${i}.jsonl`)));
  const b2 = distill.makeBatches(evsBig, {});
  assert(b2.length === 3, `3×13KB 拆为 3 批（实际 ${b2.length}）`);
  assert(b2.every((b) => Buffer.byteLength(b.text, 'utf8') <= 24 * 1024), '拆批后每批文本 ≤ 24KB');

  const huge = mkEv('huge', 'y'.repeat(40 * 1024), join(fxDir, 'huge.jsonl'));
  const b3 = distill.makeBatches([huge], {});
  assert(b3.length === 1, '单会话超限不拆批（仍 1 批）');
  assert(b3[0].text.includes('[本会话超限截断]'), '超限文本被截断并带标记');
  assert(Buffer.byteLength(b3[0].text, 'utf8') <= 24 * 1024, '截断后 ≤ 24KB');

  const evsP = [
    mkEv('p1a', '甲', join(fxDir, 'p1a.jsonl'), 'proj-1'),
    mkEv('p1b', '乙', join(fxDir, 'p1b.jsonl'), 'proj-1'),
    mkEv('p2a', '丙', join(fxDir, 'p2a.jsonl'), 'proj-2'),
    mkEv('p2b', '丁', join(fxDir, 'p2b.jsonl'), 'proj-2'),
  ];
  const b4 = distill.makeBatches(evsP, {});
  assert(b4.length === 2, `不同 project 不混批（实际 ${b4.length} 批）`);
  assert(b4[0].project !== b4[1].project, '两批分属两个 project');
}

// ═══ S2. 解析容错三段（T-M2.3 / FR-06）═══
section('解析三段：整体 JSON / 碎片逐块 / 垃圾→orphan 内容完整');
{
  const r1 = distill.parseLooseJsonArray('[{"title":"a","statement":"b"},{"title":"c"}]');
  assert(r1.strategy === 'whole' && r1.items.length === 2, '① 整体 JSON 数组解析');

  const r1b = distill.parseLooseJsonArray('{"cards":[{"title":"x","statement":"y"}]}');
  assert(r1b.strategy === 'whole' && r1b.items.length === 1 && r1b.items[0].title === 'x', '① 对象内 cards 数组解析');

  const junk = '好的，以下是结果：\n{"title":"t1","statement":"s1","confidence":0.9}\n以上。{"title":"t2","statement":"s2"}';
  const r2 = distill.parseLooseJsonArray(junk);
  assert(r2.strategy === 'blocks' && r2.items.length === 2 && r2.items[0].title === 't1', '② 前后垃圾中的 {...} 逐块提取');

  const r2b = distill.parseLooseJsonArray('{"title":"含}花括号","statement":"x"}');
  assert(r2b.items.length === 1 && r2b.items[0].title === '含}花括号', '② 引号内 } 不破坏括号配平');

  const garbage = '抱歉，我无法输出 JSON。这是一段普通文字。';
  const r3 = distill.parseLooseJsonArray(garbage);
  assert(r3.items.length === 0 && r3.strategy === 'none', '③ 垃圾输出解析为空');

  const orphanPath = distill.writeOrphan(garbage);
  assert(existsSync(orphanPath), 'orphan 文件已落盘');
  assert(readFileSync(orphanPath, 'utf-8') === garbage, 'orphan 内容与原始输出逐字一致（绝不丢弃）');
  assert(orphanPath.replace(/\\/g, '/').includes('.pending/orphan/'), 'orphan 落在 .pending/orphan/ 下');
  assert(/\d{8}-\d{9}-\d+\.txt$/.test(orphanPath), 'orphan 文件名 <ts>-<n>.txt 形态');
}

// ═══ S3. 执行者链（T-M2.3）═══
section('执行者链：降级过滤 · claude 不进自动链 · --agent 显式覆盖');
{
  const clisFake = [
    { id: 'claude', name: 'Claude Code', available: true },
    { id: 'codex', name: 'Codex', available: false },
    { id: 'pi', name: 'Pi', available: true },
  ];
  const r1 = distill.resolveDistillAgent(null, ['codex', 'pi'], clisFake);
  assert(r1.ok && r1.chain.length === 1 && r1.chain[0].id === 'pi', '自动链过滤不可用执行者，降级到 pi');

  const r2 = distill.resolveDistillAgent(null, ['claude', 'codex'], clisFake);
  assert(r2.ok && r2.chain.length === 0, 'claude 被排除出自动链，无可用者时链为空');

  const r3 = distill.resolveDistillAgent('claude', null, clisFake);
  assert(r3.ok && r3.chain.length === 1 && r3.chain[0].id === 'claude', '--agent claude 显式覆盖允许');

  const r4 = distill.resolveDistillAgent('nope', null, clisFake);
  assert(!r4.ok, '未知执行者报错');
}

// ═══ S4. harvest 命令（T-M1.5）═══
section('harvest：dry-run 不写盘 · 二跑 0 新增 · --full 去重 · 过期清理 · 脱敏 · --source');
{
  const home = mkHome('harvest');
  const fx = writeHarvestFixtures(home);
  writeSettings(home, {
    sources: [
      { id: 'mem-src', adapter: 'memory-cards', root: fx, enabled: true },
      { id: 'off-src', adapter: 'memory-cards', root: fx, enabled: false },
    ],
    knowledge: { inboxRetentionDays: 1 },
  });

  let r = runCli(home, ['harvest', '--dry-run']);
  assert(r.code === 0, 'harvest --dry-run 退出码 0', r.stderr.slice(0, 150));
  assert(!existsSync(join(home, '.evokit', 'inbox')), 'dry-run 不创建 inbox');
  assert(!existsSync(join(home, '.evokit', 'state.json')), 'dry-run 不写水位线');
  assert(r.stdout.includes('未启用'), 'enabled:false 源报告「未启用」');
  assert(r.stdout.includes('拟入库事件 2'), 'dry-run 报告拟入库计数');

  r = runCli(home, ['harvest']);
  assert(r.code === 0, 'harvest 退出码 0', r.stderr.slice(0, 150));
  const inboxDir = join(home, '.evokit', 'inbox', 'mem-src');
  assert(existsSync(inboxDir), 'inbox/<source>/ 目录已创建');
  const files1 = readdirSync(inboxDir);
  assert(files1.length === 2, `两 fixture 各落一个 inbox jsonl（实际 ${files1.length}）`);
  const line = readFileSync(join(inboxDir, files1[0]), 'utf-8').trim().split('\n')[0];
  const ev = JSON.parse(line);
  assert(ev.source === 'mem-src' && ev.kind === 'memory-card' && ev.meta && ev.meta.file, 'RawEvent 字段完整（source/kind/meta.file）');
  const allInbox = files1.map((f) => readFileSync(join(inboxDir, f), 'utf-8')).join('');
  assert(!allInbox.includes('sk-abcdefghijklmnopqrst'), '收割即脱敏：密钥原文不落盘');
  assert(allInbox.includes('[REDACTED]'), '密钥替换为 [REDACTED]');
  assert(existsSync(join(home, '.evokit', 'state.json')), '水位线 state.json 已更新');
  assert(r.stdout.includes('入库 2'), '报告入库计数');

  r = runCli(home, ['harvest']);
  assert(r.code === 0 && r.stdout.includes('入库 0'), '二跑 0 新增（水位线增量生效）');
  assert(readdirSync(inboxDir).length === files1.length, '二跑 inbox 文件数不变');

  r = runCli(home, ['harvest', '--full']);
  assert(r.code === 0 && r.stdout.includes('入库 0'), '--full 重跑内容未变仍 0 新增（行级去重）');

  const oldFile = join(inboxDir, '20200101-00000000.jsonl');
  wf(oldFile, '{"source":"mem-src","text":"old"}\n');
  const oldTime = new Date(Date.now() - 5 * 86400000);
  utimesSync(oldFile, oldTime, oldTime);
  r = runCli(home, ['harvest']);
  assert(!existsSync(oldFile), '超 inboxRetentionDays 的旧 inbox 文件被清理');
  assert(r.stdout.includes('过期清理 1'), '报告计入过期清理数');

  r = runCli(home, ['harvest', '--source', 'off-src']);
  assert(r.code === 0 && r.stdout.includes('未启用'), '--source 指向禁用源仅报告不执行');
  r = runCli(home, ['harvest', '--source', 'nope']);
  assert(r.code === 1 && (r.stdout + r.stderr).includes('未找到采集源'), '--source 未知 id 报错退出 1');

  rmSync(home, { recursive: true, force: true });
}

// ═══ S5. review 裁决全流程（T-M2.4）═══
section('review：accept/reject/merge 全流程 + 索引 + git 版本化 + 错误路径');
{
  const home = mkHome('review');
  runCli(home, ['knowledge', 'init']);
  const kDir = join(home, '.evokit', 'knowledge');
  const pending = join(kDir, '.pending');

  const d1 = cardsMod.writeCard(pending, { front: { title: 'fnm 钩子坑', type: 'pitfall', source: 'cli/test-local.mjs', status: 'draft', confidence: 0.9, tags: ['node'] }, body: 'fnm 钩子内 node 不可用，改用绝对路径。' });
  const d2 = cardsMod.writeCard(pending, { front: { title: '待拒草稿', type: 'fact', source: 'x.md', status: 'draft', confidence: 0.5 }, body: '待拒绝。' });
  const d3 = cardsMod.writeCard(pending, { front: { title: '待并草稿', type: 'fact', source: 'x.md', status: 'draft', confidence: 0.5, tags: ['node'] }, body: '与 fnm 卡重复。' });

  let r = runCli(home, ['review']);
  assert(r.code === 0 && r.stdout.includes(d1) && r.stdout.includes('fnm 钩子坑'), 'review 列出草稿 id 与标题');
  assert(r.stdout.includes('--accept'), 'review 打印裁决命令');

  r = runCli(home, ['review', '--accept', d1]);
  assert(r.code === 0, `--accept 退出码 0（${(r.stderr || '').slice(0, 150)}）`);
  assert(existsSync(join(kDir, `${d1}.md`)) && !existsSync(join(pending, `${d1}.md`)), 'accept 后卡片在 knowledge/ 且离开 .pending/');
  const accepted = readFileSync(join(kDir, `${d1}.md`), 'utf-8');
  assert(accepted.includes('status: confirmed') && accepted.includes('acceptedBy: manual'), 'accept 置 confirmed + acceptedBy: manual');
  assert(readFileSync(join(kDir, 'knowledge-index.md'), 'utf-8').includes(`- [${d1}]`), '索引行存在');
  const log = spawnSync('git', ['-C', kDir, 'log', '--oneline'], { encoding: 'utf-8' });
  assert((log.stdout || '').includes('learn: fnm 钩子坑'), 'git log 含 learn commit', (log.stderr || '').slice(0, 100));

  r = runCli(home, ['review', '--reject', d2]);
  assert(r.code === 0 && existsSync(join(kDir, '.rejected', `${d2}.md`)) && !existsSync(join(pending, `${d2}.md`)), 'reject 移入 .rejected/');

  r = runCli(home, ['review', '--merge', d3, d1]);
  assert(r.code === 0, `--merge 退出码 0（${(r.stderr || '').slice(0, 150)}）`);
  const merged = readFileSync(join(kDir, `${d3}.md`), 'utf-8');
  assert(merged.includes('status: retired') && merged.includes(`mergedInto: ${d1}`), 'merge 后被并卡 retired + mergedInto');
  const idxAfterMerge = readFileSync(join(kDir, 'knowledge-index.md'), 'utf-8');
  assert(idxAfterMerge.includes(`- [${d1}]`) && !idxAfterMerge.includes(`- [${d3}]`), 'merge 后索引只留 canonical');

  r = runCli(home, ['review', '--accept', 'nope']);
  assert(r.code === 1 && (r.stdout + r.stderr).includes('不存在'), 'accept 不存在的 id 报错退出 1');
  r = runCli(home, ['review', '--merge', 'nope', d1]);
  assert(r.code === 1, 'merge 不存在的草稿报错退出 1');

  r = runCli(home, ['review', '--audit']);
  assert(r.code === 0 && r.stdout.includes('git log'), 'audit 输出含 git log 区块');

  rmSync(home, { recursive: true, force: true });
}

// ═══ S6. git 身份缺失：跳过 commit 仅警告（能模拟则测，否则 SKIP）═══
section('git 身份缺失分支：警告跳过 commit、卡片照常入库（不可模拟则 SKIP）');
{
  const probe = mkHome('gitprobe');
  const probeRepo = join(probe, 'repo');
  wf(join(probeRepo, 'f.txt'), 'x');
  spawnSync('git', ['init'], { cwd: probeRepo, encoding: 'utf-8' });
  spawnSync('git', ['-C', probeRepo, 'add', '-A'], { encoding: 'utf-8' });
  const emptyCfg = join(probe, 'empty-gitconfig');
  writeFileSync(emptyCfg, '', 'utf-8');
  const envNoIdent = {
    GIT_CONFIG_GLOBAL: emptyCfg,
    GIT_CONFIG_SYSTEM: emptyCfg,
    GIT_AUTHOR_NAME: '',
    GIT_AUTHOR_EMAIL: '',
    GIT_COMMITTER_NAME: '',
    GIT_COMMITTER_EMAIL: '',
    EMAIL: '',
  };
  const probeCommit = spawnSync('git', ['-C', probeRepo, 'commit', '-m', 'probe'], {
    encoding: 'utf-8', env: { ...process.env, ...envNoIdent },
  });
  const simable = probeCommit.status !== 0 && /who you are|ident|user\.name/i.test((probeCommit.stderr || '') + (probeCommit.stdout || ''));
  if (!simable) {
    console.log('  - SKIP 身份缺失警告分支（本机 git 环境无法用空 env + 空全局配置模拟出缺失身份）');
  } else {
    const home = mkHome('review-noident');
    runCli(home, ['knowledge', 'init']);
    const kDir = join(home, '.evokit', 'knowledge');
    const id = cardsMod.writeCard(join(kDir, '.pending'), { front: { title: '无身份入库', type: 'fact', source: 'x.md', status: 'draft', confidence: 0.5 }, body: '内容。' });
    const r = runCli(home, ['review', '--accept', id], envNoIdent);
    assert(r.code === 0, '身份缺失时 accept 仍成功（exit 0）');
    assert(existsSync(join(kDir, `${id}.md`)), '卡片照常入库');
    assert((r.stdout + r.stderr).includes('身份缺失') || (r.stdout + r.stderr).includes('跳过提交'), '打印身份缺失警告且跳过 commit');
    const logNoIdent = spawnSync('git', ['-C', kDir, 'log', '--oneline'], { encoding: 'utf-8', env: { ...process.env, ...envNoIdent } });
    assert(!(logNoIdent.stdout || '').includes('learn:'), '未产生 learn commit');
    rmSync(home, { recursive: true, force: true });
  }
  rmSync(probe, { recursive: true, force: true });
}

// ═══ S7. learn 三档（T-M2.5）═══
section('learn 三档：manual 留审 · assist 阈值 0.89 留审/0.90 自动 · auto 全自动');
{
  // manual：全部留审
  const homeM = mkHome('tier-manual');
  runCli(homeM, ['knowledge', 'init']);
  writeSettings(homeM, { sources: [], knowledge: { automation: 'manual' } });
  const pendingM = join(homeM, '.evokit', 'knowledge', '.pending');
  const mkDraftIn = (dir, title, conf, verdict, suspect) => cardsMod.writeCard(dir, {
    front: { title, type: 'fact', source: 's.md', status: 'draft', confidence: conf, verdict, tags: ['t'], ...(suspect ? { suspect: true } : {}) },
    body: '陈述。',
  });
  mkDraftIn(pendingM, '甲', 0.99, 'ADD');
  let r = runCli(homeM, ['learn', '--no-distill']);
  assert(r.code === 0, 'learn --no-distill 退出码 0', (r.stderr || '').slice(0, 150));
  assert(existsSync(join(pendingM, readdirSync(pendingM)[0])) && r.stdout.includes('manual 档'), 'manual 档留审且报告标注');

  // assist：阈值边界 + NOOP/suspect 不自动
  const homeA = mkHome('tier-assist');
  runCli(homeA, ['knowledge', 'init']);
  writeSettings(homeA, { sources: [], knowledge: { automation: 'assist', autoThreshold: 0.9 } });
  const pendingA = join(homeA, '.evokit', 'knowledge', '.pending');
  const a89 = mkDraftIn(pendingA, '阈值下', 0.89, 'ADD');
  const a90 = mkDraftIn(pendingA, '阈值上', 0.9, 'ADD');
  const nn = mkDraftIn(pendingA, '无价值', 0.99, 'NOOP');
  const su = mkDraftIn(pendingA, '可疑卡', 0.99, 'ADD', true);
  r = runCli(homeA, ['learn', '--no-distill']);
  const kDirA = join(homeA, '.evokit', 'knowledge');
  assert(existsSync(join(kDirA, `${a90}.md`)) && !existsSync(join(pendingA, `${a90}.md`)), 'assist：0.90 自动入库');
  assert(readFileSync(join(kDirA, `${a90}.md`), 'utf-8').includes('acceptedBy: auto'), '自动入库标记 acceptedBy: auto');
  assert(existsSync(join(pendingA, `${a89}.md`)), 'assist：0.89 留审');
  assert(existsSync(join(pendingA, `${nn}.md`)), 'assist：NOOP 裁决不自动入库');
  assert(existsSync(join(pendingA, `${su}.md`)), 'assist：suspect 标记不自动入库');
  rmSync(homeA, { recursive: true, force: true });

  // auto：全部自动（含 NOOP/suspect）
  const homeU = mkHome('tier-auto');
  runCli(homeU, ['knowledge', 'init']);
  writeSettings(homeU, { sources: [], knowledge: { automation: 'manual' } });
  const pendingU = join(homeU, '.evokit', 'knowledge', '.pending');
  const u1 = mkDraftIn(pendingU, '低分卡', 0.3, 'NOOP', true);
  const u2 = mkDraftIn(pendingU, '高分卡', 0.99, 'ADD');
  r = runCli(homeU, ['learn', '--no-distill', '--auto']);
  const kDirU = join(homeU, '.evokit', 'knowledge');
  assert(r.code === 0, 'learn --auto 退出码 0');
  assert(existsSync(join(kDirU, `${u1}.md`)) && existsSync(join(kDirU, `${u2}.md`)), 'auto 档全部自动入库（含 NOOP/suspect）');
  assert(readdirSync(pendingU).filter((f) => f.endsWith('.md')).length === 0, 'auto 档 .pending 清空');
  assert(readFileSync(join(kDirU, `${u1}.md`), 'utf-8').includes('acceptedBy: auto'), 'auto 档入库也带 acceptedBy: auto');
  rmSync(homeU, { recursive: true, force: true });
  rmSync(homeM, { recursive: true, force: true });
}

// ═══ S8. 全链路 mock agent：harvest→distill→.pending ═══
section('全链路（mock agent）：UPDATE 裁决 · suspect 标记 · 候选粗筛 · 双阶段调用 · prompt 脱敏');
{
  const home = mkHome('e2e');
  const fx = writeHarvestFixtures(home);
  const fake = writeFakeAgent(home);
  const aMd = join(fx, 'a.md');
  runCli(home, ['knowledge', 'init']);
  const existingId = cardsMod.writeCard(join(home, '.evokit', 'knowledge'), {
    front: { title: 'fnm 版本切换', type: 'preference', source: aMd, status: 'confirmed', confidence: 0.8, tags: ['fnm'] },
    body: '旧卡：Node 版本用 fnm。',
  });
  wf(join(home, 'fake-a.json'), JSON.stringify([
    { title: 'fnm 优先用于 Node 版本切换', type: 'preference', tags: ['fnm', 'node'], statement: 'Node.js 版本切换优先用 fnm 而非 nvm。', evidence: [aMd], confidence: 0.85 },
    { title: '幻觉来源卡', type: 'fact', tags: ['x'], statement: '来源文件不存在于本批。', evidence: ['C:/definitely/not/in/batch.jsonl'], confidence: 0.95 },
    { title: '缺来源卡', type: 'fact', statement: '没有 source 与 evidence。', confidence: 0.5 },
  ], null, 1) + '\n');
  wf(join(home, 'fake-b.json'), JSON.stringify([
    { title: 'fnm 优先用于 Node 版本切换', type: 'preference', tags: ['fnm'], statement: 'Node.js 版本切换优先用 fnm 而非 nvm。', confidence: 0.85, verdict: 'UPDATE', oldId: existingId, change: '合并既有卡细节' },
    { title: '幻觉来源卡', verdict: 'ADD' },
  ]) + '\n');
  writeSettings(home, {
    sources: [{ id: 'mem-src', adapter: 'memory-cards', root: fx, enabled: true }],
    knowledge: { automation: 'manual', distillAgentOrder: ['codex'] },
    codexCli: mockCli(fake),
  });
  const promptLog = join(home, 'prompt.log');
  const r = runCli(home, ['learn'], {
    EVOKIT_FAKE_A: join(home, 'fake-a.json'),
    EVOKIT_FAKE_B: join(home, 'fake-b.json'),
    EVOKIT_FAKE_LOG: promptLog,
  });
  assert(r.code === 0, 'learn 全链路退出码 0', (r.stderr || '').slice(0, 200));

  const pendingDir = join(home, '.evokit', 'knowledge', '.pending');
  const drafts = cardsMod.listCards(pendingDir);
  assert(drafts.length === 2, `产出 2 张草稿（缺来源卡被丢弃；实际 ${drafts.length}）`);
  const dUpdate = drafts.find((d) => d.front.title === 'fnm 优先用于 Node 版本切换');
  const dSus = drafts.find((d) => d.front.title === '幻觉来源卡');
  assert(!!dUpdate && !!dSus, '两张卡都落 .pending');
  if (dUpdate && dSus) {
    assert(dUpdate.front.verdict === 'UPDATE' && (dUpdate.front.oldId === existingId || dUpdate.front.oldId === String(existingId)), 'UPDATE 裁决带 oldId');
    const relatedOk = (dUpdate.front.related || []).some((x) => String(x) === String(existingId));
    assert(relatedOk && dUpdate.front.change, 'UPDATE 草稿 related 含 oldId 且带 change 改法');
    assert(dSus.front.suspect === true || String(dSus.front.suspect) === 'true', 'source 未命中本批文件清单 → suspect 标记');
  }
  for (const d of drafts) {
    assert(d.front.status === 'draft' && d.front.source && d.front.confidence !== undefined && Array.isArray(d.front.tags), `草稿字段齐全（${d.id}）`);
    assert(/^\d{8}-\d{6}-/.test(d.id), `草稿 id 为 <ts>-<slug> 形态（${d.id}）`);
  }
  assert(r.stdout.includes('suspect 1'), '报告标注 suspect 计数');
  assert(r.stdout.includes('丢弃 1'), '报告标注缺 source 丢弃计数');
  assert(r.stdout.includes('codex'), '报告标注执行者');

  const logText = readFileSync(promptLog, 'utf-8');
  assert((logText.match(/==STAGE==/g) || []).length === 2, '阶段 A/B 各调用一次执行者');
  assert(logText.includes('fnm 切版本'), '阶段 A prompt 含本批事件文本');
  assert(logText.includes('[REDACTED]') && !logText.includes('sk-abcdefghijklmnopqrst'), 'prompt 内容已脱敏');
  assert(logText.includes(existingId), '阶段 B prompt 含既有同 tag 卡摘要（候选粗筛生效）');
  assert(logText.includes('不调用工具'), 'prompt 含委托纪律约束（红线 #9）');
  rmSync(home, { recursive: true, force: true });
}

// ═══ S9. 全链路垃圾输出 → orphan ═══
section('全链路（垃圾输出）：orphan 落盘绝不丢弃');
{
  const home = mkHome('orphan');
  const fx = writeHarvestFixtures(home);
  const fake = writeFakeAgent(home);
  const rawOut = '这段输出不是 JSON，也无法提取对象。';
  wf(join(home, 'fake-a.txt'), rawOut);
  writeSettings(home, {
    sources: [{ id: 'mem-src', adapter: 'memory-cards', root: fx, enabled: true }],
    knowledge: { distillAgentOrder: ['codex'] },
    codexCli: mockCli(fake),
  });
  const r = runCli(home, ['learn'], { EVOKIT_FAKE_A: join(home, 'fake-a.txt') });
  assert(r.code === 0, '垃圾输出不崩溃（exit 0）');
  const orphanDir = join(home, '.evokit', 'knowledge', '.pending', 'orphan');
  assert(existsSync(orphanDir), 'orphan 目录已创建');
  const orphans = readdirSync(orphanDir).filter((f) => f.endsWith('.txt'));
  assert(orphans.length === 1, `垃圾输出落 1 个 orphan（实际 ${orphans.length}）`);
  assert(readFileSync(join(orphanDir, orphans[0]), 'utf-8') === rawOut, 'orphan 内容与 agent 原始输出逐字一致');
  assert(r.stdout.includes('orphan 1'), '报告标注 orphan 计数');
  assert(readdirSync(join(home, '.evokit', 'knowledge', '.pending')).filter((f) => f.endsWith('.md')).length === 0, '未产草稿');
  rmSync(home, { recursive: true, force: true });
}

// ═══ S10. 执行者降级与无执行者 ═══
section('执行者降级：codex 失败→pi 接管 · 全不可用→降级提示');
{
  const home = mkHome('fallback');
  const fx = writeHarvestFixtures(home);
  const fake = writeFakeAgent(home);
  const broken = writeBrokenAgent(home);
  const aMd = join(fx, 'a.md');
  wf(join(home, 'fake-a.json'), JSON.stringify([
    { title: '降级卡', type: 'fact', tags: ['x'], statement: '由 pi 产出。', evidence: [aMd], confidence: 0.7 },
  ]) + '\n');
  wf(join(home, 'fake-b.json'), JSON.stringify([{ title: '降级卡', verdict: 'ADD' }]) + '\n');
  writeSettings(home, {
    sources: [{ id: 'mem-src', adapter: 'memory-cards', root: fx, enabled: true }],
    knowledge: { automation: 'manual', distillAgentOrder: ['codex', 'pi'] },
    codexCli: brokenCli(broken), // codex 探测可用但运行时失败
  });
  const piScript = join(home, 'pi-mock.js');
  wf(piScript, FAKE_AGENT_SRC);
  // pi 也用同一 mock 形态：单独 settings 覆写 pi 的 cli
  const settingsPath = join(home, '.evokit', 'settings.json');
  const cfg = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  cfg.agents.find((a) => a.id === 'pi').cli = { bin: 'pi', binPath: process.execPath, args: [piScript], input: 'stdin', timeout: 20, outputFormat: 'text' };
  writeFileSync(settingsPath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
  const r = runCli(home, ['learn'], { EVOKIT_FAKE_A: join(home, 'fake-a.json'), EVOKIT_FAKE_B: join(home, 'fake-b.json') });
  assert(r.code === 0, '降级链 learn 退出码 0');
  assert(r.stdout.includes('执行者 pi'), 'codex 失败后 pi 接管并在报告标注');
  const draftsFb = cardsMod.listCards(join(home, '.evokit', 'knowledge', '.pending'));
  assert(draftsFb.length === 1 && draftsFb[0].front.title === '降级卡', '降级后草稿照常落盘');
  rmSync(home, { recursive: true, force: true });

  // 全不可用：降级提示不崩溃
  const homeN = mkHome('noagent');
  const fxN = writeHarvestFixtures(homeN);
  writeSettings(homeN, { sources: [{ id: 'mem-src', adapter: 'memory-cards', root: fxN, enabled: true }], knowledge: {} });
  const rN = runCli(homeN, ['learn']);
  assert(rN.code === 0, '无可用执行者时 learn 不崩溃（exit 0）');
  assert(rN.stdout.includes('无可用执行者') || rN.stdout.includes('已降级'), '报告说明无可用执行者');
  rmSync(homeN, { recursive: true, force: true });
}

// ═══ S11. --session 过滤 ═══
section('learn --session：只喂指定会话的事件');
{
  const home = mkHome('session');
  const fake = writeFakeAgent(home);
  wf(join(home, '.evokit', 'inbox', 'src', '20260101-aaaa.jsonl'),
    JSON.stringify({ source: 'src', kind: 'session', project: 'p', ts: '2026-01-01T00:00:00Z', sessionId: 'sess-1', text: 'S1MARK 唯一标记甲', meta: { file: 'f1.jsonl', line: 1 } }) + '\n' +
    JSON.stringify({ source: 'src', kind: 'session', project: 'p', ts: '2026-01-02T00:00:00Z', sessionId: 'sess-2', text: 'S2MARK 唯一标记乙', meta: { file: 'f2.jsonl', line: 1 } }) + '\n');
  wf(join(home, 'fake-a.json'), JSON.stringify([
    { title: 'Sess 卡', type: 'fact', tags: ['x'], statement: 'S 陈述。', evidence: ['f1.jsonl'], confidence: 0.6 },
  ]) + '\n');
  wf(join(home, 'fake-b.json'), JSON.stringify([{ title: 'Sess 卡', verdict: 'ADD' }]) + '\n');
  writeSettings(home, { sources: [], knowledge: { automation: 'manual', distillAgentOrder: ['codex'] }, codexCli: mockCli(fake) });
  const promptLog = join(home, 'prompt.log');
  const r = runCli(home, ['learn', '--session', 'sess-1'], {
    EVOKIT_FAKE_A: join(home, 'fake-a.json'),
    EVOKIT_FAKE_B: join(home, 'fake-b.json'),
    EVOKIT_FAKE_LOG: promptLog,
  });
  assert(r.code === 0, 'learn --session 退出码 0', (r.stderr || '').slice(0, 150));
  const logText = readFileSync(promptLog, 'utf-8');
  assert(logText.includes('S1MARK') && !logText.includes('S2MARK'), '--session 只喂指定会话的事件');
  rmSync(home, { recursive: true, force: true });
}

// ═══ S12. 命令表同步（红线 #5）═══
section('命令表：KNOWN_COMMANDS 含 harvest/learn · help 文案 · 拼错建议');
{
  const src = readFileSync(join(__dirname, 'evokit.mjs'), 'utf-8');
  assert(/KNOWN_COMMANDS\s*=\s*\[[^\]]*'harvest'[^\]]*\]/.test(src), 'KNOWN_COMMANDS 含 harvest');
  assert(/KNOWN_COMMANDS\s*=\s*\[[^\]]*'learn'[^\]]*\]/.test(src), 'KNOWN_COMMANDS 含 learn');

  const home = mkHome('cmd');
  writeSettings(home, { sources: [] });
  const helpR = runCli(home, ['help']);
  assert(helpR.stdout.includes('evokit harvest') && helpR.stdout.includes('evokit learn'), 'help 文案含 harvest 与 learn');
  assert(helpR.stdout.includes('--no-distill') && helpR.stdout.includes('--dry-run'), 'help 含关键参数说明');

  const typoR = runCli(home, ['harvestt']);
  assert(typoR.code === 1, '拼错 harvestt 退出码 1');
  assert((typoR.stdout + typoR.stderr).includes('harvest'), '拼错 harvestt 建议 harvest');
  rmSync(home, { recursive: true, force: true });
}

// ── 清理与汇总 ──
rmSync(scratchHome, { recursive: true, force: true });
console.log(`\n========== 测试结果：${passed} 通过 / ${failed} 失败 ==========`);
process.exitCode = failed > 0 ? 1 : 0;
