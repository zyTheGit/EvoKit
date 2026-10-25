// 默认值（首次生成 agents.json / resources.json 时使用）

/** 内置默认 agent */
export const DEFAULT_AGENTS = [
  { id: 'claude', name: 'Claude Code', global: '~/.claude/CLAUDE.md', project: 'CLAUDE.md' },
  { id: 'pi', name: 'Pi', global: '~/.pi/agent/APPEND_SYSTEM.md', project: 'APPEND_SYSTEM.md' },
  { id: 'codex', name: 'Codex', global: '~/.codex/AGENTS.md', project: 'AGENTS.md' },
];

/**
 * 内置默认资源
 * type: text     → 把源文件内容写入目标文件的托管块
 * type: symlink  → 把源目录软链接到目标（一处改动多处实时生效）
 */
export const DEFAULT_RESOURCES = [
  {
    id: 'context',
    type: 'text',
    source: '~/.evokit/context.md',
    targets: ['~/.claude/CLAUDE.md', '~/.pi/agent/APPEND_SYSTEM.md', '~/.codex/AGENTS.md'],
  },
];

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
