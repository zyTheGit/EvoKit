// commands 汇总导出：按命令族拆分后的统一入口
// 使用方式：import { initGlobal, syncGlobal, ... } from './src/commands/index.js'

export { initGlobal, initProject } from './init.js';
export { syncGlobal, syncProject, syncResources } from './sync.js';
export { check } from './check.js';
export { status } from './status.js';
export { uninstallGlobal, uninstallProject } from './uninstall.js';
export { listAgents, listResources } from './list.js';
export { inventory } from './inventory.js';
export { help } from './help.js';
