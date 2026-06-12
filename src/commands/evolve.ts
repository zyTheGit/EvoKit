import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import fse from 'fs-extra';
import { buildConfig } from '../core/config.js';
import { rotateJsonlFile, applyConfidenceDecay } from '../core/rotate.js';
import { analyzeCorrections, promotePatterns, pruneStaleRules, logDecisions, prunePromotedCorrections } from '../core/promote.js';
import { readJsonlFile, getFileLineCount, getMemoryDir } from '../core/memory.js';
import { SessionEntry } from '../core/types.js';

export const evolveCommand = new Command('evolve')
  .description('Run evolution audit — promote corrections, prune stale rules')
  .option('--home <path>', 'EvoKit home directory (default: $HOME)')
  .option('--dry-run', 'Preview changes without writing')
  .option('--force', 'Skip confirmation prompts')
  .option('--max-lines <number>', 'Rotation trigger threshold', '500')
  .option('--max-days <number>', 'Archive entries older than N days', '30')
  .action(async (options) => {
    const config = buildConfig({
      ...options,
      homeDir: options.home,
      maxLines: options.maxLines ? parseInt(options.maxLines, 10) : undefined,
      maxDays: options.maxDays ? parseInt(options.maxDays, 10) : undefined,
      dryRun: options.dryRun || false,
    });

    const memoryDir = getMemoryDir(config.homeDir);
    if (!fse.existsSync(memoryDir)) {
      console.error(pc.red(`Error: EvoKit not initialized at ${config.homeDir}`));
      console.error('  Run "evokit init" first.');
      process.exit(1);
    }

    console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
    console.log(pc.cyan('║   EvoKit — Evolution Audit                ║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
    console.log(`  Home: ${config.homeDir}${config.dryRun ? pc.yellow(' (DRY RUN)') : ''}`);
    console.log('');

    // Step 1: Rotation
    console.log(pc.cyan('📊 Auto-rotate files...'));
    for (const file of ['corrections.jsonl', 'observations.jsonl']) {
      const result = rotateJsonlFile(config, file);
      const details = [];
      if (result.archived > 0) details.push(`archived ${result.archived}`);
      if (result.gzipped) details.push('gzipped');
      console.log(`  ${pc.green('✓')} ${file}: ${result.kept} kept${details.length ? pc.yellow(' (' + details.join(', ') + ')') : ' (no rotation needed)'}`);
    }

    // Step 2: Confidence decay
    console.log(pc.cyan('\n📉 Applying confidence decay...'));
    const decayResult = applyConfidenceDecay(config, 'observations.jsonl');
    if (decayResult.archived > 0) {
      console.log(`  ${pc.green('✓')} observations: ${decayResult.kept} kept, ${pc.yellow(`${decayResult.archived} archived (confidence < 0.3)`)}`);
    } else {
      console.log(`  ${pc.green('✓')} observations: ${decayResult.kept} entries (no decay needed)`);
    }

    // Step 3: Analyze corrections
    console.log(pc.cyan('\n🔍 Analyzing corrections...'));
    const groups = analyzeCorrections(config);
    console.log(`  Found ${groups.length} unique pattern(s) across ${groups.reduce((s, g) => s + g.count, 0)} total corrections`);

    // Step 4: Promote patterns
    console.log(pc.cyan('\n⬆️  Promoting patterns...'));
    const promoteResults = promotePatterns(config, groups);
    for (const r of promoteResults) {
      const icon =
        r.decision === 'promoted' ? pc.green('⬆️') :
        r.decision === 'rejected' ? pc.yellow('⏭️') :
        pc.dim('⏸️');
      console.log(`  ${icon} "${r.pattern}" — ${r.reason}`);
    }

    // Step 5: Stale rules
    const sessionsPath = path.join(memoryDir, 'sessions.jsonl');
    const sessions = readJsonlFile<SessionEntry>(sessionsPath);
    console.log(pc.cyan(`\n🗑️  Pruning stale rules (${sessions.length} sessions)...`));
    const pruneResults = pruneStaleRules(config, sessions);
    if (pruneResults.length === 0) {
      console.log(`  ${pc.green('✓')} No stale rules found`);
    } else {
      for (const r of pruneResults) {
        console.log(`  ${pc.yellow('🗑️')} "${r.pattern}" — ${r.reason}`);
      }
    }

    // Step 6: Check limits
    console.log(pc.cyan('\n📏 Checking limits...'));
    const rulesPath = path.join(memoryDir, 'learned-rules.md');
    const rulesLines = getFileLineCount(rulesPath);
    const learnedRulesMax = config.learnedRulesMax ?? 50;
    if (rulesLines > learnedRulesMax) {
      console.log(`  ${pc.yellow('⚠️')} learned-rules.md: ${rulesLines} lines (limit: ${learnedRulesMax}) — run --dry-run with --max-lines to prune`);
    } else {
      console.log(`  ${pc.green('✓')} learned-rules.md: ${rulesLines}/${learnedRulesMax} lines`);
    }

    // Step 7: Log decisions
    const allResults = [...promoteResults, ...pruneResults];
    if (allResults.length > 0) {
      logDecisions(config, allResults);
      prunePromotedCorrections(config, promoteResults);
    }

    console.log('');
    if (config.dryRun) {
      console.log(pc.green('✅ Dry run complete — no files were modified'));
    } else {
      console.log(pc.green('✅ Evolution audit complete!'));
      console.log(`  Run ${pc.cyan('evokit doctor')} to verify system health.`);
    }
    console.log('');
  });

