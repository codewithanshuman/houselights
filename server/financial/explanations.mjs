export function explainFinancial(result, stress, assumptionId = result.assumptionResults[0].id) {
  const base = result.assumptionResults.find(row => row.id === assumptionId), selected = base.rows.find(row => JSON.stringify(row.selectedIds) === JSON.stringify(base.selectedIds ?? base.rows[0]?.selectedIds));
  if (!selected) return { status: 'infeasible', drivers: [] };
  const drivers = stress.filter(row => Number.isFinite(row.originalProfitChange)).map(row => ({
    name: row.label, expectedProfitChange: row.originalProfitChange,
    interpretation: row.originalProfitChange < 0 ? 'reduces modeled expected profit' : 'increases modeled expected profit',
  })).sort((a, b) => a.expectedProfitChange - b.expectedProfitChange);
  return { status: 'controlled_sensitivity', selectedIds: selected.selectedIds, drivers,
    financialBridge: { expectedGrossRevenue: selected.metrics.grossRevenue.mean, expectedTotalOutflow: selected.metrics.costs.mean,
      expectedProfit: selected.metrics.profit.mean },
    demandBasis: selected.demand.source, culturalFit: selected.culturalFit,
    note: 'These are controlled scenario sensitivities with common random numbers, not causal attribution or measured event outcomes.' };
}
