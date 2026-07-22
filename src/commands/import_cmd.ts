import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import fs from 'node:fs';
import fse from 'fs-extra';
import { spawnSync } from 'node:child_process';
import { buildConfig } from '../core/config.js';
import { readJsonlFile } from '../core/memory.js';

export const importCommand = new Command('import')
  .description('从迁移包导入 EvoKit 系统状态')
  .argument('<package>', '迁移压缩包路径（.tar.gz）')
  .option('--home <path>', '目标主目录（默认: $HOME）')
  .option('--dry-run', '预览导入内容')
  .option('--no-backup', '跳过现有配置备份')
  .action(async (pkg, options) => {
    const homeDir = options.home || process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) {
      console.error(pc.red('错误：无法确定主目录。'));
      process.exit(1);
    }

    const config = buildConfig({
      homeDir,
      dryRun: options.dryRun || false,
    });

    const claudeDir = path.join(homeDir, '.claude');
    const tarballPath = path.resolve(pkg);

    console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
    console.log(pc.cyan('║   EvoKit — 系统导入                      ║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
    console.log(`  压缩包: ${tarballPath}`);
    console.log(`  目标:  ${homeDir}${config.dryRun ? pc.yellow('（试运行）') : ''}`);
    console.log('');

    // 验证压缩包
    if (!fse.existsSync(tarballPath)) {
      console.error(pc.red(`错误：压缩包未找到：${tarballPath}`));
      process.exit(1);
    }
    if (!tarballPath.endsWith('.tar.gz') && !tarballPath.endsWith('.tgz')) {
      console.error(pc.red('错误：压缩包必须是 .tar.gz 文件'));
      process.exit(1);
    }

    // 解压到暂存目录
    const stagingDir = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'evokit-import-'));
    try {
      console.log(pc.cyan('📦 解压压缩包...'));
      const extractResult = spawnSync('tar', ['xzf', tarballPath, '-C', stagingDir], {
        stdio: 'pipe',
      });
      if (extractResult.status !== 0) {
        console.error(pc.red(`错误：解压失败：${extractResult.stderr.toString()}`));
        process.exit(1);
      }
      console.log(`  ${pc.green('✓')} 已解压到暂存目录`);

      // 检测导出结构
      const stagingContents = fs.readdirSync(stagingDir);
      const exportDir = stagingContents.find(
        (d) => d === 'claude-evolution' && fs.statSync(path.join(stagingDir, d)).isDirectory(),
      );

      if (!exportDir) {
        console.error(pc.red('错误：无效的导出包 — 缺少 claude-evolution/ 目录'));
        process.exit(1);
      }

      const exportPath = path.join(stagingDir, exportDir);

      // 预览导入内容
      console.log(pc.cyan('\n📋 导入预览...'));
      const items = fs.readdirSync(exportPath);
      for (const item of items) {
        const itemPath = path.join(exportPath, item);
        const stats = fs.statSync(itemPath);
        if (stats.isDirectory()) {
          const files = fs.readdirSync(itemPath);
          console.log(`  ${pc.green('✓')} ${item}/（${files.length} 个文件）`);
        } else {
          const sizeKB = (stats.size / 1024).toFixed(1);
          console.log(`  ${pc.green('✓')} ${item} (${sizeKB} KB)`);
        }
      }

      if (config.dryRun) {
        console.log(pc.green('\n✅ 试运行完成 — 未修改任何文件'));
        fse.removeSync(stagingDir);
        return;
      }

      // 备份现有配置
      let backupPath = '';
      if (options.backup !== false && fse.existsSync(claudeDir)) {
        const backupDir = path.join(claudeDir, 'backups');
        fse.ensureDirSync(backupDir);
        backupPath = path.join(
          backupDir,
          `import-pre-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`,
        );
        console.log(pc.cyan('\n📦 备份现有配置...'));
        fse.copySync(claudeDir, backupPath);
        console.log(`  ${pc.green('✓')} 已备份至 ${backupPath}`);
      }

      // 复制文件
      console.log(pc.cyan('\n📁 安装文件...'));
      const subdirs = ['rules', 'agents', 'commands', 'memory', 'hooks'];
      for (const subdir of subdirs) {
        const src = path.join(exportPath, subdir);
        if (fse.existsSync(src)) {
          const dst = path.join(claudeDir, subdir);
          fse.ensureDirSync(dst);
          fse.copySync(src, dst, { overwrite: true });
        }
      }

      // 复制顶层配置文件
      const topFiles = ['settings.json', 'settings.local.json', 'MEMORY.md'];
      for (const file of topFiles) {
        const src = path.join(exportPath, file);
        if (fse.existsSync(src)) {
          fse.copySync(src, path.join(claudeDir, file), { overwrite: true });
        }
      }

      // 修复导入文件中的路径
      console.log(pc.cyan('\n🔧 修复路径...'));
      const oldHome = detectOldHomeFromExport(exportPath);
      if (oldHome && oldHome !== homeDir) {
        console.log(`  替换路径：${oldHome} → ${homeDir}`);
        fixPathsInDir(claudeDir, oldHome, homeDir);
        console.log(`  ${pc.green('✓')} 路径已修复`);
      } else {
        console.log(`  ${pc.green('✓')} 无需修改路径`);
      }

      // 合并 settings.json（如需要）
      const settingsPath = path.join(claudeDir, 'settings.json');
      if (fse.existsSync(settingsPath)) {
        try {
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          // 确保 hooks 配置使用数组格式
          if (settings.hooks && typeof settings.hooks === 'object') {
            for (const [event, config] of Object.entries(settings.hooks)) {
              if (typeof config === 'string') {
                (settings.hooks as any)[event] = [{ matcher: '*', command: config }];
              }
            }
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
            console.log(`  ${pc.green('✓')} settings.json 已规范化`);
          }
        } catch {
          /* 跳过无效 JSON */
        }
      }

      // 设置权限
      console.log(pc.cyan('\n🔒 设置权限...'));
      const hooksDir = path.join(claudeDir, 'hooks');
      if (fse.existsSync(hooksDir)) {
        const hooks = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.sh'));
        for (const hook of hooks) {
          fs.chmodSync(path.join(hooksDir, hook), 0o755);
        }
        console.log(`  ${pc.green('✓')} Hook 脚本：已设为可执行`);
      }
      const memDir = path.join(claudeDir, 'memory');
      if (fse.existsSync(memDir)) {
        const jsonls = fs.readdirSync(memDir).filter((f) => f.endsWith('.jsonl'));
        for (const j of jsonls) {
          fs.chmodSync(path.join(memDir, j), 0o600);
        }
        console.log(`  ${pc.green('✓')} 记忆文件：权限 600`);
      }

      // 清理
      fse.removeSync(stagingDir);

      console.log('');
      console.log(pc.green('✅ 导入完成！'));
      console.log(`  运行 ${pc.cyan('evokit doctor')} 验证系统健康。`);
      console.log('');
    } catch (err: any) {
      fse.removeSync(stagingDir);
      console.error(pc.red(`\n❌ 导入失败：${err.message}`));
      process.exit(1);
    }
  });

function detectOldHomeFromExport(exportPath: string): string | null {
  // 尝试从 install.sh 检测旧主目录路径
  const possibleFiles = [
    path.join(exportPath, '..', 'install.sh'),
    path.join(exportPath, 'settings.json'),
  ];
  for (const fp of possibleFiles) {
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const match = content.match(/OLD_HOME="([^"]+)"/);
      if (match) return match[1];
    } catch {
      /* 继续 */
    }
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
        } catch {
          /* 跳过不可读文件 */
        }
      }
    }
  } catch {
    /* 跳过不可读目录 */
  }
}
