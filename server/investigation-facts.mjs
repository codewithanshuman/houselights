// The model chooses which facts matter. It cannot author factual conclusions.
// These facts establish consistency with saved inputs, not real-world truth.
export function investigationFacts(source, observations) {
  const facts = [], currency = source.memo.currency;
  const money = value => Number.isFinite(value) ? `${currency} ${value.toFixed(2)}` : 'unknown';
  const names = ids => ids.map(id => source.memo.items.find(item => item.id === id)?.name ?? id).join(' + ');
  const add = (observation, key, text, values, receiptIds = []) => facts.push({
    id: `${observation.id}:${key}`, text, values, observationIds: [observation.id], receiptIds,
    kind: 'server_verified_fact', independentlyVerified: false,
    verification: 'Deterministically rendered from saved observations and declared assumptions.'
  });
  for (const observation of observations.filter(row => row.status === 'ok')) {
    const { tool, result, args } = observation;
    if (tool === 'initial_proof') {
      const slate = result.baseline;
      add(observation, 'budget', `The declared booking budget is ${money(source.memo.constraints.budget)}.`, { budget: source.memo.constraints.budget, currency });
      if (slate.feasible) add(observation, 'selection', `The current optimized lineup is ${names(slate.selectedIds)}; its assumed artist fees total ${money(slate.totalFee)}.`, { selectedIds: slate.selectedIds, totalFee: slate.totalFee, currency });
    } else if (tool === 'test_scenario') {
      if (result.feasible) {
        add(observation, 'selection', `The hypothetical ${money(result.constraints.budget)} budget produces a feasible lineup of ${names(result.selectedIds)}, with assumed fees of ${money(result.totalFee)}.`,
          { budget: result.constraints.budget, totalFee: result.totalFee, selectedIds: result.selectedIds, currency, feasible: true });
        const original = observations.find(row => row.tool === 'initial_proof')?.result.baseline;
        if (original?.feasible && Number.isFinite(original.totalFee)) {
          const feeDifference = (Math.round(result.totalFee * 100) - Math.round(original.totalFee * 100)) / 100;
          add(observation, 'fee_difference', `${feeDifference===0 ? "The scenario and current lineup have the same assumed artist-fee total." : `The scenario's assumed artist-fee total is ${money(Math.abs(feeDifference))} ${feeDifference < 0 ? 'lower' : 'higher'} than the current lineup.`} This is a planning comparison, not realized savings.`, { feeDifference, currency });
        }
      } else add(observation, 'infeasible', `No lineup satisfies every constraint in this hypothetical ${money(result.constraints.budget)} budget scenario.`, { budget: result.constraints.budget, feasible: false, reasons: result.reasons, currency });
    } else if (tool === 'market_rank') {
      add(observation, 'coverage', `The ${args.city} ranking returned ${result.returned} of ${result.requested} candidates. ${result.complete ? 'Ranks are ordinal within this fixed-pool query.' : 'The incomplete ranking does not support comparable full-pool fit scores.'}`, { city: args.city, returned: result.returned, requested: result.requested, complete: result.complete }, [result.receiptId].filter(Boolean));
      if (result.complete) for (const row of result.rows.filter(row => Number.isInteger(row.rank))) {
        add(observation, `rank:${row.id}`, `${row.name} ranks ${row.rank} of ${result.requested} in the ${args.city} fixed-pool query; this is not a ticket-demand estimate.`, { artistId: row.id, rank: row.rank, of: result.requested, city: args.city }, [result.receiptId].filter(Boolean));
      }
    } else if (tool === 'inspect_receipt') {
      const receipt = source.receipts?.find(row => row.id === args.receiptId);
      if (receipt) add(observation, 'receipt', `Saved receipt ${receipt.id} records ${receipt.tool} with status ${receipt.status}. Inspection does not authenticate commercial terms.`, { tool: receipt.tool, status: receipt.status }, [receipt.id]);
    } else if (tool === 'decision_proof') {
      const cancellations = result.cancellations ?? [];
      add(observation, 'proof', `The saved proof contains ${result.ablations?.length ?? 0} evidence withdrawal checks and ${cancellations.length} single-artist cancellation checks.`, { ablations: result.ablations?.length ?? 0, cancellations: cancellations.length });
    } else if (tool === 'artist_context') {
      add(observation, 'context', `Qloo ${args.kind} context was inspected for ${names([args.artistId])}; the recorded provider status is ${result.providerStatus}.`, { artistId: args.artistId, kind: args.kind, providerStatus: result.providerStatus }, [result.receiptId].filter(Boolean));
    }
  }
  return facts;
}

export function selectInvestigationFacts(source, observations, claimIds) {
  const catalog = investigationFacts(source, observations);
  if (!Array.isArray(claimIds) || claimIds.length < 1 || claimIds.length > 8 || new Set(claimIds).size !== claimIds.length || claimIds.some(id => !catalog.some(fact => fact.id === id))) throw new Error('Select 1–8 distinct exact claimIds from verifiedFacts; no free-form factual statements are accepted.');
  const selected = claimIds.map(id => catalog.find(fact => fact.id === id));
  if (!selected.some(fact => fact.observationIds.some(id => observations.some(row => row.id === id && row.tool === 'test_scenario' && row.status === 'ok')))) throw new Error('Select a verified fact from an executed test_scenario.');
  return selected;
}
