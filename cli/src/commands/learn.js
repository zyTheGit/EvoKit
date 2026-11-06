// learn 命令（T-M2.5）：harvest → distill → 按档位处理 .pending 草稿 的编排
// 三档（knowledge.automation，默认 manual 人在环，红线 #7）：
//   manual  打印审阅提示，全部留审；
//   assist  confidence ≥ autoThreshold 且裁决 ADD 且非 suspect 的自动入库（acceptedBy: auto），其余留审；
//   auto    全部自动入库；--auto 本次临时覆盖为 auto 档。

import { PENDING_DIR } from '../paths.js';
import { listCards } from '../knowledge-cards.js';
import { runHarvest, loadEngineConfig } from './harvest.js';
import { runDistill } from '../distill.js';
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
 *   --session <id> 只提纯指定会话 / --auto 本次临时用 auto 档
 */
export function learnCommand(args) {
  const opts = {
    full: args.includes('--full'),
    noDistill: args.includes('--no-distill'),
    auto: args.includes('--auto'),
    agent: flagValue(args, '--agent'),
    session: flagValue(args, '--session'),
  };
  try {
    learnRun(opts);
  } catch (e) {
    console.error(`✗ learn 失败：${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

/**
 * learn 主体（供测试复用）：采集 → 提纯 → 草稿三档处理 → 尾部报告（各步计数）。
 * @param {{ full?: boolean, noDistill?: boolean, auto?: boolean, agent?: string | null,
 *           session?: string | null, quietHarvest?: boolean }} opts
 * @returns {{ harvest: object, distill: object | null, automation: string, autoAccepted: number, leftPending: string[], acceptFailed: string[] }}
 */
export function learnRun(opts = {}) {
  const startedAt = Date.now();
  const { knowledge } = loadEngineConfig();
  const automation = opts.auto ? 'auto' : String(knowledge.automation || 'manual');

  // ① harvest（复用 T-M1.5 同一实现）
  const hr = runHarvest({ full: !!opts.full, quiet: !!opts.quietHarvest });

  // ② distill（--no-distill 跳过；失败降级不中断）
  let dr = null;
  if (!opts.noDistill) {
    dr = runDistill({ agent: opts.agent, session: opts.session });
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
  return { harvest: hr, distill: dr, automation, autoAccepted, leftPending, acceptFailed };
}
