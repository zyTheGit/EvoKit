import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const DEFERRED_PATTERN = /Won't-do|推后|推迟|deferred|不在本版本/i;
const ADR_ID_PATTERN = /^(\d+)-/;
const SUPERSEDED_PATTERN = /已被取代|已被废弃|superseded/i;

/** 读取「## 状态」段落正文，判断该 ADR 是否已被取代（已被取代的 ADR 不参与 ROADMAP 登记校验） */
function readStatusSection(lines) {
  const start = lines.findIndex((l) => /^##\s+状态\s*$/.test(l));
  if (start === -1) return '';
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join('\n');
}

export async function parseAdrFile(filePath) {
  const content = await readFile(filePath, 'utf8');
  const fileName = basename(filePath);
  const idMatch = ADR_ID_PATTERN.exec(fileName);
  const adrId = idMatch ? `ADR-${idMatch[1]}` : 'ADR-UNKNOWN';

  const lines = content.split(/\r?\n/);
  const superseded = SUPERSEDED_PATTERN.test(readStatusSection(lines));
  const items = [];
  let currentSection = '';
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      currentSection = headingMatch[2];
      continue;
    }

    if (DEFERRED_PATTERN.test(line)) {
      const description = line.replace(/^[-*\s>]+/, '').trim();
      if (description.length > 0) {
        items.push({
          adrId,
          section: currentSection || '(unknown)',
          description,
          deferredTo: extractDeferredTarget(line),
          line: i + 1,
        });
      }
    }
  }

  return { items, superseded, adrId };
}

function extractDeferredTarget(line) {
  const vMatch = /v(\d+\.\d+(?:\.\d+)?(?:\.x)?)/.exec(line);
  if (vMatch) return `v${vMatch[1]}`;
  const futureMatch = /(未来展望|future|backlog)/i.exec(line);
  if (futureMatch) return 'future';
  return null;
}