import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContingencyPlan } from '../server/contingency.mjs';

const candidate = (id, fee, genre, fit) => ({ id, name: id, fit, evidence: { rank: true }, terms: { fee, genre, available: true }, receipts: [] });
const items = [
  candidate('a', 40, 'rock', .95), candidate('b', 30, 'jazz', .85),
  candidate('c', 25, 'electronic', .75), candidate('d', 20, 'folk', .65),
  candidate('e', 15, 'indie', .55)
];
const constraints = { budget: 100, slots: 3, maxPerGenre: 2, discoveryMin: 0, riskTolerance: 50, lockedIds: [], excludedIds: [] };

test('contingency plan rehearses cancellations, individual fees, budget cuts and combined shocks', () => {
  const result = buildContingencyPlan(items, constraints);
  assert.equal(result.baseline.feasible, true);
  assert.equal(result.cancellations.length, 3);
  assert.equal(result.individualQuoteShocks.length, 9);
  assert.equal(result.budgetCuts.length, 4);
  assert.equal(result.combinedShocks.length, 3);
  assert.equal(result.resilience.totalScenarios, 19);
  assert.ok(result.resilience.feasibleSlateCount > 1);
  assert.equal(result.robustSlate.cancellationCount, 3);
  assert.ok(result.robustnessFrontier.length > 0 && result.robustnessFrontier.length <= 5);
  assert.ok(result.backupBench.some(row => row.id === 'd' || row.id === 'e'));
  assert.ok(result.cancellations.every(row => !row.selectedIds.includes(row.canceledId)));
  assert.ok(result.cancellations.every(row => row.retainedIds.length === 2), 'a cancellation keeps all surviving bookings fixed');
});

test('cancellation removes only the canceled lock and preserves the rest', () => {
  const result = buildContingencyPlan(items, { ...constraints, lockedIds: ['a', 'b'] });
  const cancelA = result.cancellations.find(row => row.canceledId === 'a');
  assert.equal(cancelA.feasible, true);
  assert.ok(cancelA.selectedIds.includes('b'));
  assert.ok(!cancelA.selectedIds.includes('a'));
});

test('robust slate search evaluates every feasible exact slate with honest fallback metrics', () => {
  const result = buildContingencyPlan(items, constraints);
  assert.ok(result.robustSlate.cancellationCoverage <= result.robustSlate.cancellationCount);
  assert.ok(result.robustSlate.utilitySacrifice >= 0);
  assert.equal(typeof result.robustSlate.distinctReplacementPaths, 'number');
  for (let index = 1; index < result.robustnessFrontier.length; index++) {
    assert.ok(result.robustnessFrontier[index - 1].cancellationCoverage >= result.robustnessFrontier[index].cancellationCoverage);
  }
});

test('robust search may trade baseline utility for a stronger worst-case cancellation result', () => {
  const portfolio = [
    candidate('star', 60, 'headline', .99), candidate('mid', 40, 'alt', .80),
    candidate('safe1', 30, 'soul', .75), candidate('safe2', 30, 'jazz', .74),
    candidate('cheap', 10, 'folk', .40)
  ];
  const result = buildContingencyPlan(portfolio, { ...constraints, budget: 100, slots: 2 });
  assert.deepEqual(result.baseline.selectedIds, ['star', 'mid']);
  assert.deepEqual(result.robustSlate.selectedIds, ['mid', 'safe1']);
  assert.equal(result.robustSlate.cancellationCoverage, 2);
  assert.equal(result.robustSlate.utilitySacrifice, 12);
  const baselineRow = result.robustnessFrontier.find(row => row.selectedIds.includes('star') && row.selectedIds.includes('mid'));
  assert.ok(result.robustSlate.worstCaseScore > baselineRow.worstCaseScore);
});

test('individual quote shocks report whether the exact original slate still fits', () => {
  const result = buildContingencyPlan(items, { ...constraints, budget: 96 });
  const baselineId = result.baseline.selectedIds[0];
  const ten = result.individualQuoteShocks.find(row => row.shockedId === baselineId && row.increasePercent === 10);
  const thirty = result.individualQuoteShocks.find(row => row.shockedId === baselineId && row.increasePercent === 30);
  assert.ok(ten.currentSlateCost < thirty.currentSlateCost);
  assert.equal(typeof thirty.currentSlateFeasible, 'boolean');
});

test('invalid or infeasible baselines stop before presenting false resilience', () => {
  const invalid = buildContingencyPlan(items, { ...constraints, slots: -1 });
  assert.equal(invalid.baseline.status, 'invalid');
  assert.equal(invalid.resilience, null);
  const infeasible = buildContingencyPlan(items, { ...constraints, budget: 1 });
  assert.equal(infeasible.baseline.feasible, false);
  assert.equal(infeasible.cancellations.length, 0);
});

test('contingency analysis leaves caller inputs unchanged', () => {
  const frozenItems = structuredClone(items), frozenConstraints = structuredClone(constraints);
  buildContingencyPlan(items, constraints);
  assert.deepEqual(items, frozenItems);
  assert.deepEqual(constraints, frozenConstraints);
});
