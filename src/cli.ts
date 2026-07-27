#!/usr/bin/env node
/**
 * EvoKit CLI 入口
 *
 * 注册所有内置适配器并暴露以下命令：
 *   evokit install     — 为一个或多个 AI 编程助手安装 EvoKit
 *   evokit uninstall   — 为 AI 编程助手卸载 EvoKit
 *   evokit init        — install 的别名（向后兼容）
 *   evokit project     — 在项目目录中生成 AI 助手规范文件
 *   evokit doctor      — 系统健康检查
 *   evokit evolve      — 运行演化审计
 *   evokit export      — 导出学习数据
 *   evokit import      — 导入学习数据
 *
 * @packageDocumentation
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';

// 注册所有内置适配器（副作用导入）
import './adapters/index.js';

import { installCommand } from './install.js';
import { initCommand } from './commands/init.js';
import { projectCommand } from './commands/project.js';
import { evolveCommand } from './commands/evolve.js';
import { exportCommand } from './commands/export_cmd.js';
import { importCommand } from './commands/import_cmd.js';
import { doctorCommand } from './commands/doctor.js';
import { uninstallCommand } from './commands/uninstall.js';
import { updateCommand } from './commands/update.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();

program
  .name('evokit')
  .description('EvoKit — AI 编程助手的自演化系统框架')
  .version(pkg.version)
  .addHelpText(
    'after',
    `
命令说明：
  install <适配器>     安装 EvoKit 到指定 AI 编程助手（claude | codex | opencode | pi）
  uninstall <适配器>   卸载指定 AI 编程助手的 EvoKit
  update [适配器]      更新已安装适配器的模板文件（hooks、rules、commands、agents、skills）
  init                 install 的别名（向后兼容）
  project              在项目目录中生成 .claude/ 规范文件（规则、代理、命令）
  doctor               验证 EvoKit 系统完整性（钩子、清单、文件结构）
  evolve               运行演化审计 — 提升纠正为规则、清理过期规则
  export               导出 EvoKit 系统状态为迁移压缩包
  import <压缩包>      从迁移压缩包导入 EvoKit 系统状态

快速上手：
  evokit install claude          安装 EvoKit 到 Claude Code
  evokit install                 交互式选择要安装的 AI 助手
  evokit update                  更新所有适配器的模板文件
  evokit uninstall claude        卸载 Claude Code 的 EvoKit
  evokit doctor                  检查系统健康状态
  evokit project                 在当前项目生成规范文件

详细帮助：
  evokit <command> --help        查看子命令的完整选项和示例`,
  );

program.addCommand(installCommand);
program.addCommand(initCommand);
program.addCommand(updateCommand);
program.addCommand(projectCommand);
program.addCommand(evolveCommand);
program.addCommand(exportCommand);
program.addCommand(importCommand);
program.addCommand(doctorCommand);
program.addCommand(uninstallCommand);

// 无参数时显示帮助
if (process.argv.length <= 2) {
  program.outputHelp();
} else {
  program.parse(process.argv);
}
