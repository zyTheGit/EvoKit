/**
 * EvoKit — Manifest Types & Operations
 *
 * Defines the manifest schema that records what EvoKit installed,
 * enabling precise uninstall by reversing each recorded operation.
 *
 * The manifest lives at `~/.evokit/manifest.json` — a pure management
 * metadata directory, separate from the runtime installation target
 * (`~/.claude/`, `~/.codex/`, etc.).
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';

// ─── Types ───────────────────────────────────────────────────

/** A file that was created by EvoKit */
export interface ManifestFileRecord {
  /** Absolute path to the installed file */
  path: string;
  /** How it was installed: 'copy' | 'copy-dir' | 'copy-skills' | 'seed-memory' */
  source: string;
  /** Whether the file was freshly created or appended to an existing file */
  mode: 'created' | 'appended';
  /** For appended files: the marker string used to identify the appended section */
  appendMarker?: string;
}

/** A hook event entry that was merged into settings.json */
export interface ManifestHookEntry {
  /** The hook event name (e.g. 'SessionStart', 'PreToolUse') */
  event: string;
  /** The full matcher+hooks entry as a JSON object, for precise matching */
  entry: Record<string, unknown>;
}

/** An env var that was added to settings.json */
export interface ManifestEnvEntry {
  key: string;
  value: string;
}

/** A frontmatter key-value pair that was merged into an agent .md file */
export interface ManifestAgentFrontmatter {
  /** Agent filename (e.g. 'architect.md') */
  file: string;
  /** Key-value pairs that EvoKit added to the frontmatter */
  fields: Record<string, string>;
}

/** Record for a single adapter's installation */
export interface AdapterManifest {
  /** Adapter ID (e.g. 'claude', 'codex', 'opencode') */
  adapterId: string;
  /** Adapter version at install time */
  adapterVersion: string;
  /** Timestamp of installation (ISO 8601) */
  installedAt: string;
  /** Home directory at install time (for path resolution) */
  homeDir: string;
  /** Project directory at install time (for project-level adapters) */
  projectDir?: string;
  /** Adapter home directory (e.g. ~/.claude/, ~/.codex/) */
  adapterHome: string;
  /** Files created or appended by EvoKit */
  files: ManifestFileRecord[];
  /** Directories created by EvoKit (relative to adapterHome) */
  directories: string[];
  /** Hook entries merged into settings.json (Claude adapter) */
  hooks: ManifestHookEntry[];
  /** Env vars added to settings.json (Claude adapter) */
  envVars: ManifestEnvEntry[];
  /** Whether autoMemoryEnabled was set by EvoKit */
  autoMemoryEnabledSet: boolean;
  /** Permissions entries added (Claude adapter) */
  permissionsAllow: string[];
  permissionsDeny: string[];
  /** Agent frontmatter fields merged (Claude/OpenCode adapters) */
  agentFrontmatter: ManifestAgentFrontmatter[];
  /** Memory seed files installed */
  memorySeeds: string[];
  /** Skills directories installed */
  skillDirs: string[];
}

/** Top-level manifest structure */
export interface EvoKitManifest {
  /** Manifest schema version */
  version: 1;
  /** EvoKit version that wrote this manifest */
  evokitVersion: string;
  /** Timestamp of last manifest write */
  updatedAt: string;
  /** Per-adapter installation records, keyed by adapterId */
  adapters: Record<string, AdapterManifest>;
}

// ─── Path helpers ────────────────────────────────────────────

/** Path to the manifest file */
export function manifestPath(homeDir: string): string {
  return path.join(homeDir, '.evokit', 'manifest.json');
}

/** Ensure ~/.evokit/ directory exists */
export function ensureManifestDir(homeDir: string): void {
  fse.ensureDirSync(path.join(homeDir, '.evokit'));
}

// ─── Read / Write ────────────────────────────────────────────

/** Read the manifest, or return null if it doesn't exist or is invalid */
export function readManifest(homeDir: string): EvoKitManifest | null {
  const fp = manifestPath(homeDir);
  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    return JSON.parse(raw) as EvoKitManifest;
  } catch {
    return null;
  }
}

/** Write the manifest atomically (write to .tmp, then rename) */
export function writeManifest(homeDir: string, manifest: EvoKitManifest): void {
  ensureManifestDir(homeDir);
  const fp = manifestPath(homeDir);
  const tmpPath = fp + '.tmp';

  const json = JSON.stringify(manifest, null, 2) + '\n';
  fs.writeFileSync(tmpPath, json, 'utf-8');

  // Validate written JSON before renaming
  try {
    JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
  } catch {
    fse.removeSync(tmpPath);
    throw new Error('Manifest write validation failed — tmp file removed');
  }

  fs.renameSync(tmpPath, fp);
}

// ─── Adapter operations ──────────────────────────────────────

/** Update or add an adapter's record in the manifest (overwrite on upgrade) */
export function updateAdapterManifest(
  homeDir: string,
  adapter: AdapterManifest,
  evokitVersion: string,
): void {
  const existing = readManifest(homeDir);
  const manifest: EvoKitManifest = {
    version: 1,
    evokitVersion,
    updatedAt: new Date().toISOString(),
    adapters: {
      ...(existing?.adapters ?? {}),
      [adapter.adapterId]: adapter,
    },
  };
  writeManifest(homeDir, manifest);
}

/** Remove an adapter's record from the manifest */
export function removeAdapterFromManifest(homeDir: string, adapterId: string): void {
  const existing = readManifest(homeDir);
  if (!existing) return;

  const adapters = { ...existing.adapters };
  delete adapters[adapterId];

  const manifest: EvoKitManifest = {
    ...existing,
    updatedAt: new Date().toISOString(),
    adapters,
  };
  writeManifest(homeDir, manifest);
}

/** Check if any adapters remain in the manifest */
export function hasRemainingAdapters(homeDir: string): boolean {
  const manifest = readManifest(homeDir);
  if (!manifest) return false;
  return Object.keys(manifest.adapters).length > 0;
}
