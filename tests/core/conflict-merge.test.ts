/**
 * conflict-merge 测试 — 助手间冲突合并：归一化全等重复检测 + 人工三选合并（ADR 0005）
 *
 * 覆盖：检测宇宙（active↔active / pending↔pending / active↔pending）、同 type 约束、
 * 跨作用域隔离、非语义近重复（措辞异义漏报）、合并后无孤儿、绝不自动择主。
 */

import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { KnowledgeRepository } from '../../src/core/repository.js';
import { readKnowledgeIndex } from '../../src/core/knowledge.js';
import { findExactDuplicates, resolveDuplicateGroup } from '../../src/core/dedup.js';

const tmpDirs: string[] = [];

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-conflict-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function repo(root?: string): KnowledgeRepository {
  return new KnowledgeRepository({ knowledgeRoot: root ?? tmpRoot() });
}

/** 建稿并确认入库（含索引行）。 */
function confirmDraft(
  r: KnowledgeRepository,
  input: {
    type: 'convention' | 'preference' | 'architecture' | 'workflow';
    content: string;
    scope?: 'personal' | 'project';
  },
): string {
  r.createDraft({ type: input.type, content: input.content });
  const id = r.listPending()[0];
  r.confirmDraft(id, input.scope ?? 'personal');
  return id;
}

describe('findExactDuplicates — 检测宇宙', () => {
  it('active↔active：同 type 同内容 → 一簇两成员', () => {
    const r = repo();
    confirmDraft(r, { type: 'convention', content: '使用 uv 代替 pip' });
    confirmDraft(r, { type: 'convention', content: '使用 uv 代替 pip' });

    const groups = findExactDuplicates(r);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('convention');
    expect(groups[0].members).toHaveLength(2);
    expect(groups[0].members.every((m) => m.status === 'active')).toBe(true);
  });

  it('pending↔pending：两条未确认草稿同内容 → 一簇', () => {
    const r = repo();
    r.createDraft({ type: 'workflow', content: 'commit 用 conventional 格式' });
    r.createDraft({ type: 'workflow', content: 'commit 用 conventional 格式' });

    const groups = findExactDuplicates(r);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
    expect(groups[0].members.every((m) => m.status === 'pending')).toBe(true);
  });

  it('active↔pending：已入库 + 草稿同内容 → 一簇，active 在前', () => {
    const r = repo();
    confirmDraft(r, { type: 'convention', content: '使用 Result<T> 而非 throw' });
    r.createDraft({ type: 'convention', content: '使用 Result<T> 而非 throw' });

    const groups = findExactDuplicates(r);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
    expect(groups[0].members[0].status).toBe('active');
    expect(groups[0].members[1].status).toBe('pending');
  });

  it('不同 type 同内容 → 不判为重复（type 是冲突键）', () => {
    const r = repo();
    confirmDraft(r, { type: 'convention', content: '相同文本' });
    confirmDraft(r, { type: 'preference', content: '相同文本' });

    expect(findExactDuplicates(r)).toHaveLength(0);
  });

  it('不同内容（非归一化全等）→ 不判为重复（非语义近重复，漏报可接受）', () => {
    const r = repo();
    confirmDraft(r, { type: 'convention', content: '使用 pnpm' });
    confirmDraft(r, { type: 'convention', content: '包管理器用 pnpm' }); // 语义同但归一化不等

    expect(findExactDuplicates(r)).toHaveLength(0);
  });

  it('归一化后全等（标点/空白/大小写差异）→ 判为重复', () => {
    const r = repo();
    confirmDraft(r, { type: 'convention', content: 'commit 用 Conventional。' });
    confirmDraft(r, { type: 'convention', content: 'commit用conventional' });

    const groups = findExactDuplicates(r);
    expect(groups).toHaveLength(1);
  });
});

describe('findExactDuplicates — 作用域隔离（ADR 0005 §作用域）', () => {
  it('个人级与项目级是独立 repo，互不聚簇', () => {
    const personal = repo();
    const project = repo();
    confirmDraft(personal, { type: 'convention', content: '同名约定' });
    confirmDraft(project, { type: 'convention', content: '同名约定' });

    expect(findExactDuplicates(personal)).toHaveLength(0);
    expect(findExactDuplicates(project)).toHaveLength(0);
  });

  it('空知识库 / 单条目 → 无重复', () => {
    const r = repo();
    expect(findExactDuplicates(r)).toHaveLength(0);
    confirmDraft(r, { type: 'convention', content: '唯一条目' });
    expect(findExactDuplicates(r)).toHaveLength(0);
  });
});

describe('resolveDuplicateGroup — 人工三选（绝不自动择主）', () => {
  it('保留主条：active 从条文件 + 索引行同步删除，无孤儿', () => {
    const r = repo();
    const id1 = confirmDraft(r, { type: 'convention', content: '重复约定' });
    const id2 = confirmDraft(r, { type: 'convention', content: '重复约定' });
    expect(id1).not.toBe(id2);

    const group = findExactDuplicates(r)[0];
    const { removed } = resolveDuplicateGroup(r, group, id1);

    expect(removed).toEqual([id2]);
    expect(r.getActive(id1)).not.toBeNull(); // 主条保留
    expect(r.getActive(id2)).toBeNull(); // 从条文件已删
    // 索引行同步删除：索引只剩主条
    const { evokit } = readKnowledgeIndex(r.indexPath);
    const indexedIds = evokit
      .map((l) => l.match(/^- \[([^\]]+)\]/)?.[1])
      .filter(Boolean) as string[];
    expect(indexedIds).toContain(id1);
    expect(indexedIds).not.toContain(id2);
    // 无残留重复
    expect(findExactDuplicates(r)).toHaveLength(0);
  });

  it('pending 从条走 rejectDraft（删草稿文件）', () => {
    const r = repo();
    confirmDraft(r, { type: 'convention', content: '冲突' });
    r.createDraft({ type: 'convention', content: '冲突' });
    const group = findExactDuplicates(r)[0];
    const keepId = group.members.find((m) => m.status === 'active')!.id;
    const dupId = group.members.find((m) => m.status === 'pending')!.id;

    resolveDuplicateGroup(r, group, keepId);

    expect(r.getPending(dupId)).toBeNull();
    expect(r.getActive(keepId)).not.toBeNull();
  });

  it('keepId 必由调用方传入——函数不自动选择（主条不被删）', () => {
    const r = repo();
    const id1 = confirmDraft(r, { type: 'convention', content: 'X' });
    const id2 = confirmDraft(r, { type: 'convention', content: 'X' });
    const group = findExactDuplicates(r)[0];

    // 调用方显式保留 id1 → id1 仍在、id2 删
    resolveDuplicateGroup(r, group, id1);
    expect(r.getActive(id1)).not.toBeNull();
    expect(r.getActive(id2)).toBeNull();
  });
});
