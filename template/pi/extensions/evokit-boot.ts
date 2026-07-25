import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const MEMORY_DIR = join(homedir(), '.pi', 'agent', 'memory');

/**
 * EvoKit 启动验证扩展 — 可通过 Pi 命令手动调用。
 * Installed by: evokit init --adapter pi
 */
export default function (pi: ExtensionAPI) {
  pi.registerCommand('evokit-boot', {
    description: '运行 EvoKit 启动验证 — 检查系统完整性和已学习规则',
    async execute() {
      mkdirSync(MEMORY_DIR, { recursive: true });
      const results: string[] = [];
      let passed = 0,
        failed = 0;

      results.push('# 🔍 EvoKit 启动验证 (Pi CLI)\n');

      const piDir = join(homedir(), '.pi', 'agent');
      for (const file of ['AGENTS.md', 'settings.json']) {
        const ok = existsSync(join(piDir, file));
        results.push(`${ok ? '✅' : '❌'} ~/.pi/agent/${file}`);
        ok ? passed++ : failed++;
      }

      // 运行 learned-rules.md 中的验证命令
      const rulesPath = join(MEMORY_DIR, 'learned-rules.md');
      if (existsSync(rulesPath)) {
        const rules = readFileSync(rulesPath, 'utf-8');
        const verifyRegex = /verify:\s*(.+)$/gm;
        let match;
        while ((match = verifyRegex.exec(rules)) !== null) {
          const cmd = match[1].trim();
          try {
            const { execSync } = await import('child_process' as string);
            execSync(cmd, { timeout: 10000, stdio: 'pipe' });
            results.push(`✅ verify: \`${cmd}\``);
            passed++;
          } catch {
            results.push(`❌ verify: \`${cmd}\``);
            failed++;
          }
        }
      }

      results.push(`\n---\n**${passed} passed, ${failed} failed**\n`);

      // 记录违规
      if (failed > 0) {
        const entry = JSON.stringify({
          timestamp: new Date().toISOString(),
          bootFailed: failed,
          bootPassed: passed,
        });
        appendFileSync(join(MEMORY_DIR, 'violations.jsonl'), entry + '\n', 'utf-8');
      }

      return results.join('\n');
    },
  });
}
