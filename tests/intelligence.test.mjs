import test from 'node:test';
import assert from 'node:assert/strict';
import { Run } from '../server/qloo.mjs';
import { buildCulturalIntelligence, distanceKm, intelligenceWorkflowCount, normalizeIntelligenceInput, optimizeMarketRoute } from '../server/intelligence.mjs';

const input = normalizeIntelligenceInput({
  origin: { name: 'London', lat: 51.5074, lon: -0.1278 },
  markets: [
    { name: 'London', lat: 51.5074, lon: -0.1278 },
    { name: 'Paris', lat: 48.8566, lon: 2.3522 },
    { name: 'Berlin', lat: 52.52, lon: 13.405 }
  ],
  stopCount: 2,
  startDate: '2026-11-20'
});

test('geographic inputs are strict and distance uses great-circle kilometers', () => {
  assert.ok(distanceKm(input.markets[0], input.markets[1]) > 330);
  assert.throws(() => normalizeIntelligenceInput({ markets: [], startDate: '2026-11-20' }), /2–8/);
  assert.throws(() => normalizeIntelligenceInput({ markets: [input.markets[0], input.markets[1]], startDate: '2026-02-30' }), /valid/);
  assert.throws(() => normalizeIntelligenceInput({ markets: [input.markets[0], { ...input.markets[1], name: 'London' }], startDate: '2026-11-20' }), /unique/);
  assert.throws(() => normalizeIntelligenceInput({ markets: input.markets.slice(0, 2), startDate: '2026-11-20', profileTargets: ['restaurant'] }), /supports/);
  assert.equal(intelligenceWorkflowCount(input, 2), 15);
});

test('route search checks every ordered route and maximizes declared comparable evidence utility before distance', () => {
  const scored = input.markets.map((market, index) => ({ ...market, marketScore: [92, 80, 20][index] }));
  const result = optimizeMarketRoute(scored, input);
  assert.equal(result.feasible, true);
  assert.equal(result.checkedCount, 6);
  assert.deepEqual(new Set(result.stops.map(stop => stop.name)), new Set(['London', 'Paris']));
  assert.equal(result.tasteUtility, 172);
  assert.equal(result.evidenceCoverageUtility, 172);
  assert.equal(result.objective, 'evidence_coverage');
  assert.ok(result.stops.every(stop => /^2026-11-\d{2}$/.test(stop.showDate)));
  if (result.stops[1].fromKm <= input.rules.maxDriveKmPerDay) {
    const days = (new Date(result.stops[1].showDate) - new Date(result.stops[0].showDate)) / 86400000;
    assert.equal(days, 1, 'a one-day transfer can play the following day');
  }
});

test('routes longer than five shows materialize the declared day-off rule', () => {
  const markets = Array.from({ length: 6 }, (_, index) => ({ name: `Market ${index + 1}`, lat: 40 + index * 2, lon: -75, marketScore: 100 - index }));
  const longInput = normalizeIntelligenceInput({ origin: markets[0], markets, stopCount: 6, startDate: '2026-11-01', includeAudienceProfile: false });
  const result = optimizeMarketRoute(markets, longInput);
  assert.equal(result.feasible, true);
  assert.equal(result.checkedCount, 720);
  assert.equal(result.stops[5].dayOffBefore, true);
  const gap = (new Date(result.stops[5].showDate) - new Date(result.stops[4].showDate)) / 86400000;
  assert.equal(gap, 2);
});

test('cultural intelligence produces receipt-backed market, cohesion, route and venue modules', async () => {
  const snapshot = {
    id: 'fixture', memo: {
      slate: { feasible: true, selectedIds: ['a', 'b'] },
      items: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }]
    }
  };
  const run = new Run({ mode: 'mock', budget: 20, receiptPrefix: 'i', cacheStore: new Map(), delay: async () => {} });
  const report = await buildCulturalIntelligence(snapshot, input, run);
  assert.equal(report.markets.length, 3);
  assert.equal(report.cohesion.pairCount, 1);
  assert.equal(report.cohesion.supportedPairCount, 1);
  assert.ok(report.cohesion.pairs[0].sharedTastes.length > 0);
  assert.equal(report.venueScouting.length, 2);
  assert.ok(report.venueScouting.every(row => row.candidates.length === 3));
  assert.equal(report.receipts.length, 15);
  assert.ok(report.receipts.every(receipt => receipt.id.startsWith('i') && receipt.source === 'synthetic'));
  assert.equal(report.chartData.artistMarketMatrix.length, 6);
  assert.equal(report.audienceProfile.enabled, true);
  assert.equal(report.audienceProfile.tags.length, 3);
  assert.equal(report.audienceProfile.demographics.length, 2);
  assert.deepEqual(report.audienceProfile.crossDomain.map(row => row.targetType), ['brand', 'movie', 'podcast']);
  assert.ok(report.audienceProfile.crossDomain.every(row => row.rows.length === 3));
  assert.match(report.audienceProfile.interpretation, /not describe an individual/);
  assert.match(report.cohesion.interpretation, /not audience overlap/);
});

test('audience profile can be disabled to preserve a smaller explicit workflow budget', async () => {
  const snapshot = { id: 'fixture', memo: { slate: { feasible: true, selectedIds: ['a'] }, items: [{ id: 'a', name: 'Alpha' }] } };
  const compactInput = { ...input, includeAudienceProfile: false, profileTargets: [] };
  const run = new Run({ mode: 'mock', budget: 10, receiptPrefix: 'i', cacheStore: new Map(), delay: async () => {} });
  const report = await buildCulturalIntelligence(snapshot, compactInput, run);
  assert.equal(report.audienceProfile.enabled, false);
  assert.equal(report.receipts.length, 5);
  assert.equal(intelligenceWorkflowCount(compactInput, 1), 5);
});
