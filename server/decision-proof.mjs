import { createHash } from 'node:crypto';
import { optimizeSlate, enumerateSlates, evaluateSelection } from './optimizer.mjs';
import { benchmarkBrief } from './gm.mjs';

const unique = values => [...new Set(values)];
const key = ids => [...ids].sort().join('\0');
const changed = (a, b) => key(a) !== key(b);
const compareKeys = (a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
const round = n => Math.round(n * 1e6) / 1e6;
const delta = (before, after) => ({ changed: changed(before, after), addedIds: after.filter(id => !before.includes(id)), removedIds: before.filter(id => !after.includes(id)) });
const digest = value => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
const classes = ['rank', 'local', 'trends', 'comparison'];
const tools = { rank: 'rank', local: 'where_popular', trends: 'trends', comparison: 'compare_audiences' };
const usable = receipt => receipt && ['ok', 'partial', 'degraded'].includes(receipt.status);
const concise = result => ({ selectedIds: result.selectedIds, feasible: result.feasible, status: result.status ?? (result.feasible ? 'feasible' : 'infeasible'),
  totalFee: result.totalFee, score: result.score, violations: result.violations ?? result.reasons ?? [], evidenceCoverage: result.confidence ?? null });

export function decisionFingerprint(snapshot) {
  return digest({ items: snapshot.memo.items, constraints: snapshot.memo.constraints, currency: snapshot.memo.currency,
    brief: snapshot.memo.input, illustrativeTerms: snapshot.memo.exampleBookingTerms ?? snapshot.input?.exampleBookingTerms,
    savedSelection: snapshot.memo.slate?.selectedIds, receipts: snapshot.receipts ?? [], benchmark: snapshot.benchmark ?? null,
    legacyRankProvenance: snapshot.festivalResearch?.profiles?.map(profile => ({ id: profile.id, receiptId: profile.audience?.receiptId })) ?? [] });
}

export function evidenceDependencies(snapshot, item) {
  const receipts = snapshot.receipts ?? [], profile = snapshot.festivalResearch?.profiles?.find(row => row.id === item.id);
  const candidates = receipts.filter(receipt => item.receipts?.includes(receipt.id));
  return Object.fromEntries(classes.map(kind => {
    let ids = item.evidenceReceipts?.[kind];
    if (!ids && kind === 'rank' && profile?.audience?.receiptId) ids = [profile.audience.receiptId];
    if (!ids) ids = candidates.filter(receipt => receipt.tool === tools[kind]).map(receipt => receipt.id);
    // Multiple legacy ranks cannot establish which ranking was used. Preserve
    // that uncertainty instead of assigning an invented per-receipt effect.
    return [kind, { receiptIds: unique(ids), mapping: kind === 'rank' && ids.length > 1 ? 'ambiguous' : ids.length ? 'linked' : 'missing' }];
  }));
}

function stripEvidence(items, links, kind, receiptId) {
  return items.map(item => {
    const copy = structuredClone(item);
    for (const field of classes) {
      const dependency = links.get(item.id)[field];
      const remove = kind === 'all' || kind === field || receiptId && dependency.mapping === 'linked' && dependency.receiptIds.includes(receiptId);
      if (!remove) continue;
      copy.evidence = { ...copy.evidence, [field]: false };
      if (field === 'rank') { copy.fit = null; copy.rank = null; }
      if (field === 'local') copy.local = 'no data';
      if (field === 'trends') copy.momentum = 'unknown';
    }
    copy.culturalLinks = (copy.culturalLinks ?? []).filter(edge => kind !== 'all' && kind !== 'comparison' && edge.receiptId !== receiptId);
    return copy;
  });
}

function recovery(items, constraints, slate) {
  return slate.selectedIds.map(canceledId => {
    const survivors = slate.selectedIds.filter(id => id !== canceledId);
    const next = optimizeSlate(items, { ...constraints, lockedIds: unique([...(constraints.lockedIds ?? []).filter(id => id !== canceledId), ...survivors]),
      excludedIds: unique([...(constraints.excludedIds ?? []), canceledId]) });
    return { canceledId, ...concise(next), replacementIds: next.selectedIds.filter(id => !survivors.includes(id)) };
  });
}

function controlComparison(snapshot, constraints) {
  const benchmark = snapshot.benchmark;
  if (!benchmark?.control) return { status: 'unavailable', selectedIds: [], reason: benchmark?.reason ?? 'Run the LLM-only benchmark in Festival GM. No model-generated control has been saved.' };
  const brief = benchmarkBrief(snapshot, constraints);
  if (digest(brief) !== benchmark.briefDigest) return { status: 'stale', selectedIds: [], reason: 'The saved control used different booking assumptions. Run the benchmark again.' };
  if (constraints.minimumAverageFit != null) return { status: 'not_comparable', selectedIds: [], reason: 'A Qloo-derived fit floor cannot be evaluated by a genuinely evidence-free control.' };
  try { return { ...concise(evaluateSelection(snapshot.memo.items, constraints, benchmark.control.selectedIds)), status: benchmark.status,
    reason: benchmark.control.reason ?? benchmark.control.error, scoring: 'Selected without Qloo; evaluated afterward against the shared policy. This is not independent validation.' }; }
  catch { return { status: 'invalid_control', selectedIds: [], reason: benchmark.control.error ?? 'The model returned an invalid selection; it was not repaired.' }; }
}

export function buildDecisionProof(snapshot) {
  if (!snapshot?.memo?.items) throw new Error('A saved decision with a candidate pool is required.');
  const { items } = snapshot.memo, baseline = optimizeSlate(items, snapshot.memo.constraints);
  if (baseline.status === 'invalid') throw new Error(baseline.reasons.join(' '));
  const constraints = baseline.constraints, links = new Map(items.map(item => [item.id, evidenceDependencies(snapshot, item)]));
  const rows = enumerateSlates(items, constraints), feasible = rows.filter(row => row.feasible);
  const operational = constraints.minimumAverageFit != null ? null : [...feasible].sort((a, b) => a.totalFee - b.totalFee || compareKeys(a.selectedIds, b.selectedIds))[0];
  const constraintOnly = operational ? { ...concise(operational), status: 'compared', selectionRule: 'Minimum cost among all operationally feasible slates; lexicographic ID tie-break. No cultural score enters selection.' }
    : { status: constraints.minimumAverageFit != null ? 'not_comparable' : 'infeasible', selectedIds: [], reason: constraints.minimumAverageFit != null ? 'The active fit floor requires Qloo evidence; a constraint-only control cannot use identical constraints without that evidence.' : 'No operationally feasible slate exists.' };
  const ablations = [];
  const runAblation = (id, kind, receiptId = null) => {
    const stripped = stripEvidence(items, links, kind, receiptId), result = optimizeSlate(stripped, constraints);
    const affectedIds = items.filter((item, i) => JSON.stringify(item.evidence) !== JSON.stringify(stripped[i].evidence) || JSON.stringify(item.culturalLinks ?? []) !== JSON.stringify(stripped[i].culturalLinks)).map(item => item.id);
    ablations.push({ id, kind: receiptId ? 'receipt' : 'class', evidenceClass: kind, receiptIds: receiptId ? [receiptId] : [], affectedIds,
      ...concise(result), ...delta(baseline.selectedIds, result.selectedIds),
      interpretation: 'Evidence is removed for every dependent candidate, with missing-evidence penalties recomputed. No reranking or substitute data is invented. Utility across ablations has different evidence and is not a causal uplift.' });
  };
  for (const kind of [...classes, 'all']) runAblation('class:' + kind, kind);
  const allIds = unique(items.flatMap(item => [...classes.flatMap(kind => links.get(item.id)[kind].mapping === 'linked' ? links.get(item.id)[kind].receiptIds : []), ...(item.culturalLinks ?? []).map(edge => edge.receiptId)]).filter(Boolean));
  const receiptIds = allIds.filter(id => snapshot.receipts?.some(r => r.id === id));
  for (const id of receiptIds.slice(0, 64)) runAblation('receipt:' + id, null, id);

  // Preference experiments reweight the declared objective components only.
  // Every feasible combination is checked; no probabilities are attached.
  const profiles = [
    { name: 'Declared policy', factors: {} },
    { name: 'Half audience weight', factors: { fit: .5 } },
    { name: 'Double audience weight', factors: { fit: 2 } },
    { name: 'Double cultural connection', factors: { culturalCohesion: 2, culturalBreadth: 2 } },
    { name: 'Double evidence caution', factors: { riskPenalty: 2, pairEvidencePenalty: 2 } },
    { name: 'Double recovery preference', factors: { cancellationReadiness: 2 } },
  ];
  const sensitivity = profiles.map(profile => {
    const ranked = feasible.map(row => ({ ...row, weightedScore: Object.entries(row.rawBreakdown).reduce((sum, [k, value]) => sum + value * (profile.factors[k] ?? 1), 0) }))
      .sort((a, b) => (Math.abs(b.weightedScore-a.weightedScore)>1e-9 ? b.weightedScore-a.weightedScore : 0) || a.totalFee - b.totalFee || compareKeys(a.selectedIds,b.selectedIds));
    const best = ranked[0];
    return { ...profile, selectedIds: best?.selectedIds ?? [], score: best ? round(best.weightedScore) : null, ...delta(baseline.selectedIds, best?.selectedIds ?? []) };
  });
  const budgets = unique(rows.filter(row => row.totalFee > constraints.budget && row.violationCodes.every(code => code === 'budget')).map(row => row.totalFee)).sort((a, b) => a - b);
  let budgetSwitch = null, testedBudgets = 0;
  for (const budget of budgets) {
    testedBudgets++;
    const result = optimizeSlate(items, { ...constraints, budget });
    if (result.feasible && changed(baseline.selectedIds, result.selectedIds)) {
      budgetSwitch = { budget, increase: round(budget - constraints.budget), ...concise(result), ...delta(baseline.selectedIds, result.selectedIds) }; break;
    }
  }
  const cancellations = baseline.feasible ? recovery(items, constraints, baseline) : [];
  // Reuse the exact feasible subset universe for recovery coverage. For a
  // feasible starting slate, every original lock is already a survivor or the
  // canceled artist; checking each one-act replacement preserves all survivors.
  const recoveryUniverse = new Set((constraints.festivalPolicy ? [] : enumerateSlates(items, { ...constraints, lockedIds: [] })).filter(row => row.feasible).map(row => key(row.selectedIds)));
  const robustAlternatives = feasible.map(row => {
    const scenarios = row.festival?.recovery ?? row.selectedIds.map(canceledId => ({ replacementIds: items.filter(item => !row.selectedIds.includes(item.id) &&
      recoveryUniverse.has(key([...row.selectedIds.filter(id => id !== canceledId), item.id]))).map(item => item.id) }));
    return { selectedIds: row.selectedIds, totalFee: row.totalFee, score: row.score,
      recovered: scenarios.filter(scenario => scenario.replacementIds.length).length, tested: row.selectedIds.length,
      utilitySacrifice: round((baseline.score ?? 0) - row.score) };
  }).sort((a, b) => b.recovered - a.recovered || b.score - a.score || a.totalFee - b.totalFee || compareKeys(a.selectedIds,b.selectedIds));
  const graph = items.map(item => ({ id: item.id, name: item.name, selected: baseline.selectedIds.includes(item.id),
    identity: { entityId: item.id, receiptId: item.identityReceipt ?? null, status: item.identityReceipt && snapshot.receipts?.some(r => r.id === item.identityReceipt) ? 'saved_resolution' : 'unlinked' },
    terms: { ...item.terms, provenance: snapshot.memo.exampleBookingTerms || snapshot.input?.exampleBookingTerms ? 'illustrative_assumptions' : 'organizer_supplied_not_independently_verified' },
    evidence: Object.fromEntries(classes.map(kind => [kind, { supported: item.evidence?.[kind] === true, ...links.get(item.id)[kind] }])),
    rank: item.rank ?? null, poolSize: item.of ?? null,
    culturalLinks: (item.culturalLinks ?? []).map(edge => ({ otherId: edge.otherId, available: edge.available === true,
      sharedTastes: edge.sharedTastes ?? [], receiptId: edge.receiptId ?? null })),
    consequentialAblations: ablations.filter(row => row.changed && row.affectedIds.includes(item.id)).map(row => row.id),
    receipts: unique([...(item.receipts ?? []), ...(item.culturalLinks ?? []).map(edge => edge.receiptId)]).map(id => snapshot.receipts?.find(r => r.id === id)).filter(Boolean)
      .map(r => ({ id: r.id, tool: r.tool, args: r.args, status: r.status, source: r.source, fetchedAt: r.fetchedAt, digest: r.digest })) }));
  const findings = [];
  const finding = (id, severity, assumption, affectedIds, sourceEvidence, counterfactual, correction) => findings.push({ id, severity, assumption, affectedIds, sourceEvidence, counterfactual, correction });
  if (changed(snapshot.memo.slate?.selectedIds ?? [], baseline.selectedIds)) finding('saved-slate-mismatch', 'blocker', 'The saved selection must match the current deterministic decision.', baseline.selectedIds, [], concise(baseline), 'Re-optimize and save a new scenario before approval.');
  if (!baseline.feasible) finding('no-feasible-slate', 'blocker', 'All hard booking constraints must hold simultaneously.', [], [], baseline.diagnostics, 'Resolve the listed constraint conflicts before approving. No constraints were silently relaxed.');
  if (baseline.confidence.missingFitIds.length) finding('missing-rank', 'blocker', 'Every selected act needs supported audience rank.', baseline.confidence.missingFitIds, [], null, 'Research a complete fixed-pool audience ranking or defer the decision.');
  const unlinked = graph.filter(card => card.selected && (card.evidence.rank.mapping !== 'linked' || !card.evidence.rank.receiptIds.every(id => usable(snapshot.receipts?.find(r => r.id === id)))));
  if (unlinked.length) finding('rank-provenance', 'blocker', 'Supported ranks need an unambiguous usable receipt.', unlinked.map(card => card.id), [], null, 'Refresh audience evidence; legacy or missing provenance cannot support approval.');
  const incomplete = graph.filter(card => card.selected && card.evidence.rank.receiptIds.some(id => {
    const receipt=snapshot.receipts?.find(row=>row.id===id),options=receipt?.args?.options,rows=receipt?.evidence?.rows;
    if(!Array.isArray(options)||!Array.isArray(rows))return false;
    const returned=new Set(rows.flatMap(row=>[row.id,row.name].filter(Boolean).map(value=>String(value).toLowerCase())));
    return options.some(option=>!returned.has(String(option).toLowerCase()));
  }));
  if(incomplete.length)finding('rank-completeness','blocker','A partial ranking cannot establish full-pool audience fit.',incomplete.map(card=>card.id),[],null,'Refresh the identical candidate pool or explicitly declare and re-rank a revised pool before approval.');
  for (const row of ablations.filter(row => row.kind === 'receipt' && row.changed)) finding(row.id, 'review', 'Withdrawing this observation changes the decision.', row.affectedIds, row.receiptIds, row, 'Inspect the query scope and receipt. Acknowledge this evidence dependency or defer for further research.');
  for (const row of cancellations.filter(row => !row.feasible)) finding('cancel:' + row.canceledId, 'review', 'A selected artist can become unavailable.', [row.canceledId], [], row, 'Source another eligible backup or acknowledge that no survivor-preserving replacement exists.');
  if (sensitivity.some(row => row.changed)) finding('preference-sensitive', 'review', 'Organizer weights express preferences, not measured probabilities.', baseline.selectedIds, [], sensitivity.filter(row => row.changed), 'Confirm the declared trade-off preferences before approval.');
  const missingPairs = baseline.festival?.pairs.filter(pair => !pair.supported) ?? [];
  if (missingPairs.length) finding('unmeasured-pairs', 'review', 'Lineup compatibility needs interpretable pair evidence.', unique(missingPairs.flatMap(p=>[p.a,p.b])), missingPairs.map(p=>p.receiptId).filter(Boolean), null, 'Research missing comparisons; do not describe these pairs as demonstrated audience overlap.');
  const status = findings.some(row => row.severity === 'blocker') ? 'blocked' : 'review_required';
  const proof = { version: '1.0', sourceId: snapshot.id, inputDigest: decisionFingerprint(snapshot), generatedAt: new Date().toISOString(), status,
    baseline: concise(baseline), constraintOnly, llmOnly: controlComparison(snapshot, constraints),
    assumptions: { currency: snapshot.memo.currency, constraints, candidateCount: items.length, sharedPool: true, newProviderCalls: 0 },
    ablations, sensitivity, budgetSwitch: { next: budgetSwitch, testedBudgets, exhaustiveWithinPool: true },
    cancellations, robustAlternatives, frontier: baseline.frontier, diagnostics: baseline.diagnostics,
    rejectedCandidates: baseline.candidateAssessments.filter(item => !baseline.selectedIds.includes(item.id)).map(item => ({ ...item,
      reason: item.exclusionReasons.length ? item.exclusionReasons.join(' ') : 'Not in the optimum under the declared policy and constraints; not a claim of artistic inferiority.' })),
    graph, findings, ablationCoverage: { testedReceipts: Math.min(64, receiptIds.length), eligibleReceipts: receiptIds.length, omitted: Math.max(0, receiptIds.length - 64) },
    transitions: [{ from: 'saved_evidence', to: 'optimized', detail: `${rows.length} exact-size combinations; ${feasible.length} feasible.` },
      { from: 'optimized', to: 'challenged', detail: `${ablations.length} ablations, ${sensitivity.length} weight profiles, ${cancellations.length} cancellations.` },
      { from: 'challenged', to: status, detail: `${findings.filter(f=>f.severity==='blocker').length} blockers; ${findings.filter(f=>f.severity==='review').length} review findings.` }],
    limitations: ['Ablations measure dependence on saved observations under a declared policy, not causal Qloo value, demand or profit.',
      'All methods share a candidate pool that may itself have been discovered with Qloo; this does not measure candidate-discovery value.',
      'Constraint-only minimizes cost without cultural scoring. Displayed utility is a post-hoc diagnostic, not independent validation.',
      'Weight profiles are discrete preference experiments, not a complete continuous sensitivity analysis.',
      'Cancellation resilience covers single-artist failures with fixed buyer terms and survivors locked; it is not a probability.',
      'External promoter judgments must come from the separate blind-review system; no reviews are generated here.',
      'The challenge engine is deterministic and evidence-grounded; it does not claim to be an unconstrained LLM critic.'] };
  proof.proofDigest = digest({ ...proof, generatedAt: undefined });
  return proof;
}
