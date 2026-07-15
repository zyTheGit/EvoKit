/**
 * @internal — Internal helper, not part of the public adapter API.
 * EvoKit — Agent File Merge Utility
 *
 * For each .md file in source_dir:
 *   - target doesn't exist → copy from source
 *   - target exists → merge YAML frontmatter (add missing fields from template)
 *
 * Replaces template/merge/install-agents.cjs
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';

const KEY_ORDER = [
  'name',
  'description',
  'model',
  'tools',
  'disallowedTools',
  'memory',
  'maxTurns',
];

/**
 * @internal — Internal helper, not part of the public adapter API.
 * Parse YAML frontmatter from markdown content.
 * Returns frontmatter as a flat Record<string, string> plus the body text.
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
  hasFrontmatter: boolean;
} {
  const lines = content.split('\n');
  if (lines.length < 2 || lines[0].trim() !== '---') {
    return { frontmatter: {}, body: content, hasFrontmatter: false };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return { frontmatter: {}, body: content, hasFrontmatter: false };
  }

  const fmLines = lines.slice(1, endIdx);
  const body = lines.slice(endIdx + 1).join('\n');
  const frontmatter: Record<string, string> = {};

  for (const raw of fmLines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) frontmatter[key] = value;
  }

  return { frontmatter, body, hasFrontmatter: true };
}

function serializeFrontmatter(fm: Record<string, string>): string {
  const keys = Object.keys(fm).sort((a, b) => {
    const ai = KEY_ORDER.indexOf(a);
    const bi = KEY_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
  return keys.map((k) => `${k}: ${fm[k]}`).join('\n');
}

/**
 * @internal — Internal helper, not part of the public adapter API.
 * Merge template frontmatter into target frontmatter.
 * Only adds fields absent from target; never overwrites.
 */
function mergeFrontmatter(
  targetFm: Record<string, string>,
  templateFm: Record<string, string>,
): [changed: boolean, merged: Record<string, string>] {
  let changed = false;
  const merged = { ...targetFm };
  for (const [key, value] of Object.entries(templateFm)) {
    if (!(key in merged)) {
      merged[key] = value;
      changed = true;
    }
  }
  return [changed, merged];
}

/** Write atomically via temp file + rename */
function writeAtomic(filePath: string, content: string): boolean {
  const tmp = filePath + '.merge.tmp';
  fs.writeFileSync(tmp, content, 'utf-8');
  // Validate
  const back = fs.readFileSync(tmp, 'utf-8');
  if (typeof back !== 'string' || back.length === 0) {
    fse.removeSync(tmp);
    return false;
  }
  fs.renameSync(tmp, filePath);
  return true;
}

export type AgentFileStatus = 'COPY' | 'MERGED' | 'SKIPPED' | `ERROR:${string}`;

export interface AgentFileResult {
  name: string;
  status: AgentFileStatus;
}

/**
 * @internal — Internal helper, not part of the public adapter API.
 * Install or merge agent .md files from source into target directory.
 *
 * Returns an array of { name, status } results for each file processed.
 */
export function installOrMergeAgents(
  srcDir: string,
  dstDir: string,
  dryRun = false,
): AgentFileResult[] {
  if (!fse.existsSync(srcDir)) return [];
  fse.ensureDirSync(dstDir);

  const results: AgentFileResult[] = [];

  let files: string[];
  try {
    files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.md'));
  } catch {
    return results;
  }

  for (const file of files.sort()) {
    const srcPath = path.join(srcDir, file);
    const dstPath = path.join(dstDir, file);

    // Case 1: target doesn't exist → copy
    if (!fse.existsSync(dstPath)) {
      if (dryRun) {
        results.push({ name: file, status: 'COPY' });
        continue;
      }
      try {
        const content = fs.readFileSync(srcPath, 'utf-8');
        if (!content) {
          results.push({ name: file, status: 'ERROR:empty source' });
          continue;
        }
        fs.writeFileSync(dstPath, content, 'utf-8');
        results.push({ name: file, status: 'COPY' });
      } catch (e: any) {
        results.push({ name: file, status: `ERROR:${e.message}` });
      }
      continue;
    }

    // Case 2: target exists → merge frontmatter
    if (dryRun) {
      results.push({ name: file, status: 'SKIPPED' });
      continue;
    }

    try {
      const srcContent = fs.readFileSync(srcPath, 'utf-8');
      const dstContent = fs.readFileSync(dstPath, 'utf-8');

      const srcParsed = parseFrontmatter(srcContent);
      const dstParsed = parseFrontmatter(dstContent);

      if (!dstParsed.hasFrontmatter) {
        // Target has no frontmatter — prepend template's
        const newContent =
          '---\n' + serializeFrontmatter(srcParsed.frontmatter) + '\n---\n' + dstParsed.body;
        if (!writeAtomic(dstPath, newContent)) {
          results.push({ name: file, status: 'ERROR:write failed' });
          continue;
        }
        results.push({ name: file, status: 'MERGED' });
        continue;
      }

      // Merge: only add missing fields
      const [changed, merged] = mergeFrontmatter(dstParsed.frontmatter, srcParsed.frontmatter);
      if (!changed) {
        results.push({ name: file, status: 'SKIPPED' });
        continue;
      }

      const newContent = '---\n' + serializeFrontmatter(merged) + '\n---\n' + dstParsed.body;
      if (!writeAtomic(dstPath, newContent)) {
        results.push({ name: file, status: 'ERROR:write failed' });
        continue;
      }
      results.push({ name: file, status: 'MERGED' });
    } catch (e: any) {
      results.push({ name: file, status: `ERROR:${e.message}` });
    }
  }

  return results;
}
