import { performance } from 'node:perf_hooks';
import { demoInput } from './generate-financial-demo.mjs';
import { normalizeDemandInput } from '../server/demand.mjs';
import { normalizeFinancial } from '../server/financial/schema.mjs';
import { exactFeasibleLineups, evaluateFinancial } from '../server/financial/optimizer.mjs';
import { stressTests } from '../server/financial/stress-tests.mjs';
import { explainFinancial } from '../server/financial/explanations.mjs';

function run({ draws, capacity, noBreakEven }) {
  const raw = structuredClone(demoInput);
  raw.brief.capacity = capacity;
  raw.financial.ticketTiers[0].allocation = Math.round(capacity * .8);
  raw.financial.ticketTiers[1].allocation = capacity - raw.financial.ticketTiers[0].allocation;
  raw.financial.simulation.draws = draws;
  raw.financial.assumptionSets = [raw.financial.assumptionSets[0]];
  if (noBreakEven) {
    raw.financial.costs.venue = 10_000_000;
    raw.financial.policy.maximumEventBudget = 12_000_000;
  }
  const started = performance.now();
  const input = normalizeDemandInput(raw);
  const config = normalizeFinancial(raw.financial, input);
  const prefiltered = exactFeasibleLineups(input, config, { status: 'insufficient_outcomes' }, null);
  const result = evaluateFinancial(config, prefiltered);
  if (result.status !== 'scenario_complete') throw new Error(`Benchmark did not complete: ${result.status}`);
  const keys = new Set(result.assumptionResults[0].rows.map(row => JSON.stringify(row.selectedIds)));
  const finalists = prefiltered.lineups.filter(row => keys.has(JSON.stringify(row.selectedIds)));
  const stresses = stressTests(config, finalists, result, config.assumptionSets[0].id);
  const explanations = explainFinancial(result, stresses, config.assumptionSets[0].id);
  const elapsedMs = Math.round(performance.now() - started);
  const rows = result.assumptionResults[0].rows;
  return { draws, capacity, noBreakEven, elapsedMs, shortlisted: prefiltered.shortlistedCount,
    finalists: rows.length, simulatedOutcomes: rows.length * draws, stressTests: stresses.length,
    explanationStatus: explanations.status, breakEven: rows.map(row => row.breakEvenTickets) };
}

const cases = [
  { draws: 10_000, capacity: 5_000, noBreakEven: false },
  { draws: 100_000, capacity: 5_000, noBreakEven: false },
  { draws: 10_000, capacity: 100_000, noBreakEven: true },
];
for (const item of cases) console.log(JSON.stringify(run(item)));
