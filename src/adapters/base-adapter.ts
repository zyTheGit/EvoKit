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
import path from 'node:path';

import type {
  AdapterInstallConfig,
  AdapterInstallResult,
  AdapterStatus,
  AdapterUninstallConfig,
  AdapterUninstallResult,
  AdapterVerifyCheck,
} from './types.js';
import type { AdapterLayout } from '../core/layout-types.js';
import { executeLayout } from '../core/layout-engine.js';
import { ManifestCollector } from '../core/manifest-collector.js';
import { updateAdapterManifest } from '../core/manifest.js';
import { executeUninstall } from '../core/uninstall-engine.js';
import { getEvokitVersion } from '../core/version.js';

/**
 * 启发式卸载配置 —— 描述适配器的文件结构，用于清单缺失时的回退卸载。
 * 与 uninstall-engine.ts 的 AdapterHeuristicConfig 对应。
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
export abstract class BaseAdapter {
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
    return config.projectDir;
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

  /** 构建声明式安装布局。 */
  protected abstract buildLayout(opts: {
    homeDir: string;
    projectDir?: string;
    templateDir: string;
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
    const layout = this.buildLayout({ homeDir, projectDir, templateDir });
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
      force: false,
      purge: config.purge ?? false,
      dryRun: config.dryRun ?? false,
      noBackup: config.noBackup ?? false,
      backupDir: config.backupDir,
      projectDir: config.projectDir,
    });

    return {
      filesDeleted: result.filesDeleted,
      filesPreserved: result.filesPreserved,
      hooksRemoved: result.hooksRemoved,
      envVarsRemoved: result.envVarsRemoved,
      agentFieldsRemoved: result.agentFieldsRemoved,
      directoriesRemoved: result.directoriesRemoved,
      backupPath: result.backupPath,
      heuristic: result.heuristic,
      warnings: result.warnings,
    };
  }
}
