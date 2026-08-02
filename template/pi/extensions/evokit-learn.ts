import { execSync } from 'child_process';

/**
 * EvoKit 确认背书扩展（v1.0）。
 * 提供 `evokit-learn` 命令，作为"同一道人工背书"闸门的 pi 入口壳：
 * - 无 content：列出待确认草稿（逐条确认 / 拒绝）
 * - 有 content：显式声明知识（当场背书）
 * 逻辑统一落到 `evokit learn` CLI（引擎层纯函数），4 助手同一确认语义。
 * Installed by: evokit init --adapter pi
 */
export default function (pi: ExtensionAPI) {
  pi.registerCommand('evokit-learn', {
    description: '知识确认背书 / 显式声明（对话提取确认闸门）',
    async execute(args: {
      content?: string;
      impact?: string;
      scope?: string;
      type?: string;
      project_dir?: string;
    }) {
      const parts = ['evokit', 'learn'];
      if (args.content) parts.push(JSON.stringify(args.content));
      if (args.project_dir) parts.push('--project-dir', JSON.stringify(args.project_dir));
      if (args.scope) parts.push('--scope', args.scope);
      if (args.type) parts.push('--type', args.type);
      if (args.impact) parts.push('--impact', JSON.stringify(args.impact));
      try {
        return execSync(parts.join(' '), { encoding: 'utf-8' });
      } catch (err: unknown) {
        const e = err as { stderr?: string; message?: string };
        return e.stderr || e.message || String(err);
      }
    },
  });
}
