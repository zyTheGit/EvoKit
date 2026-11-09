// 命令用法文档（网页端「命令执行」页数据源，单一事实源）
// 纪律：
//   1. 键集合必须与 exec.js 的 EXEC_WHITELIST 一一对应（15 条），多或少都会被测试抓住
//   2. 内容与 cli/README.md、`evokit help` 输出保持同步；改动命令参数时三处一起改
//   3. examples 为完整命令串（evokit 开头），前端点击可回填参数框

import { EXEC_WHITELIST } from './exec.js';

export const COMMAND_DOCS = {
  check: {
    summary: '检查各入口托管块与源的一致性，附带 ctxlint 内容健康检查（辅助，不阻塞）',
    usage: 'evokit check [--agent <id>]　或　evokit check <agentid>',
    flags: [
      { name: '--agent <id>', alias: '-a', desc: '只检查指定 agent（逗号分隔多选，如 claude,pi）；不写则检查全部' },
      { name: '--project', alias: '-p', desc: '检查当前项目 .evokit/ 的项目级一致性（而非个人全局）' },
      { name: '--debug', desc: '开启统一调试日志（写入 stderr，不影响 stdout）' },
    ],
    examples: ['evokit check', 'evokit check pi', 'evokit check --project'],
    notes: '入口都尚未同步时会主动提示 init/sync 下一步；ctxlint 因 npm 环境异常跑不起来时只给一行提示并跳过。',
  },
  status: {
    summary: '查看各 agent 入口的同步状态（一致 / 漂移 / 未托管）',
    usage: 'evokit status [--agent <id>]　或　evokit status <agentid>',
    flags: [
      { name: '--agent <id>', alias: '-a', desc: '只查看指定 agent（逗号分隔多选）' },
      { name: '--project', alias: '-p', desc: '查看当前项目各入口的状态' },
      { name: '--debug', desc: '开启统一调试日志' },
    ],
    examples: ['evokit status', 'evokit status claude,codex'],
    notes: '与网页「同步状态」面板同口径；需要修复漂移时执行 evokit sync。',
  },
  agents: {
    summary: '列出 settings.json 中配置的全部 agent 工具（同步目标 + CLI 调用配置）',
    usage: 'evokit agents',
    flags: [
      { name: '--debug', desc: '开启统一调试日志' },
    ],
    examples: ['evokit agents'],
    notes: '新增 agent 无需改代码：在 settings.json 的 agents 块加一条即可（详见 cli/README）。',
  },
  resources: {
    summary: '列出当前管理的全部资源（text 托管块 / symlink 软链接 / remote 远程拉取）',
    usage: 'evokit resources',
    flags: [
      { name: '--debug', desc: '开启统一调试日志' },
    ],
    examples: ['evokit resources'],
    notes: 'knowledge-index 是隐式内置资源（未写入 settings.json 也会生效），enabled:false 可显式关闭。',
  },
  recall: {
    summary: '本地知识检索：tags 全等 ×3 ＞ 标题子串 ×2 ＞ 正文子串 ×1，同分按引用数、更新时间决胜',
    usage: 'evokit recall "<关键词>" [--limit n] [--json]',
    flags: [
      { name: '--limit <n>', desc: '只显示前 n 条（默认 10）' },
      { name: '--json', desc: 'stdout 只输出一个 JSON 数组（供程序/AI 消费）' },
      { name: '<关键词>', desc: '位置参数：多词以空格分词，任一词命中即入围，取最高分词得分' },
    ],
    examples: ['evokit recall "软链接"', 'evokit recall "sync" --limit 5', 'evokit recall "fnm" --json'],
    notes: '每次展示命中会向 references.jsonl 写入 recall 事件（网页浏览检索不写，避免污染统计）；检索范围仅 confirmed 卡。',
  },
  help: {
    summary: '打印完整用法帮助（全部命令与通用选项）',
    usage: 'evokit help　或　evokit -h',
    flags: [],
    examples: ['evokit help'],
    notes: '打错命令名时会按编辑距离猜测并提示正确写法。',
  },
  sync: {
    summary: '把源内容同步到入口托管块（context + knowledge-index 合并进同一托管块）',
    usage: 'evokit sync [--resource <id>] [--agent <id>] [--project]',
    flags: [
      { name: '--resource <id>', alias: '-r', desc: '只同步指定资源（逗号分隔多选，如 context,my-skill）' },
      { name: '--agent <id>', alias: '-a', desc: '只同步到指定 agent（逗号分隔多选）' },
      { name: '--project', alias: '-p', desc: '同步当前项目 .evokit/ 规则到项目入口' },
      { name: '--debug', desc: '开启统一调试日志' },
    ],
    examples: ['evokit sync', 'evokit sync -a claude', 'evokit sync -r context'],
    notes: '只写 EvoKit 托管块，块外用户内容永远原样保留；review 入库后会自动同步索引，一般无需手动 sync。',
  },
  review: {
    summary: '待审草稿清单与裁决（accept 入库 / reject 拒绝 / merge 合并 / 技能草稿处理）',
    usage: 'evokit review　（无参数 = 列出待审草稿）',
    flags: [
      { name: '--accept <id>', desc: '草稿通过入库：重建索引 + git commit + 自动分发索引到三入口' },
      { name: '--reject <id>', desc: '拒绝草稿：移入 knowledge/.rejected/（保留不删除）' },
      { name: '--merge <id> <into>', desc: '合并卡片：双草稿为原地合并（canonical 留审）；草稿→已入库走入库路径' },
      { name: '--skill', desc: '列出待过目的技能草稿（forge 产出）' },
      { name: '--skill-accept <name>', desc: '通过技能草稿：symlink 分发到各工具技能目录' },
      { name: '--skill-veto <name>', desc: '否决技能草稿' },
      { name: '--audit', desc: 'forge 试用期审计：trial 满期退役 / 父卡失效提示重审' },
    ],
    examples: ['evokit review', 'evokit review --accept <草稿id>', 'evokit review --reject <草稿id>', 'evokit review --merge <id> <into>'],
    notes: 'accept/merge 会产生实际改动（索引重建、知识根 git 提交、三入口自动分发）；双草稿合并不触发分发。',
  },
  knowledge: {
    summary: '知识根管理：init 初始化（目录树 + 索引骨架 + git init + 环境体检）、gc 归档失效卡',
    usage: 'evokit knowledge init　｜　evokit knowledge gc [--before <YYYY-MM-DD>] [--dry-run]',
    flags: [
      { name: 'init', desc: '初始化知识根（已存在时安全跳过）' },
      { name: 'gc', desc: '把 retired / validUntil 过期的卡移入 .archive/，清理 .rejected 超期文件，重建索引并独立 git commit' },
      { name: '--before <日期>', desc: 'gc 清理 .rejected 中 mtime 早于该日期的文件（默认今天）' },
      { name: '--dry-run', desc: 'gc 只列表不改动' },
    ],
    examples: ['evokit knowledge init', 'evokit knowledge gc --dry-run', 'evokit knowledge gc'],
    notes: 'gc 属归档式清理（不物理删除知识卡）；首次运行 learn 前必须先 knowledge init。',
  },
  harvest: {
    summary: '采集各源新会话到 inbox（增量 + 自动脱敏：密钥/内网信息不进库）',
    usage: 'evokit harvest [--full] [--source <id>] [--dry-run]',
    flags: [
      { name: '--full', desc: '全量重新采集（默认增量：按水位线只收新会话）' },
      { name: '--source <id>', desc: '只采集指定源（如 claude-sessions / pi-sessions）' },
      { name: '--dry-run', desc: '只统计不落盘' },
    ],
    examples: ['evokit harvest', 'evokit harvest --source pi-sessions', 'evokit harvest --full --dry-run'],
    notes: '源清单在 settings.json 的 sources 块配置；采集不动知识库，入库要经 learn → review。',
  },
  learn: {
    summary: '采集 → 提纯 → 按档位处理草稿（提纯委托本机 agent CLI，产生 LLM 费用）',
    usage: 'evokit learn [--no-distill] [--agent <id>] [--session <id>] [--auto | --assist]',
    flags: [
      { name: '--auto', desc: '全自动档：草稿直接入库并分发（无人审）' },
      { name: '--assist', desc: '半自动档：置信度达 autoThreshold（默认 0.9）的自动入库，其余留审' },
      { name: '--agent <id>', desc: '显式指定提纯执行者（默认 codex→pi 降级链，claude 不进自动链）' },
      { name: '--session <id>', desc: '只提纯指定会话' },
      { name: '--no-distill', desc: '只 harvest 不提纯' },
    ],
    examples: ['evokit learn', 'evokit learn --assist', 'evokit learn --no-distill'],
    notes: '⚠ 首次运行（distill 水位线未建立）会提纯 inbox 全部积压，LLM 调用量大、耗时可能几十分钟；此后按水位线只提纯新增。manual 档（默认）产出草稿进 .pending 等人工 review。',
  },
  forge: {
    summary: '把达标的同类知识卡聚簇锻造成单文件技能草稿（trial 试用制，人工过目后分发）',
    usage: 'evokit forge [--from-tags a,b] [--topic "…"] [--agent <id>] [--audit]',
    flags: [
      { name: '--from-tags a,b', desc: '按标签取卡聚簇（Jaccard ≥ 0.5，≥ 3 张达标）' },
      { name: '--topic "…"', desc: '按主题关键词取卡锻造' },
      { name: '--agent <id>', desc: '显式指定生成执行者（默认 codex→pi 降级链）' },
      { name: '--audit', desc: '试用期审计：trial 超 30 天且 0 使用退役；vetoed 提示；父卡失效提示重审' },
    ],
    examples: ['evokit forge', 'evokit forge --from-tags 知识库,体检', 'evokit forge --audit'],
    notes: '产出写到 ~/.agents/skills/<name>/（附 generation.json，review.status: trial）；通过 review --skill-accept 分发。',
  },
  inventory: {
    summary: '盘点知识库 + 委托 agent 找冗余（重复/冲突/过期断链/可清理缓存），报告导出 reports/',
    usage: 'evokit inventory [--agent <id>] [--prompt] [--output <file>] [--no-output]',
    flags: [
      { name: '--agent <id>', alias: '-a', desc: '只让指定 agent 整理（逗号分隔多选；默认全部可用 CLI 各出一份）' },
      { name: '--prompt', desc: '只生成通用整理 prompt，不调 CLI（调试用）' },
      { name: '--output <file>', alias: '-o', desc: '报告导出到指定 .md（覆盖默认目录）' },
      { name: '--no-output', desc: '禁用导出，只在终端回显' },
    ],
    examples: ['evokit inventory', 'evokit inventory --agent pi', 'evokit inventory --prompt'],
    notes: '调用真实 LLM（每个可用 agent 各一份报告）；默认导出到 ~/.evokit/reports/（网页「报告库」可在线阅读）。',
  },
  schedule: {
    summary: '每日定时学习：注册 / 取消 / 查看（Windows 任务计划 / macOS launchd / Linux cron）',
    usage: 'evokit schedule enable [--time HH:MM] [--mode auto|assist] [--task <name>]　｜　disable　｜　list',
    flags: [
      { name: 'enable', desc: '注册每日任务（默认 EvoKit Learn / 02:00 / auto，幂等覆盖）' },
      { name: '--time HH:MM', desc: '每日触发时间（默认 02:00）' },
      { name: '--mode auto|assist', desc: '定时学习档位（默认 auto）' },
      { name: '--task <name>', desc: '任务名（需以 EvoKit 开头）' },
      { name: 'disable [--task]', desc: '取消并清理包装脚本' },
      { name: 'list [--task] [--json]', desc: '查看已注册任务与状态' },
    ],
    examples: ['evokit schedule enable --time 03:00 --mode assist', 'evokit schedule list', 'evokit schedule disable'],
    notes: '⚠ 每日到点真实执行 learn，产生 LLM 费用；首次定时运行会提纯 inbox 全部积压。注册的包装脚本在 ~/.evokit/schedule/。',
  },
  uninstall: {
    summary: '移除 EvoKit 托管块，恢复入口文件（块外用户内容永远原样保留）',
    usage: 'evokit uninstall [--agent <id>] [--project]',
    flags: [
      { name: '--agent <id>', alias: '-a', desc: '只卸载指定 agent 的托管块' },
      { name: '--project', alias: '-p', desc: '卸载当前项目入口的托管块' },
    ],
    examples: ['evokit uninstall', 'evokit uninstall -a claude'],
    notes: '幂等操作：只移除托管块本身，不会动 ~/.evokit 数据与知识库。',
  },
};

/** 组装下发形态：叠加 tier + 校验与白名单一一对应（多键/缺键视为数据缺陷） */
export function getCommandDocs() {
  const whitelistKeys = Object.keys(EXEC_WHITELIST).sort();
  const docsKeys = Object.keys(COMMAND_DOCS).sort();
  const mismatch = whitelistKeys.filter((k) => !docsKeys.includes(k))
    .concat(docsKeys.filter((k) => !whitelistKeys.includes(k)));
  if (mismatch.length > 0) {
    throw new Error(`命令文档与白名单不一致：${mismatch.join('、')}（exec.js 与 command-docs.js 需同步）`);
  }
  const docs = {};
  for (const [cmd, doc] of Object.entries(COMMAND_DOCS)) {
    docs[cmd] = { ...doc, tier: EXEC_WHITELIST[cmd] };
  }
  return docs;
}
