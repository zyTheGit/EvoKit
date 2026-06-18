/**
 * EvoKit — Template Installation Pipeline
 *
 * Core engine for installing EvoKit templates.  Provides a unified
 * `installPipeline()` that handles directories, files, __HOME__ replacement,
 * settings merge, agent frontmatter merge, memory seeding, and permissions.
 *
 * Each adapter (Claude, Codex, OpenCode) calls `installPipeline()` with
 * different options — no code duplication.
 *
 * This file also retains `installTemplate()` and `verifyInstallation()`
 * for backward compatibility.
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { mergeSettings } from './merge-settings.js';
import { installOrMergeAgents } from './merge-agents.js';
import { setHookPermissions, setMemoryPermissions } from './permissions.js';
import type { InstallSummary } from './types.js';

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

export function installPipeline(opts: InstallPipelineOptions): InstallSummary {
  const { homeDir, templateDir, targetDir, dryRun = false } = opts;
  const claudeTemplateDir = path.join(templateDir, 'claude');

  const summary: InstallSummary = {
    homeDir,
    filesCreated: 0,
    filesSkipped: 0,
    hooksInstalled: 0,
    commandsInstalled: 0,
    rulesInstalled: 0,
    agentsInstalled: 0,
  };

  // ── 1. Create directories ───────────────────────────────────
  const dirs = new Set<string>();
  if (opts.installRules) dirs.add('rules');
  if (opts.installCommands) dirs.add('commands');
  if (opts.installAgents) dirs.add('agents');
  if (opts.installHooks) dirs.add('hooks');
  if (opts.seedMemory) dirs.add('memory');
  if (opts.installSkills) dirs.add('skills');

  if (!dryRun) {
    fse.ensureDirSync(targetDir);
    for (const d of dirs) {
      fse.ensureDirSync(path.join(targetDir, d));
    }
  }

  // ── 2. CLAUDE.md (copy or append protocol section) ──────────
  if (opts.installClaudeMd) {
    const src = path.join(claudeTemplateDir, 'CLAUDE.md');
    const rootTarget = path.join(homeDir, 'CLAUDE.md');
    if (fse.existsSync(src)) {
      if (!fse.existsSync(rootTarget)) {
        if (!dryRun) fse.copySync(src, rootTarget);
        summary.filesCreated++;
      } else {
        const marker = 'Self-Evolving System Protocol';
        const existing = fs.readFileSync(rootTarget, 'utf-8');
        if (!existing.includes(marker)) {
          if (!dryRun) {
            const protocolContent = fs.readFileSync(src, 'utf-8');
            fs.appendFileSync(rootTarget, '\n\n---\n\n' + protocolContent, 'utf-8');
          }
          summary.filesCreated++;
        } else {
          summary.filesSkipped++;
        }
      }
    }
  }

  // ── 3. MEMORY.md → targetDir ────────────────────────────────
  if (opts.installMemoryMd) {
    const src = path.join(claudeTemplateDir, 'MEMORY.md');
    const target = path.join(targetDir, 'MEMORY.md');
    if (fse.existsSync(src)) {
      if (!dryRun) fse.copySync(src, target);
      summary.filesCreated++;
    }
  }

  // ── 4. settings.json (merge or fresh) ───────────────────────
  if (opts.installSettings) {
    const templateFile = path.join(claudeTemplateDir, 'settings.json');
    const targetFile = path.join(targetDir, 'settings.json');

    if (!fse.existsSync(targetFile)) {
      // Fresh install — copy template with __HOME__ replacement
      if (fse.existsSync(templateFile)) {
        if (!dryRun) {
          let content = fs.readFileSync(templateFile, 'utf-8');
          content = content.replace(/__HOME__/g, homeDir);
          fs.writeFileSync(targetFile, content, 'utf-8');
        }
        summary.filesCreated++;
      }
    } else if (fse.existsSync(templateFile)) {
      // File exists — check if valid JSON, then merge or overwrite
      let isValid = true;
      try {
        JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
      } catch {
        isValid = false;
      }

      if (!isValid) {
        // Corrupt/empty file — overwrite from template
        if (!dryRun) {
          let content = fs.readFileSync(templateFile, 'utf-8');
          content = content.replace(/__HOME__/g, homeDir);
          fs.writeFileSync(targetFile, content, 'utf-8');
        }
        summary.filesCreated++;
      } else {
        // Valid JSON — deep-merge (adds missing hooks/env, never overwrites)
        if (!dryRun) {
          const result = mergeSettings(targetFile, templateFile, homeDir);
          if (result.changed) summary.filesCreated++;
          else summary.filesSkipped++;
        } else {
          summary.filesCreated++;
        }
      }
    }
  }

  // ── 4. Hooks (copy with __HOME__ replacement) ───────────────
  if (opts.installHooks) {
    const hooksSrc = path.join(claudeTemplateDir, 'hooks');
    const hooksDst = path.join(targetDir, 'hooks');
    if (fse.existsSync(hooksSrc)) {
      const hooks = fs.readdirSync(hooksSrc).filter((f) => f.endsWith('.sh'));
      for (const hook of hooks) {
        const src = path.join(hooksSrc, hook);
        if (dryRun) {
          summary.hooksInstalled++;
          continue;
        }
        let content = fs.readFileSync(src, 'utf-8');
        content = content.replace(/__HOME__/g, homeDir);
        fs.writeFileSync(path.join(hooksDst, hook), content, 'utf-8');
        summary.hooksInstalled++;
      }
    }
  }

  // ── 5. Rules (copy, overwrite — upgrade path) ───────────────
  if (opts.installRules) {
    const rulesSrc = path.join(claudeTemplateDir, 'rules');
    const rulesDst = path.join(targetDir, 'rules');
    if (fse.existsSync(rulesSrc)) {
      const files = fs.readdirSync(rulesSrc).filter((f) => f.endsWith('.md'));
      if (!dryRun) {
        for (const file of files) {
          fse.copySync(path.join(rulesSrc, file), path.join(rulesDst, file));
        }
      }
      summary.rulesInstalled += files.length;
    }
  }

  // ── 6. Commands (copy, overwrite) ───────────────────────────
  if (opts.installCommands) {
    const cmdSrc = path.join(claudeTemplateDir, 'commands');
    const cmdDst = path.join(targetDir, 'commands');
    if (fse.existsSync(cmdSrc)) {
      const files = fs.readdirSync(cmdSrc).filter((f) => f.endsWith('.md'));
      if (!dryRun) {
        for (const file of files) {
          fse.copySync(path.join(cmdSrc, file), path.join(cmdDst, file));
        }
      }
      summary.commandsInstalled += files.length;
    }
  }

  // ── 7. Agents (frontmatter merge) ───────────────────────────
  if (opts.installAgents) {
    const agentsSrc = path.join(claudeTemplateDir, 'agents');
    const agentsDst = path.join(targetDir, 'agents');
    if (fse.existsSync(agentsSrc)) {
      if (dryRun) {
        const files = fs.readdirSync(agentsSrc).filter((f) => f.endsWith('.md'));
        summary.agentsInstalled += files.length;
      } else {
        const results = installOrMergeAgents(agentsSrc, agentsDst);
        summary.agentsInstalled += results.filter(
          (r) => r.status === 'COPY' || r.status === 'MERGED',
        ).length;
      }
    }
  }

  // ── 8. Skills (copy skill subdirectories) ───────────────────
  if (opts.installSkills) {
    const skillsSrc = path.join(claudeTemplateDir, 'skills');
    const skillsDst = path.join(targetDir, 'skills');
    if (fse.existsSync(skillsSrc) && !dryRun) {
      for (const entry of fs.readdirSync(skillsSrc)) {
        const skillDir = path.join(skillsSrc, entry);
        if (fse.statSync(skillDir).isDirectory()) {
          const skillMd = path.join(skillDir, 'SKILL.md');
          if (fse.existsSync(skillMd)) {
            fse.ensureDirSync(path.join(skillsDst, entry));
            fse.copySync(skillMd, path.join(skillsDst, entry, 'SKILL.md'));
          }
        }
      }
      const readmeSrc = path.join(skillsSrc, 'README.md');
      if (fse.existsSync(readmeSrc)) {
        fse.copySync(readmeSrc, path.join(skillsDst, 'README.md'));
      }
    }
  }

  // ── 9. Memory seed (only if not exist) ──────────────────────
  if (opts.seedMemory) {
    const memSrc = path.join(claudeTemplateDir, 'memory');
    const memDst = path.join(targetDir, 'memory');
    if (fse.existsSync(memSrc)) {
      fse.ensureDirSync(memDst);
      for (const file of MEMORY_SEED_FILES) {
        const target = path.join(memDst, file);
        if (!fse.existsSync(target)) {
          const src = path.join(memSrc, file);
          if (fse.existsSync(src)) {
            if (!dryRun) fse.copySync(src, target);
            summary.filesCreated++;
          }
        } else {
          summary.filesSkipped++;
        }
      }
    }
  }

  // ── 10. Permissions ─────────────────────────────────────────
  if (!dryRun) {
    const hooksDir = path.join(targetDir, 'hooks');
    if (fse.existsSync(hooksDir)) {
      setHookPermissions(hooksDir);
    }
    const memDir = path.join(targetDir, 'memory');
    if (fse.existsSync(memDir)) {
      setMemoryPermissions(memDir);
    }
  }

  return summary;
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
