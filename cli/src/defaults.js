// 默认值（首次生成 settings.json 时使用）

/** 内置默认 agent（含 CLI 调用配置） */
export const DEFAULT_AGENTS = [
  {
    id: 'claude', name: 'Claude Code', global: '~/.claude/CLAUDE.md', project: 'CLAUDE.md',
    cli: { bin: 'claude', args: ['-p', '{prompt}'], timeout: 120, outputFormat: 'text' },
  },
  {
    id: 'pi', name: 'Pi', global: '~/.pi/agent/APPEND_SYSTEM.md', project: 'APPEND_SYSTEM.md',
    cli: { bin: 'pi', args: ['--print', '{prompt}'], timeout: 120, outputFormat: 'text' },
  },
  {
    id: 'codex', name: 'Codex', global: '~/.codex/AGENTS.md', project: 'AGENTS.md',
    cli: { bin: 'codex', args: ['exec', '{prompt}'], timeout: 120, outputFormat: 'text' },
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
  inventory: `你是 {agent}，正在做一次自己留存知识库的冗余体检。

下面是你当前留存的知识库清单（含路径、大小、修改时间、软链接指向）：

{inventory}

请帮我找出并整理以下冗余，输出一份结构化 Markdown 报告：
1. 【重复项】同名或内容高度相似的 skill/规则，散在多处（列出位置与差异）
2. 【冲突项】对同一件事给出不同/矛盾规则的提示词
3. 【过期/断链】软链接指向不存在的源、长期未更新的项
4. 【可清理缓存】体积大或明显冗余的历史/缓存/会话文件
5. 【整理建议】按优先级给出具体的合并/删除/统一建议

要求：
- 只读分析，不要修改任何文件
- 输出格式固定为上面 5 个区块
- 每条冗余标注：涉及路径 + 问题说明 + 建议动作`,
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
> 由 EvoKit 维护，勿在各工具入口文件中直接改规则。

## 语言

- 默认使用中文进行所有交流和回复
- 代码注释、Git 提交信息、文档说明使用中文
- 变量名、函数名等代码标识符保持英文
- 术语保留原文：API、CLI、PR 等
- 当用户使用其他语言提问时，跟随用户使用的语言回复

## 工具链

- Node.js 版本切换优先使用 fnm，而非 nvm 或 n
- Python 环境/依赖/脚本执行优先使用 uv，而非 pip、conda、poetry

## 行为规则

- 任务开始前先判断是否有适用技能，必要时调用
- 只做用户要求的任务，不擅自扩大范围或额外优化，除非明确授权
- 渐进提交：合理拆分，避免巨型 commit
- 宣称完成前必须运行验证命令确认结果
- 最小意外：只修改任务相关的文件，不改无关代码
`;
