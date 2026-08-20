import { tool } from "@opencode-ai/plugin";
import { execSync } from "child_process";

/**
 * EvoKit 确认背书 / 显式声明工具（v1.0）。
 * 作为"同一道人工背书"闸门的 opencode 入口壳：
 * - 无 content：调用 `evokit learn` 列出待确认草稿（逐条确认/拒绝）
 * - 有 content：显式声明知识（当场背书）
 * 统一落到 `evokit learn` CLI（引擎层纯函数），4 助手同一确认语义。
 */
export default tool({
  description: "EvoKit 知识确认背书 / 显式声明（对话提取确认闸门）",
  args: {
    content: tool.schema
      .string()
      .optional()
      .describe("显式声明内容（提供即当场背书入库，否则进入确认流程）"),
    project_dir: tool.schema
      .string()
      .optional()
      .describe("项目目录（追加扫描项目级待确认，缺省仅个人级）"),
    scope: tool.schema
      .string()
      .optional()
      .describe("作用域 personal | project，确认时缺省按当前项目"),
    type: tool.schema
      .string()
      .optional()
      .describe("显式声明知识类型（默认 convention）"),
    impact: tool.schema
      .string()
      .optional()
      .describe("架构型显式声明的 ## 影响范围 推理标注"),
    git_history: tool.schema
      .boolean()
      .optional()
      .describe("从当前项目 Git 历史提取 commit 约定候选到 .pending/ 待确认（ADR 0004；与 content 互斥）"),
  },
  async execute(args, _context) {
    const parts = ["evokit", "learn"];
    if (args.content) parts.push(JSON.stringify(args.content));
    if (args.project_dir) parts.push("--project-dir", JSON.stringify(args.project_dir));
    if (args.scope) parts.push("--scope", args.scope);
    if (args.type) parts.push("--type", args.type);
    if (args.impact) parts.push("--impact", JSON.stringify(args.impact));
    if (args.git_history) parts.push("--git-history");
    try {
      return execSync(parts.join(" "), { encoding: "utf-8" });
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string };
      return e.stderr || e.message || String(err);
    }
  },
});
