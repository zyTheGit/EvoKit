/**
 * EvoKit — Claude Code Adapter Installer
 *
 * @internal — Adapter implementation for Claude Code. The ClaudeAdapter class implements the public AdapterInstaller interface.
 *
 * Installs EvoKit template files into ~/.claude/ with full pipeline:
 * CLAUDE.md, settings.json merge, hooks, rules, commands, agents,
 * skills, and memory seeding.
 *
 * Uses the declarative `AdapterLayout` + `executeLayout()` engine
 * instead of the legacy boolean-flag `installPipeline()`.
 *
 * @packageDocumentation
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import {
  type AdapterInstaller,
  type AdapterInstallConfig,
  type AdapterInstallResult,
  type AdapterVerifyCheck,
  type AdapterStatus,
} from '../types.js';
import type { AdapterLayout, AdapterSection } from '../../core/layout-types.js';
import { executeLayout } from '../../core/layout-engine.js';
import { verifyInstallation } from '../../core/template.js';
import { ManifestCollector } from '../../core/manifest-collector.js';
import { updateAdapterManifest } from '../../core/manifest.js';

export const CLAUDE_ADAPTER_VERSION = '0.2.0';

// ─── Constants ─────────────────────────────────────────────────

const MEMORY_SEED_FILES = [
  'README.md',
  'learned-rules.md',
  'evolution-log.md',
  'corrections.jsonl',
  'observations.jsonl',
  'violations.jsonl',
  'sessions.jsonl',
] as const;

// ─── Layout builder ────────────────────────────────────────────

/**
 * Build the declarative layout for Claude Code adapter installation.
 *
 * This replaces the old `buildClaudeLayout()` in template.ts — each
 * adapter now owns its layout definition.
 */
export function getLayout(opts: {
  homeDir: string;
  templateDir: string;
  targetDir: string;
}): AdapterLayout {
  const { homeDir, templateDir, targetDir } = opts;
  const claudeTemplateDir = path.join(templateDir, 'claude');

  const sections: AdapterSection[] = [];

  // ── 1. Directories ──────────────────────────────────────────
  sections.push({
    type: 'dirs',
    paths: ['rules', 'commands', 'agents', 'hooks', 'memory', 'skills'],
  });

  // ── 2. CLAUDE.md (copy or append protocol section) ──────────
  sections.push({
    type: 'copy',
    src: path.join(claudeTemplateDir, 'CLAUDE.md'),
    dst: path.join(homeDir, 'CLAUDE.md'),
    strategy: 'skip-if-exists',
    appendMarker: 'Self-Evolving System Protocol',
  });

  // ── 3. MEMORY.md ────────────────────────────────────────────
  sections.push({
    type: 'copy',
    src: path.join(claudeTemplateDir, 'MEMORY.md'),
    dst: path.join(targetDir, 'MEMORY.md'),
    strategy: 'always',
  });

  // ── 4. settings.json (merge or fresh) ───────────────────────
  sections.push({
    type: 'merge-settings',
    srcPath: path.join(claudeTemplateDir, 'settings.json'),
    dstPath: path.join(targetDir, 'settings.json'),
    replaceHome: true,
  });

  // ── 5. Hooks (copy with __HOME__ replacement, always overwrite) ─
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(claudeTemplateDir, 'hooks'),
    dstDir: path.join(targetDir, 'hooks'),
    filter: '.sh',
    strategy: 'always',
    replaceHome: true,
    counter: 'hooksInstalled',
  });

  // ── 6. Rules (copy, overwrite — upgrade path) ───────────────
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(claudeTemplateDir, 'rules'),
    dstDir: path.join(targetDir, 'rules'),
    filter: '.md',
    strategy: 'always',
    counter: 'rulesInstalled',
  });

  // ── 7. Commands (copy, overwrite) ───────────────────────────
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(claudeTemplateDir, 'commands'),
    dstDir: path.join(targetDir, 'commands'),
    filter: '.md',
    strategy: 'always',
    counter: 'commandsInstalled',
  });

  // ── 8. Agents (frontmatter merge) ───────────────────────────
  sections.push({
    type: 'merge-agents',
    srcDir: path.join(claudeTemplateDir, 'agents'),
    dstDir: path.join(targetDir, 'agents'),
  });

  // ── 9. Skills ───────────────────────────────────────────────
  sections.push({
    type: 'copy-skills',
    srcDir: path.join(claudeTemplateDir, 'skills'),
    dstDir: path.join(targetDir, 'skills'),
  });

  // ── 10. Memory seed (only if not exist) ─────────────────────
  sections.push({
    type: 'seed-memory',
    srcDir: path.join(claudeTemplateDir, 'memory'),
    dstDir: path.join(targetDir, 'memory'),
    files: [...MEMORY_SEED_FILES],
  });

  // ── 11. Permissions ─────────────────────────────────────────
  sections.push({
    type: 'permissions',
    dir: path.join(targetDir, 'hooks'),
    extension: '.sh',
    mode: 0o755,
  });
  sections.push({
    type: 'permissions',
    dir: path.join(targetDir, 'memory'),
    extension: '.jsonl',
    mode: 0o600,
  });

  return { targetDir, sections };
}

// ─── AdapterInstaller Implementation ───────────────────────────

export class ClaudeAdapter implements AdapterInstaller {
  readonly id = 'claude';
  readonly label = 'Claude Code';
  readonly description = '~/.claude/';
  readonly version = CLAUDE_ADAPTER_VERSION;

  install(config: AdapterInstallConfig): AdapterInstallResult {
    const claudeDir = path.join(config.homeDir, '.claude');
    const collector = new ManifestCollector();
    const layout = getLayout({
      homeDir: config.homeDir,
      templateDir: config.templateDir,
      targetDir: claudeDir,
    });

    const summary = executeLayout(layout, {
      homeDir: config.homeDir,
      dryRun: config.dryRun ?? false,
      collector,
    });

    // Write manifest after install completes (not in dry-run)
    if (!config.dryRun) {
      const adapterManifest = collector.build({
        adapterId: this.id,
        adapterVersion: this.version,
        homeDir: config.homeDir,
        adapterHome: claudeDir,
      });
      // Read evokitVersion from package.json
      const pkgVersion = getEvokitVersion();
      updateAdapterManifest(config.homeDir, adapterManifest, pkgVersion);
    }

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

  status(config: AdapterInstallConfig): AdapterStatus {
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

// ─── Helpers ──────────────────────────────────────────────────

/** Read EvoKit version from package.json */
function getEvokitVersion(): string {
  try {
    const require2 = createRequire(import.meta.url);
    const pkg = require2('../../../package.json') as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}
