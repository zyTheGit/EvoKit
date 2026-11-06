// review 命令（M0 骨架）：列出 .pending/ 草稿摘要 + 打印裁决命令提示
// 实际裁决（--accept/--reject/--merge/--skill/--audit）在 M2 实现；本期只读不写

import { existsSync } from 'node:fs';
import { PENDING_DIR, KNOWLEDGE_DIR } from '../paths.js';
import { listCards } from '../knowledge-cards.js';

/**
 * `evokit review` 入口
 * @param {string[]} args 参数（不含 'review' 本身）
 */
export function reviewCommand(args) {
  // M2 将实现 --accept <id> / --reject <id> / --merge <id> <into> / --skill / --audit
  const decided = args.find((a) => ['--accept', '--reject', '--merge', '--skill', '--audit'].includes(a));
  if (decided) {
    console.log(`ℹ 裁决功能（${decided} …）尚未实现，计划在 M2 提供；本版仅支持查看草稿清单。`);
  }

  const showList = args.length === 0 || args.includes('--list') || decided;
  if (!showList) {
    console.log(`用法：evokit review [--list]
  evokit review            列出待审草稿摘要
  evokit review --accept <id>    接受草稿入库（M2 提供）
  evokit review --reject <id>    拒绝草稿（M2 提供）`);
    process.exitCode = 1;
    return;
  }
  listPending();
}

/** 列出 .pending/*.md 草稿摘要（id / title / confidence / related） */
function listPending() {
  if (!existsSync(PENDING_DIR)) {
    console.log(`ℹ 知识根尚未初始化（缺 ${KNOWLEDGE_DIR}），先运行 \`evokit knowledge init\`。`);
    return;
  }
  const cards = listCards(PENDING_DIR);
  if (cards.length === 0) {
    console.log('✓ 暂无待审草稿（.pending/ 为空）。运行 `evokit learn` 从会话史提纯产出草稿。');
    return;
  }
  console.log(`📋 待审草稿（${cards.length} 张）— ${PENDING_DIR}\n`);
  cards.forEach((c, i) => {
    const title = String(c.front.title ?? '（无标题）');
    const conf = c.front.confidence !== undefined ? String(c.front.confidence) : '-';
    const related = Array.isArray(c.front.related)
      ? c.front.related.join(', ')
      : (c.front.related !== undefined && c.front.related !== '' ? String(c.front.related) : '-');
    console.log(`  ${i + 1}. ${c.id}  「${title}」  confidence=${conf}  related=${related}`);
  });
  console.log(`
裁决命令（M2 上线，本版为骨架预览）:
  evokit review --accept <id>      接受草稿入库（confirmed + git commit）
  evokit review --reject <id>      拒绝草稿（移入 .rejected/）
  evokit review --merge <id> <into>  并入既有卡（retired + mergedInto）`);
}
