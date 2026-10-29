import test from 'node:test';
import assert from 'node:assert/strict';
const { optimizeSlate } = await import('../server/optimizer.mjs');
const { feeRobustness, flipPoints, analyzeDecision, seededRandom } = await import('../server/robustness.mjs');

// Seeded pools in the shape the optimizer reads, so every failure is reproducible.
function pools(seed, count) {
  const rnd = seededRandom(seed), pick = values => values[Math.floor(rnd() * values.length)], out = [];
  for (let n = 0; n < count; n++) {
    const size = 4 + Math.floor(rnd() * 5), slots = 1 + Math.floor(rnd() * 3);
    const items = Array.from({ length: size }, (_, i) => ({ id: `a${i}`, name: `A${i}`, fit: Math.round(rnd() * 1000) / 1000, found: rnd() < .4,
      evidence: { rank: rnd() < .9, local: rnd() < .5, trends: rnd() < .3, comparison: rnd() < .5 }, local: pick(['yes', 'no']), momentum: pick(['rising', 'flat', 'cooling']),
      terms: { fee: rnd() < .08 ? null : Math.round(1000 + rnd() * 9000), available: rnd() < .9, genre: pick(['soul', 'jazz', 'rock', '']) } }));
    const fees = items.map(item => item.terms.fee ?? 0).sort((a, b) => a - b);
    const budget = Math.round(fees.slice(0, slots).reduce((sum, fee) => sum + fee, 0) * (1.1 + rnd() * .9));
    out.push({ memo: { items, constraints: { budget, slots, discoveryMin: 0, maxPerGenre: rnd() < .5 ? slots : 1, riskTolerance: Math.round(rnd() * 100), lockedIds: [], excludedIds: [] } } });
  }
  return out;
}
const withFee = (snapshot, id, fee) => snapshot.memo.items.map(item => item.id === id ? { ...item, terms: { ...item.terms, fee } } : item);
const same = (a, b) => [...a].sort().join() === [...b].sort().join();

test('fee robustness equals rerunning the exact optimizer on every drawn fee table', () => {
  let checked = 0;
  for (const snapshot of pools(11, 60)) {
    const baseline = optimizeSlate(snapshot.memo.items, snapshot.memo.constraints);
    if (!baseline.feasible) continue;
    const draws = 40, report = feeRobustness(snapshot, { draws, seed: 5 }), random = seededRandom(5);
    const ids = snapshot.memo.items.filter(item => typeof item.terms.fee === 'number').map(item => item.id).sort();
    let holds = 0, none = 0;
    for (let draw = 0; draw < draws; draw++) {
      const drawn = new Map(ids.map(id => [id, Math.round(Math.round(snapshot.memo.items.find(item => item.id === id).terms.fee * 100) * (.8 + .4 * random())) / 100]));
      const items = snapshot.memo.items.map(item => drawn.has(item.id) ? { ...item, terms: { ...item.terms, fee: drawn.get(item.id) } } : item);
      const result = optimizeSlate(items, snapshot.memo.constraints);
      if (!result.feasible) none++;
      else if (same(result.selectedIds, baseline.selectedIds)) holds++;
    }
    assert.equal(report.holds, holds, JSON.stringify(snapshot.memo.constraints));
    assert.equal(report.noBill, none);
    assert.equal(report.share, holds / draws);
    checked++;
  }
  assert.ok(checked >= 20, `only ${checked} feasible pools were checked`);
});

test('flip points are the exact fees where the optimizer changes its choice', () => {
  let booked = 0, entries = 0;
  for (const snapshot of pools(29, 50)) {
    const baseline = optimizeSlate(snapshot.memo.items, snapshot.memo.constraints), flips = flipPoints(snapshot);
    if (!baseline.feasible) { assert.equal(flips.status, 'no-bill'); continue; }
    for (const flip of flips.booked) {
      const at = optimizeSlate(withFee(snapshot, flip.id, flip.maxFee), snapshot.memo.constraints);
      const above = optimizeSlate(withFee(snapshot, flip.id, Math.round(flip.maxFee * 100 + 1) / 100), snapshot.memo.constraints);
      assert.ok(same(at.selectedIds, baseline.selectedIds), `${flip.id} at its flip fee keeps the bill`);
      assert.ok(!above.feasible || !same(above.selectedIds, baseline.selectedIds), `${flip.id} one cent above changes the bill`);
      assert.deepEqual(flip.replacement?.selectedIds ?? null, above.feasible ? above.selectedIds : null);
      booked++;
    }
    for (const entry of flips.entries) {
      if (entry.entryFee == null) {
        assert.ok(!optimizeSlate(withFee(snapshot, entry.id, 0), snapshot.memo.constraints).selectedIds.includes(entry.id), `${entry.id} cannot enter even for free`);
        continue;
      }
      const at = optimizeSlate(withFee(snapshot, entry.id, entry.entryFee), snapshot.memo.constraints);
      const above = optimizeSlate(withFee(snapshot, entry.id, Math.round(entry.entryFee * 100 + 1) / 100), snapshot.memo.constraints);
      assert.ok(at.selectedIds.includes(entry.id), `${entry.id} enters at its entry fee`);
      assert.ok(!above.selectedIds.includes(entry.id), `${entry.id} stays out one cent above`);
      assert.ok(same(entry.bill.selectedIds, at.selectedIds));
      entries++;
    }
  }
  assert.ok(booked >= 30 && entries >= 10, `checked ${booked} booked and ${entries} entry points`);
});

test('analysis is deterministic, reports alternatives, and declines what it cannot price exactly', () => {
  const [snapshot] = pools(41, 1);
  assert.deepEqual(analyzeDecision(snapshot), analyzeDecision(structuredClone(snapshot)));
  const report = feeRobustness(snapshot);
  assert.equal(report.draws, 500);
  assert.equal(report.holds + report.noBill + report.alternatives.reduce((sum, row) => sum + row.draws, 0) <= 500, true);
  for (const row of report.alternatives) assert.equal(row.share, row.draws / 500);
  assert.equal(feeRobustness({ memo: { ...snapshot.memo, constraints: { ...snapshot.memo.constraints, festivalPolicy: true } } }).status, 'unsupported');
  assert.equal(flipPoints({ memo: { ...snapshot.memo, constraints: { ...snapshot.memo.constraints, budget: 1 } } }).status, 'no-bill');
  assert.equal(feeRobustness({ memo: { ...snapshot.memo, constraints: { ...snapshot.memo.constraints, budget: 1 } } }).share, null);
  assert.equal(feeRobustness({}).status, 'unavailable');
});
