/**
 * EvoKit — OpenCode CLI Adapter
 *
 * Implements the AgentAdapter interface for OpenCode CLI.
 * OpenCode uses:
 * - AGENTS.md for the L1 cognitive core
 * - opencode.json for configuration
 * - .opencode/tools/ for custom tools (replaces hooks)
 * - .opencode/agents/ for sub-agent definitions
 * - .opencode/memory/ for learning data
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
import { installOpenCodeTemplate, verifyOpenCodeInstallation } from './installer.js';

export const OPENCODE_ADAPTER_VERSION = '0.4.0';

const OPENCODE_SUBDIRS = ['tools', 'agents', 'memory'] as const;
const TOOL_FILES = ['evokit-boot.ts', 'evokit-evolve.ts', 'evokit-memory.ts', 'evokit-session.ts'] as const;
const MEMORY_SEED_FILES = ['README.md'] as const;

export function resolveOpenCodeProjectDir(projectDir: string): string {
  return path.join(projectDir, '.opencode');
}

// ─── AdapterInstaller Implementation ─────────────────────────────

export class OpenCodeAdapter implements AdapterInstaller {
  readonly id = 'opencode';
  readonly label = 'OpenCode CLI';
  readonly description = '.opencode/ (project)';
  readonly version = OPENCODE_ADAPTER_VERSION;

  install(config: AdapterInstallConfig): AdapterInstallResult {
    const homeDir = config.homeDir;
    const projectDir = config.projectDir || process.cwd();
    const templateDir = config.templateDir;
    const opencodeDir = resolveOpenCodeProjectDir(projectDir);
    const opencodeTemplateDir = path.join(templateDir, 'opencode');
    const dryRun = config.dryRun ?? false;

    const result: AdapterInstallResult = {
      filesCreated: 0,
      filesSkipped: 0,
      hooksInstalled: 0,
      commandsInstalled: 0,
      rulesInstalled: 0,
      agentsInstalled: 0,
      adapterHome: opencodeDir,
    };

    if (!fse.existsSync(path.join(opencodeTemplateDir, 'AGENTS.md'))) {
      throw new Error(
        `OpenCode template not found at: ${opencodeTemplateDir}\n` +
          '  Ensure the template directory contains an opencode/ subdirectory with AGENTS.md.',
      );
    }

    // 1. Create directories
    if (!dryRun) {
      fse.ensureDirSync(opencodeDir);
      for (const subdir of OPENCODE_SUBDIRS) {
        fse.ensureDirSync(path.join(opencodeDir, subdir));
      }
    }

    // 2. AGENTS.md (project root, only if not exists)
    const agentsTarget = path.join(projectDir, 'AGENTS.md');
    if (!fse.existsSync(agentsTarget)) {
      const src = path.join(opencodeTemplateDir, 'AGENTS.md');
      if (fse.existsSync(src)) {
        if (!dryRun) {
          let content = fs.readFileSync(src, 'utf-8');
          content = content.replace(/__HOME__/g, homeDir);
          fs.writeFileSync(agentsTarget, content, 'utf-8');
        }
        result.filesCreated++;
      }
    } else {
      result.filesSkipped++;
    }

    // 3. opencode.json (project root, only if not exists)
    const configTarget = path.join(projectDir, 'opencode.json');
    if (!fse.existsSync(configTarget)) {
      const configSrc = path.join(opencodeTemplateDir, 'opencode.json');
      if (fse.existsSync(configSrc)) {
        if (!dryRun) fs.copyFileSync(configSrc, configTarget);
        result.filesCreated++;
      }
    } else {
      result.filesSkipped++;
    }

    // 4. Tools (always copy, with __HOME__)
    const toolsSrcDir = path.join(opencodeTemplateDir, 'tools');
    const toolsDstDir = path.join(opencodeDir, 'tools');
    if (fse.existsSync(toolsSrcDir)) {
      if (!dryRun) fse.ensureDirSync(toolsDstDir);
      for (const toolFile of TOOL_FILES) {
        const src = path.join(toolsSrcDir, toolFile);
        if (fse.existsSync(src)) {
          if (!dryRun) {
            let content = fs.readFileSync(src, 'utf-8');
            content = content.replace(/__HOME__/g, homeDir);
            fs.writeFileSync(path.join(toolsDstDir, toolFile), content, 'utf-8');
          }
          result.filesCreated++;
        }
      }
    }

    // 5. Agents (frontmatter merge)
    const agentsSrcDir = path.join(opencodeTemplateDir, 'agents');
    const agentsDstDir = path.join(opencodeDir, 'agents');
    if (fse.existsSync(agentsSrcDir)) {
      if (dryRun) {
        const files = fs.readdirSync(agentsSrcDir).filter((f) => f.endsWith('.md'));
        result.agentsInstalled += files.length;
      } else {
        const agentResults = installOrMergeAgents(agentsSrcDir, agentsDstDir);
        result.agentsInstalled += agentResults.filter(
          (r) => r.status === 'COPY' || r.status === 'MERGED',
        ).length;
      }
    }

    // 6. Memory seed
    const memSrcDir = path.join(opencodeTemplateDir, 'memory');
    const memDstDir = path.join(opencodeDir, 'memory');
    if (fse.existsSync(memSrcDir)) {
      if (!dryRun) fse.ensureDirSync(memDstDir);
      for (const file of MEMORY_SEED_FILES) {
        const target = path.join(memDstDir, file);
        if (!fse.existsSync(target)) {
          const src = path.join(memSrcDir, file);
          if (fse.existsSync(src)) {
            if (!dryRun) fse.copySync(src, target);
            result.filesCreated++;
          }
        } else {
          result.filesSkipped++;
        }
      }
    }

    // 7. Permissions
    if (!dryRun && fse.existsSync(toolsDstDir)) {
      for (const toolFile of TOOL_FILES) {
        const tp = path.join(toolsDstDir, toolFile);
        if (fse.existsSync(tp)) fs.chmodSync(tp, 0o644);
      }
    }

    return result;
  }

  verify(config: AdapterInstallConfig): AdapterVerifyCheck[] {
    const projectDir = config.projectDir || process.cwd();
    return this._verifyOpenCodeInstallation(projectDir);
  }

  status(config: AdapterInstallConfig): Record<string, unknown> {
    const projectDir = config.projectDir || process.cwd();
    const checks = this._verifyOpenCodeInstallation(projectDir);
    return {
      installed: checks.every((c) => c.pass),
      adapterHome: resolveOpenCodeProjectDir(projectDir),
      projectDir,
      checks,
    };
  }

  private _verifyOpenCodeInstallation(projectDir: string): AdapterVerifyCheck[] {
    const opencodeDir = resolveOpenCodeProjectDir(projectDir);
    const checks: AdapterVerifyCheck[] = [];

    for (const file of ['AGENTS.md', 'opencode.json']) {
      const exists = fse.existsSync(path.join(projectDir, file));
      checks.push({
        name: `${file} (project root)`,
        pass: exists,
        detail: exists ? undefined : 'Missing file',
      });
    }

    for (const subdir of OPENCODE_SUBDIRS) {
      const exists = fse.existsSync(path.join(opencodeDir, subdir));
      checks.push({
        name: `.opencode/${subdir}/`,
        pass: exists,
        detail: exists ? undefined : 'Missing directory',
      });
    }

    const toolsDir = path.join(opencodeDir, 'tools');
    if (fse.existsSync(toolsDir)) {
      for (const toolFile of TOOL_FILES) {
        const exists = fse.existsSync(path.join(toolsDir, toolFile));
        checks.push({
          name: `.opencode/tools/${toolFile}`,
          pass: exists,
          detail: exists ? undefined : 'Missing tool',
        });
      }
    }

    return checks;
  }
}

// ─── Standalone API ──────────────────────────────────────────────

/**
 * Install EvoKit for OpenCode CLI.
 * Copies templates to project root and sets up .opencode/ structure.
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
 * Inject learning data into OpenCode-accessible memory.
 * Writes corrections and observations to .opencode/memory/.
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
  const opencodeDir = options.opencodeDir
    ? path.resolve(options.opencodeDir)
    : resolveOpenCodeProjectDir(projectDir);
  const memoryDir = path.join(opencodeDir, 'memory');

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
  const opencodeDir = options.opencodeDir
    ? path.resolve(options.opencodeDir)
    : resolveOpenCodeProjectDir(projectDir);
  const memoryDir = path.join(opencodeDir, 'memory');

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
  const opencodeDir = options.opencodeDir
    ? path.resolve(options.opencodeDir)
    : resolveOpenCodeProjectDir(projectDir);
  const memoryDir = path.join(opencodeDir, 'memory');

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
    result.agentsPresent = fse.existsSync(path.join(projectDir, 'AGENTS.md'));
    result.configPresent = fse.existsSync(path.join(projectDir, 'opencode.json'));

    const toolsDir = path.join(opencodeDir, 'tools');
    if (fse.existsSync(toolsDir)) {
      result.toolsPresent = fs.readdirSync(toolsDir).filter((f) => f.endsWith('.ts')).length > 0;
    }

    const agentsDir = path.join(opencodeDir, 'agents');
    if (fse.existsSync(agentsDir)) {
      result.agentCount = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')).length;
    }

    result.memoryPresent = fse.existsSync(path.join(opencodeDir, 'memory'));

    result.installed =
      result.agentsPresent || result.configPresent || result.toolsPresent;
  } catch (e) {
    return { ...result, error: (e as Error).message };
  }

  return result;
}
