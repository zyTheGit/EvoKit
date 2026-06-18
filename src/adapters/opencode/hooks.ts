/**
 * EvoKit — OpenCode Tool Generators
 *
 * OpenCode has no lifecycle hooks. Instead, EvoKit commands are implemented
 * as custom tools using the @opencode-ai/plugin SDK.
 *
 * This module generates the TypeScript source code for each tool.
 * Tools read/write global memory at ~/.config/opencode/memory/.
 *
 * @packageDocumentation
 */

/**
 * Generate source code for the evokit-boot tool.
 * Performs system integrity verification at session start.
 */
export function generateBootToolSource(): string {
  return `import { tool } from "@opencode-ai/plugin";
import { readFileSync, existsSync, mkdirSync, appendFileSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".config", "opencode", "memory");

export default tool({
  description: "Run EvoKit boot verification — check system integrity and learned rules",
  args: {},
  async execute(_args, context) {
    mkdirSync(MEMORY_DIR, { recursive: true });
    const results: string[] = [];
    let passed = 0, failed = 0;

    results.push("# EvoKit Boot Verification\\n");

    // 1. Check global config files
    const globalDir = join(homedir(), ".config", "opencode");
    for (const file of ["AGENTS.md", "opencode.json"]) {
      const ok = existsSync(join(globalDir, file));
      results.push(\`\${ok ? "✅" : "❌"} ~/.config/opencode/\${file}\`);
      ok ? passed++ : failed++;
    }

    // 2. Check project-level files
    for (const file of ["AGENTS.md", "opencode.json"]) {
      const ok = existsSync(join(context.directory, file));
      results.push(\`\${ok ? "✅" : "❌"} \${file} (project root)\`);
      ok ? passed++ : failed++;
    }

    // 3. Check memory files
    for (const file of ["corrections.jsonl", "learned-rules.md", "observations.jsonl"]) {
      const ok = existsSync(join(MEMORY_DIR, file));
      results.push(\`\${ok ? "✅" : "⚠️"} memory/\${file}\`);
      ok ? passed++ : failed++;
    }

    // 4. Run learned rules verify commands
    const rulesPath = join(MEMORY_DIR, "learned-rules.md");
    if (existsSync(rulesPath)) {
      const rules = readFileSync(rulesPath, "utf-8");
      const verifyLines = rules.matchAll(/verify:\\s*(.+)$/gm);
      for (const match of verifyLines) {
        try {
          const { execSync } = await import("child_process");
          execSync(match[1], { cwd: context.directory, timeout: 10000 });
          results.push(\`✅ verify: $\`{match[1]}\`\`);
          passed++;
        } catch {
          results.push(\`❌ verify: $\`{match[1]}\`\`);
          failed++;
        }
      }
    }

    results.push(\`\\n---\\n**\${passed} passed, \${failed} failed**\\n\`);

    // Record violation if any failures
    if (failed > 0) {
      const violation = JSON.stringify({
        timestamp: new Date().toISOString(),
        failures: failed,
        details: results.join("; "),
      });
      appendFileSync(join(MEMORY_DIR, "violations.jsonl"), violation + "\\n", "utf-8");
    }

    return results.join("\\n");
  },
});`;
}

/**
 * Generate source code for the evokit-evolve tool.
 * Audits corrections and promotes patterns to learned rules.
 */
export function generateEvolveToolSource(): string {
  return `import { tool } from "@opencode-ai/plugin";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".config", "opencode", "memory");

export default tool({
  description: "Run EvoKit evolution audit — promote corrections to learned rules",
  args: {
    dryRun: tool.schema.boolean().optional().describe("Preview changes without applying"),
  },
  async execute(args, _context) {
    mkdirSync(MEMORY_DIR, { recursive: true });

    const correctionsPath = join(MEMORY_DIR, "corrections.jsonl");
    if (!existsSync(correctionsPath)) {
      return "No corrections found — nothing to evolve.\\n";
    }

    // Read corrections and group by pattern
    const corrections = readFileSync(correctionsPath, "utf-8")
      .split("\\n")
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
    report.push("# EvoKit Evolution Audit\\n");
    let promoted = 0;

    // Read existing learned rules
    const rulesPath = join(MEMORY_DIR, "learned-rules.md");
    let existingRules = existsSync(rulesPath) ? readFileSync(rulesPath, "utf-8") : "";

    for (const [pattern, group] of grouped) {
      if (group.count >= 2 && !existingRules.includes(\`verify:\`)) {
        if (args.dryRun) {
          report.push(\`📋 Would promote: "\${pattern}" (\${group.count} occurrences)\\n\`);
        } else {
          // Append to learned-rules.md
          const ruleEntry = \`- pattern: \${pattern}\\n  verify: echo "verify: \${pattern}"\\n  promoted: \${new Date().toISOString().split("T")[0]}\\n\\n\`;
          appendFileSync(rulesPath, ruleEntry, "utf-8");
          report.push(\`✅ Promoted: "\${pattern}"\\n\`);
          promoted++;
        }
      } else if (group.count < 2) {
        report.push(\`⏳ "\${pattern}" — only \${group.count}/2 occurrences, deferring\\n\`);
      } else {
        report.push(\`ℹ️ "\${pattern}" — already promoted\\n\`);
      }
    }

    // Log evolution decision
    const logPath = join(MEMORY_DIR, "evolution-log.md");
    if (!args.dryRun) {
      const logEntry = \`## \${new Date().toISOString().split("T")[0]} — Promoted \${promoted} rules\\n\`;
      appendFileSync(logPath, logEntry, "utf-8");
    }

    report.push(\`\\n**Promoted: \${promoted} rule(s)**\\n\`);
    return report.join("\\n");
  },
});`;
}

/**
 * Generate source code for the evokit-memory tool.
 * Manages corrections, observations, and context injection.
 */
export function generateMemoryToolSource(): string {
  return `import { tool } from "@opencode-ai/plugin";
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".config", "opencode", "memory");

export default tool({
  description: "Manage EvoKit learning data — record corrections, observations, and inject context",
  args: {
    action: tool.schema
      .enum(["record-correction", "record-observation", "export", "inject"])
      .describe("Action to perform"),
    pattern: tool.schema.string().optional().describe("Correction or observation pattern"),
    context: tool.schema.string().optional().describe("Context for the correction/observation"),
    confidence: tool.schema.number().optional().describe("Confidence score (0.0-1.0)"),
    source: tool.schema.string().optional().describe("Source of the observation"),
  },
  async execute(args, _context) {
    mkdirSync(MEMORY_DIR, { recursive: true });

    switch (args.action) {
      case "record-correction": {
        if (!args.pattern) return "Error: pattern is required for record-correction\\n";
        const entry = JSON.stringify({
          timestamp: new Date().toISOString(),
          pattern: args.pattern,
          context: args.context || "",
          count: 1,
        });
        appendFileSync(join(MEMORY_DIR, "corrections.jsonl"), entry + "\\n", "utf-8");
        return \`✅ Correction recorded: "\${args.pattern}"\\n\`;
      }

      case "record-observation": {
        if (!args.pattern) return "Error: pattern is required for record-observation\\n";
        const entry = JSON.stringify({
          timestamp: new Date().toISOString(),
          pattern: args.pattern,
          confidence: args.confidence ?? 0.5,
          source: args.source || "auto",
        });
        appendFileSync(join(MEMORY_DIR, "observations.jsonl"), entry + "\\n", "utf-8");
        return \`✅ Observation recorded: "\${args.pattern}"\\n\`;
      }

      case "export": {
        const output = ["# EvoKit Memory Export\\n"];
        for (const file of ["corrections.jsonl", "observations.jsonl", "learned-rules.md", "sessions.jsonl"]) {
          const filePath = join(MEMORY_DIR, file);
          if (existsSync(filePath)) {
            output.push(\`## \${file}\\n\`);
            output.push(readFileSync(filePath, "utf-8"));
            output.push("\\n");
          }
        }
        return output.join("");
      }

      case "inject": {
        const rulesPath = join(MEMORY_DIR, "learned-rules.md");
        if (existsSync(rulesPath)) {
          const rules = readFileSync(rulesPath, "utf-8");
          return \`EvoKit learned rules for this session:\\n\${rules}\\n\`;
        }
        return "No learned rules found.\\n";
      }

      default:
        return \`Error: unknown action "\${args.action}"\\n\`;
    }
  },
});`;
}

/**
 * Generate source code for the evokit-session tool.
 * Records session lifecycle events.
 */
export function generateSessionToolSource(): string {
  return `import { tool } from "@opencode-ai/plugin";
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".config", "opencode", "memory");

export default tool({
  description: "Record EvoKit session lifecycle — call with action: end before finishing",
  args: {
    action: tool.schema.enum(["start", "end"]).describe("Session lifecycle event"),
    duration: tool.schema.number().optional().describe("Session duration in seconds"),
    model: tool.schema.string().optional().describe("Model used in this session"),
    score: tool.schema.string().optional().describe("Session score (A/B/C/D)"),
    corrections: tool.schema.number().optional().describe("Number of corrections recorded"),
    observations: tool.schema.number().optional().describe("Number of observations recorded"),
  },
  async execute(args, _context) {
    mkdirSync(MEMORY_DIR, { recursive: true });

    const sessionsPath = join(MEMORY_DIR, "sessions.jsonl");

    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      assistant: "opencode",
      session_id: _context.sessionID || "unknown",
      model: args.model || "unknown",
      action: args.action,
      duration_seconds: args.duration || 0,
      corrections: args.corrections || 0,
      observations: args.observations || 0,
      score: args.score || "",
    });

    appendFileSync(sessionsPath, entry + "\\n", "utf-8");
    return \`✅ Session \${args.action} recorded.\\n\`;
  },
});`;
}
