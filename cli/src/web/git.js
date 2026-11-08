// 知识根 git 只读封装（web 专用）：仅 spawnSync 读取 log，绝不写库
// 降级纪律：git 缺失 / 非 git 仓库 / 任何子进程异常 → { available:false, commits:[] }，不抛错

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** 目录是否具备 git 仓库形态（存在 .git 即视为可用） */
export function hasGitRepo(dir) {
  return existsSync(join(dir, '.git'));
}

/**
 * 执行只读 git log：%H/%ad/%s 用 \x1f 分隔（避免提交主题里出现 | 被截断）。
 * @param {string} dir 仓库目录（知识根）
 * @param {string[]} extraArgs 追加参数（如 ['--follow','--','x.md']）
 */
function gitLog(dir, extraArgs) {
  if (!hasGitRepo(dir)) return { available: false, commits: [] };
  const r = spawnSync('git', ['-C', dir, 'log', '--date=iso', '--format=%H%x1f%ad%x1f%s', ...extraArgs], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.error || r.status !== 0 || typeof r.stdout !== 'string') {
    return { available: false, commits: [] };
  }
  const commits = r.stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const i1 = line.indexOf('\x1f');
      const i2 = line.indexOf('\x1f', i1 + 1);
      return { hash: line.slice(0, i1), date: line.slice(i1 + 1, i2), subject: line.slice(i2 + 1) };
    });
  return { available: true, commits };
}

/** 知识根全部提交（时间线面板） */
export function logAll(dir) {
  return gitLog(dir, []);
}

/** 单卡历史（--follow 跨改名追踪）；relFile 为相对知识根的路径（'/' 分隔） */
export function logFollow(dir, relFile) {
  if (!relFile) return { available: hasGitRepo(dir), commits: [] };
  return gitLog(dir, ['--follow', '--', relFile]);
}
