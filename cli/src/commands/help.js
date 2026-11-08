// help 命令：打印用法帮助

export function help() {
  console.log(`EvoKit CLI — 个人多工具偏好同步工具（零依赖）

用法:
  evokit agents             查看支持的 agent 列表
  evokit resources          查看管理的资源列表（文本/软链接）
  evokit inventory          盘点知识库 + 委托 agent 找出冗余（调 claude/pi/codex CLI）
  evokit inventory --agent claude  只让指定 agent 整理（逗号分隔多选）
  evokit inventory --prompt 只生成通用整理 prompt，不调 CLI（调试用）
  evokit inventory --output report.md  报告导出到指定 .md（默认导出到 ~/.evokit/reports/，--project 时为 <cwd>/.evokit/reports/）
  evokit inventory --no-output  禁用导出，只在终端回显
  evokit init               初始化全局源 + settings.json
  evokit init --project     初始化当前项目 .evokit/（context.md + settings.json）
  evokit sync               同步所有资源到所有 agent
  evokit sync --resource <id>  只同步指定资源（逗号分隔，如 context,my-skill）
  evokit sync --agent <id>  只同步指定 agent（逗号分隔多个，如 claude,codex）
  evokit sync --project     同步当前项目规则到该项目入口
  evokit check [--agent <id>]  检查同步一致性（指定 agent 时跳过 ctxlint）
  evokit check --project    检查当前项目的一致性
  evokit status [--agent <id>]  查看各 agent 同步状态
  evokit status --project   查看当前项目各入口同步状态
  evokit uninstall [--agent <id>]  移除托管块，恢复入口文件（保留用户内容）
  evokit uninstall --project 移除当前项目入口的托管块（保留用户内容）
  evokit knowledge init     初始化知识根（目录树 + 索引骨架 + git init + 环境体检）
  evokit knowledge gc       归档失效卡（retired / validUntil 过期）+ 清理 .rejected 超期文件（--before <YYYY-MM-DD> / --dry-run）
  evokit harvest            采集各源新会话到 inbox（--full 全量 / --source <id> / --dry-run）
  evokit learn              harvest→distill→草稿三档处理（--no-distill / --agent <id> / --session <id> / --auto；启动时消费 hook 触发）
  evokit review             待审草稿清单 + 裁决（--accept / --reject / --merge / --skill / --audit）
  evokit recall "<关键词>"   本地知识检索 + 命中计数（tags×3 ＞ 标题×2 ＞ 正文×1；--limit n / --json）
  evokit forge              知识卡聚簇锻造技能草稿（--from-tags a,b / --topic "…" / --agent <id> / --audit）
  evokit hook learn-enqueue 钩子入队：写 ~/.evokit/triggers/ 触发文件立即返回，不执行 learn（--session <id> / --json；任何异常 exit 0）
  evokit schedule enable [--time HH:MM] [--mode auto|assist]  注册每日定时学习（Windows 任务计划 / macOS launchd / Linux cron）
  evokit schedule disable [--task <name>]  取消定时任务
  evokit schedule list  查看正在定时跑的 EvoKit 任务
  evokit web [--port <n>] [--open]  启动本机网页端（只读浏览偏好/知识库/同步状态；需在 cli/ 执行 npm install）

提示:
  check / status / uninstall 支持位置参数，如 evokit check pi 等价 evokit check --agent pi
  方括号 [ ] 表示可选：不写 --agent 就是操作全部 agent；写了就只操作指定 agent（如 --agent pi）

通用选项:
  --agent <id>, -a <id>     指定一个或多个 agent（逗号分隔）
  --resource <id>, -r <id>  指定一个或多个资源（逗号分隔）
  --project, -p             项目级操作
  --output <file>, -o <file>  inventory 报告导出到指定 .md（覆盖默认目录）
  --no-output               inventory 禁用导出（默认导出到 ~/.evokit/reports/ 或项目 .evokit/reports/）
  --debug                   输出统一调试日志到 stderr（优先级最高）
  -h, --help                帮助

短别名:
  -a 等价 --agent，-r 等价 --resource，-p 等价 --project（如 evokit sync -a claude 等价 evokit sync --agent claude）

单一事实源:
  个人全局  ~/.evokit/context.md
  项目级    <project>/.evokit/context.md
统一配置:
  ~/.evokit/settings.json   agents（同步目标 + CLI 调用）+ resources（资源）+ prompts（提示词模板）
  <project>/.evokit/settings.json  项目级覆盖（agents/resources 按 id、prompts 按 key 逐项覆盖全局）

调试:
  evokit --debug inventory --agent pi     命令行开启（也可放在命令后）
  EVOKIT_DEBUG=1 evokit inventory         环境变量开启（true/1；false/0 关闭）
  settings.json 顶层设置 "debug": true   配置开启；项目配置覆盖全局配置
  优先级：--debug > EVOKIT_DEBUG > settings.json > 默认关闭
  日志只写 stderr，不污染 stdout；默认不记录完整 prompt、完整输出或敏感信息

配置分层:
  项目级 settings.json 按 id/key 逐项覆盖全局同名条目；全局有而项目级没写的条目仍生效
`);
}
