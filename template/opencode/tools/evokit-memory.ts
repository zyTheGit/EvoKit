import { tool } from "@opencode-ai/plugin";
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".config", "opencode", "memory");

/**
 * EvoKit memory management tool.
 * Records corrections/observations, exports learning data,
 * and injects learned rules context.
 */
export default tool({
  description: "Manage EvoKit learning data — record corrections, observations, and inject context",
  args: {
    action: tool.schema
      .enum(["record-correction", "record-observation", "export", "inject"])
      .describe("Action to perform"),
    pattern: tool.schema
      .string()
      .optional()
      .describe("Correction or observation pattern"),
    context: tool.schema
      .string()
      .optional()
      .describe("Context for the correction/observation"),
    confidence: tool.schema
      .number()
      .optional()
      .describe("Confidence score (0.0–1.0, for observations)"),
    source: tool.schema
      .string()
      .optional()
      .describe("Source of the observation"),
  },
  async execute(args, _context) {
    mkdirSync(MEMORY_DIR, { recursive: true });

    switch (args.action) {
      case "record-correction": {
        if (!args.pattern) {
          return "Error: `pattern` is required for record-correction\n";
        }
        const entry = JSON.stringify({
          timestamp: new Date().toISOString(),
          pattern: args.pattern,
          context: args.context || "",
          count: 1,
        });
        appendFileSync(join(MEMORY_DIR, "corrections.jsonl"), entry + "\n", "utf-8");
        return `✅ Correction recorded: "${args.pattern}"\n`;
      }

      case "record-observation": {
        if (!args.pattern) {
          return "Error: `pattern` is required for record-observation\n";
        }
        const entry = JSON.stringify({
          timestamp: new Date().toISOString(),
          pattern: args.pattern,
          confidence: args.confidence ?? 0.5,
          source: args.source || "auto",
        });
        appendFileSync(join(MEMORY_DIR, "observations.jsonl"), entry + "\n", "utf-8");
        return `✅ Observation recorded: "${args.pattern}"\n`;
      }

      case "export": {
        const output: string[] = ["# 📦 EvoKit Memory Export\n"];
        for (const file of [
          "corrections.jsonl",
          "observations.jsonl",
          "learned-rules.md",
          "evolution-log.md",
          "sessions.jsonl",
        ]) {
          const filePath = join(MEMORY_DIR, file);
          if (existsSync(filePath)) {
            output.push(`## ${file}\n`);
            output.push("```\n");
            output.push(readFileSync(filePath, "utf-8"));
            output.push("```\n\n");
          }
        }
        return output.join("");
      }

      case "inject": {
        const rulesPath = join(MEMORY_DIR, "learned-rules.md");
        if (existsSync(rulesPath)) {
          const rules = readFileSync(rulesPath, "utf-8");
          return `EvoKit learned rules for this session:\n${rules}\n`;
        }
        return "No learned rules found.\n";
      }

      default:
        return `Error: unknown action "${args.action}"\n`;
    }
  },
});
