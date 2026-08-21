/**
 * EvoKit — Doctor 命令
 *
 * 验证 EvoKit 系统完整性。
 * 通过适配器注册表遍历所有已安装适配器，
 * 调用 adapter.status() 获取检查结果 —— 不再直接导入适配器实现函数。
 * 适配器特有检查（如 Claude 的 CLAUDE.md 行数限制、记忆文件检查）
 * 通过 status().extraChecks 暴露，doctor 不硬编码任何适配器特有逻辑。
 *
 * 自 v1.1（ADR 0003）起增加**知识库健康诊断**：对个人/项目规范知识根输出
 * 双向索引漂移、frontmatter 合法性、pending/stale 积压、条目分布；
 * `--fix` 在索引漂移时重建索引。
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import { select, isCancel, cancel } from '@clack/prompts';
import { listAdapters } from '../adapters/registry.js';
import { resolveHomeDir } from './shared.js';
import { getPersonalKnowledgeRoot, getProjectKnowledgeRoot } from '../core/memory.js';
import { KnowledgeRepository } from '../core/repository.js';
import { inspectKnowledgeHealth } from '../core/health.js';
import { resolveDuplicateGroup } from '../core/dedup.js';
import type { DuplicateGroup } from '../core/dedup.js';
import type { KnowledgeHealthReport } from '../core/health.js';

export const doctorCommand = new Command('doctor')
  .description('验证 EvoKit 系统完整性')
  .option('--home <path>', 'EvoKit 主目录（默认: $HOME）')
  .option('--fix', '尝试修复常见问题')
  .option('--adapter <name>', '检查指定适配器（claude | codex | opencode | pi | all）', 'all')
  .option('--all', '检查所有适配器（--adapter all 的快捷方式）')
  .option('--project-dir <path>', '项目目录（用于 OpenCode 等项目级适配器）')
  .action(async (options) => {
    let homeDir: string;
    try {
      homeDir = resolveHomeDir({ home: options.home });
    } catch (err: any) {
      console.error(pc.red(`错误：${err.message}`));
      process.exit(1);
    }

    // --all 是 --adapter all 的快捷方式
    const adapter = options.all ? 'all' : options.adapter || 'all';
    const projectDir = options.projectDir || undefined;

    console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
    console.log(pc.cyan('║   EvoKit — 系统健康检查                  ║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
    console.log(`  主目录: ${homeDir}`);
    if (projectDir) {
      console.log(`  项目目录: ${projectDir}`);
    }
    console.log('');

    let allPass = true;
    const adapters = listAdapters();

    for (const installer of adapters) {
      if (adapter !== 'all' && adapter !== installer.id) continue;

      const config = { homeDir, templateDir: '', projectDir };
      const status = installer.status(config);

      console.log(pc.cyan(`\n📁 ${installer.label} — ${status.adapterHome}`));

      let pass = true;
      for (const check of status.checks) {
        const icon = check.pass ? pc.green('✓') : pc.red('✗');
        console.log(
          `  ${icon} ${check.name}${check.detail ? pc.yellow(` — ${check.detail}`) : ''}`,
        );
        if (!check.pass) pass = false;
      }

      // 遍历适配器特有的额外检查项（如 Claude 的 CLAUDE.md 行数限制、记忆文件检查）
      // 不硬编码任何适配器特有逻辑 —— 全部通过 status().extraChecks 暴露
      if (status.extraChecks && status.extraChecks.length > 0) {
        for (const check of status.extraChecks) {
          const icon = check.pass ? pc.green('✓') : pc.red('✗');
          console.log(
            `  ${icon} ${check.name}${check.detail ? pc.yellow(` — ${check.detail}`) : ''}`,
          );
          if (!check.pass) pass = false;
        }
      }

      if (!status.installed) {
        console.log(pc.yellow(`  ⚠ ${installer.label} 适配器：未安装`));
        console.log(`    运行：evokit init --adapter ${installer.id}`);
        allPass = false;
      } else if (!pass) {
        allPass = false;
      }
    }

    // ── 知识库健康诊断（ADR 0003，v1.1）────────────────────
    const fix = options.fix === true;
    const knowledgeRoots: string[] = [getPersonalKnowledgeRoot(homeDir)];
    if (projectDir) {
      knowledgeRoots.push(getProjectKnowledgeRoot(path.join(projectDir)));
    }

    let kbAllPass = true;
    console.log(pc.cyan('\n📚 知识库健康'));
    for (const root of knowledgeRoots) {
      const scopeLabel = root === knowledgeRoots[0] ? '个人级' : '项目级';
      const report = inspectKnowledgeHealth(root);
      const drift = report.orphanEntries.length + report.danglingEntries.length;

      console.log(pc.cyan(`\n  ${scopeLabel}（${root}）`));
      const pendingIcon = report.pendingCount > 0 ? pc.yellow('⚠') : pc.green('✓');
      console.log(
        `  ${pendingIcon} 条目 ${report.activeCount} 条 · 待确认 ${report.pendingCount} 条`,
      );
      const staleIcon =
        report.staleCount + report.retiredCount > 0 ? pc.yellow('⚠') : pc.green('✓');
      console.log(
        `  ${staleIcon} 待复审 STALE ${report.staleCount} 条 · RETIRED ${report.retiredCount} 条`,
      );
      console.log(
        `  ${pc.dim('分布 — scope ')}${formatDist(report.distribution.scope)}${pc.dim(' | type ')}${formatDist(report.distribution.type)}${pc.dim(' | confidence ')}${formatDist(report.distribution.confidence)}`,
      );

      let rootOk = true;
      if (report.orphanEntries.length > 0) {
        console.log(`  ${pc.red('✗')} 索引未引用（孤儿）: ${report.orphanEntries.join(', ')}`);
        rootOk = false;
      }
      if (report.danglingEntries.length > 0) {
        console.log(
          `  ${pc.red('✗')} 索引引用但缺失（悬空）: ${report.danglingEntries.join(', ')}`,
        );
        rootOk = false;
      }
      if (report.invalidEntries.length > 0) {
        console.log(`  ${pc.red('✗')} frontmatter 不合法: ${report.invalidEntries.join(', ')}`);
        rootOk = false;
      }
      if (rootOk && drift === 0) {
        console.log(`  ${pc.green('✓')} 索引与条目一致，无漂移`);
      }

      // 归一化全等重复簇（ADR 0005）：表面化
      if (report.duplicateGroups.length > 0) {
        const dupMembers = report.duplicateGroups.reduce((s, g) => s + g.members.length, 0);
        console.log(
          `  ${pc.yellow('⚠')} 归一化全等重复 ${report.duplicateGroups.length} 簇（${dupMembers} 条）`,
        );
        for (const g of report.duplicateGroups) {
          const ids = g.members.map((m) => `${m.id} (${m.status})`).join('  |  ');
          console.log(`      · [${g.type}] ${ids}`);
        }
      }

      if (fix && drift > 0) {
        const repo = new KnowledgeRepository({ knowledgeRoot: root });
        const n = repo.regenerateIndex();
        console.log(`  ${pc.green('✓')} 已重建索引（${n} 行，--fix）`);
      }

      // --fix 冲突子模式：逐簇人工三选，绝不自动择主（ADR 0005 §决策 3）
      if (fix && report.duplicateGroups.length > 0) {
        const repo = new KnowledgeRepository({ knowledgeRoot: root });
        const resolved = await fixDuplicateGroups(repo, report.duplicateGroups);
        if (resolved > 0) {
          console.log(`  ${pc.green('✓')} 已合并 ${resolved} 簇重复（--fix 交互三选）`);
        }
      }

      // kbAllPass 由修复后的状态决定（--fix 解决索引漂移 + 重复；非法 frontmatter 仍需人工）
      const after = fix ? inspectKnowledgeHealth(root) : report;
      if (
        after.orphanEntries.length > 0 ||
        after.danglingEntries.length > 0 ||
        after.invalidEntries.length > 0 ||
        after.duplicateGroups.length > 0
      ) {
        kbAllPass = false;
      }
    }

    // 汇总 — allPass 仅基于实际检查的适配器结果，kbAllPass 基于知识库健康
    console.log('');
    if (allPass && kbAllPass) {
      console.log(pc.green('✅ 所有检查通过！系统健康。'));
    } else {
      console.log(pc.yellow('⚠️  部分检查未通过。使用 --fix 尝试修复。'));
    }
    console.log('');
  });

/** 格式化分布统计为 "key: n · key: n" 紧凑文本；空统计返回占位符。 */
function formatDist(dist: Record<string, number>): string {
  const entries = Object.entries(dist);
  if (entries.length === 0) return '—';
  return entries.map(([k, n]) => `${k}: ${n}`).join(' · ');
}

/**
 * --fix 冲突子模式：逐簇交互三选（ADR 0005）。
 *
 * 每簇给用户两个选项集：保留某一条（删其余）/ 保留全部（不合并）。
 * **绝不自动择主**——主条 id 必由用户选定；非 TTY 时跳过交互并提示用 CLI 手动处理。
 *
 * @returns 实际合并（删除了从条）的簇数。
 */
async function fixDuplicateGroups(
  repo: KnowledgeRepository,
  groups: DuplicateGroup[],
): Promise<number> {
  if (!process.stdin.isTTY) {
    console.log(pc.yellow('  ⚠ 非交互终端，跳过重复合并；请在 TTY 运行 --fix 或手动删除从条。'));
    return 0;
  }
  let resolved = 0;
  for (const group of groups) {
    const memberOpts = group.members.map((m) => ({
      value: m.id,
      label: `保留 ${m.id} (${m.status})${m.context ? `：${m.context}` : ''}，删其余`,
    }));
    const choice = await select({
      message: `重复簇 [${group.type}] — 如何处理？（绝不自动择主）`,
      options: [...memberOpts, { value: '__keep_all__', label: '保留全部（不合并）' }],
    });
    if (isCancel(choice)) {
      cancel('跳过该簇');
      continue;
    }
    if (choice === '__keep_all__') continue;
    resolveDuplicateGroup(repo, group, String(choice));
    resolved++;
  }
  return resolved;
}
