/**
 * learn.ts 测试 — 知识提取确认背书 / 显式声明
 *
 * 仅测试导出的纯函数（listPendingCandidates / confirmPendingCandidate /
 * rejectPendingCandidate / declareExplicit），不测 CLI 交互部分（@clack/prompts）。
 */

import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  listPendingCandidates,
  confirmPendingCandidate,
  rejectPendingCandidate,
  declareExplicit,
} from '../../src/commands/learn.js';
import { KnowledgeRepository } from '../../src/core/repository.js';
import {
  readKnowledgeEntry,
  readKnowledgeIndex,
  KnowledgeConfidence,
} from '../../src/core/knowledge.js';

const tmpDirs: string[] = [];

function tmpHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-learn-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function repoFor(homeRoot: string): KnowledgeRepository {
  // 个人级用 ~/.claude/memory 模拟
  const base = path.join(homeRoot, '.claude', 'memory');
  return new KnowledgeRepository({ knowledgeRoot: base });
}

describe('declareExplicit（显式声明，当场背书，#25）', () => {
  it('直接写入 knowledge/（source=explicit，confidence=FRESH，scope 由用户指定）+ 更新索引', () => {
    const home = tmpHome();
    const r = repoFor(home);
    const entry = declareExplicit(r.knowledgeRoot, {
      type: 'convention',
      content: '使用 uv 代替 pip',
      scope: 'project',
      context: 'Python 包管理偏好',
    });

    expect(entry.id).toMatch(/^convention-/);
    expect(entry.source).toBe('explicit');
    expect(entry.confidence).toBe(KnowledgeConfidence.FRESH);
    expect(entry.scope).toBe('project');

    // 已入库且未经过 .pending/
    expect(r.listPending()).toEqual([]);
    const onDisk = readKnowledgeEntry(path.join(r.knowledgeDir, `${entry.id}.md`));
    expect(onDisk).not.toBeNull();
    expect(onDisk!.scope).toBe('project');

    // 索引已更新
    const idx = readKnowledgeIndex(path.join(r.knowledgeRoot, 'knowledge-index.md'));
    expect(idx.evokit.some((l) => l.includes(entry.id))).toBe(true);
  });

  it('生成唯一 id（跨 active+pending 去重）', () => {
    const home = tmpHome();
    const r = repoFor(home);
    declareExplicit(r.knowledgeRoot, { type: 'convention', content: 'Use uv instead of pip', scope: 'project' });
    const second = declareExplicit(r.knowledgeRoot, { type: 'convention', content: 'Use uv instead of pip', scope: 'project' });
    // generateSlug('Use uv instead of pip') → 'use-uv-instead-of'
    expect(second.id).toBe('convention-use-uv-instead-of-2');
  });
});

describe('listPendingCandidates（确认路径，读取 .pending/）', () => {
  it('收集 memoryDirs 下全部待确认草稿', () => {
    const home = tmpHome();
    const r = repoFor(home);
    r.createDraft({ type: 'architecture', content: 'packages/api 是 packages/web 的上游' });
    r.createDraft({ type: 'workflow', content: 'commit 用 conventional' });

    const candidates = listPendingCandidates([r.knowledgeRoot]);
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.repo.knowledgeRoot === r.knowledgeRoot)).toBe(true);
  });

  it('无草稿时返回空数组', () => {
    const home = tmpHome();
    const r = repoFor(home);
    expect(listPendingCandidates([r.knowledgeRoot])).toEqual([]);
  });
});

describe('confirmPendingCandidate（确认背书，#31 D5）', () => {
  it('确认草稿 → 入库 + 删草稿 + 更新索引', () => {
    const home = tmpHome();
    const r = repoFor(home);
    const d = r.createDraft({ type: 'preference', content: '使用 pnpm' });

    const entry = confirmPendingCandidate(r.knowledgeRoot, d.id, 'personal');
    expect(entry).not.toBeNull();
    expect(entry!.scope).toBe('personal');
    expect(entry!.confidence).toBe(KnowledgeConfidence.FRESH);

    expect(r.listPending()).toEqual([]);
    const onDisk = readKnowledgeEntry(path.join(r.knowledgeDir, `${d.id}.md`));
    expect(onDisk!.id).toBe(d.id);
    const idx = readKnowledgeIndex(path.join(r.knowledgeRoot, 'knowledge-index.md'));
    expect(idx.evokit.some((l) => l.includes(d.id))).toBe(true);
  });

  it('草稿不存在时返回 null', () => {
    const home = tmpHome();
    expect(confirmPendingCandidate(repoFor(home).knowledgeRoot, 'nope', 'project')).toBeNull();
  });
});

describe('rejectPendingCandidate（拒绝草稿）', () => {
  it('删除草稿，返回 true；不存在返回 false', () => {
    const home = tmpHome();
    const r = repoFor(home);
    const d = r.createDraft({ type: 'convention', content: '不要这条' });
    expect(rejectPendingCandidate(r.knowledgeRoot, d.id)).toBe(true);
    expect(r.listPending()).toEqual([]);
    expect(rejectPendingCandidate(r.knowledgeRoot, d.id)).toBe(false);
  });
});

describe('declareExplicit 架构型标注（#33）', () => {
  it('type=architecture + impact 写入 ## 影响范围', () => {
    const home = tmpHome();
    const r = repoFor(home);
    const e = declareExplicit(r.knowledgeRoot, {
      type: 'architecture',
      content: '网关是核心上游',
      scope: 'project',
      impact: '影响 packages/web 的部署与鉴权流程',
    });
    const raw = fs.readFileSync(path.join(r.knowledgeDir, `${e.id}.md`), 'utf-8');
    expect(raw).toContain('## 影响范围');
    expect(raw).toContain('影响 packages/web 的部署与鉴权流程');
  });

  it('type=architecture 缺 impact 时补最小占位并标记索引', () => {
    const home = tmpHome();
    const r = repoFor(home);
    const e = declareExplicit(r.knowledgeRoot, {
      type: 'architecture',
      content: 'A 是 B 的上游',
      scope: 'project',
    });
    const raw = fs.readFileSync(path.join(r.knowledgeDir, `${e.id}.md`), 'utf-8');
    expect(raw).toContain('## 影响范围');
    const idx = readKnowledgeIndex(path.join(r.knowledgeRoot, 'knowledge-index.md'));
    expect(idx.evokit.some((l) => l.includes('🏛') && l.includes(e.id))).toBe(true);
  });
});
