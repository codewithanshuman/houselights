import { evaluateSelection } from '../optimizer.mjs';
import { evidenceDependencies } from '../decision-proof.mjs';
import { benchmarkBrief } from '../gm.mjs';
import { constraintOnly, savedLLMOnly } from './baseline-adapters.mjs';
import { auditEvidence } from './evidence-audit.mjs';
import { digest, GROUPS, VERSION } from './experiment-schema.mjs';
import { exactSignalContributions, runCoalitions } from './signal-coalitions.mjs';
import { reviewStatistics } from './statistical-analysis.mjs';
import { selectionWeightSensitivity } from './contribution-analysis.mjs';

const idsEqual = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const overlap = (a, b) => {
  const union = new Set([...a, ...b]);
  return union.size ? a.filter(id => b.includes(id)).length / union.size : null;
};
const method = row => ({ status: row.status, available: row.available ?? true,
  attempted: !['unavailable', 'stale', 'not_comparable'].includes(row.status),
  feasible: row.feasible ?? false, selectedIds: row.selectedIds ?? [], totalFee: row.totalFee ?? null,
  violations: row.violations ?? [], violationCodes: row.violationCodes ?? [],
  reason: row.reason ?? null, selectionRule: row.selectionRule ?? null,
  generation: row.generation ?? null });

function comparisonMetrics(methods, constraints, receiptAudit) {
  const full = methods.full_houselights;
  return Object.fromEntries(Object.entries(methods).map(([name, row]) => [name, {
    attempted: row.attempted, returned: row.available && row.selectedIds.length > 0,
    feasible: row.feasible, hardConstraintViolations: row.violationCodes.length,
    violationCodes: row.violationCodes,
    bookingCost: row.totalFee,
    budgetUtilization: row.totalFee == null ? null : row.totalFee / constraints.budget,
    lineupJaccardVsFull: row.available ? overlap(row.selectedIds, full.selectedIds) : null,
    sameSelectionAsFull: row.available ? idsEqual(row.selectedIds, full.selectedIds) : null,
    evidenceCompleteness: name === 'full_houselights' ? {
      supported: receiptAudit.counts.supported, observations: receiptAudit.counts.observations,
      flagged: receiptAudit.counts.flagged } : null,
  }]));
}

function differences(full, coalition, items, snapshot, constraints) {
  const removedIds = full.selectedIds.filter(id => !coalition.selectedIds.includes(id));
  const addedIds = coalition.selectedIds.filter(id => !full.selectedIds.includes(id));
  const touched = [...new Set([...removedIds, ...addedIds])];
  const sameSet = idsEqual(full.selectedIds, coalition.selectedIds);
  const linked = touched.flatMap(id => {
    const item = items.find(row => row.id === id);
    if (!item) return [];
    const dependencies = evidenceDependencies(snapshot, item);
    return GROUPS.flatMap(group => dependencies[group].receiptIds.map(receiptId => ({ candidateId: id, group, receiptId,
      fetchedAt: snapshot.receipts?.find(receipt => receipt.id === receiptId)?.fetchedAt ?? null })));
  });
  const perCandidate = touched.map(id => {
    const item = items.find(row => row.id === id);
    return { id, name: item?.name ?? id, quotedFee: item?.terms?.fee ?? null,
      fullEvidenceFit: item?.evidence?.rank ? item.fit : null,
      effectiveFit: coalition.disabled?.includes('rank') ? null : item?.evidence?.rank ? item.fit : null,
      evidence: item?.evidence ?? {} };
  });
  return { changed: !sameSet, orderChanged: sameSet && JSON.stringify(full.selectedIds) !== JSON.stringify(coalition.selectedIds),
    removedIds, addedIds,
    fullFeasible: full.feasible, counterfactualFeasible: coalition.feasible,
    fullConfidence: full.confidence?.level ?? null, counterfactualConfidence: coalition.confidence?.level ?? null,
    fullPolicyScore: full.score ?? null, counterfactualPolicyScore: coalition.score ?? null,
    scoreComparisonCaveat: 'Scores use different evidence availability. Their difference is a policy diagnostic, not causal uplift.',
    bookingCostDifference: full.totalFee == null || coalition.totalFee == null ? null : full.totalFee - coalition.totalFee,
    currency: snapshot.memo.currency, sharedFinancialAssumptions: { budget: constraints.budget,
      feeSource: snapshot.memo.exampleBookingTerms ? 'illustrative booking terms' : 'saved organizer terms',
      financialScenario: 'not linked; the fee difference is not a profit or revenue difference' },
    affectedCandidates: perCandidate, relevantReceipts: linked,
    interpretation: removedIds.length + addedIds.length ? 'Observed optimizer selection change under withdrawn evidence. Linked receipts identify evidence to inspect, not proven causal market uplift.'
      : 'No selection change under this evidence configuration.' };
}

export function runExperiment(locked, { humanReport = null } = {}) {
  const { config, frozen, inputDigest } = locked;
  if (config.version !== VERSION || digest({ config, frozen }) !== inputDigest) throw new Error('Locked experiment input digest mismatch.');
  const items = frozen.memo.items, constraints = config.constraints;
  const ablations = runCoalitions(frozen, constraints);
  const noEvidence = ablations.coalitions[0], full = ablations.coalitions[15];
  // Every coalition is evaluated after selection on the same frozen reference
  // policy. This is a diagnostic of selection, never a held-out quality label.
  for (const row of ablations.coalitions) {
    try { row.diagnosticScore = row.feasible ? evaluateSelection(items, constraints, row.selectedIds).score : null; }
    catch { row.diagnosticScore = null; }
    row.difference = differences(full, row, items, frozen, constraints);
  }
  for (const row of ablations.receipts) row.difference = differences(full, row, items, frozen, constraints);
  const contributions = exactSignalContributions(ablations.coalitions);
  const fitFloor = constraints.minimumAverageFit != null;
  const methods = {
    llm_only: method(savedLLMOnly(frozen, constraints)),
    constraint_only: method(constraintOnly(items, constraints)),
    qloo_ablated: fitFloor ? method({ status: 'not_comparable', available: false,
      reason: 'All Qloo evidence was withdrawn, but the original fit floor still requires it.' })
      : method({ ...noEvidence, available: true, selectionRule: 'Exact optimizer with all four cultural evidence groups withdrawn.' }),
    full_houselights: method({ ...full, available: true, selectionRule: 'Exact optimizer with all saved cultural evidence enabled.' }),
  };
  const evidence = auditEvidence(frozen, config.evidenceAsOf);
  const metrics = comparisonMetrics(methods, constraints, evidence);
  const fullBrief = benchmarkBrief(frozen, constraints);
  const report = { version: VERSION, config, inputDigest, sourceDigest: locked.sourceDigest,
    poolDigest: digest([...config.candidateIds].sort()),
    briefDigest: digest({ sharedLLMBrief: fullBrief, eventDate: frozen.memo.input?.eventDate ?? null,
      genre: frozen.memo.input?.genre ?? null, capacity: frozen.memo.input?.capacity ?? null }),
    brief: { city: fullBrief.city, currency: fullBrief.currency,
      budget: constraints.budget, slots: constraints.slots, candidateCount: items.length,
      genre: frozen.memo.input?.genre ?? null, eventDate: frozen.memo.input?.eventDate ?? null,
      eventSize: frozen.memo.input?.capacity ?? null,
      synthetic: frozen.mock === true, illustrativeTerms: frozen.memo.exampleBookingTerms === true },
    methods, metrics, ablations, contributions, evidence,
    independentEvaluation: { operational: metrics, human: reviewStatistics(humanReport),
      independentOutcomes: { status: 'unavailable', count: 0,
        reason: 'No linked held-out post-event audience preference or ticket outcome is available for this comparison.' } },
    decisionDifference: { ...differences(full, noEvidence, items, frozen, constraints),
      weightSensitivity: selectionWeightSensitivity(frozen, constraints) },
    consistency: { coalitionCount: 16,
      changedCoalitions: ablations.coalitions.filter(row => row.difference.changed).length,
      unchangedCoalitions: ablations.coalitions.filter(row => !row.difference.changed).length,
      orderOnlyChanges: ablations.coalitions.filter(row => row.difference.orderChanged).length,
      changedReceipts: ablations.receipts.filter(row => row.difference.changed).length,
      testedReceipts: ablations.receipts.length },
    integrity: { frozenCandidateIds: config.candidateIds, candidatePoolShared: true,
      llmInputDigest: digest(fullBrief), noNewProviderCalls: true,
      seed: config.seed, modelVersion: VERSION, receiptDigests: evidence.receiptIndex.map(row => ({ id: row.id, digest: row.digest })) },
    limitations: [
      'The fixed candidate pool may itself include Qloo-discovered artists; this experiment does not test independent discovery.',
      'Cultural policy scores and Shapley contributions are in-sample decision diagnostics, not independent booking quality or causal impact.',
      'Illustrative fees and missing external judgments cannot establish commercial superiority.',
      'The four methods share the declared operational policy; changed fit-floor policy is recorded explicitly.',
      'Provider costs and end-to-end research latency are unavailable unless captured by the source benchmark receipts.',
    ] };
  report.reportDigest = digest(report);
  return report;
}
