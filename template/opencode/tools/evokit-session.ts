import { tool } from "@opencode-ai/plugin";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { join, homedir } from "path";

const PERSONAL_ROOT = join(homedir(), ".evokit", "knowledge");

/**
 * EvoKit 会话末落盘工具（v1.0）。
 * IMPORTANT: OpenCode 无自动 Stop 钩子 → 会话结束前**必须**调用本工具
 * `action: "flush_pending"`，把在途待确认草稿 .pending/ 落盘并提示运行 `evokit learn` 确认。
 * "会话末批量落盘 + 提示确认"在 opencode 的等价触发点。
 */
export default tool({
  description: "EvoKit 会话末 flush — 落盘 .pending/ 待确认草稿并提示确认（无 Stop 钩子必须调用）",
  args: {
    action: tool.schema
      .enum(["flush_pending"])
      .describe("Session lifecycle event — 会话结束前调用"),
  },
  async execute(args, context) {
    const pendings: Array<[string, string]> = [
      ["个人", join(PERSONAL_ROOT, ".pending")],
      ["项目", join(context.directory, ".evokit", ".pending")],
    ];

    let total = 0;
    const lines: string[] = [];
    for (const [scope, pending] of pendings) {
      if (!existsSync(pending)) continue;
      const count = readdirSync(pending).filter((f) => f.endsWith(".md")).length;
      if (count > 0) {
        total += count;
        lines.push(`  ${scope}: ${count} 条待确认草稿`);
      }
    }
    mkdirSync(PERSONAL_ROOT, { recursive: true });

    if (total === 0) {
      return "✅ 无待确认草稿，知识库一致。\n";
    }
    return `📋 有 ${total} 条待确认知识落盘：\n${lines.join("\n")}\n运行 evokit learn 确认背书（同一道人工背书闸门）。\n`;
  },
});
