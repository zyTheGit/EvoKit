#!/usr/bin/env node
/**
 * web 测试夹具（M7）：在临时目录铺设一套完整的数据根（卡片/索引/引用/配置/报告/水位线/静态产物/git）。
 * 纯 node:fs 操作，不 import cli/src 任何模块——主测试文件负责先设 EVOKIT_HOME 再动态 import。
 * 入口文件（托管块三态）由主测试在计算期望块后写入。
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export function buildFixture() {
  const tmp = mkdtempSync(join(tmpdir(), 'evokit-web-test-'));
  const evokitDir = join(tmp, '.evokit');
  const knowledgeDir = join(evokitDir, 'knowledge');
  const pendingDir = join(knowledgeDir, '.pending');
  const archiveDir = join(knowledgeDir, '.archive');
  const rejectedDir = join(knowledgeDir, '.rejected');
  const reportsDir = join(evokitDir, 'reports');
  const staticDir = join(tmp, 'web-dist');
  for (const dir of [
    knowledgeDir, pendingDir, archiveDir, rejectedDir, reportsDir,
    join(staticDir, 'assets'),
    join(tmp, '.claude'), join(tmp, '.pi', 'agent'), join(tmp, '.codex'),
  ]) {
    mkdirSync(dir, { recursive: true });
  }

  const ids = {
    A: 'k20261108-a1b2c3d4',   // confirmed，tags 含「软链接」，recall 2 次
    B: 'k20261108-b2c3d4e5',   // confirmed，type fact，recall 1 次
    CN: '20261108-中文卡测试用例', // confirmed，中文 id（真实卡形态；防路由参数解码回归）
    DRAFT: 'k20261108-e5f6a7b8',
    ARCHIVE: 'k20261108-9c8d7e6f',
    REJECT: 'k20261108-5f4e3d2c',
  };

  const cards = {
    [ids.A]: [knowledgeDir, `---
id: ${ids.A}
title: 夹具卡A 软链接主题
type: workflow
status: confirmed
source: fixture://test
confidence: 0.9
updated: 2026-11-08T01:00:00.000Z
tags:
  - 软链接
  - 测试
---

夹具卡A正文：验证详情渲染与检索命中。`],
    [ids.B]: [knowledgeDir, `---
id: ${ids.B}
title: 夹具卡B 主题
type: fact
status: confirmed
source: fixture://test
confidence: 0.7
updated: 2026-11-07T01:00:00.000Z
tags:
  - 测试
---

卡B说明文字。`],
    [ids.CN]: [knowledgeDir, `---
id: ${ids.CN}
title: 中文卡测试用例
type: preference
status: confirmed
source: fixture://test
confidence: 0.8
updated: 2026-11-04T01:00:00.000Z
tags:
  - 中文
---

中文卡正文，用于验证路由参数解码。`],
    [ids.DRAFT]: [pendingDir, `---
id: ${ids.DRAFT}
title: 夹具草稿
type: pattern
status: draft
source: fixture://test
confidence: 0.5
updated: 2026-11-08T02:00:00.000Z
tags:
  - 草稿
---

草稿正文。`],
    [ids.ARCHIVE]: [archiveDir, `---
id: ${ids.ARCHIVE}
title: 夹具归档卡
type: fact
status: retired
source: fixture://test
confidence: 0.6
updated: 2026-11-06T01:00:00.000Z
---

归档正文。`],
    [ids.REJECT]: [rejectedDir, `---
id: ${ids.REJECT}
title: 夹具被拒卡
type: pitfall
status: draft
source: fixture://test
confidence: 0.4
updated: 2026-11-05T01:00:00.000Z
---

被拒正文。`],
  };
  for (const [id, [dir, content]] of Object.entries(cards)) {
    writeFileSync(join(dir, `${id}.md`), content, 'utf-8');
  }

  writeFileSync(join(knowledgeDir, 'knowledge-index.md'), `# EvoKit 知识索引

## EvoKit 知识
- [${ids.A}] 🔧 夹具卡A 软链接主题 #软链接 #测试
- [${ids.B}] 夹具卡B 主题 #测试
`, 'utf-8');

  writeFileSync(join(knowledgeDir, 'references.jsonl'), [
    JSON.stringify({ ts: '2026-11-07T10:00:00.000Z', type: 'recall', cardId: ids.A }),
    JSON.stringify({ ts: '2026-11-08T09:00:00.000Z', type: 'recall', cardId: ids.A }),
    JSON.stringify({ ts: '2026-11-08T09:30:00.000Z', type: 'l2', cardId: ids.B }),
  ].join('\n') + '\n', 'utf-8');

  writeFileSync(join(evokitDir, 'settings.json'), JSON.stringify({
    agents: [
      { id: 'claude', name: 'Claude Code', global: '~/.claude/CLAUDE.md', project: 'CLAUDE.md' },
      { id: 'pi', name: 'Pi', global: '~/.pi/agent/APPEND_SYSTEM.md', project: 'APPEND_SYSTEM.md' },
      { id: 'codex', name: 'Codex', global: '~/.codex/AGENTS.md', project: 'AGENTS.md' },
    ],
    resources: [
      {
        id: 'context',
        type: 'text',
        source: '~/.evokit/context.md',
        targets: ['~/.claude/CLAUDE.md', '~/.pi/agent/APPEND_SYSTEM.md', '~/.codex/AGENTS.md'],
      },
    ],
  }, null, 2), 'utf-8');

  writeFileSync(join(evokitDir, 'context.md'), '# 测试偏好\n\n- 中文回复\n- 零依赖\n', 'utf-8');
  writeFileSync(join(reportsDir, 'evokit-inventory-20261108.md'), '# 审计报告\n\n- 夹具内容\n', 'utf-8');
  writeFileSync(join(evokitDir, 'state.json'), JSON.stringify({
    sources: {
      'claude-sessions': { lastRunAt: '2026-11-08T00:00:00.000Z', counts: { events: 42, files: 7 }, files: { a: {}, b: {}, c: {} } },
    },
    distill: { files: { x: {}, y: {} }, lastRunAt: '2026-11-08T00:30:00.000Z' },
  }, null, 2), 'utf-8');

  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><html lang="zh-CN"><title>EvoKit 知识库</title>夹具页</html>', 'utf-8');
  writeFileSync(join(staticDir, 'assets', 'app.js'), 'console.log("fixture");\n', 'utf-8');

  // git 夹具（可用时验证 history；缺失时主测试优雅降级断言）
  const gitOk = spawnSync('git', ['--version']).status === 0;
  if (gitOk) {
    spawnSync('git', ['init'], { cwd: knowledgeDir });
    spawnSync('git', ['add', '-A'], { cwd: knowledgeDir });
    spawnSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=test', 'commit', '-m', 'learn: fixture 入库（测试夹具）'], { cwd: knowledgeDir });
  }

  return {
    tmp,
    evokitDir,
    knowledgeDir,
    pendingDir,
    archiveDir,
    rejectedDir,
    reportsDir,
    staticDir,
    ids,
    claudeEntry: join(tmp, '.claude', 'CLAUDE.md'),
    piEntry: join(tmp, '.pi', 'agent', 'APPEND_SYSTEM.md'),
    codexEntry: join(tmp, '.codex', 'AGENTS.md'),
    gitOk,
  };
}
