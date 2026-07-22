/**
 * EvoKit — Layout Execution Engine
 *
 * Executes a declarative `AdapterLayout` by processing each section
 * in order.  This is the single shared engine that all adapters use —
 * no per-adapter installation code needed.
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { mergeSettings } from './merge-settings.js';
import { installOrMergeAgents } from './merge-agents.js';
import { replaceHomeInString, replaceHomeInObject } from './replace-home.js';
import type { InstallSummary } from './types.js';
import type { ManifestCollector } from './manifest-collector.js';
import type {
  AdapterLayout,
  AdapterSection,
  DirsSection,
  CopySection,
  CopyDirSection,
  CopySkillsSection,
  MergeSettingsSection,
  MergeAgentsSection,
  SeedMemorySection,
  PermissionsSection,
} from './layout-types.js';

/**
 * Execute an `AdapterLayout` — install files, merge configs,
 * set permissions, etc.  Returns an `InstallSummary` describing
 * what happened.
 */
export function executeLayout(
  layout: AdapterLayout,
  opts: { homeDir: string; dryRun?: boolean; collector?: ManifestCollector },
): InstallSummary {
  const { homeDir, dryRun = false, collector } = opts;
  const { targetDir, sections } = layout;

  const summary: InstallSummary = {
    homeDir,
    filesCreated: 0,
    filesSkipped: 0,
    hooksInstalled: 0,
    commandsInstalled: 0,
    rulesInstalled: 0,
    agentsInstalled: 0,
  };

  // Ensure the target directory exists (even in dry-run for path resolution)
  if (!dryRun) {
    fse.ensureDirSync(targetDir);
  }

  for (const section of sections) {
    switch (section.type) {
      case 'dirs':
        executeDirs(section, targetDir, dryRun, collector);
        break;
      case 'copy':
        executeCopy(section, homeDir, dryRun, summary, collector);
        break;
      case 'copy-dir':
        executeCopyDir(section, homeDir, dryRun, summary, collector);
        break;
      case 'copy-skills':
        executeCopySkills(section, dryRun, summary, collector);
        break;
      case 'merge-settings':
        executeMergeSettings(section, homeDir, dryRun, summary, collector);
        break;
      case 'merge-agents':
        executeMergeAgents(section, dryRun, summary, collector);
        break;
      case 'seed-memory':
        executeSeedMemory(section, dryRun, summary, collector);
        break;
      case 'permissions':
        executePermissions(section, dryRun);
        break;
    }
  }

  return summary;
}

// ─── Section executors ────────────────────────────────────────

function executeDirs(
  section: DirsSection,
  targetDir: string,
  dryRun: boolean,
  collector?: ManifestCollector,
): void {
  for (const p of section.paths) {
    if (!dryRun) fse.ensureDirSync(path.join(targetDir, p));
    collector?.recordDirectory(p);
  }
}

function executeCopy(
  section: CopySection,
  homeDir: string,
  dryRun: boolean,
  summary: InstallSummary,
  collector?: ManifestCollector,
): void {
  const { src, dst, strategy, replaceHome, appendMarker } = section;

  if (!fse.existsSync(src)) return;

  if (strategy === 'skip-if-exists' && fse.existsSync(dst)) {
    if (appendMarker) {
      // Target exists — check if it already contains the marker
      const existing = fs.readFileSync(dst, 'utf-8');
      if (!existing.includes(appendMarker)) {
        // Append source content
        if (!dryRun) {
          let content = fs.readFileSync(src, 'utf-8');
          if (replaceHome) content = replaceHomeInString(content, homeDir);
          fs.appendFileSync(dst, '\n\n---\n\n' + content, 'utf-8');
        }
        summary.filesCreated++;
        collector?.recordFile({ path: dst, source: 'copy', mode: 'appended', appendMarker });
      } else {
        summary.filesSkipped++;
      }
    } else {
      summary.filesSkipped++;
    }
    return;
  }

  // 'always' strategy or target doesn't exist
  if (!dryRun) {
    let content = fs.readFileSync(src, 'utf-8');
    if (replaceHome) content = replaceHomeInString(content, homeDir);
    fse.ensureDirSync(path.dirname(dst));
    fs.writeFileSync(dst, content, 'utf-8');
  }
  summary.filesCreated++;
  collector?.recordFile({ path: dst, source: 'copy', mode: 'created', appendMarker });
}

function executeCopyDir(
  section: CopyDirSection,
  homeDir: string,
  dryRun: boolean,
  summary: InstallSummary,
  collector?: ManifestCollector,
): void {
  const { srcDir, dstDir, filter, strategy, replaceHome, counter } = section;

  if (!fse.existsSync(srcDir)) return;

  let files = fs.readdirSync(srcDir);
  if (filter) files = files.filter((f) => f.endsWith(filter));

  if (!dryRun) fse.ensureDirSync(dstDir);

  for (const file of files) {
    const srcPath = path.join(srcDir, file);
    const dstPath = path.join(dstDir, file);

    if (strategy === 'skip-if-exists' && fse.existsSync(dstPath)) {
      summary.filesSkipped++;
      continue;
    }

    if (!dryRun) {
      if (replaceHome) {
        let content = fs.readFileSync(srcPath, 'utf-8');
        content = replaceHomeInString(content, homeDir);
        fs.writeFileSync(dstPath, content, 'utf-8');
      } else {
        fse.copySync(srcPath, dstPath);
      }
    }

    // Increment the explicit counter, or fall back to filesCreated
    switch (counter) {
      case 'hooksInstalled':
        summary.hooksInstalled++;
        break;
      case 'rulesInstalled':
        summary.rulesInstalled++;
        break;
      case 'commandsInstalled':
        summary.commandsInstalled++;
        break;
      default:
        summary.filesCreated++;
    }

    collector?.recordFile({ path: dstPath, source: 'copy-dir', mode: 'created' });
  }
}

function executeCopySkills(
  section: CopySkillsSection,
  dryRun: boolean,
  summary: InstallSummary,
  collector?: ManifestCollector,
): void {
  const { srcDir, dstDir } = section;
  if (!fse.existsSync(srcDir)) return;

  for (const entry of fs.readdirSync(srcDir)) {
    const skillDir = path.join(srcDir, entry);
    if (fse.statSync(skillDir).isDirectory()) {
      const skillMd = path.join(skillDir, 'SKILL.md');
      if (fse.existsSync(skillMd)) {
        if (!dryRun) {
          fse.ensureDirSync(path.join(dstDir, entry));
          fse.copySync(skillMd, path.join(dstDir, entry, 'SKILL.md'));
        }
        summary.filesCreated++;
        collector?.recordSkillDir(entry);
        collector?.recordFile({
          path: path.join(dstDir, entry, 'SKILL.md'),
          source: 'copy-skills',
          mode: 'created',
        });
      }
    }
  }

  const readmeSrc = path.join(srcDir, 'README.md');
  if (fse.existsSync(readmeSrc)) {
    if (!dryRun) {
      fse.copySync(readmeSrc, path.join(dstDir, 'README.md'));
    }
    summary.filesCreated++;
    collector?.recordFile({
      path: path.join(dstDir, 'README.md'),
      source: 'copy-skills',
      mode: 'created',
    });
  }
}

function executeMergeSettings(
  section: MergeSettingsSection,
  homeDir: string,
  dryRun: boolean,
  summary: InstallSummary,
  collector?: ManifestCollector,
): void {
  const { srcPath, dstPath, replaceHome } = section;

  if (!fse.existsSync(srcPath)) return;

  if (!fse.existsSync(dstPath)) {
    // Fresh install — copy template with optional __HOME__ replacement
    if (!dryRun) {
      const content = fs.readFileSync(srcPath, 'utf-8');
      if (replaceHome) {
        // Parse JSON first, then replace __HOME__ in the object to avoid
        // Windows backslash issues (e.g. C:\Users\x → invalid JSON escape)
        try {
          const parsed = replaceHomeInObject(JSON.parse(content), homeDir);
          fse.ensureDirSync(path.dirname(dstPath));
          fs.writeFileSync(dstPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
          // Record all template entries for fresh install
          recordSettingsEntries(parsed, collector);
        } catch {
          // Fallback: if template is not valid JSON, do string replacement
          fse.ensureDirSync(path.dirname(dstPath));
          fs.writeFileSync(dstPath, replaceHomeInString(content, homeDir), 'utf-8');
        }
      } else {
        fse.ensureDirSync(path.dirname(dstPath));
        fs.writeFileSync(dstPath, content, 'utf-8');
      }
    }
    summary.filesCreated++;
    collector?.recordFile({ path: dstPath, source: 'merge-settings', mode: 'created' });
    return;
  }

  // Target exists — check if valid JSON, then merge or overwrite
  let isValid = true;
  try {
    JSON.parse(fs.readFileSync(dstPath, 'utf-8'));
  } catch {
    isValid = false;
  }

  if (!isValid) {
    // Corrupt/empty file — overwrite from template
    if (!dryRun) {
      const content = fs.readFileSync(srcPath, 'utf-8');
      if (replaceHome) {
        try {
          const parsed = replaceHomeInObject(JSON.parse(content), homeDir);
          fs.writeFileSync(dstPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
          recordSettingsEntries(parsed, collector);
        } catch {
          fs.writeFileSync(dstPath, replaceHomeInString(content, homeDir), 'utf-8');
        }
      } else {
        fs.writeFileSync(dstPath, content, 'utf-8');
      }
    }
    summary.filesCreated++;
    collector?.recordFile({ path: dstPath, source: 'merge-settings', mode: 'created' });
    return;
  }

  // Valid JSON — deep-merge (adds missing hooks/env, never overwrites)
  if (!dryRun) {
    const result = mergeSettings(dstPath, srcPath, homeDir);
    if (result.changed) {
      summary.filesCreated++;
      collector?.recordFile({ path: dstPath, source: 'merge-settings', mode: 'created' });
      // Record what was actually merged from the detail
      if (result.detail) {
        for (const h of result.detail.hooksAdded) {
          collector?.recordHook(h.event, h.entry);
        }
        for (const e of result.detail.envVarsAdded) {
          collector?.recordEnvVar(e.key, e.value);
        }
        if (result.detail.autoMemoryEnabledSet) {
          collector?.recordAutoMemoryEnabled();
        }
        if (result.detail.permissionsAllow.length > 0) {
          collector?.recordPermissionsAllow(result.detail.permissionsAllow);
        }
        if (result.detail.permissionsDeny.length > 0) {
          collector?.recordPermissionsDeny(result.detail.permissionsDeny);
        }
      }
    } else {
      summary.filesSkipped++;
    }
  } else {
    summary.filesCreated++;
  }
}

function executeMergeAgents(
  section: MergeAgentsSection,
  dryRun: boolean,
  summary: InstallSummary,
  collector?: ManifestCollector,
): void {
  const { srcDir, dstDir } = section;

  if (!fse.existsSync(srcDir)) return;

  if (dryRun) {
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.md'));
    summary.agentsInstalled += files.length;
    return;
  }

  const results = installOrMergeAgents(srcDir, dstDir);
  summary.agentsInstalled += results.filter(
    (r) => r.status === 'COPY' || r.status === 'MERGED',
  ).length;

  // Record agent operations for manifest
  for (const r of results) {
    if (r.status === 'COPY') {
      collector?.recordFile({
        path: path.join(dstDir, r.name),
        source: 'merge-agents',
        mode: 'created',
      });
    } else if (r.status === 'MERGED' && r.fieldsAdded) {
      collector?.recordAgentFrontmatter(r.name, r.fieldsAdded);
      collector?.recordFile({
        path: path.join(dstDir, r.name),
        source: 'merge-agents',
        mode: 'appended',
      });
    }
  }
}

function executeSeedMemory(
  section: SeedMemorySection,
  dryRun: boolean,
  summary: InstallSummary,
  collector?: ManifestCollector,
): void {
  const { srcDir, dstDir, files: seedFiles } = section;

  if (!fse.existsSync(srcDir)) return;
  if (!dryRun) fse.ensureDirSync(dstDir);

  // If a specific file list is given, only seed those; otherwise seed all
  const files = seedFiles ?? fs.readdirSync(srcDir);
  for (const file of files) {
    const target = path.join(dstDir, file);
    const src = path.join(srcDir, file);

    if (fse.existsSync(target)) {
      summary.filesSkipped++;
      continue;
    }

    if (fse.existsSync(src)) {
      if (!dryRun) fse.copySync(src, target);
      summary.filesCreated++;
      collector?.recordMemorySeed(target);
      collector?.recordFile({ path: target, source: 'seed-memory', mode: 'created' });
    }
  }
}

function executePermissions(section: PermissionsSection, dryRun: boolean): void {
  if (dryRun) return;

  const { dir, extension, mode } = section;
  if (!fse.existsSync(dir)) return;

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(extension)) continue;
    const fp = path.join(dir, file);
    try {
      fs.chmodSync(fp, mode);
    } catch {
      // Skip unreadable files
    }
  }
}

// ─── Manifest helpers ──────────────────────────────────────────

/**
 * Record all settings entries from a freshly-written settings object
 * (fresh install or overwrite of corrupt file).  For a fresh install,
 * all hooks/env/autoMemoryEnabled come from the template.
 */
function recordSettingsEntries(
  settings: Record<string, unknown>,
  collector?: ManifestCollector,
): void {
  if (!collector) return;

  // Record hooks
  const hooks = settings.hooks as Record<string, unknown> | undefined;
  if (hooks && typeof hooks === 'object') {
    for (const [event, hooksList] of Object.entries(hooks)) {
      if (Array.isArray(hooksList)) {
        for (const entry of hooksList) {
          collector.recordHook(event, entry as Record<string, unknown>);
        }
      }
    }
  }

  // Record env vars
  const env = settings.env as Record<string, string> | undefined;
  if (env && typeof env === 'object') {
    for (const [key, value] of Object.entries(env)) {
      collector.recordEnvVar(key, value);
    }
  }

  // Record autoMemoryEnabled
  if ('autoMemoryEnabled' in settings) {
    collector.recordAutoMemoryEnabled();
  }

  // Record permissions
  const perms = settings.permissions as Record<string, unknown> | undefined;
  if (perms && typeof perms === 'object') {
    if (Array.isArray(perms.allow)) {
      collector.recordPermissionsAllow(perms.allow as string[]);
    }
    if (Array.isArray(perms.deny)) {
      collector.recordPermissionsDeny(perms.deny as string[]);
    }
  }
}
