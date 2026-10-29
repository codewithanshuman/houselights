import test from 'node:test';
import assert from 'node:assert/strict';
const { optimizeSlate } = await import('../server/optimizer.mjs');
const { feeRobustness, flipPoints, analyzeDecision, seededRandom, feeModel, drawFee, budgetLadder, affinityRobustness } = await import('../server/robustness.mjs');
const { scaleAffinity, TIE_BAND } = await import('../server/affinity.mjs');
const { FEE_TIERS } = await import('../server/fee-tiers.mjs');

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

function bruteForceFees(snapshot, draws, seed, feeBasis) {
  const baseline = optimizeSlate(snapshot.memo.items, snapshot.memo.constraints), model = feeModel(snapshot, { feeBasis }), random = seededRandom(seed);
  const ids = snapshot.memo.items.filter(item => typeof item.terms.fee === 'number').map(item => item.id).sort();
  const counts = new Map();let holds = 0, none = 0;
  for (let draw = 0; draw < draws; draw++) {
    const drawn = new Map(ids.map(id => [id, drawFee(Math.round(snapshot.memo.items.find(item => item.id === id).terms.fee * 100), model.ranges.get(id), random()) / 100]));
    const result = optimizeSlate(snapshot.memo.items.map(item => drawn.has(item.id) ? { ...item, terms: { ...item.terms, fee: drawn.get(item.id) } } : item), snapshot.memo.constraints);
    if (!result.feasible) none++;
    else if (same(result.selectedIds, baseline.selectedIds)) holds++;
    else { const key = [...result.selectedIds].sort().join(); counts.set(key, (counts.get(key) ?? 0) + 1); }
  }
  return { baseline, holds, none, counts };
}

test('fee robustness equals rerunning the exact optimizer on every drawn fee table', () => {
  let checked = 0;
  for (const snapshot of pools(11, 60)) {
    const draws = 40, report = feeRobustness(snapshot, { draws, seed: 5 }), brute = bruteForceFees(snapshot, draws, 5, null);
    if (!brute.baseline.feasible) continue;
    assert.equal(report.feeModel, 'uniform');
    assert.equal(report.holds, brute.holds, JSON.stringify(snapshot.memo.constraints));
    assert.equal(report.noBill, brute.none);
    assert.equal(report.share, brute.holds / draws);
    checked++;
  }
  assert.ok(checked >= 20, `only ${checked} feasible pools were checked`);
});

test('estimated fees move across their popularity tier, and the result still matches the optimizer', () => {
  const tiers = FEE_TIERS.map(([, fee]) => fee);let checked = 0, safer = 0;
  for (const snapshot of pools(17, 60)) {
    const rnd = seededRandom(checked + 3);
    for (const item of snapshot.memo.items) if (item.terms.fee != null) item.terms.fee = tiers[Math.floor(rnd() * tiers.length)];
    const fees = snapshot.memo.items.map(item => item.terms.fee ?? 0).sort((a, b) => a - b);
    snapshot.memo.constraints.budget = Math.round(fees.slice(0, snapshot.memo.constraints.slots).reduce((sum, fee) => sum + fee, 0) * 1.6);
    const draws = 40, report = feeRobustness(snapshot, { draws, seed: 9, feeBasis: 'estimated-from-qloo-popularity' }), brute = bruteForceFees(snapshot, draws, 9, 'estimated-from-qloo-popularity');
    if (!brute.baseline.feasible) continue;
    assert.equal(report.feeModel, 'popularity-tiers');
    assert.equal(report.holds, brute.holds);
    assert.equal(report.noBill, brute.none);
    if (report.safer) {
      // The safer pick wins more draws than the chosen bill and is bookable at today's fees.
      safer++;
      assert.equal(brute.counts.get([...report.safer.selectedIds].sort().join()), report.safer.draws);
      assert.ok(report.safer.draws > report.holds);
      assert.ok(report.safer.total <= snapshot.memo.constraints.budget);
      assert.ok(report.safer.scoreGap >= 0);
      const best = Math.max(...[...brute.counts].filter(([key]) => { const ids = key.split(','); return ids.reduce((sum, id) => sum + snapshot.memo.items.find(item => item.id === id).terms.fee, 0) <= snapshot.memo.constraints.budget; }).map(([, n]) => n));
      assert.equal(report.safer.draws, best, 'the safer pick is the most frequent bookable winner');
    }
    checked++;
  }
  assert.ok(checked >= 20 && safer >= 1, `checked ${checked} pools, ${safer} with a safer pick`);
});

test('the budget ladder lists exactly the budgets where the optimizer changes its choice', () => {
  let steps = 0;
  for (const snapshot of pools(53, 50)) {
    const ladder = budgetLadder(snapshot);
    if (ladder.status !== 'ready') continue;
    const at = budget => optimizeSlate(snapshot.memo.items, { ...snapshot.memo.constraints, budget });
    for (const [index, step] of ladder.steps.entries()) {
      const result = at(step.budget);
      assert.ok(result.feasible && same(result.selectedIds, step.selectedIds), `step ${index} is the choice at its budget`);
      const below = at(Math.round(step.budget * 100 - 1) / 100);
      if (index === 0) assert.equal(below.feasible, false, 'nothing fits below the first step');
      else assert.ok(same(below.selectedIds, ladder.steps[index - 1].selectedIds), 'one cent below, the previous step still holds');
      steps++;
    }
    const top = at(1e9);
    if (ladder.steps.length) assert.ok(same(top.selectedIds, ladder.steps.at(-1).selectedIds), 'no change above the last step');
  }
  assert.ok(steps >= 40, `checked ${steps} steps`);
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

test('affinity noise equals rescoring with the saved scaling, for affinity and ordinal fits', () => {
  let checked = 0, index = 0;const skipped = {};
  for (const scale of ['fixed-span', 'ordinal']) for (const snapshot of pools(scale === 'ordinal' ? 71 : 67, 60)) {
    const rnd = seededRandom(++index * 7919), items = snapshot.memo.items;
    for (const item of items) { item.evidence.rank = true; item.affinity = Math.round((.95 + rnd() * .04) * 1e6) / 1e6; }
    const ids = items.map(item => item.id);
    const fitsOf = scores => {
      if (scale === 'ordinal') { const order = [...ids].sort((a, b) => scores.get(b) - scores.get(a) || ids.indexOf(a) - ids.indexOf(b)); return new Map(order.map((id, i) => [id, 1 - i / (order.length - 1)])); }
      const scaled = scaleAffinity(ids.map(id => scores.get(id)), 'fixed-span'); return new Map(ids.map(id => [id, scaled.fit(scores.get(id))]));
    };
    // Saved fits come from the unperturbed affinities; distinct values keep the ordinal order unambiguous.
    if (new Set(items.map(item => item.affinity)).size !== items.length) { skipped.dup = (skipped.dup ?? 0) + 1; continue; }
    const saved = fitsOf(new Map(items.map(item => [item.id, item.affinity])));
    for (const item of items) item.fit = saved.get(item.id);
    const baseline = optimizeSlate(items, snapshot.memo.constraints);
    if (!baseline.feasible) { skipped.infeasible = (skipped.infeasible ?? 0) + 1; continue; }
    const draws = 30, report = affinityRobustness(snapshot, { draws, seed: 13 }), random = seededRandom(13);
    assert.equal(report.scale, scale);
    let holds = 0;const kept = new Map(baseline.selectedIds.map(id => [id, 0]));
    for (let draw = 0; draw < draws; draw++) {
      const scores = new Map(items.map(item => [item.id, item.affinity + (2 * random() - 1) * TIE_BAND / 2])), fits = fitsOf(scores);
      const result = optimizeSlate(items.map(item => ({ ...item, fit: fits.get(item.id) })), snapshot.memo.constraints);
      if (same(result.selectedIds, baseline.selectedIds)) holds++;
      for (const id of baseline.selectedIds) if (result.selectedIds.includes(id)) kept.set(id, kept.get(id) + 1);
    }
    if (report.status !== 'ready') { skipped[report.status] = (skipped[report.status] ?? 0) + 1; continue; }
    assert.equal(report.holds, holds, `${scale} pool ${checked}`);
    for (const act of report.acts) assert.equal(act.share, kept.get(act.id) / draws);
    checked++;
  }
  assert.ok(checked >= 30, `checked ${checked} pools, skipped ${JSON.stringify(skipped)}`);
});

test('the affinity check declines plans whose fits it cannot reproduce', () => {
  const snapshot = pools(83, 40).find(pool => optimizeSlate(pool.memo.items, pool.memo.constraints).feasible);
  for (const item of snapshot.memo.items) { item.evidence.rank = true; item.affinity = .97; item.fit = .123; }
  assert.equal(affinityRobustness(snapshot).status, 'unsupported');
  const withFloor = structuredClone(snapshot);withFloor.memo.constraints.minimumAverageFit = .1;
  assert.match(affinityRobustness(withFloor).status, /unsupported|no-bill/);
});
