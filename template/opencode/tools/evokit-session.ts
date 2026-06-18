import { tool } from "@opencode-ai/plugin";
import { appendFileSync, mkdirSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".config", "opencode", "memory");

/**
 * EvoKit session recording tool.
 *
 * IMPORTANT: Since OpenCode has no automatic Stop hook,
 * you MUST call this tool with action: "end" before the
 * conversation ends to ensure session data is saved.
 */
export default tool({
  description: "Record EvoKit session lifecycle — always call with action: end before finishing",
  args: {
    action: tool.schema
      .enum(["start", "end"])
      .describe("Session lifecycle event"),
    duration: tool.schema
      .number()
      .optional()
      .describe("Session duration in seconds"),
    model: tool.schema
      .string()
      .optional()
      .describe("Model used in this session"),
    score: tool.schema
      .string()
      .optional()
      .describe("Session score (A/B/C/D)"),
    corrections: tool.schema
      .number()
      .optional()
      .describe("Number of corrections recorded this session"),
    observations: tool.schema
      .number()
      .optional()
      .describe("Number of observations recorded this session"),
  },
  async execute(args, _context) {
    mkdirSync(MEMORY_DIR, { recursive: true });

    const sessionsPath = join(MEMORY_DIR, "sessions.jsonl");

    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      assistant: "opencode",
      session_id: _context.sessionID || _context.messageID || "unknown",
      model: args.model || _context.agent || "unknown",
      action: args.action,
      duration_seconds: args.duration || 0,
      corrections: args.corrections || 0,
      observations: args.observations || 0,
      score: args.score || "",
    });

    appendFileSync(sessionsPath, entry + "\n", "utf-8");

    const message =
      args.action === "start"
        ? "Session started — remember to call evokit-session with action: end before finishing."
        : "Session ended — data recorded for evolution analytics.";

    return `✅ ${message}\n`;
  },
});
