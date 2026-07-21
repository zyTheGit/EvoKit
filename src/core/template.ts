/**
 * EvoKit — Template Installation Pipeline
 *
 * Core engine for installing EvoKit templates.  Provides a unified
 * `installPipeline()` that handles directories, files, __HOME__ replacement,
 * settings merge, agent frontmatter merge, memory seeding, and permissions.
 *
 * Internally, `installPipeline()` builds a declarative `AdapterLayout`
 * from the profile/exclude options and delegates to `executeLayout()`.
 * Future adapters can build their own layout directly, skipping the flags.
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

// ─── Profile types ─────────────────────────────────────────────

/** Installation profile presets. */
export type InstallProfile = 'full' | 'minimal' | 'upgrade';

/** Installable component names — used with `exclude` to opt out. */
export type InstallComponent =
  | 'claude-md'
  | 'memory-md'
  | 'settings'
  | 'hooks'
  | 'rules'
  | 'commands'
  | 'agents'
  | 'skills'
  | 'seed-memory';

export interface InstallPipelineOptions {
  homeDir: string;
  templateDir: string;
  targetDir: string;
  dryRun?: boolean;
  /** Installation profile — defaults to 'full'. */
  profile?: InstallProfile;
  /** Components to exclude from the profile. */
  exclude?: InstallComponent[];
  /**
   * @deprecated Use `profile` + `exclude` instead.
   * Legacy boolean flags are preserved for backward compatibility.
   * If any legacy flag is explicitly set, it overrides the profile.
   */
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

// ─── Profile resolution ────────────────────────────────────────

/** Full profile: install everything. */
const FULL_COMPONENTS: Set<InstallComponent> = new Set([
  'claude-md',
  'memory-md',
  'settings',
  'hooks',
  'rules',
  'commands',
  'agents',
  'skills',
  'seed-memory',
]);

/** Minimal profile: only core files needed for basic operation. */
const MINIMAL_COMPONENTS: Set<InstallComponent> = new Set([
  'claude-md',
  'settings',
  'hooks',
  'seed-memory',
]);

/** Upgrade profile: always overwrite hooks/settings, skip-if-exists the rest. */
const UPGRADE_COMPONENTS: Set<InstallComponent> = new Set([
  'claude-md',
  'memory-md',
  'settings',
  'hooks',
  'rules',
  'commands',
  'agents',
  'skills',
  'seed-memory',
]);

const PROFILE_MAP: Record<InstallProfile, Set<InstallComponent>> = {
  full: FULL_COMPONENTS,
  minimal: MINIMAL_COMPONENTS,
  upgrade: UPGRADE_COMPONENTS,
};

/**
 * Resolve the effective set of components from profile + exclude + legacy flags.
 *
 * Priority:
 * 1. If any legacy boolean flag is explicitly set (not undefined), use legacy mode.
 * 2. Otherwise, use profile (default 'full') minus exclude list.
 */
function resolveComponents(opts: InstallPipelineOptions): {
  components: Set<InstallComponent>;
  /** Whether to use 'upgrade' strategy for hooks/settings (always overwrite). */
  upgradeMode: boolean;
} {
  // Check if any legacy flag is explicitly set
  const hasLegacyFlags =
    opts.installClaudeMd !== undefined ||
    opts.installMemoryMd !== undefined ||
    opts.installSettings !== undefined ||
    opts.installHooks !== undefined ||
    opts.installRules !== undefined ||
    opts.installCommands !== undefined ||
    opts.installAgents !== undefined ||
    opts.installSkills !== undefined ||
    opts.seedMemory !== undefined;

  if (hasLegacyFlags) {
    // Legacy mode: each flag controls its component directly
    const components = new Set<InstallComponent>();
    if (opts.installClaudeMd !== false) components.add('claude-md');
    if (opts.installMemoryMd !== false) components.add('memory-md');
    if (opts.installSettings !== false) components.add('settings');
    if (opts.installHooks !== false) components.add('hooks');
    if (opts.installRules !== false) components.add('rules');
    if (opts.installCommands !== false) components.add('commands');
    if (opts.installAgents !== false) components.add('agents');
    if (opts.installSkills !== false) components.add('skills');
    if (opts.seedMemory !== false) components.add('seed-memory');
    return { components, upgradeMode: false };
  }

  // Profile mode
  const profile = opts.profile ?? 'full';
  const base = PROFILE_MAP[profile];
  const exclude = opts.exclude ?? [];
  const components = new Set(base);
  for (const c of exclude) {
    components.delete(c);
  }

  return { components, upgradeMode: profile === 'upgrade' };
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
 * Build an `AdapterLayout` from profile/exclude or legacy boolean-flag options.
 *
 * This is the bridge between the `InstallPipelineOptions` interface
 * and the declarative layout engine.  Each component maps to
 * one or more `AdapterSection` entries.
 */
function buildClaudeLayout(opts: InstallPipelineOptions): AdapterLayout {
  const { homeDir, templateDir, targetDir } = opts;
  const claudeTemplateDir = path.join(templateDir, 'claude');
  const { components, upgradeMode } = resolveComponents(opts);

  const sections: AdapterSection[] = [];

  // ── 1. Directories ──────────────────────────────────────────
  const dirs: string[] = [];
  if (components.has('rules')) dirs.push('rules');
  if (components.has('commands')) dirs.push('commands');
  if (components.has('agents')) dirs.push('agents');
  if (components.has('hooks')) dirs.push('hooks');
  if (components.has('seed-memory')) dirs.push('memory');
  if (components.has('skills')) dirs.push('skills');
  if (dirs.length > 0) {
    sections.push({ type: 'dirs', paths: dirs });
  }

  // ── 2. CLAUDE.md (copy or append protocol section) ──────────
  if (components.has('claude-md')) {
    sections.push({
      type: 'copy',
      src: path.join(claudeTemplateDir, 'CLAUDE.md'),
      dst: path.join(homeDir, 'CLAUDE.md'),
      strategy: upgradeMode ? 'always' : 'skip-if-exists',
      appendMarker: upgradeMode ? undefined : 'Self-Evolving System Protocol',
    });
  }

  // ── 3. MEMORY.md ────────────────────────────────────────────
  if (components.has('memory-md')) {
    sections.push({
      type: 'copy',
      src: path.join(claudeTemplateDir, 'MEMORY.md'),
      dst: path.join(targetDir, 'MEMORY.md'),
      strategy: 'always',
    });
  }

  // ── 4. settings.json (merge or fresh) ───────────────────────
  if (components.has('settings')) {
    sections.push({
      type: 'merge-settings',
      srcPath: path.join(claudeTemplateDir, 'settings.json'),
      dstPath: path.join(targetDir, 'settings.json'),
      replaceHome: true,
    });
  }

  // ── 5. Hooks (copy with __HOME__ replacement, always overwrite) ─
  if (components.has('hooks')) {
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
  if (components.has('rules')) {
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
  if (components.has('commands')) {
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
  if (components.has('agents')) {
    sections.push({
      type: 'merge-agents',
      srcDir: path.join(claudeTemplateDir, 'agents'),
      dstDir: path.join(targetDir, 'agents'),
    });
  }

  // ── 9. Skills ───────────────────────────────────────────────
  if (components.has('skills')) {
    sections.push({
      type: 'copy-skills',
      srcDir: path.join(claudeTemplateDir, 'skills'),
      dstDir: path.join(targetDir, 'skills'),
    });
  }

  // ── 10. Memory seed (only if not exist) ─────────────────────
  if (components.has('seed-memory')) {
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
 * Install EvoKit template files using profile/exclude or legacy boolean-flag options.
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
    profile: 'full',
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
