/**
 * migrate.ts 测试 — 旧数据迁移命令
 *
 * 仅测试导出的纯函数（detectLegacyData、parseAndConvertRules、executeMigration），
 * 不测试 CLI 交互部分（@clack/prompts 依赖）。
 */

import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  detectLegacyData,
  parseAndConvertRules,
  executeMigration,
} from '../../src/commands/migrate.js';
import type { MigratedRule, MigrationDetection } from '../../src/core/types.js';
import {
  getKnowledgeDir,
  getKnowledgeIndexPath,
  getArchiveV0Dir,
  readKnowledgeIndex,
  listKnowledgeEntries,
} from '../../src/core/knowledge.js';
import type { KnowledgeEntry } from '../../src/core/types.js';

// ─── 测试辅助 ───────────────────────────────────────────────

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evokit-migrate-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** 创建一个合法的 MigratedRule */
function makeMigratedRule(overrides: Partial<KnowledgeEntry> = {}): MigratedRule {
  return {
    originalDescription: '使用 uv 代替 pip',
    entry: {
      id: 'convention-use-uv',
      scope: 'personal',
      type: 'convention',
      source: 'explicit',
      confidence: 0.9,
      created: '2026-07-30',
      ...overrides,
    },
    deprecated: false,
  };
}

/** 在 memoryDir 下创建旧数据文件 */
function createLegacyFiles(memoryDir: string, files: string[] = []): void {
  const allFiles =
    files.length > 0
      ? files
      : [
          'learned-rules.md',
          'corrections.jsonl',
          'observations.jsonl',
          'evolution-log.md',
          'violations.jsonl',
        ];
  for (const file of allFiles) {
    const fp = path.join(memoryDir, file);
    if (!fs.existsSync(path.dirname(fp))) {
      fs.mkdirSync(path.dirname(fp), { recursive: true });
    }
    if (file === 'learned-rules.md') {
      fs.writeFileSync(fp, '# 已学习规则\n\n- **Use uv**\n\n', 'utf-8');
    } else if (file.endsWith('.jsonl')) {
      fs.writeFileSync(fp, '{"test":true}\n', 'utf-8');
    } else {
      fs.writeFileSync(fp, '# Log\n', 'utf-8');
    }
  }
}

// ─── detectLegacyData ───────────────────────────────────────

describe('detectLegacyData', () => {
  it('检测到所有旧数据文件', () => {
    const dir = tmpDir();
    createLegacyFiles(dir);
    const detection = detectLegacyData(dir);
    expect(detection.learnedRules).toBe(true);
    expect(detection.corrections).toBe(true);
    expect(detection.observations).toBe(true);
    expect(detection.evolutionLog).toBe(true);
    expect(detection.violations).toBe(true);
    expect(Object.keys(detection.paths)).toHaveLength(5);
  });

  it('仅检测存在的文件', () => {
    const dir = tmpDir();
    createLegacyFiles(dir, ['learned-rules.md', 'corrections.jsonl']);
    const detection = detectLegacyData(dir);
    expect(detection.learnedRules).toBe(true);
    expect(detection.corrections).toBe(true);
    expect(detection.observations).toBe(false);
    expect(detection.evolutionLog).toBe(false);
    expect(detection.violations).toBe(false);
    expect(Object.keys(detection.paths)).toHaveLength(2);
  });

  it('无旧数据文件时全部为 false', () => {
    const dir = tmpDir();
    const detection = detectLegacyData(dir);
    expect(detection.learnedRules).toBe(false);
    expect(detection.corrections).toBe(false);
    expect(detection.observations).toBe(false);
    expect(detection.evolutionLog).toBe(false);
    expect(detection.violations).toBe(false);
    expect(Object.keys(detection.paths)).toHaveLength(0);
  });

  it('paths 包含完整文件路径', () => {
    const dir = tmpDir();
    createLegacyFiles(dir, ['learned-rules.md']);
    const detection = detectLegacyData(dir);
    expect(detection.paths['learned-rules.md']).toBe(path.join(dir, 'learned-rules.md'));
  });
});

// ─── parseAndConvertRules ───────────────────────────────────

describe('parseAndConvertRules', () => {
  it('解析 learned-rules.md 并转换为 MigratedRule 列表', () => {
    const dir = tmpDir();
    const knowledgeDir = getKnowledgeDir(dir);
    const rulesPath = path.join(dir, 'learned-rules.md');
    fs.writeFileSync(
      rulesPath,
      [
        '# 已学习规则',
        '',
        '- **Use uv instead of pip** — Python 包管理偏好',
        '  <!-- promoted: 2026-06-01 -->',
        '',
        '- **No console.log in production**',
        '',
      ].join('\n'),
      'utf-8',
    );
    const result = parseAndConvertRules(rulesPath, 'personal', knowledgeDir);
    expect(result.rules).toHaveLength(2);
    expect(result.warnings).toHaveLength(0);
    expect(result.rules[0].entry.type).toBe('convention');
    expect(result.rules[0].entry.source).toBe('explicit');
    expect(result.rules[0].entry.scope).toBe('personal');
    expect(result.rules[0].entry.created).toBe('2026-06-01');
    expect(result.rules[1].originalDescription).toBe('No console.log in production');
  });

  it('过滤 deprecated 规则并生成警告', () => {
    const dir = tmpDir();
    const knowledgeDir = getKnowledgeDir(dir);
    const rulesPath = path.join(dir, 'learned-rules.md');
    fs.writeFileSync(
      rulesPath,
      ['# 已学习规则', '', '- **Active rule**', '', '- **Old rule** (deprecated)', ''].join('\n'),
      'utf-8',
    );
    const result = parseAndConvertRules(rulesPath, 'personal', knowledgeDir);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].originalDescription).toBe('Active rule');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('已废弃');
  });

  it('空 learned-rules.md 返回空列表', () => {
    const dir = tmpDir();
    const knowledgeDir = getKnowledgeDir(dir);
    const rulesPath = path.join(dir, 'learned-rules.md');
    fs.writeFileSync(rulesPath, 'No rules have been promoted yet', 'utf-8');
    const result = parseAndConvertRules(rulesPath, 'personal', knowledgeDir);
    expect(result.rules).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('使用指定的 scope', () => {
    const dir = tmpDir();
    const knowledgeDir = getKnowledgeDir(dir);
    const rulesPath = path.join(dir, 'learned-rules.md');
    fs.writeFileSync(rulesPath, '- **Project rule**\n', 'utf-8');
    const result = parseAndConvertRules(rulesPath, 'project', knowledgeDir);
    expect(result.rules[0].entry.scope).toBe('project');
  });
});

// ─── executeMigration ───────────────────────────────────────

describe('executeMigration', () => {
  it('写入知识条目并归档旧文件', () => {
    const dir = tmpDir();
    // 创建旧文件
    createLegacyFiles(dir, ['learned-rules.md', 'corrections.jsonl']);

    const detection: MigrationDetection = {
      learnedRules: true,
      corrections: true,
      observations: false,
      evolutionLog: false,
      violations: false,
      paths: {
        'learned-rules.md': path.join(dir, 'learned-rules.md'),
        'corrections.jsonl': path.join(dir, 'corrections.jsonl'),
      },
    };

    const rules = [makeMigratedRule()];
    const result = executeMigration(rules, detection, dir, false);

    // 验证知识条目已写入
    expect(result.entriesWritten).toBe(1);
    const knowledgeDir = getKnowledgeDir(dir);
    const entries = listKnowledgeEntries(knowledgeDir);
    expect(entries).toContain('convention-use-uv');

    // 验证索引已更新
    const indexPath = getKnowledgeIndexPath(dir);
    const index = readKnowledgeIndex(indexPath);
    expect(index.evokit).toHaveLength(1);

    // 验证旧文件已归档
    expect(result.filesArchived).toBe(2);
    expect(fs.existsSync(path.join(dir, 'learned-rules.md'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'corrections.jsonl'))).toBe(false);
    const archiveDir = getArchiveV0Dir(dir);
    expect(fs.existsSync(path.join(archiveDir, 'learned-rules.md'))).toBe(true);
    expect(fs.existsSync(path.join(archiveDir, 'corrections.jsonl'))).toBe(true);
  });

  it('dry-run 模式不修改任何文件', () => {
    const dir = tmpDir();
    createLegacyFiles(dir, ['learned-rules.md']);

    const detection: MigrationDetection = {
      learnedRules: true,
      corrections: false,
      observations: false,
      evolutionLog: false,
      violations: false,
      paths: {
        'learned-rules.md': path.join(dir, 'learned-rules.md'),
      },
    };

    const rules = [makeMigratedRule()];
    const result = executeMigration(rules, detection, dir, true);

    // dry-run 仍计数
    expect(result.entriesWritten).toBe(1);
    expect(result.filesArchived).toBe(1);

    // 但文件未被修改
    expect(fs.existsSync(path.join(dir, 'learned-rules.md'))).toBe(true);
    const knowledgeDir = getKnowledgeDir(dir);
    expect(listKnowledgeEntries(knowledgeDir)).toHaveLength(0);
  });

  it('无旧文件时仅写入知识条目', () => {
    const dir = tmpDir();
    const detection: MigrationDetection = {
      learnedRules: false,
      corrections: false,
      observations: false,
      evolutionLog: false,
      violations: false,
      paths: {},
    };

    const rules = [makeMigratedRule()];
    const result = executeMigration(rules, detection, dir, false);

    expect(result.entriesWritten).toBe(1);
    expect(result.filesArchived).toBe(0);
  });

  it('多条规则全部写入', () => {
    const dir = tmpDir();
    const detection: MigrationDetection = {
      learnedRules: false,
      corrections: false,
      observations: false,
      evolutionLog: false,
      violations: false,
      paths: {},
    };

    const rules = [
      makeMigratedRule({ id: 'convention-rule-a' }),
      makeMigratedRule({ id: 'convention-rule-b' }),
      makeMigratedRule({ id: 'preference-rule-c', type: 'preference' }),
    ];
    const result = executeMigration(rules, detection, dir, false);

    expect(result.entriesWritten).toBe(3);
    const knowledgeDir = getKnowledgeDir(dir);
    const entries = listKnowledgeEntries(knowledgeDir);
    expect(entries).toHaveLength(3);
  });

  it('知识条目文件包含正文', () => {
    const dir = tmpDir();
    const detection: MigrationDetection = {
      learnedRules: false,
      corrections: false,
      observations: false,
      evolutionLog: false,
      violations: false,
      paths: {},
    };

    const rules = [makeMigratedRule()];
    executeMigration(rules, detection, dir, false);

    const knowledgeDir = getKnowledgeDir(dir);
    const fp = path.join(knowledgeDir, 'convention-use-uv.md');
    const content = fs.readFileSync(fp, 'utf-8');
    expect(content).toContain('## 内容');
    expect(content).toContain('使用 uv 代替 pip');
  });
});
