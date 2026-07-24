/**
 * EvoKit — Claude Code 适配器安装器
 *
 * @internal — Claude Code 的适配器实现。继承 BaseAdapter 基类，
 * 仅声明 Claude 特有的路径解析、布局构建和验证逻辑。
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

import type { AdapterInstallConfig, AdapterVerifyCheck } from '../types.js';
import type { AdapterLayout, AdapterSection } from '../../core/layout-types.js';
import type { HeuristicConfig } from '../base-adapter.js';
import { BaseAdapter } from '../base-adapter.js';

export const CLAUDE_ADAPTER_VERSION = '0.2.0';

// ─── 常量 ─────────────────────────────────────────────────

const CLAUDE_GLOBAL_SUBDIRS = ['rules', 'commands', 'agents', 'hooks', 'memory', 'skills'] as const;
const CLAUDE_PROJECT_SUBDIRS = ['rules', 'commands', 'agents', 'skills', 'memory'] as const;
const CLAUDE_HOOK_FILES = ['session-start.sh', 'stop.sh', 'export-system.sh'] as const;

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
  allowWorkflow?: boolean;
}): AdapterLayout {
  const { homeDir, projectDir, templateDir, allowWorkflow = false } = opts;
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
    allowWorkflow,
  });

  // ── 5. Hooks（全局，复制并替换 __HOME__，始终覆盖）──
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(claudeTemplateDir, 'hooks'),
    dstDir: path.join(claudeDir, 'hooks'),
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

// ─── ClaudeAdapter ─────────────────────────────────────

export class ClaudeAdapter extends BaseAdapter {
  readonly id = 'claude';
  readonly label = 'Claude Code';
  readonly description = '~/.claude/ + .claude/';
  readonly version = CLAUDE_ADAPTER_VERSION;
  readonly supportedAgentVersion = '>=2.1.0';

  // ── BaseAdapter 抽象实现 ──

  protected override get templateEntryPoint(): string {
    return 'CLAUDE.md';
  }

  protected override get projectSubdir(): string {
    return '.claude';
  }

  resolveHome(homeDir: string): string {
    return path.join(homeDir, '.claude');
  }

  // ── 卸载相关覆盖 ──

  override getHeuristicConfig(adapterHome: string): HeuristicConfig {
    return {
      configFiles: ['settings.json'],
      cognitiveCorePath: path.join(path.dirname(adapterHome), 'CLAUDE.md'),
      knownDirs: [
        { name: 'hooks', extension: '.sh' },
        { name: 'rules', extension: '.md' },
        { name: 'commands', extension: '.md' },
        { name: 'agents', extension: '.md' },
      ],
      skillsDir: path.join(adapterHome, 'skills'),
    };
  }

  override reverseMergesSettings(): boolean {
    return true;
  }

  override cognitiveCoreAppendMarker(): string | null {
    return 'Self-Evolving System Protocol';
  }

  protected buildLayout(opts: {
    homeDir: string;
    projectDir?: string;
    templateDir: string;
    allowWorkflow?: boolean;
  }): AdapterLayout {
    return getLayout(opts);
  }

  protected verifyChecks(config: AdapterInstallConfig): AdapterVerifyCheck[] {
    return verifyClaudeInstallation(config.homeDir, config.projectDir);
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
