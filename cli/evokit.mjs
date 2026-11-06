#!/usr/bin/env node
/**
 * EvoKit CLI — 个人多工具偏好同步工具（零依赖）
 *
 * 单一事实源：
 *   - 个人全局：~/.evokit/context.md          → 全局入口（所有项目生效）
 *   - 项目级：  <project>/.evokit/context.md   → 该项目入口（仅该项目生效）
 *
 * Agent 目标 / 资源 / 提示词（统一配置，可自定义，无需改代码）：
 *   - 配置文件：~/.evokit/settings.json
 *   - 内置默认：claude / pi / codex（首次运行自动生成）
 *   - agents：同步目标 + CLI 调用（cli 字段：bin/binPath/args/model/provider/timeout/outputFormat）
 *   - resources：type=text（托管块）/ symlink（软链接）/ remote（远程拉取）
 *   - prompts：内置提示词模板（用户配置只覆盖同名 key，未覆盖仍用默认）
 *
 * 用法：
 *   evokit agents             查看支持的 agent 列表
 *   evokit resources          查看管理的资源列表
 *   evokit inventory          盘点知识库 + 委托 agent 找冗余（调 claude/pi/codex CLI）
 *   evokit inventory --agent <id>  只让指定 agent 整理
 *   evokit inventory --prompt 只生成通用整理 prompt，不调 CLI
 *   evokit init               初始化全局源 + settings.json
 *   evokit init --project     初始化当前项目 .evokit/（context.md + settings.json）
 *   evokit sync               同步所有资源到所有 agent
 *   evokit sync --resource <id>  只同步指定资源
 *   evokit sync --agent <id>  只同步指定 agent
 *   evokit sync --project     同步当前项目规则到该项目入口
 *   evokit check [--agent <id>]    检查一致性 + ctxlint 健康检查
 *   evokit check --project        检查当前项目的一致性
 *   evokit status [--agent <id>]  查看各 agent 同步状态
 *   evokit status --project       查看当前项目各入口同步状态
 *   evokit uninstall [--agent <id>] 移除托管块，恢复入口文件（保留用户内容）
 *   evokit uninstall --project    移除当前项目入口的托管块（保留用户内容）
 *   evokit knowledge init     初始化知识根（目录树 + 索引骨架 + git init + 环境体检）
 *   evokit harvest            采集各源新会话到 inbox（--full 全量 / --source <id> / --dry-run）
 *   evokit learn              harvest→distill→草稿三档处理（--no-distill / --agent <id> / --session <id> / --auto）
 *   evokit review             待审草稿清单 + 裁决（--accept / --reject / --merge / --audit）
 *   evokit recall "<关键词>"   本地知识检索 + 命中计数（--limit n / --json）
 *   evokit --help             帮助
 *
 * 说明：方括号 [ ] 表示可选；check/status/uninstall 还支持位置参数（evokit check pi ≡ evokit check --agent pi）。
 * 短别名：-a ≡ --agent，-r ≡ --resource，-p ≡ --project（如 evokit sync -a claude）。
 *
 * 模块结构（cli/src/）：
 *   paths.js     路径常量 + 跨平台路径展开
 *   defaults.js  默认配置（agents/resources/prompts）+ 源内容
 *   config.js    settings.json 读写与过滤器
 *   fs-utils.js  文件工具（托管块、软链接）
 *   syncers.js   同步器分派（text/symlink/remote）
 *   remote.js    远程源拉取 + 代理
 *   agents-cli.js agents CLI 探测与调用（inventory 委托 agent 整理用）
 *   commands/    各命令实现（init/sync/check/status/uninstall/inventory/list/help）
 */

import { parseAgentFilter, parseResourceFilter } from './src/config.js';
import { debug, getDebugSource, initDebug, isDebugEnabled } from './src/debug.js';
import {
  initGlobal, initProject,
  syncGlobal, syncProject, syncResources,
  check, status, uninstallGlobal, uninstallProject,
  listAgents, listResources, inventory, help,
  knowledgeCommand, reviewCommand,
} from './src/commands/index.js';
// harvest/learn 为 M1/M2 新增命令，直接从命令文件导入（commands/index.js 本轮不在改动范围）
import { harvestCommand } from './src/commands/harvest.js';
import { learnCommand } from './src/commands/learn.js';
// recall 为 M3 新增命令，直接从命令文件导入（commands/index.js 本轮不在改动范围）
import { recallCommand } from './src/commands/recall.js';

const rawArgs = process.argv.slice(2);
initDebug(rawArgs);
const args = rawArgs.filter((arg) => arg !== '--debug');
const cmd = args[0] || 'help';
const startedAt = Date.now();
debug('cli', 'start', { command: cmd, debug: isDebugEnabled(), source: getDebugSource() });
const isProject = args.includes('--project') || args.includes('-p');
let filter = parseAgentFilter(args);
const resourceFilter = parseResourceFilter(args);

// 已知命令清单（用于未知命令时猜测用户意图）
const KNOWN_COMMANDS = ['agents', 'resources', 'inventory', 'init', 'sync', 'check', 'status', 'uninstall', 'knowledge', 'harvest', 'learn', 'review', 'recall', 'help'];

/** 计算两个字符串的编辑距离（Levenshtein），用于"是否打错命令"猜测 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

/** 猜测用户可能想输入的命令（编辑距离 ≤ 2） */
function suggestCommand(input) {
  let best = null;
  let bestDist = Infinity;
  for (const c of KNOWN_COMMANDS) {
    const d = levenshtein(input, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return bestDist <= 2 ? best : null;
}

// 友好回退：check/status/uninstall 支持位置参数作为 agent 过滤
//   如 `evokit check pi` 等价于 `evokit check --agent pi`
if (filter === null && ['check', 'status', 'uninstall'].includes(cmd)) {
  const bare = args[1];
  if (bare && !bare.startsWith('-')) {
    filter = new Set(bare.split(',').map((s) => s.trim()).filter(Boolean));
  }
}

// 用 async 主函数包裹，以支持远程源的异步拉取
async function main() {
  switch (cmd) {
    case 'agents':
      listAgents();
      break;
    case 'resources':
      listResources();
      break;
    case 'inventory': {
      const promptOnly = args.includes('--prompt');
      const noOutput = args.includes('--no-output');
      const outputIndex = args.findIndex((a) => a === '--output' || a === '-o');
      let outputPath = null;
      if (outputIndex !== -1) {
        const next = args[outputIndex + 1];
        // 漏写值：--output 后面没有参数，或下一个参数是另一个 flag（以 - 开头）
        if (!next || next.startsWith('-')) {
          console.error(`错误：\`${args[outputIndex]}\` 需要跟一个文件路径，例如 \`--output report.md\``);
          process.exitCode = 1;
          return;
        }
        outputPath = next;
      } else if (noOutput) {
        outputPath = 'false';
      }
      inventory(filter, promptOnly, outputPath, isProject);
      break;
    }
    case 'init':
      isProject ? initProject() : initGlobal();
      break;
    case 'sync':
      if (resourceFilter !== null) {
        await syncResources(resourceFilter);
      } else {
        isProject ? syncProject(filter) : syncGlobal(filter);
      }
      break;
    case 'check':
      check(filter, isProject);
      break;
    case 'status':
      status(filter, isProject);
      break;
    case 'uninstall':
      isProject ? uninstallProject(filter) : uninstallGlobal(filter);
      break;
    case 'knowledge':
      knowledgeCommand(args.slice(1));
      break;
    case 'harvest':
      harvestCommand(args.slice(1));
      break;
    case 'learn':
      learnCommand(args.slice(1));
      break;
    case 'review':
      reviewCommand(args.slice(1));
      break;
    case 'recall':
      recallCommand(args.slice(1));
      break;
    case 'help':
    case '--help':
    case '-h':
      help();
      break;
    default: {
      const suggestion = suggestCommand(cmd);
      console.log(`未知命令：${cmd}\n`);
      if (suggestion) {
        console.log(`  你是不是想输入 \`evokit ${suggestion}\`？\n`);
      }
      help();
      process.exitCode = 1;
    }
  }
}

try {
  await main();
} catch (error) {
  debug('cli', 'uncaught exception', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    durationMs: Date.now() - startedAt,
  });
  if (!isDebugEnabled()) throw error;
  process.exitCode = 1;
} finally {
  debug('cli', 'end', {
    command: cmd,
    exitCode: process.exitCode || 0,
    durationMs: Date.now() - startedAt,
  });
}
