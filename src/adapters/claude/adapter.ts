/**
 * EvoKit — Claude Code Adapter Installer
 *
 * @internal — Adapter implementation for Claude Code. The ClaudeAdapter class implements the public AdapterInstaller interface.
 *
 * Installs EvoKit template files into ~/.claude/ with full pipeline:
 * CLAUDE.md, settings.json merge, hooks, rules, commands, agents,
 * skills, and memory seeding.
 *
 * @packageDocumentation
 */

import path from 'node:path';
import {
  type AdapterInstaller,
  type AdapterInstallConfig,
  type AdapterInstallResult,
  type AdapterVerifyCheck,
} from '../types.js';
import { installPipeline, verifyInstallation } from '../../core/template.js';

export const CLAUDE_ADAPTER_VERSION = '0.2.0';

export class ClaudeAdapter implements AdapterInstaller {
  readonly id = 'claude';
  readonly label = 'Claude Code';
  readonly description = '~/.claude/';
  readonly version = CLAUDE_ADAPTER_VERSION;

  install(config: AdapterInstallConfig): AdapterInstallResult {
    const claudeDir = path.join(config.homeDir, '.claude');
    const summary = installPipeline({
      homeDir: config.homeDir,
      templateDir: config.templateDir,
      targetDir: claudeDir,
      dryRun: config.dryRun ?? false,
      installClaudeMd: true,
      installSettings: true,
      installHooks: true,
      installRules: true,
      installCommands: true,
      installAgents: true,
      installSkills: true,
      seedMemory: true,
    });

    return {
      filesCreated: summary.filesCreated,
      filesSkipped: summary.filesSkipped,
      hooksInstalled: summary.hooksInstalled,
      commandsInstalled: summary.commandsInstalled,
      rulesInstalled: summary.rulesInstalled,
      agentsInstalled: summary.agentsInstalled,
      adapterHome: claudeDir,
    };
  }

  verify(config: AdapterInstallConfig): AdapterVerifyCheck[] {
    return verifyInstallation(config.homeDir).map((c) => ({
      name: c.name,
      pass: c.pass,
      detail: c.detail,
    }));
  }

  status(config: AdapterInstallConfig): Record<string, unknown> {
    const claudeDir = path.join(config.homeDir, '.claude');
    const checks = verifyInstallation(config.homeDir);
    const allPass = checks.every((c) => c.pass);

    return {
      installed: allPass,
      adapterHome: claudeDir,
      allPass,
      checks,
    };
  }
}
