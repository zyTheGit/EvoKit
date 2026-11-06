// forge 命令（T-M4.2 生成链 + T-M4.4 试用期审计）：
//   无参              列出达标簇（confirmed 且 type ∈ workflow|pattern 的卡按 tags Jaccard ≥ 0.5 聚簇）
//   --from-tags a,b   选 tags 含任一给定标签的卡（type ∈ workflow|pattern），不足 forgeClusterMin 报错
//   --topic "…"       按 标题/tags/body 关键词选卡，同样不足报错
//   --agent <id>      显式执行者（执行者链同 distill：distillAgentOrder 降级；claude 不进自动链，显式指定时可用）
//   --audit           试用期审计（trial 满期 0 uses 退役 / vetoed 提示 / 父卡过半 validUntil 过期提示重审）
// 依据 docs/zh/MEMORY-ENGINE-IMPLEMENTATION-PLAN.md §2.4（forge 流程与 D5/D6 裁决）与 §3.5 任务卡。
// 纪律：生成失败（执行者不可用/超时/输出为空/缺 name）不落半成品，已建目录回滚删除。

import {
  existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync,
  rmSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { AGENTS_SKILLS_DIR, KNOWLEDGE_DIR, expandPath } from '../paths.js';
import { listCards, readCardById } from '../knowledge-cards.js';
import { findClusters } from '../cluster.js';
import { detectAgentClis, runAgentCli } from '../agents-cli.js';
import { resolveDistillAgent, renderPrompt } from '../distill.js';
import { loadEngineConfig } from './harvest.js';
import { DEFAULT_PROMPTS } from '../defaults.js';

/** 可参与锻造的卡片类型（与 cluster.js 口径一致：fact/pitfall 不锻造） */
const FORGEABLE_TYPES = new Set(['workflow', 'pattern']);

/** trial 试用期天数（超过且 uses=0 → --audit 退役） */
const TRIAL_MAX_DAYS = 30;

/** 解析 `--flag <value>`；缺失返回 null */
function flagValue(args, flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  const v = args[i + 1];
  return v && !v.startsWith('-') ? v : null;
}

/** 解析 `--flag <value>` 必填值；缺失即抛错（forgeCommand 统一捕获置退出码） */
function requireValue(args, idx, flag, example) {
  const v = args[idx + 1];
  if (!v || v.startsWith('-')) throw new Error(`${flag} 需要跟一个值，例如 ${example}`);
  return v;
}

/** forgeClusterMin 解析（非法回落 3，与 DEFAULT_KNOWLEDGE.forgeClusterMin 一致） */
function parseMinSize(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

/** 本地日期 YYYY-MM-DD（validUntil 比较，与 knowledge-cards.js 同法） */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * `evokit forge` 入口
 * @param {string[]} args 参数（不含 'forge' 本身）：--from-tags a,b / --topic "…" / --agent <id> / --audit
 */
export function forgeCommand(args) {
  try {
    if (args.includes('--audit')) {
      auditSkills();
      return;
    }
    const tagsIdx = args.indexOf('--from-tags');
    const topicIdx = args.indexOf('--topic');
    if (tagsIdx === -1 && topicIdx === -1) {
      listClusters();
      return;
    }
    const { config, knowledge } = loadEngineConfig();
    const minSize = parseMinSize(knowledge.forgeClusterMin);
    const confirmed = listCards(KNOWLEDGE_DIR, { excludeHidden: true })
      .filter((c) => c.front.status === 'confirmed' && FORGEABLE_TYPES.has(String(c.front.type || '')));
    let selected = [];
    let topic = '';
    if (tagsIdx !== -1) {
      const v = requireValue(args, tagsIdx, '--from-tags', '--from-tags element-ui,pms');
      const tags = v.split(',').map((s) => s.trim()).filter(Boolean);
      if (tags.length === 0) throw new Error('--from-tags 需要至少一个标签，例如 --from-tags element-ui,pms');
      const tagSet = new Set(tags);
      selected = confirmed.filter((c) => (Array.isArray(c.front.tags) ? c.front.tags : []).some((t) => tagSet.has(String(t))));
      topic = tags.join(',');
    } else {
      topic = requireValue(args, topicIdx, '--topic', '--topic "发布流程"');
      const kw = topic.toLowerCase();
      selected = confirmed.filter((c) => {
        const inTitle = String(c.front.title || '').toLowerCase().includes(kw);
        const inTags = (Array.isArray(c.front.tags) ? c.front.tags : []).some((t) => String(t).toLowerCase().includes(kw));
        const inBody = String(c.body || '').toLowerCase().includes(kw);
        return inTitle || inTags || inBody;
      });
    }
    if (selected.length < minSize) {
      throw new Error(`达标卡片不足：当前筛选命中 ${selected.length} 张，锻造至少需要 ${minSize} 张`
        + `（confirmed 且 type ∈ workflow|pattern；可先运行 \`evokit forge\` 查看达标簇）`);
    }
    selected.sort((a, b) => a.id.localeCompare(b.id)); // 确定顺序
    generateSkill(selected, topic, flagValue(args, '--agent'), config, knowledge);
  } catch (e) {
    console.error(`✗ forge 失败：${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

/** 无参：列出达标簇 + 建议命令 */
function listClusters() {
  if (!existsSync(KNOWLEDGE_DIR)) {
    console.log(`ℹ 知识根尚未初始化（缺 ${KNOWLEDGE_DIR}），先运行 \`evokit knowledge init\`。`);
    return;
  }
  const { knowledge } = loadEngineConfig();
  const minSize = parseMinSize(knowledge.forgeClusterMin);
  const confirmed = listCards(KNOWLEDGE_DIR, { excludeHidden: true })
    .filter((c) => c.front.status === 'confirmed')
    // findClusters 入参契约是扁平结构 {id,tags,type,status}（见 test-m4-lib.mjs），listCards 行需映射
    .map((c) => ({ id: c.id, tags: Array.isArray(c.front.tags) ? c.front.tags.map(String) : [], type: String(c.front.type || ''), status: String(c.front.status || '') }));
  const clusters = findClusters(confirmed, { minSize });
  if (clusters.length === 0) {
    console.log(`ℹ 暂无达标簇（confirmed 且 type ∈ workflow|pattern 的卡，tags Jaccard ≥ 0.5 聚簇、≥ ${minSize} 张触发）。`);
    return;
  }
  console.log(`🔧 可锻造簇（${clusters.length} 个，≥${minSize} 张 confirmed 卡）：\n`);
  clusters.forEach((cl, i) => {
    console.log(`  ${i + 1}. tags=${cl.tags.map((t) => `#${t}`).join('')}  卡 ${cl.cardIds.length} 张`);
    console.log(`     cardIds: ${cl.cardIds.join(', ')}`);
    console.log(`     建议：evokit forge --from-tags ${cl.tags.slice(0, 3).join(',')}`);
  });
}

/** 从 agent 输出解析 SKILL.md frontmatter 的 name；无 frontmatter/name 返回 null */
function extractSkillName(md) {
  const m = String(md || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const nm = m[1].match(/^name:[ \t]*(.+)$/m);
  if (!nm) return null;
  return nm[1].trim().replace(/^["']|["']$/g, '');
}

/** slug 化：小写 + 非法字符剔除（保留 a-z0-9-）；剔完为空返回 ''（由调用方报错） */
function slugifyName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** AGENTS_SKILLS_DIR 下唯一目录名：冲突加 -2/-3… 后缀 */
function uniqueSkillDir(base) {
  if (!existsSync(join(AGENTS_SKILLS_DIR, base))) return base;
  let i = 2;
  while (existsSync(join(AGENTS_SKILLS_DIR, `${base}-${i}`))) i += 1;
  return `${base}-${i}`;
}

/**
 * 选卡完成后走执行者链生成草稿（T-M4.2）：
 * 拼 prompts.forge（{cards}=卡片 JSON、{topic}=主题）→ distill 同款执行者链 → runAgentCli →
 * slug 化 name → 写 <AGENTS_SKILLS_DIR>/<name>/SKILL.md（agent 原始输出，trim）+ generation.json（trial）。
 */
function generateSkill(cards, topic, agentOverride, config, knowledge) {
  const tpl = (config.prompts && config.prompts.forge) || DEFAULT_PROMPTS.forge;
  const payload = cards.map((c) => ({
    id: c.id,
    title: String(c.front.title ?? ''),
    type: String(c.front.type ?? ''),
    tags: Array.isArray(c.front.tags) ? c.front.tags.map(String) : [],
    statement: String(c.front.statement ?? '') || c.body,
    body: c.body,
    source: String(c.front.source ?? ''),
  }));
  const prompt = renderPrompt(tpl, { cards: JSON.stringify(payload, null, 1), topic });

  // 执行者链同 distill（T-M2.3 复用）：distillAgentOrder 降级，claude 不进自动链，--agent 显式覆盖
  const clis = detectAgentClis();
  const chainRes = resolveDistillAgent(agentOverride, knowledge.distillAgentOrder, clis);
  if (!chainRes.ok) throw new Error(chainRes.error);
  if (chainRes.chain.length === 0) {
    console.error('  提示：在 settings.json 的 agents[].cli 配置执行者 CLI，或用 --agent <id> 显式指定。');
    throw new Error('无可用执行者（distillAgentOrder 内均未检测到可用 CLI），未生成草稿');
  }
  let res = null;
  let lastErr = '';
  for (const def of chainRes.chain) {
    const r = runAgentCli(def, prompt);
    if (r.ok) {
      res = { ...r, agentId: def.id };
      break;
    }
    lastErr = r.error || '未知错误';
  }
  if (!res) throw new Error(`执行者链全部失败，未生成草稿：${lastErr}`);

  const raw = String(res.output || '').trim();
  if (!raw) throw new Error('执行者输出为空，未生成草稿');
  const rawName = extractSkillName(raw);
  if (!rawName) throw new Error('执行者输出缺少 YAML frontmatter 的 name 字段（模板要求 name + description），未生成草稿');
  const slug = slugifyName(rawName);
  if (!slug) throw new Error(`无法从输出 name「${rawName}」得到合法技能名（小写字母/数字/连字符），未生成草稿`);
  const name = uniqueSkillDir(slug);
  const dir = join(AGENTS_SKILLS_DIR, name);

  const generation = {
    generatedBy: 'evokit forge',
    generatedAt: new Date().toISOString(),
    parentCards: cards.map((c) => c.id),
    sourceType: 'evokit',
    topic,
    tags: [...new Set(cards.flatMap((c) => (Array.isArray(c.front.tags) ? c.front.tags.map(String) : [])))].sort(),
    review: { status: 'trial', uses: 0, vetoed: false },
    distributedTo: [],
  };
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), raw, 'utf-8');
    writeFileSync(join(dir, 'generation.json'), JSON.stringify(generation, null, 2) + '\n', 'utf-8');
  } catch (e) {
    rmSync(dir, { recursive: true, force: true }); // 回滚半成品
    throw new Error(`草稿落盘失败（已回滚删除 ${dir}）：${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(`✓ forge 技能草稿已生成：${dir}`);
  console.log(`  执行者=${res.agentId} · 父卡 ${cards.length} 张 · topic=${topic || '-'} · review.status=trial`);
  console.log(`  下一步：\`evokit review --skill\` 过目，通过后 \`evokit review --skill-accept ${name}\` 分发。`);
  return { name, dir, generation };
}

/** generatedAt 距今的天数；无法解析返回 null（不能判定就不退役） */
function ageInDays(iso, nowMs) {
  const t = Date.parse(String(iso ?? ''));
  if (Number.isNaN(t)) return null;
  return Math.floor((nowMs - t) / 86400000);
}

/**
 * 回收一个分发落点：只删链接/junction（lstat 判定，参照 makeSymlink 的保护逻辑），绝不删真实目录/文件。
 * @returns {'removed'|'missing'|'kept'} removed=已删链接；missing=落点本就不存在；kept=非链接，保留
 */
function removeDistributedLink(target) {
  let st;
  try {
    st = lstatSync(target);
  } catch {
    return 'missing';
  }
  try {
    if (st.isSymbolicLink()) {
      unlinkSync(target);
      return 'removed';
    }
    if (st.isDirectory() && process.platform === 'win32') {
      // Windows junction 被 lstat 报告为目录；readlinkSync 成功才确认是链接点（真实目录会抛错）
      readlinkSync(target);
      rmSync(target, { recursive: false, force: true });
      return 'removed';
    }
    return 'kept';
  } catch {
    return 'kept';
  }
}

/**
 * 退役一个 trial 技能（T-M4.4）：按 distributedTo 回收链接 → 目录移入 .retired/<name>/
 * （重名加时间戳后缀）→ .retired 内副本 generation.json 置 review.status=retired。
 */
function retireSkill(name, gen, nowMs) {
  const dir = join(AGENTS_SKILLS_DIR, name);
  const distributed = Array.isArray(gen.distributedTo) ? gen.distributedTo.map(String) : [];
  let removed = 0;
  const kept = [];
  for (const p of distributed) {
    const outcome = removeDistributedLink(expandPath(p));
    if (outcome === 'removed') removed += 1;
    else if (outcome === 'kept') kept.push(p);
  }
  const retiredRoot = join(AGENTS_SKILLS_DIR, '.retired');
  mkdirSync(retiredRoot, { recursive: true });
  let dest = join(retiredRoot, name);
  if (existsSync(dest)) {
    const d = new Date(nowMs);
    const p = (n) => String(n).padStart(2, '0');
    dest = join(retiredRoot, `${name}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`);
  }
  renameSync(dir, dest);
  const prevReview = gen.review && typeof gen.review === 'object' ? gen.review : {};
  const movedGen = { ...gen, review: { ...prevReview, status: 'retired' } };
  writeFileSync(join(dest, 'generation.json'), JSON.stringify(movedGen, null, 2) + '\n', 'utf-8');
  return { dest, removed, kept };
}

/** --audit：试用期审计（除退役目录移动与副本状态更新外只读汇总，dry-run 性质） */
function auditSkills() {
  if (!existsSync(AGENTS_SKILLS_DIR)) {
    console.log(`ℹ 技能源目录不存在（${AGENTS_SKILLS_DIR}），无技能可审计。`);
    return;
  }
  const nowMs = Date.now();
  const today = todayStr();
  const entries = readdirSync(AGENTS_SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'));
  const retired = [];
  const vetoed = [];
  const rereview = [];
  const trialing = [];
  let parseErrors = 0;
  let active = 0;
  for (const ent of entries) {
    const genFile = join(AGENTS_SKILLS_DIR, ent.name, 'generation.json');
    if (!existsSync(genFile)) continue; // 外来技能（无 forge 元数据）不归 forge 审计管
    let gen = null;
    try {
      gen = JSON.parse(readFileSync(genFile, 'utf-8'));
    } catch {
      parseErrors += 1;
      console.warn(`⚠ ${ent.name} 的 generation.json 解析失败，跳过`);
      continue;
    }
    const review = gen && gen.review && typeof gen.review === 'object' ? gen.review : {};
    const status = String(review.status || '');
    if (status === 'trial') {
      const age = ageInDays(gen.generatedAt, nowMs);
      const uses = Number.isFinite(Number(review.uses)) ? Number(review.uses) : 0;
      if (age !== null && age > TRIAL_MAX_DAYS && uses === 0) {
        const r = retireSkill(ent.name, gen, nowMs);
        retired.push(`${ent.name}（已 ${age} 天 · uses=0）→ ${r.dest}；回收链接 ${r.removed} 处${r.kept.length ? `，非链接落点保留 ${r.kept.length} 处` : ''}`);
      } else {
        trialing.push(`${ent.name}（试用中${age !== null ? `，已 ${age} 天` : ''} · uses=${uses}）`);
      }
    } else if (status === 'vetoed') {
      vetoed.push(ent.name);
    } else if (status === 'confirmed') {
      const parentCards = Array.isArray(gen.parentCards) ? gen.parentCards.map(String) : [];
      const expired = parentCards.filter((id) => {
        const card = readCardById(KNOWLEDGE_DIR, id);
        const vu = card && card.front ? String(card.front.validUntil ?? '') : '';
        return vu !== '' && vu < today;
      });
      if (parentCards.length > 0 && expired.length > parentCards.length / 2) {
        rereview.push(`${ent.name}（父卡 ${expired.length}/${parentCards.length} 张 validUntil 已过期）→ 技能需重审`);
      } else {
        active += 1;
      }
    } else {
      active += 1; // retired 等其他状态：已在 .retired 或外来状态，不动
    }
  }
  console.log(`🔍 forge --audit — ${AGENTS_SKILLS_DIR}`);
  console.log(`  ① 退役（trial 满期 >${TRIAL_MAX_DAYS} 天且 uses=0）：${retired.length} 个`);
  for (const l of retired) console.log(`    · ${l}`);
  console.log(`  ② 已否决（vetoed，不动）：${vetoed.length} 个`);
  for (const n of vetoed) console.log(`    · ${n}`);
  console.log(`  ③ 需重审（confirmed 且父卡过半 validUntil 过期）：${rereview.length} 个`);
  for (const l of rereview) console.log(`    · ${l}`);
  const rest = [`试用中 ${trialing.length}`, `正常 confirmed ${active}`];
  if (parseErrors) rest.push(`解析异常 ${parseErrors}`);
  console.log(`  其余：${rest.join(' · ')}`);
  if (retired.length === 0 && vetoed.length === 0 && rereview.length === 0) {
    console.log('✓ 无需处理项。');
  }
}
