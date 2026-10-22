import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { normalizeDemandInput } from '../server/demand.mjs';
import { normalizeFinancial } from '../server/financial/schema.mjs';
import { cholesky } from '../server/financial/correlations.mjs';
import { marketDraws, simulateLineup } from '../server/financial/simulation.mjs';
import { riskMetrics } from '../server/financial/risk-metrics.mjs';
import { exactFeasibleLineups, evaluateFinancial, pareto, selectPolicy } from '../server/financial/optimizer.mjs';
import { prepareLineupDemand } from '../server/financial/demand-adapter.mjs';
import { demoInput } from '../scripts/generate-financial-demo.mjs';

function setup() { const input = normalizeDemandInput(demoInput), config = normalizeFinancial(demoInput.financial, input);
  return { input, config, pre: exactFeasibleLineups(input, config, { status: 'insufficient_outcomes' }, null) }; }
test('invalid correlation matrices are rejected rather than repaired silently', () => {
  assert.throws(() => cholesky([[1, 2, 0, 0], [2, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]), /bounded/);
  assert.throws(() => cholesky([[1, 0, 0, 0], [.2, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]), /symmetric/);
  assert.throws(() => cholesky([[1, 1, 0, 0], [1, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]), /positive definite/);
});
test('shared market factors are reproducible and correlated', () => {
  const { config } = setup(), a = marketDraws(config, 10000), b = marketDraws(config, 10000);
  assert.deepEqual(a.slice(0, 5), b.slice(0, 5));
  const avg = field => a.reduce((sum, row) => sum + row.factor[field], 0) / a.length;
  const x = avg(0), y = avg(3);
  const covariance = a.reduce((sum, row) => sum + (row.factor[0] - x) * (row.factor[3] - y), 0) / a.length;
  assert.ok(covariance > .35 && covariance < .55);
  config.simulation.seed++;
  assert.notDeepEqual(a.slice(0, 5), marketDraws(config, 5));
});
test('CVaR and value-at-risk use the worst 5 percent of profit draws', () => {
  const rows = [-10000, -5000, 0, 5000, 10000].map(profitCents => ({ profitCents, ticketsSold: 0, attendance: 0,
    grossRevenueCents: 0, totalCostsCents: 0, promoterFeesCents: 0, taxCents: 0, refundsCents: 0, cashBeforeRevenueCents: 0 }));
  const metrics = riskMetrics(rows, 6000);
  assert.equal(metrics.profit.mean, 0); assert.equal(metrics.conditionalValueAtRisk95, 100);
  assert.equal(metrics.valueAtRisk95, 90); assert.equal(metrics.breakEvenProbability, .6);
  assert.equal(metrics.lossBeyondThresholdProbability, .2);
});
test('optimizer only compares exact-feasible lineups and emits explicit scenario uncertainty', () => {
  const { input, config, pre } = setup();
  assert.ok(pre.feasibleCount >= 5); assert.ok(pre.lineups.length >= 5);
  const result = evaluateFinancial(config, pre);
  assert.equal(result.status, 'scenario_complete'); assert.equal(result.commonRandomNumbers, true);
  const base = result.assumptionResults[0]; assert.ok(base.rows.length >= 5);
  for (const row of base.rows) {
    assert.equal(row.selectedIds.length, input.constraints.slots);
    assert.ok(row.selectedFee <= input.constraints.budget);
    assert.ok(row.metrics.attendance.maximum <= config.sellableCapacity);
    assert.equal(row.demand.source, 'organizer_sell_through_assumption');
  }
  assert.ok(pareto(base.rows).length); assert.ok(selectPolicy(base.rows, { objective: 'expected_profit' }));
  assert.equal(selectPolicy(base.rows, { objective: 'downside', maxCvarLossCents: 0 }), null);
});
test('audience twin feeds overlap-adjusted segment ticket scenarios into the financial sampler', () => {
  const { input, config } = setup(), selectedIds = input.candidates.slice(0, 3).map(row => row.id);
  const twin = { id: 'synthetic-test', rankedCandidateIds: selectedIds, overlapAssumption: .5,
    audiencePool: 8000, segments: [{ id: 'seg', labels: ['test'], weight: 1, baseIntent: .55,
      priceElasticity: -.8, competitionLoss: .05, receiptIds: [],
      affinity: Object.fromEntries(selectedIds.map(id => [id, .8])) }] };
  const demand = prepareLineupDemand(input, selectedIds, { status: 'insufficient_outcomes' }, twin, 45);
  assert.equal(demand.source, 'audience_twin_assumption_scenario');
  assert.equal(demand.pointTickets, demand.range.point); assert.equal(demand.twin.twinId, twin.id);
  const lineup = { selectedIds, selected: input.candidates.slice(0, 3), culturalFit: 0, demand };
  const market = marketDraws(config, 200);
  const first = simulateLineup(config, lineup, market, config.assumptionSets[0]);
  const second = simulateLineup(config, lineup, market, config.assumptionSets[0]);
  assert.deepEqual(first.metrics.paidTickets, second.metrics.paidTickets);
  assert.ok(first.metrics.paidTickets.maximum <= config.sellableCapacity);
});
test('10,000 and 100,000 draw paths complete within the worker memory budget', () => {
  const { config, pre } = setup(), lineup = pre.lineups[0];
  const start = performance.now(), ten = simulateLineup(config, lineup, marketDraws(config, 10000), config.assumptionSets[0]);
  assert.equal(ten.metrics.profit.count, 10000);
  const hundred = simulateLineup(config, lineup, marketDraws(config, 100000), config.assumptionSets[0]);
  assert.equal(hundred.metrics.profit.count, 100000); assert.ok(performance.now() - start < 30000);
});
