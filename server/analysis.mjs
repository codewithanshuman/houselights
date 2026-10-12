import { optimizeSlate } from './optimizer.mjs';

const BUDGET_STEPS = [80, 90, 100, 110, 120];
const FEE_INCREASES = [0, 10, 20, 30];
const toCents = value => Math.round((value + Number.EPSILON) * 100);
const round = value => Math.round((value + Number.EPSILON) * 1e6) / 1e6;

function summarize(result) {
  return {
    status: result.status,
    feasible: result.feasible,
    selectedIds: [...result.selectedIds],
    totalFee: result.totalFee,
    score: result.score,
    remainingBudget: result.remainingBudget,
    missingFitIds: [...result.confidence.missingFitIds],
  };
}

function differences(baseline, result) {
  if (!baseline.feasible) return { changedIds: [], retainedCount: 0 };
  const before = new Set(baseline.selectedIds);
  const after = new Set(result.selectedIds);
  return {
    changedIds: [...before].filter(id => !after.has(id)).concat([...after].filter(id => !before.has(id))),
    retainedCount: [...before].filter(id => after.has(id)).length,
  };
}

/** Deterministic planning scenarios, not a forecast or a probability model.
 * Every scenario reruns the exact optimizer, keeping every non-price rule.
 * Fees are first normalized to cents as in the optimizer, then each projected
 * quote is rounded to cents. Unknown fees are never replaced or estimated.
 */
export function analyzeSlate(items, rawConstraints = {}) {
  const result = optimizeSlate(items, rawConstraints);
  const output = {
    basis: 'Planning assumptions, not demand forecasts: exact re-optimization under hypothetical budgets and uniform increases to known buyer-entered fees. Policy scores are not attendance, revenue or probabilities.',
    baseline: summarize(result),
    budgetScenarios: [],
    feeScenarios: [],
    headroom: null,
    warnings: [],
  };
  if (result.status === 'invalid') {
    output.warnings = [...result.reasons];
    return output;
  }

  const constraints = result.constraints;
  const budgetCents = toCents(constraints.budget);
  const assessedFees = new Map(result.candidateAssessments.map(item => [item.id, item.fee]));
  const missingFeeIds = result.candidateAssessments.filter(item => item.fee == null).map(item => item.id);
  if (missingFeeIds.length) output.warnings.push(`Unknown or invalid fees remain unknown and cannot enter a bookable slate: ${missingFeeIds.join(', ')}.`);
  if (!result.feasible) output.warnings.push('There is no feasible baseline slate. Budget scenarios may establish feasibility; current-slate fee comparisons and headroom are unavailable.');
  if (result.status === 'provisional') output.warnings.push('The baseline is provisional: missing supported rank evidence remains insufficient for a supported taste recommendation. Fee and budget changes do not supply that evidence.');

  // Several percentages can round to the same small monetary budget. Retain
  // one scenario per cent value and prefer the unchanged 0% label when tied.
  const budgetLadder = new Map();
  for (const percent of BUDGET_STEPS) {
    const cents = Math.round(budgetCents * percent / 100);
    if (!budgetLadder.has(cents) || percent === 100) budgetLadder.set(cents, percent - 100);
  }
  for (const [cents, deltaPercent] of budgetLadder) {
    const budget = cents / 100;
    const scenario = optimizeSlate(items, { ...constraints, budget });
    output.budgetScenarios.push({ budget, deltaPercent, ...summarize(scenario), ...differences(result, scenario) });
  }

  for (const increasePercent of FEE_INCREASES) {
    const projected = items.map(item => {
      const fee = assessedFees.get(item.id);
      if (fee == null) return item;
      const projectedCents = Math.round(toCents(fee) * (100 + increasePercent) / 100);
      return { ...item, terms: { ...item.terms, fee: projectedCents / 100 } };
    });
    const best = optimizeSlate(projected, constraints);
    // Locking the complete original slate tests its continued feasibility;
    // merely finding ANY feasible alternative would give a misleading answer.
    const current = result.feasible ? optimizeSlate(projected, {
      ...constraints,
      lockedIds: [...new Set([...constraints.lockedIds, ...result.selectedIds])],
    }) : null;
    const projectedFees = new Map(projected.map(item => [item.id, item.terms?.fee]));
    const currentSlateCost = result.feasible
      ? result.selectedIds.reduce((sum, id) => sum + toCents(projectedFees.get(id)), 0) / 100
      : null;
    output.feeScenarios.push({
      increasePercent,
      currentSlateCost,
      currentSlateFeasible: current?.feasible ?? null,
      bestSelectedIds: [...best.selectedIds],
      bestTotalFee: best.totalFee,
      bestScore: best.score,
      feasible: best.feasible,
      status: best.status,
      missingFitIds: [...best.confidence.missingFitIds],
      ...differences(result, best),
    });
  }

  if (result.feasible) {
    const amount = (budgetCents - toCents(result.totalFee)) / 100;
    output.headroom = {
      budgetAmount: amount,
      // The percentage denominator is the declared budget, not the fees.
      budgetPercent: budgetCents === 0 ? null : round(amount / constraints.budget * 100),
    };
  }
  if (output.budgetScenarios.some(item => item.status === 'provisional') || output.feeScenarios.some(item => item.status === 'provisional')) {
    output.warnings.push('Some scenario slates lack supported rank evidence and remain provisional. A feasible price does not establish taste fit.');
  }
  if (output.budgetScenarios.some(item => item.status === 'invalid')) {
    output.warnings.push('A projected budget exceeds the supported monetary range; that scenario cannot be evaluated.');
  }
  output.warnings.push('Budget and quote scenarios change one assumption at a time. Availability, locks, exclusions, discovery requirements, genre limits and evidence are held fixed. This does not model correlated market changes.');
  return output;
}
