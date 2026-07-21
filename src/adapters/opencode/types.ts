/**
 * EvoKit — OpenCode Adapter Types
 *
 * OpenCode-specific types that are only used by the OpenCode adapter.
 * Core/shared types remain in `src/core/types.ts`.
 *
 * @packageDocumentation
 */

/** Options for the OpenCode adapter */
export interface OpenCodeAdapterOptions {
  opencodeDir?: string;
  dryRun?: boolean;
  verify?: boolean;
}

/** OpenCode-specific installation config */
export interface OpenCodeInstallConfig {
  homeDir: string;
  projectDir: string;
  templateDir: string;
  dryRun?: boolean;
}
