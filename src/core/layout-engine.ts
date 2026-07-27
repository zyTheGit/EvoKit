/**
 * EvoKit — 布局执行引擎
 *
 * 按顺序处理声明式 `AdapterLayout` 中的每个 section 来执行安装。
 * 这是所有适配器共用的单一引擎 —— 无需为每个适配器编写安装代码。
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import fse from 'fs-extra';
import { mergeSettings } from './merge-settings.js';
import { installOrMergeAgents } from './merge-agents.js';
import { replaceHomeInString, replaceHomeInObject } from './replace-home.js';
import type { InstallSummary } from './types.js';
import type { ManifestCollector } from './manifest-collector.js';
import type {
  AdapterLayout,
  AdapterSection,
  DirsSection,
  CopySection,
  CopyDirSection,
  CopySkillsSection,
  MergeSettingsSection,
  MergeAgentsSection,
  SeedMemorySection,
  PermissionsSection,
} from './layout-types.js';

/**
 * 执行 `AdapterLayout` —— 安装文件、合并配置、设置权限等。
 * 返回描述操作结果的 `InstallSummary`。
 */
export function executeLayout(
  layout: AdapterLayout,
  opts: { homeDir: string; dryRun?: boolean; collector?: ManifestCollector },
): InstallSummary {
  const { homeDir, dryRun = false, collector } = opts;
  const { targetDir, sections } = layout;

  const summary: InstallSummary = {
    homeDir,
    filesCreated: 0,
    filesSkipped: 0,
    hooksInstalled: 0,
    commandsInstalled: 0,
    rulesInstalled: 0,
    agentsInstalled: 0,
    skillsInstalled: 0,
  };

  // 确保目标目录存在（dry-run 模式下也创建，以便路径解析）
  if (!dryRun) {
    fse.ensureDirSync(targetDir);
  }

  for (const section of sections) {
    switch (section.type) {
      case 'dirs':
        executeDirs(section, targetDir, dryRun, collector);
        break;
      case 'copy':
        executeCopy(section, homeDir, dryRun, summary, collector);
        break;
      case 'copy-dir':
        executeCopyDir(section, homeDir, dryRun, summary, collector);
        break;
      case 'copy-skills':
        executeCopySkills(section, dryRun, summary, collector);
        break;
      case 'merge-settings':
        executeMergeSettings(section, homeDir, dryRun, summary, collector);
        break;
      case 'merge-agents':
        executeMergeAgents(section, dryRun, summary, collector);
        break;
      case 'seed-memory':
        executeSeedMemory(section, dryRun, summary, collector);
        break;
      case 'permissions':
        executePermissions(section, dryRun);
        break;
    }
  }

  return summary;
}

// ─── Section 执行器 ────────────────────────────────────────

function executeDirs(
  section: DirsSection,
  targetDir: string,
  dryRun: boolean,
  collector?: ManifestCollector,
): void {
  for (const p of section.paths) {
    if (!dryRun) fse.ensureDirSync(path.join(targetDir, p));
    collector?.recordDirectory(p);
  }
}

function executeCopy(
  section: CopySection,
  homeDir: string,
  dryRun: boolean,
  summary: InstallSummary,
  collector?: ManifestCollector,
): void {
  const { src, dst, strategy, replaceHome, appendMarker } = section;

  if (!fse.existsSync(src)) return;

  if (strategy === 'skip-if-exists' && fse.existsSync(dst)) {
    if (appendMarker) {
      // 目标已存在 —— 检查是否已包含标记
      const existing = fs.readFileSync(dst, 'utf-8');
      if (!existing.includes(appendMarker)) {
        // 追加源内容
        if (!dryRun) {
          let content = fs.readFileSync(src, 'utf-8');
          if (replaceHome) content = replaceHomeInString(content, homeDir);
          fs.appendFileSync(dst, '\n\n---\n\n' + content, 'utf-8');
        }
        summary.filesCreated++;
        collector?.recordFile({ path: dst, source: 'copy', mode: 'appended', appendMarker });
      } else {
        summary.filesSkipped++;
      }
    } else {
      summary.filesSkipped++;
    }
    return;
  }

  // 'always' 策略或目标不存在
  if (!dryRun) {
    let content = fs.readFileSync(src, 'utf-8');
    if (replaceHome) content = replaceHomeInString(content, homeDir);
    fse.ensureDirSync(path.dirname(dst));
    fs.writeFileSync(dst, content, 'utf-8');
  }
  summary.filesCreated++;
  collector?.recordFile({ path: dst, source: 'copy', mode: 'created', appendMarker });
}

function executeCopyDir(
  section: CopyDirSection,
  homeDir: string,
  dryRun: boolean,
  summary: InstallSummary,
  collector?: ManifestCollector,
): void {
  const { srcDir, dstDir, filter, strategy, replaceHome, counter } = section;

  if (!fse.existsSync(srcDir)) return;

  let files = fs.readdirSync(srcDir);
  if (filter) files = files.filter((f) => f.endsWith(filter));

  if (!dryRun) fse.ensureDirSync(dstDir);

  for (const file of files) {
    const srcPath = path.join(srcDir, file);
    const dstPath = path.join(dstDir, file);

    if (strategy === 'skip-if-exists' && fse.existsSync(dstPath)) {
      summary.filesSkipped++;
      continue;
    }

    if (!dryRun) {
      if (replaceHome) {
        let content = fs.readFileSync(srcPath, 'utf-8');
        content = replaceHomeInString(content, homeDir);
        fs.writeFileSync(dstPath, content, 'utf-8');
      } else {
        fse.copySync(srcPath, dstPath);
      }
    }

    // 递增显式计数器，若未指定则回退到 filesCreated
    switch (counter) {
      case 'hooksInstalled':
        summary.hooksInstalled++;
        break;
      case 'rulesInstalled':
        summary.rulesInstalled++;
        break;
      case 'commandsInstalled':
        summary.commandsInstalled++;
        break;
      default:
        summary.filesCreated++;
    }

    collector?.recordFile({ path: dstPath, source: 'copy-dir', mode: 'created' });
  }
}

function executeCopySkills(
  section: CopySkillsSection,
  dryRun: boolean,
  summary: InstallSummary,
  collector?: ManifestCollector,
): void {
  const { srcDir, dstDir } = section;
  if (!fse.existsSync(srcDir)) return;

  for (const entry of fs.readdirSync(srcDir)) {
    const skillDir = path.join(srcDir, entry);
    if (fse.statSync(skillDir).isDirectory()) {
      const skillMd = path.join(skillDir, 'SKILL.md');
      if (fse.existsSync(skillMd)) {
        if (!dryRun) {
          fse.ensureDirSync(path.join(dstDir, entry));
          fse.copySync(skillMd, path.join(dstDir, entry, 'SKILL.md'));
        }
        summary.filesCreated++;
        summary.skillsInstalled++;
        collector?.recordSkillDir(entry);
        collector?.recordFile({
          path: path.join(dstDir, entry, 'SKILL.md'),
          source: 'copy-skills',
          mode: 'created',
        });
      }
    }
  }

  const readmeSrc = path.join(srcDir, 'README.md');
  if (fse.existsSync(readmeSrc)) {
    if (!dryRun) {
      fse.copySync(readmeSrc, path.join(dstDir, 'README.md'));
    }
    summary.filesCreated++;
    collector?.recordFile({
      path: path.join(dstDir, 'README.md'),
      source: 'copy-skills',
      mode: 'created',
    });
  }
}

function executeMergeSettings(
  section: MergeSettingsSection,
  homeDir: string,
  dryRun: boolean,
  summary: InstallSummary,
  collector?: ManifestCollector,
): void {
  const { srcPath, dstPath, replaceHome } = section;

  if (!fse.existsSync(srcPath)) return;

  if (!fse.existsSync(dstPath)) {
    // 全新安装 —— 复制模板，可选替换 __HOME__
    if (!dryRun) {
      const content = fs.readFileSync(srcPath, 'utf-8');
      if (replaceHome) {
        // 先解析 JSON，再在对象中替换 __HOME__，以避免
        // Windows 反斜杠问题（如 C:\Users\x → 无效的 JSON 转义）
        try {
          const parsed = replaceHomeInObject(JSON.parse(content), homeDir);
          fse.ensureDirSync(path.dirname(dstPath));
          fs.writeFileSync(dstPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
          // 记录全新安装的所有模板条目
          recordSettingsEntries(parsed, collector);
        } catch {
          // 回退方案：如果模板不是有效 JSON，执行字符串替换
          fse.ensureDirSync(path.dirname(dstPath));
          fs.writeFileSync(dstPath, replaceHomeInString(content, homeDir), 'utf-8');
        }
      } else {
        fse.ensureDirSync(path.dirname(dstPath));
        fs.writeFileSync(dstPath, content, 'utf-8');
      }
    }
    summary.filesCreated++;
    collector?.recordFile({ path: dstPath, source: 'merge-settings', mode: 'created' });
    return;
  }

  // 目标已存在 —— 检查是否为有效 JSON，然后合并或覆盖
  let isValid = true;
  try {
    JSON.parse(fs.readFileSync(dstPath, 'utf-8'));
  } catch {
    isValid = false;
  }

  if (!isValid) {
    // 损坏/空文件 —— 从模板覆盖
    if (!dryRun) {
      const content = fs.readFileSync(srcPath, 'utf-8');
      if (replaceHome) {
        try {
          const parsed = replaceHomeInObject(JSON.parse(content), homeDir);
          fs.writeFileSync(dstPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
          recordSettingsEntries(parsed, collector);
        } catch {
          fs.writeFileSync(dstPath, replaceHomeInString(content, homeDir), 'utf-8');
        }
      } else {
        fs.writeFileSync(dstPath, content, 'utf-8');
      }
    }
    summary.filesCreated++;
    collector?.recordFile({ path: dstPath, source: 'merge-settings', mode: 'created' });
    return;
  }

  // 有效 JSON —— 深度合并（添加缺失的 hooks/env，绝不覆盖已有值）
  if (!dryRun) {
    const result = mergeSettings(dstPath, srcPath, homeDir, section.allowWorkflow ?? false);
    if (result.changed) {
      summary.filesCreated++;
      collector?.recordFile({ path: dstPath, source: 'merge-settings', mode: 'created' });
      // 记录实际合并的内容详情
      if (result.detail) {
        for (const h of result.detail.hooksAdded) {
          collector?.recordHook(h.event, h.entry);
        }
        for (const e of result.detail.envVarsAdded) {
          collector?.recordEnvVar(e.key, e.value);
        }
        if (result.detail.autoMemoryEnabledSet) {
          collector?.recordAutoMemoryEnabled();
        }
        for (const rule of result.detail.permissionsAllowAdded) {
          collector?.recordPermissionAllow(rule);
        }
      }
    } else {
      summary.filesSkipped++;
    }
  } else {
    summary.filesCreated++;
  }
}

function executeMergeAgents(
  section: MergeAgentsSection,
  dryRun: boolean,
  summary: InstallSummary,
  collector?: ManifestCollector,
): void {
  const { srcDir, dstDir, overwriteBody } = section;

  if (!fse.existsSync(srcDir)) return;

  if (dryRun) {
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.md'));
    summary.agentsInstalled += files.length;
    return;
  }

  const results = installOrMergeAgents(srcDir, dstDir, false, overwriteBody);
  summary.agentsInstalled += results.filter(
    (r) => r.status === 'COPY' || r.status === 'MERGED',
  ).length;

  // 记录代理操作到清单
  for (const r of results) {
    if (r.status === 'COPY') {
      collector?.recordFile({
        path: path.join(dstDir, r.name),
        source: 'merge-agents',
        mode: 'created',
      });
    } else if (r.status === 'MERGED' && r.fieldsAdded) {
      collector?.recordAgentFrontmatter(r.name, r.fieldsAdded);
      collector?.recordFile({
        path: path.join(dstDir, r.name),
        source: 'merge-agents',
        mode: 'appended',
      });
    }
  }
}

function executeSeedMemory(
  section: SeedMemorySection,
  dryRun: boolean,
  summary: InstallSummary,
  collector?: ManifestCollector,
): void {
  const { srcDir, dstDir, files: seedFiles } = section;

  if (!fse.existsSync(srcDir)) return;
  if (!dryRun) fse.ensureDirSync(dstDir);

  // 如果指定了文件列表，仅初始化这些文件；否则初始化全部
  const files = seedFiles ?? fs.readdirSync(srcDir);
  for (const file of files) {
    const target = path.join(dstDir, file);
    const src = path.join(srcDir, file);

    if (fse.existsSync(target)) {
      summary.filesSkipped++;
      continue;
    }

    if (fse.existsSync(src)) {
      if (!dryRun) fse.copySync(src, target);
      summary.filesCreated++;
      collector?.recordMemorySeed(target);
      collector?.recordFile({ path: target, source: 'seed-memory', mode: 'created' });
    }
  }
}

function executePermissions(section: PermissionsSection, dryRun: boolean): void {
  if (dryRun) return;

  const { dir, extension, mode } = section;
  if (!fse.existsSync(dir)) return;

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(extension)) continue;
    const fp = path.join(dir, file);
    try {
      fs.chmodSync(fp, mode);
    } catch {
      // 跳过不可读文件
    }
  }
}

// ─── 清单辅助函数 ──────────────────────────────────────────

/**
 * 记录全新写入的 settings 对象中的所有条目
 * （全新安装或覆盖损坏文件时调用）。对于全新安装，
 * 所有 hooks/env/autoMemoryEnabled 均来自模板。
 */
function recordSettingsEntries(
  settings: Record<string, unknown>,
  collector?: ManifestCollector,
): void {
  if (!collector) return;

  // 记录 hooks
  const hooks = settings.hooks as Record<string, unknown> | undefined;
  if (hooks && typeof hooks === 'object') {
    for (const [event, hooksList] of Object.entries(hooks)) {
      if (Array.isArray(hooksList)) {
        for (const entry of hooksList) {
          collector.recordHook(event, entry as Record<string, unknown>);
        }
      }
    }
  }

  // 记录环境变量
  const env = settings.env as Record<string, string> | undefined;
  if (env && typeof env === 'object') {
    for (const [key, value] of Object.entries(env)) {
      collector.recordEnvVar(key, value);
    }
  }

  // 记录 autoMemoryEnabled
  if ('autoMemoryEnabled' in settings) {
    collector.recordAutoMemoryEnabled();
  }

  // 记录 permissions.allow
  const perms = settings.permissions as Record<string, unknown> | undefined;
  if (perms && typeof perms === 'object' && Array.isArray(perms.allow)) {
    for (const rule of perms.allow as string[]) {
      collector.recordPermissionAllow(rule);
    }
  }
}
