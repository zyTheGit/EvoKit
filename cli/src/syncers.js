// 同步器：按资源 type 分派，把源同步到目标

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { expandPath } from './paths.js';
import { readSource, applyManagedBlock, makeSymlink } from './fs-utils.js';
import { fetchRemote, isRemote } from './remote.js';

/** 把文本内容合并进目标托管块（text / remote 共用），只更新托管块、保留块外内容 */
function writeText(content, target) {
  const file = expandPath(target);
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  applyManagedBlock(file, content.trim());
  return file;
}

/** 文本型资源：源内容写入目标托管块 */
function syncText(source, target) {
  const content = readSource(expandPath(source));
  return writeText(content, target);
}

/** 远程型资源：拉取 URL 内容写入目标托管块（支持 proxy 字段） */
async function syncRemote(source, target, proxy) {
  const content = await fetchRemote(source, { proxy });
  return writeText(content, target);
}

/** 软链接型资源：源目录软链到目标 */
function syncSymlink(source, target) {
  const src = expandPath(source);
  const tgt = expandPath(target);
  if (!existsSync(src)) {
    throw new Error(`源目录不存在：${src}`);
  }
  makeSymlink(src, tgt);
  return tgt;
}

/**
 * 按 type 分派同步器。
 * 若 type 未显式指定，但 source 是 http(s)://，自动按 remote 处理。
 */
export const SYNCERS = {
  text: syncText,
  symlink: syncSymlink,
  remote: syncRemote,
};

/** 根据资源对象解析实际的同步器函数 */
export function resolveSyncer(resource) {
  if (resource.type && SYNCERS[resource.type]) {
    return SYNCERS[resource.type];
  }
  // 未指定 type 或 type 未知，但 source 是远程 URL → 自动 remote
  if (isRemote(resource.source)) {
    return SYNCERS.remote;
  }
  return null;
}
