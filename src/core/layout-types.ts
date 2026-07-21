/**
 * EvoKit — Adapter Layout Types
 *
 * Declarative description of what an adapter's installation pipeline
 * should do.  Each adapter builds an `AdapterLayout`, then the shared
 * `executeLayout()` engine carries it out — no per-adapter install code.
 *
 * @packageDocumentation
 */

// ─── Section types ────────────────────────────────────────────

/** Create one or more directories (relative to targetDir). */
export interface DirsSection {
  type: 'dirs';
  paths: string[];
}

/** Copy a single file from src to dst. */
export interface CopySection {
  type: 'copy';
  src: string;
  dst: string;
  /** 'always' overwrites; 'skip-if-exists' leaves the target alone. */
  strategy: 'always' | 'skip-if-exists';
  /** Replace `__HOME__` placeholders in the file content. */
  replaceHome?: boolean;
  /**
   * For 'skip-if-exists': if the target exists but lacks a specific
   * marker string, append the source content instead of skipping.
   * The marker is checked in the *target* file.
   */
  appendMarker?: string;
}

/** Copy all files in a directory, with optional filter and strategy. */
export interface CopyDirSection {
  type: 'copy-dir';
  srcDir: string;
  dstDir: string;
  /** Only copy files matching this glob-like extension filter (e.g. '.md', '.sh'). */
  filter?: string;
  /** 'always' overwrites; 'skip-if-exists' leaves existing files alone. */
  strategy: 'always' | 'skip-if-exists';
  /** Replace `__HOME__` placeholders in each file's content. */
  replaceHome?: boolean;
  /** Which InstallSummary counter to increment per file copied. */
  counter?: 'filesCreated' | 'hooksInstalled' | 'rulesInstalled' | 'commandsInstalled';
}

/**
 * Copy skill subdirectories.  Each subdirectory containing a `SKILL.md`
 * is copied as a unit.  Also copies a top-level `README.md` if present.
 */
export interface CopySkillsSection {
  type: 'copy-skills';
  srcDir: string;
  dstDir: string;
}

/** Deep-merge a template settings JSON into an existing user file. */
export interface MergeSettingsSection {
  type: 'merge-settings';
  srcPath: string;
  dstPath: string;
  /** Replace `__HOME__` placeholders in the template before merging. */
  replaceHome?: boolean;
}

/**
 * Merge agent markdown files using frontmatter merge.
 * Existing agents are not overwritten — only missing frontmatter
 * fields are added.
 */
export interface MergeAgentsSection {
  type: 'merge-agents';
  srcDir: string;
  dstDir: string;
}

/**
 * Seed memory files from a template directory.
 * Existing files are never overwritten (skip-if-exists per file).
 * Only files listed in `files` are seeded — no stray files.
 */
export interface SeedMemorySection {
  type: 'seed-memory';
  srcDir: string;
  dstDir: string;
  /** Only seed these named files. If omitted, seed all files in srcDir. */
  files?: string[];
}

/** Set filesystem permissions on a directory's contents. */
export interface PermissionsSection {
  type: 'permissions';
  /** Directory whose contents to chmod. */
  dir: string;
  /** File extension to match (e.g. '.sh', '.jsonl'). */
  extension: string;
  /** Octal mode to set (e.g. 0o755, 0o600). */
  mode: number;
}

/** A single step in an adapter layout. */
export type AdapterSection =
  | DirsSection
  | CopySection
  | CopyDirSection
  | CopySkillsSection
  | MergeSettingsSection
  | MergeAgentsSection
  | SeedMemorySection
  | PermissionsSection;

// ─── Layout ───────────────────────────────────────────────────

/** A declarative description of an adapter's installation steps. */
export interface AdapterLayout {
  /** Absolute path to the installation target directory. */
  targetDir: string;
  /** Ordered list of sections to execute. */
  sections: AdapterSection[];
}
