/**
 * EvoKit — Reverse Agent Frontmatter Merge
 *
 * Reverses the agent .md file frontmatter merge performed during
 * installation.  Removes EvoKit-added frontmatter fields while
 * preserving any user-added fields.  If all frontmatter is removed
 * and the body is empty, the file is deleted.
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { parseFrontmatter, serializeFrontmatter } from './merge-agents.js';
import type { ManifestAgentFrontmatter } from './manifest.js';

/** Result of reversing frontmatter on a single agent file */
export interface ReverseAgentResult {
  /** Agent filename (e.g. 'architect.md') */
  file: string;
  /** What happened: cleaned = fields removed, deleted = file removed, skipped = no changes */
  action: 'cleaned' | 'deleted' | 'skipped';
  /** Number of frontmatter fields removed */
  fieldsRemoved: number;
}

/**
 * Reverse the agent frontmatter merge — remove EvoKit-added fields.
 *
 * For each agent file recorded in the manifest, reads the file, parses
 * frontmatter, removes fields that match the recorded key+value pairs,
 * and rewrites the file.  If all frontmatter is removed and the body is
 * empty/whitespace, the file is deleted.
 */
export function reverseMergeAgents(
  agentsDir: string,
  agentRecords: ManifestAgentFrontmatter[],
  dryRun = false,
): ReverseAgentResult[] {
  const results: ReverseAgentResult[] = [];

  for (const record of agentRecords) {
    const filePath = path.join(agentsDir, record.file);

    // Skip if file doesn't exist
    if (!fse.existsSync(filePath)) {
      results.push({ file: record.file, action: 'skipped', fieldsRemoved: 0 });
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      /* file unreadable (permissions or encoding) — skip this agent */
      results.push({ file: record.file, action: 'skipped', fieldsRemoved: 0 });
      continue;
    }

    const parsed = parseFrontmatter(content);

    // Skip if no frontmatter
    if (!parsed.hasFrontmatter) {
      results.push({ file: record.file, action: 'skipped', fieldsRemoved: 0 });
      continue;
    }

    // Remove matching fields
    let fieldsRemoved = 0;
    for (const [key, value] of Object.entries(record.fields)) {
      if (parsed.frontmatter[key] === value) {
        delete parsed.frontmatter[key];
        fieldsRemoved++;
      }
    }

    if (fieldsRemoved === 0) {
      results.push({ file: record.file, action: 'skipped', fieldsRemoved: 0 });
      continue;
    }

    // If all frontmatter removed and body is empty/whitespace → delete file
    const remainingKeys = Object.keys(parsed.frontmatter);
    if (remainingKeys.length === 0 && parsed.body.trim() === '') {
      if (!dryRun) {
        fse.removeSync(filePath);
      }
      results.push({ file: record.file, action: 'deleted', fieldsRemoved });
      continue;
    }

    // Otherwise rewrite with cleaned frontmatter
    if (!dryRun) {
      let newContent: string;
      if (remainingKeys.length === 0) {
        // No frontmatter left — just write the body
        newContent = parsed.body;
      } else {
        newContent = '---\n' + serializeFrontmatter(parsed.frontmatter) + '\n---\n' + parsed.body;
      }

      // Write atomically
      const tmpPath = filePath + '.reverse.tmp';
      fs.writeFileSync(tmpPath, newContent, 'utf-8');
      try {
        fs.renameSync(tmpPath, filePath);
      } catch {
        /* atomic rename failed (cross-device or permissions) — discard temp file */
        fse.removeSync(tmpPath);
      }
    }

    results.push({ file: record.file, action: 'cleaned', fieldsRemoved });
  }

  return results;
}
