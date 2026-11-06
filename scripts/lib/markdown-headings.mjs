import { readFile } from 'node:fs/promises';

export async function extractHeadings(filePath) {
  const content = await readFile(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const headings = [];
  let inCodeBlock = false;
  for (const line of lines) {
    if (/^```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
      headings.push({ level: match[1].length, text: match[2] });
    }
  }
  return headings;
}