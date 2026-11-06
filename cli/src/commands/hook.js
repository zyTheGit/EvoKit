// hook 命令（T-M5.1）：钩子入队层 —— 逻辑单实现、任何异常无条件 exit 0、--json stdout 恰好一个合法 JSON、堆栈禁入 stdout
// 契约（计划 §2.4 / ADR 0007 纪律全套）：hook learn-enqueue 只写 ~/.evokit/triggers/learn-*.json 立即返回，
// 不执行 learn（distill 分钟级，在 Stop 钩子里同步跑会阻断会话结束）；learn 由夜间任务/手动消费 triggers。
// 安装方式 = 打印配置片段 + 文档，由用户自行合并进 ~/.claude/settings.json，不自动改写工具配置。

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { TRIGGERS_DIR } from '../paths.js';

/** 用法文本（未知/缺失子命令打印并 exit 1；learn-enqueue 自身的任何路径都 exit 0） */
const USAGE = `用法：evokit hook learn-enqueue [--session <id>] [--json]

  evokit hook learn-enqueue  会话结束钩子入队：写一条触发文件到 ~/.evokit/triggers/ 立即返回（不执行 learn）
  --session <id>             可选，随触发文件传递，learn 消费时并入会话过滤集合
  --json                     可选，stdout 输出单个合法 JSON：
                             成功 {"ok":true,"queued":true,"file":"<触发文件名>"}
                             出错 {"ok":true,"queued":false,"error":"<可读原因>"}（不含堆栈）

  纪律（ADR 0007）：任何异常（目录不可写/磁盘满/未知错误）无条件 exit 0；
  非 --json 时错误信息只进 stderr；--json 时错误只进 JSON 的 error 字段；堆栈禁入 stdout。`;

/** 解析 `--flag <value>`；缺失或值像另一个 flag 时返回 null */
function flagValue(args, flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  const v = args[i + 1];
  return v && !v.startsWith('-') ? v : null;
}

/**
 * `evokit hook <子命令>` 入口
 * @param {string[]} args 子命令及参数（不含 'hook' 本身）：learn-enqueue / --session <id> / --json
 */
export function hookCommand(args) {
  const sub = args[0] || '';
  if (sub !== 'learn-enqueue') {
    console.log(USAGE);
    process.exitCode = 1; // 仅未知子命令退出 1；learn-enqueue 的任何路径都 exit 0（永不阻断宿主）
    return;
  }
  const isJson = args.includes('--json');
  try {
    // 目录不存在则建；被同名文件占用/权限不足等异常走 catch（exit 0 纪律）
    mkdirSync(TRIGGERS_DIR, { recursive: true });
    const ts = new Date().toISOString();
    const stamp = ts.replace(/[-:]/g, '').replace(/\..+$/, ''); // 文件名安全时间戳
    let file = '';
    for (let i = 0; i < 5; i += 1) {
      const cand = join(TRIGGERS_DIR, `learn-${stamp}-${randomBytes(2).toString('hex')}.json`);
      if (!existsSync(cand)) { file = cand; break; } // 同毫秒撞名重试（4 位随机 + 最多 5 次）
    }
    if (!file) throw new Error('触发文件名冲突，重试 5 次仍失败');
    const session = flagValue(args.slice(1), '--session');
    writeFileSync(file, JSON.stringify({ ts, session: session ?? null, cwd: process.cwd() }), 'utf-8');
    if (isJson) console.log(JSON.stringify({ ok: true, queued: true, file: basename(file) }));
    // 非 --json 成功路径保持静默：钩子 stdout 可能整段进模型上下文，不多写一字
    process.exitCode = 0;
  } catch (e) {
    const msg = String((e instanceof Error ? e.message : e) ?? '未知错误').split('\n')[0]; // 只取首行，堆栈不外泄
    if (isJson) {
      console.log(JSON.stringify({ ok: true, queued: false, error: msg })); // stdout 恰好一个合法 JSON
    } else {
      console.error(`hook learn-enqueue 失败（不阻断宿主，已忽略）：${msg}`);
    }
    process.exitCode = 0; // 任何异常无条件 exit 0（ADR 0007 §2）
  }
}
