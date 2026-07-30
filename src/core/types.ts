/** 来自 corrections.jsonl 的修正记录 */
export interface CorrectionEntry {
  timestamp: string;
  pattern: string;
  context: string;
  count: number;
}

/** 来自 observations.jsonl 的观察记录 */
export interface ObservationEntry {
  timestamp: string;
  pattern: string;
  confidence: number;
  source: string;
}

/** 来自 sessions.jsonl 的会话记录 */
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

/** 来自 violations.jsonl 的违规记录 */
export interface ViolationEntry {
  timestamp: string;
  rule: string;
  file: string;
  detail: string;
}

/** 从 learned-rules.md 解析出的已提升规则 */
export interface LearnedRule {
  description: string;
  verify?: string;
  promoted?: string;
  deprecated?: boolean;
}

// ─── v1.0 知识条目类型 ──────────────────────────────────────

/** 知识条目类型 */
export type KnowledgeType = 'convention' | 'preference' | 'architecture' | 'workflow';

/** 知识条目来源 */
export type KnowledgeSource = 'conversation' | 'explicit' | 'git-history';

/** 知识条目作用域 */
export type KnowledgeScope = 'personal' | 'project';

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
  /** 必填，置信度 0.0–1.0 */
  confidence: number;
  /** 必填，创建时间 ISO 8601 */
  created: string;
  /** 可选，最后更新时间 ISO 8601 */
  updated?: string;
  /** 可选，单行摘要，适用范围 */
  context?: string;
  /** 可选，标签数组 */
  tags?: string[];
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

/** 轮换/归档结果 */
export interface RotationResult {
  file: string;
  kept: number;
  archived: number;
  archivePath?: string;
  gzipped: boolean;
}

/** 置信度衰减结果 */
export interface DecayResult {
  file: string;
  kept: number;
  archived: number;
  archivePath?: string;
}

/** 分组后的修正模式 */
export interface CorrectionGroup {
  pattern: string;
  entries: CorrectionEntry[];
  count: number;
}

/** 演化审计的提升决策 */
export interface PromotionResult {
  pattern: string;
  decision: 'promoted' | 'pruned' | 'rejected' | 'deferred';
  count: number;
  reason: string;
}

/** 演化管道的配置 */
export interface EvoConfig {
  homeDir: string;
  /** 适配器 ID（决定 memory 目录路径，默认 'claude'） */
  adapterId?: string;
  maxLines?: number;
  maxDays?: number;
  maxLinesArchive?: number;
  confidenceDecayDays?: number;
  confidenceThreshold?: number;
  promoteThreshold?: number;
  graduateSessions?: number;
  learnedRulesMax?: number;
  claudeMdMax?: number;
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
