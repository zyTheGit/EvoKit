import { readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir, cwd } from 'os';

const PERSONAL_ROOT = join(homedir(), '.evokit', 'knowledge');

/**
 * EvoKit 知识库完整性检查扩展（v1.0）。
 * 供 Pi 命令手动调用，检查个人根与项目根的知识库结构/索引/frontmatter。
 * 只读不修改。详细诊断交给 `evokit boot` CLI。
 * Installed by: evokit init --adapter pi
 */
export default function (pi: ExtensionAPI) {
  pi.registerCommand('evokit-boot', {
    description: 'EvoKit 知识库完整性深度检查（只读）',
    async execute() {
      const roots: Array<[string, string]> = [
        ['个人', PERSONAL_ROOT],
        ['项目', join(cwd(), '.evokit')],
      ];
      const lines: string[] = ['# 🔍 EvoKit 知识库检查 (Pi CLI)\n'];
      let passed = 0,
        failed = 0;
      const mark = (ok: boolean) => {
        ok ? passed++ : failed++;
        return ok ? '✅' : '❌';
      };

      // Pi 核心文件
      const piDir = join(homedir(), '.pi', 'agent');
      for (const f of ['AGENTS.md', 'settings.json']) {
        lines.push(`${mark(existsSync(join(piDir, f)))} ~/.pi/agent/${f}`);
      }

      for (const [scope, root] of roots) {
        lines.push(`\n## ${scope} 知识库 \`${root}\``);
        const indexOk = existsSync(join(root, 'knowledge-index.md'));
        const knowOk = existsSync(join(root, 'knowledge'));
        const pendingOk = existsSync(join(root, '.pending'));
        lines.push(`${mark(indexOk)} index (\`knowledge-index.md\`)`);
        lines.push(`${mark(knowOk)} knowledge 目录`);
        lines.push(`${mark(pendingOk)} .pending 目录`);

        // frontmatter 起始 `---`
        const knowledgeDir = join(root, 'knowledge');
        if (existsSync(knowledgeDir)) {
          let bad = 0;
          for (const f of readdirSync(knowledgeDir)) {
            if (!f.endsWith('.md')) continue;
            const first = readFileSync(join(knowledgeDir, f), 'utf-8').split('\n')[0];
            if (first.trim() !== '---') bad++;
          }
          if (bad > 0) {
            lines.push(`❌ ${bad} 个条目缺少 frontmatter`);
            failed += bad;
          } else {
            lines.push(`✅ 条目 frontmatter 合法`);
            passed++;
          }
        }
      }

      lines.push(`\n---\n**${passed} passed, ${failed} failed**`);
      return lines.join('\n');
    },
  });
}
