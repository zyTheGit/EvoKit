/**
 * EvoKit — Claude Code 适配器安装器
 *
 * @internal — Claude Code 的适配器实现。ClaudeAdapter 类实现了公共 AdapterInstaller 接口。
 *
 * 将 EvoKit 模板文件安装到 ~/.claude/，包含完整流水线：
 * CLAUDE.md、settings.json 合并、hooks、rules、commands、agents、
 * skills 以及 memory 初始化。
 *
 * 使用声明式 `AdapterLayout` + `executeLayout()` 引擎，
 * 而非旧版布尔标志的 `installPipeline()`。
 *
 * @packageDocumentation
 */

import path from 'node:path';
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
import { verifyInstallation } from '../../core/template.js';
import { ManifestCollector } from '../../core/manifest-collector.js';
import { updateAdapterManifest } from '../../core/manifest.js';

export const CLAUDE_ADAPTER_VERSION = '0.2.0';

// ─── 常量 ─────────────────────────────────────────────────

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
 * 替代旧版 template.ts 中的 `buildClaudeLayout()` —
 * 每个适配器现在拥有自己的布局定义。
 */
export function getLayout(opts: {
  homeDir: string;
  templateDir: string;
  targetDir: string;
}): AdapterLayout {
  const { homeDir, templateDir, targetDir } = opts;
  const claudeTemplateDir = path.join(templateDir, 'claude');

  const sections: AdapterSection[] = [];

  // ── 1. 目录 ──────────────────────────────────────────
  sections.push({
    type: 'dirs',
    paths: ['rules', 'commands', 'agents', 'hooks', 'memory', 'skills'],
  });

  // ── 2. CLAUDE.md（复制或追加协议段落）──────────
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
    dst: path.join(targetDir, 'MEMORY.md'),
    strategy: 'always',
  });

  // ── 4. settings.json（合并或新建）───────────
  sections.push({
    type: 'merge-settings',
    srcPath: path.join(claudeTemplateDir, 'settings.json'),
    dstPath: path.join(targetDir, 'settings.json'),
    replaceHome: true,
  });

  // ── 5. Hooks（复制并替换 __HOME__，始终覆盖）──
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(claudeTemplateDir, 'hooks'),
    dstDir: path.join(targetDir, 'hooks'),
    filter: '.sh',
    strategy: 'always',
    replaceHome: true,
    counter: 'hooksInstalled',
  });

  // ── 6. Rules（复制，覆盖 — 升级路径）──────────
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(claudeTemplateDir, 'rules'),
    dstDir: path.join(targetDir, 'rules'),
    filter: '.md',
    strategy: 'always',
    counter: 'rulesInstalled',
  });

  // ── 7. Commands（复制，覆盖）──────────────────
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(claudeTemplateDir, 'commands'),
    dstDir: path.join(targetDir, 'commands'),
    filter: '.md',
    strategy: 'always',
    counter: 'commandsInstalled',
  });

  // ── 8. Agents（frontmatter 合并）──────────────
  sections.push({
    type: 'merge-agents',
    srcDir: path.join(claudeTemplateDir, 'agents'),
    dstDir: path.join(targetDir, 'agents'),
  });

  // ── 9. Skills ───────────────────────────────────────
  sections.push({
    type: 'copy-skills',
    srcDir: path.join(claudeTemplateDir, 'skills'),
    dstDir: path.join(targetDir, 'skills'),
  });

  // ── 10. Memory 初始化（仅在不存在时）────────
  sections.push({
    type: 'seed-memory',
    srcDir: path.join(claudeTemplateDir, 'memory'),
    dstDir: path.join(targetDir, 'memory'),
    files: [...MEMORY_SEED_FILES],
  });

  // ── 11. 权限 ─────────────────────────────────────
  sections.push({
    type: 'permissions',
    dir: path.join(targetDir, 'hooks'),
    extension: '.sh',
    mode: 0o755,
  });
  sections.push({
    type: 'permissions',
    dir: path.join(targetDir, 'memory'),
    extension: '.jsonl',
    mode: 0o600,
  });

  return { targetDir, sections };
}

// ─── AdapterInstaller 实现 ───────────────────────────

export class ClaudeAdapter implements AdapterInstaller {
  readonly id = 'claude';
  readonly label = 'Claude Code';
  readonly description = '~/.claude/';
  readonly version = CLAUDE_ADAPTER_VERSION;

  install(config: AdapterInstallConfig): AdapterInstallResult {
    const claudeDir = path.join(config.homeDir, '.claude');
    const collector = new ManifestCollector();
    const layout = getLayout({
      homeDir: config.homeDir,
      templateDir: config.templateDir,
      targetDir: claudeDir,
    });

    const summary = executeLayout(layout, {
      homeDir: config.homeDir,
      dryRun: config.dryRun ?? false,
      collector,
    });

    // 安装完成后写入清单（非 dry-run 模式）
    if (!config.dryRun) {
      const adapterManifest = collector.build({
        adapterId: this.id,
        adapterVersion: this.version,
        homeDir: config.homeDir,
        adapterHome: claudeDir,
      });
      // 从 package.json 读取 evokitVersion
      const pkgVersion = getEvokitVersion();
      updateAdapterManifest(config.homeDir, adapterManifest, pkgVersion);
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
    return verifyInstallation(config.homeDir).map((c) => ({
      name: c.name,
      pass: c.pass,
      detail: c.detail,
    }));
  }

  status(config: AdapterInstallConfig): AdapterStatus {
    const claudeDir = path.join(config.homeDir, '.claude');
    const checks = verifyInstallation(config.homeDir);
    const allPass = checks.every((c) => c.pass);

    return {
      installed: allPass,
      adapterHome: claudeDir,
      allPass,
      checks,
    };
  }
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
