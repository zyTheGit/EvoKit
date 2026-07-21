/**
 * EvoKit — Codex CLI Adapter
 *
 * @internal — Adapter implementation for Codex CLI. The CodexAdapter class implements the public AdapterInstaller interface.
 *
 * Implements the AgentAdapter interface for OpenAI Codex CLI.
 * Codex CLI uses ~/.codex/ with:
 * - AGENTS.md for cognitive core (analogous to CLAUDE.md)
 * - hooks.json for lifecycle hooks (SessionStart, Stop, PreToolUse)
 * - config.toml for configuration
 * - .codex/rules/ for Starlark permission rules
 * - ~/.codex/memory/ for evolution data
 *
 * Uses the declarative `AdapterLayout` + `executeLayout()` engine.
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fse from 'fs-extra';
import {
  type AdapterInstaller,
  type AdapterInstallConfig,
  type AdapterInstallResult,
  type AdapterVerifyCheck,
  type AdapterStatus,
} from '../types.js';
import type { CodexAdapterOptions, CodexInstallConfig } from './types.js';
import type { VerifyResult, InstallSummary, SessionEntry } from '../../core/types.js';
import type { AdapterLayout, AdapterSection } from '../../core/layout-types.js';
import { executeLayout } from '../../core/layout-engine.js';
import { CodexHooksBuilder } from './hooks.js';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CODEX_ADAPTER_VERSION = '0.3.0';

const CODEX_SUBDIRS = ['rules', 'hooks-scripts', 'memory'] as const;
const HOOK_SCRIPTS = ['session-start.sh', 'stop.sh', 'pre-tool-use.sh'] as const;
const MEMORY_SEED_FILES = ['README.md'] as const;

export function resolveCodexHome(homeDir: string): string {
  return process.env.CODEX_HOME || path.join(homeDir, '.codex');
}

// ─── Layout builder ────────────────────────────────────────────

/**
 * Build the declarative layout for Codex CLI adapter installation.
 */
export function getLayout(opts: { homeDir: string; templateDir: string }): AdapterLayout {
  const { homeDir, templateDir } = opts;
  const codexHome = resolveCodexHome(homeDir);
  const codexTemplateDir = path.join(templateDir, 'codex');

  const sections: AdapterSection[] = [];

  // ── 1. Directories ──────────────────────────────────────────
  sections.push({
    type: 'dirs',
    paths: [...CODEX_SUBDIRS],
  });

  // ── 2. AGENTS.md (skip-if-exists, with __HOME__ replacement) ─
  sections.push({
    type: 'copy',
    src: path.join(codexTemplateDir, 'AGENTS.md'),
    dst: path.join(codexHome, 'AGENTS.md'),
    strategy: 'skip-if-exists',
    replaceHome: true,
  });

  // ── 3. hooks.json (always copy — upgrade path, with __HOME__) ─
  sections.push({
    type: 'copy',
    src: path.join(codexTemplateDir, 'hooks.json'),
    dst: path.join(codexHome, 'hooks.json'),
    strategy: 'always',
    replaceHome: true,
  });

  // ── 4. config.toml (skip-if-exists, no __HOME__ replacement) ─
  sections.push({
    type: 'copy',
    src: path.join(codexTemplateDir, 'config.toml'),
    dst: path.join(codexHome, 'config.toml'),
    strategy: 'skip-if-exists',
  });

  // ── 5. Rules (always copy — upgrade path) ────────────────────
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(codexTemplateDir, 'rules'),
    dstDir: path.join(codexHome, 'rules'),
    filter: '.rules',
    strategy: 'always',
    counter: 'rulesInstalled',
  });

  // ── 6. Hook scripts (always copy, with __HOME__) ─────────────
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(codexTemplateDir, 'hooks-scripts'),
    dstDir: path.join(codexHome, 'hooks-scripts'),
    filter: '.sh',
    strategy: 'always',
    replaceHome: true,
    counter: 'hooksInstalled',
  });

  // ── 7. Memory seed (skip-if-exists) ──────────────────────────
  sections.push({
    type: 'seed-memory',
    srcDir: path.join(codexTemplateDir, 'memory'),
    dstDir: path.join(codexHome, 'memory'),
    files: [...MEMORY_SEED_FILES],
  });

  // ── 8. Permissions ───────────────────────────────────────────
  sections.push({
    type: 'permissions',
    dir: path.join(codexHome, 'hooks-scripts'),
    extension: '.sh',
    mode: 0o755,
  });

  return { targetDir: codexHome, sections };
}

// ─── AdapterInstaller Implementation ─────────────────────────────

export class CodexAdapter implements AdapterInstaller {
  readonly id = 'codex';
  readonly label = 'Codex CLI';
  readonly description = '~/.codex/';
  readonly version = CODEX_ADAPTER_VERSION;

  install(config: AdapterInstallConfig): AdapterInstallResult {
    const homeDir = config.homeDir;
    const templateDir = config.templateDir;
    const codexHome = resolveCodexHome(homeDir);
    const codexTemplateDir = path.join(templateDir, 'codex');

    // Validate template exists
    if (!fse.existsSync(path.join(codexTemplateDir, 'AGENTS.md'))) {
      throw new Error(
        `Codex template not found at: ${codexTemplateDir}\n` +
          '  Ensure the template directory contains a codex/ subdirectory with AGENTS.md.',
      );
    }

    const layout = getLayout({ homeDir, templateDir });
    const summary = executeLayout(layout, {
      homeDir,
      dryRun: config.dryRun ?? false,
    });

    return {
      filesCreated: summary.filesCreated,
      filesSkipped: summary.filesSkipped,
      hooksInstalled: summary.hooksInstalled,
      commandsInstalled: summary.commandsInstalled,
      rulesInstalled: summary.rulesInstalled,
      agentsInstalled: summary.agentsInstalled,
      adapterHome: codexHome,
    };
  }

  verify(config: AdapterInstallConfig): AdapterVerifyCheck[] {
    const codexHome = resolveCodexHome(config.homeDir);
    return this._verifyCodexInstallation(codexHome);
  }

  status(config: AdapterInstallConfig): AdapterStatus {
    const codexHome = resolveCodexHome(config.homeDir);
    const checks = this._verifyCodexInstallation(codexHome);
    const allPass = checks.every((c) => c.pass);

    return {
      installed: allPass,
      adapterHome: codexHome,
      allPass,
      checks,
    };
  }

  private _verifyCodexInstallation(codexHome: string): AdapterVerifyCheck[] {
    return verifyCodexInstallation(codexHome);
  }
}

// ─── Standalone API ──────────────────────────────────────────────

/**
 * Install EvoKit for Codex CLI.
 * Delegates to the layout engine via `getLayout()` + `executeLayout()`.
 */
export function installCodex(config: CodexInstallConfig): InstallSummary {
  const codexHome = resolveCodexHome(config.homeDir);
  const codexTemplateDir = path.join(config.templateDir, 'codex');

  // Validate template exists
  if (!fse.existsSync(path.join(codexTemplateDir, 'AGENTS.md'))) {
    throw new Error(
      `Codex template not found at: ${codexTemplateDir}\n` +
        '  Ensure the template directory contains a codex/ subdirectory with AGENTS.md.',
    );
  }

  const layout = getLayout({ homeDir: config.homeDir, templateDir: config.templateDir });
  return executeLayout(layout, {
    homeDir: config.homeDir,
    dryRun: config.dryRun ?? false,
  });
}

/**
 * Set up lifecycle hooks for Codex CLI.
 * Generates hooks.json with SessionStart, Stop, and PreToolUse handlers.
 */
export function setupCodexHooks(codexHome: string, options: CodexAdapterOptions = {}): void {
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
    : path.resolve(homeDir, '.codex', 'memory');

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
    : path.resolve(homeDir, '.codex', 'memory');

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
    : path.resolve(homeDir, '.codex', 'memory');

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
  const evokitBin = path.resolve(__dirname, '..', '..', '..', 'bin', 'evokit.cjs');

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

/**
 * Full boot verification for Codex CLI installation.
 */
export function verifyCodexSetup(
  homeDir: string,
  _options: CodexAdapterOptions = {},
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
 * Verify a Codex CLI installation at a given path.
 * Public wrapper used by standalone API.
 */
export function verifyCodexInstallation(codexHome: string): AdapterVerifyCheck[] {
  const checks: AdapterVerifyCheck[] = [];

  for (const file of ['AGENTS.md', 'hooks.json', 'config.toml']) {
    const exists = fse.existsSync(path.join(codexHome, file));
    checks.push({
      name: `.codex/${file}`,
      pass: exists,
      detail: exists ? undefined : 'Missing file',
    });
  }

  for (const subdir of CODEX_SUBDIRS) {
    const exists = fse.existsSync(path.join(codexHome, subdir));
    checks.push({
      name: `.codex/${subdir}/`,
      pass: exists,
      detail: exists ? undefined : 'Missing directory',
    });
  }

  const hooksDir = path.join(codexHome, 'hooks-scripts');
  if (fse.existsSync(hooksDir)) {
    for (const script of HOOK_SCRIPTS) {
      const sp = path.join(hooksDir, script);
      const exists = fse.existsSync(sp);
      if (exists) {
        const stats = fs.statSync(sp);
        checks.push({
          name: `.codex/hooks-scripts/${script}`,
          pass: (stats.mode & 0o111) !== 0,
          detail: (stats.mode & 0o111) !== 0 ? undefined : 'Not executable',
        });
      } else {
        checks.push({
          name: `.codex/hooks-scripts/${script}`,
          pass: false,
          detail: 'Missing script',
        });
      }
    }
  }

  return checks;
}

/**
 * Get the status summary of a Codex CLI EvoKit installation.
 */
export function getCodexStatus(homeDir: string): {
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

    const memDir = path.join(homeDir, '.codex', 'memory');
    result.sharedMemoryPresent = fse.existsSync(memDir);

    result.installed = result.agentsPresent || result.hooksPresent || result.configPresent;
  } catch (e) {
    return { ...result, error: (e as Error).message };
  }

  return result;
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
