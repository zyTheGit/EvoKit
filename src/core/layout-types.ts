/**
 * EvoKit — 适配器布局类型
 *
 * 声明式描述适配器安装管线应执行的操作。
 * 每个适配器构建一个 `AdapterLayout`，然后由共享的
 * `executeLayout()` 引擎执行 —— 无需为每个适配器编写安装代码。
 *
 * @packageDocumentation
 */

// ─── Section 类型 ────────────────────────────────────────────

/** 创建一个或多个目录（相对于 targetDir）。 */
export interface DirsSection {
  type: 'dirs';
  paths: string[];
}

/** 将单个文件从 src 复制到 dst。 */
export interface CopySection {
  type: 'copy';
  src: string;
  dst: string;
  /** 'always' 覆盖；'skip-if-exists' 保留目标文件不变。 */
  strategy: 'always' | 'skip-if-exists';
  /** 替换文件内容中的 `__HOME__` 占位符。 */
  replaceHome?: boolean;
  /**
   * 对于 'skip-if-exists'：如果目标文件存在但缺少特定标记字符串，
   * 则追加源内容而非跳过。标记在*目标*文件中检查。
   */
  appendMarker?: string;
}

/** 复制目录中的所有文件，支持可选过滤和策略。 */
export interface CopyDirSection {
  type: 'copy-dir';
  srcDir: string;
  dstDir: string;
  /** 仅复制匹配此扩展名过滤的文件（如 '.md'、'.sh'）。 */
  filter?: string;
  /** 'always' 覆盖；'skip-if-exists' 保留已有文件不变。 */
  strategy: 'always' | 'skip-if-exists';
  /** 替换每个文件内容中的 `__HOME__` 占位符。 */
  replaceHome?: boolean;
  /** 每复制一个文件时递增哪个 InstallSummary 计数器。 */
  counter?: 'filesCreated' | 'hooksInstalled' | 'rulesInstalled' | 'commandsInstalled';
}

/**
 * 复制技能子目录。每个包含 `SKILL.md` 的子目录作为一个整体复制。
 * 如果存在顶层 `README.md` 也会一并复制。
 */
export interface CopySkillsSection {
  type: 'copy-skills';
  srcDir: string;
  dstDir: string;
}

/** 将模板 settings JSON 深度合并到已有用户文件中。 */
export interface MergeSettingsSection {
  type: 'merge-settings';
  srcPath: string;
  dstPath: string;
  /** 合并前替换模板中的 `__HOME__` 占位符。 */
  replaceHome?: boolean;
}

/**
 * 使用 frontmatter 合并方式合并代理 markdown 文件。
 * 已有代理不会被覆盖 —— 仅添加缺失的 frontmatter 字段。
 */
export interface MergeAgentsSection {
  type: 'merge-agents';
  srcDir: string;
  dstDir: string;
}

/**
 * 从模板目录初始化 memory 文件。
 * 已有文件不会被覆盖（每个文件采用 skip-if-exists 策略）。
 * 仅初始化 `files` 中列出的文件 —— 不会引入多余文件。
 */
export interface SeedMemorySection {
  type: 'seed-memory';
  srcDir: string;
  dstDir: string;
  /** 仅初始化这些指定文件。若省略，则初始化 srcDir 中的所有文件。 */
  files?: string[];
}

/** 设置目录内容的文件系统权限。 */
export interface PermissionsSection {
  type: 'permissions';
  /** 要 chmod 的目录。 */
  dir: string;
  /** 要匹配的文件扩展名（如 '.sh'、'.jsonl'）。 */
  extension: string;
  /** 要设置的八进制权限模式（如 0o755、0o600）。 */
  mode: number;
}

/** 适配器布局中的单个步骤。 */
export type AdapterSection =
  | DirsSection
  | CopySection
  | CopyDirSection
  | CopySkillsSection
  | MergeSettingsSection
  | MergeAgentsSection
  | SeedMemorySection
  | PermissionsSection;

// ─── 布局 ───────────────────────────────────────────────────

/** 适配器安装步骤的声明式描述。 */
export interface AdapterLayout {
  /** 安装目标目录的绝对路径。 */
  targetDir: string;
  /** 要按顺序执行的 section 列表。 */
  sections: AdapterSection[];
}
