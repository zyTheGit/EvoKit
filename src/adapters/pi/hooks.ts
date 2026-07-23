/**
 * EvoKit — Pi CLI 扩展生成器
 *
 * Pi CLI 没有类似 Claude Code/Codex 的 settings.json hooks 配置。
 * EvoKit 的生命周期逻辑通过 TypeScript 扩展实现，使用 pi.on() 事件订阅。
 *
 * 本模块为每个扩展生成 TypeScript 源码。
 * 扩展在 ~/.pi/agent/memory/ 中读写全局内存。
 *
 * @packageDocumentation
 */

/**
 * 生成 evokit-lifecycle 扩展的源码。
 * 处理 session_start（启动验证）、session_shutdown（会话记录）和 tool_call（上下文注入）事件。
 */
export function generateLifecycleExtensionSource(): string {
  return `import { readFileSync, existsSync, mkdirSync, appendFileSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".pi", "agent", "memory");

/**
 * EvoKit 生命周期扩展 — 处理 session_start、session_shutdown 和 tool_call 事件。
 */
export default function (pi: ExtensionAPI) {
  // ── session_start: 启动验证 ──
  pi.on("session_start", async (_event, _ctx) => {
    mkdirSync(MEMORY_DIR, { recursive: true });
    const results: string[] = [];
    let passed = 0;
    let failed = 0;

    results.push("# EvoKit 启动验证 (Pi CLI)\\n");

    // 1. 检查全局配置
    const piDir = join(homedir(), ".pi", "agent");
    for (const file of ["AGENTS.md", "settings.json"]) {
      const ok = existsSync(join(piDir, file));
      results.push(\`\${ok ? "✅" : "❌"} ~/.pi/agent/\${file}\`);
      ok ? passed++ : failed++;
    }

    // 2. 检查扩展
    const extDir = join(piDir, "extensions");
    const extensions = ["evokit-lifecycle.ts", "evokit-boot.ts", "evokit-session.ts"];
    for (const ext of extensions) {
      const ok = existsSync(join(extDir, ext));
      results.push(\`\${ok ? "✅" : "⚠️"} extensions/\${ext}\`);
      ok ? passed++ : failed++;
    }

    // 3. 检查内存文件
    for (const file of ["corrections.jsonl", "learned-rules.md", "observations.jsonl"]) {
      const ok = existsSync(join(MEMORY_DIR, file));
      results.push(\`\${ok ? "✅" : "⚠️"} memory/\${file}\`);
      ok ? passed++ : failed++;
    }

    // 4. AGENTS.md 行数限制
    const agentsPath = join(piDir, "AGENTS.md");
    if (existsSync(agentsPath)) {
      const lines = readFileSync(agentsPath, "utf-8").split("\\n").length;
      const ok = lines <= 150;
      results.push(\`\${ok ? "✅" : "❌"} AGENTS.md: \${lines} lines (limit 150)\`);
      ok ? passed++ : failed++;
    }

    // 5. learned-rules.md 行数限制
    const rulesPath = join(MEMORY_DIR, "learned-rules.md");
    if (existsSync(rulesPath)) {
      const rulesLines = readFileSync(rulesPath, "utf-8").split("\\n").length;
      const ok = rulesLines <= 50;
      results.push(\`\${ok ? "✅" : "❌"} learned-rules.md: \${rulesLines} lines (limit 50)\`);
      ok ? passed++ : failed++;
    }

    results.push(\`\\n---\\n**\${passed} passed, \${failed} failed**\\n\`);

    // 记录违规
    if (failed > 0) {
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        bootFailed: failed,
        bootPassed: passed,
      });
      appendFileSync(join(MEMORY_DIR, "violations.jsonl"), entry + "\\n", "utf-8");
    }

    pi.sendMessage(results.join("\\n"));
  });

  // ── session_shutdown: 会话记录 ──
  pi.on("session_shutdown", async (_event, _ctx) => {
    mkdirSync(MEMORY_DIR, { recursive: true });
    const sessionsPath = join(MEMORY_DIR, "sessions.jsonl");
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      assistant: "pi",
      action: "shutdown",
    });
    appendFileSync(sessionsPath, entry + "\\n", "utf-8");
  });

  // ── tool_call: 注入已学规则上下文 ──
  pi.on("tool_call", async (event, _ctx) => {
    const rulesPath = join(MEMORY_DIR, "learned-rules.md");
    if (existsSync(rulesPath)) {
      const rules = readFileSync(rulesPath, "utf-8").trim();
      if (rules) {
        // 通过 additionalContext 注入（如果事件支持）
        if (event && typeof event === "object" && "context" in event) {
          (event as { context: string }).context += \`\\nEvoKit learned rules:\\n\${rules}\\n\`;
        }
      }
    }
  });
}`;
}

/**
 * 生成 evokit-boot 扩展的源码。
 * 独立的启动验证扩展，可通过 /skill:evokit-boot 手动调用。
 */
export function generateBootExtensionSource(): string {
  return `import { readFileSync, existsSync, mkdirSync, appendFileSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".pi", "agent", "memory");

/**
 * EvoKit 启动验证扩展 — 可通过 Pi 命令手动调用。
 */
export default function (pi: ExtensionAPI) {
  pi.registerCommand("evokit-boot", {
    description: "运行 EvoKit 启动验证 — 检查系统完整性和已学习规则",
    async execute() {
      mkdirSync(MEMORY_DIR, { recursive: true });
      const results: string[] = [];
      let passed = 0, failed = 0;

      results.push("# EvoKit 启动验证\\n");

      const piDir = join(homedir(), ".pi", "agent");
      for (const file of ["AGENTS.md", "settings.json"]) {
        const ok = existsSync(join(piDir, file));
        results.push(\`\${ok ? "✅" : "❌"} ~/.pi/agent/\${file}\`);
        ok ? passed++ : failed++;
      }

      // 运行 learned-rules.md 中的验证命令
      const rulesPath = join(MEMORY_DIR, "learned-rules.md");
      if (existsSync(rulesPath)) {
        const rules = readFileSync(rulesPath, "utf-8");
        const verifyRegex = /verify:\\s*(.+)$/gm;
        let match;
        while ((match = verifyRegex.exec(rules)) !== null) {
          const cmd = match[1].trim();
          try {
            const { execSync } = await import("child_process" as string);
            execSync(cmd, { timeout: 10000, stdio: "pipe" });
            results.push(\`✅ verify: \\\`\${cmd}\\\`\`);
            passed++;
          } catch {
            results.push(\`❌ verify: \\\`\${cmd}\\\`\`);
            failed++;
          }
        }
      }

      results.push(\`\\n---\\n**\${passed} passed, \${failed} failed**\\n\`);
      return results.join("\\n");
    },
  });
}`;
}

/**
 * 生成 evokit-evolve 扩展的源码。
 * 审计修正记录并将模式提升为已学习规则。
 */
export function generateEvolveExtensionSource(): string {
  return `import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".pi", "agent", "memory");

/**
 * EvoKit 演化审计扩展 — 将修正提升为已学习规则。
 */
export default function (pi: ExtensionAPI) {
  pi.registerCommand("evokit-evolve", {
    description: "运行 EvoKit 演化审计 — 将修正提升为已学习规则",
    async execute() {
      mkdirSync(MEMORY_DIR, { recursive: true });
      const correctionsPath = join(MEMORY_DIR, "corrections.jsonl");
      if (!existsSync(correctionsPath)) {
        return "未找到修正记录 — 无需演化。\\n";
      }

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

      const rulesPath = join(MEMORY_DIR, "learned-rules.md");
      let existingRules = existsSync(rulesPath) ? readFileSync(rulesPath, "utf-8") : "";

      for (const [pattern, group] of grouped) {
        if (group.count >= 2 && !existingRules.includes(pattern)) {
          const ruleEntry = \`- **\${pattern}**\\n  <!-- verify: echo "verify: \${pattern}" -->\\n  promoted: \${new Date().toISOString().split("T")[0]}\\n\\n\`;
          appendFileSync(rulesPath, ruleEntry, "utf-8");
          report.push(\`✅ 已提升: "\${pattern}"\\n\`);
          promoted++;
        } else if (group.count < 2) {
          report.push(\`⏳ "\${pattern}" — 仅 \${group.count}/2 次出现，推迟\\n\`);
        } else {
          report.push(\`ℹ️ "\${pattern}" — 已提升\\n\`);
        }
      }

      const logPath = join(MEMORY_DIR, "evolution-log.md");
      const logEntry = \`## \${new Date().toISOString().split("T")[0]} — 提升 \${promoted} 条规则\\n\`;
      appendFileSync(logPath, logEntry, "utf-8");

      report.push(\`\\n**已提升: \${promoted} 条规则**\\n\`);
      return report.join("\\n");
    },
  });
}`;
}

/**
 * 生成 evokit-memory 扩展的源码。
 * 管理修正、观察记录和上下文注入。
 */
export function generateMemoryExtensionSource(): string {
  return `import { readFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".pi", "agent", "memory");

/**
 * EvoKit 记忆管理扩展 — 记录修正、观察和注入上下文。
 */
export default function (pi: ExtensionAPI) {
  pi.registerCommand("evokit-memory", {
    description: "管理 EvoKit 学习数据 — 记录修正、观察和注入上下文",
    async execute(args: { action: string; pattern?: string; context?: string }) {
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
            confidence: 0.5,
            source: "auto",
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
            return \`EvoKit learned rules for this session:\\n\${readFileSync(rulesPath, "utf-8")}\\n\`;
          }
          return "未找到已学习规则。\\n";
        }

        default:
          return \`错误: 未知操作 "\${args.action}"\\n\`;
      }
    },
  });
}`;
}

/**
 * 生成 evokit-session 扩展的源码。
 * 记录会话生命周期事件。
 */
export function generateSessionExtensionSource(): string {
  return `import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join, homedir } from "path";

const MEMORY_DIR = join(homedir(), ".pi", "agent", "memory");

/**
 * EvoKit 会话记录扩展 — 记录会话生命周期。
 * 在会话结束前调用 /evokit-session action:end。
 */
export default function (pi: ExtensionAPI) {
  pi.registerCommand("evokit-session", {
    description: "记录 EvoKit 会话生命周期 — 结束前调用 action: end",
    async execute(args: { action: string; duration?: number; model?: string; score?: string }) {
      mkdirSync(MEMORY_DIR, { recursive: true });
      const sessionsPath = join(MEMORY_DIR, "sessions.jsonl");
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        assistant: "pi",
        action: args.action,
        duration_seconds: args.duration || 0,
        model: args.model || "unknown",
        score: args.score || "",
      });
      appendFileSync(sessionsPath, entry + "\\n", "utf-8");
      return \`✅ 会话 \${args.action} 已记录。\\n\`;
    },
  });
}`;
}
