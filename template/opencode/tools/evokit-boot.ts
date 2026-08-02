import { tool } from "@opencode-ai/plugin";
import { readFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, homedir } from "path";

const PERSONAL_ROOT = join(homedir(), ".evokit", "knowledge");

/**
 * EvoKit boot 知识库完整性检查工具（v1.0，只读）。
 * 检查个人根 ~/.evokit/knowledge/ 与项目根 <cwd>/.evokit/ 的
 * 目录结构、索引、frontmatter、待确认。不修改任何文件。
 */
export default tool({
  description: "Run EvoKit boot verification — check shared knowledge base integrity（只读）",
  args: {},
  async execute(_args, context) {
    const projectRoot = join(context.directory, ".evokit");
    const results: string[] = [];
    let passed = 0;
    let failed = 0;
    const mark = (ok: boolean) => {
      ok ? passed++ : failed++;
      return ok ? "✅" : "❌";
    };

    results.push("# 🔍 EvoKit 知识库检查 (v1.0)\n");

    // ── 1. Core files ──
    results.push("## Core Files\n");
    const globalDir = join(homedir(), ".config", "opencode");
    for (const file of ["AGENTS.md", "opencode.json"]) {
      results.push(`${mark(existsSync(join(globalDir, file)))} ~/.config/opencode/${file} (global)`);
      results.push(`${mark(existsSync(join(context.directory, file)))} ${file} (project)`);
    }

    // ── 2. Knowledge roots ──
    results.push("\n## Knowledge Roots\n");
    for (const [scope, root] of [
      ["个人", PERSONAL_ROOT],
      ["项目", projectRoot],
    ] as const) {
      results.push(`\n### ${scope} \`${root}\``);
      const indexOk = existsSync(join(root, "knowledge-index.md"));
      const knowOk = existsSync(join(root, "knowledge"));
      const pendingOk = existsSync(join(root, ".pending"));
      results.push(`${mark(indexOk)} knowledge-index.md`);
      results.push(`${mark(knowOk)} knowledge/`);
      results.push(`${mark(pendingOk)} .pending/`);

      // frontmatter 检查
      const knowledgeDir = join(root, "knowledge");
      if (existsSync(knowledgeDir)) {
        let bad = 0;
        for (const f of readdirSync(knowledgeDir)) {
          if (!f.endsWith(".md")) continue;
          const first = readFileSync(join(knowledgeDir, f), "utf-8").split("\n")[0];
          if (first.trim() !== "---") bad++;
        }
        if (bad > 0) {
          results.push(`❌ ${bad} 个条目缺少 frontmatter`);
          failed += bad;
        } else {
          results.push("✅ 条目 frontmatter 合法");
          passed++;
        }
      }
    }

    // ── 3. AGENTS.md 行数 ──
    results.push("\n## Constraints\n");
    const agentsPath = join(context.directory, "AGENTS.md");
    if (existsSync(agentsPath)) {
      const lines = readFileSync(agentsPath, "utf-8").split("\n").length;
      results.push(`${mark(lines <= 150)} AGENTS.md: ${lines} lines (limit 150)`);
    }

    results.push(`\n---\n**${passed} passed, ${failed} failed**`);
    return results.join("\n");
  },
});
