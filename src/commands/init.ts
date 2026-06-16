import { Command } from 'commander';
import { createInterface } from 'node:readline';
import pc from 'picocolors';
import fse from 'fs-extra';
import { resolveTemplateDir, installTemplate, verifyInstallation } from '../core/template.js';
import { installCodexTemplate, resolveCodexHome, verifyCodexInstallation } from '../adapters/codex-installer.js';
import { setupCodexHooks } from '../adapters/codex-adapter.js';

type Adapter = 'claude' | 'codex';

const ALL_ADAPTERS: { id: Adapter; label: string; description: string; available: boolean }[] = [
  { id: 'claude', label: 'Claude Code',   description: '~/.claude/',  available: true },
  { id: 'codex',  label: 'Codex CLI',     description: '~/.codex/',  available: true },
];

export const initCommand = new Command('init')
  .description('Initialize EvoKit in a home directory')
  .argument('[directory]', 'Target home directory (default: $HOME)')
  .option('--template <path>', 'Path to template directory')
  .option('--branch <name>', 'GitHub branch to download template from', 'main')
  .option('--dry-run', 'Preview installation without modifying files')
  .option('--verify', 'Run boot verification after installation')
  .option('--adapter <name>', 'Target AI assistant (claude | codex). Omit for interactive selection.')
  .action(async (directory, options) => {
    const homeDir = directory || process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) {
      console.error(pc.red('Error: Could not determine home directory.'));
      console.error('  Specify it as an argument: evokit init /path/to/home');
      process.exit(1);
    }

    // Resolve adapters to install
    let adapters: Adapter[];

    if (options.adapter) {
      // Explicit --adapter flag: parse comma-separated list
      adapters = options.adapter.split(',').map((a: string) => a.trim() as Adapter);
    } else if (process.stdin.isTTY) {
      // Interactive terminal: show selection menu
      adapters = await promptAdapterSelection();
    } else {
      // Piped / non-interactive: default to claude
      adapters = ['claude'];
    }

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

    for (const adapter of adapters) {
      switch (adapter) {
        case 'claude':
          await initClaude(homeDir, templateDir, options);
          break;
        case 'codex':
          await initCodex(homeDir, templateDir, options);
          break;
        default:
          console.error(pc.red(`\n❌ Unknown adapter: ${adapter}`));
          process.exit(1);
      }
    }

    // Cleanup temp dir
    if (cleanup) cleanup();
    console.log('');
  });

/**
 * Show interactive adapter selection menu.
 * User types space-separated numbers, e.g. "1 2" for both.
 */
async function promptAdapterSelection(): Promise<Adapter[]> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log(pc.cyan('\nSelect AI assistants to configure:'));
    console.log('');

    for (const a of ALL_ADAPTERS) {
      const icon = a.available ? pc.green('◻') : pc.dim('◻ (coming soon)');
      console.log(`  ${icon}  ${a.id === 'claude' ? pc.bold('[1]') : pc.bold('[2]')} ${a.label}${pc.dim(` — ${a.description}`)}`);
    }
    console.log(`  ${pc.bold('  [3]')} All of the above`);
    console.log('');

    rl.question(pc.cyan('  Choice (e.g. "1 2" for multiple, Enter=Claude): '), (input) => {
      rl.close();
      const trimmed = input.trim();

      if (!trimmed) {
        // Default to Claude only
        resolve(['claude']);
        return;
      }

      const choices = trimmed.split(/\s+/).map(Number);

      if (choices.includes(3)) {
        resolve(['claude', 'codex']);
        return;
      }

      const selected: Adapter[] = [];
      const availableAdapters = ALL_ADAPTERS.filter((a) => a.available);

      for (const c of choices) {
        const idx = c - 1;
        if (idx >= 0 && idx < availableAdapters.length) {
          selected.push(availableAdapters[idx].id);
        }
      }

      resolve(selected.length > 0 ? [...new Set(selected)] : ['claude']);
    });
  });
}

async function initClaude(homeDir: string, templateDir: string, options: any): Promise<void> {
  const claudeDir = `${homeDir}/.claude`;
  console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
  console.log(pc.cyan('║   EvoKit — Install for Claude Code        ║'));
  console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
  console.log('');
  console.log(`  Target: ${claudeDir}${options.dryRun ? pc.yellow(' (DRY RUN)') : ''}`);
  console.log(`  Template: ${templateDir}`);
  console.log('');

  // Install
  console.log(pc.cyan('📁 Installing template files...'));
  const summary = installTemplate(homeDir, templateDir, options.dryRun);
  printSummary(summary);

  // Done
  console.log('');
  if (options.dryRun) {
    console.log(pc.green('✅ Dry run complete — no files were modified'));
  } else if (options.verify) {
    printVerification(verifyInstallation(homeDir));
  } else {
    console.log(pc.green('✅ EvoKit installed for Claude Code!'));
    console.log('');
    console.log(pc.cyan('  Next steps:'));
    console.log('  1. Start Claude Code');
    console.log('  2. Run /boot to verify system health');
  }
}

async function initCodex(homeDir: string, templateDir: string, options: any): Promise<void> {
  const codexHome = resolveCodexHome(homeDir);
  console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
  console.log(pc.cyan('║   EvoKit — Install for Codex CLI          ║'));
  console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
  console.log('');
  console.log(`  Target: ${codexHome}${options.dryRun ? pc.yellow(' (DRY RUN)') : ''}`);
  console.log(`  Template: ${templateDir}`);
  console.log('');

  // Install
  console.log(pc.cyan('📁 Installing Codex template files...'));
  const summary = installCodexTemplate({
    homeDir,
    templateDir,
    codexHome,
    dryRun: options.dryRun,
  });
  printSummary(summary);

  // Set up hooks
  if (!options.dryRun) {
    console.log(pc.cyan('\n🔌 Setting up lifecycle hooks...'));
    setupCodexHooks(codexHome, { dryRun: options.dryRun });
    console.log(`  ${pc.green('✓')} hooks.json configured`);
  }

  // Done
  console.log('');
  if (options.dryRun) {
    console.log(pc.green('✅ Dry run complete — no files were modified'));
  } else if (options.verify) {
    printVerification(verifyCodexInstallation(codexHome));
  } else {
    console.log(pc.green('✅ EvoKit installed for Codex CLI!'));
    console.log('');
    console.log(pc.cyan('  Next steps:'));
    console.log('  1. Start Codex');
    console.log('  2. The /boot check runs automatically on session start');
    console.log('  3. Or run: evokit doctor');
  }
}

function printSummary(summary: { filesCreated: number; filesSkipped: number; hooksInstalled: number; rulesInstalled: number; agentsInstalled: number; commandsInstalled: number }): void {
  console.log(`  ${pc.green('✓')} Created ${summary.filesCreated} file(s), skipped ${summary.filesSkipped} existing`);
  console.log(`  ${pc.green('✓')} ${summary.hooksInstalled} hook(s) installed`);
  console.log(`  ${pc.green('✓')} ${summary.rulesInstalled} rule(s) installed`);
  if (summary.agentsInstalled > 0) console.log(`  ${pc.green('✓')} ${summary.agentsInstalled} agent(s) installed`);
  if (summary.commandsInstalled > 0) console.log(`  ${pc.green('✓')} ${summary.commandsInstalled} command(s) installed`);
}

type VerificationCheck = { name: string; detail?: string } & ({ status: string | boolean } | { pass: boolean });

function isPassed(check: VerificationCheck): boolean {
  if ('pass' in check) return check.pass;
  return check.status === 'pass' || check.status === true;
}

function printVerification(checks: VerificationCheck[]): void {
  console.log(pc.cyan('\n🔍 Running verification...'));
  let allPass = true;
  for (const check of checks) {
    const passed = isPassed(check);
    const icon = passed ? pc.green('✓') : pc.red('✗');
    console.log(`  ${icon} ${check.name}${check.detail ? pc.yellow(` — ${check.detail}`) : ''}`);
    if (!passed) allPass = false;
  }
  console.log('');
  if (allPass) {
    console.log(pc.green('✅ Verification passed'));
  } else {
    console.log(pc.yellow('⚠️  Some checks failed — see details above'));
  }
}
