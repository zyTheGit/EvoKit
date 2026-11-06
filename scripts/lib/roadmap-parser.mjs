import { readFile } from 'node:fs/promises';

const VERSION_HEADING = /^###\s+(v\d+(?:\.\d+)*(?:\.x)?)\s*[—\-–:(]?\s*(.*)$/;
const ADR_REF = /adr-ref:\s*ADR-(\d+)/i;

export async function parseRoadmap(filePath) {
  const content = await readFile(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const entries = [];
  let current = null;
  let inCodeBlock = false;

  for (const line of lines) {
    if (/^```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const vMatch = VERSION_HEADING.exec(line);
    if (vMatch) {
      if (current) entries.push(current);
      current = { version: vMatch[1], theme: vMatch[2].trim(), items: [] };
      continue;
    }

    if (current && /^\s*[-*]\s+/.test(line)) {
      const adrMatch = ADR_REF.exec(line);
      current.items.push({
        text: line.replace(/^\s*[-*]\s+/, '').trim(),
        adrRef: adrMatch ? `ADR-${adrMatch[1].padStart(4, '0')}` : null,
      });
    }
  }
  if (current) entries.push(current);
  return entries;
}