import { tool } from "@opencode-ai/plugin";
import { readFileSync, existsSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";

/**
 * EvoKit evolution audit tool.
 * Groups corrections by pattern, promotes patterns with count >= 2
 * to learned-rules.md, and logs decisions to evolution-log.md.
 */
export default tool({
  description: "Run EvoKit evolution audit — promote corrections to learned rules",
  args: {
    dryRun: tool.schema
      .boolean()
      .optional()
      .describe("Preview changes without applying"),
  },
  async execute(args, context) {
    const memoryDir = join(context.directory, ".opencode", "memory");
    mkdirSync(memoryDir, { recursive: true });

    const correctionsPath = join(memoryDir, "corrections.jsonl");
    if (!existsSync(correctionsPath)) {
      return "# 🔄 EvoKit Evolution Audit\n\nNo corrections found — nothing to evolve.\n";
    }

    // Read and group corrections by pattern
    const corrections = readFileSync(correctionsPath, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const grouped = new Map<string, { pattern: string; entries: unknown[]; count: number }>();
    for (const c of corrections) {
      const key = c.pattern;
      if (!grouped.has(key)) {
        grouped.set(key, { pattern: key, entries: [], count: 0 });
      }
      const group = grouped.get(key)!;
      group.entries.push(c);
      group.count++;
    }

    const report: string[] = [];
    report.push("# 🔄 EvoKit Evolution Audit\n");

    const today = new Date().toISOString().split("T")[0];
    let promoted = 0;
    const logEntries: string[] = [];

    const rulesPath = join(memoryDir, "learned-rules.md");
    const existingRules = existsSync(rulesPath) ? readFileSync(rulesPath, "utf-8") : "";

    for (const [pattern, group] of grouped) {
      const alreadyPromoted = existingRules.includes(`pattern: ${pattern}`);

      if (group.count >= 2 && !alreadyPromoted) {
        if (args.dryRun) {
          report.push(`📋 **Would promote:** "${pattern}" (${group.count} occurrences)\n`);
        } else {
          // Append to learned-rules.md
          const ruleEntry = [
            `- pattern: ${pattern}`,
            `  verify: echo "verify: ${pattern}"`,
            `  promoted: ${today}`,
            "",
          ].join("\n");
          appendFileSync(rulesPath, ruleEntry + "\n", "utf-8");
          report.push(`✅ **Promoted:** "${pattern}" (${group.count} occurrences)\n`);
          promoted++;
          logEntries.push(`- Promoted: "${pattern}" (${group.count}x)`);
        }
      } else if (alreadyPromoted) {
        report.push(`ℹ️ "${pattern}" — already promoted, skipping\n`);
      } else {
        report.push(`⏳ "${pattern}" — only ${group.count}/2 occurrences, deferring\n`);
      }
    }

    // Log to evolution-log.md
    if (!args.dryRun && logEntries.length > 0) {
      const logPath = join(memoryDir, "evolution-log.md");
      const logEntry = [
        `## ${today} — Evolution Audit`,
        `- Promoted: ${promoted} rule(s)`,
        ...logEntries,
        "",
      ].join("\n");
      appendFileSync(logPath, logEntry + "\n", "utf-8");
    }

    report.push(`\n**Result: ${promoted} rule(s) promoted**\n`);
    return report.join("\n");
  },
});
