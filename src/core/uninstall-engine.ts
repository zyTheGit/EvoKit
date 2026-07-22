/**
 * EvoKit — Uninstall Engine
 *
 * Coordinates the full uninstall process: reads the manifest, backs up
 * files, reverses settings/agent/CLAUDE.md merges, deletes installed
 * files, cleans up empty directories, and removes the adapter from
 * the manifest.
 *
 * When no manifest exists, falls back to heuristic uninstall based
 * on the adapter's known template structure.
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import {
  readManifest,
  removeAdapterFromManifest,
  hasRemainingAdapters,
  manifestPath,
} from './manifest.js';
import type { AdapterManifest, ManifestAgentFrontmatter } from './manifest.js';
import { reverseMergeSettings } from './reverse-merge-settings.js';
import { reverseMergeAgents } from './reverse-merge-agents.js';
import { removeClaudeMdSection } from './remove-claude-md.js';

/** Options for the uninstall operation */
export interface UninstallOptions {
  /** User's home directory */
  homeDir: string;
  /** Adapter ID to uninstall (e.g. 'claude', 'codex') */
  adapterId: string;
  /** Force uninstall even if warnings occur */
  force: boolean;
  /** Delete user data files (MEMORY.md, memory/*.jsonl, etc.) */
  purge: boolean;
  /** Dry-run mode — compute changes but don't write */
  dryRun: boolean;
  /** Skip backup creation */
  noBackup: boolean;
  /** Custom backup directory (default: ~/.evokit/backup/uninstall-YYYYMMDD/) */
  backupDir?: string;
  /** Project directory (for project-level adapters) */
  projectDir?: string;
}

/** Result of the uninstall operation */
export interface UninstallResult {
  /** Adapter ID that was uninstalled */
  adapterId: string;
  /** Number of files deleted */
  filesDeleted: number;
  /** Number of files preserved (user data, non-purge mode) */
  filesPreserved: number;
  /** Number of hook entries removed from settings.json */
  hooksRemoved: number;
  /** Number of env vars removed from settings.json */
  envVarsRemoved: number;
  /** Number of agent frontmatter fields removed */
  agentFieldsRemoved: number;
  /** Number of empty directories removed */
  directoriesRemoved: number;
  /** Path to the backup directory, if created */
  backupPath?: string;
  /** Whether heuristic (no-manifest) mode was used */
  heuristic: boolean;
  /** Warnings encountered during uninstall */
  warnings: string[];
}

/** User data files that are preserved by default (not purged) */
const PRESERVED_FILE_NAMES = new Set([
  'MEMORY.md',
  'corrections.jsonl',
  'observations.jsonl',
  'learned-rules.md',
  'evolution-log.md',
  'sessions.jsonl',
  'violations.jsonl',
]);

/** EvoKit seed file — always deleted even without purge */
const SEED_FILE_NAMES = new Set(['README.md']);

/**
 * Execute the full uninstall process for an adapter.
 *
 * Reads the manifest, backs up files, reverses all merges, deletes
 * installed files, cleans up empty directories, and removes the
 * adapter from the manifest.  Falls back to heuristic uninstall
 * if no manifest exists.
 */
export function executeUninstall(options: UninstallOptions): UninstallResult {
  const { homeDir, adapterId, force, purge, dryRun, noBackup, backupDir, projectDir } = options;

  const result: UninstallResult = {
    adapterId,
    filesDeleted: 0,
    filesPreserved: 0,
    hooksRemoved: 0,
    envVarsRemoved: 0,
    agentFieldsRemoved: 0,
    directoriesRemoved: 0,
    heuristic: false,
    warnings: [],
  };

  // 1. Read manifest
  const manifest = readManifest(homeDir);
  const adapterRecord = manifest?.adapters?.[adapterId];

  if (!manifest || !adapterRecord) {
    // No manifest or adapter not found → heuristic uninstall
    return executeHeuristicUninstall(options);
  }

  const adapterHome = adapterRecord.adapterHome;

  // 2. Collect files to backup
  const filesToBackup: string[] = [];

  // Settings.json
  const settingsPath = path.join(adapterHome, 'settings.json');
  if (fse.existsSync(settingsPath)) {
    filesToBackup.push(settingsPath);
  }

  // CLAUDE.md
  const claudeMdPath = path.join(homeDir, 'CLAUDE.md');
  if (fse.existsSync(claudeMdPath)) {
    filesToBackup.push(claudeMdPath);
  }

  // Agent files
  const agentsDir = path.join(adapterHome, 'agents');
  for (const af of adapterRecord.agentFrontmatter) {
    const agentPath = path.join(agentsDir, af.file);
    if (fse.existsSync(agentPath)) {
      filesToBackup.push(agentPath);
    }
  }

  // All files that will be deleted
  for (const fileRecord of adapterRecord.files) {
    if (fse.existsSync(fileRecord.path)) {
      filesToBackup.push(fileRecord.path);
    }
  }

  // 3. Create backup (unless noBackup)
  if (!noBackup && filesToBackup.length > 0) {
    const bkDir =
      backupDir ||
      path.join(
        homeDir,
        '.evokit',
        'backup',
        `uninstall-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
      );

    createUninstallBackup(filesToBackup, bkDir, homeDir, dryRun);
    if (!dryRun) {
      result.backupPath = bkDir;
    }
  }

  // 4. Reverse merge settings.json
  if (fse.existsSync(settingsPath)) {
    const reverseResult = reverseMergeSettings(settingsPath, adapterRecord, dryRun);
    result.hooksRemoved = reverseResult.hooksRemoved;
    result.envVarsRemoved = reverseResult.envVarsRemoved;
  }

  // 5. Remove CLAUDE.md section
  if (fse.existsSync(claudeMdPath)) {
    // Find the appendMarker from the manifest files
    const claudeMdRecord = adapterRecord.files.find(
      (f) => f.path === claudeMdPath && f.mode === 'appended',
    );
    const marker = claudeMdRecord?.appendMarker || 'Self-Evolving System Protocol';
    removeClaudeMdSection(claudeMdPath, marker, dryRun);
  }

  // 6. Reverse merge agents
  if (adapterRecord.agentFrontmatter.length > 0 && fse.existsSync(agentsDir)) {
    const agentResults = reverseMergeAgents(agentsDir, adapterRecord.agentFrontmatter, dryRun);
    result.agentFieldsRemoved = agentResults.reduce((sum, r) => sum + r.fieldsRemoved, 0);
    // Count deleted agent files
    result.filesDeleted += agentResults.filter((r) => r.action === 'deleted').length;
  }

  // 7. Delete EvoKit-managed files
  for (const fileRecord of adapterRecord.files) {
    const filePath = fileRecord.path;
    if (!fse.existsSync(filePath)) continue;

    const basename = path.basename(filePath);
    const dirName = path.basename(path.dirname(filePath));

    // Skip user data files unless purge
    if (!purge) {
      if (PRESERVED_FILE_NAMES.has(basename)) {
        result.filesPreserved++;
        continue;
      }
      // Preserve memory/*.jsonl files
      if (dirName === 'memory' && basename.endsWith('.jsonl')) {
        result.filesPreserved++;
        continue;
      }
      // Preserve memory/learned-rules.md and memory/evolution-log.md
      if (
        dirName === 'memory' &&
        (basename === 'learned-rules.md' || basename === 'evolution-log.md')
      ) {
        result.filesPreserved++;
        continue;
      }
    }

    // Always delete memory/README.md (EvoKit seed)
    // Delete the file
    if (!dryRun) {
      fse.removeSync(filePath);
    }
    result.filesDeleted++;
  }

  // Delete skills directories
  for (const skillDir of adapterRecord.skillDirs) {
    const skillPath = path.isAbsolute(skillDir) ? skillDir : path.join(adapterHome, skillDir);
    if (fse.existsSync(skillPath)) {
      if (!dryRun) {
        fse.removeSync(skillPath);
      }
      result.filesDeleted++;
    }
  }

  // 8. Clean up empty directories (deepest first)
  result.directoriesRemoved = cleanupEmptyDirs(
    adapterRecord.directories.map((d) => (path.isAbsolute(d) ? d : path.join(adapterHome, d))),
    dryRun,
  );

  // 9. Remove adapter from manifest
  if (!dryRun) {
    removeAdapterFromManifest(homeDir, adapterId);

    // If no adapters remain, clean up ~/.evokit/manifest.json
    if (!hasRemainingAdapters(homeDir)) {
      const mPath = manifestPath(homeDir);
      if (fse.existsSync(mPath)) {
        fse.removeSync(mPath);
      }
      // Try to remove ~/.evokit/ if empty
      const evokitDir = path.join(homeDir, '.evokit');
      try {
        if (fs.readdirSync(evokitDir).length === 0) {
          fse.removeSync(evokitDir);
        }
      } catch {
        // Directory not empty or doesn't exist — ignore
      }
    }
  }

  return result;
}

// ─── Heuristic uninstall ──────────────────────────────────────

/**
 * Heuristic uninstall when no manifest exists.
 *
 * Uses known patterns to find and remove EvoKit-installed content:
 * - settings.json: remove hooks containing `.claude/hooks/`, autoMemoryEnabled, known env vars
 * - CLAUDE.md: remove section starting with 'Self-Evolving System Protocol'
 * - Known file names: hooks/*.sh, rules/*.md, commands/*.md, skills/ subdirs, memory/README.md
 * - Agents: remove known EvoKit frontmatter fields with template default values
 */
function executeHeuristicUninstall(options: UninstallOptions): UninstallResult {
  const { homeDir, adapterId, purge, dryRun, noBackup, backupDir } = options;

  const result: UninstallResult = {
    adapterId,
    filesDeleted: 0,
    filesPreserved: 0,
    hooksRemoved: 0,
    envVarsRemoved: 0,
    agentFieldsRemoved: 0,
    directoriesRemoved: 0,
    heuristic: true,
    warnings: ['No manifest found — using heuristic uninstall. Some files may be missed.'],
  };

  // Determine adapter home based on adapter ID
  const adapterHome = getAdapterHome(homeDir, adapterId);

  // ── Phase 1: Collect files to backup ─────────────────────
  const filesToBackup: string[] = [];

  const settingsPath = path.join(adapterHome, 'settings.json');
  if (fse.existsSync(settingsPath)) {
    filesToBackup.push(settingsPath);
  }

  const claudeMdPath = path.join(homeDir, 'CLAUDE.md');
  if (fse.existsSync(claudeMdPath)) {
    filesToBackup.push(claudeMdPath);
  }

  const knownDirs = ['hooks', 'rules', 'commands', 'agents'];
  const knownExtensions: Record<string, string> = {
    hooks: '.sh',
    rules: '.md',
    commands: '.md',
  };

  for (const dirName of knownDirs) {
    const dirPath = path.join(adapterHome, dirName);
    if (!fse.existsSync(dirPath)) continue;
    const ext = knownExtensions[dirName];
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (ext && !file.endsWith(ext)) continue;
        filesToBackup.push(path.join(dirPath, file));
      }
    } catch {
      // Skip unreadable directories
    }
  }

  const skillsDir = path.join(adapterHome, 'skills');
  if (fse.existsSync(skillsDir)) {
    filesToBackup.push(skillsDir);
  }

  const memoryReadme = path.join(adapterHome, 'memory', 'README.md');
  if (fse.existsSync(memoryReadme)) {
    filesToBackup.push(memoryReadme);
  }

  // ── Phase 2: Create backup BEFORE any modifications ──────
  if (!noBackup && filesToBackup.length > 0) {
    const bkDir =
      backupDir ||
      path.join(
        homeDir,
        '.evokit',
        'backup',
        `uninstall-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
      );

    createUninstallBackup(filesToBackup, bkDir, homeDir, dryRun);
    if (!dryRun) {
      result.backupPath = bkDir;
    }
  }

  // ── Phase 3: Perform modifications ───────────────────────

  // 1. Settings.json heuristic
  if (fse.existsSync(settingsPath) && !dryRun) {
    const heuristicResult = heuristicReverseSettings(settingsPath, homeDir, adapterHome);
    result.hooksRemoved = heuristicResult.hooksRemoved;
    result.envVarsRemoved = heuristicResult.envVarsRemoved;
  }

  // 2. CLAUDE.md heuristic
  if (fse.existsSync(claudeMdPath)) {
    removeClaudeMdSection(claudeMdPath, 'Self-Evolving System Protocol', dryRun);
  }

  // 3. Known file names — delete
  for (const dirName of knownDirs) {
    const dirPath = path.join(adapterHome, dirName);
    if (!fse.existsSync(dirPath)) continue;
    const ext = knownExtensions[dirName];
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (ext && !file.endsWith(ext)) continue;
        const filePath = path.join(dirPath, file);
        if (!dryRun) {
          fse.removeSync(filePath);
        }
        result.filesDeleted++;
      }
    } catch {
      // Skip unreadable directories
    }
  }

  // Skills directories
  if (fse.existsSync(skillsDir)) {
    if (!dryRun) {
      fse.removeSync(skillsDir);
    }
    result.filesDeleted++;
  }

  // Memory/README.md (EvoKit seed)
  if (fse.existsSync(memoryReadme)) {
    if (!dryRun) {
      fse.removeSync(memoryReadme);
    }
    result.filesDeleted++;
  }

  // 4. Agent frontmatter heuristic
  const agentsDir = path.join(adapterHome, 'agents');
  if (fse.existsSync(agentsDir)) {
    const heuristicAgentRecords: ManifestAgentFrontmatter[] = [];
    try {
      const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
      for (const file of agentFiles) {
        heuristicAgentRecords.push({
          file,
          fields: {
            model: 'sonnet',
            tools: 'Read,Edit,Write,Bash,Grep,Glob,Agent',
            disallowedTools: '',
            memory: 'true',
            maxTurns: '30',
          },
        });
      }
    } catch {
      // Skip unreadable agent directories
    }

    if (heuristicAgentRecords.length > 0) {
      const agentResults = reverseMergeAgents(agentsDir, heuristicAgentRecords, dryRun);
      result.agentFieldsRemoved = agentResults.reduce((sum, r) => sum + r.fieldsRemoved, 0);
      result.filesDeleted += agentResults.filter((r) => r.action === 'deleted').length;
    }
  }

  // 5. Clean up empty directories
  const dirsToClean = knownDirs
    .map((d) => path.join(adapterHome, d))
    .concat([path.join(adapterHome, 'memory'), adapterHome]);
  result.directoriesRemoved = cleanupEmptyDirs(dirsToClean, dryRun);

  result.warnings.push(
    'Heuristic uninstall completed. Verify that no user data was accidentally removed.',
  );

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────

/** Get adapter home directory based on adapter ID */
function getAdapterHome(homeDir: string, adapterId: string): string {
  const adapterHomes: Record<string, string> = {
    claude: '.claude',
    codex: '.codex',
    opencode: '.opencode',
    aider: '.aider',
  };
  const subDir = adapterHomes[adapterId] || `.${adapterId}`;
  return path.join(homeDir, subDir);
}

/** Heuristic reverse of settings.json when no manifest exists */
function heuristicReverseSettings(
  settingsPath: string,
  homeDir: string,
  adapterHome: string,
): { hooksRemoved: number; envVarsRemoved: number } {
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    /* file missing or invalid JSON — nothing to reverse */
    return { hooksRemoved: 0, envVarsRemoved: 0 };
  }

  let hooksRemoved = 0;
  let envVarsRemoved = 0;
  let changed = false;

  // Remove hook entries whose command references the adapter's hooks directory
  // Use adapterHome to avoid matching unrelated hooks (e.g. /home/user/my-hooks/)
  const hooksMarker = adapterHome.replace(/\\/g, '/') + '/hooks/';
  if (settings.hooks && typeof settings.hooks === 'object') {
    const hooks = settings.hooks as Record<string, unknown>;
    for (const [eventName, eventArr] of Object.entries(hooks)) {
      if (!Array.isArray(eventArr)) continue;

      const filtered = eventArr.filter((group) => {
        const str = JSON.stringify(group).replace(/\\\\/g, '/');
        // Only match hooks that reference THIS adapter's hooks directory
        if (str.includes(hooksMarker)) {
          hooksRemoved++;
          return false;
        }
        return true;
      });

      if (filtered.length !== eventArr.length) {
        changed = true;
        if (filtered.length === 0) {
          delete hooks[eventName];
        } else {
          hooks[eventName] = filtered;
        }
      }
    }

    if (Object.keys(hooks).length === 0) {
      delete settings.hooks;
    }
  }

  // Remove autoMemoryEnabled if set to true
  if (settings.autoMemoryEnabled === true) {
    delete settings.autoMemoryEnabled;
    changed = true;
  }

  // Remove known EvoKit env vars
  const knownEnvVars = ['CLAUDE_CODE_DISABLE_AUTO_MEMORY'];
  if (settings.env && typeof settings.env === 'object') {
    const env = settings.env as Record<string, string>;
    for (const key of knownEnvVars) {
      if (key in env) {
        delete env[key];
        envVarsRemoved++;
        changed = true;
      }
    }

    if (Object.keys(env).length === 0) {
      delete settings.env;
    }
  }

  if (changed) {
    // Check if effectively empty
    const keysWithoutSchema = Object.keys(settings).filter((k) => k !== '$schema');
    if (keysWithoutSchema.length === 0) {
      fse.removeSync(settingsPath);
    } else {
      // Write atomically
      const tmpPath = settingsPath + '.reverse.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
      try {
        fs.renameSync(tmpPath, settingsPath);
      } catch {
        /* atomic rename failed (cross-device or permissions) — discard temp file */
        fse.removeSync(tmpPath);
      }
    }
  }

  return { hooksRemoved, envVarsRemoved };
}

/**
 * Create a backup of files that will be modified or deleted.
 * Preserves relative paths from homeDir.
 */
function createUninstallBackup(
  filesToBackup: string[],
  backupDir: string,
  homeDir: string,
  dryRun: boolean,
): void {
  if (dryRun) return;

  fse.ensureDirSync(backupDir);

  for (const filePath of filesToBackup) {
    if (!fse.existsSync(filePath)) continue;

    // Compute relative path from homeDir
    const relPath = path.relative(homeDir, filePath);
    const backupPath = path.join(backupDir, relPath);

    try {
      fse.copySync(filePath, backupPath);
    } catch {
      // Skip files that can't be backed up (permissions, etc.)
    }
  }
}

/**
 * Clean up empty directories, processing deepest first.
 * Returns the number of directories removed.
 */
function cleanupEmptyDirs(dirs: string[], dryRun: boolean): number {
  let removed = 0;

  // Sort by depth (deepest first) — more path separators = deeper
  const sorted = [...dirs].sort((a, b) => {
    const depthA = a.split(path.sep).length;
    const depthB = b.split(path.sep).length;
    return depthB - depthA;
  });

  for (const dir of sorted) {
    if (!fse.existsSync(dir)) continue;

    try {
      const entries = fs.readdirSync(dir);
      if (entries.length === 0) {
        if (!dryRun) {
          fse.removeSync(dir);
        }
        removed++;
      }
    } catch {
      // Directory not accessible — skip
    }
  }

  return removed;
}
