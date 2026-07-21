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
import type { InstallSummary } from './types.js';
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
  opts: { homeDir: string; dryRun?: boolean },
): InstallSummary {
  const { homeDir, dryRun = false } = opts;
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
        executeDirs(section, targetDir, dryRun);
        break;
      case 'copy':
        executeCopy(section, homeDir, dryRun, summary);
        break;
      case 'copy-dir':
        executeCopyDir(section, homeDir, dryRun, summary);
        break;
      case 'copy-skills':
        executeCopySkills(section, dryRun, summary);
        break;
      case 'merge-settings':
        executeMergeSettings(section, homeDir, dryRun, summary);
        break;
      case 'merge-agents':
        executeMergeAgents(section, dryRun, summary);
        break;
      case 'seed-memory':
        executeSeedMemory(section, dryRun, summary);
        break;
      case 'permissions':
        executePermissions(section, dryRun);
        break;
    }
  }

  return summary;
}

// ─── Section executors ────────────────────────────────────────

function executeDirs(section: DirsSection, targetDir: string, dryRun: boolean): void {
  if (dryRun) return;
  for (const p of section.paths) {
    fse.ensureDirSync(path.join(targetDir, p));
  }
}

function executeCopy(
  section: CopySection,
  homeDir: string,
  dryRun: boolean,
  summary: InstallSummary,
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
          if (replaceHome) content = content.replace(/__HOME__/g, homeDir);
          fs.appendFileSync(dst, '\n\n---\n\n' + content, 'utf-8');
        }
        summary.filesCreated++;
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
    if (replaceHome) content = content.replace(/__HOME__/g, homeDir);
    fse.ensureDirSync(path.dirname(dst));
    fs.writeFileSync(dst, content, 'utf-8');
  }
  summary.filesCreated++;
}

function executeCopyDir(
  section: CopyDirSection,
  homeDir: string,
  dryRun: boolean,
  summary: InstallSummary,
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
        content = content.replace(/__HOME__/g, homeDir);
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
  }
}

function executeCopySkills(
  section: CopySkillsSection,
  dryRun: boolean,
  summary: InstallSummary,
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
      }
    }
  }

  const readmeSrc = path.join(srcDir, 'README.md');
  if (fse.existsSync(readmeSrc)) {
    if (!dryRun) {
      fse.copySync(readmeSrc, path.join(dstDir, 'README.md'));
    }
    summary.filesCreated++;
  }
}

function executeMergeSettings(
  section: MergeSettingsSection,
  homeDir: string,
  dryRun: boolean,
  summary: InstallSummary,
): void {
  const { srcPath, dstPath, replaceHome } = section;

  if (!fse.existsSync(srcPath)) return;

  if (!fse.existsSync(dstPath)) {
    // Fresh install — copy template with optional __HOME__ replacement
    if (!dryRun) {
      let content = fs.readFileSync(srcPath, 'utf-8');
      if (replaceHome) content = content.replace(/__HOME__/g, homeDir);
      fse.ensureDirSync(path.dirname(dstPath));
      fs.writeFileSync(dstPath, content, 'utf-8');
    }
    summary.filesCreated++;
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
      let content = fs.readFileSync(srcPath, 'utf-8');
      if (replaceHome) content = content.replace(/__HOME__/g, homeDir);
      fs.writeFileSync(dstPath, content, 'utf-8');
    }
    summary.filesCreated++;
    return;
  }

  // Valid JSON — deep-merge (adds missing hooks/env, never overwrites)
  if (!dryRun) {
    const result = mergeSettings(dstPath, srcPath, homeDir);
    if (result.changed) summary.filesCreated++;
    else summary.filesSkipped++;
  } else {
    summary.filesCreated++;
  }
}

function executeMergeAgents(
  section: MergeAgentsSection,
  dryRun: boolean,
  summary: InstallSummary,
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
}

function executeSeedMemory(
  section: SeedMemorySection,
  dryRun: boolean,
  summary: InstallSummary,
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
