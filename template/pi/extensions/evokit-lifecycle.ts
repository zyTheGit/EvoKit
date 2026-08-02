import { readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir, cwd } from 'os';

const PERSONAL_ROOT = join(homedir(), '.evokit', 'knowledge');

/**
 * EvoKit 项目上下文引擎生命周期扩展（v1.0）。
 * 处理 session_start（知识库完整性快检）与 session_shutdown（提示待确认）。
 * 知识根：个人 `~/.evokit/knowledge/`、项目 `<cwd>/.evokit/`（agent 无关共享）。
 * Installed by: evokit init --adapter pi
 */
export default function (pi: ExtensionAPI) {
  // ── 个人根 pending 计数 ──
  function pendingCount(dir: string): number {
    const pending = join(dir, '.pending');
    if (!existsSync(pending)) return 0;
    try {
      return readdirSync(pending).filter((f) => f.endsWith('.md')).length;
    } catch {
      return 0;
    }
  }

  // ── session_start: 知识库完整性快检 ──
  pi.on('session_start', async (_event, _ctx) => {
    mkdirSync(PERSONAL_ROOT, { recursive: true });
    const projectRoot = join(cwd(), '.evokit');
    const lines: string[] = [];
    lines.push('[EVOKIT] ═══════════════════════');
    lines.push('  项目上下文引擎：检查知识库完整性');

    for (const [scope, root] of [
      ['个人', PERSONAL_ROOT],
      ['项目', projectRoot],
    ] as const) {
      const indexOk = existsSync(join(root, 'knowledge-index.md'));
      const knowOk = existsSync(join(root, 'knowledge'));
      const pending = pendingCount(root);
      lines.push(`  ${scope}: 索引${indexOk ? '✓' : '✗'} 条目目录${knowOk ? '✓' : '✗'} 待确认${pending}`);
    }

    // 认知核心行数（≤150）
    const agentsPath = join(join(homedir(), '.pi', 'agent'), 'AGENTS.md');
    if (existsSync(agentsPath)) {
      const n = readFileSync(agentsPath, 'utf-8').split('\n').length;
      lines.push(`  AGENTS.md: ${n} 行 (限 150)`);
    }

    lines.push('═══════════════════════════════════');
    lines.push('  详细检查交给 evokit-boot');
    pi.sendMessage(lines.join('\n'));
  });

  // ── session_shutdown: 检查 .pending/ 提示确认 ──
  pi.on('session_shutdown', async (_event, _ctx) => {
    const p = pendingCount(PERSONAL_ROOT) + pendingCount(join(cwd(), '.evokit'));
    if (p > 0) {
      pi.sendMessage(`📋 有 ${p} 条待确认知识，运行 evokit learn 确认背书`);
    }
  });
}
