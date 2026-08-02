/**
 * boot.ts 测试 — 会话启动校验命令
 *
 * 仅测试导出的纯函数（runBootChecks、summarizeChecks），不测试 CLI action。
 */

import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { runBootChecks, summarizeChecks } from '../../src/commands/boot.js';
import { getMemoryDir } from '../../src/core/memory.js';
import {
  getEvokitDir,
  getKnowledgeDir,
  getKnowledgeIndexPath,
  writeKnowledgeEntry,
  appendToKnowledgeIndex,
} from '../../src/core/knowledge.js';

// ─── 测试辅助 ───────────────────────────────────────────────

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-boot-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** 构建一个最小合法 memoryDir + knowledge-index + 一条合法条目 */
function setupHealthy(memoryDir: string): void {
  const evokitDir = getEvokitDir(memoryDir);
  const knowledgeDir = getKnowledgeDir(memoryDir);
  const indexPath = getKnowledgeIndexPath(memoryDir);
  fs.mkdirSync(evokitDir, { recursive: true });
  writeKnowledgeEntry(
    path.join(knowledgeDir, 'convention-healthy.md'),
    {
      id: 'convention-healthy',
      scope: 'personal',
      type: 'convention',
      source: 'explicit',
      confidence: 0.9,
      created: '2026-07-30',
      context: '使用 uv 代替 pip',
    },
    '## 内容\n\n使用 uv 代替 pip',
  );
  appendToKnowledgeIndex(indexPath, 'convention-healthy', '使用 uv 代替 pip');
}

// ─── runBootChecks ──────────────────────────────────────────

describe('runBootChecks', () => {
  it('健康知识库全部通过', () => {
    const homeDir = tmpDir();
    const memoryDir = getMemoryDir(homeDir, 'claude');
    setupHealthy(memoryDir);

    const checks = runBootChecks({ memoryDirs: [memoryDir] });
    const fails = checks.filter((c) => !c.pass && !c.warnOnly);
    // 至少有目录结构、索引格式、条目完整性、frontmatter 4 项
    expect(checks.length).toBeGreaterThanOrEqual(4);
    expect(fails).toEqual([]);
  });

  it('缺失目录结构时报错', () => {
    const memoryDir = getMemoryDir(tmpDir(), 'claude'); // 未初始化
    const checks = runBootChecks({ memoryDirs: [memoryDir] });
    const dirCheck = checks.find((c) => c.name.includes('目录结构'))!;
    expect(dirCheck.pass).toBe(false);
    // 目录缺失时跳过后续知识目录检查
    expect(checks.filter((c) => c.name.includes('frontmatter'))).toHaveLength(0);
  });

  it('索引引用缺失条目时报错', () => {
    const homeDir = tmpDir();
    const memoryDir = getMemoryDir(homeDir, 'claude');
    setupHealthy(memoryDir);
    // 在索引手动加一条不存在的引用
    const indexPath = getKnowledgeIndexPath(memoryDir);
    appendToKnowledgeIndex(indexPath, 'ghost-entry', '不存在条目');

    const checks = runBootChecks({ memoryDirs: [memoryDir] });
    const check = checks.find((c) => c.name.includes('索引引用的条目存在'))!;
    expect(check.pass).toBe(false);
    expect(check.detail).toContain('ghost-entry');
  });

  it('frontmatter 缺失/confidence 非法时报错', () => {
    const homeDir = tmpDir();
    const memoryDir = getMemoryDir(homeDir, 'claude');
    // 先建合法索引使目录结构检查通过
    const evokitDir = getEvokitDir(memoryDir);
    const indexPath = getKnowledgeIndexPath(memoryDir);
    fs.mkdirSync(evokitDir, { recursive: true });
    appendToKnowledgeIndex(indexPath, 'convention-bad', '坏条目');
    // 写入 confidence 非三档值的不合法条目（#30 校验应拒绝）
    writeKnowledgeEntry(
      path.join(getKnowledgeDir(memoryDir), 'convention-bad.md'),
      {
        id: 'convention-bad',
        scope: 'personal',
        type: 'convention',
        source: 'explicit',
        confidence: 0.3, // 非法档位
        created: '2026-07-30',
      } as never,
      '## 内容',
    );

    const checks = runBootChecks({ memoryDirs: [memoryDir] });
    const check = checks.find((c) => c.name.includes('frontmatter'))!;
    expect(check.pass).toBe(false);
    expect(check.detail).toContain('convention-bad');
  });

  it('认知核心文件行数超限时报错', () => {
    const memoryDir = getMemoryDir(tmpDir(), 'claude');
    const corePath = path.join(tmpDir(), 'CLAUDE.md');
    fs.writeFileSync(corePath, Array(160).fill('# line').join('\n'), 'utf-8');

    const checks = runBootChecks({ memoryDirs: [memoryDir], coreFilePath: corePath, coreMaxLines: 150 });
    const check = checks.find((c) => c.name.includes('认知核心文件行数'))!;
    expect(check.pass).toBe(false);
    expect(check.detail).toContain('160');
  });
});

// ─── summarizeChecks ────────────────────────────────────────

describe('summarizeChecks', () => {
  it('统计 ok/warn/fail 与 allPass', () => {
    const checks = [
      { name: 'a', pass: true },
      { name: 'b', pass: false, warnOnly: true },
      { name: 'c', pass: false },
    ];
    const s = summarizeChecks(checks);
    expect(s).toEqual({ ok: 1, warn: 1, fail: 1, allPass: false });
  });

  it('warnOnly 不影响 allPass', () => {
    const checks = [{ name: 'a', pass: false, warnOnly: true }];
    expect(summarizeChecks(checks).allPass).toBe(true);
  });
});
