/**
 * EvoKit — 项目级规范生成引擎
 *
 * 在目标项目目录中生成 .claude/ 结构（rules + CLAUDE.md + agents + commands），
 * 使 AI 助手能理解项目上下文并遵循项目规范。
 *
 * @packageDocumentation
 */

import path from 'node:path';
import fse from 'fs-extra';
import pc from 'picocolors';

// ─── 类型定义 ──────────────────────────────────────────────

/** 项目基本信息（交互式收集） */
export interface ProjectInfo {
  /** 项目名称 */
  name: string;
  /** 一句话描述 */
  description: string;
  /** 主要语言/框架 */
  language: string;
}

/** 规则开关（交互式收集） */
export interface RuleToggles {
  /** 是否生成 commit 规范规则 */
  commitConvention: boolean;
  /** 是否生成测试门禁规则 */
  testGate: boolean;
  /** 是否生成文档同步规则 */
  docsSync: boolean;
}

/** 生成器配置 */
export interface ProjectGeneratorConfig {
  /** 目标项目目录（默认 cwd） */
  targetDir: string;
  /** 项目基本信息 */
  projectInfo: ProjectInfo;
  /** 规则开关 */
  ruleToggles: RuleToggles;
  /** 仅预览，不写入文件 */
  dryRun: boolean;
}

/** 生成结果摘要 */
export interface ProjectGenerateResult {
  filesCreated: number;
  filesSkipped: number;
  rulesCreated: string[];
  agentsCreated: string[];
  commandsCreated: string[];
  claudeMdCreated: boolean;
}

// ─── 模板内容 ──────────────────────────────────────────────

/** 生成项目级 CLAUDE.md 内容 */
function generateClaudeMd(info: ProjectInfo): string {
  return `# ${info.name}

${info.description}

## 项目概述

- **语言/框架**：${info.language}
- **AI 助手规范**：本文件由 EvoKit 生成，定义项目级 AI 协作规则

## 关键目录

<!-- 请根据项目实际情况补充 -->
- \`src/\` — 源代码
- \`tests/\` — 测试
- \`docs/\` — 文档

## 开发命令

<!-- 请根据项目实际情况补充 -->
- 构建：\`npm run build\`
- 测试：\`npm test\`
- 代码检查：\`npm run lint\`

## 重要设计规则

<!-- 请根据项目实际情况补充 -->
`;
}

/** 生成 commit 规范规则 */
function generateCommitConventionRule(): { filename: string; content: string } {
  return {
    filename: 'commit-convention.md',
    content: `# Commit 规范（编辑 src/** 时强制）

- 遵循 [Conventional Commits](https://www.conventionalcommits.org/)
- 描述使用中文：\`type(scope): 中文描述\`
- 常用 type：\`feat\`（新功能）、\`fix\`（修复）、\`docs\`（文档）、\`refactor\`（重构）、\`chore\`（杂务）
- 一次提交只做一件事
`,
  };
}

/** 生成测试门禁规则 */
function generateTestGateRule(): { filename: string; content: string } {
  return {
    filename: 'test-gate.md',
    content: `# 测试门禁（编辑 src/** 与 tests/** 时强制）

- 改动 \`src/\` 下任何文件，测试必须通过后方可提交
- 新功能必须附带对应测试；修复 bug 优先补回归测试
- 提交前执行完整测试套件
`,
  };
}

/** 生成文档同步规则 */
function generateDocsSyncRule(): { filename: string; content: string } {
  return {
    filename: 'docs-sync.md',
    content: `# 文档同步（编辑 docs/** 与 README* 时强制）

- 修改文档后，确保相关文档同步更新
- README 变更时检查是否有对应英文/中文版本需要同步
- 新增文档时确保目录结构完整
`,
  };
}

/** 生成 architect agent */
function generateArchitectAgent(): { filename: string; content: string } {
  return {
    filename: 'architect.md',
    content: `---
name: architect
description: 规划代理 — 复杂软件架构与实现设计
model: haiku
tools: [Read, Write, Edit, Bash, Glob, Grep, Agent]
disallowedTools: []
memory: project
maxTurns: 20
---

# Architect Agent

你是一名软件架构师。你的工作是为复杂任务设计实现方案。

## 何时使用

- 设计多步骤实现方案
- 在多个架构方案间做权衡分析
- 设计文件结构、模块边界和依赖关系
- 将大任务拆分为可并行的子任务

## 何时不用

- 简单的单文件修改
- 机械性工作（重命名、格式化）
- 紧急热修复
- 用户已给出详细步骤的任务

## 工作流程

1. **理解** — 阅读相关文件，理解当前代码结构
2. **调研** — 搜索现有模式、工具和约定
3. **设计** — 创建分步实现方案（文件变更、设计决策、依赖关系、风险）
4. **呈现** — 输出清晰可执行的计划
`,
  };
}

/** 生成 reviewer agent */
function generateReviewerAgent(): { filename: string; content: string } {
  return {
    filename: 'reviewer.md',
    content: `---
name: reviewer
description: 代码审查代理 — 检查 bug、安全问题和代码质量
model: haiku
tools: [Read, Grep, Glob, Bash]
disallowedTools: [Write, Edit]
memory: project
maxTurns: 15
---

# Reviewer Agent

你是一名高级代码审查员。你审查变更中的 bug、安全问题、性能问题和代码质量。

## 何时使用

- 提交或开 PR 前
- 大型重构或复杂变更后
- 集成第三方代码时
- 部署到生产前的最终质量门禁

## 何时不用

- 生成或样板代码
- 微不足道的单行修改
- 用户明确表示临时的代码

## 审查清单

- **Bug 与正确性**：逻辑错误、空指针、竞态条件、错误处理
- **安全**：注入漏洞、硬编码凭据、不安全文件操作
- **性能**：不必要的分配、N+1 查询、缺失缓存
- **代码质量**：死代码、过度复杂逻辑、命名不当、违反项目约定

## 输出格式

\`\`\`
## 审查摘要
**总体：** ✅ 通过 / ⚠️ 发现问题 / ❌ 阻塞

### Bug（P0-P1）
- 描述，文件:行号

### 安全问题（P0）
- 描述，文件:行号

### 建议（P2-P3）
- 描述，文件:行号
\`\`\`
`,
  };
}

/** 生成 /boot 命令 */
function generateBootCommand(): { filename: string; content: string } {
  return {
    filename: 'boot.md',
    content: `---
description: 启动验证 — 检查系统完整性和已学规则
---

# /boot — 系统验证

在会话启动时运行（或随时手动运行），验证自演化系统是否健康。

## 检查项

1. 目录结构完整性（.claude/rules/、agents/、commands/、memory/）
2. 已学规则验证（learned-rules.md 中每条规则的 verify 行）
3. 文件行数限制（CLAUDE.md ≤ 150 行，learned-rules.md ≤ 50 行）
4. Hook 脚本可执行权限
5. 报告违规项
`,
  };
}

/** 生成 /review 命令 */
function generateReviewCommand(): { filename: string; content: string } {
  return {
    filename: 'review.md',
    content: `---
description: 使用 reviewer 代理审查当前变更
---

# /review — 代码审查

在提交前运行，审查所有当前变更。

## 用法

\`\`\`
/review           — 审查未暂存的变更
/review --staged  — 仅审查已暂存的变更
/review --all     — 审查所有变更
\`\`\`

## 流程

1. 获取当前 git diff
2. 调用 reviewer 代理分析变更
3. 输出结构化审查报告
`,
  };
}

// ─── 核心生成逻辑 ──────────────────────────────────────────

/**
 * 在目标目录生成项目级 .claude/ 结构。
 * 已存在的文件跳过不覆盖（skip-if-exists 策略）。
 */
export async function generateProjectStructure(
  config: ProjectGeneratorConfig,
): Promise<ProjectGenerateResult> {
  const result: ProjectGenerateResult = {
    filesCreated: 0,
    filesSkipped: 0,
    rulesCreated: [],
    agentsCreated: [],
    commandsCreated: [],
    claudeMdCreated: false,
  };

  const claudeDir = path.join(config.targetDir, '.claude');
  const rulesDir = path.join(claudeDir, 'rules');
  const agentsDir = path.join(claudeDir, 'agents');
  const commandsDir = path.join(claudeDir, 'commands');
  const memoryDir = path.join(claudeDir, 'memory');

  // ── 1. 创建目录结构 ──────────────────────────────────
  const dirs = [rulesDir, agentsDir, commandsDir, memoryDir];
  for (const dir of dirs) {
    if (config.dryRun) {
      console.log(pc.dim(`  [dry-run] 创建目录：${dir}`));
    } else {
      await fse.ensureDir(dir);
    }
  }

  // ── 2. 生成 CLAUDE.md ────────────────────────────────
  const claudeMdPath = path.join(config.targetDir, 'CLAUDE.md');
  if (await fse.pathExists(claudeMdPath)) {
    console.log(pc.yellow(`  ⏭ CLAUDE.md 已存在，跳过`));
    result.filesSkipped++;
  } else {
    const content = generateClaudeMd(config.projectInfo);
    if (config.dryRun) {
      console.log(pc.dim(`  [dry-run] 创建 CLAUDE.md`));
    } else {
      await fse.writeFile(claudeMdPath, content, 'utf-8');
    }
    result.filesCreated++;
    result.claudeMdCreated = true;
  }

  // ── 3. 生成 .claude/rules/ ───────────────────────────
  const rules: Array<{ filename: string; content: string }> = [];
  if (config.ruleToggles.commitConvention) {
    rules.push(generateCommitConventionRule());
  }
  if (config.ruleToggles.testGate) {
    rules.push(generateTestGateRule());
  }
  if (config.ruleToggles.docsSync) {
    rules.push(generateDocsSyncRule());
  }

  for (const rule of rules) {
    const rulePath = path.join(rulesDir, rule.filename);
    if (await fse.pathExists(rulePath)) {
      console.log(pc.yellow(`  ⏭ rules/${rule.filename} 已存在，跳过`));
      result.filesSkipped++;
    } else {
      if (config.dryRun) {
        console.log(pc.dim(`  [dry-run] 创建 rules/${rule.filename}`));
      } else {
        await fse.writeFile(rulePath, rule.content, 'utf-8');
      }
      result.filesCreated++;
      result.rulesCreated.push(rule.filename);
    }
  }

  // ── 4. 生成 .claude/agents/ ──────────────────────────
  const agents = [generateArchitectAgent(), generateReviewerAgent()];
  for (const agent of agents) {
    const agentPath = path.join(agentsDir, agent.filename);
    if (await fse.pathExists(agentPath)) {
      console.log(pc.yellow(`  ⏭ agents/${agent.filename} 已存在，跳过`));
      result.filesSkipped++;
    } else {
      if (config.dryRun) {
        console.log(pc.dim(`  [dry-run] 创建 agents/${agent.filename}`));
      } else {
        await fse.writeFile(agentPath, agent.content, 'utf-8');
      }
      result.filesCreated++;
      result.agentsCreated.push(agent.filename);
    }
  }

  // ── 5. 生成 .claude/commands/ ────────────────────────
  const commands = [generateBootCommand(), generateReviewCommand()];
  for (const cmd of commands) {
    const cmdPath = path.join(commandsDir, cmd.filename);
    if (await fse.pathExists(cmdPath)) {
      console.log(pc.yellow(`  ⏭ commands/${cmd.filename} 已存在，跳过`));
      result.filesSkipped++;
    } else {
      if (config.dryRun) {
        console.log(pc.dim(`  [dry-run] 创建 commands/${cmd.filename}`));
      } else {
        await fse.writeFile(cmdPath, cmd.content, 'utf-8');
      }
      result.filesCreated++;
      result.commandsCreated.push(cmd.filename);
    }
  }

  // ── 6. 生成 .claude/MEMORY.md ────────────────────────
  const memoryMdPath = path.join(claudeDir, 'MEMORY.md');
  if (await fse.pathExists(memoryMdPath)) {
    console.log(pc.yellow(`  ⏭ .claude/MEMORY.md 已存在，跳过`));
    result.filesSkipped++;
  } else {
    const memoryContent = '# 项目记忆索引\n\n<!-- 由 EvoKit 自动生成 -->\n';
    if (config.dryRun) {
      console.log(pc.dim(`  [dry-run] 创建 .claude/MEMORY.md`));
    } else {
      await fse.writeFile(memoryMdPath, memoryContent, 'utf-8');
    }
    result.filesCreated++;
  }

  return result;
}
