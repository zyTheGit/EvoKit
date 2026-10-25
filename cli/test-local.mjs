#!/usr/bin/env node
/**
 * EvoKit CLI 本地隔离测试
 *
 * 通过 EVOKIT_HOME 环境变量把 CLI 的"家目录"重定向到临时目录，
 * 在不触碰真实 ~/.claude、~/.pi、~/.codex 的前提下，
 * 完整验证 init / sync / check / status / uninstall / agents / --agent 全流程。
 *
 * 运行：
 *   node cli/test-local.mjs
 */

import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, mkdtempSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createServer } from 'node:http';
import http from 'node:http';

const execAsync = promisify(exec);

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, 'evokit.mjs');

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}
function fail(name, detail) {
  failed++;
  console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
}
function assert(cond, name, detail) {
  cond ? ok(name) : fail(name, detail);
}

// 创建隔离的假 home 目录
const fakeHome = mkdtempSync(join(tmpdir(), 'evokit-test-'));
const run = (args) =>
  execSync(`node "${CLI}" ${args}`, { env: { ...process.env, EVOKIT_HOME: fakeHome }, stdio: 'pipe' }).toString();
const runIn = (cwd, args) =>
  execSync(`node "${CLI}" ${args}`, { env: { ...process.env, EVOKIT_HOME: fakeHome }, cwd, stdio: 'pipe' }).toString();
const runErr = (args) => {
  try {
    return { out: run(args), code: 0 };
  } catch (e) {
    return { out: (e.stdout || '').toString() + (e.stderr || '').toString(), code: e.status };
  }
};

console.log(`隔离测试 home: ${fakeHome}\n`);

// ── 1. init + agents ──────────────────────────────────────
console.log('【1. init 初始化 + agents 列表】');
run('init');
assert(existsSync(join(fakeHome, '.evokit', 'context.md')), '全局源 context.md 已创建');
assert(existsSync(join(fakeHome, '.evokit', 'agents.json')), 'agents.json 已生成');

const agentsOut = run('agents');
['claude', 'pi', 'codex'].forEach((id) =>
  assert(agentsOut.includes(id), `agents 列表含 ${id}`),
);

// ── 2. sync 全量 ──────────────────────────────────────────
console.log('\n【2. sync 同步所有 agent】');
run('sync');
['claude', 'pi', 'codex'].forEach((id) => {
  const files = {
    claude: join(fakeHome, '.claude', 'CLAUDE.md'),
    pi: join(fakeHome, '.pi', 'agent', 'APPEND_SYSTEM.md'),
    codex: join(fakeHome, '.codex', 'AGENTS.md'),
  };
  assert(existsSync(files[id]), `${id} 入口已生成`);
});

// ── 2b. sync 保留块外用户内容（数据安全，绝不整文件覆盖） ──
console.log('\n【2b. sync 只更新托管块、保留块外用户内容】');
// 场景1：给 claude 入口手动加块外用户内容，再 sync，用户内容不能被抹掉
const claudePath0 = join(fakeHome, '.claude', 'CLAUDE.md');
writeFileSync(claudePath0, readFileSync(claudePath0, 'utf-8') + '\n\n# 用户手写的块外规则\n这是不能丢的内容\n');
run('sync --agent claude');
const claudeAfterSync = readFileSync(claudePath0, 'utf-8');
assert(claudeAfterSync.includes('<!-- evokit-managed:start -->'), 'sync 后仍有托管块');
assert(claudeAfterSync.includes('# 用户手写的块外规则'), 'sync 保留块外用户内容（关键：不整文件覆盖）');
assert(claudeAfterSync.includes('这是不能丢的内容'), 'sync 保留块外用户内容细节');
// 恢复：移除场景1 临时加的块外内容，避免污染后续断言
writeFileSync(claudePath0, readFileSync(claudePath0, 'utf-8').replace('\n\n# 用户手写的块外规则\n这是不能丢的内容\n', ''), 'utf-8');

// 场景2：目标文件完全不含托管块（如用户自己写的文件），sync 应追加而非覆盖
const foreignFile = join(fakeHome, '.claude', 'FOREIGN.md');
writeFileSync(foreignFile, '# 用户自己的文件\n这里没有任何托管块\n', 'utf-8');
// 把这个文件临时注册为 agent 目标来测追加行为（改 agents.json）
const agentsJsonPath = join(fakeHome, '.evokit', 'agents.json');
const agentsForAppend = JSON.parse(readFileSync(agentsJsonPath, 'utf-8'));
agentsForAppend.push({ id: 'foreign', name: 'Foreign', global: '~/.claude/FOREIGN.md' });
writeFileSync(agentsJsonPath, JSON.stringify(agentsForAppend, null, 2) + '\n', 'utf-8');
run('sync --agent foreign');
const foreignAfter = readFileSync(foreignFile, 'utf-8');
assert(foreignAfter.includes('# 用户自己的文件'), '无托管块的文件：sync 追加，原有内容保留');
assert(foreignAfter.includes('这里没有任何托管块'), '无托管块的文件：原有细节保留');
assert(foreignAfter.includes('<!-- evokit-managed:start -->'), '无托管块的文件：追加了托管块');
// 清理：移除测试用的 foreign agent，避免影响后续断言
const agentsCleaned = JSON.parse(readFileSync(agentsJsonPath, 'utf-8')).filter((x) => x.id !== 'foreign');
writeFileSync(agentsJsonPath, JSON.stringify(agentsCleaned, null, 2) + '\n', 'utf-8');


// ── 3. --agent 指定单个 ───────────────────────────────────
console.log('\n【3. --agent 指定单个 agent 操作】');
// 先改源，然后只 sync claude，验证 pi/codex 不受影响
const srcFile = join(fakeHome, '.evokit', 'context.md');
const src2 = readFileSync(srcFile, 'utf-8') + '\n- 只给 claude 的新规则\n';
writeFileSync(srcFile, src2, 'utf-8');
run('sync --agent claude');

const claudeMd = readFileSync(join(fakeHome, '.claude', 'CLAUDE.md'), 'utf-8');
const piMd = readFileSync(join(fakeHome, '.pi', 'agent', 'APPEND_SYSTEM.md'), 'utf-8');
assert(claudeMd.includes('只给 claude 的新规则'), 'claude 已同步新规则');
assert(!piMd.includes('只给 claude 的新规则'), 'pi 未受影响（仍旧内容）');

// --agent 多选
run('sync --agent pi,codex');
const piMd2 = readFileSync(join(fakeHome, '.pi', 'agent', 'APPEND_SYSTEM.md'), 'utf-8');
const codexMd = readFileSync(join(fakeHome, '.codex', 'AGENTS.md'), 'utf-8');
assert(piMd2.includes('只给 claude 的新规则'), 'pi 已同步（多选）');
assert(codexMd.includes('只给 claude 的新规则'), 'codex 已同步（多选）');

// ── 3.5 短别名 -a / -r / -p 等价长选项 ───────────────────
console.log('\n【3.5 短别名 -a/-r/-p 等价长选项】');
// -a 等价 --agent
run('sync -a claude');
assert(readFileSync(join(fakeHome, '.claude', 'CLAUDE.md'), 'utf-8').includes('只给 claude 的新规则'), '-a claude 等价 --agent claude');
// -r 等价 --resource
const ctxBefore = readFileSync(join(fakeHome, '.pi', 'agent', 'APPEND_SYSTEM.md'), 'utf-8');
run('sync -r context');
const ctxAfter = readFileSync(join(fakeHome, '.pi', 'agent', 'APPEND_SYSTEM.md'), 'utf-8');
assert(ctxAfter.includes('<!-- evokit-managed:start -->'), '-r context 等价 --resource context（成功同步）');
// -p 等价 --project：临时项目目录 init -p + status -p
const shortProjDir = join(fakeHome, 'short-proj');
mkdirSync(shortProjDir, { recursive: true });
runIn(shortProjDir, 'init -p');
assert(existsSync(join(shortProjDir, '.evokit', 'context.md')), '-p 等价 --project（init -p 生成项目源）');
const shortStatus = runIn(shortProjDir, 'status -p');
assert(shortStatus.includes('项目'), '-p 等价 --project（status -p 进入项目级分支）');

// ── 4. status --agent 过滤 ────────────────────────────────
console.log('\n【4. status --agent 过滤】');
const statusAll = run('status');
assert(statusAll.includes('claude') && statusAll.includes('pi') && statusAll.includes('codex'), 'status 全量列出三个');
const statusOne = run('status --agent pi');
assert(statusOne.includes('pi') && !statusOne.includes('claude'), 'status --agent pi 只列 pi');
// 位置参数回退：status pi 等价 status --agent pi
const statusBare = run('status pi');
assert(statusBare.includes('pi') && !statusBare.includes('claude'), 'status pi 位置参数等价 --agent pi');

// ── 5. 新增 agent（不改代码） ──────────────────────────────
console.log('\n【5. 新增 agent：改 agents.json 不加代码】');
const agentsPath = join(fakeHome, '.evokit', 'agents.json');
const agents = JSON.parse(readFileSync(agentsPath, 'utf-8'));
agents.push({ id: 'cursor', name: 'Cursor', global: '~/.cursor/rules/global.mdc', project: '.cursor/rules/project.mdc' });
writeFileSync(agentsPath, JSON.stringify(agents, null, 2) + '\n', 'utf-8');

const agentsOut2 = run('agents');
assert(agentsOut2.includes('cursor'), 'agents 列表出现新 agent cursor');

run('sync --agent cursor');
assert(
  existsSync(join(fakeHome, '.cursor', 'rules', 'global.mdc')),
  '新 agent cursor 的全局入口已生成（代码零改动）',
);
const cursorMd = readFileSync(join(fakeHome, '.cursor', 'rules', 'global.mdc'), 'utf-8');
assert(cursorMd.includes('只给 claude 的新规则'), '新 agent 同步内容正确');

// ── 6. uninstall --agent 指定 ─────────────────────────────
console.log('\n【6. uninstall --agent 指定卸载】');
// 先给 claude 手动加用户内容，验证 uninstall 保留
const claudePath = join(fakeHome, '.claude', 'CLAUDE.md');
writeFileSync(claudePath, readFileSync(claudePath, 'utf-8') + '\n\n用户手动加的规则\n');
run('uninstall --agent claude');
const claudeAfter = readFileSync(claudePath, 'utf-8');
assert(!claudeAfter.includes('<!-- evokit-managed:start -->'), 'claude 托管块已移除');
assert(claudeAfter.includes('用户手动加的规则'), 'claude 用户内容保留（无数据丢失）');
// pi 未卸载，应仍有托管块
assert(readFileSync(join(fakeHome, '.pi', 'agent', 'APPEND_SYSTEM.md'), 'utf-8').includes('<!-- evokit-managed:start -->'), 'pi 未被误卸载');

// ── 6b. uninstall --project 项目级卸载 ───────────────────
console.log('\n【6b. uninstall --project 项目级卸载】');
// 创建临时项目目录
const projDir = join(fakeHome, 'my-project');
mkdirSync(projDir, { recursive: true });

// init --project + sync --project
runIn(projDir, 'init --project');
runIn(projDir, 'sync --project');
const projClaude = join(projDir, 'CLAUDE.md');
const projCodex = join(projDir, 'AGENTS.md');
assert(existsSync(projClaude), '项目级 CLAUDE.md 已生成');
assert(existsSync(projCodex), '项目级 AGENTS.md 已生成');

// 手动加用户内容，验证 uninstall --project 保留
writeFileSync(projClaude, readFileSync(projClaude, 'utf-8') + '\n\n项目手动规则\n');
runIn(projDir, 'uninstall --project');

const projClaudeAfter = readFileSync(projClaude, 'utf-8');
assert(!projClaudeAfter.includes('<!-- evokit-managed:start -->'), '项目级 CLAUDE.md 托管块已移除');
assert(projClaudeAfter.includes('项目手动规则'), '项目级用户内容保留（无数据丢失）');
// codex 项目入口（纯托管块）应被删除
assert(!existsSync(projCodex), '项目级 AGENTS.md（纯托管块）已删除');
// 项目级源 .evokit/context.md 应保留（不删除源）
assert(existsSync(join(projDir, '.evokit', 'context.md')), '项目级源 context.md 保留（不删除）');

// ── 6c. check/status --project 项目级 ────────────────────
console.log('\n【6c. check/status --project 项目级】');
const projDir2 = join(fakeHome, 'my-project-2');
mkdirSync(projDir2, { recursive: true });
runIn(projDir2, 'init --project');
runIn(projDir2, 'sync --project');

// check --project：应全部一致（退出码 0）
const checkProjRun = (() => {
  try {
    execSync(`node "${CLI}" check --project`, { env: { ...process.env, EVOKIT_HOME: fakeHome }, cwd: projDir2, stdio: 'pipe' });
    return { code: 0 };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
})();
assert(checkProjRun.code === 0, 'check --project 全部一致（退出码 0）');

// status --project：应列出项目级入口
const statusProj = runIn(projDir2, 'status --project');
assert(statusProj.includes('CLAUDE.md') || statusProj.includes('Claude Code'), 'status --project 列出项目级入口');
assert(statusProj.includes('一致'), 'status --project 显示一致状态');

// 修改项目级源，check --project 应检测到不一致
const projSrc2 = join(projDir2, '.evokit', 'context.md');
writeFileSync(projSrc2, readFileSync(projSrc2, 'utf-8') + '\n- 新增项目规则\n');
const checkProjDrift = (() => {
  try {
    execSync(`node "${CLI}" check --project`, { env: { ...process.env, EVOKIT_HOME: fakeHome }, cwd: projDir2, stdio: 'pipe' });
    return { code: 0 };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
})();
assert(checkProjDrift.code !== 0, 'check --project 检测到漂移（退出码非 0）');

// ── 6c2. 配置分层：项目级 agents/resources 覆盖全局 ──────
console.log('\n【6c2. 配置分层：项目级 agents/resources 覆盖全局】');
// 新建项目目录，init -p 应生成项目级 context.md + agents.json + resources.json
const layerDir = join(fakeHome, 'layered-proj');
mkdirSync(layerDir, { recursive: true });
runIn(layerDir, 'init -p');
assert(existsSync(join(layerDir, '.evokit', 'context.md')), 'init -p 生成项目级 context.md');
assert(existsSync(join(layerDir, '.evokit', 'agents.json')), 'init -p 生成项目级 agents.json');
assert(existsSync(join(layerDir, '.evokit', 'resources.json')), 'init -p 生成项目级 resources.json');

// 项目级覆盖：把项目级 agents.json 里 claude 的 project 入口改成自定义路径，验证 sync -p 按项目级配置走
const layerAgents = JSON.parse(readFileSync(join(layerDir, '.evokit', 'agents.json'), 'utf-8'));
const claudeEntry = layerAgents.find((a) => a.id === 'claude');
claudeEntry.project = 'CUSTOM_CLAUDE.md'; // 覆盖全局默认的 CLAUDE.md
writeFileSync(join(layerDir, '.evokit', 'agents.json'), JSON.stringify(layerAgents, null, 2) + '\n', 'utf-8');
runIn(layerDir, 'sync -p');
assert(existsSync(join(layerDir, 'CUSTOM_CLAUDE.md')), '项目级覆盖：sync -p 用项目级 claude.project（CUSTOM_CLAUDE.md）');
assert(!existsSync(join(layerDir, 'CLAUDE.md')), '项目级覆盖：不再用全局默认的 CLAUDE.md');

// 项目级新增 agent（全局没有的），sync -p 应合并进来自动生效
layerAgents.push({ id: 'proj-only', name: 'ProjOnly', global: '~/.proj-only/global.md', project: 'PROJ_ONLY.md' });
writeFileSync(join(layerDir, '.evokit', 'agents.json'), JSON.stringify(layerAgents, null, 2) + '\n', 'utf-8');
runIn(layerDir, 'sync -p');
assert(existsSync(join(layerDir, 'PROJ_ONLY.md')), '项目级新增 agent（全局无）在 sync -p 时生效');


// ── 6d. 错误提示意图猜测 ─────────────────────────────────
console.log('\n【6d. 错误提示意图猜测】');
// 未知命令
const unknownCmd = runErr('syncc');
assert(unknownCmd.out.includes('sync'), '未知命令猜测提示 sync');
// 未知 agent id
const unknownAgent = runErr('status --agent claud');
assert(unknownAgent.out.includes('claude'), '未知 agent 猜测提示 claude');

// ── 7. 资源（resource）扩展 ──────────────────────────────
console.log('\n【7. 资源模型：resources.json + 软链接】');
// init 应已生成 resources.json
assert(existsSync(join(fakeHome, '.evokit', 'resources.json')), 'resources.json 已生成');

const resourcesOut = run('resources');
assert(resourcesOut.includes('context'), 'resources 列表含默认 context 资源');

// 新增一个 symlink 型资源：skill 目录软链接到多个 agent
const skillDir = join(fakeHome, '.evokit', 'skills', 'my-skill');
mkdirSync(skillDir, { recursive: true });
writeFileSync(join(skillDir, 'SKILL.md'), '# 我的技能\n\n一处改动多处更新\n', 'utf-8');

const resourcesPath = join(fakeHome, '.evokit', 'resources.json');
const resources = JSON.parse(readFileSync(resourcesPath, 'utf-8'));
resources.push({
  id: 'my-skill',
  type: 'symlink',
  source: '~/.evokit/skills/my-skill',
  targets: ['~/.claude/skills/my-skill', '~/.codex/skills/my-skill'],
});
writeFileSync(resourcesPath, JSON.stringify(resources, null, 2) + '\n', 'utf-8');

const resourcesOut2 = run('resources');
assert(resourcesOut2.includes('my-skill'), 'resources 列表出现新资源 my-skill');

// 只同步 my-skill（--resource 过滤）
run('sync --resource my-skill');
const claudeSkillLink = join(fakeHome, '.claude', 'skills', 'my-skill');
const codexSkillLink = join(fakeHome, '.codex', 'skills', 'my-skill');
assert(existsSync(claudeSkillLink), 'claude 的 skill 软链接已创建');
assert(existsSync(codexSkillLink), 'codex 的 skill 软链接已创建');
assert(lstatSync(claudeSkillLink).isSymbolicLink(),
  'claude skill 是软链接/junction（指向源目录）');

// 验证软链接「一处改动多处实时生效」：改源，目标立即可见（无需重新 sync）
writeFileSync(join(skillDir, 'SKILL.md'), '# 我的技能\n\n改了源文件\n', 'utf-8');
const viaLink = readFileSync(join(claudeSkillLink, 'SKILL.md'), 'utf-8');
assert(viaLink.includes('改了源文件'), '软链接实时反映源改动（无需重新 sync）');

// --resource 多选：同步 context + my-skill
run('sync --resource context,my-skill');
assert(existsSync(join(fakeHome, '.claude', 'CLAUDE.md')), 'context 资源仍正常同步');

// 幂等性：重复 sync 软链接资源，不应报错、不应重复叠加
run('sync --resource my-skill');
assert(lstatSync(claudeSkillLink).isSymbolicLink(), '重复 sync 后仍是软链接（幂等）');

// 数据保护：目标已是「真实目录」时应拒绝覆盖，不误删用户数据
const guardTarget = join(fakeHome, '.guard', 'skills', 'my-skill');
mkdirSync(guardTarget, { recursive: true });
writeFileSync(join(guardTarget, 'user-data.txt'), '重要数据\n', 'utf-8');
const guardResources = JSON.parse(readFileSync(resourcesPath, 'utf-8'));
guardResources.push({
  id: 'guard-skill',
  type: 'symlink',
  source: '~/.evokit/skills/my-skill',
  targets: ['~/.guard/skills/my-skill'],
});
writeFileSync(resourcesPath, JSON.stringify(guardResources, null, 2) + '\n', 'utf-8');
const guardRun = runErr('sync --resource guard-skill');
assert(guardRun.code !== 0, '目标为真实目录时 sync 报错（拒绝覆盖）');
assert(existsSync(join(guardTarget, 'user-data.txt')), '真实目录及其内容未被误删（数据保护）');

// ── 7b. 跨平台路径写法（反斜杠 / 环境变量） ──────────────
console.log('\n【7b. 跨平台路径写法：反斜杠 + 环境变量】');
// 设置一个测试环境变量
const envHome = join(fakeHome, 'env-home');
mkdirSync(envHome, { recursive: true });

const envResources = JSON.parse(readFileSync(resourcesPath, 'utf-8'));
// 用 %VAR% 和 ${VAR} 写法声明一个新的 text 资源目标
envResources.push({
  id: 'env-test',
  type: 'text',
  source: '~/.evokit/context.md',
  targets: ['%EVOKIT_TEST_HOME%/claude.md', '${EVOKIT_TEST_HOME}/codex.md'],
});
writeFileSync(resourcesPath, JSON.stringify(envResources, null, 2) + '\n', 'utf-8');

const envRun = execSync(`node "${CLI}" sync --resource env-test`, {
  env: { ...process.env, EVOKIT_HOME: fakeHome, EVOKIT_TEST_HOME: envHome },
  stdio: 'pipe',
}).toString();
assert(existsSync(join(envHome, 'claude.md')), '%VAR% 环境变量展开生效（Windows 写法）');
assert(existsSync(join(envHome, 'codex.md')), '${VAR} 环境变量展开生效（三平台写法）');

// 反斜杠写法：Windows 风格路径也应被归一化（在 agents.json 中写反斜杠）
const agentsPath2 = join(fakeHome, '.evokit', 'agents.json');
const agents2 = JSON.parse(readFileSync(agentsPath2, 'utf-8'));
agents2.push({ id: 'backslash', name: 'Backslash', global: '~\\.backslash\\AGENTS.md', project: null });
writeFileSync(agentsPath2, JSON.stringify(agents2, null, 2) + '\n', 'utf-8');
run('sync --agent backslash');
assert(
  existsSync(join(fakeHome, '.backslash', 'AGENTS.md')),
  '反斜杠路径写法被归一化（~\\ → ~/）',
);

// ── 7c. 远程源（URL 拉取） ──────────────────────────────
console.log('\n【7c. 远程源：http(s) 拉取】');
// 起一个本地 HTTP server 模拟远程源（离线可跑，不依赖外网）
const remoteContent = '# 远程规则\n\n- 来自团队共享的规则\n- 远程拉取\n';
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(remoteContent);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const remoteUrl = `http://127.0.0.1:${port}/rules.md`;

// 新增一个 remote 资源（source 为 URL）
const remoteResources = JSON.parse(readFileSync(resourcesPath, 'utf-8'));
remoteResources.push({
  id: 'team-rules',
  type: 'remote',
  source: remoteUrl,
  targets: ['~/.claude/team-rules.md'],
});
writeFileSync(resourcesPath, JSON.stringify(remoteResources, null, 2) + '\n', 'utf-8');

const remoteRun = await execAsync(`node "${CLI}" sync --resource team-rules`, {
  env: { ...process.env, EVOKIT_HOME: fakeHome },
}).then(() => ({ code: 0 })).catch((e) => ({ code: e.code, out: e.stdout + e.stderr }));
assert(remoteRun.code === 0, '远程源 sync 成功（退出码 0）');
const remoteTarget = join(fakeHome, '.claude', 'team-rules.md');
assert(existsSync(remoteTarget), '远程源内容已写入目标');
const remoteTargetContent = readFileSync(remoteTarget, 'utf-8');
assert(remoteTargetContent.includes('远程拉取'), '远程源内容正确写入托管块');
assert(remoteTargetContent.includes('<!-- evokit-managed:start -->'), '远程源写入带托管块标记');

// 验证缓存：远程源应缓存到 ~/.evokit/cache/
const cacheDir = join(fakeHome, '.evokit', 'cache');
assert(existsSync(cacheDir), '远程源缓存目录已创建');

server.close();

// ── 7d. 代理（HTTP 代理转发） ─────────────────────────────
console.log('\n【7d. 代理：resources.json 的 proxy 字段】');
// 起一个本地 HTTP 代理 server：接收绝对 URI 请求并转发到目标
const proxyContent = '# 通过代理拉取\n\n- 代理生效\n';
const targetServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(proxyContent);
});
await new Promise((resolve) => targetServer.listen(0, '127.0.0.1', resolve));
const targetPort = targetServer.address().port;

// 代理 server：收到请求后，自己向 target 发请求并回传
const proxyServer = createServer((req, res) => {
  // 绝对 URI 转发：req.url 是完整 URL（如 http://127.0.0.1:port/...）
  const targetUrl = req.url;
  http.get(targetUrl, (upstream) => {
    res.writeHead(upstream.statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
    upstream.pipe(res);
  }).on('error', () => res.writeHead(502).end());
});
await new Promise((resolve) => proxyServer.listen(0, '127.0.0.1', resolve));
const proxyPort = proxyServer.address().port;

// 新增一个带 proxy 字段的 remote 资源
const proxyResources = JSON.parse(readFileSync(resourcesPath, 'utf-8'));
proxyResources.push({
  id: 'proxied-rules',
  type: 'remote',
  source: `http://127.0.0.1:${targetPort}/proxied.md`,
  proxy: `http://127.0.0.1:${proxyPort}`,
  targets: ['~/.claude/proxied.md'],
});
writeFileSync(resourcesPath, JSON.stringify(proxyResources, null, 2) + '\n', 'utf-8');

const proxyRun = await execAsync(`node "${CLI}" sync --resource proxied-rules`, {
  env: { ...process.env, EVOKIT_HOME: fakeHome },
}).then(() => ({ code: 0 })).catch((e) => ({ code: e.code, out: e.stdout + e.stderr }));
assert(proxyRun.code === 0, '代理拉取 sync 成功（退出码 0）');
const proxyTarget = join(fakeHome, '.claude', 'proxied.md');
assert(existsSync(proxyTarget), '代理拉取内容已写入目标');
assert(readFileSync(proxyTarget, 'utf-8').includes('代理生效'), '代理拉取内容正确');

proxyServer.close();
targetServer.close();

// ── 8. 清理 ──────────────────────────────────────────────
console.log('\n【清理测试目录】');
rmSync(fakeHome, { recursive: true, force: true });
assert(!existsSync(fakeHome), '临时目录已清理');

// ── 总结 ────────────────────────────────────────────────
console.log(`\n========== 测试结果：${passed} 通过 / ${failed} 失败 ==========`);
process.exitCode = failed > 0 ? 1 : 0;
