import { Command } from 'commander';
import pc from 'picocolors';

export const importCommand = new Command('import')
  .description('从迁移包导入 EvoKit 系统状态')
  .argument('[package]', '迁移压缩包路径（.tar.gz）')
  .action(() => {
    console.log(pc.yellow('⚠️  evokit import 暂不支持 v1.0 格式。'));
    console.log(pc.dim('  请先使用 evokit migrate 转换旧数据，或等待 v1.1 重写。'));
  });
