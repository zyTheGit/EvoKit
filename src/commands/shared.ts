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
import type { AdapterInstaller } from '../adapters/types.js';
import { note } from '@clack/prompts';

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

// ─── printNextSteps ─────────────────────────────────────────

/**
 * 适配器 ID → 后续步骤文案映射（install 命令风格，使用 @clack/prompts note 展示）。
 * 集中管理，避免 install.ts 和 init.ts 中的 switch-case 重复。
 */
const NEXT_STEPS_CLACK: Record<string, string> = {
  claude: 'Claude Code：\n' + '  1. 启动 Claude Code\n' + '  2. 运行 /boot 进行验证',
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
 * 适配器 ID → 后续步骤文案映射（init 命令风格，使用 console.log 展示）。
 * 与 CLACK 版本的文案略有差异（如 "验证系统健康状态" vs "进行验证"），
 * 保持与原始 printInitNextSteps 输出完全一致。
 */
const NEXT_STEPS_CONSOLE: Record<string, string[]> = {
  claude: ['启动 Claude Code', '运行 /boot 验证系统健康状态'],
  codex: ['启动 Codex（钩子自动运行）', '运行：evokit doctor --adapter codex'],
  opencode: ['进入项目目录并启动 OpenCode', '调用 evokit-boot 工具验证系统健康状态'],
  pi: ['已就绪'],
};

/**
 * 生成后续步骤文案（纯函数，install 命令风格）。
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

/**
 * 使用 @clack/prompts 的 note 组件展示后续步骤（install 命令风格）。
 * 输出格式与原始 install.ts 中的 printNextSteps 完全一致。
 */
export function printNextStepsClack(adapterIds: string[]): void {
  const lines = getNextStepsLines(adapterIds);
  note(lines.join('\n\n'), '后续步骤');
}

/**
 * 使用 console.log 展示后续步骤（init 命令风格，带颜色）。
 * 输出格式与原始 init.ts 中的 printInitNextSteps 完全一致。
 */
export function printNextStepsConsole(adapterIds: string[]): void {
  for (const id of adapterIds) {
    const steps = NEXT_STEPS_CONSOLE[id];
    if (steps) {
      // 从 NEXT_STEPS_CLACK 获取适配器显示名称
      const displayName = NEXT_STEPS_CLACK[id]?.split('：')[0] || id;
      console.log(pc.cyan(`  后续步骤（${displayName}）：`));
      for (let i = 0; i < steps.length; i++) {
        console.log(`  ${i + 1}. ${steps[i]}`);
      }
    } else {
      console.log(pc.cyan(`  后续步骤（${id}）：`));
      console.log('  已就绪');
    }
    console.log('');
  }
}
