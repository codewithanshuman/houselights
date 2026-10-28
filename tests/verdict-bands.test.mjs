import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relativeVerdicts, withAffinityFit, TIE_BAND } from '../server/affinity.mjs';
const levels = { 'lean pass': 0, hold: 1, 'growth bet': 2, 'lean yes': 3 };
const act = (id, affinity, extra = {}) => ({ id, affinity, fit: 1 - (.9 - affinity) / .1, evidence: { rank: true }, found: false, momentum: 'unknown', ...extra });

test('São Paulo new-run verdicts no longer endorse all six narrowly separated acts', () => {
  const cases = JSON.parse(readFileSync(new URL('../deploy/judge-cases.json', import.meta.url))).cases;
  const source = cases.find(row => row.title.includes('São Paulo')).snapshot;
  const original = JSON.stringify(source), { items } = withAffinityFit(source.memo.items, source.receipts);
  assert.equal(items.filter(item => item.fit >= .6).length, 6, 'the previous threshold endorses the whole pool');
  const verdicts = relativeVerdicts(items);
  assert.ok(items.filter(item => verdicts.get(item.id) === 'lean yes').length < 6);
  assert.equal(JSON.stringify(source), original, 'published evidence and its saved verdicts are untouched');
});

test('every near-tie pair shares its verdict, including boundary chains and mixed discovery flags', () => {
  const items = [act('a', .9), act('b', .8985, { found: true }), act('c', .897, { momentum: 'cooling' }), act('d', .84)];
  const verdicts = relativeVerdicts(items);
  for (const a of items) for (const b of items) if (Math.abs(a.affinity - b.affinity) < TIE_BAND) assert.equal(verdicts.get(a.id), verdicts.get(b.id));
  assert.deepEqual([...relativeVerdicts([...items].reverse())].sort(), [...verdicts].sort());
  assert.equal(verdicts.get('a'), 'hold', 'a cooling member conservatively lowers its entire label component');
});

test('verdicts never rise as fit falls across seeded pools, and cannot endorse an indistinguishable pool', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const items = Array.from({ length: 8 }, (_, index) => act(String(index), .9 - index * (.001 + seed % 9 / 1000), { found: (seed + index) % 2 === 0 }));
    const before = JSON.stringify(items), verdicts = relativeVerdicts(items);
    for (let index = 1; index < items.length; index++) assert.ok(levels[verdicts.get(items[index].id)] <= levels[verdicts.get(items[index - 1].id)]);
    assert.equal(JSON.stringify(items), before);
  }
  assert.deepEqual([...relativeVerdicts([act('a', .9), act('b', .8999)]).values()], ['hold', 'hold']);
});

test('missing rank evidence stays hold and ordinal fallbacks also preserve tied labels', () => {
  const items = [act('a', null, { fit: 1 }), act('b', null, { fit: .5, found: true }), act('c', null, { fit: .5 }), act('d', null, { fit: 0 }), act('unknown', null, { fit: null, evidence: { rank: false } })];
  const verdicts = relativeVerdicts(items);
  assert.equal(verdicts.get('b'), verdicts.get('c')); assert.equal(verdicts.get('unknown'), 'hold');
  assert.equal(verdicts.get('a'), 'lean yes'); assert.equal(verdicts.get('d'), 'lean pass');
});
