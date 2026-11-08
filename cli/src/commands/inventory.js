// inventory 命令：扫描知识库 + 生成通用 prompt + 调 agents cli 整理 + 回显
// T-M5.3：扫描输出增「知识库」区块（三态卡计数/.pending 草稿/references 事件/索引行 + 每卡一行清单，上限 200 行），
//   随 {inventory} 占位符并入委托 prompt，使六区块体检覆盖知识库；知识根不存在时输出一行提示，不影响其他区块。

import { existsSync, readdirSync, lstatSync, readlinkSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { HOME, EVOKIT_DIR, KNOWLEDGE_DIR, KNOWLEDGE_INDEX_FILE, PENDING_DIR, REFERENCES_FILE } from '../paths.js';
import { listCards } from '../knowledge-cards.js';
import { readIndex } from '../knowledge-index.js';
import { readReferences } from '../references.js';
import { loadAgents, loadPrompts } from '../config.js';
import { DEFAULT_PROMPTS } from '../defaults.js';
import { detectAgentClis, runAgentCli } from '../agents-cli.js';
import { debug, textMeta } from '../debug.js';

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

/** 知识库清单上限（防超长 prompt；超出只计数并标注截断） */
const KNOWLEDGE_LIST_CAP = 200;

/**
 * 扫描知识根（T-M5.3）：confirmed/draft/retired 卡计数 + .pending 草稿数 + references.jsonl 事件数 +
 * 索引行数 + 卡片清单（每卡 id/title/type/status/tags，上限 200 行）。
 * 知识根不存在返回 null（由 serializeInventory 输出一行提示，不影响其他区块）。
 */
function scanKnowledge() {
  if (!existsSync(KNOWLEDGE_DIR)) return null;
  const cards = listCards(KNOWLEDGE_DIR, { excludeHidden: true });
  const counts = { confirmed: 0, draft: 0, retired: 0 };
  for (const c of cards) {
    const s = String(c.front.status || '');
    if (s === 'confirmed' || s === 'draft' || s === 'retired') counts[s] += 1;
  }
  let refEvents = 0;
  try {
    refEvents = readReferences(REFERENCES_FILE).length;
  } catch {
    refEvents = 0; // 读失败按 0 计，不阻断扫描
  }
  let indexLines = 0;
  try {
    indexLines = readIndex(KNOWLEDGE_INDEX_FILE).evokit.length;
  } catch {
    indexLines = 0;
  }
  return {
    counts,
    pending: listCards(PENDING_DIR).length,
    refEvents,
    indexLines,
    cards: cards.slice(0, KNOWLEDGE_LIST_CAP).map((c) => ({
      id: c.id,
      title: String(c.front.title ?? ''),
      type: String(c.front.type ?? '-'),
      status: String(c.front.status ?? '-'),
      tags: Array.isArray(c.front.tags) ? c.front.tags.map(String) : [],
    })),
    total: cards.length,
  };
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
    knowledge: scanKnowledge(),
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

  // 知识库区块（T-M5.3）：计数行 + 每卡一行清单（≤200 行），随 {inventory} 并入委托 prompt 的体检输入
  lines.push('\n## 知识库');
  const k = scan.knowledge;
  if (!k) {
    lines.push('  知识根未初始化（evokit knowledge init）');
  } else {
    lines.push(`  ${KNOWLEDGE_DIR}`);
    lines.push(`  confirmed ${k.counts.confirmed} · draft ${k.counts.draft} · retired ${k.counts.retired} · .pending 草稿 ${k.pending} · references 事件 ${k.refEvents} · 索引行 ${k.indexLines}`);
    for (const c of k.cards) {
      const tags = c.tags.length > 0 ? ' ' + c.tags.map((t) => `#${t}`).join('') : '';
      lines.push(`  - [${c.id}] ${c.title}（type=${c.type}, status=${c.status}）${tags}`);
    }
    if (k.cards.length < k.total) {
      lines.push(`  （卡片清单截断：仅列出前 ${k.cards.length}/${k.total} 张）`);
    }
  }

  return lines.join('\n');
}

/**
 * 生成通用整理 prompt。
 * 优先读配置 settings.json 的 prompts.inventory 模板（可自定义/覆盖），
 * 无配置则用内置默认模板；占位符 {agent}/{inventory} 替换为实际值。
 */
function buildPrompt(agentName, inventoryText) {
  const prompts = loadPrompts();
  const tpl = prompts.inventory || DEFAULT_PROMPTS.inventory;
  return tpl.replace(/\{(\w+)\}/g, (m, key) => {
    if (key === 'agent') return agentName;
    if (key === 'inventory') return inventoryText;
    return m; // 未识别的占位符保留原文，便于排错
  });
}

/**
 * 把多个 agent 的报告合并写入单个 Markdown 文件。
 * @param {Array<{agent: string, name: string, output: string}>} reports 成功返回的报告
 * @param {string} outputPath 目标文件路径
 * @returns {string} 实际写入的绝对路径
 */
function writeReport(reports, outputPath) {
  const target = resolve(outputPath);
  const sections = [];
  for (const r of reports) {
    sections.push(`# ${r.name} 的冗余体检报告\n\n${r.output.trim()}`);
  }
  const header = `# EvoKit 知识库冗余体检报告\n\n> 生成时间：${new Date().toISOString()}\n> 委托 agent：${reports.map((r) => r.name).join('、')}\n\n---\n\n`;
  const body = sections.join('\n\n---\n\n');
  const content = header + body + '\n';
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf-8');
  return target;
}

/**
 * 生成默认导出路径。
 * 全局：~/.evokit/reports/evokit-inventory-<时间戳>.md
 * 项目级：<cwd>/.evokit/reports/evokit-inventory-<时间戳>.md
 */
function defaultOutputPath(isProject = false) {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const baseDir = isProject ? join(resolve(process.cwd()), '.evokit', 'reports') : join(EVOKIT_DIR, 'reports');
  return join(baseDir, `evokit-inventory-${stamp}.md`);
}

/**
 * 编排：扫描 → 生成 prompt → 调可用 agent CLI → 回显 + 导出 md。
 * @param {Set|null} filter agent id 过滤（null=全部可用）
 * @param {boolean} promptOnly 只打印 prompt 不调 CLI（调试用）
 * @param {string|null} outputPath 导出路径；null 用默认时间戳路径；'false'/'-' 表示禁用导出
 * @param {boolean} isProject 是否项目级（决定默认导出目录）
 */
export function inventory(filter = null, promptOnly = false, outputPath = null, isProject = false) {
  const g = scanGlobal();
  const p = scanProject();
  const invText = serializeInventory(g);
  const groupCounts = (scan) => Object.fromEntries(
    ['agents', 'skills', 'rules', 'commands']
      .filter((key) => Array.isArray(scan[key]))
      .flatMap((key) => scan[key].map((group) => [`${key}:${group.label}`, group.entries.length])),
  );
  debug('inventory', 'scan complete', {
    global: {
      ...groupCounts(g),
      promptFiles: g.promptFiles.length,
      mcpFiles: g.mcpFiles.length,
      knowledge: g.knowledge
        ? { ...g.knowledge.counts, pending: g.knowledge.pending, refEvents: g.knowledge.refEvents, indexLines: g.knowledge.indexLines, cardsTotal: g.knowledge.total }
        : null,
    },
    project: groupCounts(p),
    inventory: textMeta(invText),
  });

  console.log('EvoKit 知识库冗余体检\n');
  console.log(`家目录：${HOME}`);
  console.log('（扫描是只读的，不会修改任何文件）\n');

  // 探测可用 CLI
  const clis = detectAgentClis();
  const available = clis.filter((c) => c.available);
  const targets = filter ? clis.filter((c) => filter.has(c.id)) : clis;

  if (promptOnly) {
    const prompt = buildPrompt('（任意 agent）', invText);
    debug('inventory', 'prompt built', { agent: null, promptOnly: true, ...textMeta(prompt) });
    console.log('=== 生成的通用 prompt（未调用 CLI）===\n');
    console.log(prompt);
    return;
  }

  // 逐个调用可用 agent 整理
  let called = 0;
  const reports = [];
  for (const cli of targets) {
    if (!cli.available) {
      console.log(`✗ ${cli.name}：未检测到 \`${cli.bin}\` CLI，跳过`);
      continue;
    }
    console.log(`\n========== ${cli.name} 的冗余体检报告 ==========`);
    console.log(`（正在调用 \`${cli.bin}\` 分析，最长等待 120 秒…）\n`);
    const prompt = buildPrompt(cli.name, invText);
    debug('inventory', 'prompt built', { agent: cli.id, promptOnly: false, ...textMeta(prompt) });
    const result = runAgentCli(cli, prompt);
    if (result.warnings && result.warnings.length) {
      for (const w of result.warnings) console.log(`（提示：${w}）`);
    }
    if (result.ok) {
      console.log(result.output);
      called++;
      reports.push({ agent: cli.id, name: cli.name, output: result.output });
    } else {
      console.log(`（调用失败：${result.error}）`);
    }
  }

  // 导出报告为 md（默认导出；--output 指定路径；--no-output 禁用）
  if (outputPath !== 'false' && outputPath !== '-') {
    if (reports.length > 0) {
      const target = writeReport(reports, outputPath || defaultOutputPath(isProject));
      console.log(`\n（报告已导出到：${target}）`);
    } else {
      console.log('\n（无成功结果，未生成报告文件）');
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
