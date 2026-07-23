import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/** 解析 Pi 配置根目录，遵循 PI_CODING_AGENT_DIR 环境变量 */
function resolvePiHome(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
}

/** 解析 Pi 记忆数据目录 */
function resolvePiMemoryDir(): string {
  return join(resolvePiHome(), 'memory');
}

/**
 * EvoKit 演化审计扩展 — 将修正提升为已学习规则。
 * Installed by: evokit init --adapter pi
 */
export default function (pi: ExtensionAPI) {
  pi.registerCommand('evokit-evolve', {
    description: '运行 EvoKit 演化审计 — 将修正提升为已学习规则',
    async execute() {
      const MEMORY_DIR = resolvePiMemoryDir();
      mkdirSync(MEMORY_DIR, { recursive: true });
      const correctionsPath = join(MEMORY_DIR, 'corrections.jsonl');
      if (!existsSync(correctionsPath)) {
        return '未找到修正记录 — 无需演化。\n';
      }

      const corrections = readFileSync(correctionsPath, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));

      const grouped = new Map();
      for (const c of corrections) {
        const key = c.pattern;
        if (!grouped.has(key)) grouped.set(key, { pattern: key, entries: [], count: 0 });
        grouped.get(key).entries.push(c);
        grouped.get(key).count++;
      }

      const report: string[] = [];
      report.push('# EvoKit 演化审计\n');
      let promoted = 0;

      const rulesPath = join(MEMORY_DIR, 'learned-rules.md');
      let existingRules = existsSync(rulesPath) ? readFileSync(rulesPath, 'utf-8') : '';

      for (const [pattern, group] of grouped) {
        if (group.count >= 2 && !existingRules.includes(pattern)) {
          const ruleEntry = `- **${pattern}**\n  <!-- verify: echo "verify: ${pattern}" -->\n  promoted: ${new Date().toISOString().split('T')[0]}\n\n`;
          appendFileSync(rulesPath, ruleEntry, 'utf-8');
          report.push(`✅ 已提升: "${pattern}"\n`);
          promoted++;
        } else if (group.count < 2) {
          report.push(`⏳ "${pattern}" — 仅 ${group.count}/2 次出现，推迟\n`);
        } else {
          report.push(`ℹ️ "${pattern}" — 已提升\n`);
        }
      }

      const logPath = join(MEMORY_DIR, 'evolution-log.md');
      const logEntry = `## ${new Date().toISOString().split('T')[0]} — 提升 ${promoted} 条规则\n`;
      appendFileSync(logPath, logEntry, 'utf-8');

      report.push(`\n**已提升: ${promoted} 条规则**\n`);
      return report.join('\n');
    },
  });
}
