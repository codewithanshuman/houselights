import { marketDraws, simulateLineup } from './simulation.mjs';
import { selectPolicy } from './optimizer.mjs';

export const namedStresses = [
  { id: 'demand_slump', label: 'Demand slump', demandMultiplier: .8 },
  { id: 'cost_inflation', label: 'Production and venue inflation', costMultiplier: 1.2 },
  { id: 'fee_shock', label: 'Artist fee escalation', feeEscalationProbability: 1, feeEscalationRate: .15 },
  { id: 'cancellation_wave', label: 'Artist cancellation wave', artistCancellationProbability: .15 },
  { id: 'compound', label: 'Compound adverse night', demandMultiplier: .75, costMultiplier: 1.2, artistCancellationProbability: .15 },
];
export function stressTests(config, finalists, baseResult, assumptionId = config.assumptionSets[0].id, checkCanceled = () => false) {
  const market = marketDraws(config, Math.min(config.simulation.draws, 10000));
  const baseSet = config.assumptionSets.find(set => set.id === assumptionId);
  const originalResult = baseResult.assumptionResults.find(set => set.id === assumptionId);
  if (!baseSet || !originalResult) throw new Error('Unknown assumption set for stress analysis.');
  return namedStresses.map(stress => {
    if (checkCanceled()) throw new Error('Financial job canceled.');
    const changed = structuredClone(config), assumption = { ...baseSet };
    if (stress.demandMultiplier != null) assumption.demandMultiplier *= stress.demandMultiplier;
    if (stress.costMultiplier != null) assumption.costMultiplier *= stress.costMultiplier;
    if (stress.feeEscalationProbability != null) changed.booking.feeEscalationProbability = stress.feeEscalationProbability;
    if (stress.feeEscalationRate != null) changed.booking.feeEscalationRate = stress.feeEscalationRate;
    if (stress.artistCancellationProbability != null) changed.booking.artistCancellationProbability = stress.artistCancellationProbability;
    const rows = finalists.map(lineup => simulateLineup(changed, lineup, market, assumption));
    const chosen = selectPolicy(rows, config.policy);
    const originalKey = JSON.stringify(originalResult.selectedIds ?? originalResult.rows[0]?.selectedIds);
    const original = rows.find(row => JSON.stringify(row.selectedIds) === originalKey);
    const originalBase = originalResult.rows.find(row => JSON.stringify(row.selectedIds) === originalKey);
    return { id: stress.id, label: stress.label, assumptionSetId: assumptionId, draws: market.length, selectedIds: chosen?.selectedIds ?? null,
      originalSelectedIds: original?.selectedIds ?? null,
      originalExpectedProfit: original?.metrics.profit.mean ?? null,
      originalProfitChange: original && originalBase ? original.metrics.profit.mean - originalBase.metrics.profit.mean : null,
      originalCvarLoss: original?.metrics.conditionalValueAtRisk95 ?? null,
      decisionChanges: JSON.stringify(chosen?.selectedIds ?? null) !== JSON.stringify(originalResult.selectedIds ?? null),
      caveat: 'One declared stress at a time except the compound case; reuses the original seed and market shocks.' };
  });
}
