/**
 * EvoKit — 模板安装管道
 *
 * EvoKit 模板的安装引擎。提供统一的
 * `installPipeline()` 处理目录、文件、__HOME__ 替换、
 * settings 合并、agent frontmatter 合并、内存种子和权限设置。
 *
 * 内部地，`installPipeline()` 从 profile/exclude 选项构建声明式
 * `AdapterLayout` 并委托给 `executeLayout()`。
 * 未来的适配器可以直接构建自己的布局，跳过标志位。
 *
 * 此文件还保留了 `installTemplate()` 和 `verifyInstallation()`
 * 以保持向后兼容。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { setHookPermissions, setMemoryPermissions } from './permissions.js';
import type { InstallSummary } from './types.js';
import type { AdapterLayout, AdapterSection } from './layout-types.js';
import { executeLayout } from './layout-engine.js';

export interface BootCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

// ─── 配置文件类型 ─────────────────────────────────────────────

/** 安装配置文件预设。 */
export type InstallProfile = 'full' | 'minimal' | 'upgrade';

/** 可安装的组件名称 — 与 `exclude` 配合使用以排除某项。 */
export type InstallComponent =
  | 'claude-md'
  | 'memory-md'
  | 'settings'
  | 'hooks'
  | 'rules'
  | 'commands'
  | 'agents'
  | 'skills'
  | 'seed-memory';

export interface InstallPipelineOptions {
  homeDir: string;
  templateDir: string;
  targetDir: string;
  dryRun?: boolean;
  /** 安装配置文件 — 默认为 'full'。 */
  profile?: InstallProfile;
  /** 要从配置文件中排除的组件。 */
  exclude?: InstallComponent[];
  /**
   * @deprecated 请使用 `profile` + `exclude` 替代。
   * 保留旧布尔标志用于向后兼容。
   * 如果显式设置了任何旧标志，将覆盖配置文件。
   */
  installClaudeMd?: boolean;
  installMemoryMd?: boolean;
  installSettings?: boolean;
  installHooks?: boolean;
  installRules?: boolean;
  installCommands?: boolean;
  installAgents?: boolean;
  installSkills?: boolean;
  seedMemory?: boolean;
}

// ─── Profile resolution ────────────────────────────────────────

/** 完整配置文件：安装所有内容。 */
const FULL_COMPONENTS: Set<InstallComponent> = new Set([
  'claude-md',
  'memory-md',
  'settings',
  'hooks',
  'rules',
  'commands',
  'agents',
  'skills',
  'seed-memory',
]);

/** 最小配置文件：仅安装基本运行所需的核心文件。 */
const MINIMAL_COMPONENTS: Set<InstallComponent> = new Set([
  'claude-md',
  'settings',
  'hooks',
  'seed-memory',
]);

/** 升级配置文件：始终覆盖 hooks/settings，其余内容跳过已存在的。 */
const UPGRADE_COMPONENTS: Set<InstallComponent> = new Set([
  'claude-md',
  'memory-md',
  'settings',
  'hooks',
  'rules',
  'commands',
  'agents',
  'skills',
  'seed-memory',
]);

const PROFILE_MAP: Record<InstallProfile, Set<InstallComponent>> = {
  full: FULL_COMPONENTS,
  minimal: MINIMAL_COMPONENTS,
  upgrade: UPGRADE_COMPONENTS,
};

/**
 * 从 profile + exclude + 旧标志中解析有效组件集。
 *
 * 优先级：
 * 1. 如果显式设置了任何旧布尔标志（不是 undefined），使用旧模式。
 * 2. 否则使用 profile（默认 'full'）减去 exclude 列表。
 */
function resolveComponents(opts: InstallPipelineOptions): {
  components: Set<InstallComponent>;
  /** 是否对 hooks/settings 使用 'upgrade' 策略（始终覆盖）。 */
  upgradeMode: boolean;
} {
  // 检查是否有显式设置的旧标志
  const hasLegacyFlags =
    opts.installClaudeMd !== undefined ||
    opts.installMemoryMd !== undefined ||
    opts.installSettings !== undefined ||
    opts.installHooks !== undefined ||
    opts.installRules !== undefined ||
    opts.installCommands !== undefined ||
    opts.installAgents !== undefined ||
    opts.installSkills !== undefined ||
    opts.seedMemory !== undefined;

  if (hasLegacyFlags) {
    // 旧模式：每个标志直接控制其组件
    const components = new Set<InstallComponent>();
    if (opts.installClaudeMd !== false) components.add('claude-md');
    if (opts.installMemoryMd !== false) components.add('memory-md');
    if (opts.installSettings !== false) components.add('settings');
    if (opts.installHooks !== false) components.add('hooks');
    if (opts.installRules !== false) components.add('rules');
    if (opts.installCommands !== false) components.add('commands');
    if (opts.installAgents !== false) components.add('agents');
    if (opts.installSkills !== false) components.add('skills');
    if (opts.seedMemory !== false) components.add('seed-memory');
    return { components, upgradeMode: false };
  }

  // 配置文件模式
  const profile = opts.profile ?? 'full';
  const base = PROFILE_MAP[profile];
  const exclude = opts.exclude ?? [];
  const components = new Set(base);
  for (const c of exclude) {
    components.delete(c);
  }

  return { components, upgradeMode: profile === 'upgrade' };
}

// ─── 常量 ─────────────────────────────────────────────────

const MEMORY_SEED_FILES = ['README.md', 'evokit/knowledge-index.md'] as const;

const CLAUDE_SUBDIRS = ['rules', 'agents', 'commands', 'memory', 'hooks'] as const;
const HOOK_FILES = ['session-start.sh', 'stop.sh'] as const;

// ─── 管道 ─────────────────────────────────────────────────

/**
 * 从 profile/exclude 或旧式布尔标志选项构建 `AdapterLayout`。
 *
 * 这是 `InstallPipelineOptions` 接口与声明式布局引擎之间的桥梁。
 * 每个组件映射到一个或多个 `AdapterSection` 条目。
 */
function buildClaudeLayout(opts: InstallPipelineOptions): AdapterLayout {
  const { homeDir, templateDir, targetDir } = opts;
  const claudeTemplateDir = path.join(templateDir, 'claude');
  const { components, upgradeMode } = resolveComponents(opts);

  const sections: AdapterSection[] = [];

  // ── 1. 目录 ──────────────────────────────────────────
  const dirs: string[] = [];
  if (components.has('rules')) dirs.push('rules');
  if (components.has('commands')) dirs.push('commands');
  if (components.has('agents')) dirs.push('agents');
  if (components.has('hooks')) dirs.push('hooks');
  if (components.has('seed-memory')) dirs.push('memory');
  if (components.has('skills')) dirs.push('skills');
  if (dirs.length > 0) {
    sections.push({ type: 'dirs', paths: dirs });
  }

  // ── 2. CLAUDE.md（复制或追加协议节） ──────────
  if (components.has('claude-md')) {
    sections.push({
      type: 'copy',
      src: path.join(claudeTemplateDir, 'CLAUDE.md'),
      dst: path.join(homeDir, 'CLAUDE.md'),
      strategy: 'skip-if-exists',
      appendMarker: upgradeMode ? undefined : 'EvoKit — 项目上下文引擎',
    });
  }

  // ── 3. MEMORY.md（upgrade 时保留用户数据） ──────
  if (components.has('memory-md')) {
    sections.push({
      type: 'copy',
      src: path.join(claudeTemplateDir, 'MEMORY.md'),
      dst: path.join(targetDir, 'MEMORY.md'),
      strategy: upgradeMode ? 'skip-if-exists' : 'always',
    });
  }

  // ── 4. settings.json（合并或全新） ───────────────────────
  if (components.has('settings')) {
    sections.push({
      type: 'merge-settings',
      srcPath: path.join(claudeTemplateDir, 'settings.json'),
      dstPath: path.join(targetDir, 'settings.json'),
      replaceHome: true,
    });
  }

  // ── 5. 钩子（带 __HOME__ 替换的复制，始终覆盖） ─
  if (components.has('hooks')) {
    sections.push({
      type: 'copy-dir',
      srcDir: path.join(claudeTemplateDir, 'hooks'),
      dstDir: path.join(targetDir, 'hooks'),
      filter: '.sh',
      strategy: 'always',
      replaceHome: true,
      counter: 'hooksInstalled',
    });
  }

  // ── 6. 规则（复制，覆盖 — 升级路径） ───────────────
  if (components.has('rules')) {
    sections.push({
      type: 'copy-dir',
      srcDir: path.join(claudeTemplateDir, 'rules'),
      dstDir: path.join(targetDir, 'rules'),
      filter: '.md',
      strategy: 'always',
      counter: 'rulesInstalled',
    });
  }

  // ── 7. 命令（复制，覆盖） ───────────────────────────
  if (components.has('commands')) {
    sections.push({
      type: 'copy-dir',
      srcDir: path.join(claudeTemplateDir, 'commands'),
      dstDir: path.join(targetDir, 'commands'),
      filter: '.md',
      strategy: 'always',
      counter: 'commandsInstalled',
    });
  }

  // ── 8. 代理（frontmatter 合并） ───────────────────────────
  if (components.has('agents')) {
    sections.push({
      type: 'merge-agents',
      srcDir: path.join(claudeTemplateDir, 'agents'),
      dstDir: path.join(targetDir, 'agents'),
    });
  }

  // ── 9. 技能 ───────────────────────────────────────────────
  if (components.has('skills')) {
    sections.push({
      type: 'copy-skills',
      srcDir: path.join(claudeTemplateDir, 'skills'),
      dstDir: path.join(targetDir, 'skills'),
    });
  }

  // ── 10. 内存种子（仅当不存在时） ─────────────────────
  if (components.has('seed-memory')) {
    sections.push({
      type: 'seed-memory',
      srcDir: path.join(claudeTemplateDir, 'memory'),
      dstDir: path.join(targetDir, 'memory'),
      files: [...MEMORY_SEED_FILES],
    });
  }

  // ── 11. 权限 ─────────────────────────────────────────
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

/**
 * 使用 profile/exclude 或旧式布尔标志选项安装 EvoKit 模板文件。
 *
 * 内部构建 `AdapterLayout` 并委托给 `executeLayout()`。
 * 布尔标志保留用于向后兼容。
 */
export function installPipeline(opts: InstallPipelineOptions): InstallSummary {
  const layout = buildClaudeLayout(opts);
  return executeLayout(layout, {
    homeDir: opts.homeDir,
    dryRun: opts.dryRun ?? false,
  });
}

// ─── 旧式 installTemplate（向后兼容） ─────────────────

/**
 * 安装完整 Claude Code 模板。
 *
 * 包装 installPipeline 以保持向后兼容。
 */
export function installTemplate(
  homeDir: string,
  templateDir: string,
  dryRun: boolean = false,
): InstallSummary {
  const claudeDir = path.join(homeDir, '.claude');

  return installPipeline({
    homeDir,
    templateDir,
    targetDir: claudeDir,
    dryRun,
    profile: 'full',
  });
}

// ─── 权限（旧式） ─────────────────────────────────────

/**
 * 设置所有模板文件的权限。
 */
export function setPermissions(claudeDir: string): void {
  const hooksDir = path.join(claudeDir, 'hooks');
  if (fse.existsSync(hooksDir)) setHookPermissions(hooksDir);

  const memDir = path.join(claudeDir, 'memory');
  if (fse.existsSync(memDir)) setMemoryPermissions(memDir);
}

// ─── 验证 ─────────────────────────────────────────────

/**
 * 验证 Claude Code EvoKit 安装。
 */
export function verifyInstallation(homeDir: string): BootCheck[] {
  const checks: BootCheck[] = [];
  const claudeDir = path.join(homeDir, '.claude');

  // 目录结构
  for (const subdir of CLAUDE_SUBDIRS) {
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
    for (const hook of HOOK_FILES) {
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

  // JSONL 文件权限（600）
  const memDir = path.join(claudeDir, 'memory');
  if (fse.existsSync(memDir)) {
    const jsonls = fs.readdirSync(memDir).filter((f) => f.endsWith('.jsonl'));
    for (const j of jsonls) {
      const jp = path.join(memDir, j);
      const stats = fs.statSync(jp);
      const mode = stats.mode & 0o777;
      const secure = mode === 0o600;
      checks.push({
        name: `.claude/memory/${j} (${mode.toString(8)})`,
        pass: secure,
        detail: secure ? undefined : `期望 600，实际为 ${mode.toString(8)}`,
      });
    }
  }

  return checks;
}
