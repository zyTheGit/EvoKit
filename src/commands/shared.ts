/**
 * EvoKit — 命令层共享编排逻辑
 *
 * 提取自 install / uninstall / init / doctor 命令中的重复代码，
 * 形成可测试的纯函数。命令 action 回调只做参数绑定 + 调用纯函数 + 处理退出码。
 *
 * @packageDocumentation
 */

import pc from 'picocolors';
import { getInstaller, listAdapters } from '../adapters/index.js';
import type {
  AdapterInstaller,
  AdapterInstallResult,
  AdapterInstallConfig,
} from '../adapters/types.js';
import { note, log, outro, spinner } from '@clack/prompts';
import type { AdapterVerifyCheck } from '../adapters/types.js';

// ─── resolveHomeDir ─────────────────────────────────────────

/** 命令行选项中 homeDir 相关字段的类型 */
export interface HomeDirOptions {
  /** --home 选项值（uninstall / doctor） */
  home?: string;
  /** 位置参数 directory（init） */
  directory?: string;
}

/**
 * 统一解析用户主目录。
 *
 * 优先级：--home / 位置参数 → $HOME → $USERPROFILE → 空字符串（触发错误）。
 *
 * @returns 解析后的 homeDir 绝对路径
 * @throws 若无法确定主目录则抛出错误
 */
export function resolveHomeDir(options: HomeDirOptions = {}): string {
  const homeDir =
    options.home || options.directory || process.env.HOME || process.env.USERPROFILE || '';
  if (!homeDir) {
    throw new Error('无法确定主目录。请设置 $HOME 环境变量后重试。');
  }
  return homeDir;
}

// ─── resolveAdapter ─────────────────────────────────────────

/** 适配器解析失败时的错误信息 */
export interface AdapterResolveError {
  message: string;
  availableAdapters: string;
}

/**
 * 统一查找并验证适配器。
 *
 * 成功时返回适配器实例；失败时返回错误信息对象（不抛异常），
 * 由调用方决定如何展示错误（log.error / console.error / process.exit）。
 *
 * @param adapterId 适配器 ID（如 'claude'、'codex'）
 * @returns 成功时为 { ok: true, installer }，失败时为 { ok: false, error }
 */
export function resolveAdapter(
  adapterId: string,
): { ok: true; installer: AdapterInstaller } | { ok: false; error: AdapterResolveError } {
  try {
    const installer = getInstaller(adapterId);
    return { ok: true, installer };
  } catch {
    const available = listAdapters()
      .map((a) => a.id)
      .join(', ');
    return {
      ok: false,
      error: {
        message: `未知适配器："${adapterId}"`,
        availableAdapters: `可用适配器：${available}`,
      },
    };
  }
}

// ─── formatInstallResult ────────────────────────────────────

/** formatInstallResult 的选项 */
export interface FormatInstallResultOptions {
  /** 适配器显示名称（如 'Claude Code'） */
  label: string;
  /** 动作词（如 '安装'、'更新'） */
  verb: string;
  /** 安装结果 */
  result: AdapterInstallResult;
  /** 是否显示目标路径（init 不显示） */
  showTargetPath?: boolean;
  /** 跳过文件的提示文案（如 update 的"用户数据保留"） */
  skipHint?: string;
  /** 标题格式：'label-verb' 为「{label} {verb}结果」（默认），'verb-label' 为「{verb} {label}」（init 旧风格） */
  titleFormat?: 'verb-label' | 'label-verb';
}

/**
 * 格式化安装/更新结果为文本行数组（纯函数）。
 *
 * 统一 install / init / update 三命令的结果展示逻辑。
 * 调用方用 note() 或其他方式展示返回的行。
 *
 * @param options 格式化选项
 * @returns 格式化后的文本行数组
 */
export function formatInstallResult(options: FormatInstallResultOptions): string[] {
  const { verb, result, showTargetPath = true, skipHint } = options;
  const lines: string[] = [];

  // 目标路径
  if (showTargetPath) {
    lines.push(`目标路径：${result.adapterHome}`);
  }

  // 文件计数
  lines.push(`已${verb}：${result.filesCreated} 个文件，跳过 ${result.filesSkipped} 个`);

  // 分类计数
  if (result.hooksInstalled > 0) lines.push(`钩子：已${verb} ${result.hooksInstalled} 个`);
  if (result.rulesInstalled > 0) lines.push(`规则：已${verb} ${result.rulesInstalled} 个`);
  if (result.agentsInstalled > 0) lines.push(`代理：已${verb} ${result.agentsInstalled} 个`);
  if (result.commandsInstalled > 0) lines.push(`命令：已${verb} ${result.commandsInstalled} 个`);
  if (result.skillsInstalled > 0) lines.push(`技能：已${verb} ${result.skillsInstalled} 个`);

  // 各类别简要说明（帮助用户理解装了什么）
  if (result.hooksInstalled > 0) lines.push(`  钩子 — 会话启动/结束时自动检查知识库`);
  if (result.rulesInstalled > 0) lines.push(`  规则 — 编码、安全与完整性约束`);
  if (result.agentsInstalled > 0) lines.push(`  代理 — 内置 sub-agent（architect 等）`);
  if (result.commandsInstalled > 0)
    lines.push(`  命令 — 斜杠命令（/evokit-boot、/evokit-learn、/evokit-review）`);
  if (result.skillsInstalled > 0) lines.push(`  技能 — 能力扩展（learning-recorder 等）`);

  // 跳过提示
  if (result.filesSkipped > 0 && skipHint) {
    lines.push(`已跳过：${result.filesSkipped} 个文件（${skipHint}）`);
  }

  return lines;
}

/**
 * 使用 @clack/prompts 的 note 组件展示安装/更新结果。
 *
 * @param options 格式化选项（同 formatInstallResult）
 */
export function printInstallResult(options: FormatInstallResultOptions): void {
  const lines = formatInstallResult(options);
  const title =
    options.titleFormat === 'verb-label'
      ? `EvoKit — ${options.verb} ${options.label}`
      : `EvoKit — ${options.label} ${options.verb}结果`;
  note(lines.join('\n'), title);
}

// ─── printSummaryOutro ─────────────────────────────────────

/**
 * 统一显示命令执行摘要（outro / 警告）。
 *
 * 根据 dryRun 和 allPass 状态显示不同风格的结束信息。
 *
 * @param verb 动作词（如 '安装'、'更新'）
 * @param dryRun 是否为 dry-run 模式
 * @param allPass 是否所有适配器都成功
 */
export function printSummaryOutro(verb: string, dryRun: boolean, allPass: boolean): void {
  if (dryRun) {
    outro('模拟运行完成 — 未修改任何文件');
  } else if (allPass) {
    outro(`EvoKit ${verb}成功！`);
  } else {
    log.warning(`${verb}完成但有警告——请查看上方输出`);
  }
}

// ─── runAdapterInstallLoop ─────────────────────────────────

/** runAdapterInstallLoop 的选项 */
export interface RunAdapterInstallLoopOptions {
  /** 动作词（如 '安装'、'更新'） */
  verb: string;
  /** 适配器安装配置（调用方构建，不含 adapter 特有字段） */
  config: AdapterInstallConfig;
  /** 是否运行验证 */
  verify?: boolean;
  /** dry-run 模式 */
  dryRun?: boolean;
  /** 跳过文件的提示文案（如 update 的 "用户数据保留"） */
  skipHint?: string;
  /** 快速失败模式：适配器解析失败时立即抛错而非 continue（init 命令需要） */
  failFast?: boolean;
  /** 是否显示目标路径（init 不显示，默认 true） */
  showTargetPath?: boolean;
  /** 验证展示风格：'full' 逐项显示所有检查结果，'summary' 只显示失败项（init 使用） */
  verifyStyle?: 'full' | 'summary';
  /** 标题格式：'verb-label' 为「{verb} {label}」（init 旧风格），默认 'label-verb' */
  titleFormat?: 'verb-label' | 'label-verb';
}

/**
 * 统一适配器安装循环 —— spinner 管理 + try/catch + 结果展示 + 验证。
 *
 * 消除 install / init / update 三个命令中重复的循环模式。
 * 调用方在循环外构建 config，传入 adapterIds 列表。
 *
 * @param adapterIds 适配器 ID 列表
 * @param options 循环选项
 * @returns 所有适配器是否全部成功
 */
export function runAdapterInstallLoop(
  adapterIds: string[],
  options: RunAdapterInstallLoopOptions,
): boolean {
  const {
    verb,
    config,
    verify,
    dryRun,
    skipHint,
    failFast,
    showTargetPath,
    verifyStyle = 'full',
    titleFormat,
  } = options;
  let allPass = true;

  for (const id of adapterIds) {
    const resolved = resolveAdapter(id);
    if (!resolved.ok) {
      log.error(resolved.error.message);
      log.error(resolved.error.availableAdapters);
      allPass = false;
      // 快速失败模式：init 命令在适配器解析失败时立即退出，保持原有语义
      if (failFast) {
        process.exit(1);
      }
      continue;
    }
    const installer = resolved.installer;

    const s = spinner();
    s.start(`正在${verb} ${installer.label}...`);

    try {
      const result = installer.install(config);
      s.stop(`${installer.label} ${verb}完成`);

      printInstallResult({
        label: installer.label,
        verb,
        result,
        skipHint,
        showTargetPath,
        titleFormat,
      });

      if (verify && !dryRun) {
        const checks = installer.verify(config);
        if (verifyStyle === 'summary') {
          printVerificationSummary(installer, checks);
        } else {
          printVerification(installer, checks);
        }
        const pass = checks.every((c) => c.pass);
        if (!pass) allPass = false;
      }
    } catch (err: any) {
      s.stop(`${verb}失败`);
      log.error(`${installer.label}：${err.message}`);
      allPass = false;
    }
  }

  return allPass;
}

// ─── printVerification ──────────────────────────────────────

/**
 * 使用 @clack/prompts 展示验证检查结果。
 *
 * 提取自 install.ts 和 update.ts 中的完全重复实现。
 *
 * @param installer 适配器信息（仅需 label）
 * @param checks 验证检查项列表
 */
export function printVerification(
  installer: { label: string },
  checks: AdapterVerifyCheck[],
): void {
  log.step(`正在验证 ${installer.label}...`);
  for (const check of checks) {
    if (check.pass) {
      log.success(`${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
    } else {
      log.error(`${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
    }
  }
}

/**
 * 摘要模式展示验证检查结果（init 命令风格）。
 *
 * 只显示失败项；全部通过时显示 ✅ 验证通过。
 *
 * @param installer 适配器信息（仅需 label）
 * @param checks 验证检查项列表
 */
export function printVerificationSummary(
  installer: { label: string },
  checks: AdapterVerifyCheck[],
): void {
  const failed = checks.filter((c) => !c.pass);
  if (failed.length === 0) {
    log.success(`${installer.label} 验证通过`);
  } else {
    log.warning(`${installer.label}：${failed.length} 项验证检查未通过`);
    for (const check of failed) {
      log.error(`${pc.red('✗')} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
    }
  }
}

// ─── printNextSteps ─────────────────────────────────────────

/**
 * 适配器 ID → 后续步骤文案映射（install 命令风格，使用 @clack/prompts note 展示）。
 * 集中管理，避免 install.ts 和 init.ts 中的 switch-case 重复。
 */
const NEXT_STEPS_CLACK: Record<string, string> = {
  claude:
    'Claude Code：\n' +
    '  1. 启动 Claude Code\n' +
    '  2. 运行 /evokit-boot 进行验证（或 npx evokit boot）',
  codex:
    'Codex CLI：\n' +
    '  1. 启动 Codex（钩子自动运行）\n' +
    '  2. 运行：npx evokit doctor --adapter codex',
  opencode:
    'OpenCode CLI：\n' +
    '  1. 进入项目目录并启动 OpenCode\n' +
    '  2. 运行 evokit-boot 工具进行验证',
  pi: 'Pi CLI：已就绪',
};

/**
 * 生成后续步骤文案（纯函数）。
 *
 * @param adapterIds 已安装的适配器 ID 列表
 * @returns 后续步骤文本行数组，每项为一个适配器的步骤或通用提示
 */
export function getNextStepsLines(adapterIds: string[]): string[] {
  const lines: string[] = [];

  for (const id of adapterIds) {
    const step = NEXT_STEPS_CLACK[id] || `${id}：已就绪`;
    lines.push(step);
  }

  lines.push('命令行用法：npx evokit doctor');
  lines.push('或全局安装：npm install -g @zythegit/evokit');
  lines.push('文档：https://github.com/zyTheGit/EvoKit');

  return lines;
}

/** printNextSteps 的选项 */
export interface PrintNextStepsOptions {
  /** brief 模式仅显示 doctor 提示（适用于 update 等已安装场景） */
  brief?: boolean;
}

/**
 * 统一展示后续步骤。
 *
 * - 默认模式（brief: false）使用 @clack/prompts note 展示完整步骤（install/init）。
 * - brief 模式仅显示 doctor 提示（update）。
 *
 * @param adapterIds 已安装的适配器 ID 列表
 * @param options 展示选项
 */
export function printNextSteps(adapterIds: string[], options?: PrintNextStepsOptions): void {
  if (options?.brief) {
    log.info(`运行 ${pc.cyan('evokit doctor')} 验证系统健康状态。`);
    return;
  }
  const lines = getNextStepsLines(adapterIds);
  note(lines.join('\n\n'), '后续步骤');
}
