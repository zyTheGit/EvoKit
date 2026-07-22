/**
 * EvoKit — Remove CLAUDE.md Section
 *
 * Removes the EvoKit-appended section from a CLAUDE.md file.
 * If EvoKit created the entire file (marker at line 1 with no
 * user content before it), the file is deleted entirely.
 * If EvoKit appended to an existing file, only the appended
 * section (from the marker line to EOF) is removed.
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import fse from 'fs-extra';

/** Result of removing a CLAUDE.md section */
export interface RemoveClaudeMdResult {
  /** What happened: section-removed, file-deleted, or skipped */
  action: 'section-removed' | 'file-deleted' | 'skipped';
  /** Warning if content was found that might be user's */
  warning?: string;
}

/**
 * Remove the EvoKit section from a CLAUDE.md file.
 *
 * Searches for `appendMarker` in the file content.  If the marker
 * is found at the very beginning (no real user content before it),
 * the entire file is deleted.  If user content exists before the
 * marker, only the section from the marker to EOF is removed,
 * along with any `---` separator and trailing blank lines.
 *
 * If the marker is not found, or the file doesn't exist, returns
 * `action: 'skipped'`.
 */
export function removeClaudeMdSection(
  claudeMdPath: string,
  appendMarker: string,
  dryRun = false,
): RemoveClaudeMdResult {
  // File doesn't exist → skip
  if (!fse.existsSync(claudeMdPath)) {
    return { action: 'skipped' };
  }

  let content: string;
  try {
    content = fs.readFileSync(claudeMdPath, 'utf-8');
  } catch {
    /* file unreadable (permissions or encoding) — skip */
    return { action: 'skipped' };
  }

  // Marker not found → skip
  const markerIdx = content.indexOf(appendMarker);
  if (markerIdx === -1) {
    return { action: 'skipped' };
  }

  // Content before the marker
  const beforeMarker = content.slice(0, markerIdx);

  // Check if EvoKit created the entire file:
  // - beforeMarker is only whitespace, markdown heading prefixes (#), and/or --- separators
  const cleanedBefore = beforeMarker.replace(/---/g, '').replace(/#+/g, '').trim();

  if (cleanedBefore === '') {
    // EvoKit created the entire file → delete it
    if (!dryRun) {
      fse.removeSync(claudeMdPath);
    }
    return { action: 'file-deleted' };
  }

  // EvoKit appended to existing file → remove from marker to EOF
  // Also clean up the --- separator, heading markers, and trailing blank lines before the marker
  let trimmed = beforeMarker;

  // Remove trailing --- separator(s) and blank lines
  trimmed = trimmed.replace(/\n*---\s*\n*$/, '');
  // Remove trailing heading markers (#) and blank lines
  trimmed = trimmed.replace(/\n*#+\s*$/, '');
  // Remove trailing blank lines
  trimmed = trimmed.replace(/\n+$/, '');

  // If after cleanup the file is empty → delete it
  if (trimmed.trim() === '') {
    if (!dryRun) {
      fse.removeSync(claudeMdPath);
    }
    return { action: 'file-deleted' };
  }

  // Ensure file ends with a single newline
  const newContent = trimmed + '\n';

  if (!dryRun) {
    // Write atomically
    const tmpPath = claudeMdPath + '.reverse.tmp';
    fs.writeFileSync(tmpPath, newContent, 'utf-8');
    try {
      fs.renameSync(tmpPath, claudeMdPath);
    } catch {
      /* atomic rename failed (cross-device or permissions) — discard temp file */
      fse.removeSync(tmpPath);
    }
  }

  return { action: 'section-removed' };
}
