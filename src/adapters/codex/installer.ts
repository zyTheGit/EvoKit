/**
 * EvoKit — Codex CLI Installer
 *
 * Handles template installation for Codex CLI:
 * - Copies template/codex/ to ~/.codex/
 * - Replaces __HOME__ placeholders with actual home path
 * - Sets file permissions for hook scripts
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { InstallSummary, CodexInstallConfig } from '../../core/types.js';
import { resolveCodexHome } from './adapter.js';

const CODEX_SUBDIRS = ['rules', 'hooks-scripts', 'memory'] as const;
const HOOK_SCRIPTS = ['session-start.sh', 'stop.sh', 'pre-tool-use.sh'] as const;
const MEMORY_SEED_FILES = ['README.md'] as const;

/**
 * Install the Codex CLI template to ~/.codex/.
 */
export function installCodexTemplate(config: CodexInstallConfig): InstallSummary {
  const { homeDir, templateDir, dryRun = false } = config;
  const codexHome = resolveCodexHome(homeDir);
  const codexTemplateDir = path.join(templateDir, 'codex');

  const summary: InstallSummary = {
    homeDir,
    filesCreated: 0,
    filesSkipped: 0,
    hooksInstalled: 0,
    commandsInstalled: 0,
    rulesInstalled: 0,
    agentsInstalled: 0,
  };

  if (!fse.existsSync(path.join(codexTemplateDir, 'AGENTS.md'))) {
    throw new Error(
      `Codex template not found at: ${codexTemplateDir}\n` +
        '  Ensure the template directory contains a codex/ subdirectory with AGENTS.md.',
    );
  }

  // 1. Create directories
  if (!dryRun) {
    fse.ensureDirSync(codexHome);
    for (const subdir of CODEX_SUBDIRS) {
      fse.ensureDirSync(path.join(codexHome, subdir));
    }
  }

  // 2. AGENTS.md (only if not exists)
  const agentsTarget = path.join(codexHome, 'AGENTS.md');
  if (!fse.existsSync(agentsTarget)) {
    const src = path.join(codexTemplateDir, 'AGENTS.md');
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

  // 3. hooks.json (always copy — upgrade path, with __HOME__ replacement)
  const hooksSrc = path.join(codexTemplateDir, 'hooks.json');
  if (fse.existsSync(hooksSrc)) {
    if (!dryRun) {
      let content = fs.readFileSync(hooksSrc, 'utf-8');
      content = content.replace(/__HOME__/g, homeDir);
      fs.writeFileSync(path.join(codexHome, 'hooks.json'), content, 'utf-8');
    }
    summary.filesCreated++;
  }

  // 4. config.toml (only if not exists)
  const configTarget = path.join(codexHome, 'config.toml');
  if (!fse.existsSync(configTarget)) {
    const configSrc = path.join(codexTemplateDir, 'config.toml');
    if (fse.existsSync(configSrc)) {
      if (!dryRun) {
        fs.copyFileSync(configSrc, configTarget);
      }
      summary.filesCreated++;
    }
  } else {
    summary.filesSkipped++;
  }

  // 5. Rules (always copy — upgrade path)
  const rulesSrcDir = path.join(codexTemplateDir, 'rules');
  const rulesDstDir = path.join(codexHome, 'rules');
  if (fse.existsSync(rulesSrcDir)) {
    const ruleFiles = fs.readdirSync(rulesSrcDir).filter((f) => f.endsWith('.rules'));
    if (!dryRun) {
      for (const file of ruleFiles) {
        fse.copySync(path.join(rulesSrcDir, file), path.join(rulesDstDir, file));
      }
    }
    summary.rulesInstalled += ruleFiles.length;
  }

  // 6. Hook scripts (always copy, with __HOME__ replacement)
  const hooksScriptsSrc = path.join(codexTemplateDir, 'hooks-scripts');
  const hooksScriptsDst = path.join(codexHome, 'hooks-scripts');
  if (fse.existsSync(hooksScriptsSrc)) {
    if (!dryRun) {
      fse.ensureDirSync(hooksScriptsDst);
      for (const script of HOOK_SCRIPTS) {
        const src = path.join(hooksScriptsSrc, script);
        if (fse.existsSync(src)) {
          let content = fs.readFileSync(src, 'utf-8');
          content = content.replace(/__HOME__/g, homeDir);
          fs.writeFileSync(path.join(hooksScriptsDst, script), content, 'utf-8');
        }
      }
    }
    summary.hooksInstalled += HOOK_SCRIPTS.length;
  }

  // 7. Memory seed files (only if not exists)
  const memSrcDir = path.join(codexTemplateDir, 'memory');
  const memDstDir = path.join(codexHome, 'memory');
  if (fse.existsSync(memSrcDir)) {
    if (!dryRun) {
      fse.ensureDirSync(memDstDir);
      for (const file of MEMORY_SEED_FILES) {
        const target = path.join(memDstDir, file);
        if (!fse.existsSync(target)) {
          const src = path.join(memSrcDir, file);
          if (fse.existsSync(src)) {
            fse.copySync(src, target);
            summary.filesCreated++;
          }
        } else {
          summary.filesSkipped++;
        }
      }
    }
  }

  // 8. Set permissions (hook scripts: executable)
  if (!dryRun) {
    for (const script of HOOK_SCRIPTS) {
      const sp = path.join(hooksScriptsDst, script);
      if (fse.existsSync(sp)) {
        fs.chmodSync(sp, 0o755);
      }
    }
  }

  return summary;
}

/**
 * Verify a Codex CLI EvoKit installation.
 */
export function verifyCodexInstallation(codexHome: string): Array<{
  name: string;
  pass: boolean;
  detail?: string;
}> {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];

  // Core files
  for (const file of ['AGENTS.md', 'hooks.json', 'config.toml']) {
    const exists = fse.existsSync(path.join(codexHome, file));
    checks.push({
      name: `.codex/${file}`,
      pass: exists,
      detail: exists ? undefined : 'Missing file',
    });
  }

  // Subdirectories
  for (const subdir of CODEX_SUBDIRS) {
    const exists = fse.existsSync(path.join(codexHome, subdir));
    checks.push({
      name: `.codex/${subdir}/`,
      pass: exists,
      detail: exists ? undefined : 'Missing directory',
    });
  }

  // Hook scripts (executable)
  const hooksDir = path.join(codexHome, 'hooks-scripts');
  if (fse.existsSync(hooksDir)) {
    for (const script of HOOK_SCRIPTS) {
      const sp = path.join(hooksDir, script);
      const exists = fse.existsSync(sp);
      if (exists) {
        const stats = fs.statSync(sp);
        const executable = !!(stats.mode & 0o111);
        checks.push({
          name: `.codex/hooks-scripts/${script}`,
          pass: executable,
          detail: executable ? undefined : 'Not executable',
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

  // Rules
  const rulesDir = path.join(codexHome, 'rules');
  if (fse.existsSync(rulesDir)) {
    const ruleFiles = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.rules'));
    checks.push({
      name: `.codex/rules/ (${ruleFiles.length} files)`,
      pass: ruleFiles.length > 0,
      detail: ruleFiles.length > 0 ? undefined : 'No .rules files found',
    });
  }

  // Codex memory directory
  const codexMemory = path.join(codexHome, 'memory');
  const hasCodexMemory = fse.existsSync(codexMemory);
  checks.push({
    name: `.codex/memory/`,
    pass: true,
    detail: hasCodexMemory ? undefined : 'Not yet created (auto-created on first memory write)',
  });

  return checks;
}
