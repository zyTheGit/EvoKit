import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import fse from 'fs-extra';
import { buildConfig } from '../core/config.js';
import { rotateJsonlFile, applyConfidenceDecay } from '../core/rotate.js';
import {
  analyzeCorrections,
  promotePatterns,
  pruneStaleRules,
  logDecisions,
  prunePromotedCorrections,
} from '../core/promote.js';
import { readJsonlFile, getFileLineCount, getMemoryDir } from '../core/memory.js';
import { SessionEntry, EvoConfig } from '../core/types.js';

export const evolveCommand = new Command('evolve')
  .description('运行演化审计 — 提升纠正、清理过期规则')
  .option('--home <path>', 'EvoKit 主目录（默认: $HOME）')
  .option('--adapter <name>', '适配器名称（claude | codex | opencode | pi）', 'claude')
  .option('--dry-run', '预览变更但不写入')
  .option('--force', '跳过确认提示')
  .option('--max-lines <number>', '轮转触发阈值', '500')
  .option('--max-days <number>', '归档超过 N 天的条目', '30')
  .action(async (options) => {
    const adapterId = options.adapter || 'claude';
    const config = buildConfig({
      ...options,
      homeDir: options.home,
      maxLines: options.maxLines ? parseInt(options.maxLines, 10) : undefined,
      maxDays: options.maxDays ? parseInt(options.maxDays, 10) : undefined,
      dryRun: options.dryRun || false,
      adapterId,
    }) as EvoConfig & { adapterId: string };

    const memoryDir = getMemoryDir(config.homeDir, adapterId);
    if (!fse.existsSync(memoryDir)) {
      console.error(pc.red(`错误：EvoKit 未在 ${config.homeDir} 初始化`));
      console.error('  请先运行 "evokit init"。');
      process.exit(1);
    }

    console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
    console.log(pc.cyan('║   EvoKit — 演化审计                      ║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
    console.log(`  主目录: ${config.homeDir}${config.dryRun ? pc.yellow('（试运行）') : ''}`);
    console.log('');

    // 步骤 1：轮转
    console.log(pc.cyan('📊 自动轮转文件...'));
    for (const file of ['corrections.jsonl', 'observations.jsonl']) {
      const result = rotateJsonlFile(config, file);
      const details = [];
      if (result.archived > 0) details.push(`已归档 ${result.archived}`);
      if (result.gzipped) details.push('已压缩');
      console.log(
        `  ${pc.green('✓')} ${file}：保留 ${result.kept} 条${details.length ? pc.yellow('（' + details.join('、') + '）') : '（无需轮转）'}`,
      );
    }

    // 步骤 2：置信度衰减
    console.log(pc.cyan('\n📉 应用置信度衰减...'));
    const decayResult = applyConfidenceDecay(config, 'observations.jsonl');
    if (decayResult.archived > 0) {
      console.log(
        `  ${pc.green('✓')} observations：保留 ${decayResult.kept} 条，${pc.yellow(`已归档 ${decayResult.archived} 条（置信度 < 0.3）`)}`,
      );
    } else {
      console.log(`  ${pc.green('✓')} observations：${decayResult.kept} 条（无需衰减）`);
    }

    // 步骤 3：分析纠正
    console.log(pc.cyan('\n🔍 分析纠正...'));
    const groups = analyzeCorrections(config);
    console.log(
      `  发现 ${groups.length} 个唯一模式，共 ${groups.reduce((s, g) => s + g.count, 0)} 条纠正`,
    );

    // 步骤 4：提升模式
    console.log(pc.cyan('\n⬆️  提升模式...'));
    const promoteResults = promotePatterns(config, groups);
    for (const r of promoteResults) {
      const icon =
        r.decision === 'promoted'
          ? pc.green('⬆️')
          : r.decision === 'rejected'
            ? pc.yellow('⏭️')
            : pc.dim('⏸️');
      console.log(`  ${icon} "${r.pattern}" — ${r.reason}`);
    }

    // 步骤 5：过期规则
    const sessionsPath = path.join(memoryDir, 'sessions.jsonl');
    const sessions = readJsonlFile<SessionEntry>(sessionsPath);

    // 显示各助手明细
    const claudeSessions = sessions.filter((s) => !s.assistant || s.assistant === 'claude').length;
    const codexSessions = sessions.filter((s) => s.assistant === 'codex').length;
    const otherSessions = sessions.length - claudeSessions - codexSessions;
    let sessionDetail = `共 ${sessions.length} 次`;
    if (codexSessions > 0 || otherSessions > 0) {
      sessionDetail += `（Claude: ${claudeSessions}`;
      if (codexSessions > 0) sessionDetail += `，Codex: ${codexSessions}`;
      if (otherSessions > 0) sessionDetail += `，其他: ${otherSessions}`;
      sessionDetail += '）';
    }
    console.log(pc.cyan(`\n🗑️  清理过期规则（${sessionDetail}）...`));
    const pruneResults = pruneStaleRules(config, sessions);
    if (pruneResults.length === 0) {
      console.log(`  ${pc.green('✓')} 未发现过期规则`);
    } else {
      for (const r of pruneResults) {
        console.log(`  ${pc.yellow('🗑️')} "${r.pattern}" — ${r.reason}`);
      }
    }

    // 步骤 6：检查限制
    console.log(pc.cyan('\n📏 检查限制...'));
    const rulesPath = path.join(memoryDir, 'learned-rules.md');
    const rulesLines = getFileLineCount(rulesPath);
    const learnedRulesMax = config.learnedRulesMax ?? 50;
    if (rulesLines > learnedRulesMax) {
      console.log(
        `  ${pc.yellow('⚠️')} learned-rules.md：${rulesLines} 行（限制：${learnedRulesMax}）— 使用 --dry-run --max-lines 进行清理`,
      );
    } else {
      console.log(`  ${pc.green('✓')} learned-rules.md：${rulesLines}/${learnedRulesMax} 行`);
    }

    // 步骤 7：记录决策
    const allResults = [...promoteResults, ...pruneResults];
    if (allResults.length > 0) {
      logDecisions(config, allResults);
      prunePromotedCorrections(config, promoteResults);
    }

    console.log('');
    if (config.dryRun) {
      console.log(pc.green('✅ 试运行完成 — 未修改任何文件'));
    } else {
      console.log(pc.green('✅ 演化审计完成！'));
      console.log(`  运行 ${pc.cyan('evokit doctor')} 验证系统健康。`);
    }
    console.log('');
  });
