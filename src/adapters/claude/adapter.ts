/**
 * EvoKit — Claude Code 适配器安装器
 *
 * @internal — Claude Code 的适配器实现。ClaudeAdapter 类实现了公共 AdapterInstaller 接口。
 *
 * 将 EvoKit 模板文件安装到 ~/.claude/（全局）+ .claude/（项目级，可选），包含完整流水线：
 * CLAUDE.md、settings.json 合并、hooks、rules、commands、agents、
 * skills 以及 memory 初始化。
 *
 * 使用声明式 `AdapterLayout` + `executeLayout()` 引擎，
 * 而非旧版布尔标志的 `installPipeline()`。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { createRequire } from 'node:module';
import {
  type AdapterInstaller,
  type AdapterInstallConfig,
  type AdapterInstallResult,
  type AdapterVerifyCheck,
  type AdapterStatus,
} from '../types.js';
import type { AdapterLayout, AdapterSection } from '../../core/layout-types.js';
import { executeLayout } from '../../core/layout-engine.js';
import { ManifestCollector } from '../../core/manifest-collector.js';
import { updateAdapterManifest } from '../../core/manifest.js';

export const CLAUDE_ADAPTER_VERSION = '0.2.0';

// ─── 常量 ─────────────────────────────────────────────────

const CLAUDE_GLOBAL_SUBDIRS = ['rules', 'commands', 'agents', 'hooks', 'memory', 'skills'] as const;
const CLAUDE_PROJECT_SUBDIRS = ['rules', 'commands', 'agents', 'skills', 'memory'] as const;
const CLAUDE_HOOK_FILES = [
  'session-start.sh',
  'pre-tool-use.sh',
  'post-tool-use.sh',
  'pre-compact.sh',
  'stop.sh',
  'export-system.sh',
] as const;

const MEMORY_SEED_FILES = [
  'README.md',
  'learned-rules.md',
  'evolution-log.md',
  'corrections.jsonl',
  'observations.jsonl',
  'violations.jsonl',
  'sessions.jsonl',
] as const;

// ─── 布局构建器 ────────────────────────────────────────────

/**
 * 构建 Claude Code 适配器安装的声明式布局。
 *
 * 支持双层安装：
 *   1. 全局：~/.claude/
 *   2. 项目（可选）：.claude/ + 项目根目录文件
 *
 * 布局使用全局目录作为 targetDir；项目级
 * 文件在其 dst/dstDir 字段中使用绝对路径。
 */
export function getLayout(opts: {
  homeDir: string;
  projectDir?: string;
  templateDir: string;
}): AdapterLayout {
  const { homeDir, projectDir, templateDir } = opts;
  const claudeDir = path.join(homeDir, '.claude');
  const claudeTemplateDir = path.join(templateDir, 'claude');

  const sections: AdapterSection[] = [];

  // ═══════════════════════════════════════════════════════════
  // GLOBAL INSTALL: ~/.claude/
  // ═══════════════════════════════════════════════════════════

  // ── 1. 目录 ──────────────────────────────────────────
  sections.push({
    type: 'dirs',
    paths: [...CLAUDE_GLOBAL_SUBDIRS],
  });

  // ── 2. CLAUDE.md（全局，复制或追加协议段落）──────────
  sections.push({
    type: 'copy',
    src: path.join(claudeTemplateDir, 'CLAUDE.md'),
    dst: path.join(homeDir, 'CLAUDE.md'),
    strategy: 'skip-if-exists',
    appendMarker: 'Self-Evolving System Protocol',
  });

  // ── 3. MEMORY.md ────────────────────────────────────
  sections.push({
    type: 'copy',
    src: path.join(claudeTemplateDir, 'MEMORY.md'),
    dst: path.join(claudeDir, 'MEMORY.md'),
    strategy: 'always',
  });

  // ── 4. settings.json（全局，合并或新建）───────────
  sections.push({
    type: 'merge-settings',
    srcPath: path.join(claudeTemplateDir, 'settings.json'),
    dstPath: path.join(claudeDir, 'settings.json'),
    replaceHome: true,
  });

  // ── 5. Hooks（全局，复制并替换 __HOME__，始终覆盖）──
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(claudeTemplateDir, 'hooks'),
    dstDir: path.join(claudeDir, 'hooks'),
    filter: '.sh',
    strategy: 'always',
    replaceHome: true,
    counter: 'hooksInstalled',
  });

  // ── 6. Rules（全局，复制，覆盖 — 升级路径）──────────
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(claudeTemplateDir, 'rules'),
    dstDir: path.join(claudeDir, 'rules'),
    filter: '.md',
    strategy: 'always',
    counter: 'rulesInstalled',
  });

  // ── 7. Commands（全局，复制，覆盖）──────────────────
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(claudeTemplateDir, 'commands'),
    dstDir: path.join(claudeDir, 'commands'),
    filter: '.md',
    strategy: 'always',
    counter: 'commandsInstalled',
  });

  // ── 8. Agents（全局，frontmatter 合并）──────────────
  sections.push({
    type: 'merge-agents',
    srcDir: path.join(claudeTemplateDir, 'agents'),
    dstDir: path.join(claudeDir, 'agents'),
  });

  // ── 9. Skills（全局）──────────────────────────────────────
  sections.push({
    type: 'copy-skills',
    srcDir: path.join(claudeTemplateDir, 'skills'),
    dstDir: path.join(claudeDir, 'skills'),
  });

  // ── 10. Memory 初始化（全局，仅在不存在时）────────
  sections.push({
    type: 'seed-memory',
    srcDir: path.join(claudeTemplateDir, 'memory'),
    dstDir: path.join(claudeDir, 'memory'),
    files: [...MEMORY_SEED_FILES],
  });

  // ═══════════════════════════════════════════════════════════
  // PROJECT INSTALL (optional): .claude/  +  project root files
  // ═══════════════════════════════════════════════════════════

  if (projectDir) {
    const claudeProjectDir = path.join(projectDir, '.claude');

    // 11. CLAUDE.md (project root, skip-if-exists, with __HOME__)
    sections.push({
      type: 'copy',
      src: path.join(claudeTemplateDir, 'CLAUDE.md'),
      dst: path.join(projectDir, 'CLAUDE.md'),
      strategy: 'skip-if-exists',
      replaceHome: true,
    });

    // 12. settings.json (project-level, merge-settings)
    sections.push({
      type: 'merge-settings',
      srcPath: path.join(claudeTemplateDir, 'settings.json'),
      dstPath: path.join(claudeProjectDir, 'settings.json'),
      replaceHome: true,
    });

    // 13. Rules (project-level, copy-dir)
    sections.push({
      type: 'copy-dir',
      srcDir: path.join(claudeTemplateDir, 'rules'),
      dstDir: path.join(claudeProjectDir, 'rules'),
      filter: '.md',
      strategy: 'always',
      counter: 'rulesInstalled',
    });

    // 14. Commands (project-level, copy-dir)
    sections.push({
      type: 'copy-dir',
      srcDir: path.join(claudeTemplateDir, 'commands'),
      dstDir: path.join(claudeProjectDir, 'commands'),
      filter: '.md',
      strategy: 'always',
      counter: 'commandsInstalled',
    });

    // 15. Agents (project-level, merge-agents)
    sections.push({
      type: 'merge-agents',
      srcDir: path.join(claudeTemplateDir, 'agents'),
      dstDir: path.join(claudeProjectDir, 'agents'),
    });

    // 16. Skills (project-level, copy-skills)
    sections.push({
      type: 'copy-skills',
      srcDir: path.join(claudeTemplateDir, 'skills'),
      dstDir: path.join(claudeProjectDir, 'skills'),
    });

    // 17. Memory seed (project-level, skip-if-exists)
    sections.push({
      type: 'seed-memory',
      srcDir: path.join(claudeTemplateDir, 'memory'),
      dstDir: path.join(claudeProjectDir, 'memory'),
      files: [...MEMORY_SEED_FILES],
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PERMISSIONS
  // ═══════════════════════════════════════════════════════════

  // 18. Hooks — executable
  sections.push({
    type: 'permissions',
    dir: path.join(claudeDir, 'hooks'),
    extension: '.sh',
    mode: 0o755,
  });

  // 19. Memory JSONL files — 600 (personal data)
  sections.push({
    type: 'permissions',
    dir: path.join(claudeDir, 'memory'),
    extension: '.jsonl',
    mode: 0o600,
  });

  return { targetDir: claudeDir, sections };
}

// ─── AdapterInstaller 实现 ───────────────────────────

export class ClaudeAdapter implements AdapterInstaller {
  readonly id = 'claude';
  readonly label = 'Claude Code';
  readonly description = '~/.claude/ + .claude/';
  readonly version = CLAUDE_ADAPTER_VERSION;
  readonly supportedAgentVersion = '>=2.1.0';

  install(config: AdapterInstallConfig): AdapterInstallResult {
    const homeDir = config.homeDir;
    const projectDir = config.projectDir;
    const templateDir = config.templateDir;
    const claudeDir = path.join(homeDir, '.claude');
    const claudeTemplateDir = path.join(templateDir, 'claude');
    const dryRun = config.dryRun ?? false;

    // 验证模板是否存在
    if (!fse.existsSync(path.join(claudeTemplateDir, 'CLAUDE.md'))) {
      throw new Error(
        `Claude 模板未找到: ${claudeTemplateDir}\n` +
          '  请确保模板目录包含 claude/ 子目录及 CLAUDE.md。',
      );
    }

    // 确保项目 .claude/ 目录存在（项目级安装时）
    if (projectDir && !dryRun) {
      fse.ensureDirSync(path.join(projectDir, '.claude'));
    }

    const collector = new ManifestCollector();
    const layout = getLayout({ homeDir, projectDir, templateDir });
    const summary = executeLayout(layout, {
      homeDir,
      dryRun,
      collector,
    });

    // 安装完成后写入清单（非 dry-run 模式）
    if (!config.dryRun) {
      const adapterManifest = collector.build({
        adapterId: this.id,
        adapterVersion: this.version,
        homeDir,
        adapterHome: claudeDir,
      });
      const pkgVersion = getEvokitVersion();
      updateAdapterManifest(homeDir, adapterManifest, pkgVersion);
    }

    return {
      filesCreated: summary.filesCreated,
      filesSkipped: summary.filesSkipped,
      hooksInstalled: summary.hooksInstalled,
      commandsInstalled: summary.commandsInstalled,
      rulesInstalled: summary.rulesInstalled,
      agentsInstalled: summary.agentsInstalled,
      adapterHome: claudeDir,
    };
  }

  verify(config: AdapterInstallConfig): AdapterVerifyCheck[] {
    return verifyClaudeInstallation(config.homeDir, config.projectDir);
  }

  status(config: AdapterInstallConfig): AdapterStatus {
    const claudeDir = path.join(config.homeDir, '.claude');
    const checks = verifyClaudeInstallation(config.homeDir, config.projectDir);
    const allPass = checks.every((c) => c.pass);

    return {
      installed: allPass,
      adapterHome: claudeDir,
      allPass,
      checks,
      projectDir: config.projectDir,
    };
  }
}

// ─── 验证 ─────────────────────────────────────────────

/**
 * 验证 Claude Code EvoKit 安装（全局 + 可选项目级）。
 */
export function verifyClaudeInstallation(
  homeDir: string,
  projectDir?: string,
): AdapterVerifyCheck[] {
  const claudeDir = path.join(homeDir, '.claude');
  const checks: AdapterVerifyCheck[] = [];

  // ── 全局检查 ──

  // 目录结构
  for (const subdir of CLAUDE_GLOBAL_SUBDIRS) {
    const exists = fse.existsSync(path.join(claudeDir, subdir));
    checks.push({
      name: `.claude/${subdir}/`,
      pass: exists,
      detail: exists ? undefined : '目录不存在',
    });
  }

  // 关键文件
  const keyFiles = [
    { name: 'CLAUDE.md', path: path.join(homeDir, 'CLAUDE.md') },
    { name: '.claude/MEMORY.md', path: path.join(claudeDir, 'MEMORY.md') },
    { name: '.claude/settings.json', path: path.join(claudeDir, 'settings.json') },
  ];
  for (const { name, path: fp } of keyFiles) {
    const exists = fse.existsSync(fp);
    checks.push({
      name,
      pass: exists,
      detail: exists ? undefined : '文件缺失',
    });
  }

  // Hook 可执行文件
  const hooksDir = path.join(claudeDir, 'hooks');
  if (fse.existsSync(hooksDir)) {
    for (const hook of CLAUDE_HOOK_FILES) {
      const hp = path.join(hooksDir, hook);
      const exists = fse.existsSync(hp);
      if (exists) {
        const stats = fs.statSync(hp);
        const executable = !!(stats.mode & 0o111);
        checks.push({
          name: `.claude/hooks/${hook}`,
          pass: executable,
          detail: executable ? undefined : '不可执行',
        });
      }
    }
  }

  // ── 项目级检查（可选）──
  if (projectDir) {
    const claudeProjectDir = path.join(projectDir, '.claude');

    // 项目根 CLAUDE.md
    const projectClaudeMdExists = fse.existsSync(path.join(projectDir, 'CLAUDE.md'));
    checks.push({
      name: 'CLAUDE.md (project root)',
      pass: projectClaudeMdExists,
      detail: projectClaudeMdExists ? undefined : '文件缺失',
    });

    // 项目级 settings.json
    checks.push({
      name: '.claude/settings.json (project)',
      pass: fse.existsSync(path.join(claudeProjectDir, 'settings.json')),
    });

    // 项目级子目录
    for (const subdir of CLAUDE_PROJECT_SUBDIRS) {
      const exists = fse.existsSync(path.join(claudeProjectDir, subdir));
      checks.push({
        name: `.claude/${subdir}/ (project)`,
        pass: exists,
        detail: exists ? undefined : '目录缺失',
      });
    }
  }

  return checks;
}

// ─── 辅助函数 ──────────────────────────────────────────

/** 从 package.json 读取 EvoKit 版本 */
function getEvokitVersion(): string {
  try {
    const require2 = createRequire(import.meta.url);
    const pkg = require2('../../../package.json') as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}
