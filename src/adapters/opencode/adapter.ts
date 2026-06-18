/**
 * EvoKit — OpenCode CLI Adapter
 *
 * Implements the AgentAdapter interface for OpenCode CLI.
 * OpenCode uses:
 * - AGENTS.md for the L1 cognitive core (global + project)
 * - ~/.config/opencode/opencode.json for global configuration
 * - ~/.config/opencode/agent/ for global sub-agent definitions
 * - ~/.config/opencode/memory/ for global learning data
 * - ~/.config/opencode/skills/ for global skills
 * - .opencode/tools/ for custom tools
 * - .opencode/agent/ for project-level agent overrides
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import {
  type AdapterInstaller,
  type AdapterInstallConfig,
  type AdapterInstallResult,
  type AdapterVerifyCheck,
} from '../types.js';
import type {
  InstallSummary,
  OpenCodeAdapterOptions,
  OpenCodeInstallConfig,
  SessionEntry,
} from '../../core/types.js';
import { installOrMergeAgents } from '../../core/merge-agents.js';
import {
  installOpenCodeTemplate,
  verifyOpenCodeInstallation,
  resolveOpenCodeConfigHome,
} from './installer.js';

export const OPENCODE_ADAPTER_VERSION = '0.5.0';

const GLOBAL_DIRS = ['agent', 'memory', 'skills'] as const;
const PROJECT_SUBDIRS = ['tools', 'agent', 'memory'] as const;
const TOOL_FILES = ['evokit-boot.ts', 'evokit-evolve.ts', 'evokit-memory.ts', 'evokit-session.ts'] as const;
const MEMORY_SEED_FILES = ['README.md'] as const;

export function resolveOpenCodeProjectDir(projectDir: string): string {
  return path.join(projectDir, '.opencode');
}

// ─── AdapterInstaller Implementation ─────────────────────────────

export class OpenCodeAdapter implements AdapterInstaller {
  readonly id = 'opencode';
  readonly label = 'OpenCode CLI';
  readonly description = '~/.config/opencode/ + .opencode/';
  readonly version = OPENCODE_ADAPTER_VERSION;

  install(config: AdapterInstallConfig): AdapterInstallResult {
    const homeDir = config.homeDir;
    const projectDir = config.projectDir || process.cwd();
    const templateDir = config.templateDir;
    const dryRun = config.dryRun ?? false;

    const result = installOpenCodeTemplate({
      homeDir,
      projectDir,
      templateDir,
      dryRun,
    });

    return {
      filesCreated: result.filesCreated,
      filesSkipped: result.filesSkipped,
      hooksInstalled: result.hooksInstalled,
      commandsInstalled: result.commandsInstalled,
      rulesInstalled: result.rulesInstalled,
      agentsInstalled: result.agentsInstalled,
      adapterHome: resolveOpenCodeConfigHome(homeDir),
    };
  }

  verify(config: AdapterInstallConfig): AdapterVerifyCheck[] {
    const projectDir = config.projectDir || process.cwd();
    const homeDir = config.homeDir;
    return verifyOpenCodeInstallation(projectDir, homeDir).map((c) => ({
      name: c.name,
      pass: c.pass,
      detail: c.detail,
    }));
  }

  status(config: AdapterInstallConfig): Record<string, unknown> {
    const projectDir = config.projectDir || process.cwd();
    const homeDir = config.homeDir;
    const checks = verifyOpenCodeInstallation(projectDir, homeDir).map((c) => ({
      name: c.name,
      pass: c.pass,
      detail: c.detail,
    }));
    return {
      installed: checks.every((c) => c.pass),
      adapterHome: resolveOpenCodeConfigHome(homeDir),
      projectDir,
      checks,
    };
  }
}

// ─── Standalone API ──────────────────────────────────────────────

/**
 * Install EvoKit for OpenCode CLI.
 */
export async function installOpenCode(
  config: OpenCodeInstallConfig,
): Promise<InstallSummary> {
  return installOpenCodeTemplate(config);
}

/**
 * Set up EvoKit for OpenCode.
 * OpenCode has no hook system — this is a no-op.
 * Lifecycle events (boot, session) are handled via custom tools.
 */
export function setupOpenCodeTools(
  _projectDir: string,
  _options: OpenCodeAdapterOptions = {},
): void {
  // No-op: OpenCode has no lifecycle hooks.
  // Use the custom tools in .opencode/tools/ instead.
}

/**
 * Resolve the memory directory for OpenCode.
 * Uses global ~/.config/opencode/memory/ by default.
 */
export function resolveMemoryDir(
  projectDir: string,
  options: OpenCodeAdapterOptions = {},
): string {
  // If a custom opencodeDir is provided (legacy), use it
  if (options.opencodeDir) {
    return path.join(path.resolve(options.opencodeDir), 'memory');
  }
  // Otherwise use the OpenCode config home convention
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(resolveOpenCodeConfigHome(homeDir), 'memory');
}

/**
 * Inject learning data into OpenCode-accessible memory.
 * Writes corrections and observations to ~/.config/opencode/memory/.
 */
export function injectOpenCodeMemory(
  projectDir: string,
  data: {
    corrections?: Array<{ pattern: string; context: string }>;
    observations?: Array<{ pattern: string; confidence: number; source: string }>;
    learnedRules?: string;
  },
  options: OpenCodeAdapterOptions = {},
): number {
  const memoryDir = resolveMemoryDir(projectDir, options);
  fse.ensureDirSync(memoryDir);
  let filesWritten = 0;

  // Append corrections
  if (data.corrections?.length) {
    const correctionsPath = path.join(memoryDir, 'corrections.jsonl');
    const lines = data.corrections.map((c) =>
      JSON.stringify({
        timestamp: new Date().toISOString(),
        pattern: c.pattern,
        context: c.context,
        count: 1,
      }),
    );
    fs.appendFileSync(correctionsPath, lines.join('\n') + '\n', 'utf-8');
    fs.chmodSync(correctionsPath, 0o600);
    filesWritten++;
  }

  // Append observations
  if (data.observations?.length) {
    const observationsPath = path.join(memoryDir, 'observations.jsonl');
    const lines = data.observations.map((o) =>
      JSON.stringify({
        timestamp: new Date().toISOString(),
        pattern: o.pattern,
        confidence: o.confidence,
        source: o.source,
      }),
    );
    fs.appendFileSync(observationsPath, lines.join('\n') + '\n', 'utf-8');
    fs.chmodSync(observationsPath, 0o600);
    filesWritten++;
  }

  return filesWritten;
}

/**
 * Export learning data from OpenCode memory.
 */
export function exportOpenCodeMemory(
  projectDir: string,
  options: OpenCodeAdapterOptions = {},
): {
  corrections: unknown[];
  observations: unknown[];
  learnedRules: string;
  sessions: unknown[];
} {
  const memoryDir = resolveMemoryDir(projectDir, options);

  const result = {
    corrections: [] as unknown[],
    observations: [] as unknown[],
    learnedRules: '',
    sessions: [] as unknown[],
  };

  // Parse corrections.jsonl
  const correctionsPath = path.join(memoryDir, 'corrections.jsonl');
  if (fse.existsSync(correctionsPath)) {
    result.corrections = fs
      .readFileSync(correctionsPath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  // Parse observations.jsonl
  const observationsPath = path.join(memoryDir, 'observations.jsonl');
  if (fse.existsSync(observationsPath)) {
    result.observations = fs
      .readFileSync(observationsPath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  // Read learned-rules.md
  const rulesPath = path.join(memoryDir, 'learned-rules.md');
  if (fse.existsSync(rulesPath)) {
    result.learnedRules = fs.readFileSync(rulesPath, 'utf-8');
  }

  // Parse sessions.jsonl
  const sessionsPath = path.join(memoryDir, 'sessions.jsonl');
  if (fse.existsSync(sessionsPath)) {
    result.sessions = fs
      .readFileSync(sessionsPath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as SessionEntry;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  return result;
}

/**
 * Record a session entry tagged with the OpenCode assistant name.
 */
export function recordOpenCodeSession(
  projectDir: string,
  session: Omit<SessionEntry, 'timestamp' | 'assistant'>,
  options: OpenCodeAdapterOptions = {},
): void {
  const memoryDir = resolveMemoryDir(projectDir, options);
  fse.ensureDirSync(memoryDir);

  const sessionsPath = path.join(memoryDir, 'sessions.jsonl');
  const entry: SessionEntry = {
    timestamp: new Date().toISOString(),
    assistant: 'opencode',
    ...session,
  };

  fs.appendFileSync(sessionsPath, JSON.stringify(entry) + '\n', 'utf-8');
  fs.chmodSync(sessionsPath, 0o600);
}

/**
 * Get the status summary of an OpenCode EvoKit installation.
 */
export function getOpenCodeStatus(
  projectDir: string,
): {
  installed: boolean;
  projectDir: string;
  agentsPresent: boolean;
  configPresent: boolean;
  toolsPresent: boolean;
  memoryPresent: boolean;
  agentCount: number;
  error?: string;
} {
  const opencodeDir = resolveOpenCodeProjectDir(projectDir);
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const globalDir = resolveOpenCodeConfigHome(homeDir);

  const result = {
    installed: false,
    projectDir,
    agentsPresent: false,
    configPresent: false,
    toolsPresent: false,
    memoryPresent: false,
    agentCount: 0,
  };

  try {
    // Check global config
    result.agentsPresent = fse.existsSync(path.join(globalDir, 'AGENTS.md'));
    result.configPresent = fse.existsSync(path.join(globalDir, 'opencode.json'));

    // Check project-level tools
    const toolsDir = path.join(opencodeDir, 'tools');
    if (fse.existsSync(toolsDir)) {
      result.toolsPresent = fs.readdirSync(toolsDir).filter((f) => f.endsWith('.ts')).length > 0;
    }

    // Check global agents
    const globalAgentDir = path.join(globalDir, 'agent');
    if (fse.existsSync(globalAgentDir)) {
      result.agentCount = fs.readdirSync(globalAgentDir).filter((f) => f.endsWith('.md')).length;
    }

    // Check global memory
    result.memoryPresent = fse.existsSync(path.join(globalDir, 'memory'));

    result.installed =
      result.agentsPresent || result.configPresent || result.toolsPresent;
  } catch (e) {
    return { ...result, error: (e as Error).message };
  }

  return result;
}
