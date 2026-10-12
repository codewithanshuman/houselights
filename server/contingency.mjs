import { optimizeSlate } from './optimizer.mjs';

const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const unique = values => [...new Set(values)];
const cloneItems = items => items.map(item => ({ ...item, terms: { ...(item.terms || {}) }, evidence: { ...(item.evidence || {}) }, receipts: [...(item.receipts || [])] }));
const selectedSet = slate => new Set(slate?.selectedIds || []);
const difference = (left, right) => left.filter(value => !right.includes(value));

function combinations(values, size, start = 0, prefix = [], out = []) {
  if (prefix.length === size) { out.push(prefix); return out; }
  for (let index = start; index <= values.length - (size - prefix.length); index++) {
    combinations(values, size, index + 1, [...prefix, values[index]], out);
  }
  return out;
}

function summarize(result, baselineIds) {
  const selectedIds = result.selectedIds || [];
  return {
    status: result.status,
    feasible: result.feasible,
    selectedIds,
    totalFee: result.totalFee,
    remainingBudget: result.remainingBudget,
    score: result.score,
    retainedIds: selectedIds.filter(id => baselineIds.includes(id)),
    replacementIds: difference(selectedIds, baselineIds),
    removedIds: difference(baselineIds, selectedIds),
    reasons: result.reasons || [],
    relaxations: result.diagnostics?.relaxations || null
  };
}

function adjustFee(items, id, increasePercent) {
  return cloneItems(items).map(item => item.id !== id || typeof item.terms?.fee !== 'number'
    ? item
    : { ...item, terms: { ...item.terms, fee: money(item.terms.fee * (1 + increasePercent / 100)) } });
}

function adjustAllFees(items, increasePercent) {
  return cloneItems(items).map(item => typeof item.terms?.fee !== 'number' ? item
    : { ...item, terms: { ...item.terms, fee: money(item.terms.fee * (1 + increasePercent / 100)) } });
}

function cancellationResult(items, constraints, selectedIds, canceledId) {
  return optimizeSlate(items, {
    ...constraints,
    lockedIds: selectedIds.filter(id => id !== canceledId),
    excludedIds: unique([...(constraints.excludedIds || []), canceledId])
  });
}

function resilientSlates(items, constraints, baseline) {
  const rows = [];
  for (const ids of combinations(items.map(item => item.id), constraints.slots)) {
    const slate = optimizeSlate(items, { ...constraints, lockedIds: ids });
    if (!slate.feasible) continue;
    const fallbacks = ids.map(canceledId => cancellationResult(items, constraints, ids, canceledId));
    const feasibleFallbacks = fallbacks.filter(result => result.feasible);
    const scores = feasibleFallbacks.map(result => result.score);
    const budgets = feasibleFallbacks.map(result => result.remainingBudget);
    const replacements = unique(fallbacks.flatMap((result, index) => result.feasible
      ? difference(result.selectedIds, ids).map(id => `${ids[index]}:${id}`) : []));
    rows.push({
      selectedIds: ids,
      totalFee: slate.totalFee,
      score: slate.score,
      utilitySacrifice: money(baseline.score - slate.score),
      cancellationCoverage: feasibleFallbacks.length,
      cancellationCount: ids.length,
      worstCaseScore: scores.length ? Math.min(...scores) : null,
      averageFallbackScore: scores.length ? money(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
      minimumFallbackHeadroom: budgets.length ? Math.min(...budgets) : null,
      distinctReplacementPaths: replacements.length,
      differsFromBaseline: ids.some(id => !baseline.selectedIds.includes(id))
    });
  }
  rows.sort((a, b) =>
    b.cancellationCoverage - a.cancellationCoverage ||
    (b.worstCaseScore ?? -Infinity) - (a.worstCaseScore ?? -Infinity) ||
    (b.averageFallbackScore ?? -Infinity) - (a.averageFallbackScore ?? -Infinity) ||
    b.score - a.score || a.totalFee - b.totalFee || a.selectedIds.join('\0').localeCompare(b.selectedIds.join('\0'))
  );
  return rows;
}

// Produces an adaptive playbook. Every scenario preserves taste evidence and
// changes one explicit booking assumption; no probability is assigned.
export function buildContingencyPlan(items, constraints) {
  const sourceItems = cloneItems(Array.isArray(items) ? items : []);
  const baseline = optimizeSlate(sourceItems, constraints);
  const baselineIds = baseline.selectedIds || [];
  const response = {
    version: '1.0',
    basis: 'Deterministic counterfactuals using the same saved evidence. These are operational rehearsals, not event probabilities.',
    baseline: summarize(baseline, baselineIds),
    cancellations: [], individualQuoteShocks: [], budgetCuts: [], combinedShocks: [],
    resilience: null, robustSlate: null, robustnessFrontier: [], candidateStability: [], backupBench: [], criticalDependencies: [], warnings: []
  };
  if (baseline.status === 'invalid') {
    response.warnings.push(...(baseline.reasons || ['Invalid baseline inputs.']));
    return response;
  }
  if (!baseline.feasible) {
    response.warnings.push('A feasible baseline slate is required before contingency substitutions can be compared.');
    return response;
  }

  for (const canceledId of baselineIds) {
    const result = cancellationResult(sourceItems, baseline.constraints, baselineIds, canceledId);
    response.cancellations.push({
      kind: 'artist_cancellation', canceledId,
      ...summarize(result, baselineIds),
      scoreDelta: result.feasible ? money(result.score - baseline.score) : null,
      costDelta: result.feasible ? money(result.totalFee - baseline.totalFee) : null
    });
  }

  for (const shockedId of baselineIds) for (const increasePercent of [10, 20, 30]) {
    const shockedItems = adjustFee(sourceItems, shockedId, increasePercent);
    const shockedFee = shockedItems.find(item => item.id === shockedId)?.terms?.fee;
    const fixedCost = money(baselineIds.reduce((sum, id) => sum + (shockedItems.find(item => item.id === id)?.terms?.fee || 0), 0));
    const result = optimizeSlate(shockedItems, baseline.constraints);
    response.individualQuoteShocks.push({
      kind: 'individual_quote_shock', shockedId, increasePercent, shockedFee,
      currentSlateCost: fixedCost,
      currentSlateFeasible: fixedCost <= baseline.constraints.budget,
      ...summarize(result, baselineIds),
      scoreDelta: result.feasible ? money(result.score - baseline.score) : null,
      costDelta: result.feasible ? money(result.totalFee - baseline.totalFee) : null
    });
  }

  for (const cutPercent of [5, 10, 15, 20]) {
    const budget = money(baseline.constraints.budget * (1 - cutPercent / 100));
    const result = optimizeSlate(sourceItems, { ...baseline.constraints, budget });
    response.budgetCuts.push({ kind: 'budget_cut', cutPercent, budget, ...summarize(result, baselineIds) });
  }

  for (const scenario of [
    { id: 'mild', budgetCutPercent: 5, quoteIncreasePercent: 10 },
    { id: 'hard', budgetCutPercent: 10, quoteIncreasePercent: 15 },
    { id: 'severe', budgetCutPercent: 15, quoteIncreasePercent: 20 }
  ]) {
    const budget = money(baseline.constraints.budget * (1 - scenario.budgetCutPercent / 100));
    const result = optimizeSlate(adjustAllFees(sourceItems, scenario.quoteIncreasePercent), { ...baseline.constraints, budget });
    response.combinedShocks.push({ kind: 'combined_shock', ...scenario, budget, ...summarize(result, baselineIds) });
  }

  const scenarios = [...response.cancellations, ...response.individualQuoteShocks, ...response.budgetCuts, ...response.combinedShocks];
  const feasible = scenarios.filter(row => row.feasible);
  const counts = new Map(sourceItems.map(item => [item.id, 0]));
  for (const row of feasible) for (const id of row.selectedIds) counts.set(id, (counts.get(id) || 0) + 1);
  response.candidateStability = sourceItems.map(item => ({
    id: item.id, name: item.name,
    selectedScenarios: counts.get(item.id) || 0,
    feasibleScenarios: feasible.length,
    selectionRate: feasible.length ? money((counts.get(item.id) || 0) / feasible.length * 100) : 0,
    baseline: baselineIds.includes(item.id),
    bookable: item.terms?.available === true && typeof item.terms?.fee === 'number'
  })).sort((a, b) => b.selectedScenarios - a.selectedScenarios || a.name.localeCompare(b.name));
  response.backupBench = response.candidateStability.filter(row => !row.baseline && row.selectedScenarios > 0);
  response.criticalDependencies = response.cancellations.filter(row => !row.feasible || row.replacementIds.length === 0).map(row => ({
    canceledId: row.canceledId,
    feasibleFallback: row.feasible,
    minimumBudget: row.relaxations?.minimumBudget ?? null,
    reasons: row.reasons
  }));
  const slateResilience = resilientSlates(sourceItems, baseline.constraints, baseline);
  response.robustSlate = slateResilience[0] || null;
  response.robustnessFrontier = slateResilience.slice(0, 5);
  const retained = feasible.reduce((sum, row) => sum + row.retainedIds.length, 0);
  response.resilience = {
    totalScenarios: scenarios.length,
    feasibleScenarios: feasible.length,
    adaptiveCoveragePercent: money(feasible.length / scenarios.length * 100),
    averageBaselineRetention: feasible.length ? money(retained / feasible.length) : 0,
    cancellationCoverage: response.cancellations.filter(row => row.feasible).length,
    cancellationCount: response.cancellations.length,
    criticalDependencyCount: response.criticalDependencies.length,
    feasibleSlateCount: slateResilience.length,
    robustSlateDiffersFromBaseline: response.robustSlate?.differsFromBaseline ?? false
  };
  if (response.backupBench.length === 0) response.warnings.push('No non-baseline artist appears in a feasible contingency slate; expand or quote the candidate pool.');
  if (response.criticalDependencies.length) response.warnings.push('At least one selected artist has no clean substitution under the unchanged brief.');
  return response;
}
