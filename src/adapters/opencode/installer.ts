/**
 * EvoKit — OpenCode CLI Installer
 *
 * Handles template installation for OpenCode:
 * - Copies template/opencode/ to .opencode/ in the project root
 * - Places AGENTS.md and opencode.json in the project root
 * - Replaces __HOME__ placeholders with actual home path
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { installOrMergeAgents } from '../../core/merge-agents.js';
import type { InstallSummary, OpenCodeInstallConfig } from '../../core/types.js';
import { resolveOpenCodeProjectDir } from './adapter.js';

const OPENCODE_SUBDIRS = ['tools', 'agents', 'memory'] as const;
const TOOL_FILES = ['evokit-boot.ts', 'evokit-evolve.ts', 'evokit-memory.ts', 'evokit-session.ts'] as const;
const AGENT_FILES = ['architect.md', 'reviewer.md'] as const;
const MEMORY_SEED_FILES = ['README.md'] as const;

/**
 * Resolve OpenCode global config directory.
 * Respects XDG_CONFIG_HOME, defaults to ~/.config/opencode/.
 */
export function resolveOpenCodeConfigHome(homeDir: string): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, 'opencode');
  }
  return path.join(homeDir, '.config', 'opencode');
}

/**
 * Install or merge agent files (uses TS helper, no more child_process / .cjs).
 */
function installOpenCodeAgents(srcDir: string, dstDir: string, dryRun: boolean): number {
  if (!fse.existsSync(srcDir)) return 0;
  const results = installOrMergeAgents(srcDir, dstDir, dryRun);
  return results.filter(r => r.status === 'COPY' || r.status === 'MERGED').length;
}

/**
 * Install the OpenCode CLI template to the project.
 */
export function installOpenCodeTemplate(config: OpenCodeInstallConfig): InstallSummary {
  const { homeDir, projectDir, templateDir, dryRun = false } = config;
  const opencodeDir = resolveOpenCodeProjectDir(projectDir);
  const opencodeTemplateDir = path.join(templateDir, 'opencode');

  const summary: InstallSummary = {
    homeDir,
    filesCreated: 0,
    filesSkipped: 0,
    hooksInstalled: 0,
    commandsInstalled: 0,
    rulesInstalled: 0,
    agentsInstalled: 0,
  };

  if (!fse.existsSync(path.join(opencodeTemplateDir, 'AGENTS.md'))) {
    throw new Error(
      `OpenCode template not found at: ${opencodeTemplateDir}\n` +
        '  Ensure the template directory contains an opencode/ subdirectory with AGENTS.md.',
    );
  }

  // ── 1. Create subdirectories ──────────────────────────────────
  if (!dryRun) {
    fse.ensureDirSync(opencodeDir);
    for (const subdir of OPENCODE_SUBDIRS) {
      fse.ensureDirSync(path.join(opencodeDir, subdir));
    }
  }

  // ── 2. AGENTS.md (project root, only if not exists) ──────────
  const agentsTarget = path.join(projectDir, 'AGENTS.md');
  if (!fse.existsSync(agentsTarget)) {
    const src = path.join(opencodeTemplateDir, 'AGENTS.md');
    if (fse.existsSync(src)) {
      if (!dryRun) {
        let content = fs.readFileSync(src, 'utf-8');
        content = content.replace(/__HOME__/g, homeDir);
        fs.writeFileSync(agentsTarget, content, 'utf-8');
      }
      summary.filesCreated++;
    }
  } else {
    summary.filesSkipped++;
  }

  // ── 3. opencode.json (project root, only if not exists) ──────
  const configTarget = path.join(projectDir, 'opencode.json');
  if (!fse.existsSync(configTarget)) {
    const configSrc = path.join(opencodeTemplateDir, 'opencode.json');
    if (fse.existsSync(configSrc)) {
      if (!dryRun) {
        fs.copyFileSync(configSrc, configTarget);
      }
      summary.filesCreated++;
    }
  } else {
    summary.filesSkipped++;
  }

  // ── 4. Tools (always copy — upgrade path, with __HOME__) ─────
  const toolsSrcDir = path.join(opencodeTemplateDir, 'tools');
  const toolsDstDir = path.join(opencodeDir, 'tools');
  if (fse.existsSync(toolsSrcDir)) {
    if (!dryRun) {
      fse.ensureDirSync(toolsDstDir);
    }
    for (const toolFile of TOOL_FILES) {
      const src = path.join(toolsSrcDir, toolFile);
      if (fse.existsSync(src)) {
        const dst = path.join(toolsDstDir, toolFile);
        if (!dryRun) {
          let content = fs.readFileSync(src, 'utf-8');
          content = content.replace(/__HOME__/g, homeDir);
          fs.writeFileSync(dst, content, 'utf-8');
        }
        summary.filesCreated++;
      }
    }
  }

  // ── 5. Agents (merge frontmatter if exists, otherwise fresh copy) ──
  const agentsSrcDir = path.join(opencodeTemplateDir, 'agents');
  const agentsDstDir = path.join(opencodeDir, 'agents');
  summary.agentsInstalled += installOpenCodeAgents(agentsSrcDir, agentsDstDir, !!dryRun);

  // ── 6. Memory seed files (only if not exists) ────────────────
  const memSrcDir = path.join(opencodeTemplateDir, 'memory');
  const memDstDir = path.join(opencodeDir, 'memory');
  if (fse.existsSync(memSrcDir)) {
    if (!dryRun) {
      fse.ensureDirSync(memDstDir);
    }
    for (const memFile of MEMORY_SEED_FILES) {
      const target = path.join(memDstDir, memFile);
      if (!fse.existsSync(target)) {
        const src = path.join(memSrcDir, memFile);
        if (fse.existsSync(src)) {
          if (!dryRun) {
            fse.copySync(src, target);
            summary.filesCreated++;
          }
        }
      } else {
        summary.filesSkipped++;
      }
    }
  }

  // ── 7. Set permissions ──────────────────────────────────────
  if (!dryRun) {
    // Tools are TypeScript — readable
    if (fse.existsSync(toolsDstDir)) {
      for (const toolFile of TOOL_FILES) {
        const tp = path.join(toolsDstDir, toolFile);
        if (fse.existsSync(tp)) {
          fs.chmodSync(tp, 0o644);
        }
      }
    }
    // Memory JSONL files — 600 (personal data)
    // (created on first write, not here)
  }

  return summary;
}

/**
 * Verify an OpenCode EvoKit installation.
 */
export function verifyOpenCodeInstallation(
  projectDir: string,
): Array<{ name: string; pass: boolean; detail?: string }> {
  const opencodeDir = resolveOpenCodeProjectDir(projectDir);
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];

  // Core files in project root
  for (const file of ['AGENTS.md', 'opencode.json']) {
    const exists = fse.existsSync(path.join(projectDir, file));
    checks.push({
      name: `${file} (project root)`,
      pass: exists,
      detail: exists ? undefined : 'Missing file',
    });
  }

  // OpenCode subdirectories
  for (const subdir of OPENCODE_SUBDIRS) {
    const exists = fse.existsSync(path.join(opencodeDir, subdir));
    checks.push({
      name: `.opencode/${subdir}/`,
      pass: exists,
      detail: exists ? undefined : 'Missing directory',
    });
  }

  // Tool files
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

  // Agent files
  const agentsDir = path.join(opencodeDir, 'agents');
  if (fse.existsSync(agentsDir)) {
    for (const agentFile of AGENT_FILES) {
      const exists = fse.existsSync(path.join(agentsDir, agentFile));
      checks.push({
        name: `.opencode/agents/${agentFile}`,
        pass: exists,
        detail: exists ? undefined : 'Missing agent definition',
      });
    }
  }

  // Memory directory
  const memoryDir = path.join(opencodeDir, 'memory');
  const hasMemory = fse.existsSync(memoryDir);
  checks.push({
    name: `.opencode/memory/`,
    pass: true,
    detail: hasMemory ? undefined : 'Not yet created (auto-created on first memory write)',
  });

  return checks;
}
