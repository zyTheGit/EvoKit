/**
 * EvoKit — Adapter Installer Interface
 *
 * @public — Part of the public adapter API. Implement this to add custom adapters.
 *
 * Every adapter (Claude Code, Codex CLI, OpenCode CLI, etc.) implements
 * this interface for uniform template installation and verification.
 *
 * @packageDocumentation
 */

/**
 * @public — This type is part of the public adapter API.
 * Third-party adapter implementers should use this type.
 */
export interface AdapterInstallConfig {
  homeDir: string;
  templateDir: string;
  projectDir?: string;
  adapterHome?: string;
  dryRun?: boolean;
}

/** Result summary from an adapter installation */
export interface AdapterInstallResult {
  filesCreated: number;
  filesSkipped: number;
  hooksInstalled: number;
  commandsInstalled: number;
  rulesInstalled: number;
  agentsInstalled: number;
  adapterHome: string;
}

/** A single verification check */
export interface AdapterVerifyCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

/** Typed status returned by `AdapterInstaller.status()`. */
export interface AdapterStatus {
  installed: boolean;
  adapterHome: string;
  allPass: boolean;
  checks: AdapterVerifyCheck[];
  /** Project directory (for adapters that install project-level files, e.g. OpenCode) */
  projectDir?: string;
}

/**
 * Every adapter installer must implement this interface.
 * To add a new AI assistant (Cursor, Pi CLI, Windsurf, …),
 * implement this class and call registerAdapter().
 */
export interface AdapterInstaller {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly version: string;
  /** Mark as experimental — not yet fully implemented. */
  readonly experimental?: boolean;

  /** Install template files for this adapter */
  install(config: AdapterInstallConfig): AdapterInstallResult;

  /** Verify an existing installation */
  verify(config: AdapterInstallConfig): AdapterVerifyCheck[];

  /** Return typed status info (for doctor / status checks) */
  status(config: AdapterInstallConfig): AdapterStatus;
}
