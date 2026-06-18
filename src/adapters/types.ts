/**
 * EvoKit — Adapter Installer Interface
 *
 * Every adapter (Claude Code, Codex CLI, OpenCode CLI, etc.) implements
 * this interface for uniform template installation and verification.
 *
 * @packageDocumentation
 */

/** Configuration passed to each adapter installer */
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

/**
 * Every adapter installer must implement this interface.
 * To add a new AI assistant (Cursor, Aider, Windsurf, …),
 * implement this class and call registerAdapter().
 */
export interface AdapterInstaller {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly version: string;

  /** Install template files for this adapter */
  install(config: AdapterInstallConfig): AdapterInstallResult;

  /** Verify an existing installation */
  verify(config: AdapterInstallConfig): AdapterVerifyCheck[];

  /** Return status info (for doctor / status checks) */
  status(config: AdapterInstallConfig): Record<string, unknown>;
}
