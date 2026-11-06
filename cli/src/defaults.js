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
export const DEFAULT_RESOURCES = [
  {
    id: 'context',
    type: 'text',
    source: '~/.evokit/context.md',
    targets: ['~/.claude/CLAUDE.md', '~/.pi/agent/APPEND_SYSTEM.md', '~/.codex/AGENTS.md'],
  },
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
};

/** 统一默认配置（首次生成 settings.json 用） */
export const DEFAULT_CONFIG = {
  agents: DEFAULT_AGENTS,
  resources: DEFAULT_RESOURCES,
  prompts: DEFAULT_PROMPTS,
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
