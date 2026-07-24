/**
 * EvoKit — Codex CLI 适配器安装器
 *
 * @internal — Codex CLI 的适配器实现。CodexAdapter 继承 BaseAdapter 基类。
 *
 * 实现 OpenAI Codex CLI 的 AgentAdapter 接口。
 * Codex CLI 使用 ~/.codex/，包含：
 * - AGENTS.md 作为认知核心（类似于 CLAUDE.md）
 * - hooks.json 用于生命周期钩子（SessionStart、Stop、PreToolUse）
 * - config.toml 用于配置
 * - .codex/rules/ 用于 Starlark 权限规则
 * - ~/.codex/memory/ 用于进化数据
 *
 * 使用声明式 `AdapterLayout` + `executeLayout()` 引擎。
 * 通用安装/验证/状态/卸载管线由 BaseAdapter 提供。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fse from 'fs-extra';
import { BaseAdapter } from '../base-adapter.js';
import type { AdapterInstallConfig, AdapterVerifyCheck } from '../types.js';
import type { CodexAdapterOptions, CodexInstallConfig } from './types.js';
import type { VerifyResult, InstallSummary, SessionEntry } from '../../core/types.js';
import type { AdapterLayout, AdapterSection } from '../../core/layout-types.js';
import { executeLayout } from '../../core/layout-engine.js';
import { CodexHooksBuilder } from './hooks.js';

// ESM 中的 __dirname 等价写法（runCodexCommand 需要）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CODEX_ADAPTER_VERSION = '0.4.0';

const CODEX_SUBDIRS = ['rules', 'hooks-scripts', 'memory'] as const;
const CODEX_PROJECT_SUBDIRS = ['rules', 'agents', 'skills', 'hooks', 'memory'] as const;
const HOOK_SCRIPTS = ['session-start.sh', 'stop.sh', 'pre-tool-use.sh'] as const;
const MEMORY_SEED_FILES = ['README.md', 'learned-rules.md', 'evolution-log.md'] as const;

export function resolveCodexHome(homeDir: string): string {
  return process.env.CODEX_HOME || path.join(homeDir, '.codex');
}

// ─── 布局构建器 ────────────────────────────────────────────

/**
 * 构建 Codex CLI 适配器安装的声明式布局。
 *
 * 支持双层安装：
 *   1. 全局：~/.codex/
 *   2. 项目（可选）：.codex/ + 项目根目录文件
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
  const codexHome = resolveCodexHome(homeDir);
  const codexTemplateDir = path.join(templateDir, 'codex');

  const sections: AdapterSection[] = [];

  // ── 1. 目录 ──────────────────────────────────────────
  sections.push({
    type: 'dirs',
    paths: [...CODEX_SUBDIRS],
  });

  // ── 2. AGENTS.md（skip-if-exists，替换 __HOME__）──
  sections.push({
    type: 'copy',
    src: path.join(codexTemplateDir, 'AGENTS.md'),
    dst: path.join(codexHome, 'AGENTS.md'),
    strategy: 'skip-if-exists',
    replaceHome: true,
  });

  // ── 3. hooks.json（始终复制 — 升级路径，替换 __HOME__）──
  sections.push({
    type: 'copy',
    src: path.join(codexTemplateDir, 'hooks.json'),
    dst: path.join(codexHome, 'hooks.json'),
    strategy: 'always',
    replaceHome: true,
  });

  // ── 4. config.toml（skip-if-exists，不替换 __HOME__）──
  sections.push({
    type: 'copy',
    src: path.join(codexTemplateDir, 'config.toml'),
    dst: path.join(codexHome, 'config.toml'),
    strategy: 'skip-if-exists',
  });

  // ── 5. Rules（始终复制 — 升级路径）────────────────────
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(codexTemplateDir, 'rules'),
    dstDir: path.join(codexHome, 'rules'),
    filter: '.rules',
    strategy: 'always',
    counter: 'rulesInstalled',
  });

  // ── 6. Hook 脚本（始终复制，替换 __HOME__）──────────────
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(codexTemplateDir, 'hooks-scripts'),
    dstDir: path.join(codexHome, 'hooks-scripts'),
    filter: '.sh',
    strategy: 'always',
    replaceHome: true,
    counter: 'hooksInstalled',
  });

  // ── 7. Memory 初始化（skip-if-exists）────────────────────
  sections.push({
    type: 'seed-memory',
    srcDir: path.join(codexTemplateDir, 'memory'),
    dstDir: path.join(codexHome, 'memory'),
    files: [...MEMORY_SEED_FILES],
  });

  // ═══════════════════════════════════════════════════════════
  // PROJECT INSTALL (optional): .codex/  +  project root files
  // ═══════════════════════════════════════════════════════════

  if (projectDir) {
    const codexProjectDir = path.join(projectDir, '.codex');

    // 8. AGENTS.md (project root, skip-if-exists, with __HOME__)
    sections.push({
      type: 'copy',
      src: path.join(codexTemplateDir, 'AGENTS.md'),
      dst: path.join(projectDir, 'AGENTS.md'),
      strategy: 'skip-if-exists',
      replaceHome: true,
    });

    // 9. config.toml (project-level, skip-if-exists)
    sections.push({
      type: 'copy',
      src: path.join(codexTemplateDir, 'config.toml'),
      dst: path.join(codexProjectDir, 'config.toml'),
      strategy: 'skip-if-exists',
    });

    // 10. Rules (project-level, copy-dir)
    sections.push({
      type: 'copy-dir',
      srcDir: path.join(codexTemplateDir, 'rules'),
      dstDir: path.join(codexProjectDir, 'rules'),
      filter: '.rules',
      strategy: 'always',
      counter: 'rulesInstalled',
    });

    // 11. Agents (project-level, merge-agents)
    sections.push({
      type: 'merge-agents',
      srcDir: path.join(codexTemplateDir, 'agents'),
      dstDir: path.join(codexProjectDir, 'agents'),
    });

    // 12. Skills (project-level, copy-skills)
    sections.push({
      type: 'copy-skills',
      srcDir: path.join(codexTemplateDir, 'skills'),
      dstDir: path.join(codexProjectDir, 'skills'),
    });

    // 13. Hooks (project-level, copy-dir)
    sections.push({
      type: 'copy-dir',
      srcDir: path.join(codexTemplateDir, 'hooks-scripts'),
      dstDir: path.join(codexProjectDir, 'hooks'),
      filter: '.sh',
      strategy: 'always',
      replaceHome: true,
      counter: 'hooksInstalled',
    });

    // 14. Memory seed (project-level, skip-if-exists)
    sections.push({
      type: 'seed-memory',
      srcDir: path.join(codexTemplateDir, 'memory'),
      dstDir: path.join(codexProjectDir, 'memory'),
      files: [...MEMORY_SEED_FILES],
    });
  }

  // ── 15. 权限 ─────────────────────────────────────────────
  sections.push({
    type: 'permissions',
    dir: path.join(codexHome, 'hooks-scripts'),
    extension: '.sh',
    mode: 0o755,
  });

  // ── 16. Memory JSONL 文件权限（个人数据）──────────────
  sections.push({
    type: 'permissions',
    dir: path.join(codexHome, 'memory'),
    extension: '.jsonl',
    mode: 0o600,
  });

  // ── 17. 项目级 Hook 脚本权限 ──────────────────────────────
  if (projectDir) {
    sections.push({
      type: 'permissions',
      dir: path.join(projectDir, '.codex', 'hooks'),
      extension: '.sh',
      mode: 0o755,
    });
  }

  return { targetDir: codexHome, sections };
}

// ─── BaseAdapter 子类实现 ──────────────────────────────────

export class CodexAdapter extends BaseAdapter {
  readonly id = 'codex';
  readonly label = 'Codex CLI';
  readonly description = '~/.codex/ + .codex/';
  readonly version = CODEX_ADAPTER_VERSION;
  readonly supportedAgentVersion = '>=1.0.0';

  /** 项目级配置目录名 */
  protected override get projectSubdir(): string {
    return '.codex';
  }

  /** 解析 Codex 全局安装目录（支持 CODEX_HOME 环境变量覆盖）。 */
  override resolveHome(homeDir: string): string {
    return resolveCodexHome(homeDir);
  }

  /** 构建声明式安装布局，委托给公共 getLayout() 函数。 */
  protected buildLayout(opts: {
    homeDir: string;
    projectDir?: string;
    templateDir: string;
    allowWorkflow?: boolean;
  }): AdapterLayout {
    return getLayout(opts);
  }

  /** 验证检查项，委托给公共 verifyCodexInstallation() 函数。 */
  protected verifyChecks(config: AdapterInstallConfig): AdapterVerifyCheck[] {
    const codexHome = resolveCodexHome(config.homeDir);
    return verifyCodexInstallation(codexHome, config.projectDir);
  }
}

// ─── 独立 API ──────────────────────────────────────────────

/**
 * 为 Codex CLI 安装 EvoKit。
 * 通过 `getLayout()` + `executeLayout()` 委托给布局引擎。
 */
export function installCodex(config: CodexInstallConfig): InstallSummary {
  const codexHome = resolveCodexHome(config.homeDir);
  const codexTemplateDir = path.join(config.templateDir, 'codex');

  // 验证模板是否存在
  if (!fse.existsSync(path.join(codexTemplateDir, 'AGENTS.md'))) {
    throw new Error(
      `Codex 模板未找到: ${codexTemplateDir}\n` +
        '  请确保模板目录包含 codex/ 子目录及 AGENTS.md。',
    );
  }

  const layout = getLayout({ homeDir: config.homeDir, templateDir: config.templateDir });
  return executeLayout(layout, {
    homeDir: config.homeDir,
    dryRun: config.dryRun ?? false,
  });
}

/**
 * 设置 Codex CLI 的生命周期钩子。
 * 生成包含 SessionStart、Stop 和 PreToolUse 处理器的 hooks.json。
 */
export function setupCodexHooks(codexHome: string, options: CodexAdapterOptions = {}): void {
  const scriptsDir = options.codexHome
    ? path.resolve(options.codexHome, 'hooks-scripts')
    : path.resolve(codexHome, 'hooks-scripts');

  // 使用默认钩子配置
  const builder = CodexHooksBuilder.createDefault(scriptsDir);

  // 写入 hooks.json
  const hooksPath = path.join(codexHome, 'hooks.json');
  builder.writeToFile(hooksPath);
}

/**
 * 将学习数据注入 Codex 可访问的上下文。
 * 将纠正和观察写入共享 memory 目录。
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

  // 追加纠正记录
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

  // 追加观察记录
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
 * 从共享 memory 导出学习数据。
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

  // 解析 corrections.jsonl
  const correctionsPath = path.join(memoryDir, 'corrections.jsonl');
  if (fse.existsSync(correctionsPath)) {
    result.corrections = fs
      .readFileSync(correctionsPath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  // 解析 observations.jsonl
  const observationsPath = path.join(memoryDir, 'observations.jsonl');
  if (fse.existsSync(observationsPath)) {
    result.observations = fs
      .readFileSync(observationsPath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  // 读取 learned-rules.md
  const rulesPath = path.join(memoryDir, 'learned-rules.md');
  if (fse.existsSync(rulesPath)) {
    result.learnedRules = fs.readFileSync(rulesPath, 'utf-8');
  }

  // 解析 sessions.jsonl（如有 codex 标签则过滤）
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
 * 记录带有 Codex 助手名称标签的会话条目。
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
 * 在 Codex 上下文中运行 EvoKit 命令。
 * 使用 shell 执行 /boot、/evolve、/review 命令。
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
 * Codex CLI 安装的完整启动验证。
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
 * 验证指定路径下的 Codex CLI 安装（全局 + 可选项目级）。
 * 独立 API 使用的公共包装函数。
 */
export function verifyCodexInstallation(
  codexHome: string,
  projectDir?: string,
): AdapterVerifyCheck[] {
  const checks: AdapterVerifyCheck[] = [];

  for (const file of ['AGENTS.md', 'hooks.json', 'config.toml']) {
    const exists = fse.existsSync(path.join(codexHome, file));
    checks.push({
      name: `.codex/${file}`,
      pass: exists,
      detail: exists ? undefined : '文件缺失',
    });
  }

  for (const subdir of CODEX_SUBDIRS) {
    const exists = fse.existsSync(path.join(codexHome, subdir));
    checks.push({
      name: `.codex/${subdir}/`,
      pass: exists,
      detail: exists ? undefined : '目录缺失',
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
          detail: (stats.mode & 0o111) !== 0 ? undefined : '不可执行',
        });
      } else {
        checks.push({
          name: `.codex/hooks-scripts/${script}`,
          pass: false,
          detail: '脚本缺失',
        });
      }
    }
  }

  // ── 项目级检查（可选）──
  if (projectDir) {
    const codexProjectDir = path.join(projectDir, '.codex');

    // 项目根 AGENTS.md
    const projectAgentsMdExists = fse.existsSync(path.join(projectDir, 'AGENTS.md'));
    checks.push({
      name: 'AGENTS.md (project root)',
      pass: projectAgentsMdExists,
      detail: projectAgentsMdExists ? undefined : '文件缺失',
    });

    // 项目级 config.toml
    checks.push({
      name: '.codex/config.toml (project)',
      pass: fse.existsSync(path.join(codexProjectDir, 'config.toml')),
    });

    // 项目级子目录
    for (const subdir of CODEX_PROJECT_SUBDIRS) {
      const exists = fse.existsSync(path.join(codexProjectDir, subdir));
      checks.push({
        name: `.codex/${subdir}/ (project)`,
        pass: exists,
        detail: exists ? undefined : '目录缺失',
      });
    }
  }

  return checks;
}

/**
 * 获取 Codex CLI EvoKit 安装的状态摘要。
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

// ─── 内部辅助函数 ──────────────────────────────────────────

function getBootCommand(homeDir: string): string {
  const codexHome = resolveCodexHome(homeDir);
  const scriptPath = path.join(codexHome, 'hooks-scripts', 'session-start.sh');
  if (fse.existsSync(scriptPath)) {
    return `bash "${scriptPath}"`;
  }
  // 回退：直接验证安装
  return `echo "EvoKit 启动检查 for Codex CLI (home: ${codexHome})"`;
}
