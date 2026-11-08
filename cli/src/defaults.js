// 默认值（首次生成 settings.json 时使用）

/** 内置默认 agent（含 CLI 调用配置） */
export const DEFAULT_AGENTS = [
  {
    id: 'claude', name: 'Claude Code', global: '~/.claude/CLAUDE.md', project: 'CLAUDE.md',
    cli: { bin: 'claude', args: ['-p', '{prompt}'], timeout: 120, outputFormat: 'text' },
  },
  {
    id: 'pi', name: 'Pi', global: '~/.pi/agent/APPEND_SYSTEM.md', project: 'APPEND_SYSTEM.md',
    // pi --print 无位置参数时自动从 stdin 读完整指令（不接受 `-` 占位符，位置参数会挂起）；
    // 指定 deepseek 避免默认 opencode-go 过期 key
    cli: { bin: 'pi', args: ['--print'], input: 'stdin', model: 'deepseek/deepseek-v4-pro', timeout: 120, outputFormat: 'text' },
  },
  {
    id: 'codex', name: 'Codex', global: '~/.codex/AGENTS.md', project: 'AGENTS.md',
    // codex exec 通过 `-` 从 stdin 读取完整指令（长 prompt 不要走 argv，避免被当作消息片段）
    cli: { bin: 'codex', args: ['exec', '-'], input: 'stdin', timeout: 120, outputFormat: 'text' },
  },
];

/**
 * 内置默认资源
 * type: text     → 把源文件内容写入目标文件的托管块
 * type: symlink  → 把源目录软链接到目标（一处改动多处实时生效）
 * type: remote   → 远程 URL 拉取（http/https）
 */
/** 内置 knowledge-index 资源（T-M3.1）：单独导出，供 entry-content.js 作为隐式内置资源注入（须先于 DEFAULT_RESOURCES 声明） */
export const KNOWLEDGE_INDEX_RESOURCE = {
  id: 'knowledge-index',
  type: 'text',
  source: '~/.evokit/knowledge/knowledge-index.md',
  targets: ['~/.claude/CLAUDE.md', '~/.pi/agent/APPEND_SYSTEM.md', '~/.codex/AGENTS.md'],
};

export const DEFAULT_RESOURCES = [
  {
    id: 'context',
    type: 'text',
    source: '~/.evokit/context.md',
    targets: ['~/.claude/CLAUDE.md', '~/.pi/agent/APPEND_SYSTEM.md', '~/.codex/AGENTS.md'],
  },
  // 记忆引擎 L1 分发（T-M3.1）：知识索引 → 三入口托管块；源缺失时 sync 跳过并提示（见 commands/sync.js）
  KNOWLEDGE_INDEX_RESOURCE,
];

/** 内置默认提示词模板（用户配置只覆盖同名 key，未覆盖的仍用默认） */
export const DEFAULT_PROMPTS = {
  inventory: `# 知识库静态冗余审计报告
你是 {agent}，负责对本地知识库进行静态冗余审计。
## 输入
知识库清单：{inventory}
## 审计规则
- 仅依据输入清单分析，不调用工具、不执行命令、不读取其他文件、不修改任何数据。
- 严格区分事实与推断，不得编造文件内容、引用关系或运行状态。
- 每项发现标记为：**已确认 / 疑似 / 待核验**。证据不足时不得强行下结论。
- 不得仅凭同名、体积大或修改时间久判定重复、过期或可删除。
- 同一问题只记录一次，通过唯一编号关联后续建议。
- 本次仅输出报告，不执行任何清理操作。
## 输出格式
### 0. 审计范围与输入质量
统计清单条目数、可用字段、缺失信息，并评估重复、冲突、过期/断链、缓存四类问题的可审计性及限制。
### 1. 重复项
识别完全重复、内容相似、功能重叠及同名异义项目。
### 2. 冲突项
识别相互矛盾的规则、配置、权限约束及适用范围冲突，区分真实冲突与合理差异。
### 3. 过期 / 断链
识别明确断链、疑似过期、失效引用及可能的孤立项目。修改时间久远仅作为线索。
### 4. 可清理缓存
识别疑似缓存、临时文件、重复历史副本及可再生成数据。无法确认用途或可恢复性时，不得建议直接删除。
### 5. 整理建议（按优先级排序）
引用前述发现编号，给出具体、保守的合并、统一、修复、归档或清理建议。
## 每条发现的固定字段
- **编号**：DUP-001、CON-001、LINK-001、CACHE-001 等。
- **状态**：已确认 / 疑似 / 待核验。
- **涉及路径**：列出全部已知路径。
- **问题说明与证据**：描述问题，并引用清单中实际可见的信息。
- **建议动作**：说明如何处理；证据不足时注明待核验内容。
整理建议额外包含：
- **优先级**：P0 高风险、P1 高收益、P2 常规优化、P3 待核验。
- **前置条件**：执行前需要确认的事项。
- **预期收益与风险**：说明优化价值及潜在影响。
## 报告要求
- 固定输出以上 6 个区块，不得省略。
- 无明确发现时写"未发现可确认的问题"；信息不足时说明原因。
- 优先保证知识完整性、规则正确性和可恢复性，不为减少文件数量而盲目合并或删除。
- 仅输出最终 Markdown 报告。`,
  // distill 阶段 A：抽卡（T-M2.1）。输入为本批 RawEvent；红线 #9 委托纪律 + 无密钥要求全项写入模板
  distillA: `# 经验提纯 · 阶段 A：抽卡
你是记忆提纯执行者。下面是本批从本机会话史收割的 RawEvent（已脱敏）。
## 输入
{events}
## 任务
只提取**可复用知识**，忽略一次性调试过程、临时变量与过期版本问题：
- 用户偏好修正（用户明确纠正过 AI 的做法）
- 踩坑与解法（报错/失败 + 最终可行的解决方案）
- 项目事实（项目结构、约定、环境、依赖版本等稳定事实）
- 有效工作流（被验证过的操作序列）
## 输出格式
严格输出 JSON 数组，无其他文本、无代码块围栏：
[{
  "title": "简短陈述句标题",
  "type": "fact|preference|pattern|pitfall|workflow 之一",
  "tags": ["标签1", "标签2"],
  "statement": "一条自包含的知识陈述（含关键细节，脱离上下文可读）",
  "evidence": ["来源文件路径"],
  "confidence": 0.0
}]
## 纪律
- 最多输出 10 张卡；没有可提纯内容时输出 []。
- evidence 必须取自输入中出现的来源文件路径（「来源:」标注），禁止编造。
- confidence 取值 0 到 1：有明确证据 0.8 以上，推测 0.5 左右，模糊 0.3 以下。
- 不调用工具、不读取其他文件、不修改任何数据；只输出约定 JSON。
- 任何密钥、token、密码、内网地址一律不得出现在输出中；发现则以 [REDACTED] 占位。`,
  // distill 阶段 B：裁决（T-M2.1）。输入为阶段 A 卡片 + 既有同 tag 卡片摘要
  distillB: `# 经验提纯 · 阶段 B：裁决
你是记忆库裁决执行者。输入为两部分：阶段 A 新产出的卡片数组，与知识库中既有同主题卡片的摘要。
## 输入
### 新卡片
{cards}
### 既有卡片摘要
{existing}
## 任务
对每张新卡片裁决：
- ADD：知识库中没有同等知识，新增。
- UPDATE：既有卡 oldId 信息过时或不完整，在 change 字段给出改法。
- MERGE：与既有卡 mergeInto 重复，应并入该卡。
- NOOP：完全重复或无价值，不动作。
## 输出格式
严格输出 JSON 数组（与输入新卡片一一对应、同序），无其他文本、无代码块围栏：
[{
  "title": "对应新卡标题",
  "type": "fact|preference|pattern|pitfall|workflow",
  "tags": ["标签1"],
  "statement": "知识陈述",
  "evidence": ["来源文件路径"],
  "confidence": 0.0,
  "verdict": "ADD|UPDATE|MERGE|NOOP",
  "oldId": "仅 UPDATE/MERGE 时：既有卡 id",
  "mergeInto": "仅 MERGE 时：并入的既有卡 id",
  "change": "仅 UPDATE 时：对 oldId 卡的具体改法",
  "related": ["疑似相关的既有卡 id"]
}]
## 纪律
- 只依据输入裁决，不调用工具、不读取其他文件、不修改任何数据；只输出约定 JSON。
- 不得包含任何密钥、token、密码、内网地址。
- 拿不准时选 NOOP，宁缺毋滥。`,
  // forge 锻造（T-M4.2）：confirmed 知识卡 → 单文件 SKILL.md 草稿；产出经 review --skill 人工过目后分发（D5）
  forge: `# 技能锻造：从知识卡生成 SKILL.md
你是技能锻造执行者。下面是知识库中同一主题的 confirmed 知识卡（JSON 数组）。
## 输入
主题：{topic}
知识卡：
{cards}
## 任务
把知识卡锻造成一个可供 AI 工具加载的技能，输出**一个** SKILL.md 全文（Markdown）。
## 输出格式（严格遵守）
第一行 \`---\`，YAML frontmatter 必须包含：
- name：技能名，小写字母/数字/连字符（lowercase-hyphen），如 \`pms-release-flow\`
- description：一句话说明技能用途与**触发时机**（什么场景下应加载本技能）
frontmatter 结束后是正文：
- 渐进披露：先「快速开始」给最少可用步骤，再按需展开细节章节
- 内容全部来自输入知识卡，不得编造知识卡之外的流程
## 纪律
- 所有内容自足于单个 SKILL.md 文件：不要求 scripts/、references/ 等外部文件，正文不引用不存在的文件。
- 只输出 SKILL.md 全文，不输出任何解释、前后缀或代码块围栏。
- 不调用工具、不读取其他文件、不修改任何数据。
- 任何密钥、token、密码、内网地址不得出现在输出中；发现则以 [REDACTED] 占位。`,
};

/** 内置默认采集源（设计文档 §4.1；sqlite 两条默认关闭，P2 储备） */
export const DEFAULT_SOURCES = [
  { id: 'claude-sessions', adapter: 'claude-projects', root: '~/.claude/projects', since: '2026-08-01', enabled: true },
  { id: 'claude-history', adapter: 'jsonl-fields', root: '~/.claude/history.jsonl', enabled: true },
  { id: 'codex-sessions', adapter: 'codex-rollout', root: '~/.codex/sessions', enabled: true },
  { id: 'qoder-cn-memory', adapter: 'memory-cards', root: '~/.qoder-cn/memory', glob: 'feedback-*.md', enabled: true },
  { id: 'qoder-memory', adapter: 'memory-cards', root: '~/.qoder/memory', enabled: true },
  { id: 'codearts-memory', adapter: 'memory-cards', root: '~/.codeartsdoer/memory', recursive: true, enabled: true },
  { id: 'trae-memory', adapter: 'trae-session-memory', root: '~/.trae-cn/memory/projects', enabled: true },
  // workbuddy 日报在项目内，root 缺省 = 当前工作目录
  { id: 'workbuddy-log', adapter: 'daily-log', glob: '**/.workbuddy/memory/*.md', enabled: true },
  { id: 'pi-sessions', adapter: 'pi-sessions', root: '~/.pi/agent/sessions', enabled: true },
  { id: 'trae-solo-db', adapter: 'sqlite', root: '~/AppData/Roaming/TRAE SOLO CN/ModularData/ai-agent/database.db', enabled: false },
  { id: 'autoclaw-db', adapter: 'sqlite', root: '~/AppData/Roaming/AutoClaw-official/accounts/*/runtime/runtime.sqlite', enabled: false },
];

/** 内置默认 knowledge 配置块（记忆引擎 v3；用户配置浅合并覆盖） */
export const DEFAULT_KNOWLEDGE = {
  automation: 'manual',            // manual | assist | auto（默认人在环）
  autoThreshold: 0.9,              // assist 档自动入库的 confidence 阈值
  indexBudget: 60,                 // L1 索引常驻行数硬上限（ADR 0009 §5）
  inboxRetentionDays: 30,          // RawEvent 暂存保留天数
  rejectedRetentionDays: 90,       // .rejected 保留天数
  distillAgentOrder: ['codex', 'pi'], // distill 执行者降级链（claude 长文超时 bug，不进自动链）
  batchMaxSessions: 8,             // distill 单批最大会话数
  batchMaxPromptKB: 24,            // distill 单批 prompt 上限（KB）
  forgeClusterMin: 3,              // forge 聚簇达标最少 confirmed 卡数
  redact: { extraPatterns: [] },   // 脱敏规则扩充（正则字符串数组）
};

/** 统一默认配置（首次生成 settings.json 用） */
export const DEFAULT_CONFIG = {
  agents: DEFAULT_AGENTS,
  resources: DEFAULT_RESOURCES,
  prompts: DEFAULT_PROMPTS,
  sources: DEFAULT_SOURCES,
  knowledge: DEFAULT_KNOWLEDGE,
};

/** 默认全局偏好源内容 */
export const DEFAULT_CONTEXT = `# 全局偏好（单一事实源）

> 本文件是唯一源（canonical）。改这里，然后运行 \`evokit sync\` 同步到各 AI 工具。
> 由 EvoKit 个人版维护，勿在各工具入口文件中直接改规则。

## 语言

- 默认使用中文进行所有交流和回复
- 代码注释、Git 提交信息、文档说明使用中文
- 变量名、函数名等代码标识符保持英文
- 术语保留原文：API、CLI、PR 等
- 当用户使用其他语言提问时，跟随用户使用的语言回复

## 工具链

- Node.js 版本切换优先使用 fnm（\`fnm use\`、\`fnm install\`），而非 nvm 或 n
- Python 环境/依赖/脚本执行优先使用 uv（\`uv run\`、\`uv add\`、\`uv venv\`、\`uv sync\`），而非 pip、conda、poetry

## 行为规则

- 任务开始前先判断是否有适用技能，必要时调用
- 只做用户要求的任务，不擅自扩大范围或额外"优化"，除非明确授权
- 渐进提交：合理拆分，避免巨型 commit
- 宣称完成前必须运行验证命令确认结果
- 最小意外：只修改任务相关的文件，不改无关代码
- 子代理优先异步：使用 subagent 时默认 async: true
- 出现问题时先结构化调试再修复，不盲目假设
- 边界裁决：「加载/调用适用技能」属于流程内动作，不计入「擅自扩大范围」；但技能若要产出用户未要求的额外产物（新文件、新脚本、新提交），先向用户确认
- 例外登记：技能可对上述规则声明书面例外（如 code-review 需要阻塞子代理），例外必须写在技能文件里，不靠临时判断
`;
