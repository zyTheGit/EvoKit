/**
 * EvoKit — 适配器基类
 *
 * 吸收所有适配器共享的安装/验证/状态/卸载管线。
 * 子类只需声明适配器特有信息（路径解析、模板布局、验证逻辑），
 * 通用步骤（模板校验、项目目录创建、清单收集、清单写入、结果映射）
 * 全部由基类统一处理 —— 消除四个适配器中重复的 install() 薄壳。
 *
 * @packageDocumentation
 */

import fse from 'fs-extra';
import fs from 'node:fs';
import path from 'node:path';

import type {
  AdapterInstallConfig,
  AdapterInstallResult,
  AdapterInternal,
  AdapterInstaller,
  AdapterStatus,
  AdapterUninstallConfig,
  AdapterUninstallResult,
  AdapterVerifyCheck,
  LayoutConfig,
} from './types.js';
import type { AdapterLayout, AdapterSection } from '../core/layout-types.js';
import type { SessionEntry } from '../core/types.js';
import { executeLayout } from '../core/layout-engine.js';
import { ManifestCollector } from '../core/manifest-collector.js';
import { updateAdapterManifest } from '../core/manifest.js';
import { executeUninstall } from '../core/reverse-layout-engine.js';
import { getEvokitVersion } from '../core/version.js';

/**
 * 启发式卸载配置 —— 描述适配器的文件结构，用于清单缺失时的回退卸载。
 * 与 reverse-layout-engine.ts 的 AdapterHeuristicConfig 对应。
 */
export interface HeuristicConfig {
  /** 配置文件名列表（相对于 adapterHome） */
  configFiles: string[];
  /** 认知核心文件绝对路径（Claude: ~/CLAUDE.md, 其他: adapterHome/AGENTS.md） */
  cognitiveCorePath: string | null;
  /** 已知目录配置 */
  knownDirs: { name: string; extension: string }[];
  /** Skills 目录绝对路径 */
  skillsDir: string | null;
}

/**
 * 所有内置适配器的抽象基类。
 *
 * 同时实现 {@link AdapterInstaller}（公共接口）和 {@link AdapterInternal}（框架内部接口），
 * 子类继承 BaseAdapter 即自动满足两个接口的约束。
 *
 * 子类实现以下抽象成员即可获得完整的 install/verify/status/uninstall：
 * - {@link resolveHome} — 解析适配器全局目录（含环境变量支持）
 * - {@link buildLayout} — 构建声明式 AdapterLayout
 * - {@link verifyChecks} — 返回验证检查项
 *
 * 可选覆盖：
 * - {@link projectSubdir} — 项目级配置目录名（默认 `.${id}`）
 * - {@link templateSubdir} — 模板子目录名（默认与 id 相同）
 * - {@link templateEntryPoint} — 模板入口校验文件（默认 'AGENTS.md'）
 */
export abstract class BaseAdapter implements AdapterInstaller, AdapterInternal {
  abstract readonly id: string;
  abstract readonly label: string;
  abstract readonly description: string;
  abstract readonly version: string;
  abstract readonly supportedAgentVersion: string;
  readonly experimental?: boolean;

  /** 模板目录下的子目录名（默认与 id 相同，如 'claude'、'codex'）。 */
  protected get templateSubdir(): string {
    return this.id;
  }

  /** 校验模板存在性的入口文件名（默认 'AGENTS.md'，Claude 为 'CLAUDE.md'）。 */
  protected get templateEntryPoint(): string {
    return 'AGENTS.md';
  }

  /** 项目级配置目录名（默认 `.${id}`，如 '.claude'、'.codex'）。 */
  protected get projectSubdir(): string {
    return `.${this.id}`;
  }

  /** OpenCode 的 projectDir 默认回退到 cwd，其余适配器可选。 */
  protected resolveProjectDir(config: AdapterInstallConfig): string | undefined {
    const dir = config.projectDir;
    // 当 projectDir 与 homeDir 相同时，项目级安装路径与全局重叠，无意义
    if (dir && path.resolve(dir) === path.resolve(config.homeDir)) {
      return undefined;
    }
    return dir;
  }

  /** 解析适配器全局安装目录。子类实现以支持环境变量覆盖。 */
  abstract resolveHome(homeDir: string): string;

  /**
   * 启发式卸载配置 —— 当清单缺失时，描述该适配器的文件结构。
   * 默认实现基于 AGENTS.md + 常见目录；子类可覆盖以提供精确配置。
   * 用于替代卸载引擎中硬编码的 switch-case。
   */
  getHeuristicConfig(adapterHome: string): HeuristicConfig {
    return {
      configFiles: ['settings.json'],
      cognitiveCorePath: path.join(adapterHome, 'AGENTS.md'),
      knownDirs: [{ name: 'hooks', extension: '.sh' }],
      skillsDir: null,
    };
  }

  /**
   * 是否在卸载时对配置文件执行反向合并（而非直接删除）。
   * Claude Code 的 settings.json 与用户共存，需反向合并；其余适配器配置文件为 EvoKit 独占，可直接删除。
   * 用于替代卸载引擎中硬编码的 `adapterId === 'claude'` 判断。
   */
  reverseMergesSettings(): boolean {
    return false;
  }

  /**
   * 认知核心文件的 appendMarker（用于精确移除追加的区段）。
   * 仅 Claude 的 CLAUDE.md 需要区段移除；返回 null 表示直接删除认知核心文件。
   */
  cognitiveCoreAppendMarker(): string | null {
    return null;
  }

  /**
   * 基于声明式 LayoutConfig 构建标准 AdapterLayout。
   *
   * 将四个适配器中重复的 13 步布局构建过程统一为配置驱动：
   * 子类只需声明 layoutConfig（~15 行配置），不再手写布局构建过程。
   *
   * @param config - 声明式布局配置
   * @param opts - 安装选项（homeDir、projectDir、templateDir、allowWorkflow）
   * @returns 完整的 AdapterLayout，可直接传给 executeLayout()
   */
  public buildStandardLayout(
    config: LayoutConfig,
    opts: {
      homeDir: string;
      projectDir?: string;
      templateDir: string;
      allowWorkflow?: boolean;
    },
  ): AdapterLayout {
    const { homeDir, projectDir, templateDir, allowWorkflow = false } = opts;
    const adapterHome = this.resolveHome(homeDir);
    const adapterTemplateDir = path.join(templateDir, this.templateSubdir);
    const sections: AdapterSection[] = [];

    // ═══════════════════════════════════════════════════════════
    // 全局安装
    // ═══════════════════════════════════════════════════════════

    // 1. 全局目录
    if (config.globalDirs.length > 0) {
      sections.push({
        type: 'dirs',
        paths: [...config.globalDirs],
      });
    }

    // 2. 认知核心文件（AGENTS.md / CLAUDE.md）
    const coreDst = config.cognitiveCore.dstInHome
      ? path.join(homeDir, config.cognitiveCore.templateName)
      : path.join(adapterHome, config.cognitiveCore.templateName);
    sections.push({
      type: 'copy',
      src: path.join(adapterTemplateDir, config.cognitiveCore.templateName),
      dst: coreDst,
      strategy: config.cognitiveCore.strategy,
      replaceHome: config.cognitiveCore.replaceHome,
      ...(config.cognitiveCore.appendMarker && {
        appendMarker: config.cognitiveCore.appendMarker,
      }),
    });

    // 3. 额外的全局 copy 文件（如 Claude 的 MEMORY.md）
    if (config.extraGlobalCopies) {
      for (const extra of config.extraGlobalCopies) {
        sections.push({
          type: 'copy',
          src: path.join(adapterTemplateDir, extra.templateName),
          dst: path.join(adapterHome, extra.targetName),
          strategy: extra.strategy,
          replaceHome: extra.replaceHome,
        });
      }
    }

    // 4. 全局配置文件
    for (const cf of config.configFiles) {
      if (cf.type === 'merge-settings') {
        sections.push({
          type: 'merge-settings',
          srcPath: path.join(adapterTemplateDir, cf.templateName),
          dstPath: path.join(adapterHome, cf.targetName),
          replaceHome: cf.replaceHome,
          allowWorkflow: cf.allowWorkflow ? allowWorkflow : undefined,
        });
      } else {
        // type: 'copy'
        sections.push({
          type: 'copy',
          src: path.join(adapterTemplateDir, cf.templateName),
          dst: path.join(adapterHome, cf.targetName),
          strategy: cf.strategy ?? 'skip-if-exists',
          replaceHome: cf.replaceHome,
          ...(cf.appendMarker && { appendMarker: cf.appendMarker }),
        });
      }
    }

    // 5. 全局 copy-dir
    for (const cd of config.copyDirs) {
      sections.push({
        type: 'copy-dir',
        srcDir: path.join(adapterTemplateDir, cd.templateName),
        dstDir: path.join(adapterHome, cd.targetName),
        filter: cd.filter,
        strategy: cd.strategy,
        replaceHome: cd.replaceHome,
        counter: cd.counter,
      });
    }

    // 6. 全局 merge-agents
    if (config.mergeAgents) {
      sections.push({
        type: 'merge-agents',
        srcDir: path.join(adapterTemplateDir, config.mergeAgents.templateName),
        dstDir: path.join(adapterHome, config.mergeAgents.targetName),
      });
    }

    // 7. 全局 copy-skills
    if (config.copySkills) {
      sections.push({
        type: 'copy-skills',
        srcDir: path.join(adapterTemplateDir, config.copySkills.templateName),
        dstDir: path.join(adapterHome, config.copySkills.targetName),
      });
    }

    // 8. 全局 seed-memory
    if (config.seedMemory) {
      sections.push({
        type: 'seed-memory',
        srcDir: path.join(adapterTemplateDir, config.seedMemory.templateName),
        dstDir: path.join(adapterHome, 'memory'),
        files: [...config.seedMemory.files],
      });
    }

    // ═══════════════════════════════════════════════════════════
    // 项目级安装（可选）
    // ═══════════════════════════════════════════════════════════

    if (projectDir && config.project) {
      const proj = config.project;
      const projectAdapterDir = path.join(projectDir, this.projectSubdir);

      // 项目级认知核心文件（始终放在 projectDir 根目录）
      sections.push({
        type: 'copy',
        src: path.join(adapterTemplateDir, config.cognitiveCore.templateName),
        dst: path.join(projectDir, config.cognitiveCore.templateName),
        strategy: 'skip-if-exists',
        replaceHome: true,
      });

      // 项目级配置文件
      for (const cf of proj.configFiles) {
        // dstInProjectRoot: 文件放在 projectDir 根目录（如 Pi 的 settings.json、OpenCode 的 opencode.json）
        // 否则放在 projectAdapterDir 内（如 Claude 的 settings.json、Codex 的 config.toml）
        const dstBase = cf.dstInProjectRoot ? projectDir : projectAdapterDir;
        if (cf.type === 'merge-settings') {
          sections.push({
            type: 'merge-settings',
            srcPath: path.join(adapterTemplateDir, cf.templateName),
            dstPath: path.join(dstBase, cf.targetName),
            replaceHome: cf.replaceHome,
          });
        } else {
          // type: 'copy'
          sections.push({
            type: 'copy',
            src: path.join(adapterTemplateDir, cf.templateName),
            dst: path.join(dstBase, cf.targetName),
            strategy: cf.strategy ?? 'skip-if-exists',
            replaceHome: cf.replaceHome,
          });
        }
      }

      // 项目级 copy-dir
      for (const cd of proj.copyDirs) {
        sections.push({
          type: 'copy-dir',
          srcDir: path.join(adapterTemplateDir, cd.templateName),
          dstDir: path.join(projectAdapterDir, cd.targetName),
          filter: cd.filter,
          strategy: cd.strategy,
          replaceHome: cd.replaceHome,
          counter: cd.counter,
        });
      }

      // 项目级 merge-agents
      if (proj.mergeAgents) {
        sections.push({
          type: 'merge-agents',
          srcDir: path.join(adapterTemplateDir, proj.mergeAgents.templateName),
          dstDir: path.join(projectAdapterDir, proj.mergeAgents.targetName),
        });
      }

      // 项目级 copy-skills
      if (proj.copySkills) {
        sections.push({
          type: 'copy-skills',
          srcDir: path.join(adapterTemplateDir, proj.copySkills.templateName),
          dstDir: path.join(projectAdapterDir, proj.copySkills.targetName),
        });
      }

      // 项目级 seed-memory
      if (proj.seedMemory) {
        sections.push({
          type: 'seed-memory',
          srcDir: path.join(adapterTemplateDir, proj.seedMemory.templateName),
          dstDir: path.join(projectAdapterDir, 'memory'),
          files: [...proj.seedMemory.files],
        });
      }

      // 项目级权限
      if (proj.permissions) {
        for (const perm of proj.permissions) {
          sections.push({
            type: 'permissions',
            dir: perm.absolute ? perm.dir : path.join(projectAdapterDir, perm.dir),
            extension: perm.extension,
            mode: perm.mode,
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 全局权限
    // ═══════════════════════════════════════════════════════════

    for (const perm of config.permissions) {
      sections.push({
        type: 'permissions',
        dir: perm.absolute ? perm.dir : path.join(adapterHome, perm.dir),
        extension: perm.extension,
        mode: perm.mode,
      });
    }

    return { targetDir: adapterHome, sections };
  }

  /** 构建声明式安装布局。 */
  protected abstract buildLayout(opts: {
    homeDir: string;
    projectDir?: string;
    templateDir: string;
    allowWorkflow?: boolean;
  }): AdapterLayout;

  /** 返回验证检查项。子类实现以适配各自的安装结构。 */
  protected abstract verifyChecks(config: AdapterInstallConfig): AdapterVerifyCheck[];

  /**
   * 安装管线 —— 验证模板 → 确保项目目录 → 收集清单 → 执行布局 → 写入清单。
   * 子类通常无需覆盖。
   */
  install(config: AdapterInstallConfig): AdapterInstallResult {
    const homeDir = config.homeDir;
    const projectDir = this.resolveProjectDir(config);
    const templateDir = config.templateDir;
    const adapterHome = this.resolveHome(homeDir);
    const adapterTemplateDir = path.join(templateDir, this.templateSubdir);
    const dryRun = config.dryRun ?? false;

    // 1. 验证模板入口文件存在
    if (!fse.existsSync(path.join(adapterTemplateDir, this.templateEntryPoint))) {
      throw new Error(
        `${this.label} 模板未找到: ${adapterTemplateDir}\n` +
          `  请确保模板目录包含 ${this.templateSubdir}/ 子目录及 ${this.templateEntryPoint}。`,
      );
    }

    // 2. 确保项目级配置目录存在（项目级安装时）
    if (projectDir && !dryRun) {
      fse.ensureDirSync(path.join(projectDir, this.projectSubdir));
    }

    // 3. 创建清单收集器并执行布局
    const collector = new ManifestCollector();
    const layout = this.buildLayout({
      homeDir,
      projectDir,
      templateDir,
      allowWorkflow: config.allowWorkflow,
    });
    const summary = executeLayout(layout, { homeDir, dryRun, collector });

    // 4. 写入清单（非 dry-run 模式）—— 所有适配器统一获得清单支持
    if (!dryRun) {
      const adapterManifest = collector.build({
        adapterId: this.id,
        adapterVersion: this.version,
        homeDir,
        projectDir,
        adapterHome,
      });
      const pkgVersion = getEvokitVersion();
      updateAdapterManifest(homeDir, adapterManifest, pkgVersion);
    }

    // 5. 返回结果
    return {
      filesCreated: summary.filesCreated,
      filesSkipped: summary.filesSkipped,
      hooksInstalled: summary.hooksInstalled,
      commandsInstalled: summary.commandsInstalled,
      rulesInstalled: summary.rulesInstalled,
      agentsInstalled: summary.agentsInstalled,
      skillsInstalled: summary.skillsInstalled,
      adapterHome,
    };
  }

  /** 验证委托给子类的 verifyChecks()。 */
  verify(config: AdapterInstallConfig): AdapterVerifyCheck[] {
    return this.verifyChecks(config);
  }

  /** 状态检查 —— 通用逻辑，子类无需覆盖。 */
  status(config: AdapterInstallConfig): AdapterStatus {
    const adapterHome = this.resolveHome(config.homeDir);
    const checks = this.verifyChecks(config);
    const allPass = checks.every((c) => c.pass);

    return {
      installed: allPass,
      adapterHome,
      allPass,
      checks,
      projectDir: config.projectDir,
    };
  }

  /**
   * 卸载管线 —— 默认委托给清单驱动的 executeUninstall()。
   * 子类可覆盖以提供专有卸载逻辑。
   */
  uninstall(config: AdapterUninstallConfig): AdapterUninstallResult {
    const result = executeUninstall({
      homeDir: config.homeDir,
      adapterId: this.id,
      purge: config.purge ?? false,
      dryRun: config.dryRun ?? false,
      noBackup: config.noBackup ?? false,
      backupDir: config.backupDir,
      projectDir: config.projectDir,
      adapter: this, // 传入适配器实例，避免通过 registry 查找（解决循环依赖）
    });

    return {
      filesDeleted: result.filesDeleted,
      filesPreserved: result.filesPreserved,
      hooksRemoved: result.hooksRemoved,
      envVarsRemoved: result.envVarsRemoved,
      agentFieldsRemoved: result.agentFieldsRemoved,
      permissionsAllowRemoved: result.permissionsAllowRemoved,
      directoriesRemoved: result.directoriesRemoved,
      adapterHome: result.adapterHome,
      deletedFiles: result.deletedFiles,
      backupPath: result.backupPath,
      heuristic: result.heuristic,
      warnings: result.warnings,
    };
  }

  // ─── 通用 Memory / Session / Status API ──────────────────────
  // 从 Codex/Pi/OpenCode 三个适配器中提升的重复代码，
  // 用 this.resolveHome() + this.id 参数化差异。

  /**
   * 解析 memory 目录路径。
   * 默认为 resolveHome(homeDir) + '/memory'；子类可覆盖以支持自定义路径。
   */
  protected resolveMemoryDir(homeDir: string, _options?: Record<string, unknown>): string {
    return path.join(this.resolveHome(homeDir), 'memory');
  }

  /**
   * 将学习数据注入适配器可访问的 memory 目录。
   * 将纠正和观察写入 memory/corrections.jsonl 和 memory/observations.jsonl。
   */
  injectMemory(
    homeDir: string,
    data: {
      corrections?: Array<{ pattern: string; context: string }>;
      observations?: Array<{ pattern: string; confidence: number; source: string }>;
      learnedRules?: string;
    },
    options?: Record<string, unknown>,
  ): number {
    const memoryDir = this.resolveMemoryDir(homeDir, options);
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
   * 从 memory 目录导出学习数据。
   * 返回 corrections、observations、learnedRules、sessions 四类数据。
   */
  exportMemory(
    homeDir: string,
    options?: Record<string, unknown>,
  ): {
    corrections: unknown[];
    observations: unknown[];
    learnedRules: string;
    sessions: unknown[];
  } {
    const memoryDir = this.resolveMemoryDir(homeDir, options);

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
   * 记录带有适配器 ID 标签的会话条目。
   * assistant 字段自动使用 this.id。
   */
  recordSession(
    homeDir: string,
    session: Omit<SessionEntry, 'timestamp' | 'assistant'>,
    options?: Record<string, unknown>,
  ): void {
    const memoryDir = this.resolveMemoryDir(homeDir, options);
    fse.ensureDirSync(memoryDir);
    const sessionsPath = path.join(memoryDir, 'sessions.jsonl');

    const entry: SessionEntry = {
      timestamp: new Date().toISOString(),
      assistant: this.id as SessionEntry['assistant'],
      ...session,
    };

    fs.appendFileSync(sessionsPath, JSON.stringify(entry) + '\n', 'utf-8');
    fs.chmodSync(sessionsPath, 0o600);
  }

  /**
   * 获取适配器安装的状态摘要。
   * 默认实现检查 AGENTS.md + settings.json + memory 目录；
   * 子类可覆盖以提供更精确的状态检查。
   */
  getStatus(homeDir: string): {
    installed: boolean;
    adapterHome: string;
    agentsPresent: boolean;
    configPresent: boolean;
    memoryPresent: boolean;
    error?: string;
  } {
    const adapterHome = this.resolveHome(homeDir);
    const result = {
      installed: false,
      adapterHome,
      agentsPresent: false,
      configPresent: false,
      memoryPresent: false,
    };

    try {
      result.agentsPresent = fse.existsSync(path.join(adapterHome, 'AGENTS.md'));
      result.configPresent = fse.existsSync(path.join(adapterHome, 'settings.json'));
      result.memoryPresent = fse.existsSync(path.join(adapterHome, 'memory'));

      result.installed = result.agentsPresent || result.configPresent;
    } catch (e) {
      return { ...result, error: (e as Error).message };
    }

    return result;
  }
}
