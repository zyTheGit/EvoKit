import { tool } from "@opencode-ai/plugin";
import { readFileSync, existsSync, mkdirSync, appendFileSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".config", "opencode", "memory");

/**
 * EvoKit boot verification tool.
 * Checks system integrity and runs learned rule verifications.
 */
export default tool({
  description: "Run EvoKit boot verification — check system integrity and learned rules",
  args: {},
  async execute(_args, context) {
    mkdirSync(MEMORY_DIR, { recursive: true });
    const results: string[] = [];
    let passed = 0;
    let failed = 0;

    results.push("# 🔍 EvoKit Boot Verification\n");

    // ── 1. Core files (global + project) ──
    results.push("## Core Files\n");
    const globalDir = join(homedir(), ".config", "opencode");
    for (const file of ["AGENTS.md", "opencode.json"]) {
      const globalOk = existsSync(join(globalDir, file));
      results.push(`${globalOk ? "✅" : "❌"} ~/.config/opencode/${file} (global)`);
      if (globalOk) passed++;
      else failed++;

      const projectOk = existsSync(join(context.directory, file));
      results.push(`${projectOk ? "✅" : "❌"} ${file} (project)`);
      if (projectOk) passed++;
      else failed++;
    }

    // ── 2. Memory files (global) ──
    results.push("\n## Memory Files\n");
    for (const file of ["corrections.jsonl", "observations.jsonl", "learned-rules.md", "evolution-log.md"]) {
      const ok = existsSync(join(MEMORY_DIR, file));
      results.push(`${ok ? "✅" : "⚠️"} memory/${file}`);
      if (ok) passed++;
      else failed++;
    }

    // ── 3. AGENTS.md constraints ──
    results.push("\n## Constraints\n");
    const agentsPath = join(context.directory, "AGENTS.md");
    if (existsSync(agentsPath)) {
      const lines = readFileSync(agentsPath, "utf-8").split("\n").length;
      const ok = lines <= 150;
      results.push(`${ok ? "✅" : "❌"} AGENTS.md: ${lines} lines (limit 150)`);
      if (ok) passed++;
      else failed++;
    }

    // ── 4. learned-rules.md line limit ──
    const rulesPath = join(MEMORY_DIR, "learned-rules.md");
    if (existsSync(rulesPath)) {
      const rulesLines = readFileSync(rulesPath, "utf-8").split("\n").length;
      const ok = rulesLines <= 50;
      results.push(`${ok ? "✅" : "❌"} learned-rules.md: ${rulesLines} lines (limit 50)`);
      if (ok) passed++;
      else failed++;
    }

    // ── 5. Run verify commands from learned-rules.md ──
    results.push("\n## Rule Verifications\n");
    if (existsSync(rulesPath)) {
      const rules = readFileSync(rulesPath, "utf-8");
      const verifyRegex = /verify:\s*(.+)$/gm;
      let match;
      let hasVerifies = false;
      while ((match = verifyRegex.exec(rules)) !== null) {
        hasVerifies = true;
        const cmd = match[1].trim();
        try {
          const { execSync } = await import("child_process" as string);
          execSync(cmd, { cwd: context.directory, timeout: 10000, stdio: "pipe" });
          results.push(`✅ verify: \`${cmd}\``);
          passed++;
        } catch {
          results.push(`❌ verify: \`${cmd}\``);
          failed++;
        }
      }
      if (!hasVerifies) {
        results.push("  No verify commands found.");
      }
    }

    // ── Summary ──
    results.push(`\n---\n**${passed} passed, ${failed} failed**\n`);

    // Record violations
    if (failed > 0) {
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        bootFailed: failed,
        bootPassed: passed,
      });
      appendFileSync(join(MEMORY_DIR, "violations.jsonl"), entry + "\n", "utf-8");
    }

    return results.join("\n");
  },
});
