import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSlate } from '../server/analysis.mjs';

const act = (id, fit, fee, overrides = {}) => ({
  id, name: id, fit, found: false,
  evidence: { rank: true, local: true, comparison: true, trends: true },
  terms: { fee, available: true, genre: '' },
  ...overrides,
});
const constraints = overrides => ({ budget: 100, slots: 1, discoveryMin: 0, maxPerGenre: 2, riskTolerance: 50, lockedIds: [], excludedIds: [], ...overrides });

test('higher quotes distinguish the original slate failing from a feasible alternative', () => {
  const result = analyzeSlate([act('premium', 1, 95), act('alternative', 0.7, 70)], constraints());
  assert.deepEqual(result.baseline.selectedIds, ['premium']);
  assert.deepEqual(result.headroom, { budgetAmount: 5, budgetPercent: 5 });
  const unchanged = result.feeScenarios[0];
  assert.equal(unchanged.currentSlateCost, 95);
  assert.equal(unchanged.currentSlateFeasible, true);
  assert.deepEqual(unchanged.changedIds, []);
  const increased = result.feeScenarios.find(item => item.increasePercent === 10);
  assert.equal(increased.currentSlateCost, 104.5);
  assert.equal(increased.currentSlateFeasible, false);
  assert.equal(increased.feasible, true);
  assert.deepEqual(increased.bestSelectedIds, ['alternative']);
  assert.equal(increased.bestTotalFee, 77);
  assert.equal(increased.bestScore, 70);
  assert.deepEqual(increased.changedIds, ['premium', 'alternative']);
  assert.equal(increased.retainedCount, 0);
});

test('a budget increase can establish feasibility when the baseline is infeasible', () => {
  const result = analyzeSlate([act('a', 1, 55), act('b', 0.8, 55)], constraints({ slots: 2 }));
  assert.equal(result.baseline.feasible, false);
  assert.equal(result.headroom, null);
  assert.deepEqual(result.budgetScenarios.map(item => [item.budget, item.feasible]), [[80, false], [90, false], [100, false], [110, true], [120, true]]);
  assert.deepEqual(result.budgetScenarios[3].selectedIds, ['a', 'b']);
  for (const scenario of result.feeScenarios) {
    assert.equal(scenario.currentSlateCost, null);
    assert.equal(scenario.currentSlateFeasible, null);
    assert.deepEqual(scenario.changedIds, []);
  }
  assert.match(result.warnings.join(' '), /no feasible baseline/i);
});

test('every scenario preserves locks, exclusions, discovery, genre and availability', () => {
  const candidates = [
    act('locked', 0.7, 20, { terms: { fee: 20, available: true, genre: 'rock' } }),
    act('discovery', 0.6, 30, { found: true, terms: { fee: 30, available: true, genre: 'jazz' } }),
    act('same-genre', 1, 1, { found: true, terms: { fee: 1, available: true, genre: 'rock' } }),
    act('excluded', 1, 0, { found: true }),
    act('unavailable', 1, 0, { found: true, terms: { fee: 0, available: false } }),
    act('not-discovered', 1, 1),
  ];
  const result = analyzeSlate(candidates, constraints({ slots: 2, lockedIds: ['locked'], excludedIds: ['excluded'], discoveryMin: 1, maxPerGenre: 1 }));
  for (const scenario of result.budgetScenarios) assert.deepEqual(scenario.selectedIds, ['locked', 'discovery']);
  for (const scenario of result.feeScenarios) {
    assert.deepEqual(scenario.bestSelectedIds, ['locked', 'discovery']);
    assert.equal(scenario.currentSlateFeasible, true);
  }
});

test('a required lock cannot be exchanged for a cheaper act when quotes rise', () => {
  const result = analyzeSlate([act('locked', 0.8, 95), act('cheap', 0.9, 1)], constraints({ lockedIds: ['locked'] }));
  const scenario = result.feeScenarios[1];
  assert.equal(scenario.currentSlateFeasible, false);
  assert.equal(scenario.feasible, false);
  assert.deepEqual(scenario.bestSelectedIds, []);
});

test('unknown, negative and string fees are not guessed and zero remains valid', () => {
  const result = analyzeSlate([act('unknown', 1, null), act('negative', 1, -1), act('string', 1, '0'), act('zero', 0.5, 0)], constraints({ budget: 0 }));
  assert.deepEqual(result.baseline.selectedIds, ['zero']);
  assert.equal(result.budgetScenarios.length, 1);
  assert.equal(result.budgetScenarios[0].deltaPercent, 0);
  assert.deepEqual(result.headroom, { budgetAmount: 0, budgetPercent: null });
  for (const scenario of result.feeScenarios) {
    assert.deepEqual(scenario.bestSelectedIds, ['zero']);
    assert.equal(scenario.currentSlateCost, 0);
    assert.equal(scenario.currentSlateFeasible, true);
  }
  assert.match(result.warnings.join(' '), /unknown, negative, string/);
});

test('cent rounding occurs per quote and duplicate rounded budgets are removed', () => {
  const result = analyzeSlate([act('a', 0.8, 0.1), act('b', 0.7, 0.2)], constraints({ budget: 0.33, slots: 2 }));
  const tenPercent = result.feeScenarios[1];
  assert.equal(tenPercent.currentSlateCost, 0.33);
  assert.equal(tenPercent.currentSlateFeasible, true);
  assert.equal(tenPercent.bestTotalFee, 0.33);
  assert.equal(result.feeScenarios[2].currentSlateCost, 0.36);
  assert.equal(result.feeScenarios[2].currentSlateFeasible, false);
  const tiny = analyzeSlate([act('a', 1, 0.01)], constraints({ budget: 0.01 }));
  assert.equal(tiny.budgetScenarios.length, 1);
  assert.equal(tiny.budgetScenarios[0].budget, 0.01);
  assert.equal(tiny.budgetScenarios[0].deltaPercent, 0);
  const rounded = analyzeSlate([act('a', 1, 1.005)], constraints({ budget: 2.005 }));
  assert.equal(rounded.baseline.totalFee, 1.01);
  assert.equal(rounded.feeScenarios[1].currentSlateCost, 1.11);
});

test('scenario analysis never repairs absent rank evidence or claims probabilities', () => {
  const result = analyzeSlate([act('unsupported', 0.99, 10, { evidence: { rank: false } })], constraints());
  assert.equal(result.baseline.status, 'provisional');
  assert.deepEqual(result.baseline.missingFitIds, ['unsupported']);
  for (const scenario of [...result.budgetScenarios, ...result.feeScenarios]) {
    assert.equal(scenario.status, 'provisional');
    assert.deepEqual(scenario.missingFitIds, ['unsupported']);
  }
  assert.match(result.warnings.join(' '), /missing supported rank evidence remains insufficient/);
  assert.match(result.basis, /Planning assumptions, not demand forecasts/);
});

test('candidate and constraint inputs remain deeply unchanged, including frozen objects', () => {
  const candidates = [act('a', 1, 60), act('b', 0.8, 30)];
  const settings = constraints({ lockedIds: ['b'] });
  const initial = structuredClone({ candidates, settings });
  const freeze = object => {
    for (const value of Object.values(object)) if (value && typeof value === 'object') freeze(value);
    return Object.freeze(object);
  };
  analyzeSlate(freeze(candidates), freeze(settings));
  assert.deepEqual({ candidates, settings }, initial);
});

test('invalid input returns explanatory warnings and never starts scenario runs', () => {
  const cases = [
    [null, constraints()],
    [[null], constraints()],
    [[act('a', 1, 1), act('a', 1, 1)], constraints()],
    [Array.from({ length: 11 }, (_, i) => act(String(i), 1, 1)), constraints()],
    [[act('a', 1, 1)], constraints({ budget: '100' })],
    [[act('a', 1, 1)], constraints({ budget: NaN })],
    [[act('a', 1, 1)], constraints({ budget: Infinity })],
    [[act('a', 1, 1)], constraints({ slots: 1.5 })],
    [[act('a', 1, 1)], constraints({ lockedIds: ['unknown'] })],
    [[act('a', 1, 1)], constraints({ excludedIds: 'a' })],
  ];
  for (const [items, settings] of cases) {
    const result = analyzeSlate(items, settings);
    assert.equal(result.baseline.status, 'invalid');
    assert.equal(result.baseline.feasible, false);
    assert.deepEqual(result.budgetScenarios, []);
    assert.deepEqual(result.feeScenarios, []);
    assert.equal(result.headroom, null);
    assert.ok(result.warnings.length > 0);
  }
});
