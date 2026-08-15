/**
 * git-history.ts 测试 — Git 历史提取候选（ADR 0004）
 *
 * 只测纯函数（classifyGitSubjects / isExcludedSubject），不测 git 子进程调用。
 */

import { describe, it, expect } from 'vitest';
import {
  classifyGitSubjects,
  isExcludedSubject,
  MIN_SAMPLE_COUNT,
  MATCH_RATE_THRESHOLD,
} from '../../src/core/git-history.js';

/** 构造样本：前 matchedCount 条为 type 前缀 subject，其余为无前缀描述。 */
function buildSubjects(
  total: number,
  matchedCount: number,
  types: string[] = ['feat', 'fix', 'refactor'],
): string[] {
  const out: string[] = [];
  for (let i = 0; i < matchedCount; i++) {
    out.push(`${types[i % types.length]}: 主题 ${i + 1}`);
  }
  for (let i = matchedCount; i < total; i++) {
    out.push(`更新第 ${i + 1} 项配置`);
  }
  return out;
}

describe('isExcludedSubject（research §3.3 排除清单）', () => {
  it('排除 merge / revert / release / 版本号 bump（含中英发版）', () => {
    expect(isExcludedSubject('Merge branch main')).toBe(true);
    expect(isExcludedSubject('Merge pull request #12 from dev')).toBe(true);
    expect(isExcludedSubject('Revert "feat: add x"')).toBe(true);
    expect(isExcludedSubject('release: 1.0.0')).toBe(true);
    expect(isExcludedSubject('publish v2.0.0')).toBe(true);
    expect(isExcludedSubject('Bump version to 1.2.3')).toBe(true);
    expect(isExcludedSubject('v1.2.3')).toBe(true);
    expect(isExcludedSubject('chore: 发布 v0.6.6')).toBe(true);
    expect(isExcludedSubject('chore(release): 0.7.0')).toBe(true);
  });

  it('排除含敏感信息的 subject（安全红线）', () => {
    expect(isExcludedSubject('feat: add AKIA1234567890ABCDEF')).toBe(true);
    expect(isExcludedSubject('fix: secret key sk-abc123def456ghi789')).toBe(true);
    expect(isExcludedSubject('chore: 清理 /home/user 下的临时文件')).toBe(true);
  });

  it('常规约定 subject 不排除', () => {
    expect(isExcludedSubject('feat: 新增导出命令')).toBe(false);
    expect(isExcludedSubject('fix: 修复路径替换遗漏')).toBe(false);
    expect(isExcludedSubject('docs: 更新架构文档')).toBe(false);
  });
});

describe('classifyGitSubjects（结构匹配率门控）', () => {
  it('样本 ≥20 且匹配率 ≥0.7 时产出 workflow 候选', () => {
    const candidates = classifyGitSubjects(buildSubjects(20, 20));
    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c.type).toBe('workflow');
    expect(c.sampleCount).toBe(20);
    expect(c.matchRate).toBe(1);
    // type 词包聚合：feat/fix/refactor 各出现 ≥2 次
    expect(c.pattern).toContain('feat');
    expect(c.pattern).toContain('fix');
    expect(c.pattern).toContain('refactor');
    // 支撑样本最多 5 条
    expect(c.samples).toHaveLength(5);
  });

  it('匹配率恰好 0.7 时仍提取', () => {
    const candidates = classifyGitSubjects(buildSubjects(20, 14));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].matchRate).toBe(14 / 20);
  });

  it('匹配率 <0.7 时不提取（混沌历史，漏提优于误提）', () => {
    expect(classifyGitSubjects(buildSubjects(20, 13))).toEqual([]);
  });

  it('样本 <20 时任何比率都不提取', () => {
    expect(classifyGitSubjects(buildSubjects(19, 19))).toEqual([]);
  });

  it('排除项不计入样本（merge/revert/release 剔除后再判定）', () => {
    // 23 条原始：20 条类型前缀 + 3 条排除项 → 过滤后样本 20，全命中
    const subjects = [
      ...buildSubjects(20, 20),
      'Merge branch main',
      'Revert "feat: y"',
      'chore: 发布 v1.2.3',
    ];
    const candidates = classifyGitSubjects(subjects);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].sampleCount).toBe(20); // 排除项未计入
  });

  it('type 前缀带 scope 也计入结构匹配', () => {
    const subjects = Array.from({ length: MIN_SAMPLE_COUNT }, (_, i) =>
      i % 2 === 0 ? `feat(Homebrew): 更新 ${i}` : `chore: 更新 ${i}`,
    );
    const candidates = classifyGitSubjects(subjects);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].matchRate).toBe(1);
    expect(candidates[0].pattern).toContain('chore');
    expect(candidates[0].pattern).toContain('feat');
  });

  it('空数组 / 全部无前缀 → 不提取', () => {
    expect(classifyGitSubjects([])).toEqual([]);
    expect(classifyGitSubjects(['第一次提交', '做点事情', '再改一点'])).toEqual([]);
  });

  it('阈值常量合理（0.7 / 20）', () => {
    expect(MATCH_RATE_THRESHOLD).toBe(0.7);
    expect(MIN_SAMPLE_COUNT).toBe(20);
  });
});
