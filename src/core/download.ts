/**
 * EvoKit — Template Download Utility
 *
 * Resolves the template directory from multiple sources:
 * 1. Explicit --template path
 * 2. Bundled paths (dev, npm global, npm local)
 * 3. GitHub download (fallback for curl|bash installs)
 *
 * Extracted from template.ts to keep concerns separate.
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
 * Resolve the template directory.
 *
 * Priority:
 *   1. Explicit templatePath argument
 *   2. Bundled with the package (dev, npm global, npm local)
 *   3. Download from GitHub
 */
export async function resolveTemplateDir(
  templatePath?: string,
  branch?: string,
): Promise<TemplateResolution> {
  // 1. Explicit path
  if (templatePath) {
    if (!fse.existsSync(path.join(templatePath, 'claude', 'CLAUDE.md'))) {
      throw new Error(
        `Template not found at: ${templatePath}\n` +
          '  Specify the correct path with --template',
      );
    }
    return { templateDir: templatePath, cleanup: null };
  }

  // 2. Bundled paths
  const bundledPaths = [
    // Development: src/ dir → template/
    path.resolve(__dirname, '..', 'template'),
    // Production: dist/ dir → up to root
    path.resolve(__dirname, '..', '..', 'template'),
    // npm global: bin/ → ../lib/node_modules/@zythegit/evokit/template
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
    // npm local: node_modules/.bin → ../@zythegit/evokit/template
    path.resolve(__dirname, '..', '..', '@zythegit', 'evokit', 'template'),
  ];

  for (const bp of bundledPaths) {
    const normalized = path.normalize(bp);
    if (fse.existsSync(path.join(normalized, 'claude', 'CLAUDE.md'))) {
      return { templateDir: normalized, cleanup: null };
    }
  }

  // 3. Fallback: download from GitHub
  console.log('📦 Downloading EvoKit template from GitHub...');
  return downloadFromGitHub(branch || 'main');
}

/**
 * Download the EvoKit repo from GitHub and return the template/ path.
 */
async function downloadFromGitHub(
  branch: string,
): Promise<TemplateResolution> {
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
              `GitHub download failed (HTTP ${response.statusCode}). ` +
                'Check the branch name or your internet connection.',
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
                'Failed to extract template from GitHub archive: ' +
                  (result.stderr?.toString() || 'unknown error'),
              ),
            );
            return;
          }

          const entries = fs.readdirSync(tmpDir);
          const extracted = entries.find(
            (e) =>
              e !== 'evokit.tar.gz' &&
              fs.statSync(path.join(tmpDir, e)).isDirectory(),
          );
          if (!extracted) {
            reject(
              new Error('Failed to find extracted directory in archive.'),
            );
            return;
          }

          const templateDir = path.join(tmpDir, extracted, 'template');
          if (!fse.existsSync(templateDir)) {
            reject(
              new Error('GitHub archive does not contain a template/ directory.'),
            );
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
