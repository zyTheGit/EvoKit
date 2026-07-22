/**
 *
 * @internal — 内部辅助模块，不属于公共适配器 API。
 * EvoKit — 模板下载工具
 *
 * 从多个来源解析模板目录：
 * 1. 显式 --template 路径
 * 2. 内置路径（开发环境、npm 全局、npm 本地）
 * 3. GitHub 下载（curl|bash 安装方式的回退方案）
 *
 * 从 template.ts 中提取，以保持关注点分离。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fse from 'fs-extra';

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TemplateResolution {
  templateDir: string;
  cleanup: (() => void) | null;
}

/**
 *
 * @internal — 内部辅助模块，不属于公共适配器 API。
 * 解析模板目录。
 *
 * 优先级：
 *   1. 显式 templatePath 参数
 *   2. 随包内置（开发环境、npm 全局、npm 本地）
 *   3. 从 GitHub 下载
 */
export async function resolveTemplateDir(
  templatePath?: string,
  branch?: string,
): Promise<TemplateResolution> {
  // 1. 显式路径
  if (templatePath) {
    if (!fse.existsSync(path.join(templatePath, 'claude', 'CLAUDE.md'))) {
      throw new Error(`模板未找到于: ${templatePath}\n` + '  请使用 --template 指定正确路径');
    }
    return { templateDir: templatePath, cleanup: null };
  }

  // 2. 内置路径
  const bundledPaths = [
    // 开发环境：src/ 目录 → template/
    path.resolve(__dirname, '..', 'template'),
    // 生产环境：dist/ 目录 → 上溯到根目录
    path.resolve(__dirname, '..', '..', 'template'),
    // npm 全局：bin/ → ../lib/node_modules/@zythegit/evokit/template
    path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      'lib',
      'node_modules',
      '@zythegit',
      'evokit',
      'template',
    ),
    // npm 本地：node_modules/.bin → ../@zythegit/evokit/template
    path.resolve(__dirname, '..', '..', '@zythegit', 'evokit', 'template'),
  ];

  for (const bp of bundledPaths) {
    const normalized = path.normalize(bp);
    if (fse.existsSync(path.join(normalized, 'claude', 'CLAUDE.md'))) {
      return { templateDir: normalized, cleanup: null };
    }
  }

  // 3. 回退方案：从 GitHub 下载
  console.log('📦 正在从 GitHub 下载 EvoKit 模板...');
  return downloadFromGitHub(branch || 'main');
}

/**
 *
 * @internal — 内部辅助模块，不属于公共适配器 API。
 * 从 GitHub 下载 EvoKit 仓库并返回 template/ 路径。
 */
async function downloadFromGitHub(branch: string): Promise<TemplateResolution> {
  const tmpDir = fs.mkdtempSync('evokit-');
  const tarballPath = path.join(tmpDir, 'evokit.tar.gz');

  const url = `https://codeload.github.com/zyTheGit/EvoKit/tar.gz/${branch}`;

  return new Promise((resolve, reject) => {
    const tarball = fs.createWriteStream(tarballPath);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(
            new Error(
              `GitHub 下载失败 (HTTP ${response.statusCode})。` + '请检查分支名称或网络连接。',
            ),
          );
          return;
        }
        response.pipe(tarball);
        tarball.on('finish', () => {
          tarball.close();

          const result = spawnSync('tar', ['xzf', tarballPath, '-C', tmpDir], {
            stdio: 'pipe',
          });
          if (result.status !== 0) {
            reject(
              new Error(
                '从 GitHub 归档中提取模板失败: ' + (result.stderr?.toString() || '未知错误'),
              ),
            );
            return;
          }

          const entries = fs.readdirSync(tmpDir);
          const extracted = entries.find(
            (e) => e !== 'evokit.tar.gz' && fs.statSync(path.join(tmpDir, e)).isDirectory(),
          );
          if (!extracted) {
            reject(new Error('在归档中未找到已解压的目录。'));
            return;
          }

          const templateDir = path.join(tmpDir, extracted, 'template');
          if (!fse.existsSync(templateDir)) {
            reject(new Error('GitHub 归档中不包含 template/ 目录。'));
            return;
          }

          resolve({
            templateDir,
            cleanup: () => {
              fse.removeSync(tmpDir);
            },
          });
        });
      })
      .on('error', reject);
  });
}
