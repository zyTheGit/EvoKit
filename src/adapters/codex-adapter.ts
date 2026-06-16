/**
 * EvoKit — Codex CLI Adapter
 *
 * Implements the AgentAdapter interface for OpenAI Codex CLI.
 * Codex CLI uses ~/.codex/ with:
 * - AGENTS.md for cognitive core (analogous to CLAUDE.md)
 * - hooks.json for lifecycle hooks (SessionStart, Stop, PreToolUse)
 * - config.toml for configuration
 * - .codex/rules/ for Starlark permission rules
 * - Shared ~/.claude/memory/ for evolution data
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fse from 'fs-extra';
import {
  CodexAdapterOptions,
  CodexInstallConfig,
  VerifyResult,
  InstallSummary,
  SessionEntry,
} from '../core/types.js';
import { installCodexTemplate, resolveCodexHome, verifyCodexInstallation } from './codex-installer.js';
import { CodexHooksBuilder } from './codex-hooks.js';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CODEX_ADAPTER_VERSION = '0.3.0';

const SHARED_MEMORY_DIR = '.claude/memory';

// ─── Public API ────────────────────────────────────────────────

/**
 * Install EvoKit for Codex CLI.
 * Copies templates to ~/.codex/ and sets up hooks.
 */
export async function installCodex(
  config: CodexInstallConfig,
): Promise<InstallSummary> {
  return installCodexTemplate(config);
}

/**
 * Set up lifecycle hooks for Codex CLI.
 * Generates hooks.json with SessionStart, Stop, and PreToolUse handlers.
 */
export function setupCodexHooks(
  codexHome: string,
  options: CodexAdapterOptions = {},
): void {
  const scriptsDir = options.codexHome
    ? path.resolve(options.codexHome, 'hooks-scripts')
    : path.resolve(codexHome, 'hooks-scripts');

  // Use default hooks configuration
  const builder = CodexHooksBuilder.createDefault(scriptsDir);

  // Write hooks.json
  const hooksPath = path.join(codexHome, 'hooks.json');
  builder.writeToFile(hooksPath);
}

/**
 * Inject learning data into Codex-accessible context.
 * Writes corrections and observations to the shared memory directory.
 */
export function injectCodexMemory(
  homeDir: string,
  data: {
    corrections?: Array<{ pattern: string; context: string }>;
    observations?: Array<{ pattern: string; confidence: number; source: string }>;
    learnedRules?: string;
  },
  options: CodexAdapterOptions = {},
): number {
  const memoryDir = options.sharedMemoryDir
    ? path.resolve(options.sharedMemoryDir)
    : path.resolve(homeDir, SHARED_MEMORY_DIR);

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
 * Export learning data from shared memory.
 */
export function exportCodexMemory(
  homeDir: string,
  options: CodexAdapterOptions = {},
): {
  corrections: unknown[];
  observations: unknown[];
  learnedRules: string;
  sessions: unknown[];
} {
  const memoryDir = options.sharedMemoryDir
    ? path.resolve(options.sharedMemoryDir)
    : path.resolve(homeDir, SHARED_MEMORY_DIR);

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

  // Parse sessions.jsonl (filtered by codex if tagged)
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
 * Record a session entry tagged with the Codex assistant name.
 */
export function recordCodexSession(
  homeDir: string,
  session: Omit<SessionEntry, 'timestamp' | 'assistant'>,
  options: CodexAdapterOptions = {},
): void {
  const memoryDir = options.sharedMemoryDir
    ? path.resolve(options.sharedMemoryDir)
    : path.resolve(homeDir, SHARED_MEMORY_DIR);

  fse.ensureDirSync(memoryDir);
  const sessionsPath = path.join(memoryDir, 'sessions.jsonl');

  const entry: SessionEntry = {
    timestamp: new Date().toISOString(),
    assistant: 'codex',
    ...session,
  };

  fs.appendFileSync(sessionsPath, JSON.stringify(entry) + '\n', 'utf-8');
  fs.chmodSync(sessionsPath, 0o600);
}

/**
 * Run an EvoKit command within the Codex context.
 * Uses shell execution for /boot, /evolve, /review commands.
 */
export function runCodexCommand(
  name: string,
  args: string[] = [],
  homeDir: string = process.env.HOME || '',
): { exitCode: number; stdout: string; stderr: string } {
  const evokitBin = path.resolve(__dirname, '..', '..', 'bin', 'evokit.cjs');

  let command: string;
  switch (name) {
    case 'boot':
      command = getBootCommand(homeDir);
      break;
    case 'evolve':
      command = `node "${evokitBin}" evolve ${args.join(' ')}`;
      break;
    case 'doctor':
      command = `node "${evokitBin}" doctor ${args.join(' ')}`;
      break;
    default:
      command = `node "${evokitBin}" ${name} ${args.join(' ')}`;
      break;
  }

  const result = spawnSync(command, {
    shell: true,
    cwd: homeDir,
    encoding: 'utf-8',
    timeout: 60000,
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

// ─── Internal Helpers ──────────────────────────────────────────

function getBootCommand(homeDir: string): string {
  const codexHome = resolveCodexHome(homeDir);
  const scriptPath = path.join(codexHome, 'hooks-scripts', 'session-start.sh');
  if (fse.existsSync(scriptPath)) {
    return `bash "${scriptPath}"`;
  }
  // Fallback: verify installation directly
  return `echo "EvoKit boot check for Codex CLI (home: ${codexHome})"`;
}

/**
 * Full boot verification for Codex CLI installation.
 */
export function verifyCodexSetup(
  homeDir: string,
  options: CodexAdapterOptions = {},
): VerifyResult[] {
  const codexHome = resolveCodexHome(homeDir);
  const checks = verifyCodexInstallation(codexHome);
  const results: VerifyResult[] = [];

  for (const check of checks) {
    results.push({
      check: check.name,
      status: check.pass ? 'pass' : 'fail',
      detail: check.detail,
    });
  }

  return results;
}

/**
 * Get the status summary of a Codex CLI EvoKit installation.
 */
export function getCodexStatus(
  homeDir: string,
): {
  installed: boolean;
  codexHome: string;
  agentsPresent: boolean;
  hooksPresent: boolean;
  configPresent: boolean;
  sharedMemoryPresent: boolean;
  ruleCount: number;
  error?: string;
} {
  const codexHome = resolveCodexHome(homeDir);
  const result = {
    installed: false,
    codexHome,
    agentsPresent: false,
    hooksPresent: false,
    configPresent: false,
    sharedMemoryPresent: false,
    ruleCount: 0,
  };

  try {
    result.agentsPresent = fse.existsSync(path.join(codexHome, 'AGENTS.md'));
    result.hooksPresent = fse.existsSync(path.join(codexHome, 'hooks.json'));
    result.configPresent = fse.existsSync(path.join(codexHome, 'config.toml'));

    const rulesDir = path.join(codexHome, 'rules');
    if (fse.existsSync(rulesDir)) {
      result.ruleCount = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.rules')).length;
    }

    const memDir = path.join(homeDir, SHARED_MEMORY_DIR);
    result.sharedMemoryPresent = fse.existsSync(memDir);

    result.installed =
      result.agentsPresent || result.hooksPresent || result.configPresent;
  } catch (e) {
    return { ...result, error: (e as Error).message };
  }

  return result;
}
