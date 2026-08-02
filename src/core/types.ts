/** 来自 sessions.jsonl 的会话记录（迁移兼容） */
export interface SessionEntry {
  timestamp: string;
  duration_seconds: number;
  corrections: number;
  observations: number;
  score: string;
  assistant?: 'claude' | 'codex' | 'opencode' | 'pi';
  session_id?: string;
  model?: string;
}

// ─── v1.0 知识条目类型 ──────────────────────────────────────

/** 知识条目类型 */
export type KnowledgeType = 'convention' | 'preference' | 'architecture' | 'workflow';

/** 知识条目来源 */
export type KnowledgeSource = 'conversation' | 'explicit' | 'git-history';

/** 知识条目作用域 */
export type KnowledgeScope = 'personal' | 'project';

/**
 * 知识条目生命周期状态。
 *
 * - `pending` — 待确认草稿（`.pending/`），识别后未背书；无 scope/confidence（未猜作用域、未背书）。
 * - `active`  — 已背书条目（`knowledge/`），scope/confidence 齐备。
 */
export type KnowledgeStatus = 'pending' | 'active';

/** v1.0 知识条目数据结构（YAML frontmatter + 正文） */
export interface KnowledgeEntry {
  /** 必填，= 文件名去掉 .md */
  id: string;
  /** 必填，作用域 */
  scope: KnowledgeScope;
  /** 必填，知识类型 */
  type: KnowledgeType;
  /** 必填，来源 */
  source: KnowledgeSource;
  /** 必填，维护/新鲜度信号（非可信度）。三档离散值：0.9 FRESH · 0.5 STALE · 0.1 RETIRED
   *  详值见 KnowledgeConfidence 常量与 transitionConfidence 状态机（ADR 0002）。 */
  confidence: 0.9 | 0.5 | 0.1;
  /** 必填，创建时间 ISO 8601 */
  created: string;
  /** 可选，最后更新时间 ISO 8601 */
  updated?: string;
  /** 可选，单行摘要，适用范围 */
  context?: string;
  /** 可选，标签数组 */
  tags?: string[];
}

/**
 * 待确认草稿（`.pending/` 条目，见 #31 D1）。
 *
 * 对话识别后静默写入 `.pending/`，此时尚未背书，因此：
 * - **不含 `scope`**（识别时不猜作用域，确认时人工裁定）
 * - **不含 `confidence`**（未背书不给高值前提，确认背书后才设 FRESH 0.9）
 *
 * 确认时由 /evokit-learn 补齐 scope + confidence + updated，转成 KnowledgeEntry 移入 knowledge/。
 */
export interface PendingKnowledgeEntry {
  id: string;
  type: KnowledgeType;
  source: KnowledgeSource;
  created: string;
  context?: string;
  tags?: string[];
}

/**
 * 架构型条目的推理标注（type=architecture 必填，见 #33 / ADR 0002）。
 * 检索按类型分裂：architecture 需全文推理标注，AI 才能按需追索而非只看摘要。
 */
export interface ArchitectureAnnotation {
  /** ## 影响范围 — 该架构决策依赖什么前提、影响哪些模块/服务/数据流 */
  impact: string;
  /** ## 相关决策 — 相关/上下游决策的引用 */
  relatedDecisions?: string[];
}

/** 迁移解析结果：从 learned-rules.md 条目转换为待确认的知识条目 */
export interface MigratedRule {
  /** 原始描述文本 */
  originalDescription: string;
  /** 转换后的知识条目 */
  entry: KnowledgeEntry;
  /** 解析时的补充说明（如有） */
  note?: string;
  /** 是否为 deprecated（跳过） */
  deprecated: boolean;
}

/** 迁移检测结果：哪些旧数据文件存在 */
export interface MigrationDetection {
  learnedRules: boolean;
  corrections: boolean;
  observations: boolean;
  evolutionLog: boolean;
  violations: boolean;
  /** 检测到的旧文件路径 */
  paths: Record<string, string>;
}

/** EvoKit v1.0 配置（已移除 v0.x 废弃晋升/旋转/归档配置项）。 */
export interface EvoConfig {
  homeDir: string;
  /** 适配器 ID（决定 memory 目录路径，默认 'claude'） */
  adapterId?: string;
  dryRun?: boolean;
}

/** 启动验证结果 */
export interface VerifyResult {
  check: string;
  status: 'pass' | 'fail' | 'warn';
  detail?: string;
}

/** 安装摘要 */
export interface InstallSummary {
  homeDir: string;
  filesCreated: number;
  filesSkipped: number;
  hooksInstalled: number;
  commandsInstalled: number;
  rulesInstalled: number;
  agentsInstalled: number;
  skillsInstalled: number;
}

/** 按助手标记的共享内存记录 */
export interface SharedMemoryEntry {
  assistant: 'claude' | 'codex' | 'opencode' | 'pi';
  timestamp: string;
  data: Record<string, unknown>;
}
