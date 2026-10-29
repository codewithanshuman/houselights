import test from 'node:test';
import assert from 'node:assert/strict';
const { optimizeSlate } = await import('../server/optimizer.mjs');
const { researchValue, allocateResearch } = await import('../server/research-value.mjs');

const act = (id, fit, fee) => ({ id, name: id.toUpperCase(), found: true, fit, local: 'no data', momentum: 'unknown',
  terms: { fee, available: true, genre: '' }, evidence: { rank: true, local: false, comparison: false, trends: false } });
const constraints = { budget: 10000, slots: 2, discoveryMin: 0, maxPerGenre: 2, riskTolerance: 50, lockedIds: [], excludedIds: [] };

test('a check can matter only where some possible result changes the exact optimizer’s bill', () => {
  // a and b lead clearly; c sits a hair below b, so c's evidence could swap it in; d is far behind.
  const items = [act('a', 1, 4000), act('b', .9, 4000), act('c', .89, 4000), act('d', .1, 4000)];
  const value = researchValue(items, constraints), by = Object.fromEntries(value.candidates.map(row => [row.id, row]));
  assert.deepEqual(value.selectedIds.sort(), ['a', 'b']);
  assert.equal(value.outcomes, 16);
  assert.equal(by.c.couldChange, true);assert.equal(by.c.canEnter, true);
  assert.equal(by.b.couldChange, true);assert.equal(by.b.canLeave, true);
  assert.equal(by.a.couldChange, false, 'the clear leader stays whatever its check returns');
  assert.equal(by.d.couldChange, false, 'a distant act cannot enter on any result');
  // Exhaustive check of the claim behind "no effect": every outcome for d leaves the bill alone.
  for (const local of [true, false]) for (const comparison of [true, false]) for (const momentum of ['rising', 'flat', 'cooling', 'unknown']) {
    const changed = items.map(item => item.id === 'd' ? { ...item, local: local ? 'yes' : 'no data', momentum, evidence: { rank: true, local, comparison, trends: momentum !== 'unknown' } } : item);
    assert.deepEqual(optimizeSlate(changed, constraints).selectedIds.sort(), ['a', 'b']);
  }
});

test('allocation checks decision-relevant acts first, then the booked acts, and skips the rest', () => {
  const items = [act('a', 1, 4000), act('b', .9, 4000), act('c', .89, 4000), act('d', .1, 4000)];
  const value = researchValue(items, constraints);
  const two = allocateResearch(value, ['d', 'a', 'b', 'c'], 2);
  assert.deepEqual(two.deep, ['b', 'c'], 'preference order is kept within the decision-relevant group');
  const reasons = Object.fromEntries(two.reasons.map(row => [row.id, row.reason]));
  assert.deepEqual(reasons, { d: 'no-effect', a: 'verifies-bill-no-budget', b: 'could-change', c: 'could-change' });
  const four = allocateResearch(value, ['d', 'a', 'b', 'c'], 4);
  assert.deepEqual(four.deep, ['b', 'c', 'a'], 'spare calls verify the booked act; the distant act is never checked');
  assert.deepEqual(allocateResearch(value, [], 0).deep, []);
});
