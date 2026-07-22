/**
 * @internal — JSONL 轮换和置信度衰减，用于演化管道。
 * 不属于公开适配器 API。
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  EvoConfig,
  RotationResult,
  DecayResult,
  CorrectionEntry,
  ObservationEntry,
} from './types.js';
import { readJsonlFile, writeJsonlFile, getArchiveDir, isOlderThanDays } from './memory.js';

/**
 * 轮换 JSONL 文件：将超过 maxDays 的记录归档。
 * 如果活跃文件超过 maxLines，旧记录被移入归档。
 * 如果归档文件超过 maxLinesArchive，则进行 gzip 压缩。
 */
export function rotateJsonlFile(config: EvoConfig, filename: string): RotationResult {
  const memoryDir = path.join(config.homeDir, '.claude', 'memory');
  const filePath = path.join(memoryDir, filename);
  const maxLines = config.maxLines ?? 500;
  const maxDays = config.maxDays ?? 30;
  const maxLinesArchive = config.maxLinesArchive ?? 1000;

  const entries = readJsonlFile<Record<string, unknown>>(filePath);
  if (entries.length <= maxLines) {
    return { file: filename, kept: entries.length, archived: 0, gzipped: false };
  }

  const recent = entries.filter((e) => {
    const ts = (e as any).timestamp;
    return !ts || !isOlderThanDays(ts, maxDays);
  });
  const old = entries.filter((e) => {
    const ts = (e as any).timestamp;
    return ts && isOlderThanDays(ts, maxDays);
  });

  if (recent.length === entries.length) {
    // 所有记录都是近期的 — 行数高但无需轮换
    return { file: filename, kept: entries.length, archived: 0, gzipped: false };
  }

  if (!config.dryRun) {
    writeJsonlFile(filePath, recent);
  }

  if (old.length === 0) {
    return { file: filename, kept: recent.length, archived: 0, gzipped: false };
  }

  // 归档旧记录
  const archiveDir = getArchiveDir(config.homeDir);
  const month = new Date().toISOString().slice(0, 7);
  let archivePath = path.join(archiveDir, `${filename}-${month}`);

  // 如果归档已存在，合并
  const existingArchive = readJsonlFile<Record<string, unknown>>(archivePath);
  const allArchived = [...existingArchive, ...old];

  let gzipped = false;
  if (allArchived.length > maxLinesArchive) {
    // Gzip 压缩归档
    const gzPath = archivePath + '.gz';
    if (!config.dryRun) {
      const jsonContent = allArchived.map((e) => JSON.stringify(e)).join('\n') + '\n';
      const gzippedContent = zlib.gzipSync(jsonContent);
      fs.writeFileSync(gzPath, gzippedContent);
      // 删除未压缩的归档文件（如果存在）
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }
    }
    archivePath = gzPath;
    gzipped = true;
  } else {
    if (!config.dryRun) {
      writeJsonlFile(archivePath, allArchived);
    }
  }

  return {
    file: filename,
    kept: recent.length,
    archived: old.length,
    archivePath,
    gzipped,
  };
}

/**
 * 对 observations.jsonl 应用置信度衰减。
 * 超过 confidenceDecayDays 的记录，置信度减半。
 * 低于 confidenceThreshold 的记录被归档。
 */
export function applyConfidenceDecay(config: EvoConfig, filename: string): DecayResult {
  const memoryDir = path.join(config.homeDir, '.claude', 'memory');
  const filePath = path.join(memoryDir, filename);
  const decayDays = config.confidenceDecayDays ?? 60;
  const threshold = config.confidenceThreshold ?? 0.3;

  const entries = readJsonlFile<ObservationEntry>(filePath);
  if (entries.length === 0) {
    return { file: filename, kept: 0, archived: 0 };
  }

  const kept: ObservationEntry[] = [];
  const archived: ObservationEntry[] = [];

  for (const entry of entries) {
    let confidence = entry.confidence;

    if (entry.timestamp && isOlderThanDays(entry.timestamp, decayDays)) {
      confidence = confidence / 2;
    }

    if (confidence < threshold) {
      archived.push({ ...entry, confidence });
    } else {
      kept.push({ ...entry, confidence });
    }
  }

  if (!config.dryRun) {
    writeJsonlFile(filePath, kept);
  }

  if (archived.length > 0) {
    const archiveDir = getArchiveDir(config.homeDir);
    const month = new Date().toISOString().slice(0, 7);
    const archivePath = path.join(archiveDir, `${filename}-decayed-${month}`);
    if (!config.dryRun) {
      writeJsonlFile(archivePath, archived);
    }
    return { file: filename, kept: kept.length, archived: archived.length, archivePath };
  }

  return { file: filename, kept: kept.length, archived: 0 };
}
