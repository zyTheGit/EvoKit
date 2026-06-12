import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fse from 'fs-extra';
import { InstallSummary } from './types.js';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Template Discovery ─────────────────────────────────────────

/**
 * Resolve the template directory path.
 * Priority: explicit path → bundled release path → download from GitHub.
 * Returns a cleanup function to remove temp files (if downloaded).
 */
export async function resolveTemplateDir(
  templatePath?: string,
  branch?: string,
): Promise<{ templateDir: string; cleanup: (() => void) | null }> {
  // 1. Explicit path
  if (templatePath) {
    if (!fse.existsSync(path.join(templatePath, 'CLAUDE.md'))) {
      throw new Error(
        `Template not found at: ${templatePath}\n` +
          '  Specify the correct path with --template',
      );
    }
    return { templateDir: templatePath, cleanup: null };
  }

  // 2. Bundled template (relative to CLI binary or dist)
  const bundledPaths = [
    // Development: src/ dir
    path.resolve(__dirname, '..', 'template'),
    // Production: dist/ dir + up to root
    path.resolve(__dirname, '..', '..', 'template'),
    // npm global: bin/ -> ../lib/node_modules/@zythegit/evokit/template
    path.resolve(__dirname, '..', '..', '..', 'lib', 'node_modules', '@zythegit', 'evokit', 'template'),
    // npm local: node_modules/.bin -> ../@zythegit/evokit/template
    path.resolve(__dirname, '..', '..', '@zythegit', 'evokit', 'template'),
  ];

  for (const bp of bundledPaths) {
    const normalized = path.normalize(bp);
    if (fse.existsSync(path.join(normalized, 'CLAUDE.md'))) {
      return { templateDir: normalized, cleanup: null };
    }
  }

  // 3. Fallback: download from GitHub
  console.log('📦 Downloading EvoKit template from GitHub...');
  const result = await downloadFromGitHub(branch || 'main');
  return { templateDir: result.templateDir, cleanup: result.cleanup };
}

// ─── GitHub Download ────────────────────────────────────────────

function downloadFromGitHub(
  branch: string,
): Promise<{ templateDir: string; cleanup: () => void }> {
  const tmpDir = fs.mkdtempSync('evokit-');
  const tarballPath = path.join(tmpDir, 'evokit.tar.gz');

  const url = `https://codeload.github.com/zyTheGit/EvoKit/tar.gz/${branch}`;
  const tarball = fs.createWriteStream(tarballPath);

  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
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

        // Extract tarball
        const result = spawnSync('tar', ['xzf', tarballPath, '-C', tmpDir], {
          stdio: 'pipe',
        });
        if (result.status !== 0) {
          reject(
            new Error(
              'Failed to extract template from GitHub archive: ' +
                result.stderr.toString(),
            ),
          );
          return;
        }

        // Find extracted dir (GitHub tarballs create a dir like zyTheGit-EvoKit-<sha>)
        const entries = fs.readdirSync(tmpDir);
        const extracted = entries.find(
          (e) => e !== 'evokit.tar.gz' && fs.statSync(path.join(tmpDir, e)).isDirectory(),
        );
        if (!extracted) {
          reject(new Error('Failed to find extracted directory in GitHub archive.'));
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
    }).on('error', reject);
  });
}

// ─── Installation ───────────────────────────────────────────────

const CLAUDE_SUBDIRS = ['rules', 'agents', 'commands', 'memory', 'hooks'] as const;
const HOOK_FILES = ['session-start.sh', 'stop.sh', 'export-system.sh'] as const;
const MEMORY_SEED_FILES = [
  'README.md',
  'learned-rules.md',
  'evolution-log.md',
  'corrections.jsonl',
  'observations.jsonl',
  'violations.jsonl',
  'sessions.jsonl',
] as const;

export function installTemplate(
  homeDir: string,
  templateDir: string,
  dryRun: boolean = false,
): InstallSummary {
  const summary: InstallSummary = {
    homeDir,
    filesCreated: 0,
    filesSkipped: 0,
    hooksInstalled: 0,
    commandsInstalled: 0,
    rulesInstalled: 0,
    agentsInstalled: 0,
  };

  const claudeDir = path.join(homeDir, '.claude');

  // 1. Create directories
  if (!dryRun) {
    for (const subdir of CLAUDE_SUBDIRS) {
      fse.ensureDirSync(path.join(claudeDir, subdir));
    }
  }

  // 2. CLAUDE.md (root level, only if not exists)
  const rootClaudeMd = path.join(homeDir, 'CLAUDE.md');
  if (!fse.existsSync(rootClaudeMd)) {
    const src = path.join(templateDir, 'CLAUDE.md');
    if (fse.existsSync(src)) {
      if (!dryRun) fse.copySync(src, rootClaudeMd);
      summary.filesCreated++;
    }
  } else {
    summary.filesSkipped++;
  }

  // 3. MEMORY.md → ~/.claude/
  const memMd = path.join(templateDir, 'MEMORY.md');
  if (fse.existsSync(memMd) && !dryRun) {
    fse.copySync(memMd, path.join(claudeDir, 'MEMORY.md'));
  }

  // 4. settings.json (only if not exists, with path replacement)
  const settingsTarget = path.join(claudeDir, 'settings.json');
  if (!fse.existsSync(settingsTarget)) {
    const settingsSrc = path.join(templateDir, 'settings.json');
    if (fse.existsSync(settingsSrc)) {
      if (!dryRun) {
        let content = fs.readFileSync(settingsSrc, 'utf-8');
        content = content.replace(/__HOME__/g, homeDir);
        fs.writeFileSync(settingsTarget, content, 'utf-8');
      }
      summary.filesCreated++;
    }
  } else {
    summary.filesSkipped++;
  }

  // 5. Hooks (always copy, with __HOME__ replacement)
  for (const hook of HOOK_FILES) {
    const src = path.join(templateDir, 'hooks', hook);
    if (fse.existsSync(src)) {
      if (!dryRun) {
        let content = fs.readFileSync(src, 'utf-8');
        content = content.replace(/__HOME__/g, homeDir);
        fs.writeFileSync(path.join(claudeDir, 'hooks', hook), content, 'utf-8');
      }
      summary.hooksInstalled++;
    }
  }

  // 6. Rules, agents, commands (always copy — upgrade path)
  for (const subdir of ['rules', 'agents', 'commands'] as const) {
    const srcDir = path.join(templateDir, subdir);
    const dstDir = path.join(claudeDir, subdir);
    if (fse.existsSync(srcDir)) {
      const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.md'));
      if (!dryRun) {
        for (const file of files) {
          fse.copySync(path.join(srcDir, file), path.join(dstDir, file));
        }
      }
      if (subdir === 'commands') summary.commandsInstalled += files.length;
      else if (subdir === 'rules') summary.rulesInstalled += files.length;
      else if (subdir === 'agents') summary.agentsInstalled += files.length;
    }
  }

  // 7. Memory seed files (only if not exists — preserve learning data)
  const memDir = path.join(claudeDir, 'memory');
  for (const file of MEMORY_SEED_FILES) {
    const target = path.join(memDir, file);
    if (!fse.existsSync(target)) {
      const src = path.join(templateDir, 'memory', file);
      if (fse.existsSync(src)) {
        if (!dryRun) fse.copySync(src, target);
        summary.filesCreated++;
      }
    } else {
      summary.filesSkipped++;
    }
  }

  // 8. Set permissions
  if (!dryRun) {
    setPermissions(claudeDir);
  }

  return summary;
}

export function setPermissions(claudeDir: string): void {
  // Hook scripts: executable
  const hooksDir = path.join(claudeDir, 'hooks');
  if (fse.existsSync(hooksDir)) {
    const hooks = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.sh'));
    for (const hook of hooks) {
      fs.chmodSync(path.join(hooksDir, hook), 0o755);
    }
  }

  // JSONL files: 600 (owner read/write only)
  const memDir = path.join(claudeDir, 'memory');
  if (fse.existsSync(memDir)) {
    const jsonls = fs.readdirSync(memDir).filter((f) => f.endsWith('.jsonl'));
    for (const j of jsonls) {
      fs.chmodSync(path.join(memDir, j), 0o600);
    }
  }
}

// ─── Verification (Boot) ────────────────────────────────────────

export interface BootCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export function verifyInstallation(homeDir: string): BootCheck[] {
  const checks: BootCheck[] = [];
  const claudeDir = path.join(homeDir, '.claude');

  // Directory structure
  for (const subdir of CLAUDE_SUBDIRS) {
    const exists = fse.existsSync(path.join(claudeDir, subdir));
    checks.push({
      name: `.claude/${subdir}/`,
      pass: exists,
      detail: exists ? undefined : 'Missing directory',
    });
  }

  // Key files
  const keyFiles = [
    { name: 'CLAUDE.md', path: path.join(homeDir, 'CLAUDE.md') },
    { name: '.claude/MEMORY.md', path: path.join(claudeDir, 'MEMORY.md') },
    { name: '.claude/settings.json', path: path.join(claudeDir, 'settings.json') },
  ];
  for (const { name, path: fp } of keyFiles) {
    const exists = fse.existsSync(fp);
    checks.push({
      name,
      pass: exists,
      detail: exists ? undefined : 'Missing file',
    });
  }

  // Hook executables
  const hooksDir = path.join(claudeDir, 'hooks');
  if (fse.existsSync(hooksDir)) {
    for (const hook of HOOK_FILES) {
      const hp = path.join(hooksDir, hook);
      const exists = fse.existsSync(hp);
      if (exists) {
        const stats = fs.statSync(hp);
        const executable = !!(stats.mode & 0o111);
        checks.push({
          name: `.claude/hooks/${hook}`,
          pass: executable,
          detail: executable ? undefined : 'Not executable',
        });
      }
    }
  }

  // JSONL permissions (600)
  const memDir = path.join(claudeDir, 'memory');
  if (fse.existsSync(memDir)) {
    const jsonls = fs.readdirSync(memDir).filter((f) => f.endsWith('.jsonl'));
    for (const j of jsonls) {
      const jp = path.join(memDir, j);
      const stats = fs.statSync(jp);
      const mode = stats.mode & 0o777;
      const secure = mode === 0o600;
      checks.push({
        name: `.claude/memory/${j} (${mode.toString(8)})`,
        pass: secure,
        detail: secure ? undefined : `Expected 600, got ${mode.toString(8)}`,
      });
    }
  }

  return checks;
}
