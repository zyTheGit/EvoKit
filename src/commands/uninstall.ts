/**
 * EvoKit — Uninstall Command
 *
 * The `evokit uninstall` command:
 * 1. Resolves the adapter to uninstall (from argument or manifest)
 * 2. Reads the manifest for precise uninstall, or falls back to heuristic
 * 3. Creates a backup of files that will be modified/deleted
 * 4. Reverses all installation operations (settings merge, CLAUDE.md, agents, files)
 * 5. Removes the adapter from the manifest
 *
 * Uses @clack/prompts for interactive confirmation.
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import path from 'node:path';
import { getInstaller, listAdapters } from '../adapters/index.js';
import { readManifest } from '../core/manifest.js';
import { executeUninstall } from '../core/uninstall-engine.js';
import { spinner, intro, outro, note, log, confirm } from '@clack/prompts';
import pc from 'picocolors';

export const uninstallCommand = new Command('uninstall')
  .description('Uninstall EvoKit for an AI coding assistant')
  .argument(
    '[adapter]',
    'Adapter name (claude, codex, opencode). Omit to auto-select if only one is installed.',
  )
  .option('--home <path>', 'Target home directory (default: $HOME)')
  .option('--force', 'Skip confirmation prompt')
  .option(
    '--purge',
    'Delete user data (memory files, MEMORY.md) in addition to EvoKit-managed files',
  )
  .option('--dry-run', 'Preview uninstall without modifying files')
  .option('--no-backup', 'Skip backup creation')
  .option('--backup-dir <path>', 'Custom backup directory')
  .action(async (adapterArg: string | undefined, options: any) => {
    const homeDir = options.home || process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) {
      log.error('Error: Could not determine home directory.');
      log.error('Set $HOME and try again.');
      process.exit(1);
    }

    // ── Resolve adapter ───────────────────────────────────
    let adapterId: string;

    if (adapterArg) {
      adapterId = adapterArg.trim().toLowerCase();
      // Validate adapter exists in registry
      try {
        getInstaller(adapterId);
      } catch {
        log.error(`Unknown adapter: "${adapterArg}"`);
        log.error(
          `Available: ${listAdapters()
            .map((a) => a.id)
            .join(', ')}`,
        );
        process.exit(1);
      }
    } else {
      // Auto-select from manifest
      const manifest = readManifest(homeDir);
      if (!manifest || Object.keys(manifest.adapters).length === 0) {
        log.error('No installed adapters found in manifest.');
        log.info('Specify an adapter: evokit uninstall claude');
        log.info(
          `Available adapters: ${listAdapters()
            .map((a) => a.id)
            .join(', ')}`,
        );
        process.exit(1);
      }

      const installedAdapters = Object.keys(manifest.adapters);
      if (installedAdapters.length === 1) {
        adapterId = installedAdapters[0];
        log.info(`Auto-selected adapter: ${pc.cyan(adapterId)}`);
      } else {
        log.error('Multiple adapters installed. Specify which one to uninstall:');
        for (const id of installedAdapters) {
          const record = manifest.adapters[id];
          log.info(`  ${pc.cyan(id)} — installed at ${record.adapterHome}`);
        }
        process.exit(1);
      }
    }

    // ── Get adapter info ──────────────────────────────────
    const installer = getInstaller(adapterId);
    const manifest = readManifest(homeDir);
    const adapterRecord = manifest?.adapters?.[adapterId];
    const isHeuristic = !manifest || !adapterRecord;

    // ── Show preview ──────────────────────────────────────
    intro(pc.bgRed(pc.white(' EvoKit Uninstall ')));

    if (isHeuristic) {
      log.warn(pc.yellow('⚠ No manifest found — using heuristic uninstall'));
      log.warn(
        'Some EvoKit traces may not be removed. Run `evokit doctor` after uninstall to verify.',
      );
    }

    const previewLines = buildPreview(adapterId, adapterRecord, homeDir, options.purge);
    note(previewLines.join('\n'), `Uninstall: ${installer.label}`);

    // ── Confirmation ──────────────────────────────────────
    if (!options.force && !options.dryRun) {
      const shouldContinue = await confirm({
        message: 'Continue with uninstall?',
      });
      if (!shouldContinue) {
        outro('Uninstall cancelled');
        return;
      }
    }

    // ── Execute uninstall ─────────────────────────────────
    const s = spinner();
    s.start(`Uninstalling ${installer.label}...`);

    try {
      const result = executeUninstall({
        homeDir,
        adapterId,
        force: options.force ?? false,
        purge: options.purge ?? false,
        dryRun: options.dryRun ?? false,
        noBackup: options.backup === false,
        backupDir: options.backupDir,
      });

      s.stop(`${installer.label} uninstalled`);

      // Print result
      const resultLines = buildResultSummary(result);
      note(resultLines.join('\n'), `EvoKit — Uninstall ${installer.label}`);

      // Print warnings
      for (const warning of result.warnings) {
        log.warn(pc.yellow(`⚠ ${warning}`));
      }

      // Post-uninstall guidance
      if (!options.dryRun) {
        if (result.backupPath) {
          log.info(`📦 Backup: ${pc.cyan(result.backupPath)}`);
          log.info('   You can restore from this backup if needed.');
        }
        log.info(`💡 Run ${pc.cyan('evokit doctor')} to verify system health.`);
        log.info(
          `   The ${pc.cyan('~/.evokit/')} directory may still contain backups. Remove manually if desired.`,
        );
      }
    } catch (err: any) {
      s.stop('Uninstall failed');
      log.error(`${installer.label}: ${err.message}`);
      process.exit(1);
    }

    if (options.dryRun) {
      outro('Dry run complete — no files were modified');
    } else {
      outro('EvoKit uninstalled successfully');
    }
  });

// ─── Display helpers ─────────────────────────────────────────

function buildPreview(
  adapterId: string,
  adapterRecord: any,
  homeDir: string,
  purge: boolean,
): string[] {
  const lines: string[] = [];

  if (adapterRecord) {
    // Manifest-driven preview
    const adapterHome = adapterRecord.adapterHome;

    // Count files by category
    const hookFiles = adapterRecord.files.filter(
      (f: any) => f.path.includes('/hooks/') || f.path.includes('\\hooks\\'),
    );
    const ruleFiles = adapterRecord.files.filter(
      (f: any) => f.path.includes('/rules/') || f.path.includes('\\rules\\'),
    );
    const commandFiles = adapterRecord.files.filter(
      (f: any) => f.path.includes('/commands/') || f.path.includes('\\commands\\'),
    );
    const skillFiles = adapterRecord.files.filter((f: any) => f.source === 'copy-skills');
    const memorySeeds = adapterRecord.memorySeeds || [];

    lines.push(pc.red('Will remove:'));
    if (hookFiles.length > 0) lines.push(`  ${hookFiles.length} hook script(s)`);
    if (ruleFiles.length > 0) lines.push(`  ${ruleFiles.length} rule file(s)`);
    if (commandFiles.length > 0) lines.push(`  ${commandFiles.length} command file(s)`);
    if (skillFiles.length > 0) lines.push(`  ${skillFiles.length} skill(s)`);
    if (adapterRecord.hooks?.length > 0)
      lines.push(`  ${adapterRecord.hooks.length} hook entries from settings.json`);
    if (adapterRecord.envVars?.length > 0)
      lines.push(`  ${adapterRecord.envVars.length} env var(s) from settings.json`);
    if (adapterRecord.agentFrontmatter?.length > 0)
      lines.push(`  ${adapterRecord.agentFrontmatter.length} agent frontmatter entries`);
    if (memorySeeds.length > 0) lines.push(`  memory/README.md (seed file)`);
    lines.push(`  EvoKit section from ~/CLAUDE.md`);

    lines.push('');
    lines.push(pc.green('Will preserve:'));
    if (!purge) {
      lines.push('  Memory data (corrections, observations, sessions, etc.)');
      lines.push('  MEMORY.md');
      lines.push('  learned-rules.md, evolution-log.md');
    } else {
      lines.push(pc.yellow('  ⚠ --purge: user data will also be deleted'));
    }
  } else {
    // Heuristic preview
    lines.push(pc.red('Will remove (heuristic):'));
    lines.push('  Hook scripts (~/.claude/hooks/)');
    lines.push('  Rule files (~/.claude/rules/)');
    lines.push('  Command files (~/.claude/commands/)');
    lines.push('  Skills directory (~/.claude/skills/)');
    lines.push('  EvoKit hooks from settings.json');
    lines.push('  EvoKit section from ~/CLAUDE.md');
    lines.push('  memory/README.md (seed file)');
    lines.push('');
    lines.push(pc.yellow('⚠ Heuristic mode — may miss some EvoKit traces'));
  }

  return lines;
}

function buildResultSummary(result: any): string[] {
  const lines: string[] = [];

  lines.push(`Files deleted: ${result.filesDeleted}`);
  lines.push(`Files preserved: ${result.filesPreserved}`);
  if (result.hooksRemoved > 0) lines.push(`Hooks removed: ${result.hooksRemoved}`);
  if (result.envVarsRemoved > 0) lines.push(`Env vars removed: ${result.envVarsRemoved}`);
  if (result.agentFieldsRemoved > 0)
    lines.push(`Agent fields removed: ${result.agentFieldsRemoved}`);
  if (result.directoriesRemoved > 0) lines.push(`Empty dirs removed: ${result.directoriesRemoved}`);
  if (result.heuristic) lines.push(pc.yellow('Mode: heuristic (no manifest)'));

  return lines;
}
