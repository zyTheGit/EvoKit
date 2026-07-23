/**
 * EvoKit — Pi CLI 适配器
 *
 * @internal — Pi CLI 的适配器实现。PiAdapter 类继承 BaseAdapter 基类。
 *
 * 为 Pi CLI 实现 BaseAdapter 抽象成员。
 * Pi CLI 使用：
 * - AGENTS.md 作为 L1 认知核心（全局 ~/.pi/agent/ + 项目级）
 * - ~/.pi/agent/settings.json 作为全局配置（JSON 格式）
 * - ~/.pi/agent/extensions/ 作为全局 TypeScript 扩展（通过 pi.on() 事件订阅）
 * - ~/.pi/agent/skills/ 作为全局 Skills（遵循 Agent Skills 标准）
 * - ~/.pi/agent/memory/ 作为全局学习数据
 * - .pi/ 作为项目级配置
 *
 * Pi CLI 没有内置 hooks 系统 — 生命周期逻辑通过 TypeScript 扩展实现。
 *
 * 使用声明式 `AdapterLayout` + `executeLayout()` 引擎。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { type AdapterInstallConfig, type AdapterVerifyCheck } from '../types.js';
import { BaseAdapter } from '../base-adapter.js';
import type { InstallSummary, SessionEntry } from '../../core/types.js';
import type { PiAdapterOptions, PiInstallConfig } from './types.js';
import type { AdapterLayout, AdapterSection } from '../../core/layout-types.js';
import { executeLayout } from '../../core/layout-engine.js';

export const PI_ADAPTER_VERSION = '0.6.0';

// ─── 常量 ─────────────────────────────────────────────────

const GLOBAL_DIRS = ['extensions', 'memory', 'skills', 'agent', 'prompts'] as const;
const EXTENSION_FILES = [
  'evokit-lifecycle.ts',
  'evokit-boot.ts',
  'evokit-evolve.ts',
  'evokit-memory.ts',
  'evokit-session.ts',
] as const;
const AGENT_FILES = ['architect.md', 'reviewer.md'] as const;
const MEMORY_SEED_FILES = ['README.md'] as const;

// ─── 路径解析 ──────────────────────────────────────────────

/**
 * 解析 Pi CLI 全局配置目录。
 * 遵循 PI_CODING_AGENT_DIR 环境变量，默认为 ~/.pi/agent/。
 */
export function resolvePiHome(homeDir: string): string {
  return process.env.PI_CODING_AGENT_DIR || path.join(homeDir, '.pi', 'agent');
}

/**
 * 解析 Pi CLI 项目级配置目录。
 */
export function resolvePiProjectDir(projectDir: string): string {
  return path.join(projectDir, '.pi');
}

// ─── 布局构建器 ────────────────────────────────────────────

/**
 * 构建 Pi CLI 适配器安装的声明式布局。
 *
 * Pi 安装到两个位置：
 *   1. 全局：~/.pi/agent/
 *   2. 项目（可选）：.pi/
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
  const piHome = resolvePiHome(homeDir);
  const piTemplateDir = path.join(templateDir, 'pi');

  const sections: AdapterSection[] = [];

  // ═══════════════════════════════════════════════════════════
  // GLOBAL INSTALL: ~/.pi/agent/
  // ═══════════════════════════════════════════════════════════

  // 1. Global directories
  sections.push({
    type: 'dirs',
    paths: [...GLOBAL_DIRS],
  });

  // 2. AGENTS.md (global, skip-if-exists, with __HOME__ replacement)
  sections.push({
    type: 'copy',
    src: path.join(piTemplateDir, 'AGENTS.md'),
    dst: path.join(piHome, 'AGENTS.md'),
    strategy: 'skip-if-exists',
    replaceHome: true,
  });

  // 3. settings.json (global, skip-if-exists, with __HOME__)
  sections.push({
    type: 'copy',
    src: path.join(piTemplateDir, 'settings.json'),
    dst: path.join(piHome, 'settings.json'),
    strategy: 'skip-if-exists',
    replaceHome: true,
  });

  // 4. Extensions (TypeScript, always copy — upgrade path, with __HOME__)
  sections.push({
    type: 'copy-dir',
    srcDir: path.join(piTemplateDir, 'extensions'),
    dstDir: path.join(piHome, 'extensions'),
    filter: '.ts',
    strategy: 'always',
    replaceHome: true,
    counter: 'hooksInstalled',
  });

  // 5. Agent definitions (global ~/.pi/agent/agent/)
  sections.push({
    type: 'merge-agents',
    srcDir: path.join(piTemplateDir, 'agent'),
    dstDir: path.join(piHome, 'agent'),
  });

  // 6. Skills (seed, skip-if-exists per file via copy-skills)
  sections.push({
    type: 'copy-skills',
    srcDir: path.join(piTemplateDir, 'skills'),
    dstDir: path.join(piHome, 'skills'),
  });

  // 7. Memory seed (global, skip-if-exists)
  sections.push({
    type: 'seed-memory',
    srcDir: path.join(piTemplateDir, 'memory'),
    dstDir: path.join(piHome, 'memory'),
    files: [...MEMORY_SEED_FILES],
  });

  // ═══════════════════════════════════════════════════════════
  // PROJECT INSTALL (optional): .pi/
  // ═══════════════════════════════════════════════════════════

  if (projectDir) {
    const piProjectDir = resolvePiProjectDir(projectDir);

    // 8. AGENTS.md (project root, skip-if-exists, with __HOME__)
    sections.push({
      type: 'copy',
      src: path.join(piTemplateDir, 'AGENTS.md'),
      dst: path.join(projectDir, 'AGENTS.md'),
      strategy: 'skip-if-exists',
      replaceHome: true,
    });

    // 9. settings.json (project root, skip-if-exists, with __HOME__)
    sections.push({
      type: 'copy',
      src: path.join(piTemplateDir, 'settings.json'),
      dst: path.join(projectDir, 'settings.json'),
      strategy: 'skip-if-exists',
      replaceHome: true,
    });

    // 10. Project-level extensions (.pi/extensions/)
    sections.push({
      type: 'copy-dir',
      srcDir: path.join(piTemplateDir, 'extensions'),
      dstDir: path.join(piProjectDir, 'extensions'),
      filter: '.ts',
      strategy: 'always',
      replaceHome: true,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PERMISSIONS
  // ═══════════════════════════════════════════════════════════

  // 11. Extensions — readable
  sections.push({
    type: 'permissions',
    dir: path.join(piHome, 'extensions'),
    extension: '.ts',
    mode: 0o644,
  });

  // 12. Global memory JSONL files — 600 (personal data)
  sections.push({
    type: 'permissions',
    dir: path.join(piHome, 'memory'),
    extension: '.jsonl',
    mode: 0o600,
  });

  return { targetDir: piHome, sections };
}

// ─── BaseAdapter 实现 ──────────────────────────────────────

export class PiAdapter extends BaseAdapter {
  readonly id = 'pi';
  readonly label = 'Pi CLI';
  readonly description = '~/.pi/agent/';
  readonly version = PI_ADAPTER_VERSION;
  readonly supportedAgentVersion = '>=0.81.0';

  protected get projectSubdir(): string {
    return '.pi';
  }

  resolveHome(homeDir: string): string {
    return resolvePiHome(homeDir);
  }

  protected buildLayout(opts: {
    homeDir: string;
    projectDir?: string;
    templateDir: string;
  }): AdapterLayout {
    return getLayout(opts);
  }

  protected verifyChecks(config: AdapterInstallConfig): AdapterVerifyCheck[] {
    return verifyPiInstallation(resolvePiHome(config.homeDir));
  }
}

// ─── 独立 API ──────────────────────────────────────────────

/**
 * 为 Pi CLI 安装 EvoKit。
 * 通过 `getLayout()` + `executeLayout()` 委托给布局引擎。
 */
export function installPi(config: PiInstallConfig): InstallSummary {
  const piHome = resolvePiHome(config.homeDir);
  const piTemplateDir = path.join(config.templateDir, 'pi');

  // 验证模板是否存在
  if (!fse.existsSync(path.join(piTemplateDir, 'AGENTS.md'))) {
    throw new Error(
      `Pi 模板未找到: ${piTemplateDir}\n` + '  请确保模板目录包含 pi/ 子目录及 AGENTS.md。',
    );
  }

  const layout = getLayout({
    homeDir: config.homeDir,
    projectDir: config.projectDir,
    templateDir: config.templateDir,
  });
  return executeLayout(layout, {
    homeDir: config.homeDir,
    dryRun: config.dryRun ?? false,
  });
}

/**
 * 将学习数据注入 Pi CLI 可访问的上下文。
 * 将纠正和观察写入全局 memory 目录。
 */
export function injectPiMemory(
  homeDir: string,
  data: {
    corrections?: Array<{ pattern: string; context: string }>;
    observations?: Array<{ pattern: string; confidence: number; source: string }>;
    learnedRules?: string;
  },
  options: PiAdapterOptions = {},
): number {
  const memoryDir = options.sharedMemoryDir
    ? path.resolve(options.sharedMemoryDir)
    : path.resolve(resolvePiHome(homeDir), 'memory');

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
 * 从全局 memory 导出学习数据。
 */
export function exportPiMemory(
  homeDir: string,
  options: PiAdapterOptions = {},
): {
  corrections: unknown[];
  observations: unknown[];
  learnedRules: string;
  sessions: unknown[];
} {
  const memoryDir = options.sharedMemoryDir
    ? path.resolve(options.sharedMemoryDir)
    : path.resolve(resolvePiHome(homeDir), 'memory');

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

  // 解析 sessions.jsonl
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
 * 记录带有 Pi 助手名称标签的会话条目。
 */
export function recordPiSession(
  homeDir: string,
  session: Omit<SessionEntry, 'timestamp' | 'assistant'>,
  options: PiAdapterOptions = {},
): void {
  const memoryDir = options.sharedMemoryDir
    ? path.resolve(options.sharedMemoryDir)
    : path.resolve(resolvePiHome(homeDir), 'memory');

  fse.ensureDirSync(memoryDir);
  const sessionsPath = path.join(memoryDir, 'sessions.jsonl');

  const entry: SessionEntry = {
    timestamp: new Date().toISOString(),
    assistant: 'pi',
    ...session,
  };

  fs.appendFileSync(sessionsPath, JSON.stringify(entry) + '\n', 'utf-8');
  fs.chmodSync(sessionsPath, 0o600);
}

/**
 * 获取 Pi CLI EvoKit 安装的状态摘要。
 */
export function getPiStatus(homeDir: string): {
  installed: boolean;
  piHome: string;
  agentsPresent: boolean;
  extensionsPresent: boolean;
  configPresent: boolean;
  skillsPresent: boolean;
  sharedMemoryPresent: boolean;
  extensionCount: number;
  error?: string;
} {
  const piHome = resolvePiHome(homeDir);
  const result = {
    installed: false,
    piHome,
    agentsPresent: false,
    extensionsPresent: false,
    configPresent: false,
    skillsPresent: false,
    sharedMemoryPresent: false,
    extensionCount: 0,
  };

  try {
    result.agentsPresent = fse.existsSync(path.join(piHome, 'AGENTS.md'));
    result.configPresent = fse.existsSync(path.join(piHome, 'settings.json'));

    const extDir = path.join(piHome, 'extensions');
    if (fse.existsSync(extDir)) {
      const exts = fs.readdirSync(extDir).filter((f) => f.endsWith('.ts'));
      result.extensionCount = exts.length;
      result.extensionsPresent = exts.length > 0;
    }

    result.skillsPresent = fse.existsSync(path.join(piHome, 'skills'));

    const memDir = path.join(piHome, 'memory');
    result.sharedMemoryPresent = fse.existsSync(memDir);

    result.installed = result.agentsPresent || result.configPresent || result.extensionsPresent;
  } catch (e) {
    return { ...result, error: (e as Error).message };
  }

  return result;
}

// ─── 验证 ─────────────────────────────────────────────────

/**
 * 验证指定路径下的 Pi CLI EvoKit 安装。
 */
export function verifyPiInstallation(piHome: string): AdapterVerifyCheck[] {
  const checks: AdapterVerifyCheck[] = [];

  // 全局配置文件
  for (const file of ['AGENTS.md', 'settings.json']) {
    const exists = fse.existsSync(path.join(piHome, file));
    checks.push({
      name: `~/.pi/agent/${file}`,
      pass: exists,
      detail: exists ? undefined : '文件缺失',
    });
  }

  // 全局子目录
  for (const subdir of GLOBAL_DIRS) {
    const exists = fse.existsSync(path.join(piHome, subdir));
    checks.push({
      name: `~/.pi/agent/${subdir}/`,
      pass: exists,
      detail: exists ? undefined : '目录缺失',
    });
  }

  // 扩展文件
  const extDir = path.join(piHome, 'extensions');
  if (fse.existsSync(extDir)) {
    for (const extFile of EXTENSION_FILES) {
      const exists = fse.existsSync(path.join(extDir, extFile));
      checks.push({
        name: `~/.pi/agent/extensions/${extFile}`,
        pass: exists,
        detail: exists ? undefined : '扩展缺失',
      });
    }
  }

  // Agent 文件（全局）
  const agentDir = path.join(piHome, 'agent');
  if (fse.existsSync(agentDir)) {
    for (const agentFile of AGENT_FILES) {
      const exists = fse.existsSync(path.join(agentDir, agentFile));
      checks.push({
        name: `~/.pi/agent/agent/${agentFile}`,
        pass: exists,
        detail: exists ? undefined : '代理定义缺失',
      });
    }
  }

  // 全局 memory 目录
  const memDir = path.join(piHome, 'memory');
  checks.push({
    name: `~/.pi/agent/memory/`,
    pass: true,
    detail: fse.existsSync(memDir) ? undefined : '尚未创建（首次写入记忆时自动创建）',
  });

  return checks;
}
