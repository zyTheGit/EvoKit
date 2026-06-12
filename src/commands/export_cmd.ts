import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import fs from 'node:fs';
import fse from 'fs-extra';
import { spawnSync } from 'node:child_process';
import { buildConfig } from '../core/config.js';
import { rotateJsonlFile, applyConfidenceDecay } from '../core/rotate.js';
import { readJsonlFile } from '../core/memory.js';

export const exportCommand = new Command('export')
  .description('Export EvoKit system state for migration')
  .option('--home <path>', 'Source home directory (default: $HOME)')
  .option('--output <path>', 'Output directory for the tarball (default: ~/Desktop)')
  .option('--dry-run', 'Preview what would be exported')
  .option('--no-rotate', 'Skip rotation of learning files during export')
  .action(async (options) => {
    const config = buildConfig({
      ...options,
      homeDir: options.home,
      dryRun: options.dryRun || false,
    });

    const claudeDir = path.join(config.homeDir, '.claude');
    if (!fse.existsSync(claudeDir)) {
      console.error(pc.red(`Error: EvoKit not initialized at ${claudeDir}`));
      process.exit(1);
    }

    const outDir = options.output || path.join(config.homeDir, 'Desktop');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const tarballName = `evokit-export-${timestamp}.tar.gz`;
    const tarballPath = path.resolve(outDir, tarballName);

    console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
    console.log(pc.cyan('║   EvoKit — System Export                  ║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
    console.log(`  Source: ${claudeDir}`);
    console.log(`  Output: ${tarballPath}${config.dryRun ? pc.yellow(' (DRY RUN)') : ''}`);
    console.log('');

    // Staging directory
    const stagingDir = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'evokit-export-'));
    const exportDir = path.join(stagingDir, 'claude-evolution');

    try {
      // 1. Copy system files
      console.log(pc.cyan('📁 Copying system files...'));
      const itemsToCopy = ['rules', 'agents', 'commands', 'memory', 'hooks', 'settings.json', 'settings.local.json', 'MEMORY.md'];
      for (const item of itemsToCopy) {
        const src = path.join(claudeDir, item);
        const dst = path.join(exportDir, item);
        if (fse.existsSync(src)) {
          if (!config.dryRun) {
            fse.copySync(src, dst, {
              filter: (srcPath) => {
                // Skip archive directory in export
                return !srcPath.includes('/archive/');
              },
            });
          }
        }
      }

      // Copy root CLAUDE.md
      const rootClaudeMd = path.join(config.homeDir, 'CLAUDE.md');
      if (fse.existsSync(rootClaudeMd) && !config.dryRun) {
        fse.copySync(rootClaudeMd, path.join(exportDir, '..', 'CLAUDE.md'));
      }

      // 2. Data summary
      console.log(pc.cyan('\n📊 Data summary...'));
      const memDir = path.join(claudeDir, 'memory');
      const jsonlFiles = ['corrections.jsonl', 'observations.jsonl', 'sessions.jsonl', 'violations.jsonl'];
      for (const file of jsonlFiles) {
        const fp = path.join(memDir, file);
        if (fse.existsSync(fp)) {
          const entries = readJsonlFile(fp);
          console.log(`  ${pc.green('✓')} ${file}: ${entries.length} entries`);
        }
      }

      // 3. Rotation (optional, default: on)
      if (options.rotate !== false) {
        console.log(pc.cyan('\n🔄 Rotating learning files (on staging copy)...'));
        const exportMemDir = path.join(exportDir, 'memory');
        if (fse.existsSync(exportMemDir)) {
          // Temporarily override homeDir for rotation to act on staging
          const stagingConfig = { ...config, homeDir: stagingDir, dryRun: config.dryRun };
          // Manually construct staging .claude path
          const stagingClaudeDir = path.join(stagingDir, 'claude-evolution');
          const origClaudeDir = claudeDir;

          // Override memory.ts getClaudeDir behavior by directly operating on files
          for (const file of ['corrections.jsonl', 'observations.jsonl']) {
            const srcFile = path.join(exportMemDir, file);
            if (fse.existsSync(srcFile)) {
              const data = fs.readFileSync(srcFile, 'utf-8');
              const lines = data.split('\n').filter(Boolean);
              if (lines.length > (config.maxLines ?? 500) && !config.dryRun) {
                const maxDays = config.maxDays ?? 30;
                const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;
                const recent = lines.filter((l) => {
                  try {
                    const entry = JSON.parse(l);
                    return !entry.timestamp || new Date(entry.timestamp).getTime() >= cutoff;
                  } catch { return true; }
                });
                fs.writeFileSync(srcFile, recent.join('\n') + '\n', 'utf-8');
                console.log(`  ${pc.green('✓')} Rotated ${file}: ${lines.length} → ${recent.length} entries`);
              }
            }
          }
        }
      }

      // 4. Generate install.sh for the export package
      console.log(pc.cyan('\n📄 Generating install scripts...'));
      const installShPath = path.join(stagingDir, 'install.sh');
      const installScript = generateInstallScript(config.homeDir);
      if (!config.dryRun) {
        fs.writeFileSync(installShPath, installScript, 'utf-8');
        fs.chmodSync(installShPath, 0o755);
        // Generate install.bat as well
        const installBatPath = path.join(stagingDir, 'install.bat');
        fs.writeFileSync(installBatPath, generateInstallBat(), 'utf-8');
      }
      console.log(`  ${pc.green('✓')} install.sh generated`);

      // 5. Package tarball
      console.log(pc.cyan('\n📦 Packaging tarball...'));
      if (!config.dryRun) {
        fse.ensureDirSync(outDir);
        const tarResult = spawnSync('tar', [
          'czf', tarballPath,
          '-C', stagingDir,
          'claude-evolution',
          'install.sh',
          'install.bat',
        ], { stdio: 'pipe' });

        if (tarResult.status !== 0) {
          console.error(pc.red(`Error creating tarball: ${tarResult.stderr.toString()}`));
          process.exit(1);
        }

        const stats = fs.statSync(tarballPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`  ${pc.green('✓')} Exported: ${tarballPath} (${sizeMB} MB)`);
      } else {
        console.log(`  ${pc.green('✓')} (dry run) Tarball would be created at: ${tarballPath}`);
      }

      // Cleanup
      fse.removeSync(stagingDir);

      console.log('');
      if (config.dryRun) {
        console.log(pc.green('✅ Dry run complete — no files were modified'));
      } else {
        console.log(pc.green('✅ Export complete!'));
        console.log(`  Transfer the tarball to the target machine and run:`);
        console.log(`  ${pc.cyan(`  evokit import ${tarballPath}`)}`);
        console.log(`  Or extract and run: tar xzf ${tarballName} && bash install.sh`);
      }
      console.log('');
    } catch (err: any) {
      fse.removeSync(stagingDir);
      console.error(pc.red(`\n❌ Export failed: ${err.message}`));
      process.exit(1);
    }
  });

function generateInstallScript(oldHome: string): string {
  return `#!/bin/bash
# EvoKit — Migration Installer
# Generated by evokit export
set -e

OLD_HOME="${oldHome}"
CLAUDE_DIR="\${HOME}/.claude"
BACKUP_DIR="\${CLAUDE_DIR}/backups/migration-\$(date +%Y%m%d_%H%M%S)"

echo "╔═══════════════════════════════════════════╗"
echo "║   EvoKit — Migration Import               ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "  Source: \${OLD_HOME}"
echo "  Target: \${HOME}"
echo ""

# Backup existing config
if [ -d "\${CLAUDE_DIR}" ]; then
  echo "📦 Backing up existing configuration..."
  mkdir -p "\${BACKUP_DIR}"
  cp -r "\${CLAUDE_DIR}" "\${BACKUP_DIR}/"
  echo "  ✓ Backed up to \${BACKUP_DIR}"
fi

# Copy files
echo "📁 Installing system files..."
SCRIPT_DIR="\$(cd "\$(dirname "\$0")" && pwd)"
for dir in rules agents commands memory hooks; do
  if [ -d "\${SCRIPT_DIR}/claude-evolution/\${dir}" ]; then
    mkdir -p "\${CLAUDE_DIR}/\${dir}"
    cp -r "\${SCRIPT_DIR}/claude-evolution/\${dir}/"* "\${CLAUDE_DIR}/\${dir}/"
    echo "  ✓ .claude/\${dir}/"
  fi
done

# Copy key files
for f in settings.json settings.local.json MEMORY.md; do
  if [ -f "\${SCRIPT_DIR}/claude-evolution/\${f}" ]; then
    cp "\${SCRIPT_DIR}/claude-evolution/\${f}" "\${CLAUDE_DIR}/"
    echo "  ✓ \${f}"
  fi
done

# Fix paths
if command -v python3 &>/dev/null; then
  python3 -c "
import os, re
home = os.environ['HOME']
old_home = '${oldHome}'

for root, dirs, files in os.walk(os.path.expanduser('~/.claude')):
    for f in files:
        if f.endswith(('.json', '.sh', '.md')):
            fp = os.path.join(root, f)
            try:
                content = open(fp).read()
                if old_home in content:
                    content = content.replace(old_home, home)
                    open(fp, 'w').write(content)
                    print(f'  ✓ Fixed paths in: {f}')
            except:
                pass
"
fi

# Permissions
chmod +x \${CLAUDE_DIR}/hooks/*.sh 2>/dev/null || true
chmod 600 \${CLAUDE_DIR}/memory/*.jsonl 2>/dev/null || true

echo ""
echo "✅ Migration complete!"
echo "  Start Claude Code and run /boot to verify."
echo ""
`;
}

function generateInstallBat(): string {
  return `@echo off
REM EvoKit — Migration Installer (Windows)
echo EvoKit Migration Import
echo.
echo Please run install.sh in WSL or Git Bash.
echo For native Windows, manually copy the claude-evolution/ directory to %%USERPROFILE%%\\.claude\\
`;
}
