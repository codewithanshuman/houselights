import test from 'node:test';
import assert from 'node:assert/strict';
import { Run } from '../server/qloo.mjs';
import { mockCall } from '../server/mock.mjs';
import { compareDomain } from '../server/theme-night/market-dna.mjs';
import { computeScore } from '../server/theme-night/scoring.mjs';
import { normalizeFestivalResearch, buildFestivalResearch, festivalWorkflowCount, rankPool, scoreWithUncertainty } from '../server/festival-research.mjs';
import { runFestivalGM, reviseFestival, benchmarkFestival, withoutDerived } from '../server/gm.mjs';
import { optimizeSlate, evaluateSelection } from '../server/optimizer.mjs';
import { planDates, buildThemeSeason } from '../server/theme-season.mjs';

process.env.LLM_MODE = 'off';
const makeSource = () => {
  const items = ['Alpha', 'Beta', 'Gamma'].map((name, i) => ({ id: mockCall('describe', { entity: name }).results[0].entity_id, name,
    fit: [1, .5, 0][i], evidence: { rank: true }, found: i === 2,
    terms: { fee: [50, 30, 20][i], available: true, genre: ['rock', 'pop', 'dance'][i] }, receipts: [] }));
  const constraints = { budget: 100, slots: 2, maxPerGenre: 1, discoveryMin: 0, riskTolerance: 50, lockedIds: [], excludedIds: [] };
  return { id: 'source1234', mock: true, receipts: [], input: { city: 'London', anchors: ['Radiohead'] }, memo: { mode: 'mock', currency: 'GBP', input: { city: 'London', anchors: ['Radiohead'] }, items, constraints, slate: optimizeSlate(items, constraints) } };
};
const makeRun = () => new Run({ mode: 'mock', budget: 60, receiptPrefix: 'g', cacheStore: new Map() });

test('ported DNA retains top-25 Jaccard, unique and five-rank leaning behavior', () => {
  const a = Array.from({ length: 25 }, (_, i) => ({ id: `e${i}`, name: `Entity ${i}`, kind: 'book' }));
  const b = [...a.slice(6), ...a.slice(0, 6)];
  const result = compareDomain('book', a, b);
  assert.equal(result.jaccard, 1);
  assert.equal(result.sharedCount, 25);
  assert.equal(result.leansA.length, 6);
  assert.equal(compareDomain('book', a, []).uniqueA, 25);
});

test('five-part score preserves exact weights and adds bounded missing-evidence sensitivity', () => {
  const original = computeScore({ entity: {}, segment: 'x', localAffinity: .8, segmentFit: { x: .6 } });
  const score = scoreWithUncertainty({ localAffinity: .8, segmentFit: .6 });
  assert.equal(score.total, original.total);
  assert.deepEqual(score.estimated, ['nearVenue', 'momentum', 'newFanReach']);
  assert.equal(score.measuredWeight, .55);
  assert.deepEqual(score.uncertaintyBounds, { lower: 39, upper: 84 });
  assert.deepEqual(scoreWithUncertainty().uncertaintyBounds, { lower: 0, upper: 100 });
  assert.equal(scoreWithUncertainty({ localAffinity: NaN }).measuredWeight, 0);
});

test('partial, foreign and duplicate ranking rows cannot become comparable full-pool fit', () => {
  const source = makeSource(), [a, b] = source.memo.items;
  const result = rankPool({ receipt: { id: 'g1', status: 'partial' }, env: { results: [{ entity_id: a.id }, { entity_id: a.id }, { entity_id: 'foreign' }, { entity_id: b.id }] } }, source.memo.items);
  assert.equal(result.complete, false);
  assert.equal(result.returned, 2);
  assert.ok(result.rows.every(row => row.utility === null));
  assert.equal(result.rows[2].rank, null);
});

test('research validation rejects duplicate markets, invalid demographic and coordinates', () => {
  const source = makeSource();
  assert.throws(() => normalizeFestivalResearch(source, { markets: ['London', ' london '] }), /unique/);
  assert.throws(() => normalizeFestivalResearch(source, { city: 'Paris' }), /decision city/);
  assert.throws(() => normalizeFestivalResearch(source, { demographic: 'families' }), /bucket/);
  assert.throws(() => normalizeFestivalResearch(source, { venue: { lat: '51', lon: 0 } }), /numeric/);
});

test('full research joins city rankings, demographic receipts, five-domain DNA, cross-genre and experience leads', async () => {
  const source = makeSource(), run = makeRun();
  const input = normalizeFestivalResearch(source, { markets: ['London', 'Paris'], existingFanIds: ['Radiohead'] });
  const report = await buildFestivalResearch(source, input, run);
  assert.equal(run.receipts.length, festivalWorkflowCount(source, input));
  assert.equal(report.markets.length, 2);
  assert.equal(report.markets[0].domains.length, 5);
  assert.equal(report.overlap[0].domains.length, 5);
  assert.ok(report.markets.every(market => market.audience.complete));
  assert.equal(report.profiles.length, 3);
  assert.equal(report.crossGenre.length, 1);
  assert.equal(report.experience.length, 4);
  assert.ok(report.profiles.every(profile => profile.tasteFit.estimated.includes('momentum')));
  assert.ok(report.profiles.every(profile => profile.tasteFit.estimated.includes('nearVenue')));
  assert.ok(report.profiles.every(profile => profile.demographics.rows[0].name === 'age 25-34'));
  assert.ok(run.receipts.every(receipt => receipt.source === 'synthetic'));
  const options = run.receipts.filter(receipt => receipt.tool === 'rank').map(receipt => receipt.args.options);
  assert.ok(options.every(pool => JSON.stringify(pool) === JSON.stringify(source.memo.items.map(item => item.id))));
});

test('failed research yields missing evidence, not confident ranks or demographic assertions', async () => {
  const source = makeSource();
  const run = new Run({ mode: 'mock', budget: 60, cacheStore: new Map(), execute: () => ({ status: 'error', results: [], error: { code: 'UNAVAILABLE' } }) });
  const report = await buildFestivalResearch(source, normalizeFestivalResearch(source), run);
  assert.equal(report.markets[0].unavailable.length, 5);
  assert.ok(report.items.every(item => item.fit === null));
  assert.ok(report.profiles.every(profile => profile.tasteFit.measuredWeight === 0));
  assert.equal(report.slate.status, 'provisional');
});

test('GM persists a decision trace and invalidates stale downstream plans', async () => {
  const source = { ...makeSource(), intelligence: { stale: true }, venuePlan: {}, localActivation: {}, benchmark: {}, themeSeason: {} };
  const before = structuredClone(source);
  const result = await runFestivalGM(source, normalizeFestivalResearch(source), makeRun());
  assert.equal(result.parentId, source.id);
  assert.equal(result.gm.trace.length, 6);
  assert.equal(result.gm.verification.feasible, true);
  assert.ok(result.gm.recovery);
  assert.equal(result.gm.state, 'decision_ready');
  assert.equal(result.intelligence, undefined);
  assert.equal(result.themeSeason, undefined);
  assert.equal(result.memo.base, null);
  assert.deepEqual(source, before);
});

test('LLM control receives only the identical booking brief and is judged on shared evidence', async () => {
  const source = makeSource();
  let received;
  const report = await benchmarkFestival(source, { propose: async brief => { received = brief; return { selectedIds: source.memo.items.slice(1).map(item => item.id), reason: 'General knowledge' }; } });
  assert.deepEqual(received.constraints, report.qloo.constraints);
  assert.equal(received.candidates.length, source.memo.items.length);
  for (const item of received.candidates) for (const forbidden of ['fit', 'evidence', 'receipts', 'rank', 'note', 'tags']) assert.equal(item[forbidden], undefined);
  assert.equal(report.status, 'compared');
  assert.ok(report.comparison.policyPointDelta > 0);
  assert.equal(report.control.totalFee, 50);
  assert.match(report.briefDigest, /^sha256:/);
});

test('benchmark never repairs or disguises invalid and unavailable LLM controls', async () => {
  const source = makeSource();
  const absent = await benchmarkFestival(source, { propose: async () => null });
  assert.equal(absent.status, 'unavailable');
  assert.equal(absent.control, null);
  const invented = await benchmarkFestival(source, { propose: async () => ({ selectedIds: ['invented'] }) });
  assert.equal(invented.status, 'invalid_control');
  const wrongSlots = await benchmarkFestival(source, { propose: async () => ({ selectedIds: [source.memo.items[0].id] }) });
  assert.equal(wrongSlots.status, 'constraint_failure');
  assert.equal(wrongSlots.comparison, null);
});

test('maintained fit is an actual optimizer constraint including missing rank evidence', () => {
  const source = makeSource();
  const constraints = { ...source.memo.constraints, excludedIds: [source.memo.items[0].id], minimumAverageFit: .75 };
  assert.equal(optimizeSlate(source.memo.items, constraints).feasible, false);
  assert.equal(evaluateSelection(source.memo.items, constraints, source.memo.items.slice(1).map(item => item.id)).feasible, false);
  assert.equal(optimizeSlate(source.memo.items, { ...constraints, minimumAverageFit: 2 }).status, 'invalid');
});

test('Ask GM requires a declared headliner, preserves budget and rejects unmaintainable fit', async () => {
  const source = makeSource(), before = structuredClone(source);
  const request = 'Replace the headliner, keep the budget and maintain audience fit';
  assert.equal((await reviseFestival(source, { request })).status, 'needs_input');
  const result = await reviseFestival(source, { request, headlinerId: source.memo.items[0].id });
  assert.equal(result.status, 'rejected');
  assert.equal(result.slate.constraints.budget, source.memo.constraints.budget);
  assert.equal(result.slate.constraints.minimumAverageFit, .75);
  assert.deepEqual(source, before);
});

test('Ask GM forks valid natural-language revisions and keeps locks', async () => {
  const source = makeSource();
  const result = await reviseFestival(source, { request: 'Replace Alpha, keep the budget' });
  assert.equal(result.status, 'revised');
  assert.equal(result.snapshot.parentId, source.id);
  assert.ok(!result.snapshot.memo.slate.selectedIds.includes(source.memo.items[0].id));
  assert.equal(result.revision.interpreter, 'bounded-grammar');
  source.memo.constraints.lockedIds = [source.memo.items[0].id];
  const blocked = await reviseFestival(source, { request: 'Exclude Alpha' });
  assert.equal(blocked.status, 'rejected');
});

test('maintain-fit revision finds an equally fitting replacement without changing the budget', async () => {
  const source = makeSource();
  source.memo.items[2].fit = 1;
  // The source decision deliberately fixes Alpha/Beta; a new equal-fit act is available.
  source.memo.slate.selectedIds = source.memo.items.slice(0, 2).map(item => item.id);
  const result = await reviseFestival(source, { request: 'Replace Alpha, keep the budget and maintain audience fit' });
  assert.equal(result.status, 'revised');
  assert.ok(result.revision.revisedMeanFit >= result.revision.previousMeanFit);
  assert.equal(result.snapshot.memo.constraints.budget, 100);
  assert.ok(result.snapshot.gm.verification.feasible);
});

test('research deadlines stop later workflows and retain unavailable receipts', async () => {
  let now = 0, calls = 0;
  const run = new Run({ mode: 'mock', deadlineMs: 10, now: () => now, cacheStore: new Map(), execute: () => {
    calls++; now = 20; return { status: 'ok', results: [{ name: 'Result' }] };
  } });
  await run.call('entity_tags', {}, 'First call');
  const late = await run.call('entity_tags', {}, 'Deadline reached, even cached data must be marked');
  assert.equal(calls, 1);
  assert.equal(late.receipt.evidence.error, 'DEADLINE');
  assert.equal(late.receipt.attempts, 0);
});

test('mock rank preserves saved entity IDs even without a process-local identity registry', () => {
  const result = mockCall('rank', { options: ['mock-persisted-artist-1', 'mock-persisted-artist-2'] });
  assert.deepEqual(new Set(result.results.map(row => row.entity_id)), new Set(['mock-persisted-artist-1', 'mock-persisted-artist-2']));
});

test('LLM revisions cannot inject IDs or unrequested budget changes', async () => {
  const source = makeSource();
  await assert.rejects(reviseFestival(source, { request: 'Change things' }, { interpret: async () => ({ action: 'revise', excludeIds: ['foreign'], lockIds: [] }) }), /unknown/);
  await assert.rejects(reviseFestival(source, { request: 'Change things' }, { interpret: async () => ({ action: 'revise', excludeIds: [], lockIds: [], budget: 1000 }) }), /explicitly/);
});

test('source date selection retains segment rotation, spacing, synthetic labels and shortage reporting', () => {
  const result = planDates({ sport: 'baseball', count: 8, gapDays: 20 });
  assert.equal(result.synthetic, true);
  const selected = result.selected;
  for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) assert.ok(Math.abs(Date.parse(selected[i].date) - Date.parse(selected[j].date)) >= 20 * 864e5);
  assert.throws(() => planDates({ dates: [{ date: '2026-02-30', time: 'night' }] }), /valid/);
  const shortage = planDates({ count: 4, dates: [{ date: '2026-11-01', time: 'night' }] });
  assert.equal(shortage.scheduledCount, 1);
  assert.ok(shortage.warnings.some(warning => warning.includes('spacing')));
});

test('theme seasons use known anchors, evidence-linked kits and explicit licensing review', async () => {
  const source = makeSource(), run = makeRun();
  const snapshot = await runFestivalGM(source, normalizeFestivalResearch(source), run);
  const season = buildThemeSeason(snapshot, { sport: 'basketball', count: 3 });
  assert.equal(season.nights.length, 3);
  const known = snapshot.festivalResearch.markets[0].domains.flatMap(domain => domain.entities.map(item => item.id));
  assert.ok(season.nights.every(night => known.includes(night.anchor.id)));
  assert.ok(season.nights.every(night => night.rights.status === 'review_required'));
  assert.ok(season.nights.every(night => night.tasteFit.measuredWeight === .3));
  assert.ok(season.nights.every(night => night.evidence.every(id => run.receipts.some(receipt => receipt.id === id))));
  assert.equal(withoutDerived({ ...snapshot, themeSeason: season }).themeSeason, undefined);
});
