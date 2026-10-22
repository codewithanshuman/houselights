import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeSlate } from '../server/optimizer.mjs';

const act = (id, fit, fee, genre = '', overrides = {}) => ({
  id, name: id.toUpperCase(), fit, rank: 1, found: false,
  momentum: 'flat', local: 'no data',
  evidence: { rank: true, local: true, comparison: true, trends: true },
  receipts: [`receipt-${id}`], terms: { fee, genre, available: true }, tags: [],
  ...overrides,
});
const constraints = overrides => ({ budget: 100, slots: 2, discoveryMin: 0, maxPerGenre: 2, riskTolerance: 50, lockedIds: [], excludedIds: [], ...overrides });

test('the exact optimizer finds a feasible pair that greedy affinity selection misses', () => {
  const result = optimizeSlate([act('a', 1, 90, 'rock'), act('b', 0.85, 45, 'folk'), act('c', 0.8, 45, 'jazz')], constraints({ budget: 90 }));
  assert.equal(result.status, 'optimal');
  assert.deepEqual(result.selectedIds, ['b', 'c']);
  assert.equal(result.totalFee, 90);
  assert.equal(result.remainingBudget, 0);
  assert.equal(result.objectiveBreakdown.fit, 82.5);
  assert.equal(result.objectiveBreakdown.genreBreadth, 2);
  assert.equal(result.checkedCount, 3);
  assert.equal(result.feasibleCount, 1);
  assert.deepEqual(result.receiptIds, ['receipt-b', 'receipt-c']);
});

test('global optimality agrees with an independent three-act oracle across budgets', () => {
  // All supporting evidence is present and genres are unknown: the declared
  // score is exactly average fit, which provides an independent oracle.
  const candidates = [
    act('a', 0.95, 61), act('b', 0.85, 49), act('c', 0.78, 35),
    act('d', 0.67, 27), act('e', 0.53, 19), act('f', 0.42, 13),
    act('g', 0.3, 7), act('h', 0.15, 3),
  ];
  for (const budget of [0, 23, 30, 40, 60, 80, 100, 130, 200]) {
    const options = [];
    for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) for (let k = j + 1; k < candidates.length; k++) {
      const selected = [candidates[i], candidates[j], candidates[k]];
      const cost = selected.reduce((sum, item) => sum + item.terms.fee, 0);
      if (cost <= budget) options.push({ ids: selected.map(item => item.id), cost, score: selected.reduce((sum, item) => sum + item.fit, 0) * 100 / 3 });
    }
    options.sort((a, b) => b.score - a.score || a.cost - b.cost || a.ids.join('').localeCompare(b.ids.join('')));
    const result = optimizeSlate(candidates, constraints({ budget, slots: 3, maxPerGenre: 3 }));
    assert.equal(result.checkedCount, 56);
    assert.equal(result.feasibleCount, options.length);
    assert.equal(result.feasible, options.length > 0);
    if (options.length) {
      assert.deepEqual(result.selectedIds, options[0].ids);
      assert.ok(Math.abs(result.score - options[0].score) <= 0.000001);
    }
  }
});

test('locks, exclusions, discovery, genre cap and availability are simultaneous hard constraints', () => {
  const candidates = [
    act('a', 1, 20, 'rock'),
    act('b', 0.9, 20, 'ROCK', { found: true }),
    act('c', 0.7, 20, 'jazz', { found: true }),
    act('d', 1, 0, 'folk', { terms: { fee: 0, genre: 'folk', available: false } }),
    act('e', 1, 20, 'pop', { found: true }),
  ];
  const result = optimizeSlate(candidates, constraints({ lockedIds: ['a'], excludedIds: ['e'], discoveryMin: 1, maxPerGenre: 1 }));
  assert.deepEqual(result.selectedIds, ['a', 'c']);
  assert.equal(result.feasibleCount, 1);
  assert.equal(result.objectiveBreakdown.discovery, 0.5);
  assert.ok(result.alternatives.some(item => item.addedId === 'b' && item.violations.some(reason => reason.includes('rock'))));
  assert.ok(result.alternatives.some(item => item.removedId === 'a' && item.violations.some(reason => reason.includes('Locked'))));
  assert.ok(result.alternatives.some(item => item.addedId === 'd' && !item.feasible));
  assert.ok(result.alternatives.some(item => item.addedId === 'e' && !item.feasible));
});

test('unknown and invalid fees are not silently estimated, while an explicit zero fee is valid', () => {
  const candidates = [act('unknown', 1, null), act('negative', 1, -1), act('string', 1, '0'), act('zero', 0.4, 0), act('paid', 0.5, 20)];
  const result = optimizeSlate(candidates, constraints({ budget: 20 }));
  assert.deepEqual(result.selectedIds, ['zero', 'paid']);
  assert.equal(result.diagnostics.candidateExclusions.length, 3);
  const unknownSwap = result.alternatives.find(item => item.addedId === 'unknown');
  assert.equal(unknownSwap.totalFee, null);
  assert.equal(unknownSwap.costDelta, null);
  assert.equal(unknownSwap.feasible, false);
  const impossible = optimizeSlate([act('unknown', 1, null)], constraints({ slots: 1 }));
  assert.equal(impossible.status, 'infeasible');
  assert.equal(impossible.totalFee, null);
  assert.equal(impossible.diagnostics.nearestSlates[0].totalFee, null);
});

test('missing affinity or rank evidence cannot become a confident taste recommendation', () => {
  const candidates = [
    act('unsupported', 1, 10, '', { evidence: { rank: false, local: false, comparison: false, trends: false }, momentum: 'rising', local: 'yes' }),
    act('absent', null, 10),
  ];
  const result = optimizeSlate(candidates, constraints());
  assert.equal(result.feasible, true);
  assert.equal(result.status, 'provisional');
  assert.equal(result.confidence.level, 'insufficient');
  assert.equal(result.objectiveBreakdown.fit, 0);
  assert.equal(result.objectiveBreakdown.momentum, 0);
  assert.equal(result.objectiveBreakdown.local, 0);
  assert.equal(result.objectiveBreakdown.genreBreadth, 0);
  assert.ok(result.objectiveBreakdown.riskPenalty < 0);
  assert.deepEqual(result.confidence.missingFitIds, ['unsupported', 'absent']);
  assert.match(result.reasons.join(' '), /provisional/i);
  const mixed = optimizeSlate([act('known', 0.6, 10), candidates[0]], constraints());
  assert.equal(mixed.status, 'provisional');
  assert.equal(mixed.confidence.level, 'mixed');
});

test('discovery means Qloo-surfaced candidate, never low affinity or an arbitrary tag', () => {
  const result = optimizeSlate([
    act('a', 0.9, 10, '', { tags: ['discovery'] }),
    act('b', 0.1, 10, '', { rank: 99 }),
    act('c', 0.7, 10, '', { found: true }),
  ], constraints({ slots: 1, discoveryMin: 1 }));
  assert.deepEqual(result.selectedIds, ['c']);
  assert.equal(result.objectiveBreakdown.discovery, 1);
});

test('budget infeasibility gives the minimum required budget without relaxing other rules', () => {
  const result = optimizeSlate([act('a', 0.9, 60), act('b', 0.8, 50), act('c', 0.2, 45)], constraints({ budget: 80 }));
  assert.equal(result.status, 'infeasible');
  assert.deepEqual(result.selectedIds, []);
  assert.equal(result.score, null);
  assert.equal(result.diagnostics.relaxations.minimumBudget, 95);
  assert.equal(result.diagnostics.relaxations.additionalBudget, 15);
  assert.ok(result.reasons.some(reason => reason.includes('95.00')));
  assert.ok(result.diagnostics.nearestSlates.every(slate => !slate.feasible));
});

test('contradictory constraints and insufficient candidate counts explain infeasibility', () => {
  const candidates = [act('a', 0.9, 10), act('b', 0.8, 10)];
  const overlap = optimizeSlate(candidates, constraints({ lockedIds: ['a'], excludedIds: ['a'] }));
  assert.equal(overlap.status, 'infeasible');
  assert.ok(overlap.reasons.some(reason => reason.includes('both locked and excluded')));
  const locks = optimizeSlate(candidates, constraints({ slots: 1, lockedIds: ['a', 'b'] }));
  assert.equal(locks.status, 'infeasible');
  assert.ok(locks.reasons.some(reason => reason.includes('More acts are locked')));
  const insufficient = optimizeSlate(candidates, constraints({ slots: 3, discoveryMin: 4 }));
  assert.equal(insufficient.checkedCount, 0);
  assert.ok(insufficient.reasons.some(reason => reason.includes('2 candidates for 3')));
  assert.ok(insufficient.reasons.some(reason => reason.includes('minimum exceeds')));
});

test('invalid inputs are rejected before enumeration and do not mutate caller data', () => {
  const candidates = [act('a', 0.9, 10), act('b', 0.8, 20)];
  const initial = structuredClone(candidates);
  for (const options of [constraints({ budget: '100' }), constraints({ riskTolerance: NaN }), constraints({ slots: 1.5 }), constraints({ maxPerGenre: 0 }), constraints({ lockedIds: ['missing'] }), constraints({ excludedIds: 'a' })]) {
    const result = optimizeSlate(candidates, options);
    assert.equal(result.status, 'invalid');
    assert.equal(result.checkedCount, 0);
    assert.ok(result.reasons.length);
  }
  assert.equal(optimizeSlate([candidates[0], candidates[0]], constraints()).status, 'invalid');
  assert.equal(optimizeSlate([null], constraints()).status, 'invalid');
  assert.equal(optimizeSlate(null, constraints()).status, 'invalid');
  assert.equal(optimizeSlate(Array.from({ length: 13 }, (_, i) => act(String(i), 0.5, 10)), constraints()).status, 'invalid');
  optimizeSlate(candidates, constraints());
  assert.deepEqual(candidates, initial);
});

test('frontier contains only non-dominated cost/score options and chooses deterministic ties', () => {
  const candidates = [act('b', 0.5, 10), act('a', 0.5, 10), act('c', 0.8, 30), act('d', 0.6, 40), act('e', 1, 70)];
  const result = optimizeSlate(candidates, constraints({ slots: 1 }));
  assert.deepEqual(result.frontier.map(item => item.selectedIds), [['a'], ['c'], ['e']]);
  assert.equal(result.frontier[0].totalFee, 10);
  assert.equal(result.frontier[0].score, 50);
  const tied = optimizeSlate(candidates.slice(0, 2), constraints({ slots: 1 }));
  assert.deepEqual(tied.selectedIds, ['a']);
  assert.deepEqual(optimizeSlate(candidates.slice(0, 2).reverse(), constraints({ slots: 1 })).selectedIds, ['a']);
});

test('baseline explicitly identifies input order and compares only feasible booking slates', () => {
  const result = optimizeSlate([act('a', 0.3, 10), act('b', 0.4, 20), act('c', 0.9, 30)], constraints());
  assert.match(result.baseline.label, /input-order/);
  assert.match(result.baseline.label, /not a popularity/);
  assert.deepEqual(result.baseline.selectedIds, ['a', 'b']);
  assert.equal(result.baseline.scoreDelta, 30);
  const infeasible = optimizeSlate([act('a', 0.9, 90), act('b', 0.8, 20), act('c', 0.7, 20)], constraints());
  assert.equal(infeasible.baseline.feasible, false);
  assert.equal(infeasible.baseline.scoreDelta, null);
});

test('counterfactuals show score and fee deltas and never omit a lock violation', () => {
  const result = optimizeSlate([act('a', 0.9, 30), act('b', 0.8, 20), act('c', 0.6, 10)], constraints({ lockedIds: ['a'] }));
  const valid = result.alternatives.find(item => item.removedId === 'b');
  assert.equal(valid.feasible, true);
  assert.equal(valid.scoreDelta, -10);
  assert.equal(valid.costDelta, -10);
  assert.equal(valid.totalFee, 40);
  assert.deepEqual(valid.selectedIds, ['a', 'c']);
  const invalid = result.alternatives.find(item => item.removedId === 'a');
  assert.equal(invalid.feasible, false);
  assert.ok(invalid.violations.some(reason => reason.includes('Locked act a')));
});

test('risk tolerance controls only the explicitly disclosed missing-evidence penalty', () => {
  const candidates = [act('a', 0.5, 10, 'folk', { evidence: { rank: true, local: false, trends: false, comparison: false } })];
  const cautious = optimizeSlate(candidates, constraints({ slots: 1, riskTolerance: 0 }));
  const tolerant = optimizeSlate(candidates, constraints({ slots: 1, riskTolerance: 100 }));
  assert.equal(cautious.objectiveBreakdown.fit, tolerant.objectiveBreakdown.fit);
  assert.equal(cautious.objectiveBreakdown.riskPenalty, -4);
  assert.equal(tolerant.objectiveBreakdown.riskPenalty, 0);
  assert.equal(tolerant.score - cautious.score, 4);
});

test('decimal money arithmetic honors a cent-level budget exactly', () => {
  const result = optimizeSlate([act('a', 0.7, 0.1), act('b', 0.8, 0.2)], constraints({ budget: 0.3 }));
  assert.equal(result.feasible, true);
  assert.equal(result.totalFee, 0.3);
  assert.equal(result.remainingBudget, 0);
});

test('ten candidates enumerate every requested combination without search truncation', () => {
  const result = optimizeSlate(Array.from({ length: 10 }, (_, i) => act(`act-${i}`, i / 10, 1)), constraints({ slots: 5, maxPerGenre: 5 }));
  assert.equal(result.checkedCount, 252);
  assert.equal(result.feasibleCount, 252);
  assert.deepEqual(result.selectedIds, ['act-5', 'act-6', 'act-7', 'act-8', 'act-9']);
  assert.equal(result.alternatives.length, 25);
});
