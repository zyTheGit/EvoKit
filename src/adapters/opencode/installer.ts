/**
 * EvoKit — OpenCode CLI Installer
 *
 * Handles template installation for OpenCode:
 * - Installs global config to ~/.config/opencode/ (AGENTS.md, opencode.json, agent/, memory/, skills/)
 * - Installs project-level tools to .opencode/tools/
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

const PROJECT_SUBDIRS = ['tools', 'agent', 'memory'] as const;
const GLOBAL_DIRS = ['agent', 'memory', 'skills'] as const;
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
 * Install or merge agent files.
 */
function installAgents(srcDir: string, dstDir: string, dryRun: boolean): number {
  if (!fse.existsSync(srcDir)) return 0;
  const results = installOrMergeAgents(srcDir, dstDir, dryRun);
  return results.filter(r => r.status === 'COPY' || r.status === 'MERGED').length;
}

/**
 * Copy a file with __HOME__ placeholder replacement.
 */
function copyWithHome(src: string, dst: string, homeDir: string, dryRun: boolean): boolean {
  if (!fse.existsSync(src)) return false;
  if (!dryRun) {
    let content = fs.readFileSync(src, 'utf-8');
    content = content.replace(/__HOME__/g, homeDir);
    fse.ensureDirSync(path.dirname(dst));
    fs.writeFileSync(dst, content, 'utf-8');
  }
  return true;
}

/**
 * Install the OpenCode CLI template.
 *
 * Two levels:
 *   1. Global: ~/.config/opencode/  — AGENTS.md, opencode.json, agent/, memory/, skills/
 *   2. Project: .opencode/          — tools/, agent/ (overrides), memory/
 *   3. Project root: AGENTS.md, opencode.json (if not exists)
 */
export function installOpenCodeTemplate(config: OpenCodeInstallConfig): InstallSummary {
  const { homeDir, projectDir, templateDir, dryRun = false } = config;
  const opencodeDir = path.join(projectDir, '.opencode');
  const opencodeTemplateDir = path.join(templateDir, 'opencode');
  const globalDir = resolveOpenCodeConfigHome(homeDir);

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

  // ═══════════════════════════════════════════════════════════
  // GLOBAL INSTALL: ~/.config/opencode/
  // ═══════════════════════════════════════════════════════════

  // 1. Create global directories
  if (!dryRun) {
    fse.ensureDirSync(globalDir);
    for (const subdir of GLOBAL_DIRS) {
      fse.ensureDirSync(path.join(globalDir, subdir));
    }
  }

  // 2. AGENTS.md (global, only if not exists)
  const globalAgentsTarget = path.join(globalDir, 'AGENTS.md');
  if (!fse.existsSync(globalAgentsTarget)) {
    const src = path.join(opencodeTemplateDir, 'AGENTS.md');
    if (copyWithHome(src, globalAgentsTarget, homeDir, dryRun)) {
      summary.filesCreated++;
    }
  } else {
    summary.filesSkipped++;
  }

  // 3. opencode.json (global, only if not exists, with __HOME__ replacement)
  const globalConfigTarget = path.join(globalDir, 'opencode.json');
  if (!fse.existsSync(globalConfigTarget)) {
    const src = path.join(opencodeTemplateDir, 'opencode.json');
    if (copyWithHome(src, globalConfigTarget, homeDir, dryRun)) {
      summary.filesCreated++;
    }
  } else {
    summary.filesSkipped++;
  }

  // 4. Agent definitions (global ~/.config/opencode/agent/)
  const agentSrcDir = path.join(opencodeTemplateDir, 'agent');
  const globalAgentDir = path.join(globalDir, 'agent');
  summary.agentsInstalled += installAgents(agentSrcDir, globalAgentDir, !!dryRun);

  // 5. Memory seed (global, only if not exists)
  const memSrcDir = path.join(opencodeTemplateDir, 'memory');
  const globalMemDir = path.join(globalDir, 'memory');
  if (fse.existsSync(memSrcDir)) {
    if (!dryRun) fse.ensureDirSync(globalMemDir);
    for (const memFile of MEMORY_SEED_FILES) {
      const target = path.join(globalMemDir, memFile);
      if (!fse.existsSync(target)) {
        const src = path.join(memSrcDir, memFile);
        if (fse.existsSync(src)) {
          if (!dryRun) fse.copySync(src, target);
          summary.filesCreated++;
        }
      } else {
        summary.filesSkipped++;
      }
    }
  }

  // 6. Skills (seed)
  const skillsSrcDir = path.join(opencodeTemplateDir, 'skills');
  const skillsDstDir = path.join(globalDir, 'skills');
  if (fse.existsSync(skillsSrcDir)) {
    if (!dryRun) fse.ensureDirSync(skillsDstDir);
    for (const entry of fs.readdirSync(skillsSrcDir)) {
      const src = path.join(skillsSrcDir, entry);
      const dst = path.join(skillsDstDir, entry);
      if (!dryRun && fse.statSync(src).isFile()) {
        fse.copySync(src, dst);
        summary.filesCreated++;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PROJECT INSTALL: .opencode/  +  project root files
  // ═══════════════════════════════════════════════════════════

  // 7. Create project subdirectories
  if (!dryRun) {
    fse.ensureDirSync(opencodeDir);
    for (const subdir of PROJECT_SUBDIRS) {
      fse.ensureDirSync(path.join(opencodeDir, subdir));
    }
  }

  // 8. AGENTS.md (project root, only if not exists)
  const agentsTarget = path.join(projectDir, 'AGENTS.md');
  if (!fse.existsSync(agentsTarget)) {
    const src = path.join(opencodeTemplateDir, 'AGENTS.md');
    if (copyWithHome(src, agentsTarget, homeDir, dryRun)) {
      summary.filesCreated++;
    }
  } else {
    summary.filesSkipped++;
  }

  // 9. opencode.json (project root, only if not exists, with __HOME__)
  const configTarget = path.join(projectDir, 'opencode.json');
  if (!fse.existsSync(configTarget)) {
    const configSrc = path.join(opencodeTemplateDir, 'opencode.json');
    if (copyWithHome(configSrc, configTarget, homeDir, dryRun)) {
      summary.filesCreated++;
    }
  } else {
    summary.filesSkipped++;
  }

  // 10. Tools (always copy — upgrade path, with __HOME__)
  const toolsSrcDir = path.join(opencodeTemplateDir, 'tools');
  const toolsDstDir = path.join(opencodeDir, 'tools');
  if (fse.existsSync(toolsSrcDir)) {
    if (!dryRun) fse.ensureDirSync(toolsDstDir);
    for (const toolFile of TOOL_FILES) {
      const src = path.join(toolsSrcDir, toolFile);
      if (fse.existsSync(src)) {
        const dst = path.join(toolsDstDir, toolFile);
        if (copyWithHome(src, dst, homeDir, dryRun)) {
          summary.filesCreated++;
        }
      }
    }
  }

  // 11. Project-level agents (merge, path .opencode/agent/)
  const projectAgentDir = path.join(opencodeDir, 'agent');
  summary.agentsInstalled += installAgents(agentSrcDir, projectAgentDir, !!dryRun);

  // 12. Project-level memory seed (only if not exists)
  const projectMemDir = path.join(opencodeDir, 'memory');
  if (fse.existsSync(memSrcDir)) {
    if (!dryRun) fse.ensureDirSync(projectMemDir);
    for (const memFile of MEMORY_SEED_FILES) {
      const target = path.join(projectMemDir, memFile);
      if (!fse.existsSync(target)) {
        const src = path.join(memSrcDir, memFile);
        if (fse.existsSync(src)) {
          if (!dryRun) fse.copySync(src, target);
          summary.filesCreated++;
        }
      } else {
        summary.filesSkipped++;
      }
    }
  }

  // 13. Permissions
  if (!dryRun) {
    // Tools — readable
    if (fse.existsSync(toolsDstDir)) {
      for (const toolFile of TOOL_FILES) {
        const tp = path.join(toolsDstDir, toolFile);
        if (fse.existsSync(tp)) fs.chmodSync(tp, 0o644);
      }
    }
    // Global memory JSONL files — 600 (personal data)
    if (fse.existsSync(globalMemDir)) {
      for (const file of fs.readdirSync(globalMemDir)) {
        if (file.endsWith('.jsonl')) {
          fs.chmodSync(path.join(globalMemDir, file), 0o600);
        }
      }
    }
  }

  return summary;
}

/**
 * Verify an OpenCode EvoKit installation (both global and project).
 */
export function verifyOpenCodeInstallation(
  projectDir: string,
  homeDir: string,
): Array<{ name: string; pass: boolean; detail?: string }> {
  const opencodeDir = path.join(projectDir, '.opencode');
  const globalDir = resolveOpenCodeConfigHome(homeDir);
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];

  // Global config
  checks.push({
    name: '~/.config/opencode/AGENTS.md (global)',
    pass: fse.existsSync(path.join(globalDir, 'AGENTS.md')),
  });
  checks.push({
    name: '~/.config/opencode/opencode.json (global)',
    pass: fse.existsSync(path.join(globalDir, 'opencode.json')),
  });
  for (const subdir of GLOBAL_DIRS) {
    checks.push({
      name: `~/.config/opencode/${subdir}/`,
      pass: fse.existsSync(path.join(globalDir, subdir)),
    });
  }

  // Project root files
  for (const file of ['AGENTS.md', 'opencode.json']) {
    const exists = fse.existsSync(path.join(projectDir, file));
    checks.push({
      name: `${file} (project root)`,
      pass: exists,
      detail: exists ? undefined : 'Missing file',
    });
  }

  // Project subdirectories
  for (const subdir of PROJECT_SUBDIRS) {
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

  // Agent files (global)
  const globalAgentDir = path.join(globalDir, 'agent');
  if (fse.existsSync(globalAgentDir)) {
    for (const agentFile of AGENT_FILES) {
      const exists = fse.existsSync(path.join(globalAgentDir, agentFile));
      checks.push({
        name: `~/.config/opencode/agent/${agentFile}`,
        pass: exists,
        detail: exists ? undefined : 'Missing agent definition',
      });
    }
  }

  // Global memory directory
  const globalMemDir = path.join(globalDir, 'memory');
  checks.push({
    name: `~/.config/opencode/memory/`,
    pass: true,
    detail: fse.existsSync(globalMemDir) ? undefined : 'Not yet created (auto-created on first memory write)',
  });

  return checks;
}
