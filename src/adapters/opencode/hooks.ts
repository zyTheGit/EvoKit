/**
 * EvoKit — OpenCode 工具生成器
 *
 * OpenCode 没有生命周期钩子。EvoKit 命令通过 @opencode-ai/plugin SDK
 * 实现为自定义工具。
 *
 * 本模块为每个工具生成 TypeScript 源码。
 * 工具在 ~/.config/opencode/memory/ 中读写全局内存。
 *
 * @packageDocumentation
 */

/**
 * 生成 evokit-boot 工具的源码。
 * 在会话启动时执行系统完整性验证。
 */
export function generateBootToolSource(): string {
  return `import { tool } from "@opencode-ai/plugin";
import { readFileSync, existsSync, mkdirSync, appendFileSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".config", "opencode", "memory");

export default tool({
  description: "运行 EvoKit 启动验证 — 检查系统完整性和已学习规则",
  args: {},
  async execute(_args, context) {
    mkdirSync(MEMORY_DIR, { recursive: true });
    const results: string[] = [];
    let passed = 0, failed = 0;

    results.push("# EvoKit 启动验证\\n");

    // 1. 检查全局配置文件
    const globalDir = join(homedir(), ".config", "opencode");
    for (const file of ["AGENTS.md", "opencode.json"]) {
      const ok = existsSync(join(globalDir, file));
      results.push(\`\${ok ? "✅" : "❌"} ~/.config/opencode/\${file}\`);
      ok ? passed++ : failed++;
    }

    // 2. 检查项目级文件
    for (const file of ["AGENTS.md", "opencode.json"]) {
      const ok = existsSync(join(context.directory, file));
      results.push(\`\${ok ? "✅" : "❌"} \${file} (project root)\`);
      ok ? passed++ : failed++;
    }

    // 3. 检查内存文件
    for (const file of ["corrections.jsonl", "learned-rules.md", "observations.jsonl"]) {
      const ok = existsSync(join(MEMORY_DIR, file));
      results.push(\`\${ok ? "✅" : "⚠️"} memory/\${file}\`);
      ok ? passed++ : failed++;
    }

    // 4. 运行已学习规则的验证命令
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

    // 如果有失败，记录违规
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
 * 生成 evokit-evolve 工具的源码。
 * 审计修正记录并将模式提升为已学习规则。
 */
export function generateEvolveToolSource(): string {
  return `import { tool } from "@opencode-ai/plugin";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".config", "opencode", "memory");

export default tool({
  description: "运行 EvoKit 演化审计 — 将修正提升为已学习规则",
  args: {
    dryRun: tool.schema.boolean().optional().describe("预览变更，不实际应用"),
  },
  async execute(args, _context) {
    mkdirSync(MEMORY_DIR, { recursive: true });

    const correctionsPath = join(MEMORY_DIR, "corrections.jsonl");
    if (!existsSync(correctionsPath)) {
      return "未找到修正记录 — 无需演化。\\n";
    }

    // 读取修正记录并按模式分组
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
    report.push("# EvoKit 演化审计\\n");
    let promoted = 0;

    // 读取已有的已学习规则
    const rulesPath = join(MEMORY_DIR, "learned-rules.md");
    let existingRules = existsSync(rulesPath) ? readFileSync(rulesPath, "utf-8") : "";

    for (const [pattern, group] of grouped) {
      if (group.count >= 2 && !existingRules.includes(\`verify:\`)) {
        if (args.dryRun) {
          report.push(\`📋 将提升: "\${pattern}" (\${group.count} 次出现)\\n\`);
        } else {
          // 追加到 learned-rules.md
          const ruleEntry = \`- pattern: \${pattern}\\n  verify: echo "verify: \${pattern}"\\n  promoted: \${new Date().toISOString().split("T")[0]}\\n\\n\`;
          appendFileSync(rulesPath, ruleEntry, "utf-8");
          report.push(\`✅ 已提升: "\${pattern}"\\n\`);
          promoted++;
        }
      } else if (group.count < 2) {
        report.push(\`⏳ "\${pattern}" — 仅 \${group.count}/2 次出现，推迟\\n\`);
      } else {
        report.push(\`ℹ️ "\${pattern}" — 已提升\\n\`);
      }
    }

    // 记录演化决策
    const logPath = join(MEMORY_DIR, "evolution-log.md");
    if (!args.dryRun) {
      const logEntry = \`## \${new Date().toISOString().split("T")[0]} — 提升 \${promoted} 条规则\\n\`;
      appendFileSync(logPath, logEntry, "utf-8");
    }

    report.push(\`\\n**已提升: \${promoted} 条规则**\\n\`);
    return report.join("\\n");
  },
});`;
}

/**
 * 生成 evokit-memory 工具的源码。
 * 管理修正、观察记录和上下文注入。
 */
export function generateMemoryToolSource(): string {
  return `import { tool } from "@opencode-ai/plugin";
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".config", "opencode", "memory");

export default tool({
  description: "管理 EvoKit 学习数据 — 记录修正、观察和注入上下文",
  args: {
    action: tool.schema
      .enum(["record-correction", "record-observation", "export", "inject"])
      .describe("要执行的操作"),
    pattern: tool.schema.string().optional().describe("修正或观察的模式"),
    context: tool.schema.string().optional().describe("修正/观察的上下文"),
    confidence: tool.schema.number().optional().describe("置信度分数 (0.0-1.0)"),
    source: tool.schema.string().optional().describe("观察的来源"),
  },
  async execute(args, _context) {
    mkdirSync(MEMORY_DIR, { recursive: true });

    switch (args.action) {
      case "record-correction": {
        if (!args.pattern) return "错误: record-correction 需要 pattern 参数\\n";
        const entry = JSON.stringify({
          timestamp: new Date().toISOString(),
          pattern: args.pattern,
          context: args.context || "",
          count: 1,
        });
        appendFileSync(join(MEMORY_DIR, "corrections.jsonl"), entry + "\\n", "utf-8");
        return \`✅ 修正已记录: "\${args.pattern}"\\n\`;
      }

      case "record-observation": {
        if (!args.pattern) return "错误: record-observation 需要 pattern 参数\\n";
        const entry = JSON.stringify({
          timestamp: new Date().toISOString(),
          pattern: args.pattern,
          confidence: args.confidence ?? 0.5,
          source: args.source || "auto",
        });
        appendFileSync(join(MEMORY_DIR, "observations.jsonl"), entry + "\\n", "utf-8");
        return \`✅ 观察已记录: "\${args.pattern}"\\n\`;
      }

      case "export": {
        const output = ["# EvoKit 内存导出\\n"];
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
          return \`本次会话的 EvoKit 已学习规则:\\n\${rules}\\n\`;
        }
        return "未找到已学习规则。\\n";
      }

      default:
        return \`错误: 未知操作 "\${args.action}"\\n\`;
    }
  },
});`;
}

/**
 * 生成 evokit-session 工具的源码。
 * 记录会话生命周期事件。
 */
export function generateSessionToolSource(): string {
  return `import { tool } from "@opencode-ai/plugin";
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".config", "opencode", "memory");

export default tool({
  description: "记录 EvoKit 会话生命周期 — 结束前调用 action: end",
  args: {
    action: tool.schema.enum(["start", "end"]).describe("会话生命周期事件"),
    duration: tool.schema.number().optional().describe("会话持续时间（秒）"),
    model: tool.schema.string().optional().describe("本次会话使用的模型"),
    score: tool.schema.string().optional().describe("会话评分 (A/B/C/D)"),
    corrections: tool.schema.number().optional().describe("记录的修正数量"),
    observations: tool.schema.number().optional().describe("记录的观察数量"),
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
    return \`✅ 会话 \${args.action} 已记录。\\n\`;
  },
});`;
}
