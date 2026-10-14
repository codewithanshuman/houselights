import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeSlate, evaluateSelection } from '../server/optimizer.mjs';
import { cancelFestival } from '../server/gm.mjs';
import { Run } from '../server/qloo.mjs';
import { mockCall } from '../server/mock.mjs';
import { buildFestivalResearch, normalizeFestivalResearch } from '../server/festival-research.mjs';

function pool() {
  const items = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: id, fit: 1 - i * .05, evidence: { rank: true },
    terms: { fee: 20, available: true, genre: id }, culturalLinks: [], receipts: [] }));
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const sharedTastes = i === 0 && j === 2 ? ['jazz', 'cinema', 'soul'] : [];
    items[i].culturalLinks.push({ otherId: items[j].id, available: true, receiptId: `p${i}${j}`, sharedTastes });
    items[j].culturalLinks.push({ otherId: items[i].id, available: true, receiptId: `p${i}${j}`, sharedTastes });
  }
  return items;
}
const constraints = { budget: 50, slots: 2, maxPerGenre: 1, lockedIds: [], excludedIds: [] };
test('whole-lineup evidence changes the optimum and exposes its score contribution', () => {
  const items = pool();
  assert.deepEqual(optimizeSlate(items, constraints).selectedIds, ['a', 'b']);
  const result = optimizeSlate(items, { ...constraints, festivalPolicy: true });
  assert.deepEqual(result.selectedIds, ['a', 'c']);
  assert.equal(result.objectiveBreakdown.culturalCohesion, 8);
  assert.equal(result.objectiveBreakdown.culturalBreadth, 3);
  assert.equal(result.objectiveBreakdown.cancellationReadiness, 6);
  assert.equal(result.festival.supportedPairs, 1);
  assert.ok(result.receiptIds.includes('p02'));
  assert.deepEqual(new Set(optimizeSlate([...items].reverse(), { ...constraints, festivalPolicy: true }).selectedIds), new Set(['a', 'c']));
});
test('missing pairs are penalized and never become invented similarity', () => {
  const items = pool().map(item => ({ ...item, culturalLinks: [] }));
  const result = optimizeSlate(items, { ...constraints, festivalPolicy: true });
  assert.equal(result.festival.supportedPairs, 0);
  assert.equal(result.objectiveBreakdown.culturalCohesion, 0);
  assert.equal(result.objectiveBreakdown.pairEvidencePenalty, -6);
  assert.equal(evaluateSelection(items, result.constraints, result.selectedIds).score, result.score);
});
test('cancellation recovery cannot use excluded or unavailable backups and preserves survivor locks', async () => {
  const items = pool();
  items[3].terms.available = false;
  const rules = { ...constraints, festivalPolicy: true, excludedIds: ['b'] };
  const slate = optimizeSlate(items, rules);
  assert.equal(slate.objectiveBreakdown.cancellationReadiness, 0);
  const snapshot = { id: 'canceltest', memo: { items: pool(), constraints: { ...constraints, lockedIds: ['a'], festivalPolicy: true }, slate: { selectedIds: ['a', 'c'] } } };
  const result = await cancelFestival(snapshot, { artistId: 'a' });
  assert.equal(result.status, 'revised');
  assert.ok(result.snapshot.memo.slate.selectedIds.includes('c'));
  assert.ok(!result.snapshot.memo.slate.selectedIds.includes('a'));
  assert.deepEqual(snapshot.memo.constraints.lockedIds, ['a']);
  assert.equal(result.snapshot.gm.state, 'recovered');
});
test('agent repairs a partial primary rank with a targeted fresh call before optimizing', async () => {
  const items = pool();
  const snapshot = { id: 'adaptive', memo: { items, constraints, input: { city: 'London', anchors: ['Radiohead'] } } };
  let audienceCalls = 0;
  const run = new Run({ mode: 'mock', budget: 60, cacheStore: new Map(), execute: (tool, args) => {
    if (tool === 'rank' && args.signals) { audienceCalls++; if (audienceCalls === 1) return { status: 'partial', results: [{ entity_id: 'a' }] }; }
    return mockCall(tool, args);
  } });
  const report = await buildFestivalResearch(snapshot, normalizeFestivalResearch(snapshot), run);
  assert.equal(audienceCalls, 2);
  assert.ok(report.adaptiveResearch.some(step => step.resolved === true));
  assert.equal(report.markets[0].audience.complete, true);
  assert.equal(report.crossGenre.length, 6);
  assert.ok(report.items.every(item => item.culturalLinks.length === 3));
});
