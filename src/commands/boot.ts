/**
 * EvoKit — Boot 命令（会话启动校验）
 *
 * `evokit boot` 作为会话启动时的知识库深度完整性校验
 * （ADR 0001 的 SessionStart 触发点；比 session-start.sh 快速检查更完整）。
 *
 * 检查项：
 *   1. 目录结构 — evokit/、knowledge/index、.pending/
 *   2. 索引文件 — knowledge-index.md 存在且格式合法（## 个人知识 / ## 项目知识）
 *   3. 条目完整性 — 索引引用的每个条目是否存在于 knowledge/ 下
 *   4. Frontmatter 合法性 — 每个条目含必填字段（id/scope/type/source/confidence/created），
 *      confidence 还须落在三档合法取值（#30 / ADR 0002）
 *   5. 待确认条目 — .pending/ 有未确认知识则警告
 *   6. CLAUDE.md 行数 — ≤ 150（认知核心暂存约束）
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import pc from 'picocolors';
import fs from 'node:fs';
import path from 'node:path';
import { intro, log, note, outro } from '@clack/prompts';
import { resolveHomeDir } from './shared.js';
import { getMemoryDir, getFileLineCount } from '../core/memory.js';
import {
  getEvokitDir,
  getKnowledgeDir,
  getKnowledgeIndexPath,
  readKnowledgeEntry,
  listKnowledgeEntries,
  readKnowledgeIndex,
} from '../core/knowledge.js';

/** 单个检查结果 */
export interface BootCheck {
  name: string;
  pass: boolean;
  /** diagnose 级别：错误 还是 警告（不阻断） */
  warnOnly?: boolean;
  detail?: string;
}

/** 深度检查配置 */
export interface BootConfig {
  memoryDirs: string[];
  /** 认知核心文件路径（CLAUDE.md / AGENTS.md），可选 */
  coreFilePath?: string;
  coreMaxLines?: number;
}

/**
 * 执行知识库深度完整检查。
 * 返回一组 BootCheck，不修改任何文件。
 */
export function runBootChecks(config: BootConfig): BootCheck[] {
  const checks: BootCheck[] = [];

  for (const memoryDir of config.memoryDirs) {
    const scopeLabel = memoryDir === config.memoryDirs[0] ? '个人级' : '项目级';
    const evokitDir = getEvokitDir(memoryDir);
    const knowledgeDir = getKnowledgeDir(memoryDir);
    const indexPath = getKnowledgeIndexPath(memoryDir);

    // 1. 目录结构
    const dirsOk =
      fs.existsSync(evokitDir) && fs.existsSync(knowledgeDir) && fs.existsSync(indexPath);
    checks.push({
      name: `[${scopeLabel}] 目录结构 (evokit/knowledge/index)`,
      pass: dirsOk,
      detail: dirsOk ? undefined : `缺失: ${evokitDir} 或 knowledge/ 或 knowledge-index.md`,
    });
    if (!dirsOk) continue;

    // 2. 索引文件格式（section 头合法）
    const { evokit, claude } = readKnowledgeIndex(indexPath);
    const basicIndex =
      fs.readFileSync(indexPath, 'utf-8').includes('## 个人知识') &&
      fs.readFileSync(indexPath, 'utf-8').includes('## 项目知识');
    checks.push({
      name: `[${scopeLabel}] knowledge-index.md 格式`,
      pass: basicIndex,
      detail: basicIndex
        ? undefined
        : '缺少 ## 个人知识 或 ## 项目知识 section 头',
    });

    // 3. 索引引用的条目是否存在
    const ids = listKnowledgeEntries(knowledgeDir);
    const indexedIds = [...evokit, ...claude]
      .map((l) => l.match(/^- \[([^\]]+)\]/))
      .map((m) => (m ? m[1] : ''))
      .filter(Boolean);
    const missing = indexedIds.filter((id) => !ids.includes(id));
    checks.push({
      name: `[${scopeLabel}] 索引引用的条目存在`,
      pass: missing.length === 0,
      detail:
        missing.length > 0
          ? `索引引用但缺失: ${missing.join(', ')}`
          : `索引引用 ${indexedIds.length} 条，全部存在`,
    });

    // 4. Frontmatter 合法性（含 confidence 三档校验，见 #30）
    let bad = 0;
    const badIds: string[] = [];
    for (const id of ids) {
      const filePath = path.join(knowledgeDir, `${id}.md`);
      if (!readKnowledgeEntry(filePath)) {
        bad++;
        badIds.push(id);
      }
    }
    checks.push({
      name: `[${scopeLabel}] 条目 frontmatter 合法性`,
      pass: bad === 0,
      detail: bad > 0 ? `不合法: ${badIds.join(', ')}` : `${ids.length} 条约 ok`,
    });

    // 5. .pending/ 待确认条目
    const pendingDir = path.join(evokitDir, '.pending');
    let pendingCount = 0;
    if (fs.existsSync(pendingDir)) {
      pendingCount = fs
        .readdirSync(pendingDir)
        .filter((f) => f.endsWith('.md')).length;
    }
    if (pendingCount > 0) {
      checks.push({
        name: `[${scopeLabel}] 待确认条目`,
        pass: false,
        warnOnly: true,
        detail: `.pending/ 有 ${pendingCount} 条，运行 /evokit-learn 确认`,
      });
    }
  }

  // 6. 认知核心文件行数
  if (config.coreFilePath) {
    const max = config.coreMaxLines ?? 150;
    const lines = getFileLineCount(config.coreFilePath);
    checks.push({
      name: `认知核心文件行数 (${path.basename(config.coreFilePath)})`,
      pass: lines <= max,
      detail: `${lines}/${max} 行`,
    });
  }

  return checks;
}

/**
 * 汇总检查结果。
 */
export function summarizeChecks(checks: BootCheck[]): {
  ok: number;
  warn: number;
  fail: number;
  allPass: boolean;
} {
  const ok = checks.filter((c) => c.pass).length;
  const warn = checks.filter((c) => !c.pass && c.warnOnly).length;
  const fail = checks.filter((c) => !c.pass && !c.warnOnly).length;
  return { ok, warn, fail, allPass: fail === 0 };
}

export const bootCommand = new Command('boot')
  .description('会话启动校验 — 知识库深度完整性检查')
  .option('--home <path>', '目标主目录（默认：$HOME）')
  .option(
    '--adapter <name>',
    '适配器名称（claude | codex | opencode | pi）用于解析 personal memory 目录',
    'claude',
  )
  .option('--project-dir <path>', '额外检查指定项目级知识目录')
  .option('--core <path>', '认知核心文件路径（默认 claude: $HOME/CLAUDE.md）')
  .addHelpText(
    'after',
    `
检查项（对齐 /evokit-boot skill）：
  1. 目录结构     — evokit/、knowledge/、knowledge-index.md 存在
  2. 索引格式     — knowledge-index.md 含 ## 个人知识 / ## 项目知识 section
  3. 条目完整性   — 索引引用条目均存在于 knowledge/
  4. Frontmatter — 每个条目含 id/scope/type/source/confidence/created，且 confidence 三档合法
  5. 待确认条目   — .pending/ 未确认知识提示
  6. 认知核心行数 — CLAUDE.md ≤ 150 行

示例：
  evokit boot                   检查 claude 个人级知识库
  evokit boot --project-dir .  追加检查当前项目知识库
`,
  )
  .action(async (options) => {
    let homeDir: string;
    try {
      homeDir = resolveHomeDir({ home: options.home });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`错误：${msg}`);
      process.exit(1);
    }

    const adapterId = (options.adapter as string) || 'claude';
    const memoryDirs: string[] = [getMemoryDir(homeDir, adapterId)];
    const projectDir = options.projectDir as string | undefined;
    if (projectDir) {
      memoryDirs.push(getMemoryDir(path.join(projectDir), adapterId));
    }

    const corePath =
      (options.core as string | undefined) ??
      (adapterId === 'claude' ? path.join(homeDir, 'CLAUDE.md') : undefined);

    intro(pc.bgCyan(pc.black(' EvoKit Boot — 知识库完整性 ')));

    const checks = runBootChecks({ memoryDirs, coreFilePath: corePath, coreMaxLines: 150 });
    const lines = checks.map((c) => {
      const icon = c.pass ? pc.green('✓') : c.warnOnly ? pc.yellow('⚠') : pc.red('✗');
      const suffix = c.detail ? pc.dim(` — ${c.detail}`) : '';
      return `  ${icon} ${c.name}${suffix}`;
    });
    note(lines.join('\n'), '检查结果');

    const s = summarizeChecks(checks);
    if (s.allPass) {
      log.success(`✅ 全部通过（${s.ok} ✓）`);
    } else if (s.fail > 0) {
      log.warn(`⚠ ${s.fail} 项失败，${s.warn} 项警告（${s.ok} ✓）。修复后重跑。`);
      process.exitCode = 1;
    } else {
      log.warn(`⚠ ${s.warn} 项警告（${s.ok} ✓）。`);
    }
    outro('Boot 完成');
  });
