/** A correction entry from corrections.jsonl */
export interface CorrectionEntry {
  timestamp: string;
  pattern: string;
  context: string;
  count: number;
}

/** An observation entry from observations.jsonl */
export interface ObservationEntry {
  timestamp: string;
  pattern: string;
  confidence: number;
  source: string;
}

/** A session record from sessions.jsonl */
export interface SessionEntry {
  timestamp: string;
  duration_seconds: number;
  corrections: number;
  observations: number;
  score: string;
  assistant?: 'claude' | 'codex' | 'opencode' | 'aider';
  session_id?: string;
  model?: string;
}

/** A violation entry from violations.jsonl */
export interface ViolationEntry {
  timestamp: string;
  rule: string;
  file: string;
  detail: string;
}

/** A promoted rule parsed from learned-rules.md */
export interface LearnedRule {
  description: string;
  verify?: string;
  promoted?: string;
  deprecated?: boolean;
}

/** A rotation/archiving decision */
export interface RotationResult {
  file: string;
  kept: number;
  archived: number;
  archivePath?: string;
  gzipped: boolean;
}

/** A confidence decay result */
export interface DecayResult {
  file: string;
  kept: number;
  archived: number;
  archivePath?: string;
}

/** Grouped correction patterns */
export interface CorrectionGroup {
  pattern: string;
  entries: CorrectionEntry[];
  count: number;
}

/** A promotion decision from the evolution audit */
export interface PromotionResult {
  pattern: string;
  decision: 'promoted' | 'pruned' | 'rejected' | 'deferred';
  count: number;
  reason: string;
}

/** Configuration for the evolution pipeline */
export interface EvoConfig {
  homeDir: string;
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

/** Boot verification result */
export interface VerifyResult {
  check: string;
  status: 'pass' | 'fail' | 'warn';
  detail?: string;
}

/** Installation summary */
export interface InstallSummary {
  homeDir: string;
  filesCreated: number;
  filesSkipped: number;
  hooksInstalled: number;
  commandsInstalled: number;
  rulesInstalled: number;
  agentsInstalled: number;
}

// ─── Codex Adapter Types ─────────────────────────────────────

/** Supported Codex CLI hook event names */
export type CodexHookEventName =
  | 'SessionStart'
  | 'SubagentStart'
  | 'PreToolUse'
  | 'PermissionRequest'
  | 'PostToolUse'
  | 'PreCompact'
  | 'PostCompact'
  | 'UserPromptSubmit'
  | 'SubagentStop'
  | 'Stop';

/** Scope of a Codex hook event */
export type CodexHookScope = 'thread' | 'turn' | 'subagent';

/** Configuration for a single Codex hook handler */
export interface CodexHookHandler {
  type: 'command';
  command: string;
  command_windows?: string;
  timeout?: number;
  statusMessage?: string;
  async?: boolean;
}

/** A matcher group with hooks for a Codex event */
export interface CodexHookMatcherGroup {
  matcher: string;
  hooks: CodexHookHandler[];
}

/** Full hooks.json structure */
export interface CodexHooksJson {
  hooks: Partial<Record<CodexHookEventName, CodexHookMatcherGroup[]>>;
}

/** Options for the Codex adapter */
export interface CodexAdapterOptions {
  codexHome?: string;
  sharedMemoryDir?: string;
  dryRun?: boolean;
  verify?: boolean;
}

/** Codex-specific installation config */
export interface CodexInstallConfig {
  homeDir: string;
  templateDir: string;
  codexHome?: string;
  dryRun?: boolean;
}

/** Result from a Codex hook script execution */
export interface CodexHookResult {
  continue: boolean;
  stopReason?: string;
  systemMessage?: string;
  permissions?: Record<string, 'allow' | 'deny' | 'prompt'>;
  additionalContext?: string;
}

/** Shared memory entry tagged by assistant */
export interface SharedMemoryEntry {
  assistant: 'claude' | 'codex' | 'opencode' | 'aider';
  timestamp: string;
  data: Record<string, unknown>;
}
