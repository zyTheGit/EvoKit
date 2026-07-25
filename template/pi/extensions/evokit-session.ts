import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const MEMORY_DIR = join(homedir(), '.pi', 'agent', 'memory');

/**
 * EvoKit 会话记录扩展 — 记录会话生命周期。
 * 在会话结束前调用 /evokit-session action:end。
 * Installed by: evokit init --adapter pi
 */
export default function (pi: ExtensionAPI) {
  pi.registerCommand('evokit-session', {
    description: '记录 EvoKit 会话生命周期 — 结束前调用 action: end',
    async execute(args: { action: string; duration?: number; model?: string; score?: string }) {
      mkdirSync(MEMORY_DIR, { recursive: true });
      const sessionsPath = join(MEMORY_DIR, 'sessions.jsonl');
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        assistant: 'pi',
        action: args.action,
        duration_seconds: args.duration || 0,
        model: args.model || 'unknown',
        score: args.score || '',
      });
      appendFileSync(sessionsPath, entry + '\n', 'utf-8');
      return `✅ 会话 ${args.action} 已记录。\n`;
    },
  });
}
