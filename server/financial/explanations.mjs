export function explainFinancial(result, stress, assumptionId = result.assumptionResults[0].id) {
  const base = result.assumptionResults.find(row => row.id === assumptionId), selected = base.rows.find(row => JSON.stringify(row.selectedIds) === JSON.stringify(base.selectedIds ?? base.rows[0]?.selectedIds));
  if (!selected) return { status: 'infeasible', drivers: [] };
  const alternative = base.rows.find(row => row !== selected) ?? null;
  const left = selected.metrics.expectedLedger, right = alternative?.metrics.expectedLedger;
  const delta = field => right ? Math.round((left[field] - right[field]) * 100) / 100 : null;
  const comparison = alternative ? { againstSelectedIds: alternative.selectedIds,
    expectedProfitDifference: delta('profit'),
    components: [
      { name: 'Ticket receipts · different paid demand at the same tier prices', contribution: delta('ticketReceipts') },
      { name: 'Ancillary revenue · attendance and disruption', contribution: delta('ancillary') },
      { name: 'Refund exposure', contribution: -delta('refunds') },
      { name: 'Promoter-borne ticketing fees', contribution: -delta('promoterFees') },
      { name: 'Declared ticket tax', contribution: -delta('tax') },
      { name: 'Artist quotes and booking disruption', contribution: -delta('artistCosts') },
      { name: 'Fixed event costs and correlated cost shock', contribution: -delta('fixedCosts') },
      { name: 'Variable paid-attendee costs', contribution: -delta('variableCosts') },
    ], note: 'Common random numbers isolate the comparison within this declared scenario model. Tier prices are identical for both lineups; receipt differences mainly reflect modeled paid demand. This is an accounting decomposition, not causal attribution.' } : null;
  const drivers = stress.filter(row => Number.isFinite(row.originalProfitChange)).map(row => ({
    name: row.label, expectedProfitChange: row.originalProfitChange,
    interpretation: row.originalProfitChange < 0 ? 'reduces modeled expected profit' : 'increases modeled expected profit',
  })).sort((a, b) => a.expectedProfitChange - b.expectedProfitChange);
  return { status: 'controlled_sensitivity', selectedIds: selected.selectedIds, drivers, comparison,
    financialBridge: { expectedGrossRevenue: selected.metrics.grossRevenue.mean, expectedTotalOutflow: selected.metrics.costs.mean,
      expectedProfit: selected.metrics.profit.mean },
    demandBasis: selected.demand.source, culturalFit: selected.culturalFit,
    note: 'These are controlled scenario sensitivities with common random numbers, not causal attribution or measured event outcomes.' };
}
