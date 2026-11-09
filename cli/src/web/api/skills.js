// web API：技能同步矩阵与批量更新（需求三次变更 FR-15）
// 口径：
//   源库 = ~/.agents/skills（技能唯一事实源）；工具目录 = 各 AI 工具的 skills 目录（存在才纳入）
//   每条目状态：linked=链接且健康 / linked-external=链接指向源库之外 / broken=断链 /
//              current=真实目录副本且与源一致 / updatable=副本落后于源（可更新） /
//              conflict=副本内有比源新的文件（本地改动，更新会覆盖 → 跳过） /
//              extra=工具目录有而源库无 / missing=源库有而该工具目录无
// 更新语义：只对 updatable 的真实目录副本按文件覆盖（源较新的文件才写，绝不删副本里的多余文件，
//           绝不动链接与真实目录之外的东西）；conflict / broken 只报告不自动处理。

import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { AGENTS_SKILLS_DIR, expandPath } from '../../paths.js';
import { httpError } from '../respond.js';

/** 纳入同步矩阵的工具 skills 目录（存在才出现在结果里；label 用于前端展示） */
const TOOL_SKILLS_DIRS = [
  { dir: '~/.claude/skills', label: 'Claude Code' },
  { dir: '~/.codex/skills', label: 'Codex' },
  { dir: '~/.pi/agent/skills', label: 'Pi' },
  { dir: '~/.codeartsdoer/skills', label: 'CodeArts Doer' },
];

/** 递归收集目录下全部相对文件 → Map<relPath, {size, mtimeMs}>；目录不存在返回 null */
function walkFiles(root) {
  if (!existsSync(root)) return null;
  const map = new Map();
  const walk = (abs, rel) => {
    for (const ent of readdirSync(abs, { withFileTypes: true })) {
      const childAbs = join(abs, ent.name);
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(childAbs, childRel);
      else {
        const st = statSync(childAbs);
        map.set(childRel, { size: st.size, mtimeMs: st.mtimeMs });
      }
    }
  };
  walk(root, '');
  return map;
}

/**
 * 判定工具目录里一个条目的形态。
 * @returns {{ kind: 'link', target: string, healthy: boolean, external: boolean } | { kind: 'real' } | null}
 *   link：symlink 或 Windows junction（lstat 报目录但 readlink 成功）；external = 目标不是源库同名技能
 *   real：真实目录（非链接）；null：不存在或非常规文件
 */
function classifyEntry(entryAbs, expectedSourceAbs) {
  let st;
  try {
    st = lstatSync(entryAbs);
  } catch {
    return null;
  }
  if (st.isSymbolicLink()) {
    const target = String(readlinkSync(entryAbs));
    const healthy = existsSync(entryAbs);
    const external = healthy && resolve(target) !== resolve(expectedSourceAbs ?? '');
    return { kind: 'link', target, healthy, external };
  }
  if (st.isDirectory()) {
    if (process.platform === 'win32') {
      // Windows junction 被 lstat 报告为目录；readlinkSync 成功才确认是链接点（真实目录会抛错）
      try {
        const target = String(readlinkSync(entryAbs));
        const healthy = existsSync(entryAbs);
        const external = healthy && resolve(target) !== resolve(expectedSourceAbs ?? '');
        return { kind: 'link', target, healthy, external };
      } catch {
        return { kind: 'real' };
      }
    }
    return { kind: 'real' };
  }
  return null;
}

/** 对比源与副本文件集：内容相同视为一致（size+mtime 一致直接跳过；疑似不同时读内容比对） */
function diffTrees(sourceAbs, targetAbs) {
  const sourceMap = walkFiles(sourceAbs);
  const targetMap = walkFiles(targetAbs);
  if (!sourceMap || !targetMap) return { same: false, stale: [], newer: [] };
  const stale = [];
  const newer = [];
  const names = new Set([...sourceMap.keys(), ...targetMap.keys()]);
  for (const rel of names) {
    const s = sourceMap.get(rel);
    const t = targetMap.get(rel);
    if (!s && t) { newer.push(rel); continue; } // 副本独有文件：视作本地改动
    if (s && !t) { stale.push(rel); continue; } // 源有副本无：缺文件
    if (s.size === t.size && Math.abs(s.mtimeMs - t.mtimeMs) <= 2) continue;
    // mtime 不同但尺寸相同 → 读内容比对（内容相同的副本不算差异，避免误报可更新）
    const sBuf = readFileSync(join(sourceAbs, ...rel.split('/')));
    const tBuf = readFileSync(join(targetAbs, ...rel.split('/')));
    if (!sBuf.equals(tBuf)) {
      (t.mtimeMs > s.mtimeMs ? newer : stale).push(rel);
    }
  }
  return { same: stale.length === 0 && newer.length === 0, stale, newer };
}

/** 读 generation.json 的 review.status（无/损坏返回 null） */
function forgeStatus(skillDir) {
  const file = join(skillDir, 'generation.json');
  if (!existsSync(file)) return null;
  try {
    const gen = JSON.parse(readFileSync(file, 'utf-8'));
    return gen && gen.review && typeof gen.review === 'object' ? String(gen.review.status || '') || null : null;
  } catch {
    return null;
  }
}

/** GET /api/skills：源库 × 工具目录同步矩阵 */
export function skillsSync() {
  if (!existsSync(AGENTS_SKILLS_DIR)) throw httpError(404, `技能源库不存在：${AGENTS_SKILLS_DIR}`);
  const sourceEntries = readdirSync(AGENTS_SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'));
  const sourceMap = new Map(); // name -> { forge, files }
  for (const ent of sourceEntries) {
    const files = walkFiles(join(AGENTS_SKILLS_DIR, ent.name));
    if (!files) continue;
    sourceMap.set(ent.name, { forge: forgeStatus(join(AGENTS_SKILLS_DIR, ent.name)), fileCount: files.size });
  }

  const tools = [];
  for (const t of TOOL_SKILLS_DIRS) {
    const abs = expandPath(t.dir);
    if (!existsSync(abs)) continue;
    tools.push({ dir: t.dir, label: t.label, abs });
  }

  // stateOf[name][dir] = 状态码；矩阵行按「源库 ∪ 各工具目录」的名字并集
  const stateOf = new Map();
  const ensureRow = (name) => {
    if (!stateOf.has(name)) stateOf.set(name, {});
    return stateOf.get(name);
  };

  for (const tool of tools) {
    // 条目类型不按 dirent 判定（Windows junction 在 readdir 里未必报目录），交给 classifyEntry
    const entries = readdirSync(tool.abs, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));
    for (const ent of entries) {
      const row = ensureRow(ent.name);
      const expectedSource = join(AGENTS_SKILLS_DIR, ent.name);
      const cls = classifyEntry(join(tool.abs, ent.name), expectedSource);
      if (!cls) continue; // 普通文件（如 README.md）不参与矩阵
      if (cls.kind === 'link') {
        if (!cls.healthy) row[tool.dir] = 'broken';
        else row[tool.dir] = cls.external ? 'linked-external' : 'linked';
        continue;
      }
      if (!sourceMap.has(ent.name)) { row[tool.dir] = 'extra'; continue; }
      const d = diffTrees(expectedSource, join(tool.abs, ent.name));
      row[tool.dir] = d.same ? 'current' : (d.newer.length > 0 ? 'conflict' : 'updatable');
    }
    // 源库有而该工具目录没有的技能（ensureRow 保证纯源库技能也成行）
    for (const name of sourceMap.keys()) {
      const row = ensureRow(name);
      if (row[tool.dir] === undefined && !existsSync(join(tool.abs, name))) row[tool.dir] = 'missing';
    }
  }

  const matrix = [...stateOf.entries()]
    .map(([name, perTool]) => ({
      name,
      forge: sourceMap.get(name)?.forge ?? null,
      sourceExists: sourceMap.has(name),
      fileCount: sourceMap.get(name)?.fileCount ?? null,
      perTool,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  let updatable = 0;
  let broken = 0;
  let conflict = 0;
  for (const row of matrix) {
    for (const st of Object.values(row.perTool)) {
      if (st === 'updatable') updatable += 1;
      else if (st === 'broken') broken += 1;
      else if (st === 'conflict') conflict += 1;
    }
  }
  return {
    source: AGENTS_SKILLS_DIR,
    tools: tools.map((t) => ({ dir: t.dir, label: t.label })),
    matrix,
    summary: { skills: matrix.length, updatable, broken, conflict, tools: tools.length },
  };
}

/** 把源技能目录里「源较新」的文件覆盖到真实目录副本；返回写入文件数 */
function copyStaleFiles(sourceAbs, targetAbs, stale) {
  let written = 0;
  for (const rel of stale) {
    const srcFile = join(sourceAbs, ...rel.split('/'));
    const dstFile = join(targetAbs, ...rel.split('/'));
    const dstParent = dstFile.slice(0, dstFile.lastIndexOf(sep));
    if (!existsSync(dstParent)) mkdirSync(dstParent, { recursive: true });
    copyFileSync(srcFile, dstFile);
    written += 1;
  }
  return written;
}

/**
 * POST /api/skills/update：批量更新全部 updatable 的真实目录副本。
 * 返回逐条结果；conflict / broken / 链接一律不碰。
 */
export function updateSkills() {
  const data = skillsSync();
  const updated = [];
  const skipped = [];
  const sourceAbsOf = (name) => join(AGENTS_SKILLS_DIR, name);
  const absOf = new Map(data.tools.map((t) => [t.dir, expandPath(t.dir)]));

  for (const row of data.matrix) {
    for (const [dir, st] of Object.entries(row.perTool)) {
      const targetAbs = join(absOf.get(dir), row.name);
      if (st === 'updatable') {
        const srcAbs = sourceAbsOf(row.name);
        const d = diffTrees(srcAbs, targetAbs);
        try {
          const written = copyStaleFiles(srcAbs, targetAbs, d.stale);
          updated.push({ name: row.name, tool: dir, filesWritten: written });
        } catch (e) {
          skipped.push({ name: row.name, tool: dir, reason: `写入失败：${e instanceof Error ? e.message : String(e)}` });
        }
      } else if (st === 'conflict') {
        skipped.push({ name: row.name, tool: dir, reason: '副本内存在比源新的本地改动（conflict），未自动覆盖' });
      }
    }
  }
  return {
    updated,
    skipped,
    summary: { updatedSkills: updated.length, writtenFiles: updated.reduce((n, u) => n + u.filesWritten, 0), skipped: skipped.length },
  };
}
