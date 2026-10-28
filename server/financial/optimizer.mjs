import { enumerateSlates } from '../optimizer.mjs';
import { prepareLineupDemand } from './demand-adapter.mjs';
import { minor } from './money.mjs';
import { marketDraws, simulateLineup } from './simulation.mjs';

function dominates(a, b) {
  const x = a.metrics, y = b.metrics;
  const aFit = a.culturalFit ?? 0, bFit = b.culturalFit ?? 0;
  return x.profit.mean >= y.profit.mean && x.conditionalValueAtRisk95 <= y.conditionalValueAtRisk95 && aFit >= bFit &&
    (x.profit.mean > y.profit.mean || x.conditionalValueAtRisk95 < y.conditionalValueAtRisk95 || aFit > bFit);
}
export function pareto(rows) { return rows.filter(row => !rows.some(other => other !== row && dominates(other, row))); }
function rank(a, b) { return b.metrics.profit.mean - a.metrics.profit.mean || a.metrics.conditionalValueAtRisk95 - b.metrics.conditionalValueAtRisk95 || b.culturalFit - a.culturalFit; }
export function selectPolicy(rows, policy) {
  const eligible = rows.filter(row => policy.maxCvarLossCents == null || minor(row.metrics.conditionalValueAtRisk95, 'CVaR loss') <= policy.maxCvarLossCents);
  if (policy.objective === 'downside') return eligible.sort(rank)[0] ?? null;
  if (policy.objective === 'balanced') return pareto(eligible).sort((a, b) =>
    (b.metrics.profit.mean / Math.max(1, b.metrics.conditionalValueAtRisk95 + 10000) + (b.culturalFit ?? 0) / 100) -
    (a.metrics.profit.mean / Math.max(1, a.metrics.conditionalValueAtRisk95 + 10000) + (a.culturalFit ?? 0) / 100))[0] ?? null;
  return eligible.sort(rank)[0] ?? null;
}
export function exactFeasibleLineups(input, config, modelReport, twin) {
  const rows = enumerateSlates(input.candidates, input.constraints).filter(row => row.feasible);
  const fixed = Object.values(config.costs).reduce((sum, value) => sum + value, 0);
  const eligible = rows.filter(row => config.policy.maxEventBudgetCents == null ||
    minor(row.totalFee, 'Selected quote total') + fixed <= config.policy.maxEventBudgetCents);
  const ranked = eligible.filter(row => !twin || row.selectedIds.every(id => twin.rankedCandidateIds.includes(id)))
    .sort((a, b) => b.score - a.score || a.totalFee - b.totalFee);
  const cheapest = [...ranked].sort((a, b) => a.totalFee - b.totalFee).slice(0, 12);
  const shortlist = [...new Map([...ranked.slice(0, 48), ...cheapest].map(row => [[...row.selectedIds].sort().join('|'), row])).values()];
  const weightedPrice = config.ticketTiers.reduce((sum, tier) => sum + tier.priceCents * tier.allocation, 0) / config.sellableCapacity / 100;
  const lineups = shortlist.map(row => {
    const selected = row.selectedIds.map(id => input.candidates.find(item => item.id === id));
    const culturalFit = selected.every(item => item.qloo.rank) ? selected.reduce((sum, item) => sum + item.fit, 0) / selected.length * 100 : null;
    return { selectedIds: row.selectedIds, culturalFit, culturalDecisionScore: row.score, selected,
      demand: prepareLineupDemand(input, row.selectedIds, modelReport, twin, weightedPrice) };
  });
  return { checkedCount: rows.length, feasibleCount: eligible.length, shortlistedCount: lineups.length, lineups,
    filterDisclosure: 'Existing exact booking optimizer enumerates and filters hard-feasible slates. The financial shortlist is the top 48 cultural slates plus 12 cheapest; risk selection is exact within the final simulated subset, not all feasible slates.' };
}
export function evaluateFinancial(config, prefiltered, { checkCanceled = () => false } = {}) {
  if (!prefiltered.lineups.length) return { status: 'infeasible', reason: 'No slate satisfies the booking and event-budget constraints with usable demand assumptions.',
    checkedCount: prefiltered.checkedCount, feasibleCount: prefiltered.feasibleCount };
  const pilot = marketDraws(config, Math.min(512, config.simulation.draws));
  const pilotSet = config.assumptionSets[0];
  const scored = prefiltered.lineups.map(lineup => ({ lineup, report: simulateLineup(config, lineup, pilot, pilotSet) }))
    .sort((a, b) => b.report.metrics.profit.mean - a.report.metrics.profit.mean);
  if (checkCanceled()) throw new Error('Financial job canceled.');
  const contenders = [...new Map([
    ...scored.slice(0, 5),
    ...[...scored].sort((a, b) => a.report.metrics.conditionalValueAtRisk95 - b.report.metrics.conditionalValueAtRisk95).slice(0, 2),
    ...[...scored].sort((a, b) => b.lineup.culturalFit - a.lineup.culturalFit).slice(0, 2),
  ].map(row => [[...row.lineup.selectedIds].sort().join('|'), row.lineup])).values()].slice(0, 9);
  const market = marketDraws(config), assumptionResults = [];
  for (const assumption of config.assumptionSets) {
    const rows = [];
    for (const lineup of contenders) {
      if (checkCanceled()) throw new Error('Financial job canceled.');
      rows.push(simulateLineup(config, lineup, market, assumption));
    }
    rows.sort(rank);
    const selected = selectPolicy(rows, config.policy), efficient = pareto(rows);
    assumptionResults.push({ id: assumption.id, reference: assumption.reference, rows, selectedIds: selected?.selectedIds ?? null,
      paretoIds: efficient.map(row => row.selectedIds), downsidePolicyInfeasible: config.policy.objective === 'downside' && !selected,
      decisionStatus: !selected ? 'no_lineup_within_downside_limit' : rows.every(row => row.metrics.profit.mean < 0)
        ? 'do_not_book_under_assumptions' : 'conditional_scenario_preference' });
  }
  return { status: 'scenario_complete', assumptionResults, checkedCount: prefiltered.checkedCount,
    feasibleCount: prefiltered.feasibleCount, shortlistedCount: prefiltered.shortlistedCount, finalCount: contenders.length,
    filterDisclosure: prefiltered.filterDisclosure, commonRandomNumbers: true,
    caveat: 'Monte Carlo frequencies are conditional on organizer assumptions. More draws reduce simulation noise, not model error or weak evidence.' };
}
