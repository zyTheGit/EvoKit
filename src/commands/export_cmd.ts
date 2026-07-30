import { Command } from 'commander';
import pc from 'picocolors';

export const exportCommand = new Command('export')
  .description('导出 EvoKit 系统状态用于迁移')
  .action(() => {
    console.log(pc.yellow('⚠️  evokit export 暂不支持 v1.0 格式。'));
    console.log(pc.dim('  请先使用 evokit migrate 转换旧数据，或等待 v1.1 重写。'));
  });
