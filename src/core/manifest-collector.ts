/**
 * EvoKit — Manifest Collector
 *
 * A push-based collector that records what the layout engine actually
 * installed.  Call `record*()` methods during installation, then
 * `build()` to produce an `AdapterManifest` for the manifest file.
 *
 * @packageDocumentation
 */

import type {
  ManifestFileRecord,
  ManifestHookEntry,
  ManifestEnvEntry,
  ManifestAgentFrontmatter,
  AdapterManifest,
} from './manifest.js';

export class ManifestCollector {
  private files: ManifestFileRecord[] = [];
  private directories: string[] = [];
  private hooks: ManifestHookEntry[] = [];
  private envVars: ManifestEnvEntry[] = [];
  private autoMemoryEnabledSet: boolean = false;
  private permissionsAllow: string[] = [];
  private permissionsDeny: string[] = [];
  private agentFrontmatter: ManifestAgentFrontmatter[] = [];
  private memorySeeds: string[] = [];
  private skillDirs: string[] = [];

  recordFile(record: ManifestFileRecord): void {
    this.files.push(record);
  }

  recordDirectory(dir: string): void {
    this.directories.push(dir);
  }

  recordHook(event: string, entry: Record<string, unknown>): void {
    this.hooks.push({ event, entry });
  }

  recordEnvVar(key: string, value: string): void {
    this.envVars.push({ key, value });
  }

  recordAutoMemoryEnabled(): void {
    this.autoMemoryEnabledSet = true;
  }

  recordPermissionsAllow(entries: string[]): void {
    this.permissionsAllow.push(...entries);
  }

  recordPermissionsDeny(entries: string[]): void {
    this.permissionsDeny.push(...entries);
  }

  recordAgentFrontmatter(file: string, fields: Record<string, string>): void {
    this.agentFrontmatter.push({ file, fields });
  }

  recordMemorySeed(filePath: string): void {
    this.memorySeeds.push(filePath);
  }

  recordSkillDir(name: string): void {
    this.skillDirs.push(name);
  }

  build(opts: {
    adapterId: string;
    adapterVersion: string;
    homeDir: string;
    projectDir?: string;
    adapterHome: string;
  }): AdapterManifest {
    return {
      adapterId: opts.adapterId,
      adapterVersion: opts.adapterVersion,
      installedAt: new Date().toISOString(),
      homeDir: opts.homeDir,
      projectDir: opts.projectDir,
      adapterHome: opts.adapterHome,
      files: this.files,
      directories: this.directories,
      hooks: this.hooks,
      envVars: this.envVars,
      autoMemoryEnabledSet: this.autoMemoryEnabledSet,
      permissionsAllow: this.permissionsAllow,
      permissionsDeny: this.permissionsDeny,
      agentFrontmatter: this.agentFrontmatter,
      memorySeeds: this.memorySeeds,
      skillDirs: this.skillDirs,
    };
  }
}
