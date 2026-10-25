// inventory 命令：扫描知识库 + 生成通用 prompt + 调 agents cli 整理 + 回显

import { existsSync, readdirSync, lstatSync, readlinkSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { HOME } from '../paths.js';
import { loadAgents } from '../config.js';
import { detectAgentClis, runAgentCli } from '../agents-cli.js';

/** 格式化文件大小 */
function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** 格式化 mtime 为 YYYY-MM-DD */
function fmtTime(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 扫描某个目录下的条目，返回 { name, path, kind, target, size, mtime }[]。
 * kind: 'file' | 'dir' | 'symlink'
 */
function scanDir(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.')) // 跳过隐藏文件/目录
    .map((name) => {
      const full = join(dir, name);
      const st = lstatSync(full);
      const entry = { name, path: full, kind: 'dir', target: '', size: st.size, mtime: st.mtimeMs };
      if (st.isSymbolicLink()) {
        entry.kind = 'symlink';
        try {
          entry.target = readlinkSync(full);
        } catch {
          entry.target = '';
        }
      } else if (st.isFile()) {
        entry.kind = 'file';
      }
      return entry;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** 扫描单个文件的元数据（用于全局提示词文件） */
function scanFile(file) {
  if (!existsSync(file)) return null;
  const st = statSync(file);
  return { name: file, path: file, kind: 'file', target: '', size: st.size, mtime: st.mtimeMs };
}

/** 盘点全局（HOME 下）各 agent 的 agents/skills/rules/commands + 提示词 + MCP */
function scanGlobal() {
  const claudeSkills = join(HOME, '.claude', 'skills');
  const claudeAgents = join(HOME, '.claude', 'agents');
  const claudeCommands = join(HOME, '.claude', 'commands');
  const codexSkills = join(HOME, '.codex', 'skills');
  const codexRules = join(HOME, '.codex', 'rules');
  const cursorSkills = join(HOME, '.cursor', 'skills-cursor');
  const cursorAgents = join(HOME, '.cursor', 'agents');
  const cursorRules = join(HOME, '.cursor', 'rules');
  // skills 的真实源仓库（大量软链接指向这里）
  const agentsSkillRoot = join(HOME, '.agents', 'skills');

  // 全局提示词文件（单一事实源入口）
  const promptFiles = [
    scanFile(join(HOME, '.claude', 'CLAUDE.md')),
    scanFile(join(HOME, '.codex', 'AGENTS.md')),
    scanFile(join(HOME, '.pi', 'agent', 'APPEND_SYSTEM.md')),
  ].filter(Boolean);

  // MCP 配置
  const mcpFiles = [
    scanFile(join(HOME, '.codex', 'config.toml')),
    scanFile(join(HOME, '.claude', 'settings.json')),
    scanFile(join(HOME, '.pi', 'agent', 'mcp.json')),
  ].filter(Boolean);

  return {
    agents: [
      { label: 'Claude Code', dir: claudeAgents, entries: scanDir(claudeAgents) },
      { label: 'Cursor', dir: cursorAgents, entries: scanDir(cursorAgents) },
    ],
    skills: [
      { label: 'Claude Code', dir: claudeSkills, entries: scanDir(claudeSkills) },
      { label: 'Codex', dir: codexSkills, entries: scanDir(codexSkills) },
    ],
    rules: [
      { label: 'Codex', dir: codexRules, entries: scanDir(codexRules) },
      { label: 'Cursor', dir: cursorRules, entries: scanDir(cursorRules) },
    ],
    commands: [
      { label: 'Claude Code', dir: claudeCommands, entries: scanDir(claudeCommands) },
      { label: 'Cursor', dir: cursorSkills, entries: scanDir(cursorSkills) },
    ],
    promptFiles,
    mcpFiles,
    skillRoot: agentsSkillRoot,
  };
}

/** 盘点当前项目下的 agents/skills/rules/提示词 */
function scanProject() {
  const cwd = resolve(process.cwd());
  const projAgents = join(cwd, '.claude', 'agents');
  const projSkills = join(cwd, '.claude', 'skills');
  return {
    cwd,
    agents: [
      { label: '.claude/agents', dir: projAgents, entries: scanDir(projAgents) },
    ],
    skills: [
      { label: '.claude/skills', dir: projSkills, entries: scanDir(projSkills) },
    ],
    rules: [
      { label: '.cursor/rules', dir: join(cwd, '.cursor', 'rules'), entries: scanDir(join(cwd, '.cursor', 'rules')) },
      { label: '.claude/rules', dir: join(cwd, '.claude', 'rules'), entries: scanDir(join(cwd, '.claude', 'rules')) },
      { label: '.codex/rules', dir: join(cwd, '.codex', 'rules'), entries: scanDir(join(cwd, '.codex', 'rules')) },
    ],
  };
}

/**
 * 把扫描结果序列化成「清单文本」，喂给 agent 用。
 * 每行一条：路径 | 大小 | 修改时间 | 类型（软链接标注指向）
 */
function serializeInventory(scan) {
  const lines = [];
  const pushGroup = (title, groups) => {
    for (const g of groups) {
      if (g.entries.length === 0) continue;
      lines.push(`\n## ${title} — ${g.label}（${g.entries.length} 项）${g.dir}`);
      for (const e of g.entries) {
        const size = e.kind === 'file' ? ` ${fmtSize(e.size)}` : '';
        const time = ` ${fmtTime(e.mtime)}`;
        if (e.kind === 'symlink') {
          lines.push(`  [symlink] ${e.name}${size}${time} -> ${e.target}`);
        } else if (e.kind === 'dir') {
          lines.push(`  [dir]     ${e.name}/${time}`);
        } else {
          lines.push(`  [file]    ${e.name}${size}${time}`);
        }
      }
    }
  };

  lines.push('# 全局（个人）知识库清单');
  pushGroup('agents', scan.agents);
  pushGroup('skills', scan.skills);
  pushGroup('rules', scan.rules);
  pushGroup('commands', scan.commands);

  if (scan.promptFiles && scan.promptFiles.length) {
    lines.push('\n## 全局提示词文件');
    for (const f of scan.promptFiles) {
      lines.push(`  [file] ${f.path}  ${fmtSize(f.size)}  ${fmtTime(f.mtime)}`);
    }
  }
  if (scan.mcpFiles && scan.mcpFiles.length) {
    lines.push('\n## MCP 配置');
    for (const f of scan.mcpFiles) {
      lines.push(`  [file] ${f.path}  ${fmtSize(f.size)}  ${fmtTime(f.mtime)}`);
    }
  }
  if (scan.skillRoot && existsSync(scan.skillRoot)) {
    lines.push(`\n## skill 源仓库\n  ${scan.skillRoot}（软链接的真实源）`);
  }

  return lines.join('\n');
}

/** 生成通用整理 prompt（骨架对每个 agent 相同，只替换 agent 名 + 清单） */
function buildPrompt(agentName, inventoryText) {
  return `你是 ${agentName}，正在做一次自己留存知识库的冗余体检。

下面是你当前留存的知识库清单（含路径、大小、修改时间、软链接指向）：

${inventoryText}

请帮我找出并整理以下冗余，输出一份结构化 Markdown 报告：
1. 【重复项】同名或内容高度相似的 skill/规则，散在多处（列出位置与差异）
2. 【冲突项】对同一件事给出不同/矛盾规则的提示词
3. 【过期/断链】软链接指向不存在的源、长期未更新的项
4. 【可清理缓存】体积大或明显冗余的历史/缓存/会话文件
5. 【整理建议】按优先级给出具体的合并/删除/统一建议

要求：
- 只读分析，不要修改任何文件
- 输出格式固定为上面 5 个区块
- 每条冗余标注：涉及路径 + 问题说明 + 建议动作`;
}

/**
 * 编排：扫描 → 生成 prompt → 调可用 agent CLI → 回显。
 * @param {Set|null} filter agent id 过滤（null=全部可用）
 * @param {boolean} promptOnly 只打印 prompt 不调 CLI（调试用）
 */
export function inventory(filter = null, promptOnly = false) {
  const g = scanGlobal();
  const p = scanProject();
  const invText = serializeInventory(g);

  console.log('EvoKit 知识库冗余体检\n');
  console.log(`家目录：${HOME}`);
  console.log('（扫描是只读的，不会修改任何文件）\n');

  // 探测可用 CLI
  const clis = detectAgentClis();
  const available = clis.filter((c) => c.available);
  const targets = filter ? clis.filter((c) => filter.has(c.id)) : clis;

  if (promptOnly) {
    console.log('=== 生成的通用 prompt（未调用 CLI）===\n');
    console.log(buildPrompt('（任意 agent）', invText));
    return;
  }

  // 逐个调用可用 agent 整理
  let called = 0;
  for (const cli of targets) {
    if (!cli.available) {
      console.log(`✗ ${cli.name}：未检测到 \`${cli.bin}\` CLI，跳过`);
      continue;
    }
    console.log(`\n========== ${cli.name} 的冗余体检报告 ==========`);
    console.log(`（正在调用 \`${cli.bin}\` 分析，最长等待 120 秒…）\n`);
    const prompt = buildPrompt(cli.name, invText);
    const result = runAgentCli(cli, prompt);
    if (result.ok) {
      console.log(result.output);
      called++;
    } else {
      console.log(`（调用失败：${result.error}）`);
    }
  }

  if (called === 0) {
    console.log('\n提示：未成功调用任何 agent CLI。');
    console.log('  已安装的 CLI：' + (available.length ? available.map((c) => c.bin).join(', ') : '无'));
    console.log('  可用 `evokit inventory --prompt` 只生成 prompt，手动喂给任意 agent。');
  }

  // 附：EvoKit 托管关系
  const managed = loadAgents();
  console.log('\n========== EvoKit 托管关系 ==========');
  for (const a of managed) {
    console.log(`  ${a.id.padEnd(8)} ${a.name.padEnd(14)} 全局: ${a.global}  项目: ${a.project || '—'}`);
  }
}
