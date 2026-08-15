/**
 * dedup.ts 测试 — 确认闸门去重（ROADMAP v1.1 落地项）
 *
 * 覆盖：归一化文本匹配、同 type 相近条目查找、覆盖更新、重复候选去重。
 */

import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { KnowledgeRepository } from '../../src/core/repository.js';
import { readKnowledgeEntry, KnowledgeConfidence } from '../../src/core/knowledge.js';
import {
  normalizeKnowledgeText,
  findSimilarActive,
  hasContentAnywhere,
  overwriteActiveBody,
} from '../../src/core/dedup.js';
import { declareExplicit } from '../../src/commands/learn.js';

const tmpDirs: string[] = [];

function tmpHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-dedup-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function repo(root?: string): KnowledgeRepository {
  return new KnowledgeRepository({ knowledgeRoot: root ?? tmpHome() });
}

describe('normalizeKnowledgeText', () => {
  it('小写 + 去空白 + 去中英文标点', () => {
    expect(normalizeKnowledgeText('使用 uv 代替 pip')).toBe('使用uv代替pip');
    expect(normalizeKnowledgeText('  Use uv instead of pip! ')).toBe('useuvinsteadofpip');
    expect(normalizeKnowledgeText('a，b。c！d？e；f')).toBe('abcdef');
  });

  it('不同写法归一化后全等', () => {
    expect(normalizeKnowledgeText('commit 用 Conventional。')).toBe(
      normalizeKnowledgeText('commit用conventional'),
    );
  });
});

describe('findSimilarActive（同 type 归一化相近条目）', () => {
  it('同 type 同内容命中（body 匹配）', () => {
    const root = tmpHome();
    const r = repo(root);
    declareExplicit(root, { type: 'convention', content: '使用 uv 代替 pip', scope: 'project' });

    const hits = findSimilarActive(r, 'convention', '使用 uv 代替 pip');
    expect(hits).toHaveLength(1);
    expect(hits[0].entry.id).toMatch(/^convention-/);
    expect(hits[0].matchedOn).toBe('body');
  });

  it('同 type 内容不同不命中', () => {
    const root = tmpHome();
    const r = repo(root);
    declareExplicit(root, { type: 'convention', content: '使用 uv 代替 pip', scope: 'project' });

    expect(findSimilarActive(r, 'convention', '使用 pnpm 代替 npm')).toEqual([]);
  });

  it('type 不同不命中（内容无关）', () => {
    const root = tmpHome();
    const r = repo(root);
    declareExplicit(root, { type: 'convention', content: '使用 uv 代替 pip', scope: 'project' });

    expect(findSimilarActive(r, 'preference', '使用 uv 代替 pip')).toEqual([]);
  });

  it('context 摘要命中（matchedOn=context）', () => {
    const root = tmpHome();
    const r = repo(root);
    declareExplicit(root, {
      type: 'workflow',
      content: 'commit message 使用 Conventional Commits 格式',
      scope: 'project',
      context: 'commit message 使用 Conventional Commits 格式',
    });

    const hits = findSimilarActive(r, 'workflow', 'commit message 使用 Conventional Commits 格式');
    expect(hits).toHaveLength(1);
    expect(hits[0].matchedOn).toBe('context');
  });

  it('空内容不匹配任何条目', () => {
    const root = tmpHome();
    const r = repo(root);
    declareExplicit(root, { type: 'convention', content: '使用 uv 代替 pip', scope: 'project' });
    expect(findSimilarActive(r, 'convention', '')).toEqual([]);
  });
});

describe('overwriteActiveBody（去重"覆盖已有"动作）', () => {
  it('保留 id/来源/置信度/created，刷新 context 与 updated，重写正文', () => {
    const root = tmpHome();
    const r = repo(root);
    const first = declareExplicit(root, {
      type: 'convention',
      content: '使用 uv 代替 pip',
      scope: 'personal',
    });

    const updated = overwriteActiveBody(r, first.id, '使用 uvx 代替 pip', undefined);
    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(first.id);
    expect(updated!.scope).toBe('personal');
    expect(updated!.source).toBe('explicit');
    expect(updated!.confidence).toBe(KnowledgeConfidence.FRESH);
    expect(updated!.created).toBe(first.created);
    expect(updated!.context).toBe('使用 uvx 代替 pip');
    expect(updated!.updated).toBeDefined();

    const onDisk = readKnowledgeEntry(path.join(r.knowledgeDir, `${first.id}.md`));
    expect(onDisk!.context).toBe('使用 uvx 代替 pip');
  });

  it('架构型覆盖时补推理标注占位', () => {
    const root = tmpHome();
    const r = repo(root);
    const first = declareExplicit(root, {
      type: 'architecture',
      content: '网关是核心上游',
      scope: 'project',
      impact: '影响部署流程',
    });

    const updated = overwriteActiveBody(r, first.id, '网关仍是核心上游', undefined);
    expect(updated).not.toBeNull();
    const raw = fs.readFileSync(path.join(r.knowledgeDir, `${first.id}.md`), 'utf-8');
    expect(raw).toContain('## 影响范围');
  });

  it('id 不存在返回 null', () => {
    expect(overwriteActiveBody(repo(), 'nope', '内容')).toBeNull();
  });
});

describe('hasContentAnywhere（重复候选去重）', () => {
  it('active 已存在同内容 → true', () => {
    const root = tmpHome();
    const r = repo(root);
    declareExplicit(root, {
      type: 'workflow',
      content: 'commit 用 conventional',
      scope: 'project',
    });
    expect(hasContentAnywhere(r, 'commit 用 conventional')).toBe(true);
  });

  it('pending 草稿已存在同内容 → true（正文匹配）', () => {
    const root = tmpHome();
    const r = repo(root);
    r.createDraft({ type: 'workflow', content: 'commit 用 conventional', source: 'git-history' });
    expect(hasContentAnywhere(r, 'commit 用 conventional')).toBe(true);
  });

  it('内容不同 → false', () => {
    const root = tmpHome();
    const r = repo(root);
    r.createDraft({ type: 'workflow', content: 'commit 用 conventional', source: 'git-history' });
    expect(hasContentAnywhere(r, '用 pnpm 安装依赖')).toBe(false);
  });

  it('空内容保守去重 → true', () => {
    expect(hasContentAnywhere(repo(), '')).toBe(true);
  });
});
