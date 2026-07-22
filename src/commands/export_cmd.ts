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
  .description('导出 EvoKit 系统状态用于迁移')
  .option('--home <path>', '源主目录（默认: $HOME）')
  .option('--output <path>', '输出目录（默认: ~/Desktop）')
  .option('--dry-run', '预览导出内容')
  .option('--no-rotate', '导出时跳过学习文件轮转')
  .action(async (options) => {
    const config = buildConfig({
      ...options,
      homeDir: options.home,
      dryRun: options.dryRun || false,
    });

    const claudeDir = path.join(config.homeDir, '.claude');
    if (!fse.existsSync(claudeDir)) {
      console.error(pc.red(`错误：EvoKit 未在 ${claudeDir} 初始化`));
      process.exit(1);
    }

    const outDir = options.output || path.join(config.homeDir, 'Desktop');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const tarballName = `evokit-export-${timestamp}.tar.gz`;
    const tarballPath = path.resolve(outDir, tarballName);

    console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
    console.log(pc.cyan('║   EvoKit — 系统导出                      ║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
    console.log(`  源目录: ${claudeDir}`);
    console.log(`  输出: ${tarballPath}${config.dryRun ? pc.yellow('（试运行）') : ''}`);
    console.log('');

    // 临时暂存目录
    const stagingDir = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'evokit-export-'));
    const exportDir = path.join(stagingDir, 'claude-evolution');

    try {
      // 1. 复制系统文件
      console.log(pc.cyan('📁 复制系统文件...'));
      const itemsToCopy = [
        'rules',
        'agents',
        'commands',
        'memory',
        'hooks',
        'settings.json',
        'settings.local.json',
        'MEMORY.md',
      ];
      for (const item of itemsToCopy) {
        const src = path.join(claudeDir, item);
        const dst = path.join(exportDir, item);
        if (fse.existsSync(src)) {
          if (!config.dryRun) {
            fse.copySync(src, dst, {
              filter: (srcPath) => {
                // 跳过归档目录
                return !srcPath.includes('/archive/');
              },
            });
          }
        }
      }

      // 复制根目录 CLAUDE.md
      const rootClaudeMd = path.join(config.homeDir, 'CLAUDE.md');
      if (fse.existsSync(rootClaudeMd) && !config.dryRun) {
        fse.copySync(rootClaudeMd, path.join(exportDir, '..', 'CLAUDE.md'));
      }

      // 2. 数据摘要
      console.log(pc.cyan('\n📊 数据摘要...'));
      const memDir = path.join(claudeDir, 'memory');
      const jsonlFiles = [
        'corrections.jsonl',
        'observations.jsonl',
        'sessions.jsonl',
        'violations.jsonl',
      ];
      for (const file of jsonlFiles) {
        const fp = path.join(memDir, file);
        if (fse.existsSync(fp)) {
          const entries = readJsonlFile(fp);
          console.log(`  ${pc.green('✓')} ${file}：${entries.length} 条`);
        }
      }

      // 3. 轮转（可选，默认开启）
      if (options.rotate !== false) {
        console.log(pc.cyan('\n🔄 轮转学习文件（在暂存副本上）...'));
        const exportMemDir = path.join(exportDir, 'memory');
        if (fse.existsSync(exportMemDir)) {
          // 临时覆盖 homeDir，使轮转作用于暂存目录
          const stagingConfig = { ...config, homeDir: stagingDir, dryRun: config.dryRun };
          // 手动构建暂存 .claude 路径
          const stagingClaudeDir = path.join(stagingDir, 'claude-evolution');
          const origClaudeDir = claudeDir;

          // 覆盖 memory.ts getClaudeDir 行为，直接操作文件
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
                  } catch {
                    return true;
                  }
                });
                fs.writeFileSync(srcFile, recent.join('\n') + '\n', 'utf-8');
                console.log(
                  `  ${pc.green('✓')} 已轮转 ${file}：${lines.length} → ${recent.length} 条`,
                );
              }
            }
          }
        }
      }

      // 4. 生成安装脚本
      console.log(pc.cyan('\n📄 生成安装脚本...'));
      const installShPath = path.join(stagingDir, 'install.sh');
      const installScript = generateInstallScript(config.homeDir);
      if (!config.dryRun) {
        fs.writeFileSync(installShPath, installScript, 'utf-8');
        fs.chmodSync(installShPath, 0o755);
        // 同时生成 install.bat
        const installBatPath = path.join(stagingDir, 'install.bat');
        fs.writeFileSync(installBatPath, generateInstallBat(), 'utf-8');
      }
      console.log(`  ${pc.green('✓')} install.sh 已生成`);

      // 5. 打包
      console.log(pc.cyan('\n📦 打包中...'));
      if (!config.dryRun) {
        fse.ensureDirSync(outDir);
        const tarResult = spawnSync(
          'tar',
          ['czf', tarballPath, '-C', stagingDir, 'claude-evolution', 'install.sh', 'install.bat'],
          { stdio: 'pipe' },
        );

        if (tarResult.status !== 0) {
          console.error(pc.red(`错误：创建压缩包失败：${tarResult.stderr.toString()}`));
          process.exit(1);
        }

        const stats = fs.statSync(tarballPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`  ${pc.green('✓')} 已导出：${tarballPath}（${sizeMB} MB）`);
      } else {
        console.log(`  ${pc.green('✓')}（试运行）压缩包将创建于：${tarballPath}`);
      }

      // 清理
      fse.removeSync(stagingDir);

      console.log('');
      if (config.dryRun) {
        console.log(pc.green('✅ 试运行完成 — 未修改任何文件'));
      } else {
        console.log(pc.green('✅ 导出完成！'));
        console.log(`  将压缩包传输到目标机器后运行：`);
        console.log(`  ${pc.cyan(`  evokit import ${tarballPath}`)}`);
        console.log(`  或解压后运行：tar xzf ${tarballName} && bash install.sh`);
      }
      console.log('');
    } catch (err: any) {
      fse.removeSync(stagingDir);
      console.error(pc.red(`\n❌ 导出失败：${err.message}`));
      process.exit(1);
    }
  });

function generateInstallScript(oldHome: string): string {
  return `#!/bin/bash
# EvoKit — 迁移安装脚本
# 由 evokit export 生成
set -e

OLD_HOME="${oldHome}"
CLAUDE_DIR="\${HOME}/.claude"
BACKUP_DIR="\${CLAUDE_DIR}/backups/migration-$(date +%Y%m%d_%H%M%S)"

echo "╔═══════════════════════════════════════════╗"
echo "║   EvoKit — 迁移导入                       ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "  源目录: \${OLD_HOME}"
echo "  目标: \${HOME}"
echo ""

# 备份现有配置
if [ -d "\${CLAUDE_DIR}" ]; then
  echo "📦 备份现有配置..."
  mkdir -p "\${BACKUP_DIR}"
  cp -r "\${CLAUDE_DIR}" "\${BACKUP_DIR}/"
  echo "  ✓ 已备份至 \${BACKUP_DIR}"
fi

# 复制文件
echo "📁 安装系统文件..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
for dir in rules agents commands memory hooks; do
  if [ -d "\${SCRIPT_DIR}/claude-evolution/\${dir}" ]; then
    mkdir -p "\${CLAUDE_DIR}/\${dir}"
    cp -r "\${SCRIPT_DIR}/claude-evolution/\${dir}/"* "\${CLAUDE_DIR}/\${dir}/"
    echo "  ✓ .claude/\${dir}/"
  fi
done

# 复制关键文件
for f in settings.json settings.local.json MEMORY.md; do
  if [ -f "\${SCRIPT_DIR}/claude-evolution/\${f}" ]; then
    cp "\${SCRIPT_DIR}/claude-evolution/\${f}" "\${CLAUDE_DIR}/"
    echo "  ✓ \${f}"
  fi
done

# 修复路径
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
                    print(f'  ✓ 已修复路径: {f}')
            except:
                pass
"
fi

# 权限
chmod +x \${CLAUDE_DIR}/hooks/*.sh 2>/dev/null || true
chmod 600 \${CLAUDE_DIR}/memory/*.jsonl 2>/dev/null || true

echo ""
echo "✅ 迁移完成！"
echo "  启动 Claude Code 并运行 /boot 验证。"
echo ""
`;
}

function generateInstallBat(): string {
  return `@echo off
REM EvoKit — 迁移安装脚本（Windows）
echo EvoKit 迁移导入
echo.
echo 请在 WSL 或 Git Bash 中运行 install.sh。
echo 原生 Windows 请手动将 claude-evolution/ 目录复制到 %%USERPROFILE%%\\.claude\\
`;
}
