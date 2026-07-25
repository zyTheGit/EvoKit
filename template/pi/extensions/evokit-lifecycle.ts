import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const MEMORY_DIR = join(homedir(), '.pi', 'agent', 'memory');

/**
 * EvoKit 生命周期扩展 — 处理 session_start、session_shutdown 和 tool_call 事件。
 * Installed by: evokit init --adapter pi
 */
export default function (pi: ExtensionAPI) {
  // ── session_start: 启动验证 ──
  pi.on('session_start', async (_event, _ctx) => {
    mkdirSync(MEMORY_DIR, { recursive: true });
    const results: string[] = [];
    let passed = 0;
    let failed = 0;

    results.push('[EVOLUTION BOOT] ═══════════════════════');
    results.push('  Self-Evolving System (Pi CLI): checking integrity...');

    // 1. 检查全局配置
    const piDir = join(homedir(), '.pi', 'agent');
    for (const file of ['AGENTS.md', 'settings.json']) {
      const ok = existsSync(join(piDir, file));
      results.push(`  ${ok ? '✓' : '✗'} ~/.pi/agent/${file}`);
      ok ? passed++ : failed++;
    }

    // 2. 检查扩展
    const extDir = join(piDir, 'extensions');
    const extensions = ['evokit-lifecycle.ts', 'evokit-boot.ts', 'evokit-session.ts'];
    for (const ext of extensions) {
      const ok = existsSync(join(extDir, ext));
      results.push(`  ${ok ? '✓' : '⚠'} extensions/${ext}`);
      ok ? passed++ : failed++;
    }

    // 3. 检查内存文件
    for (const file of ['corrections.jsonl', 'learned-rules.md', 'observations.jsonl']) {
      const ok = existsSync(join(MEMORY_DIR, file));
      results.push(`  ${ok ? '✓' : '⚠'} memory/${file}`);
      ok ? passed++ : failed++;
    }

    // 4. AGENTS.md 行数限制
    const agentsPath = join(piDir, 'AGENTS.md');
    if (existsSync(agentsPath)) {
      const lines = readFileSync(agentsPath, 'utf-8').split('\n').length;
      const ok = lines <= 150;
      results.push(`  ${ok ? '✓' : '✗'} AGENTS.md: ${lines} lines (limit 150)`);
      ok ? passed++ : failed++;
    }

    // 5. learned-rules.md 行数限制
    const rulesPath = join(MEMORY_DIR, 'learned-rules.md');
    if (existsSync(rulesPath)) {
      const rulesLines = readFileSync(rulesPath, 'utf-8').split('\n').length;
      const ok = rulesLines <= 50;
      results.push(`  ${ok ? '✓' : '✗'} learned-rules.md: ${rulesLines} lines (limit 50)`);
      ok ? passed++ : failed++;
    }

    results.push('═══════════════════════════════════════');
    results.push(`  Integrity: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      results.push('  Run /evokit-boot for detailed diagnostics.');
    }
    results.push('═══════════════════════════════════════');

    // 记录违规
    if (failed > 0) {
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        bootFailed: failed,
        bootPassed: passed,
      });
      appendFileSync(join(MEMORY_DIR, 'violations.jsonl'), entry + '\n', 'utf-8');
    }

    pi.sendMessage(results.join('\n'));
  });

  // ── session_shutdown: 会话记录 ──
  pi.on('session_shutdown', async (_event, _ctx) => {
    mkdirSync(MEMORY_DIR, { recursive: true });
    const sessionsPath = join(MEMORY_DIR, 'sessions.jsonl');
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      assistant: 'pi',
      action: 'shutdown',
    });
    appendFileSync(sessionsPath, entry + '\n', 'utf-8');
  });

  // ── tool_call: 注入已学规则上下文 ──
  pi.on('tool_call', async (event, _ctx) => {
    const rulesPath = join(MEMORY_DIR, 'learned-rules.md');
    if (existsSync(rulesPath)) {
      const rules = readFileSync(rulesPath, 'utf-8').trim();
      if (rules) {
        // 通过 context 注入（如果事件支持）
        if (event && typeof event === 'object' && 'context' in event) {
          (event as { context: string }).context += `\nEvoKit learned rules:\n${rules}\n`;
        }
      }
    }
  });
}
