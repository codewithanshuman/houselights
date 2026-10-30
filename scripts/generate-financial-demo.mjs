import { writeFileSync } from 'node:fs';
import { normalizeDemandInput } from '../server/demand.mjs';
import { normalizeFinancial } from '../server/financial/schema.mjs';
import { exactFeasibleLineups, evaluateFinancial } from '../server/financial/optimizer.mjs';
import { stressTests } from '../server/financial/stress-tests.mjs';
import { explainFinancial } from '../server/financial/explanations.mjs';

export const demoInput = {
  brief: { city: 'London', venue: 'Illustrative 5,000-capacity room', genre: 'Electronic / Indie', eventDate: '2027-06-12',
    capacity: 5000, ticketPrice: 45, currency: 'GBP', competitionCount: 1 },
  constraints: { budget: 95000, slots: 3, maxPerGenre: 2, discoveryMin: 0 },
  assumptions: { baseSellThrough: .78, priceElasticity: -1.1 },
  candidates: [
    { id: 'electronic-a', name: 'Electronic A', fee: 42000, genre: 'Electronic', available: true },
    { id: 'electronic-b', name: 'Electronic B', fee: 36000, genre: 'Electronic', available: true },
    { id: 'electronic-c', name: 'Electronic C', fee: 29000, genre: 'Electronic', available: true },
    { id: 'indie-a', name: 'Indie A', fee: 33000, genre: 'Indie', available: true },
    { id: 'indie-b', name: 'Indie B', fee: 27000, genre: 'Indie', available: true },
    { id: 'pop-a', name: 'Pop A', fee: 24000, genre: 'Pop', available: true },
    { id: 'jazz-a', name: 'Jazz A', fee: 18000, genre: 'Jazz', available: true },
    { id: 'local-a', name: 'Local A', fee: 12000, genre: 'Indie', available: true },
  ],
  financial: {
    currency: 'GBP', ticketTiers: [{ name: 'General', price: 45, allocation: 4000 }, { name: 'Premium', price: 80, allocation: 1000 }],
    costs: { venue: 28000, production: 32000, marketing: 15000, staffing: 12000, insurance: 5000, other: 0, perAttendee: 2 },
    revenue: { ancillaryPerTicket: 3, ancillaryFixed: 0 },
    tax: { mode: 'included', rate: .2, reference: 'Illustrative assumption; organizer must verify applicable tax and contract terms.' },
    fees: { ownership: 'promoter', perTicket: 1.5, fixed: 0, percent: .02 },
    risk: { eventCancellationProbability: .01, artistCancellationProbability: .03, feeEscalationProbability: .1,
      feeEscalationRate: .15, artistCancellationRefundFraction: .5, eventArtistFeeRefundFraction: .25, ticketRefundFraction: .25,
      eventTicketRefundFraction: 1, replacementFee: 15000, cancellationPenalty: 5000 },
    uncertainty: { demand: .18, costs: .1, competition: .07, weather: .06 },
    cashTiming: { artistDepositFraction: .5, fixedCostPreRevenueFraction: .7, refundReserveFraction: .1 },
    policy: { objective: 'balanced', maximumEventBudget: 190000, maximumCvarLoss: 65000 },
    assumptionSets: [{ id: 'base', demandMultiplier: 1, costMultiplier: 1 },
      { id: 'cautious', demandMultiplier: .85, costMultiplier: 1.1, reference: 'Illustrative demand shortfall and cost pressure.' },
      { id: 'strong-presales', demandMultiplier: 1.2, costMultiplier: .9, reference: 'Optimistic organizer hypothesis; no observed presale evidence.' }],
    simulation: { draws: 10000, seed: 20261022, mode: 'scenario', assumptionSet: 'illustrative-v1' },
    lossThreshold: 50000,
    evidenceReferences: ['All booking terms, demand and risk inputs in this demo are synthetic organizer assumptions.'],
  },
};

export function generateDemo() {
  const input = normalizeDemandInput(demoInput), config = normalizeFinancial(demoInput.financial, input);
  const prefiltered = exactFeasibleLineups(input, config, { status: 'insufficient_outcomes' }, null);
  const result = evaluateFinancial(config, prefiltered);
  if (result.status === 'scenario_complete') {
    const keys = new Set(result.assumptionResults[0].rows.map(row => JSON.stringify(row.selectedIds)));
    const finalists = prefiltered.lineups.filter(row => keys.has(JSON.stringify(row.selectedIds)));
    result.stressTestsBySet = Object.fromEntries(config.assumptionSets.map(set => [set.id, stressTests(config, finalists, result, set.id)]));
    result.explanationsBySet = Object.fromEntries(config.assumptionSets.map(set => [set.id, explainFinancial(result, result.stressTestsBySet[set.id], set.id)]));
    result.stressTests = result.stressTestsBySet[config.assumptionSets[0].id];
    result.explanations = result.explanationsBySet[config.assumptionSets[0].id];
  }
  return { status: result.status, label: 'SYNTHETIC ILLUSTRATION — NOT A REAL FORECAST',
    input: demoInput, config, provenance: { seed: config.simulation.seed, draws: config.simulation.draws,
      modelVersion: config.modelVersion, demandSource: 'organizer_sell_through_assumption',
      qlooSource: 'none', historicalFinancialValidation: 'none' }, result };
}
if (process.argv[1] && new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).pathname.toLowerCase().endsWith('/generate-financial-demo.mjs')) {
  const output = generateDemo();
  writeFileSync(new URL('../artifacts/financial-demo.json', import.meta.url), JSON.stringify(output));
  console.log(`Generated ${output.result.finalCount ?? 0} synthetic financial alternatives from ${output.config.simulation.draws} seeded draws.`);
}
