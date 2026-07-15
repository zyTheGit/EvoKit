/**
 * EvoKit — Init Command (alias for install, backward compat)
 *
 * Delegates to the adapter registry for all installation logic.
 * Interactive prompts use @clack/prompts for a modern terminal experience.
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import pc from 'picocolors';
import {
  type AdapterInstallConfig,
  type AdapterInstaller,
  type AdapterInstallResult,
  getInstaller,
  listAdapters,
} from '../adapters/index.js';
import { resolveTemplateDir } from '../core/download.js';
import { intro, outro, multiselect, isCancel, cancel, spinner, note } from '@clack/prompts';
import type { AdapterVerifyCheck } from '../adapters/types.js';

/**
 * All known adapters (for the init prompt).
 * Uses the registry to stay in sync with available adapters.
 */
function getAdapterChoices(): Array<{
  id: string;
  label: string;
  description: string;
  available: boolean;
}> {
  return listAdapters().map((a) => ({
    id: a.id,
    label: a.label,
    description: a.description,
    available: true,
  }));
}

export const initCommand = new Command('init')
  .description('Initialize EvoKit in a home directory')
  .argument('[directory]', 'Target home directory (default: $HOME)')
  .option('--template <path>', 'Path to template directory')
  .option('--branch <name>', 'GitHub branch to download template from', 'main')
  .option('--dry-run', 'Preview installation without modifying files')
  .option('--verify', 'Run boot verification after installation')
  .option(
    '--adapter <name>',
    'Target AI assistant (claude | codex | opencode). Omit for interactive selection.',
  )
  .action(async (directory, options) => {
    const homeDir = directory || process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) {
      console.error(pc.red('Error: Could not determine home directory.'));
      console.error('  Specify it as an argument: evokit init /path/to/home');
      process.exit(1);
    }

    // Resolve adapters
    let adapterIds: string[];

    if (options.adapter) {
      adapterIds = options.adapter
        .split(',')
        .map((a: string) => a.trim().toLowerCase())
        .filter(Boolean);
    } else if (process.stdin.isTTY) {
      adapterIds = await promptAdapterSelection();
    } else {
      adapterIds = ['claude'];
    }

    if (adapterIds.length === 0) adapterIds = ['claude'];

    // Resolve template
    let templateDir: string;
    let cleanup: (() => void) | null = null;
    try {
      const result = await resolveTemplateDir(options.template, options.branch);
      templateDir = result.templateDir;
      cleanup = result.cleanup;
    } catch (err: any) {
      console.error(pc.red(`\n❌ ${err.message}`));
      process.exit(1);
    }

    // Install each adapter
    let allPass = true;

    for (const id of adapterIds) {
      let installer: AdapterInstaller;
      try {
        installer = getInstaller(id);
      } catch {
        console.error(pc.red(`\n❌ Unknown adapter: "${id}"`));
        process.exit(1);
        return;
      }

      const config: AdapterInstallConfig = {
        homeDir,
        templateDir,
        projectDir: process.cwd(),
        dryRun: options.dryRun ?? false,
      };

      const installSpin = spinner();
      installSpin.start(`Installing for ${installer.label}...`);

      try {
        const result = installer.install(config);
        installSpin.stop(`${installer.label} installed`);

        printInitSummary(installer, result, options.dryRun);

        if (options.verify && !options.dryRun) {
          const checks = installer.verify(config);
          printInitVerify(checks);
          const checksPass = checks.every((c) => c.pass);
          if (!checksPass) allPass = false;
        }
      } catch (err: any) {
        installSpin.stop(`Installation failed: ${err.message}`);
        console.error(pc.red(`\n❌ ${installer.label}: ${err.message}`));
        allPass = false;
      }
    }

    if (cleanup) cleanup();

    if (!options.dryRun && allPass) {
      printInitNextSteps(adapterIds);
    }
  });

/**
 * Show interactive adapter selection menu using Clack multiselect.
 */
async function promptAdapterSelection(): Promise<string[]> {
  const adapters = getAdapterChoices();

  intro('Select AI assistants to configure');

  const result = await multiselect({
    message: 'AI assistants',
    options: adapters.map((a) => ({
      value: a.id,
      label: a.label,
      hint: a.description,
    })),
    required: true,
    initialValues: ['claude'],
  });

  if (isCancel(result)) {
    cancel('Installation cancelled');
    process.exit(0);
  }

  outro('Adapters selected');
  return result as string[];
}

// ─── Display helpers ─────────────────────────────────────────

function printInitSummary(
  installer: { label: string },
  summary: AdapterInstallResult,
  dryRun?: boolean,
): void {
  note(
    `Target: ${summary.adapterHome}${dryRun ? ' (DRY RUN)' : ''}\n` +
      `Created: ${summary.filesCreated} file(s), skipped ${summary.filesSkipped} existing\n` +
      (summary.hooksInstalled > 0 ? `Hooks:   ${summary.hooksInstalled} installed\n` : '') +
      (summary.rulesInstalled > 0 ? `Rules:   ${summary.rulesInstalled} installed\n` : '') +
      (summary.agentsInstalled > 0 ? `Agents:  ${summary.agentsInstalled} installed\n` : '') +
      (summary.commandsInstalled > 0 ? `Commands: ${summary.commandsInstalled} installed\n` : ''),
    `EvoKit — Install for ${installer.label}`,
  );
}

function printInitVerify(checks: AdapterVerifyCheck[]): void {
  const failures = checks.filter((c) => !c.pass);
  if (failures.length > 0) {
    console.error(pc.yellow(`\n⚠️  ${failures.length} verification check(s) failed:`));
    for (const f of failures) {
      console.error(`  ${pc.red('✗')} ${f.name}${f.detail ? pc.yellow(` — ${f.detail}`) : ''}`);
    }
  } else {
    console.log(pc.green('\n✅ Verification passed'));
  }
}

function printInitNextSteps(adapterIds: string[]): void {
  for (const id of adapterIds) {
    switch (id) {
      case 'claude':
        console.log(pc.cyan('  Next steps (Claude Code):'));
        console.log('  1. Start Claude Code');
        console.log('  2. Run /boot to verify system health');
        console.log('');
        break;
      case 'codex':
        console.log(pc.cyan('  Next steps (Codex CLI):'));
        console.log('  1. Start Codex (hooks run automatically)');
        console.log('  2. Run: evokit doctor --adapter codex');
        console.log('');
        break;
      case 'opencode':
        console.log(pc.cyan('  Next steps (OpenCode CLI):'));
        console.log('  1. cd to project and start OpenCode');
        console.log('  2. Call evokit-boot tool to verify system health');
        console.log('');
        break;
    }
  }
}
