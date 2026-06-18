/**
 * EvoKit — Install Command
 *
 * The `evokit install` command:
 * 1. Resolves adapters to install (from --adapter flag or Clack interactive menu)
 * 2. Resolves the template directory (bundled, local path, or GitHub)
 * 3. Calls each adapter's install() method with spinner progress
 * 4. Optionally runs verification
 *
 * Uses @clack/prompts for all user interaction.
 *
 * @packageDocumentation
 */

import { Command } from 'commander';
import fs from 'node:fs';
import { isatty, ReadStream } from 'node:tty';
import {
  getInstaller,
  listAdapters,
} from './adapters/index.js';
import { resolveTemplateDir } from './core/download.js';
import { selectAdapters } from './core/interactive.js';
import { spinner, intro, outro, note, log } from '@clack/prompts';
import type { AdapterInstallResult, AdapterVerifyCheck } from './adapters/types.js';

/**
 * Try to make stdin interactive when running in a piped context (e.g. curl | bash).
 *
 * When stdin is not a TTY but stdout is, we reopen from /dev/tty so that
 * @clack/prompts can show interactive selection menus.  Falls back silently
 * when no TTY is available (CI, Docker, etc.).
 *
 * @returns true if stdin is now interactive, false otherwise.
 */
function ensureInteractive(): boolean {
  if (process.stdin.isTTY) return true;

  // stdin is piped (e.g. curl | bash) — check if there's a real terminal
  // @clack/prompts writes interactive UI to stderr, so check both stdout
  // and stderr (npx may redirect stdout but leave stderr as the terminal).
  try {
    if (isatty(process.stdout.fd) || isatty(process.stderr.fd)) {
      const fd = fs.openSync('/dev/tty', 'r');
      process.stdin = new ReadStream(fd) as typeof process.stdin;
      return true;
    }
  } catch {
    // No TTY available (CI, Docker, etc.)
  }

  return false;
}

export const installCommand = new Command('install')
  .description('Install EvoKit for one or more AI coding assistants')
  .option(
    '--adapter <names>',
    'Comma-separated adapter names (claude, codex, opencode). Omit for interactive selection.',
  )
  .option('--template <path>', 'Path to template directory (for development)')
  .option('--branch <name>', 'GitHub branch to download template from', 'main')
  .option('--dry-run', 'Preview installation without modifying files')
  .option('--verify', 'Run boot verification after installation')
  .option('--project-dir <path>', 'Project directory (for project-local adapters like OpenCode)')
  .action(async (options) => {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) {
      log.error('Error: Could not determine home directory.');
      log.error('Set $HOME and try again.');
      process.exit(1);
    }

    // ── Resolve adapters ───────────────────────────────────
    let adapterIds: string[];

    if (options.adapter) {
      adapterIds = options.adapter
        .split(',')
        .map((a: string) => a.trim().toLowerCase())
        .filter(Boolean);
    } else if (ensureInteractive()) {
      adapterIds = await selectAdapters(
        listAdapters().map((a) => ({
          key: a.id,
          label: a.label,
          description: a.description,
        })),
      );
    } else {
      log.info('Non-interactive terminal detected — defaulting to Claude Code.');
      log.info('Use --adapter to specify assistants: --adapter claude,codex,opencode');
      adapterIds = ['claude'];
    }

    if (adapterIds.length === 0) adapterIds = ['claude'];

    // ── Resolve template ──────────────────────────────────
    let templateDir: string;
    let cleanup: (() => void) | null = null;
    try {
      const result = await resolveTemplateDir(options.template, options.branch);
      templateDir = result.templateDir;
      cleanup = result.cleanup;
    } catch (err: any) {
      log.error(err.message);
      process.exit(1);
    }

    // ── Install each adapter ──────────────────────────────
    let allPass = true;

    for (const id of adapterIds) {
      let installer;
      try {
        installer = getInstaller(id);
      } catch {
        log.error(`Unknown adapter: "${id}"`);
        log.error(`Available: ${listAdapters().map((a) => a.id).join(', ')}`);
        allPass = false;
        continue;
      }

      const config = {
        homeDir,
        templateDir,
        projectDir: options.projectDir || process.cwd(),
        dryRun: options.dryRun ?? false,
      };

      const s = spinner();
      s.start(`Installing for ${installer.label}...`);

      try {
        const result = installer.install(config);
        s.stop(`${installer.label} installed`);
        printResult(installer, result);

        if (options.verify && !options.dryRun) {
          const checks = installer.verify(config);
          printVerification(installer, checks);
          const pass = checks.every((c) => c.pass);
          if (!pass) allPass = false;
        }
      } catch (err: any) {
        s.stop(`Installation failed`);
        log.error(`${installer.label}: ${err.message}`);
        allPass = false;
      }
    }

    // Cleanup temp download
    if (cleanup) cleanup();

    // Summary
    if (options.dryRun) {
      outro('Dry run complete — no files were modified');
    } else if (allPass) {
      outro('EvoKit installed successfully!');
    } else {
      log.warning('Install completed with warnings — see above');
    }

    // Post-install guidance for first adapter
    if (adapterIds.length > 0 && !options.dryRun) {
      printNextSteps(adapterIds);
    }
  });

// ─── Display helpers ─────────────────────────────────────────

function printResult(
  installer: { label: string },
  result: AdapterInstallResult,
): void {
  const lines = [
    `Target: ${result.adapterHome}`,
    `Created: ${result.filesCreated} file(s), skipped ${result.filesSkipped}`,
  ];
  if (result.hooksInstalled > 0)
    lines.push(`Hooks: ${result.hooksInstalled} installed`);
  if (result.rulesInstalled > 0)
    lines.push(`Rules: ${result.rulesInstalled} installed`);
  if (result.agentsInstalled > 0)
    lines.push(`Agents: ${result.agentsInstalled} installed`);
  if (result.commandsInstalled > 0)
    lines.push(`Commands: ${result.commandsInstalled} installed`);

  note(lines.join('\n'), `EvoKit — Install for ${installer.label}`);
}

function printVerification(
  installer: { label: string },
  checks: AdapterVerifyCheck[],
): void {
  log.step(`Verifying ${installer.label}...`);
  for (const check of checks) {
    if (check.pass) {
      log.success(`${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
    } else {
      log.error(`${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
    }
  }
}

function printNextSteps(adapterIds: string[]): void {
  const steps: string[] = [];

  for (const id of adapterIds) {
    switch (id) {
      case 'claude':
        steps.push(
          '📖 Claude Code:\n' +
          '  1. Start Claude Code\n' +
          '  2. Run /boot to verify',
        );
        break;
      case 'codex':
        steps.push(
          '📖 Codex CLI:\n' +
          '  1. Start Codex (hooks run automatically)\n' +
          '  2. Run: evokit doctor --adapter codex',
        );
        break;
      case 'opencode':
        steps.push(
          '📖 OpenCode CLI:\n' +
          '  1. cd to project and start OpenCode\n' +
          '  2. Run evokit-boot tool to verify',
        );
        break;
      default:
        steps.push(`📖 ${id}: ready`);
    }
  }

  steps.push('💡 Also available via npm: npm install -g @zythegit/evokit');
  steps.push('📚 Docs: https://github.com/zyTheGit/EvoKit');

  note(steps.join('\n\n'), 'Next steps');
}
