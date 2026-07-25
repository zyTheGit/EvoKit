import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const MEMORY_DIR = join(homedir(), '.pi', 'agent', 'memory');

/**
 * EvoKit 记忆管理扩展 — 记录修正、观察和注入上下文。
 * Installed by: evokit init --adapter pi
 */
export default function (pi: ExtensionAPI) {
  pi.registerCommand('evokit-memory', {
    description: '管理 EvoKit 学习数据 — 记录修正、观察和注入上下文',
    async execute(args: { action: string; pattern?: string; context?: string }) {
      mkdirSync(MEMORY_DIR, { recursive: true });

      switch (args.action) {
        case 'record-correction': {
          if (!args.pattern) return '错误: record-correction 需要 pattern 参数\n';
          const entry = JSON.stringify({
            timestamp: new Date().toISOString(),
            pattern: args.pattern,
            context: args.context || '',
            count: 1,
          });
          appendFileSync(join(MEMORY_DIR, 'corrections.jsonl'), entry + '\n', 'utf-8');
          return `✅ 修正已记录: "${args.pattern}"\n`;
        }

        case 'record-observation': {
          if (!args.pattern) return '错误: record-observation 需要 pattern 参数\n';
          const entry = JSON.stringify({
            timestamp: new Date().toISOString(),
            pattern: args.pattern,
            confidence: 0.5,
            source: 'auto',
          });
          appendFileSync(join(MEMORY_DIR, 'observations.jsonl'), entry + '\n', 'utf-8');
          return `✅ 观察已记录: "${args.pattern}"\n`;
        }

        case 'export': {
          const output = ['# EvoKit 内存导出\n'];
          for (const file of [
            'corrections.jsonl',
            'observations.jsonl',
            'learned-rules.md',
            'sessions.jsonl',
          ]) {
            const filePath = join(MEMORY_DIR, file);
            if (existsSync(filePath)) {
              output.push(`## ${file}\n`);
              output.push(readFileSync(filePath, 'utf-8'));
              output.push('\n');
            }
          }
          return output.join('');
        }

        case 'inject': {
          const rulesPath = join(MEMORY_DIR, 'learned-rules.md');
          if (existsSync(rulesPath)) {
            return `EvoKit learned rules for this session:\n${readFileSync(rulesPath, 'utf-8')}\n`;
          }
          return '未找到已学习规则。\n';
        }

        default:
          return `错误: 未知操作 "${args.action}"\n`;
      }
    },
  });
}
