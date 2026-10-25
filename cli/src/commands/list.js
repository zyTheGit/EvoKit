// list 命令：列出支持的 agent / 资源

import { AGENTS_FILE, RESOURCES_FILE } from '../paths.js';
import { loadAgents, loadResources } from '../config.js';

export function listAgents() {
  const agents = loadAgents();
  console.log('EvoKit 支持的 agent 工具：\n');
  console.log(`配置文件：${AGENTS_FILE}\n`);
  for (const a of agents) {
    console.log(`  ${a.id.padEnd(10)} ${a.name.padEnd(14)} 全局: ${a.global}`);
    console.log(`  ${' '.repeat(10)} ${' '.repeat(14)} 项目: ${a.project || '（不支持）'}`);
  }
  console.log('\n新增 agent：编辑 agents.json 加一条 {id,name,global,project} 即可，无需改代码。');
  console.log('字段说明：global=全局入口路径（支持 ~），project=项目入口相对路径（可选）。');
}

export function listResources() {
  const resources = loadResources();
  console.log('EvoKit 管理的资源：\n');
  console.log(`配置文件：${RESOURCES_FILE}\n`);
  for (const r of resources) {
    console.log(`  ${r.id.padEnd(14)} type: ${r.type.padEnd(8)} 源: ${r.source}`);
    for (const t of r.targets) {
      console.log(`  ${' '.repeat(14)} ${' '.repeat(8)}   → ${t}`);
    }
  }
  console.log('\n新增资源：编辑 resources.json 加一条 {id,type,source,targets} 即可，无需改代码。');
  console.log('type 字段：text=文本托管块（写文件），symlink=软链接（一处改动多处实时生效），remote=远程 URL 拉取。');
}
