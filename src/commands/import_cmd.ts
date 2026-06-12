import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import fs from 'node:fs';
import fse from 'fs-extra';
import { spawnSync } from 'node:child_process';
import { buildConfig } from '../core/config.js';
import { readJsonlFile } from '../core/memory.js';

export const importCommand = new Command('import')
  .description('Import EvoKit system state from a migration package')
  .argument('<package>', 'Path to the migration tarball (.tar.gz)')
  .option('--home <path>', 'Target home directory (default: $HOME)')
  .option('--dry-run', 'Preview what would be imported')
  .option('--no-backup', 'Skip backup of existing configuration')
  .action(async (pkg, options) => {
    const homeDir = options.home || process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) {
      console.error(pc.red('Error: Could not determine home directory.'));
      process.exit(1);
    }

    const config = buildConfig({
      homeDir,
      dryRun: options.dryRun || false,
    });

    const claudeDir = path.join(homeDir, '.claude');
    const tarballPath = path.resolve(pkg);

    console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
    console.log(pc.cyan('║   EvoKit — System Import                 ║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
    console.log(`  Package: ${tarballPath}`);
    console.log(`  Target:  ${homeDir}${config.dryRun ? pc.yellow(' (DRY RUN)') : ''}`);
    console.log('');

    // Validate package
    if (!fse.existsSync(tarballPath)) {
      console.error(pc.red(`Error: Package not found: ${tarballPath}`));
      process.exit(1);
    }
    if (!tarballPath.endsWith('.tar.gz') && !tarballPath.endsWith('.tgz')) {
      console.error(pc.red('Error: Package must be a .tar.gz file'));
      process.exit(1);
    }

    // Extract to staging
    const stagingDir = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'evokit-import-'));
    try {
      console.log(pc.cyan('📦 Extracting package...'));
      const extractResult = spawnSync('tar', ['xzf', tarballPath, '-C', stagingDir], {
        stdio: 'pipe',
      });
      if (extractResult.status !== 0) {
        console.error(pc.red(`Error extracting package: ${extractResult.stderr.toString()}`));
        process.exit(1);
      }
      console.log(`  ${pc.green('✓')} Extracted to staging`);

      // Detect export structure
      const stagingContents = fs.readdirSync(stagingDir);
      const exportDir = stagingContents.find((d) => d === 'claude-evolution' && fs.statSync(path.join(stagingDir, d)).isDirectory());

      if (!exportDir) {
        console.error(pc.red('Error: Invalid export package — missing claude-evolution/ directory'));
        process.exit(1);
      }

      const exportPath = path.join(stagingDir, exportDir);

      // Preview what will be imported
      console.log(pc.cyan('\n📋 Import preview...'));
      const items = fs.readdirSync(exportPath);
      for (const item of items) {
        const itemPath = path.join(exportPath, item);
        const stats = fs.statSync(itemPath);
        if (stats.isDirectory()) {
          const files = fs.readdirSync(itemPath);
          console.log(`  ${pc.green('✓')} ${item}/ (${files.length} files)`);
        } else {
          const sizeKB = (stats.size / 1024).toFixed(1);
          console.log(`  ${pc.green('✓')} ${item} (${sizeKB} KB)`);
        }
      }

      if (config.dryRun) {
        console.log(pc.green('\n✅ Dry run complete — no files were modified'));
        fse.removeSync(stagingDir);
        return;
      }

      // Backup existing
      let backupPath = '';
      if (options.backup !== false && fse.existsSync(claudeDir)) {
        const backupDir = path.join(claudeDir, 'backups');
        fse.ensureDirSync(backupDir);
        backupPath = path.join(backupDir, `import-pre-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
        console.log(pc.cyan('\n📦 Backing up existing configuration...'));
        fse.copySync(claudeDir, backupPath);
        console.log(`  ${pc.green('✓')} Backed up to ${backupPath}`);
      }

      // Copy files
      console.log(pc.cyan('\n📁 Installing files...'));
      const subdirs = ['rules', 'agents', 'commands', 'memory', 'hooks'];
      for (const subdir of subdirs) {
        const src = path.join(exportPath, subdir);
        if (fse.existsSync(src)) {
          const dst = path.join(claudeDir, subdir);
          fse.ensureDirSync(dst);
          fse.copySync(src, dst, { overwrite: true });
        }
      }

      // Copy top-level config files
      const topFiles = ['settings.json', 'settings.local.json', 'MEMORY.md'];
      for (const file of topFiles) {
        const src = path.join(exportPath, file);
        if (fse.existsSync(src)) {
          fse.copySync(src, path.join(claudeDir, file), { overwrite: true });
        }
      }

      // Fix paths in imported files
      console.log(pc.cyan('\n🔧 Fixing paths...'));
      const oldHome = detectOldHomeFromExport(exportPath);
      if (oldHome && oldHome !== homeDir) {
        console.log(`  Replacing paths: ${oldHome} → ${homeDir}`);
        fixPathsInDir(claudeDir, oldHome, homeDir);
        console.log(`  ${pc.green('✓')} Paths fixed`);
      } else {
        console.log(`  ${pc.green('✓')} No path changes needed`);
      }

      // Merge settings.json if needed
      const settingsPath = path.join(claudeDir, 'settings.json');
      if (fse.existsSync(settingsPath)) {
        try {
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          // Ensure hooks config uses array format
          if (settings.hooks && typeof settings.hooks === 'object') {
            for (const [event, config] of Object.entries(settings.hooks)) {
              if (typeof config === 'string') {
                (settings.hooks as any)[event] = [{ matcher: '*', command: config }];
              }
            }
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
            console.log(`  ${pc.green('✓')} settings.json normalized`);
          }
        } catch { /* skip if invalid JSON */ }
      }

      // Set permissions
      console.log(pc.cyan('\n🔒 Setting permissions...'));
      const hooksDir = path.join(claudeDir, 'hooks');
      if (fse.existsSync(hooksDir)) {
        const hooks = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.sh'));
        for (const hook of hooks) {
          fs.chmodSync(path.join(hooksDir, hook), 0o755);
        }
        console.log(`  ${pc.green('✓')} Hook scripts: executable`);
      }
      const memDir = path.join(claudeDir, 'memory');
      if (fse.existsSync(memDir)) {
        const jsonls = fs.readdirSync(memDir).filter((f) => f.endsWith('.jsonl'));
        for (const j of jsonls) {
          fs.chmodSync(path.join(memDir, j), 0o600);
        }
        console.log(`  ${pc.green('✓')} Memory files: 600`);
      }

      // Cleanup
      fse.removeSync(stagingDir);

      console.log('');
      console.log(pc.green('✅ Import complete!'));
      console.log(`  Run ${pc.cyan('evokit doctor')} to verify system health.`);
      console.log('');
    } catch (err: any) {
      fse.removeSync(stagingDir);
      console.error(pc.red(`\n❌ Import failed: ${err.message}`));
      process.exit(1);
    }
  });

function detectOldHomeFromExport(exportPath: string): string | null {
  // Try to detect old home path from install.sh if bundled
  const possibleFiles = [
    path.join(exportPath, '..', 'install.sh'),
    path.join(exportPath, 'settings.json'),
  ];
  for (const fp of possibleFiles) {
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const match = content.match(/OLD_HOME="([^"]+)"/);
      if (match) return match[1];
    } catch { /* continue */ }
  }
  return null;
}

function fixPathsInDir(dir: string, oldPath: string, newPath: string): void {
  const extensions = ['.json', '.sh', '.md'];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.includes('backups')) {
        fixPathsInDir(fullPath, oldPath, newPath);
      } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.includes(oldPath)) {
            const updated = content.replaceAll(oldPath, newPath);
            fs.writeFileSync(fullPath, updated, 'utf-8');
          }
        } catch { /* skip unreadable files */ }
      }
    }
  } catch { /* skip unreadable dirs */ }
}
