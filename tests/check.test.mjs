import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../server/check.mjs';
import { spearman, evaluate } from '../server/eval.mjs';
const items = [{ name: 'Beta', rank: 1, of: 6, netNew: 0.5 }], ids = new Set(['r1']);
test('checker keeps supported claims, drops invented numbers, ghost receipts and forecasts', () => {
  const r = check('Ranks 1 of 6 [r1]. Draws 4000 fans [r1]. Cites nothing real [r9]. Will sell out fast.', items, [], ids);
  assert.equal(r.text, 'Ranks 1 of 6 [r1].');
  assert.deepEqual(r.removed.map(x => x.reason), ['unsupported number 4000', 'unknown receipt r9', 'forecast language']);
});
test('spearman is 1 for identical order, -1 for reversed', () => {
  assert.equal(spearman(['a', 'b', 'c'], ['a', 'b', 'c']), 1);
  assert.equal(spearman(['a', 'b', 'c'], ['c', 'b', 'a']), -1);
});

test('baseline evaluation compares names without a temporal-dead-zone failure', () => {
  const result = evaluate({ items: [{ name: 'Beta', verdict: 'lean yes' }], ranked: ['Beta'], base: { order: ['Beta'], verdicts: [{ name: 'Beta', verdict: 'hold', reason: 'Uncertain' }] }, receipts: [{ id: 'r1' }] });
  assert.equal(result.exact, 0);
  assert.equal(result.receipts, 1);
});
