/**
 * knowledge.ts 测试 — v1.0 知识条目 CRUD 操作
 */

import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  parseKnowledgeFrontmatter,
  readKnowledgeEntry,
  writeKnowledgeEntry,
  listKnowledgeEntries,
  readKnowledgeIndex,
  writeKnowledgeIndex,
  appendToKnowledgeIndex,
  generateSlug,
  generateUniqueKnowledgeId,
  archiveFileToV0,
  getEvokitDir,
  getKnowledgeDir,
  getKnowledgeIndexPath,
  getArchiveV0Dir,
  isEmptyLearnedRules,
  parseLearnedRulesForMigration,
  convertRuleToMigrated,
  KnowledgeConfidence,
  transitionConfidence,
  needsReview,
  isKnownConfidence,
} from '../../src/core/knowledge.js';
import type { KnowledgeEntry } from '../../src/core/types.js';

// ─── 测试辅助 ───────────────────────────────────────────────

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-knowledge-test-'));
  tmpDirs.push(dir);
  return dir;
}

// 每个测试后清理临时目录
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** 创建一个合法的 KnowledgeEntry */
function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'convention-test-rule',
    scope: 'personal',
    type: 'convention',
    source: 'explicit',
    confidence: 0.9,
    created: '2026-07-30',
    ...overrides,
  };
}

// ─── parseKnowledgeFrontmatter ──────────────────────────────

describe('parseKnowledgeFrontmatter', () => {
  it('解析完整的 frontmatter', () => {
    const content = `---
id: convention-uv-pip
scope: personal
type: convention
source: explicit
confidence: 0.9
created: "2026-07-15"
tags: [python, uv]
---

## 内容

使用 uv 代替 pip`;
    const entry = parseKnowledgeFrontmatter(content);
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe('convention-uv-pip');
    expect(entry!.scope).toBe('personal');
    expect(entry!.type).toBe('convention');
    expect(entry!.source).toBe('explicit');
    expect(entry!.confidence).toBe(0.9);
    expect(entry!.created).toBe('2026-07-15');
    expect(entry!.tags).toEqual(['python', 'uv']);
  });

  it('解析无引号日期的 frontmatter', () => {
    const content = `---
id: convention-test
scope: project
type: architecture
source: conversation
confidence: 0.8
created: 2026-07-30
---`;
    const entry = parseKnowledgeFrontmatter(content);
    expect(entry).not.toBeNull();
    expect(entry!.created).toBe('2026-07-30');
  });

  it('解析含可选字段的 frontmatter', () => {
    const content = `---
id: preference-dark-mode
scope: personal
type: preference
source: explicit
confidence: 1.0
created: "2026-01-01"
updated: "2026-07-30"
context: 适用于所有项目
---`;
    const entry = parseKnowledgeFrontmatter(content);
    expect(entry).not.toBeNull();
    expect(entry!.updated).toBe('2026-07-30');
    expect(entry!.context).toBe('适用于所有项目');
  });

  it('缺少必填字段时返回 null', () => {
    const content = `---
id: test
scope: personal
---`;
    expect(parseKnowledgeFrontmatter(content)).toBeNull();
  });

  it('无 frontmatter 分隔符时返回 null', () => {
    expect(parseKnowledgeFrontmatter('just plain text')).toBeNull();
  });

  it('只有开头分隔符时返回 null', () => {
    expect(parseKnowledgeFrontmatter('---\nid: test')).toBeNull();
  });

  it('空字符串返回 null', () => {
    expect(parseKnowledgeFrontmatter('')).toBeNull();
  });

  it('解析布尔值', () => {
    const content = `---
id: test-bool
scope: personal
type: convention
source: explicit
confidence: 0.5
created: "2026-01-01"
---`;
    // confidence 是数字，不是布尔，但 parseYamlValue 也处理布尔
    const entry = parseKnowledgeFrontmatter(content);
    expect(entry).not.toBeNull();
    expect(entry!.confidence).toBe(0.5);
  });

  it('解析空数组', () => {
    const content = `---
id: test-empty-array
scope: personal
type: convention
source: explicit
confidence: 0.5
created: "2026-01-01"
tags: []
---`;
    const entry = parseKnowledgeFrontmatter(content);
    expect(entry).not.toBeNull();
    expect(entry!.tags).toEqual([]);
  });
});

// ─── readKnowledgeEntry ─────────────────────────────────────

describe('readKnowledgeEntry', () => {
  it('读取存在的知识条目文件', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'convention-test.md');
    const entry = makeEntry();
    writeKnowledgeEntry(fp, entry);
    const result = readKnowledgeEntry(fp);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('convention-test-rule');
  });

  it('文件不存在时返回 null', () => {
    const result = readKnowledgeEntry('/nonexistent/file.md');
    expect(result).toBeNull();
  });
});

// ─── writeKnowledgeEntry ────────────────────────────────────

describe('writeKnowledgeEntry', () => {
  it('写入含正文的知识条目', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'convention-test.md');
    const entry = makeEntry();
    writeKnowledgeEntry(fp, entry, '## 内容\n\n使用 uv 代替 pip');
    const content = fs.readFileSync(fp, 'utf-8');
    expect(content).toContain('---');
    expect(content).toContain('id: convention-test-rule');
    expect(content).toContain('使用 uv 代替 pip');
  });

  it('写入无正文的知识条目', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'convention-test.md');
    const entry = makeEntry();
    writeKnowledgeEntry(fp, entry);
    const content = fs.readFileSync(fp, 'utf-8');
    expect(content).toContain('id: convention-test-rule');
    // 无正文时不应有多余空行
    expect(content.trim().endsWith('---')).toBe(true);
  });

  it('自动创建目录', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'sub', 'dir', 'entry.md');
    const entry = makeEntry();
    writeKnowledgeEntry(fp, entry);
    expect(fs.existsSync(fp)).toBe(true);
  });

  it('写入含 tags 的条目', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'tagged.md');
    const entry = makeEntry({ tags: ['python', 'uv'] });
    writeKnowledgeEntry(fp, entry);
    const content = fs.readFileSync(fp, 'utf-8');
    expect(content).toContain('tags: [python, uv]');
  });

  it('round-trip：写入后读取一致', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'roundtrip.md');
    const entry = makeEntry({
      tags: ['test'],
      context: '测试上下文',
      updated: '2026-07-30',
    });
    writeKnowledgeEntry(fp, entry, '正文内容');
    const result = readKnowledgeEntry(fp);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(entry.id);
    expect(result!.scope).toBe(entry.scope);
    expect(result!.type).toBe(entry.type);
    expect(result!.source).toBe(entry.source);
    expect(result!.confidence).toBe(entry.confidence);
    expect(result!.tags).toEqual(entry.tags);
    expect(result!.context).toBe(entry.context);
  });
});

// ─── listKnowledgeEntries ───────────────────────────────────

describe('listKnowledgeEntries', () => {
  it('列出目录中的知识条目', () => {
    const dir = tmpDir();
    writeKnowledgeEntry(path.join(dir, 'convention-a.md'), makeEntry({ id: 'convention-a' }));
    writeKnowledgeEntry(
      path.join(dir, 'preference-b.md'),
      makeEntry({ id: 'preference-b', type: 'preference' }),
    );
    const entries = listKnowledgeEntries(dir);
    expect(entries).toHaveLength(2);
    expect(entries).toContain('convention-a');
    expect(entries).toContain('preference-b');
  });

  it('目录不存在时返回空数组', () => {
    expect(listKnowledgeEntries('/nonexistent/dir')).toEqual([]);
  });

  it('忽略非 .md 文件', () => {
    const dir = tmpDir();
    writeKnowledgeEntry(path.join(dir, 'convention-a.md'), makeEntry({ id: 'convention-a' }));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a knowledge entry', 'utf-8');
    const entries = listKnowledgeEntries(dir);
    expect(entries).toHaveLength(1);
  });
});

// ─── readKnowledgeIndex ─────────────────────────────────────

describe('readKnowledgeIndex', () => {
  it('读取包含两个 section 的索引', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'knowledge-index.md');
    fs.writeFileSync(
      fp,
      [
        '## 个人知识',
        '',
        '- [convention-uv] 使用 uv 代替 pip',
        '- [preference-dark] 偏好暗色主题',
        '',
        '## 项目知识',
        '',
        '- [sync-readme] README 同步规则',
        '',
      ].join('\n'),
      'utf-8',
    );
    const result = readKnowledgeIndex(fp);
    expect(result.evokit).toHaveLength(2);
    expect(result.claude).toHaveLength(1);
    expect(result.evokit[0]).toContain('convention-uv');
    expect(result.claude[0]).toContain('sync-readme');
  });

  it('文件不存在时返回空结构', () => {
    const result = readKnowledgeIndex('/nonexistent/index.md');
    expect(result.evokit).toEqual([]);
    expect(result.claude).toEqual([]);
  });

  it('忽略非列表行', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'knowledge-index.md');
    fs.writeFileSync(
      fp,
      [
        '## 个人知识',
        '',
        '这是一段说明文字',
        '- [convention-uv] 使用 uv 代替 pip',
        '',
        '## 项目知识',
        '',
      ].join('\n'),
      'utf-8',
    );
    const result = readKnowledgeIndex(fp);
    expect(result.evokit).toHaveLength(1);
  });

  it('遇到其他 ## 标题时停止当前 section', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'knowledge-index.md');
    fs.writeFileSync(
      fp,
      [
        '## 个人知识',
        '',
        '- [convention-uv] 使用 uv 代替 pip',
        '',
        '## 其他标题',
        '',
        '- [should-not-appear] 不属于任何 section',
        '',
        '## 项目知识',
        '',
        '- [claude-rule] Claude 规则',
        '',
      ].join('\n'),
      'utf-8',
    );
    const result = readKnowledgeIndex(fp);
    expect(result.evokit).toHaveLength(1);
    expect(result.claude).toHaveLength(1);
  });
});

// ─── writeKnowledgeIndex ────────────────────────────────────

describe('writeKnowledgeIndex', () => {
  it('写入索引文件', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'knowledge-index.md');
    writeKnowledgeIndex(fp, ['- [convention-uv] 使用 uv'], ['- [claude-rule] Claude 规则']);
    const content = fs.readFileSync(fp, 'utf-8');
    expect(content).toContain('## 个人知识');
    expect(content).toContain('## 项目知识');
    expect(content).toContain('convention-uv');
    expect(content).toContain('claude-rule');
  });

  it('自动创建目录', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'sub', 'knowledge-index.md');
    writeKnowledgeIndex(fp, [], []);
    expect(fs.existsSync(fp)).toBe(true);
  });

  it('round-trip：写入后读取一致', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'knowledge-index.md');
    const evokit = ['- [convention-uv] 使用 uv', '- [preference-dark] 暗色主题'];
    const claude = ['- [sync-readme] README 同步'];
    writeKnowledgeIndex(fp, evokit, claude);
    const result = readKnowledgeIndex(fp);
    expect(result.evokit).toEqual(evokit);
    expect(result.claude).toEqual(claude);
  });
});

// ─── appendToKnowledgeIndex ─────────────────────────────────

describe('appendToKnowledgeIndex', () => {
  it('向空索引追加条目', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'knowledge-index.md');
    appendToKnowledgeIndex(fp, 'convention-uv', '使用 uv 代替 pip');
    const result = readKnowledgeIndex(fp);
    expect(result.evokit).toHaveLength(1);
    expect(result.evokit[0]).toContain('convention-uv');
  });

  it('向已有索引追加条目', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'knowledge-index.md');
    writeKnowledgeIndex(fp, ['- [convention-uv] 使用 uv'], []);
    appendToKnowledgeIndex(fp, 'preference-dark', '暗色主题');
    const result = readKnowledgeIndex(fp);
    expect(result.evokit).toHaveLength(2);
  });

  it('重复追加同一条目时跳过', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'knowledge-index.md');
    appendToKnowledgeIndex(fp, 'convention-uv', '使用 uv');
    appendToKnowledgeIndex(fp, 'convention-uv', '使用 uv');
    const result = readKnowledgeIndex(fp);
    expect(result.evokit).toHaveLength(1);
  });

  it('保留项目知识 section', () => {
    const dir = tmpDir();
    const fp = path.join(dir, 'knowledge-index.md');
    writeKnowledgeIndex(fp, [], ['- [claude-rule] Claude 规则']);
    appendToKnowledgeIndex(fp, 'convention-uv', '使用 uv');
    const result = readKnowledgeIndex(fp);
    expect(result.evokit).toHaveLength(1);
    expect(result.claude).toHaveLength(1);
  });
});

// ─── generateSlug ───────────────────────────────────────────

describe('generateSlug', () => {
  it('英文描述生成 kebab-case slug', () => {
    expect(generateSlug('Use uv instead of pip')).toBe('use-uv-instead-of');
  });

  it('英文不足 2 词时返回单词', () => {
    expect(generateSlug('Python')).toBe('python');
  });

  it('中文描述生成含 zh 前缀的 slug', () => {
    const slug = generateSlug('使用中文命名');
    expect(slug).toContain('zh');
  });

  it('中英混合描述优先使用英文部分', () => {
    const slug = generateSlug('使用 uv 代替 pip');
    // 中文被过滤，英文部分 >= 2 词，使用英文 slug
    expect(slug).toBe('uv-pip');
  });

  it('纯数字描述', () => {
    expect(generateSlug('42')).toBe('42');
  });

  it('空描述使用 hash 兜底（可能为空 hex）', () => {
    const slug = generateSlug('');
    expect(slug).toMatch(/^rule-/);
  });
});

// ─── generateUniqueKnowledgeId ──────────────────────────────

describe('generateUniqueKnowledgeId', () => {
  it('生成 type-slug 格式的 ID', () => {
    const dir = tmpDir();
    const id = generateUniqueKnowledgeId(dir, 'convention', 'uv-pip');
    expect(id).toBe('convention-uv-pip');
  });

  it('ID 冲突时追加数字后缀', () => {
    const dir = tmpDir();
    // 先创建一个同名文件
    writeKnowledgeEntry(
      path.join(dir, 'convention-uv-pip.md'),
      makeEntry({ id: 'convention-uv-pip' }),
    );
    const id = generateUniqueKnowledgeId(dir, 'convention', 'uv-pip');
    expect(id).toBe('convention-uv-pip-2');
  });

  it('多个冲突时递增后缀', () => {
    const dir = tmpDir();
    writeKnowledgeEntry(
      path.join(dir, 'convention-uv-pip.md'),
      makeEntry({ id: 'convention-uv-pip' }),
    );
    writeKnowledgeEntry(
      path.join(dir, 'convention-uv-pip-2.md'),
      makeEntry({ id: 'convention-uv-pip-2' }),
    );
    const id = generateUniqueKnowledgeId(dir, 'convention', 'uv-pip');
    expect(id).toBe('convention-uv-pip-3');
  });
});

// ─── archiveFileToV0 ────────────────────────────────────────

describe('archiveFileToV0', () => {
  it('将文件移动到归档目录', () => {
    const dir = tmpDir();
    const srcFile = path.join(dir, 'learned-rules.md');
    const archiveDir = path.join(dir, 'archive', 'v0');
    fs.writeFileSync(srcFile, '# Rules', 'utf-8');
    const result = archiveFileToV0(srcFile, archiveDir);
    expect(result).toBe(true);
    expect(fs.existsSync(srcFile)).toBe(false);
    expect(fs.existsSync(path.join(archiveDir, 'learned-rules.md'))).toBe(true);
  });

  it('源文件不存在时返回 false', () => {
    const result = archiveFileToV0('/nonexistent/file.md', '/tmp/archive');
    expect(result).toBe(false);
  });

  it('目标已存在时跳过并返回 false', () => {
    const dir = tmpDir();
    const srcFile = path.join(dir, 'rules.md');
    const archiveDir = path.join(dir, 'archive');
    fs.writeFileSync(srcFile, '# Rules', 'utf-8');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'rules.md'), '# Old Rules', 'utf-8');
    const result = archiveFileToV0(srcFile, archiveDir);
    expect(result).toBe(false);
    // 源文件仍在
    expect(fs.existsSync(srcFile)).toBe(true);
  });

  it('自动创建归档目录', () => {
    const dir = tmpDir();
    const srcFile = path.join(dir, 'test.md');
    const archiveDir = path.join(dir, 'deep', 'archive');
    fs.writeFileSync(srcFile, 'test', 'utf-8');
    const result = archiveFileToV0(srcFile, archiveDir);
    expect(result).toBe(true);
    expect(fs.existsSync(path.join(archiveDir, 'test.md'))).toBe(true);
  });
});

// ─── 路径辅助函数 ───────────────────────────────────────────

describe('路径辅助函数', () => {
  it('getEvokitDir 返回 evokit/ 子目录', () => {
    expect(getEvokitDir('/home/user/.claude/memory')).toBe('/home/user/.claude/memory/evokit');
  });

  it('getKnowledgeDir 返回 evokit/knowledge/ 子目录', () => {
    expect(getKnowledgeDir('/home/user/.claude/memory')).toBe(
      '/home/user/.claude/memory/evokit/knowledge',
    );
  });

  it('getKnowledgeIndexPath 返回 evokit/knowledge-index.md', () => {
    expect(getKnowledgeIndexPath('/home/user/.claude/memory')).toBe(
      '/home/user/.claude/memory/evokit/knowledge-index.md',
    );
  });

  it('getArchiveV0Dir 返回 evokit/archive/v0/', () => {
    expect(getArchiveV0Dir('/home/user/.claude/memory')).toBe(
      '/home/user/.claude/memory/evokit/archive/v0',
    );
  });
});

// ─── isEmptyLearnedRules ────────────────────────────────────

describe('isEmptyLearnedRules', () => {
  it('模板空文本返回 true', () => {
    expect(isEmptyLearnedRules('No rules have been promoted yet')).toBe(true);
  });

  it('空字符串返回 true', () => {
    expect(isEmptyLearnedRules('')).toBe(true);
    expect(isEmptyLearnedRules('   ')).toBe(true);
  });

  it('有内容的文本返回 false', () => {
    expect(isEmptyLearnedRules('- **Use uv**')).toBe(false);
  });
});

// ─── parseLearnedRulesForMigration ──────────────────────────

describe('parseLearnedRulesForMigration', () => {
  it('解析含补充说明的规则', () => {
    const content = [
      '# 已学习规则',
      '',
      '- **Use uv instead of pip** — Python 包管理偏好',
      '  <!-- verify: grep -r "pip install" ~/ -->',
      '  <!-- promoted: 2026-06-01 -->',
      '',
    ].join('\n');
    const rules = parseLearnedRulesForMigration(content);
    expect(rules).toHaveLength(1);
    expect(rules[0].description).toBe('Use uv instead of pip');
    expect(rules[0].explanation).toBe('Python 包管理偏好');
    expect(rules[0].verify).toBe('grep -r "pip install" ~/');
    expect(rules[0].promoted).toBe('2026-06-01');
    expect(rules[0].deprecated).toBe(false);
  });

  it('解析无补充说明的规则', () => {
    const content = '- **No console.log in production**\n';
    const rules = parseLearnedRulesForMigration(content);
    expect(rules).toHaveLength(1);
    expect(rules[0].description).toBe('No console.log in production');
    expect(rules[0].explanation).toBeUndefined();
  });

  it('解析 deprecated 规则', () => {
    const content = '- **Old rule** (deprecated)\n';
    const rules = parseLearnedRulesForMigration(content);
    expect(rules).toHaveLength(1);
    expect(rules[0].deprecated).toBe(true);
  });

  it('模板空文本返回空数组', () => {
    expect(parseLearnedRulesForMigration('No rules have been promoted yet')).toEqual([]);
  });

  it('空内容返回空数组', () => {
    expect(parseLearnedRulesForMigration('')).toEqual([]);
  });

  it('解析多条规则', () => {
    const content = [
      '- **Rule A** — 说明 A',
      '  <!-- promoted: 2026-01-01 -->',
      '',
      '- **Rule B**',
      '',
      '- **Rule C** (deprecated)',
      '',
    ].join('\n');
    const rules = parseLearnedRulesForMigration(content);
    expect(rules).toHaveLength(3);
    expect(rules[0].description).toBe('Rule A');
    expect(rules[1].description).toBe('Rule B');
    expect(rules[2].deprecated).toBe(true);
  });

  it('promoted 含非日期值时保留原值', () => {
    const content = '- **Test rule**\n  <!-- promoted: manual-entry -->\n';
    const rules = parseLearnedRulesForMigration(content);
    expect(rules[0].promoted).toBe('manual-entry');
  });
});

// ─── convertRuleToMigrated ──────────────────────────────────

describe('convertRuleToMigrated', () => {
  it('转换非 deprecated 规则为 MigratedRule', () => {
    const dir = tmpDir();
    const result = convertRuleToMigrated(
      {
        description: 'Use uv instead of pip',
        explanation: 'Python 包管理偏好',
        promoted: '2026-06-01',
        deprecated: false,
      },
      'personal',
      dir,
    );
    expect(result.originalDescription).toBe('Use uv instead of pip');
    expect(result.entry.type).toBe('convention');
    expect(result.entry.source).toBe('explicit');
    expect(result.entry.confidence).toBe(0.9);
    expect(result.entry.scope).toBe('personal');
    expect(result.entry.created).toBe('2026-06-01');
    expect(result.entry.context).toBe('Python 包管理偏好');
    expect(result.deprecated).toBe(false);
  });

  it('无 promoted 日期时使用当前日期', () => {
    const dir = tmpDir();
    const result = convertRuleToMigrated(
      { description: 'Test rule', deprecated: false },
      'project',
      dir,
    );
    // created 应为 YYYY-MM-DD 格式
    expect(result.entry.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.note).toContain('无 promoted 日期');
  });

  it('有 verify 字段时生成丢弃提示', () => {
    const dir = tmpDir();
    const result = convertRuleToMigrated(
      { description: 'Test rule', verify: 'grep -r test', deprecated: false },
      'personal',
      dir,
    );
    expect(result.note).toContain('verify 字段已丢弃');
  });

  it('deprecated 规则仍可转换（由调用方过滤）', () => {
    const dir = tmpDir();
    const result = convertRuleToMigrated(
      { description: 'Old rule', deprecated: true },
      'personal',
      dir,
    );
    expect(result.deprecated).toBe(true);
  });

  it('生成唯一 ID（避免冲突）', () => {
    const dir = tmpDir();
    // 先创建一个同名文件
    writeKnowledgeEntry(
      path.join(dir, 'convention-use-uv-instead.md'),
      makeEntry({ id: 'convention-use-uv-instead' }),
    );
    const result = convertRuleToMigrated(
      { description: 'Use uv instead of pip', deprecated: false },
      'personal',
      dir,
    );
    // ID 应有后缀避免冲突
    expect(result.entry.id).not.toBe('convention-use-uv-instead');
    expect(result.entry.id).toMatch(/^convention-use-uv-instead/);
  });
});

// ─── confidence 三档状态机 (ADR 0002) ──────────────────────

describe('KnowledgeConfidence 三档常量', () => {
  it('取值严格为 FRESH 0.9 / STALE 0.5 / RETIRED 0.1', () => {
    expect(KnowledgeConfidence.FRESH).toBe(0.9);
    expect(KnowledgeConfidence.STALE).toBe(0.5);
    expect(KnowledgeConfidence.RETIRED).toBe(0.1);
  });
});

describe('transitionConfidence 状态机转移', () => {
  it('FRESH 命中过期检测 → STALE', () => {
    expect(transitionConfidence(KnowledgeConfidence.FRESH, 'expire')).toBe(
      KnowledgeConfidence.STALE,
    );
  });

  it('FRESH 不可直接跃迁 RETIRED', () => {
    expect(transitionConfidence(KnowledgeConfidence.FRESH, 'review-doubtful')).toBe(
      KnowledgeConfidence.FRESH,
    );
  });

  it('STALE 复审后仍存疑 → RETIRED', () => {
    expect(transitionConfidence(KnowledgeConfidence.STALE, 'review-doubtful')).toBe(
      KnowledgeConfidence.RETIRED,
    );
  });

  it('STALE 复审确认仍有效 → FRESH', () => {
    expect(transitionConfidence(KnowledgeConfidence.STALE, 'review-confirm')).toBe(
      KnowledgeConfidence.FRESH,
    );
  });

  it('RETIRED 用户留用（复审确认）→ FRESH', () => {
    expect(transitionConfidence(KnowledgeConfidence.RETIRED, 'review-confirm')).toBe(
      KnowledgeConfidence.FRESH,
    );
  });

  it('RETIRED 不再降档，保持 RETIRED', () => {
    expect(transitionConfidence(KnowledgeConfidence.RETIRED, 'expire')).toBe(
      KnowledgeConfidence.RETIRED,
    );
  });
});

describe('needsReview', () => {
  it('STALE 及以下列入复审名单', () => {
    expect(needsReview(KnowledgeConfidence.STALE)).toBe(true);
    expect(needsReview(KnowledgeConfidence.RETIRED)).toBe(true);
  });

  it('FRESH 不列入复审名单', () => {
    expect(needsReview(KnowledgeConfidence.FRESH)).toBe(false);
  });
});

describe('isKnownConfidence', () => {
  it('识别三档合法取值', () => {
    expect(isKnownConfidence(0.9)).toBe(true);
    expect(isKnownConfidence(0.5)).toBe(true);
    expect(isKnownConfidence(0.1)).toBe(true);
  });

  it('识别非法取值', () => {
    expect(isKnownConfidence(0.7)).toBe(false);
    expect(isKnownConfidence(0)).toBe(false);
    expect(isKnownConfidence(NaN)).toBe(false);
  });
});
