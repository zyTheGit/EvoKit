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
}

/** 按助手标记的共享内存记录 */
export interface SharedMemoryEntry {
  assistant: 'claude' | 'codex' | 'opencode' | 'pi';
  timestamp: string;
  data: Record<string, unknown>;
}
