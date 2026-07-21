/**
 * EvoKit — Template Installation Pipeline
 *
 * Core engine for installing EvoKit templates.  Provides a unified
 * `installPipeline()` that handles directories, files, __HOME__ replacement,
 * settings merge, agent frontmatter merge, memory seeding, and permissions.
 *
 * Internally, `installPipeline()` builds a declarative `AdapterLayout`
 * from the boolean flags and delegates to `executeLayout()`.  Future
 * adapters can build their own layout directly, skipping the flags.
 *
 * This file also retains `installTemplate()` and `verifyInstallation()`
 * for backward compatibility.
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { setHookPermissions, setMemoryPermissions } from './permissions.js';
import type { InstallSummary } from './types.js';
import type { AdapterLayout, AdapterSection } from './layout-types.js';
import { executeLayout } from './layout-engine.js';

export interface BootCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface InstallPipelineOptions {
  homeDir: string;
  templateDir: string;
  targetDir: string;
  dryRun?: boolean;
  installClaudeMd?: boolean;
  installMemoryMd?: boolean;
  installSettings?: boolean;
  installHooks?: boolean;
  installRules?: boolean;
  installCommands?: boolean;
  installAgents?: boolean;
  installSkills?: boolean;
  seedMemory?: boolean;
}

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

const CLAUDE_SUBDIRS = ['rules', 'agents', 'commands', 'memory', 'hooks'] as const;
const HOOK_FILES = ['session-start.sh', 'stop.sh', 'export-system.sh'] as const;

// ─── Pipeline ─────────────────────────────────────────────────

/**
 * Build an `AdapterLayout` from the legacy boolean-flag options.
 *
 * This is the bridge between the old `InstallPipelineOptions` interface
 * and the new declarative layout engine.  Each boolean flag maps to
 * one or more `AdapterSection` entries.
 */
function buildClaudeLayout(opts: InstallPipelineOptions): AdapterLayout {
  const { homeDir, templateDir, targetDir } = opts;
  const claudeTemplateDir = path.join(templateDir, 'claude');

  const sections: AdapterSection[] = [];

  // ── 1. Directories ──────────────────────────────────────────
  const dirs: string[] = [];
  if (opts.installRules) dirs.push('rules');
  if (opts.installCommands) dirs.push('commands');
  if (opts.installAgents) dirs.push('agents');
  if (opts.installHooks) dirs.push('hooks');
  if (opts.seedMemory) dirs.push('memory');
  if (opts.installSkills) dirs.push('skills');
  if (dirs.length > 0) {
    sections.push({ type: 'dirs', paths: dirs });
  }

  // ── 2. CLAUDE.md (copy or append protocol section) ──────────
  if (opts.installClaudeMd) {
    sections.push({
      type: 'copy',
      src: path.join(claudeTemplateDir, 'CLAUDE.md'),
      dst: path.join(homeDir, 'CLAUDE.md'),
      strategy: 'skip-if-exists',
      appendMarker: 'Self-Evolving System Protocol',
    });
  }

  // ── 3. MEMORY.md ────────────────────────────────────────────
  if (opts.installMemoryMd) {
    sections.push({
      type: 'copy',
      src: path.join(claudeTemplateDir, 'MEMORY.md'),
      dst: path.join(targetDir, 'MEMORY.md'),
      strategy: 'always',
    });
  }

  // ── 4. settings.json (merge or fresh) ───────────────────────
  if (opts.installSettings) {
    sections.push({
      type: 'merge-settings',
      srcPath: path.join(claudeTemplateDir, 'settings.json'),
      dstPath: path.join(targetDir, 'settings.json'),
      replaceHome: true,
    });
  }

  // ── 5. Hooks (copy with __HOME__ replacement, always overwrite) ─
  if (opts.installHooks) {
    sections.push({
      type: 'copy-dir',
      srcDir: path.join(claudeTemplateDir, 'hooks'),
      dstDir: path.join(targetDir, 'hooks'),
      filter: '.sh',
      strategy: 'always',
      replaceHome: true,
      counter: 'hooksInstalled',
    });
  }

  // ── 6. Rules (copy, overwrite — upgrade path) ───────────────
  if (opts.installRules) {
    sections.push({
      type: 'copy-dir',
      srcDir: path.join(claudeTemplateDir, 'rules'),
      dstDir: path.join(targetDir, 'rules'),
      filter: '.md',
      strategy: 'always',
      counter: 'rulesInstalled',
    });
  }

  // ── 7. Commands (copy, overwrite) ───────────────────────────
  if (opts.installCommands) {
    sections.push({
      type: 'copy-dir',
      srcDir: path.join(claudeTemplateDir, 'commands'),
      dstDir: path.join(targetDir, 'commands'),
      filter: '.md',
      strategy: 'always',
      counter: 'commandsInstalled',
    });
  }

  // ── 8. Agents (frontmatter merge) ───────────────────────────
  if (opts.installAgents) {
    sections.push({
      type: 'merge-agents',
      srcDir: path.join(claudeTemplateDir, 'agents'),
      dstDir: path.join(targetDir, 'agents'),
    });
  }

  // ── 9. Skills ───────────────────────────────────────────────
  if (opts.installSkills) {
    sections.push({
      type: 'copy-skills',
      srcDir: path.join(claudeTemplateDir, 'skills'),
      dstDir: path.join(targetDir, 'skills'),
    });
  }

  // ── 10. Memory seed (only if not exist) ─────────────────────
  if (opts.seedMemory) {
    sections.push({
      type: 'seed-memory',
      srcDir: path.join(claudeTemplateDir, 'memory'),
      dstDir: path.join(targetDir, 'memory'),
      files: [...MEMORY_SEED_FILES],
    });
  }

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

/**
 * Install EvoKit template files using the legacy boolean-flag options.
 *
 * Internally builds an `AdapterLayout` and delegates to `executeLayout()`.
 * The boolean flags are preserved for backward compatibility.
 */
export function installPipeline(opts: InstallPipelineOptions): InstallSummary {
  const layout = buildClaudeLayout(opts);
  return executeLayout(layout, {
    homeDir: opts.homeDir,
    dryRun: opts.dryRun ?? false,
  });
}

// ─── Legacy installTemplate (backward compat) ─────────────────

/**
 * Install the full Claude Code template.
 *
 * Wraps installPipeline for backward compatibility.
 */
export function installTemplate(
  homeDir: string,
  templateDir: string,
  dryRun: boolean = false,
): InstallSummary {
  const claudeDir = path.join(homeDir, '.claude');

  return installPipeline({
    homeDir,
    templateDir,
    targetDir: claudeDir,
    dryRun,
    installClaudeMd: true,
    installMemoryMd: true,
    installSettings: true,
    installHooks: true,
    installRules: true,
    installCommands: true,
    installAgents: true,
    installSkills: true,
    seedMemory: true,
  });
}

// ─── Permissions (legacy) ─────────────────────────────────────

/**
 * Set permissions on all template files.
 */
export function setPermissions(claudeDir: string): void {
  const hooksDir = path.join(claudeDir, 'hooks');
  if (fse.existsSync(hooksDir)) setHookPermissions(hooksDir);

  const memDir = path.join(claudeDir, 'memory');
  if (fse.existsSync(memDir)) setMemoryPermissions(memDir);
}

// ─── Verification ─────────────────────────────────────────────

/**
 * Verify a Claude Code EvoKit installation.
 */
export function verifyInstallation(homeDir: string): BootCheck[] {
  const checks: BootCheck[] = [];
  const claudeDir = path.join(homeDir, '.claude');

  // Directory structure
  for (const subdir of CLAUDE_SUBDIRS) {
    const exists = fse.existsSync(path.join(claudeDir, subdir));
    checks.push({
      name: `.claude/${subdir}/`,
      pass: exists,
      detail: exists ? undefined : 'Missing directory',
    });
  }

  // Key files
  const keyFiles = [
    { name: 'CLAUDE.md', path: path.join(homeDir, 'CLAUDE.md') },
    { name: '.claude/MEMORY.md', path: path.join(claudeDir, 'MEMORY.md') },
    { name: '.claude/settings.json', path: path.join(claudeDir, 'settings.json') },
  ];
  for (const { name, path: fp } of keyFiles) {
    const exists = fse.existsSync(fp);
    checks.push({
      name,
      pass: exists,
      detail: exists ? undefined : 'Missing file',
    });
  }

  // Hook executables
  const hooksDir = path.join(claudeDir, 'hooks');
  if (fse.existsSync(hooksDir)) {
    for (const hook of HOOK_FILES) {
      const hp = path.join(hooksDir, hook);
      const exists = fse.existsSync(hp);
      if (exists) {
        const stats = fs.statSync(hp);
        const executable = !!(stats.mode & 0o111);
        checks.push({
          name: `.claude/hooks/${hook}`,
          pass: executable,
          detail: executable ? undefined : 'Not executable',
        });
      }
    }
  }

  // JSONL permissions (600)
  const memDir = path.join(claudeDir, 'memory');
  if (fse.existsSync(memDir)) {
    const jsonls = fs.readdirSync(memDir).filter((f) => f.endsWith('.jsonl'));
    for (const j of jsonls) {
      const jp = path.join(memDir, j);
      const stats = fs.statSync(jp);
      const mode = stats.mode & 0o777;
      const secure = mode === 0o600;
      checks.push({
        name: `.claude/memory/${j} (${mode.toString(8)})`,
        pass: secure,
        detail: secure ? undefined : `Expected 600, got ${mode.toString(8)}`,
      });
    }
  }

  return checks;
}
