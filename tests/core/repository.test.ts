/**
 * repository.ts 测试 — v1.0 知识条目单一数据访问层
 *
 * 覆盖：草稿静默写入/确认/拒绝（#31）、跨区去重、过期检测转移与名单（#26/#34）。
 */

import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  KnowledgeRepository,
  getPendingDir,
  validateArchitectureAnnotation,
  ensureArchitectureAnnotation,
} from '../../src/core/repository.js';
import {
  readKnowledgeEntry,
  listKnowledgeEntries,
  readKnowledgeIndex,
  KnowledgeConfidence,
} from '../../src/core/knowledge.js';
import type { KnowledgeEntry } from '../../src/core/types.js';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-repo-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function repo(memoryDir?: string): KnowledgeRepository {
  return new KnowledgeRepository({ knowledgeRoot: memoryDir ?? tmpDir() });
}

/** 直接写一条 active 条目（绕过 repository，模拟已有数据）。 */
function writeActive(
  memoryDir: string,
  overrides: Partial<KnowledgeEntry> = {},
): KnowledgeEntry {
  const entry: KnowledgeEntry = {
    id: 'convention-test',
    scope: 'personal',
    type: 'convention',
    source: 'conversation',
    confidence: KnowledgeConfidence.FRESH,
    created: '2026-07-30',
    context: '使用 uv 代替 pip',
    ...overrides,
  };
  const knowledgeDir = path.join(memoryDir, 'knowledge');
  writeEntryFile(path.join(knowledgeDir, `${entry.id}.md`), entry, `## 内容\n\n${entry.context}`);
  return entry;
}

function writeEntryFile(fp: string, entry: KnowledgeEntry, body: string): void {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const lines = ['---'];
  for (const [k, v] of Object.entries(entry)) {
    if (v === undefined) continue;
    lines.push(`${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`);
  }
  lines.push('---', '', body);
  fs.writeFileSync(fp, lines.join('\n'), 'utf-8');
}

describe('路径定位', () => {
  it('getPendingDir 返回 evokit/.pending/', () => {
    expect(getPendingDir('/home/u/.claude/memory')).toBe(
      '/home/u/.claude/memory/evokit/.pending',
    );
  });
});

describe('createDraft（#31 静默写入引擎）', () => {
  it('写入草稿到 .pending/，frontmatter 带 status=pending 且无 scope/confidence', () => {
    const r = repo();
    const d = r.createDraft({ type: 'convention', content: '使用 Result 而非 throw' });
    expect(d.id).toMatch(/^convention-/);
    expect(d.status).toBeUndefined(); // 草稿非 KnowledgeEntry，无 status 字段
    expect(d.source).toBe('conversation');

    const raw = fs.readFileSync(path.join(r.pendingDir, `${d.id}.md`), 'utf-8');
    expect(raw).toContain('status: pending');
    expect(raw).not.toContain('scope:');
    expect(raw).not.toContain('confidence:');
    expect(raw).toContain('## 内容');
  });

  it('跨 knowledge/ + .pending/ 去重生成唯一 id（#31 D2）', () => {
    const memoryDir = tmpDir();
    // generateSlug('Use uv instead of pip') → 'use-uv-instead-of'
    writeActive(memoryDir, { id: 'convention-use-uv-instead-of' });
    const r = repo(memoryDir);
    const d1 = r.createDraft({ type: 'convention', content: 'Use uv instead of pip' });
    const d2 = r.createDraft({ type: 'convention', content: 'Use uv instead of pip' });
    expect(d1.id).toBe('convention-use-uv-instead-of-2');
    expect(d2.id).toBe('convention-use-uv-instead-of-3');
  });

  it('自动创建目录', () => {
    const r = repo();
    r.createDraft({ type: 'workflow', content: 'commit 用 conventional' });
    expect(fs.existsSync(r.pendingDir)).toBe(true);
    expect(r.listPending()).toHaveLength(1);
  });
});

describe('confirmDraft（确认背书，#25/#31 D5）', () => {
  it('补齐 scope + confidence FRESH + updated，写入 knowledge/，从 .pending/ 移除，更新索引', () => {
    const memoryDir = tmpDir();
    const r = repo(memoryDir);
    const d = r.createDraft({ type: 'preference', content: '使用 uv 而非 pip' });

    const confirmed = r.confirmDraft(d.id, 'project');
    expect(confirmed).not.toBeNull();
    expect(confirmed!.scope).toBe('project');
    expect(confirmed!.confidence).toBe(KnowledgeConfidence.FRESH);
    expect(confirmed!.source).toBe('conversation');
    expect(confirmed!.updated).toBeDefined();

    // 草稿已移除，知识条目已落盘
    expect(r.listPending()).toEqual([]);
    const active = readKnowledgeEntry(path.join(path.join(memoryDir, 'knowledge'), `${d.id}.md`));
    expect(active!.id).toBe(d.id);
    expect(active!.scope).toBe('project');

    // 索引已更新
    const idx = readKnowledgeIndex(path.join(memoryDir, 'knowledge-index.md'));
    expect(idx.evokit.some((l) => l.includes(d.id))).toBe(true);
  });

  it('草稿不存在时返回 null', () => {
    const r = repo();
    expect(r.confirmDraft('nonexistent', 'personal')).toBeNull();
  });
});

describe('rejectDraft（拒绝草稿）', () => {
  it('删除草稿文件', () => {
    const r = repo();
    const d = r.createDraft({ type: 'convention', content: '不需要这条' });
    expect(r.listPending()).toHaveLength(1);
    expect(r.rejectDraft(d.id)).toBe(true);
    expect(r.listPending()).toEqual([]);
    expect(r.rejectDraft(d.id)).toBe(false);
  });
});

describe('collectStale / list（过期名单，#34）', () => {
  it('collectStale 只收 confidence ≤ 0.5（STALE/RETIRED），按置信度升序', () => {
    const memoryDir = tmpDir();
    writeActive(memoryDir, { id: 'fresh', confidence: 0.9 });
    writeActive(memoryDir, { id: 'stale', confidence: 0.5 });
    writeActive(memoryDir, { id: 'retired', confidence: 0.1 });

    const r = repo(memoryDir);
    const stale = r.collectStale();
    expect(stale.map((e) => e.id)).toEqual(['retired', 'stale']);
  });

  it('listActive / getActive 正确镜像 knowledge/', () => {
    const memoryDir = tmpDir();
    writeActive(memoryDir, { id: 'a' });
    writeActive(memoryDir, { id: 'b' });
    const r = repo(memoryDir);
    expect(r.listActive().sort()).toEqual(['a', 'b']);
    expect(r.getActive('a')?.id).toBe('a');
    expect(r.getActive('zz')).toBeNull();
  });

  it('listAll 合并 draft + active', () => {
    const memoryDir = tmpDir();
    writeActive(memoryDir, { id: 'active-one' });
    const r = repo(memoryDir);
    const d = r.createDraft({ type: 'convention', content: '草稿' });
    expect(r.listAll().sort()).toContain('active-one');
    expect(r.listAll()).toContain(d.id);
  });
});

describe('expire（过期检测触发点 1/2，#34）', () => {
  it('FRESH 命中 expire → STALE(0.5) 落盘 + 刷 updated', () => {
    const memoryDir = tmpDir();
    writeActive(memoryDir, { id: 'someting', confidence: 0.9 });
    const r = repo(memoryDir);
    const after = r.expire('someting');
    expect(after).not.toBeNull();
    expect(after!.confidence).toBe(0.5);
    const onDisk = readKnowledgeEntry(path.join(path.join(memoryDir, 'knowledge'), 'someting.md'));
    expect(onDisk!.confidence).toBe(0.5);
    expect(onDisk!.updated).toBeDefined();
  });

  it('重复 expire 幂等：STALE 上再 expire 不重复降档/不改变 updated', () => {
    const memoryDir = tmpDir();
    writeActive(memoryDir, { id: 'already-stale', confidence: 0.5 });
    const r = repo(memoryDir);
    const before = readKnowledgeEntry(
      path.join(path.join(memoryDir, 'knowledge'), 'already-stale.md'),
    );
    const after = r.expire('already-stale');
    expect(after!.confidence).toBe(0.5);
    const onDisk = readKnowledgeEntry(
      path.join(path.join(memoryDir, 'knowledge'), 'already-stale.md'),
    );
    expect(onDisk!.updated).toBe(before!.updated); // 幂等：不刷新 updated
  });

  it('id 不存在时返回 null', () => {
    const r = repo();
    expect(r.expire('nope')).toBeNull();
  });
});

describe('ensureDirs', () => {
  it('创建 evokit/ .pending/ knowledge/ 目录', () => {
    const memoryDir = tmpDir();
    const r = repo(memoryDir);
    r.ensureDirs();
    expect(listKnowledgeEntries(r.pendingDir)).toEqual([]);
    expect(fs.existsSync(r.evokitDir)).toBe(true);
    expect(fs.existsSync(r.pendingDir)).toBe(true);
    expect(fs.existsSync(r.knowledgeDir)).toBe(true);
  });
});

describe('regenerateIndex（索引作为派生物，范畴 B）', () => {
  it('从 knowledge/ 重建 EvoKit 段，保留 claude 段', () => {
    const memoryDir = tmpDir();
    writeActive(memoryDir, { id: 'convention-a', context: '规则A' });
    writeActive(memoryDir, { id: 'preference-b', context: '偏好B', type: 'preference' });
    // 手动写入一个含 claude 段的旧索引
    fs.mkdirSync(path.dirname(path.join(memoryDir, 'knowledge-index.md')), { recursive: true });
    fs.writeFileSync(
      path.join(memoryDir, 'knowledge-index.md'),
      ['## 个人知识', '', '- [convention-a] 过期摘要', '', '## 项目知识', '', '- [claude-native] Claude 原生', ''].join('\n'),
      'utf-8',
    );

    const r = repo(memoryDir);
    const count = r.regenerateIndex();
    expect(count).toBe(2);

    const idx = readKnowledgeIndex(path.join(memoryDir, 'knowledge-index.md'));
    // EvoKit 段已重建（含偏好B，摘要更新为 context）
    expect(idx.evokit.some((l) => l.includes('preference-b'))).toBe(true);
    expect(idx.evokit.some((l) => l.includes('规则A'))).toBe(true);
    // claude 段保留
    expect(idx.claude.some((l) => l.includes('claude-native'))).toBe(true);
  });
});

describe('架构型条目推理标注（#33 写路径强制）', () => {
  it('createDraft 时 architecture 自动补 ## 影响范围 占位', () => {
    const r = repo();
    const d = r.createDraft({ type: 'architecture', content: 'packages/api 是 packages/web 的上游' });
    const raw = fs.readFileSync(path.join(r.pendingDir, `${d.id}.md`), 'utf-8');
    expect(raw).toContain('## 影响范围');
    expect(raw).not.toContain('## 相关决策'); // 相关决策为建议非必填
  });

  it('非 architecture 类型不注入影响范围', () => {
    const r = repo();
    const d = r.createDraft({ type: 'convention', content: '使用 Result' });
    const raw = fs.readFileSync(path.join(r.pendingDir, `${d.id}.md`), 'utf-8');
    expect(raw).not.toContain('## 影响范围');
  });

  it('confirmDraft 确认 architecture 草稿时保留/确保标注', () => {
    const memoryDir = tmpDir();
    const r = repo(memoryDir);
    const d = r.createDraft({ type: 'architecture', content: '网关是核心的上游' });
    const confirmed = r.confirmDraft(d.id, 'project');
    const onDisk = fs.readFileSync(
      path.join(path.join(memoryDir, 'knowledge'), `${confirmed!.id}.md`),
      'utf-8',
    );
    expect(onDisk).toContain('## 影响范围');
  });

  it('regenerateIndex 时 architecture 条目带 🏛 追索标记', () => {
    const memoryDir = tmpDir();
    writeActive(memoryDir, { id: 'architecture-gateway', type: 'architecture', context: '网关上流' });
    writeActive(memoryDir, { id: 'convention-x', context: '普通约定' });
    const r = repo(memoryDir);
    r.regenerateIndex();
    const idx = readKnowledgeIndex(path.join(memoryDir, 'knowledge-index.md'));
    expect(idx.evokit.some((l) => l.includes('🏛') && l.includes('architecture-gateway'))).toBe(true);
    expect(idx.evokit.some((l) => l === '- [convention-x] 普通约定')).toBe(true);
  });
});

describe('validateArchitectureAnnotation', () => {
  it('含影响范围通过；缺则返回缺项', () => {
    expect(validateArchitectureAnnotation('## 内容\n\nx\n\n## 影响范围\n\n影响')).toEqual([]);
    expect(validateArchitectureAnnotation('## 内容\n\nx')).toEqual(['## 影响范围']);
  });
});

describe('ensureArchitectureAnnotation', () => {
  it('architecture 缺标注时补最小占位，非架构原样返回', () => {
    const arch = ensureArchitectureAnnotation('architecture', '## 内容\n\nx');
    expect(arch.annotated).toBe(true);
    expect(arch.body).toContain('## 影响范围');
    const conv = ensureArchitectureAnnotation('convention', '## 内容\n\nx');
    expect(conv.annotated).toBe(false);
    expect(conv.body).toBe('## 内容\n\nx');
  });
});
