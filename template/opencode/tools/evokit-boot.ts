import { tool } from "@opencode-ai/plugin";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * EvoKit boot verification tool.
 * Checks system integrity and runs learned rule verifications.
 */
export default tool({
  description: "Run EvoKit boot verification — check system integrity and learned rules",
  args: {},
  async execute(_args, context) {
    const opencodeDir = join(context.directory, ".opencode");
    const memoryDir = join(opencodeDir, "memory");
    const results: string[] = [];
    let passed = 0;
    let failed = 0;

    results.push("# 🔍 EvoKit Boot Verification\n");

    // ── 1. Core files ──
    results.push("## Core Files\n");
    for (const file of ["AGENTS.md", "opencode.json"]) {
      const ok = existsSync(join(context.directory, file));
      results.push(`${ok ? "✅" : "❌"} ${file}`);
      if (ok) passed++;
      else failed++;
    }

    // ── 2. Memory files ──
    results.push("\n## Memory Files\n");
    for (const file of ["corrections.jsonl", "observations.jsonl", "learned-rules.md", "evolution-log.md"]) {
      const ok = existsSync(join(memoryDir, file));
      results.push(`${ok ? "✅" : "⚠️"} .opencode/memory/${file}`);
      if (ok) passed++;
      else failed++;
    }

    // ── 3. Rules check (AGENTS.md line count) ──
    results.push("\n## Constraints\n");
    const agentsPath = join(context.directory, "AGENTS.md");
    if (existsSync(agentsPath)) {
      const lines = readFileSync(agentsPath, "utf-8").split("\n").length;
      const ok = lines <= 150;
      results.push(`${ok ? "✅" : "❌"} AGENTS.md: ${lines} lines (limit 150)`);
      if (ok) passed++;
      else failed++;
    }

    // ── 4. learned-rules.md line limit check ──
    const rulesPath = join(memoryDir, "learned-rules.md");
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
      mkdirSync(memoryDir, { recursive: true });
      const violationsPath = join(memoryDir, "violations.jsonl");
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        bootFailed: failed,
        bootPassed: passed,
      });
      try {
        const { appendFileSync } = await import("fs" as string);
        appendFileSync(violationsPath, entry + "\n", "utf-8");
      } catch {
        // Non-critical
      }
    }

    return results.join("\n");
  },
});
