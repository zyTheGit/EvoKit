// 记忆引擎 M4 聚簇器（T-M4.1）：confirmed 且 type ∈ {workflow, pattern} 的知识卡按 tags 相似度聚簇
// 依据 docs/zh/MEMORY-ENGINE-IMPLEMENTATION-PLAN.md §2.4 forge 流程与 §3.5 T-M4.1 任务卡：
// 两卡 tags Jaccard ≥ 0.5 归同簇，簇 ≥ forgeClusterMin(3) 触发；forge --from-tags 以达标簇为取卡输入。

/** 可参与聚簇的卡片类型（fact/pitfall 不参与锻造） */
const CLUSTERABLE_TYPES = new Set(['workflow', 'pattern']);

/**
 * 计算两个标签集合的 Jaccard 相似度：|A∩B| / |A∪B|。
 * 入参为字符串数组（内部先去重）；任一为空集时相似度记 0（避免除零，空标签卡互不聚簇）。
 * 纯函数：不修改入参。
 */
export function jaccard(a, b) {
  const sa = a instanceof Set ? a : new Set(Array.isArray(a) ? a : []);
  const sb = b instanceof Set ? b : new Set(Array.isArray(b) ? b : []);
  if (sa.size === 0 || sb.size === 0) return 0;
  const [small, large] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  let inter = 0;
  for (const t of small) if (large.has(t)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

/**
 * 从卡片数组中提取可锻造的标签簇。
 * 只取 status === 'confirmed' 且 type ∈ {workflow, pattern} 的卡；
 * 两卡 tags 的 Jaccard ≥ jaccardThreshold 归同一簇（union-find，相似关系具备传递性）。
 * 返回簇数组 [{ tags: [成员标签并集，字典序], cardIds: [成员卡 id，字典序] }]，
 * 按 cardIds 数降序、同长按首 id 字典序升序；成员数不足 minSize 的簇丢弃。
 * 纯函数：不修改入参；输入为空 / 单卡 / 非数组时返回 []。
 */
export function findClusters(cards, { minSize = 3, jaccardThreshold = 0.5 } = {}) {
  const list = Array.isArray(cards) ? cards : [];
  // 过滤可参与聚簇的卡，并规范化 tags（去重、剔除非字符串项）
  const eligible = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    if (item.status !== 'confirmed') continue;
    if (!CLUSTERABLE_TYPES.has(item.type)) continue;
    const tags = new Set(Array.isArray(item.tags) ? item.tags.filter(t => typeof t === 'string') : []);
    eligible.push({ id: String(item.id), tags });
  }
  const n = eligible.length;
  if (n < 2) return [];

  // union-find：两两比对 tags 相似度，达标即并入同一集合
  const parent = eligible.map((_, i) => i);
  const find = x => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]; // 路径减半
      x = parent[x];
    }
    return x;
  };
  const union = (x, y) => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent[rx] = ry;
  };
  for (let i = 0; i < n; i++) {
    for (let k = i + 1; k < n; k++) {
      if (jaccard(eligible[i].tags, eligible[k].tags) >= jaccardThreshold) union(i, k);
    }
  }

  // 按根归组：收集成员 id 与标签并集
  const groups = new Map(); // root -> { cardIds: string[], tags: Set<string> }
  for (let i = 0; i < n; i++) {
    const root = find(i);
    let g = groups.get(root);
    if (!g) {
      g = { cardIds: [], tags: new Set() };
      groups.set(root, g);
    }
    g.cardIds.push(eligible[i].id);
    for (const t of eligible[i].tags) g.tags.add(t);
  }

  const clusters = [];
  for (const g of groups.values()) {
    if (g.cardIds.length < minSize) continue; // 不足 minSize 的簇丢弃
    clusters.push({ tags: [...g.tags].sort(), cardIds: g.cardIds.sort() });
  }
  // 输出排序：cardIds 数降序；同长按首 id 字典序升序（cardIds 已排好序，首 id 即最小 id）
  clusters.sort((x, y) =>
    (y.cardIds.length - x.cardIds.length)
    || (x.cardIds[0] < y.cardIds[0] ? -1 : x.cardIds[0] > y.cardIds[0] ? 1 : 0)
  );
  return clusters;
}
