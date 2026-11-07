// learn 命令（T-M2.5）：triggers 消费 → harvest → distill → 按档位处理 .pending 草稿 的编排
// T-M5.1：启动时消费 hook learn-enqueue 入队的 ~/.evokit/triggers/learn-*.json（消费即删，损坏文件删除跳过），
//   收集 session 集合并入 --session；集合非空 → harvest 后在 distill 层按会话过滤（与既有 --session 同谓词）；
//   无 triggers 且无 --session → 全量增量（distill 按 state.distill 水位线只提纯 inbox 新增行）。
// 三档（knowledge.automation，默认 manual 人在环，红线 #7）：
//   manual  打印审阅提示，全部留审；
//   assist  confidence ≥ autoThreshold 且裁决 ADD 且非 suspect 的自动入库（acceptedBy: auto），其余留审；
//   auto    全部自动入库；--auto 本次临时覆盖为 auto 档。
//   --assist 本次临时覆盖为 assist 档（T-M6，与 --auto 互斥，同传报错 exit 1）。

import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PENDING_DIR, TRIGGERS_DIR } from '../paths.js';
import { listCards } from '../knowledge-cards.js';
import { runHarvest, loadEngineConfig } from './harvest.js';
import { runDistill, readInboxEvents } from '../distill.js';
import { acceptDraft } from './review.js';

/** 解析 `--flag <value>`；缺失返回 null */
function flagValue(args, flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  const v = args[i + 1];
  return v && !v.startsWith('-') ? v : null;
}

/**
 * `evokit learn` 入口
 * @param {string[]} args 参数（不含 'learn' 本身）：
 *   --full 全量收割 / --no-distill 跳过提纯 / --agent <id> 显式执行者 /
 *   --session <id> 只提纯指定会话 / --auto 本次临时用 auto 档 / --assist 本次临时用 assist 档（与 --auto 互斥）
 */
export function learnCommand(args) {
  const opts = {
    full: args.includes('--full'),
    noDistill: args.includes('--no-distill'),
    auto: args.includes('--auto'),
    assist: args.includes('--assist'),
    agent: flagValue(args, '--agent'),
    session: flagValue(args, '--session'),
  };
  if (opts.auto && opts.assist) {
    console.error('✗ learn：--auto 与 --assist 互斥，只能二选一（--auto 全部自动入库 / --assist 高置信自动入库其余留审）');
    process.exitCode = 1;
    return;
  }
  try {
    learnRun(opts);
  } catch (e) {
    console.error(`✗ learn 失败：${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

/**
 * learn 主体（供测试复用）：采集 → 提纯 → 草稿三档处理 → 尾部报告（各步计数）。
 * @param {{ full?: boolean, noDistill?: boolean, auto?: boolean, assist?: boolean, agent?: string | null,
 *           session?: string | null, quietHarvest?: boolean }} opts
 * @returns {{ harvest: object, distill: object | null, automation: string, autoAccepted: number, leftPending: string[], acceptFailed: string[], triggersConsumed: number, sessions: string[] }}
 */
export function learnRun(opts = {}) {
  const startedAt = Date.now();
  // ⓪ 消费 hook learn-enqueue 入队的触发（T-M5.1，消费即删）：读 learn-*.json 收集 session 集合后全部删除。
  //   损坏文件删除跳过；目录不存在/读目录失败视为无触发（触发属便利层，不阻断 learn）
  const sessionSet = new Set();
  let triggersConsumed = 0;
  try {
    if (existsSync(TRIGGERS_DIR)) {
      const names = readdirSync(TRIGGERS_DIR).filter((n) => /^learn-.*\.json$/.test(n)).sort();
      for (const name of names) {
        const file = join(TRIGGERS_DIR, name);
        try {
          const obj = JSON.parse(readFileSync(file, 'utf-8'));
          triggersConsumed += 1;
          if (obj && typeof obj.session === 'string' && obj.session) sessionSet.add(obj.session);
        } catch {
          // 损坏文件：删除跳过，不进 session 集合
        }
        try {
          rmSync(file, { force: true });
        } catch {
          // 删除失败：留待下次 learn 再消费，不影响本次运行
        }
      }
    }
  } catch {
    // 读目录失败视为无触发
  }
  if (opts.session) sessionSet.add(String(opts.session)); // --session 显式值并入同一集合
  if (triggersConsumed > 0) console.log(`📬 收到 ${triggersConsumed} 条会话学习触发（triggers 消费即删）`);
  const { knowledge } = loadEngineConfig();
  // 档位：--auto > --assist > settings（命令行本次临时覆盖优先于配置）
  const automation = opts.auto ? 'auto' : (opts.assist ? 'assist' : String(knowledge.automation || 'manual'));

  // ① harvest（复用 T-M1.5 同一实现）
  const hr = runHarvest({ full: !!opts.full, quiet: !!opts.quietHarvest });

  // ② distill（--no-distill 跳过；失败降级不中断）
  // 会话集合非空（triggers / --session）：读 inbox 后按集合过滤（与既有 --session 同谓词），传过滤后事件
  //   （显式范围不走水位线：允许重跑，重复入库由阶段 B NOOP/MERGE 兜底）；
  // 集合为空：全量增量——runDistill 按 state.distill 水位线只读各 inbox 文件新增行（夜间 learn --auto 不再整箱重提纯）
  let dr = null;
  if (!opts.noDistill) {
    let events = null;
    if (sessionSet.size > 0) {
      events = readInboxEvents().events.filter((ev) => {
        const top = typeof ev.sessionId === 'string' ? ev.sessionId : '';
        const meta = ev.meta && typeof ev.meta.sessionId === 'string' ? ev.meta.sessionId : '';
        return (top !== '' && sessionSet.has(top)) || (meta !== '' && sessionSet.has(meta));
      });
    }
    dr = runDistill({ agent: opts.agent, events });
  }

  // ③ .pending 按档位处理
  const pending = listCards(PENDING_DIR);
  const threshold = Number.isFinite(Number(knowledge.autoThreshold)) ? Number(knowledge.autoThreshold) : 0.9;
  let autoAccepted = 0;
  const leftPending = [];
  const acceptFailed = [];
  const tryAccept = (c) => {
    try {
      acceptDraft(c.id, { acceptedBy: 'auto' });
      return true;
    } catch (e) {
      acceptFailed.push(`${c.id}: ${String(e instanceof Error ? e.message : e).split('\n')[0]}`);
      return false;
    }
  };
  if (automation === 'auto') {
    for (const c of pending) {
      if (tryAccept(c)) autoAccepted += 1;
    }
  } else if (automation === 'assist') {
    for (const c of pending) {
      const conf = Number(c.front.confidence);
      const isAdd = String(c.front.verdict || 'ADD').toUpperCase() === 'ADD';
      // frontmatter 布尔值经受限解析读回是字符串 'true'，两种形态都视为 suspect
      const isSuspect = c.front.suspect === true || String(c.front.suspect) === 'true';
      if (!isSuspect && isAdd && Number.isFinite(conf) && conf >= threshold) {
        if (tryAccept(c)) autoAccepted += 1;
      } else {
        leftPending.push(c.id);
      }
    }
  } else {
    leftPending.push(...pending.map((c) => c.id));
  }

  // ④ 尾部报告（各步计数）
  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n🌱 learn 完成 — 总耗时 ${secs}s`);
  console.log(`  ① harvest：${hr.totals.enabled} 源处理 · 新增事件 ${hr.totals.written} 条${hr.totals.dryRun ? '（dry-run）' : ''}`);
  const distillBits = dr
    ? `${dr.batches} 批 · 草稿 ${dr.drafts} 张${dr.ok ? '' : ' · 已降级（无可用执行者）'}`
    : '跳过（--no-distill）';
  console.log(`  ② distill：${distillBits}`);
  const tierBits = [`${automation} 档`];
  if (automation === 'assist') tierBits.push(`阈值 ${threshold}`);
  console.log(`  ③ 草稿处理（${tierBits.join('，')}）：自动入库 ${autoAccepted} · 留审 ${leftPending.length}${acceptFailed.length ? ` · 入库失败 ${acceptFailed.length}` : ''}`);
  for (const f of acceptFailed) console.log(`    · 入库失败 ${f}`);
  if (leftPending.length > 0 && automation !== 'auto') {
    console.log('  后续：evokit review 查看待审清单并裁决（--accept / --reject / --merge / --audit）。');
  }
  return { harvest: hr, distill: dr, automation, autoAccepted, leftPending, acceptFailed, triggersConsumed, sessions: [...sessionSet] };
}
