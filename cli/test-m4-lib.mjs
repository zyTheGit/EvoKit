#!/usr/bin/env node
// M4 锻造层库模块自测（T-M4.1 聚簇器 cluster.js）
// 自包含、纯函数：node cli/test-m4-lib.mjs 直接运行，失败 exit 1。
// 覆盖：共享 2 tag 触发 / 仅 1 tag 不触发（阈值边界恰 0.5）、retired/draft 与 fact/pitfall 不计入、
//       簇 < minSize 丢弃、多簇互不污染、空输入/单卡不抛异常、排序确定性。

import assert from 'node:assert/strict';

import { findClusters, jaccard } from './src/cluster.js';

// ── 微型测试框架（与 test-m1-lib.mjs 同款）──
let passCount = 0, failCount = 0, assertCount = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passCount += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failCount += 1;
    failures.push(name);
    console.error(`  ✗ ${name}\n      ${e && e.message}`);
  }
}

function section(title) {
  console.log(`\n■ ${title}`);
}

// 断言包装：行为与 assert/strict 一致，仅额外计数用于汇总
function ok(value, message) { assertCount += 1; assert.ok(value, message); }
function eq(actual, expected, message) { assertCount += 1; assert.deepStrictEqual(actual, expected, message); }

/** 造卡：默认 type='workflow'、status='confirmed' */
function card(id, tags, type = 'workflow', status = 'confirmed') {
  return { id, tags, type, status };
}

// ── jaccard ──
section('jaccard 相似度');

test('完全相同的 tag 集 → 1', () => {
  eq(jaccard(['a', 'b', 'c'], ['c', 'b', 'a']), 1);
});

test('共享 2 tag、并集 4 → 恰 0.5（阈值边界）', () => {
  eq(jaccard(['a', 'b', 'x'], ['a', 'b', 'y']), 0.5);
});

test('仅共享 1 tag（1/5=0.2）< 0.5', () => {
  eq(jaccard(['a', 'b', 'c'], ['a', 'd', 'e']), 0.2);
});

test('不相交 tag 集 → 0', () => {
  eq(jaccard(['a', 'b'], ['c', 'd']), 0);
});

test('空集与单侧空集 → 0（除零保护）', () => {
  eq(jaccard([], []), 0);
  eq(jaccard(['a'], []), 0);
  eq(jaccard([], ['a']), 0);
});

test('入参重复 tag 先去重', () => {
  eq(jaccard(['a', 'a', 'b'], ['a', 'b', 'b']), 1);
});

// ── 触发边界 ──
section('聚簇触发边界（minSize=2 隔离两卡行为）');

test('共享 2 tag（jaccard 恰 0.5 ≥ 0.5）→ 触发，tags 为并集', () => {
  const clusters = findClusters(
    [card('c1', ['a', 'b', 'x']), card('c2', ['a', 'b', 'y'])],
    { minSize: 2 }
  );
  eq(clusters.length, 1);
  eq(clusters[0].cardIds, ['c1', 'c2']);
  eq(clusters[0].tags, ['a', 'b', 'x', 'y']); // 成员标签并集，字典序
});

test('仅共享 1 tag（jaccard 0.2 < 0.5）→ 不触发', () => {
  const clusters = findClusters(
    [card('c1', ['a', 'b', 'c']), card('c2', ['a', 'd', 'e'])],
    { minSize: 2 }
  );
  eq(clusters, []);
});

test('共享 2 tag 但 jaccard 0.4 < 0.5 → 不触发', () => {
  const clusters = findClusters(
    [card('c1', ['a', 'b', 'x']), card('c2', ['a', 'b', 'y', 'z'])],
    { minSize: 2 }
  );
  eq(clusters, []);
});

test('调低 jaccardThreshold=0.4 后同一对卡触发', () => {
  const clusters = findClusters(
    [card('c1', ['a', 'b', 'x']), card('c2', ['a', 'b', 'y', 'z'])],
    { minSize: 2, jaccardThreshold: 0.4 }
  );
  eq(clusters.length, 1);
  eq(clusters[0].cardIds, ['c1', 'c2']);
});

// ── 状态与类型过滤 ──
section('status / type 过滤');

test('retired 卡不计入', () => {
  const cards = [
    card('c1', ['a', 'b']),
    card('c2', ['a', 'b']),
    card('c3', ['a', 'b'], 'workflow', 'retired'),
  ];
  const clusters = findClusters(cards, { minSize: 2 });
  eq(clusters.length, 1);
  eq(clusters[0].cardIds, ['c1', 'c2']);
  ok(!clusters[0].cardIds.includes('c3'), 'retired 卡不得进入簇');
});

test('draft 卡不计入', () => {
  const cards = [
    card('c1', ['a', 'b']),
    card('c2', ['a', 'b']),
    card('c3', ['a', 'b'], 'workflow', 'draft'),
  ];
  const clusters = findClusters(cards, { minSize: 2 });
  eq(clusters.length, 1);
  eq(clusters[0].cardIds, ['c1', 'c2']);
  ok(!clusters[0].cardIds.includes('c3'), 'draft 卡不得进入簇');
});

test('fact / pitfall 类型不参与', () => {
  for (const type of ['fact', 'pitfall']) {
    const cards = [
      card('c1', ['a', 'b']),
      card('c2', ['a', 'b']),
      card('c3', ['a', 'b'], type),
    ];
    const clusters = findClusters(cards, { minSize: 2 });
    eq(clusters.length, 1, `type=${type} 不得参与聚簇`);
    eq(clusters[0].cardIds, ['c1', 'c2']);
    ok(!clusters[0].cardIds.includes('c3'), `type=${type} 卡不得进入簇`);
  }
});

test('pattern 类型参与聚簇', () => {
  const cards = [
    card('p1', ['a', 'b'], 'pattern'),
    card('p2', ['a', 'b'], 'pattern'),
    card('p3', ['a', 'b'], 'pattern'),
  ];
  const clusters = findClusters(cards); // 默认 minSize=3
  eq(clusters.length, 1);
  eq(clusters[0].cardIds, ['p1', 'p2', 'p3']);
});

// ── minSize ──
section('minSize 丢弃');

test('默认参数（minSize=3）：两卡成簇但不足 3 → 丢弃', () => {
  const cards = [card('c1', ['a', 'b']), card('c2', ['a', 'b'])];
  eq(findClusters(cards), []);
});

test('三卡成簇且默认 minSize=3 → 保留', () => {
  const cards = [
    card('c1', ['a', 'b', 'x']),
    card('c2', ['a', 'b', 'y']),
    card('c3', ['a', 'b', 'z']),
  ];
  const clusters = findClusters(cards); // 两两恰 0.5，传递性归同簇
  eq(clusters.length, 1);
  eq(clusters[0].cardIds, ['c1', 'c2', 'c3']);
});

test('minSize=4：三卡成簇仍被丢弃', () => {
  const cards = [
    card('c1', ['a', 'b']),
    card('c2', ['a', 'b']),
    card('c3', ['a', 'b']),
  ];
  eq(findClusters(cards, { minSize: 4 }), []);
});

// ── 多簇隔离 ──
section('多簇互不污染');

test('两个不相交簇各自独立，按大小/首 id 排序', () => {
  const cards = [
    card('p2', ['q', 'r', 's']),
    card('a1', ['a', 'b', 'x']),
    card('p1', ['q', 'r', 't']),
    card('a2', ['a', 'b', 'y']),
    card('p3', ['q', 'r', 'u']),
    card('a3', ['a', 'b', 'z']),
  ];
  const clusters = findClusters(cards);
  eq(clusters.length, 2);
  // 两簇等大（各 3），按首 id 字典序：a1 簇在前
  eq(clusters[0].cardIds, ['a1', 'a2', 'a3']);
  eq(clusters[0].tags, ['a', 'b', 'x', 'y', 'z']);
  eq(clusters[1].cardIds, ['p1', 'p2', 'p3']);
  eq(clusters[1].tags, ['q', 'r', 's', 't', 'u']);
  ok(!clusters[0].cardIds.some(id => id.startsWith('p')), '第一簇不得混入 p 簇成员');
  ok(!clusters[1].cardIds.some(id => id.startsWith('a')), '第二簇不得混入 a 簇成员');
});

test('大簇排在小簇前面（cardIds 数降序）', () => {
  const cards = [
    card('s1', ['s']),
    card('s2', ['s']),
    card('b1', ['b']),
    card('b2', ['b']),
    card('b3', ['b']),
  ];
  const clusters = findClusters(cards, { minSize: 2 });
  eq(clusters.length, 2);
  eq(clusters[0].cardIds, ['b1', 'b2', 'b3']);
  eq(clusters[1].cardIds, ['s1', 's2']);
});

// ── 空输入 / 单卡 / 纯函数 ──
section('空输入与防御');

test('空数组 → [] 不抛异常', () => {
  eq(findClusters([]), []);
});

test('单卡 → []（无配对可比）', () => {
  eq(findClusters([card('c1', ['a', 'b'])]), []);
});

test('null / 非数组输入 → []', () => {
  eq(findClusters(null), []);
  eq(findClusters(undefined), []);
});

test('纯函数：不修改入参卡片', () => {
  const c1 = card('c1', ['a', 'b', 'x']);
  const c2 = card('c2', ['a', 'b', 'y']);
  const snapshot = JSON.stringify([c1, c2]);
  findClusters([c1, c2], { minSize: 2 });
  eq(JSON.stringify([c1, c2]), snapshot);
});

// ── 排序确定性 ──
section('排序确定性');

test('两次调用结果全等', () => {
  const cards = [
    card('p2', ['q', 'r', 's']),
    card('a1', ['a', 'b', 'x']),
    card('p1', ['q', 'r', 't']),
    card('a2', ['a', 'b', 'y']),
    card('a3', ['a', 'b', 'z']),
  ];
  eq(findClusters(cards), findClusters(cards));
});

test('输入顺序打乱后输出仍一致（cardIds / tags 已规范化排序）', () => {
  const build = () => [
    card('p2', ['q', 'r', 's']),
    card('a1', ['a', 'b', 'x']),
    card('p1', ['q', 'r', 't']),
    card('a2', ['a', 'b', 'y']),
    card('p3', ['q', 'r', 'u']),
    card('a3', ['a', 'b', 'z']),
  ];
  const forward = findClusters(build(), { minSize: 2 });
  const reversed = findClusters(build().reverse(), { minSize: 2 });
  eq(forward, reversed);
});

// ── 汇总 ──
console.log(`\n${passCount} 通过 / ${failCount} 失败 / ${assertCount} 断言`);
if (failCount > 0) {
  console.error(`失败用例：\n  - ${failures.join('\n  - ')}`);
  process.exitCode = 1;
}
