// A small slate is exhaustively searchable. Keep economics, evidence and policy
// preferences separate so that every chosen trade-off can be inspected.
const MAX_CANDIDATES = 10;
const EPSILON = 1e-9;
const WEIGHTS = Object.freeze({
  fit: 100,
  risingMomentum: 3,
  coolingMomentum: -2,
  localSupport: 2,
  genreBreadth: 2,
  discovery: 1,
  concentration: 4,
  missingEvidence: 10,
});

const round = value => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const money = cents => cents / 100;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const isMoney = value => finite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER / 100;
const toCents = value => Math.round((value + Number.EPSILON) * 100);
const unique = values => [...new Set(values)];
const emptyBreakdown = () => ({ fit: 0, momentum: 0, local: 0, genreBreadth: 0, discovery: 0, concentrationPenalty: 0, riskPenalty: 0, total: 0 });

function policy() {
  return {
    description: 'Exact subset search using explicit policy points; scores are neither probabilities nor revenue or attendance forecasts.',
    fitScale: '0–1 relative affinity index, counted only when rank evidence is present; not calibrated demand.',
    discoveryRule: 'A discovered act has found:true: it was surfaced outside the original buyer shortlist. This is not a popularity or net-new-audience claim.',
    missingFeeRule: 'An act with no valid buyer-entered fee cannot enter a bookable slate. Money is rounded to cents.',
    missingFitRule: 'Unsupported or absent fit contributes zero affinity points and increases the evidence penalty. Any selected act without fit evidence makes the result provisional.',
    genreRule: 'Genres are buyer-entered planning categories. Unknown genres earn no breadth reward and cannot establish a genre concentration.',
    riskRule: 'Risk tolerance only scales the penalty for incomplete evidence; it does not estimate commercial risk.',
    evidenceRiskWeights: { rank: 0.6, local: 0.15, trends: 0.15, comparison: 0.1 },
    aggregation: 'Fit, momentum, local support and discovery are averages across slots. Genre breadth and repeated-genre pairs are normalized across the slate.',
    tieBreak: 'Higher unrounded score, then lower total fee, then lexicographic candidate IDs.',
    weights: { ...WEIGHTS },
  };
}

function normalizeConstraints(raw, count) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const constraints = {
    budget: raw.budget,
    slots: raw.slots ?? Math.min(3, count),
    discoveryMin: raw.discoveryMin ?? 0,
    maxPerGenre: raw.maxPerGenre ?? raw.slots ?? Math.min(3, count),
    riskTolerance: raw.riskTolerance ?? 50,
    lockedIds: raw.lockedIds ?? [],
    excludedIds: raw.excludedIds ?? [],
    ...(raw.festivalPolicy === true ? { festivalPolicy: true } : {}),
    ...(raw.minimumAverageFit != null ? { minimumAverageFit: raw.minimumAverageFit } : {}),
  };
  if (!isMoney(constraints.budget)) errors.push('Budget must be a finite, non-negative monetary amount.');
  if (!Number.isInteger(constraints.slots) || constraints.slots < 1 || constraints.slots > MAX_CANDIDATES) errors.push('Slots must be an integer between 1 and 10.');
  if (!Number.isInteger(constraints.discoveryMin) || constraints.discoveryMin < 0 || constraints.discoveryMin > MAX_CANDIDATES) errors.push('Discovery minimum must be an integer between 0 and 10.');
  if (!Number.isInteger(constraints.maxPerGenre) || constraints.maxPerGenre < 1 || constraints.maxPerGenre > MAX_CANDIDATES) errors.push('Maximum per genre must be an integer between 1 and 10.');
  if (!finite(constraints.riskTolerance) || constraints.riskTolerance < 0 || constraints.riskTolerance > 100) errors.push('Risk tolerance must be a number between 0 and 100.');
  if (constraints.minimumAverageFit != null && (!finite(constraints.minimumAverageFit) || constraints.minimumAverageFit < 0 || constraints.minimumAverageFit > 1)) errors.push('Minimum average fit must be between 0 and 1.');
  for (const field of ['lockedIds', 'excludedIds']) {
    if (!Array.isArray(constraints[field]) || constraints[field].some(id => typeof id !== 'string' || !id.trim())) {
      errors.push(`${field} must be an array of non-empty candidate IDs.`);
      constraints[field] = [];
    } else constraints[field] = unique(constraints[field]);
  }
  if (isMoney(constraints.budget)) constraints.budget = money(toCents(constraints.budget));
  return { constraints, errors };
}

function normalizeCandidate(candidate, excludedIds) {
  const supportedFit = candidate.evidence?.rank === true && finite(candidate.fit) && candidate.fit >= 0 && candidate.fit <= 1;
  const feeCents = isMoney(candidate.terms?.fee) ? toCents(candidate.terms.fee) : null;
  const rawGenre = typeof candidate.terms?.genre === 'string' ? candidate.terms.genre.trim() : '';
  const genre = rawGenre && !['unknown', 'no data', 'n/a', 'unspecified'].includes(rawGenre.toLowerCase()) ? rawGenre.toLowerCase() : null;
  const available = candidate.terms?.available === true;
  const exclusionReasons = [];
  if (feeCents == null) exclusionReasons.push('No valid buyer-entered fee.');
  if (!available) exclusionReasons.push('Availability is not confirmed.');
  if (excludedIds.includes(candidate.id)) exclusionReasons.push('Excluded by the buyer.');
  return {
    id: candidate.id,
    name: typeof candidate.name === 'string' ? candidate.name : candidate.id,
    fit: supportedFit ? candidate.fit : null,
    feeCents,
    genre,
    available,
    discovery: candidate.found === true,
    momentum: candidate.evidence?.trends === true ? candidate.momentum : 'unknown',
    local: candidate.evidence?.local === true && candidate.local === 'yes',
    evidence: {
      rank: supportedFit,
      local: candidate.evidence?.local === true,
      trends: candidate.evidence?.trends === true,
      comparison: candidate.evidence?.comparison === true,
    },
    receipts: Array.isArray(candidate.receipts) ? unique(candidate.receipts.filter(id => typeof id === 'string' && id.trim())) : [],
    culturalLinks: Array.isArray(candidate.culturalLinks) ? candidate.culturalLinks : [],
    exclusionReasons,
  };
}

function evaluate(selected, constraints, pool = []) {
  const ids = selected.map(item => item.id);
  const idSet = new Set(ids);
  const count = selected.length;
  const divisor = Math.max(1, count);
  const violations = [];
  const addViolation = (code, message) => violations.push({ code, message });
  if (count !== constraints.slots) addViolation('slots', `Needs exactly ${constraints.slots} acts; this slate has ${count}.`);
  for (const id of constraints.lockedIds) if (!idSet.has(id)) addViolation('locks', `Locked act ${id} is missing.`);
  for (const item of selected) {
    if (constraints.excludedIds.includes(item.id)) addViolation('exclusions', `${item.name} is excluded.`);
    if (!item.available) addViolation('availability', `${item.name} has no confirmed availability.`);
    if (item.feeCents == null) addViolation('fees', `${item.name} has no valid buyer-entered fee.`);
  }
  const knownFeeCents = selected.reduce((sum, item) => sum + (item.feeCents ?? 0), 0);
  const feeCents = selected.every(item => item.feeCents != null) ? knownFeeCents : null;
  const budgetCents = toCents(constraints.budget);
  if (knownFeeCents > budgetCents) addViolation('budget', `Known fees exceed the budget by ${money(knownFeeCents - budgetCents).toFixed(2)}.`);
  const discoveredCount = selected.filter(item => item.discovery).length;
  if (discoveredCount < constraints.discoveryMin) addViolation('discovery', `Needs ${constraints.discoveryMin} discovered acts; this slate has ${discoveredCount}.`);
  const genres = new Map();
  for (const item of selected) if (item.genre) genres.set(item.genre, (genres.get(item.genre) ?? 0) + 1);
  for (const [genre, genreCount] of genres) if (genreCount > constraints.maxPerGenre) addViolation('genre', `${genre} has ${genreCount} acts, above the cap of ${constraints.maxPerGenre}.`);
  const repeatedPairs = [...genres.values()].reduce((sum, n) => sum + n * (n - 1) / 2, 0);
  const allPairs = count * (count - 1) / 2;
  const uncertainty = selected.reduce((sum, item) => sum +
    (item.evidence.rank ? 0 : 0.6) + (item.evidence.local ? 0 : 0.15) +
    (item.evidence.trends ? 0 : 0.15) + (item.evidence.comparison ? 0 : 0.1), 0) / divisor;
  const breakdown = {
    fit: selected.reduce((sum, item) => sum + (item.fit ?? 0) * WEIGHTS.fit, 0) / divisor,
    momentum: selected.reduce((sum, item) => sum + (item.momentum === 'rising' ? WEIGHTS.risingMomentum : item.momentum === 'cooling' ? WEIGHTS.coolingMomentum : 0), 0) / divisor,
    local: selected.filter(item => item.local).length * WEIGHTS.localSupport / divisor,
    genreBreadth: WEIGHTS.genreBreadth * Math.max(0, genres.size - 1) / Math.max(1, count - 1),
    discovery: discoveredCount * WEIGHTS.discovery / divisor,
    concentrationPenalty: allPairs ? -WEIGHTS.concentration * repeatedPairs / allPairs : 0,
    riskPenalty: -WEIGHTS.missingEvidence * (1 - constraints.riskTolerance / 100) * uncertainty,
  };
  let festival = null;
  if (constraints.festivalPolicy) {
    const pairs = [], themes = new Set();
    for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) {
      const edge = selected[i].culturalLinks.find(link => link.otherId === selected[j].id);
      const supported = edge?.available === true && typeof edge.receiptId === 'string' && Array.isArray(edge.sharedTastes);
      const shared = supported ? unique(edge.sharedTastes.filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim().toLowerCase())) : [];
      shared.forEach(theme => themes.add(theme));
      pairs.push({ a: selected[i].id, b: selected[j].id, supported, sharedTastes: shared, receiptId: edge?.receiptId ?? null });
    }
    const supported = pairs.filter(pair => pair.supported).length;
    const bridged = pairs.filter(pair => pair.supported && pair.sharedTastes.length).length;
    const recovery = pool.length ? selected.map(canceled => {
      const survivors = selected.filter(item => item.id !== canceled.id);
      const recoveryConstraints = { ...constraints, festivalPolicy: false,
        lockedIds: unique([...constraints.lockedIds.filter(id => id !== canceled.id), ...survivors.map(item => item.id)]),
        excludedIds: unique([...constraints.excludedIds, canceled.id]) };
      const replacements = pool.filter(item => !ids.includes(item.id) && evaluate([...survivors, item], recoveryConstraints).feasible).map(item => item.id);
      return { canceledId: canceled.id, replacementIds: replacements };
    }) : [];
    festival = { pairCount: pairs.length, supportedPairs: supported, sharedThemePairs: bridged, themes: [...themes].sort(), pairs, recovery,
      interpretation: 'Shared themes are cultural connections, not measured ticket-buyer overlap. Replacement coverage assumes buyer-entered terms remain valid.' };
    breakdown.culturalCohesion = pairs.length ? 8 * bridged / pairs.length : 0;
    breakdown.culturalBreadth = 4 * Math.min(1, themes.size / Math.max(1, Math.min(12, count * 2)));
    breakdown.pairEvidencePenalty = pairs.length ? -6 * (1 - supported / pairs.length) : 0;
    breakdown.cancellationReadiness = recovery.length ? 6 * recovery.filter(item => item.replacementIds.length).length / recovery.length : 0;
  }
  const rawScore = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const supportedFitCount = selected.filter(item => item.fit != null).length;
  if (constraints.minimumAverageFit != null && (supportedFitCount !== count || selected.reduce((sum, item) => sum + (item.fit ?? 0), 0) / divisor + EPSILON < constraints.minimumAverageFit)) addViolation('fitFloor', 'The slate lacks complete rank evidence or falls below the required average fit.');
  return {
    selectedIds: ids,
    totalFee: feeCents == null ? null : money(feeCents),
    knownFeeSubtotal: money(knownFeeCents),
    remainingBudget: feeCents == null ? null : money(budgetCents - feeCents),
    score: round(rawScore),
    rawScore,
    festival,
    objectiveBreakdown: { ...Object.fromEntries(Object.entries(breakdown).map(([key, value]) => [key, round(value)])), total: round(rawScore) },
    discoveredCount,
    genreCount: genres.size,
    supportedFitCount,
    feasible: violations.length === 0,
    violations,
  };
}

const idKey = result => [...result.selectedIds].sort().join('\u0000');
function compareResults(a, b) {
  if (Math.abs(a.rawScore - b.rawScore) > EPSILON) return b.rawScore - a.rawScore;
  if (a.totalFee !== b.totalFee) return (a.totalFee ?? Infinity) - (b.totalFee ?? Infinity);
  return idKey(a) < idKey(b) ? -1 : idKey(a) > idKey(b) ? 1 : 0;
}

function publicSlate(result) {
  return {
    selectedIds: result.selectedIds,
    totalFee: result.totalFee,
    knownFeeSubtotal: result.knownFeeSubtotal,
    remainingBudget: result.remainingBudget,
    score: result.score,
    ...(result.festival ? { festival: result.festival } : {}),
    objectiveBreakdown: result.objectiveBreakdown,
    discoveredCount: result.discoveredCount,
    genreCount: result.genreCount,
    feasible: result.feasible,
    violations: result.violations.map(item => item.message),
  };
}

/** Find the global best slate under the declared policy for at most 10 candidates.
 * The function is pure: it never writes candidate terms, calls Qloo, or infers fees.
 */
export function evaluateSelection(candidates, rawConstraints, selectedIds) {
  const validation = optimizeSlate(candidates, rawConstraints);
  if (validation.status === 'invalid') throw new Error(validation.reasons.join(' '));
  if (!Array.isArray(selectedIds) || unique(selectedIds).length !== selectedIds.length || selectedIds.some(id => !candidates.some(item => item.id === id))) throw new Error('Selection must contain unique known candidate IDs.');
  const pool = candidates.map(item => normalizeCandidate(item, validation.constraints.excludedIds));
  return publicSlate(evaluate(pool.filter(item => selectedIds.includes(item.id)), validation.constraints, pool));
}

export function optimizeSlate(candidates, rawConstraints = {}) {
  const input = Array.isArray(candidates) ? candidates : [];
  const { constraints, errors } = normalizeConstraints(rawConstraints, input.length);
  if (!Array.isArray(candidates)) errors.push('Candidates must be an array.');
  if (input.length > MAX_CANDIDATES) errors.push('Exact optimization supports at most 10 candidates. Narrow the shortlist before optimizing.');
  const inputIds = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) errors.push('Every candidate needs a non-empty string ID.');
    else inputIds.push(item.id);
  }
  if (unique(inputIds).length !== inputIds.length) errors.push('Candidate IDs must be unique.');
  for (const id of [...constraints.lockedIds, ...constraints.excludedIds]) if (!inputIds.includes(id)) errors.push(`Constraint references unknown candidate ${id}.`);
  const base = {
    version: '1.0', method: 'exact-enumeration', status: 'invalid', feasible: false,
    selectedIds: [], totalFee: null, remainingBudget: null, score: null,
    objectiveBreakdown: emptyBreakdown(), checkedCount: 0, feasibleCount: 0,
    constraints, policy: policy(), reasons: unique(errors),
    confidence: { level: 'insufficient', supportedFitCount: 0, totalCount: 0, missingFitIds: [], notes: [] },
    diagnostics: { invalidInputs: unique(errors), candidateExclusions: [], constraintImpacts: [], nearestSlates: [], relaxations: {} },
    frontier: [], alternatives: [], baseline: null, candidateAssessments: [], receiptIds: [],
  };
  if (errors.length) return base;
  if (constraints.festivalPolicy) base.policy.festival = { version: 'houselights-festival-v1',
    culturalCohesion: '8 × fraction of selected pairs with at least one returned shared theme',
    culturalBreadth: '4 × distinct shared themes / min(12, twice the slot count), capped at 4',
    pairEvidencePenalty: '−6 × fraction of selected pairs without interpretable comparison evidence',
    cancellationReadiness: '6 × fraction of selected acts with at least one feasible one-act replacement; survivors stay locked',
    missingEvidence: 'No fabricated neutral similarities. Unknown pairs are missing; theme counts are a policy proxy, not audience size.' };

  const normalized = input.map(item => normalizeCandidate(item, constraints.excludedIds));
  base.candidateAssessments = normalized.map(item => ({
    id: item.id, name: item.name, eligible: item.exclusionReasons.length === 0,
    discovery: item.discovery, fee: item.feeCents == null ? null : money(item.feeCents),
    genre: item.genre, fit: item.fit, evidence: item.evidence, exclusionReasons: item.exclusionReasons,
  }));
  base.diagnostics.candidateExclusions = base.candidateAssessments.filter(item => !item.eligible).map(item => ({ id: item.id, name: item.name, reasons: item.exclusionReasons }));

  // Evaluate all exact-size subsets, including unbookable ones, so infeasibility
  // diagnostics can identify which constraints actually exclude a combination.
  const evaluated = [];
  for (let mask = 0; mask < 2 ** normalized.length; mask++) {
    const selected = normalized.filter((_, index) => mask & (1 << index));
    if (selected.length === constraints.slots) evaluated.push(evaluate(selected, constraints, normalized));
  }
  base.checkedCount = evaluated.length;
  const feasible = evaluated.filter(result => result.feasible).sort(compareResults);
  base.feasibleCount = feasible.length;
  const impacts = new Map();
  for (const result of evaluated) for (const code of unique(result.violations.map(item => item.code))) impacts.set(code, (impacts.get(code) ?? 0) + 1);
  base.diagnostics.constraintImpacts = [...impacts].map(([constraint, blockedCount]) => ({ constraint, blockedCount }));
  const budgetRelaxed = evaluated.filter(result => result.totalFee != null && result.violations.every(item => item.code === 'budget'));
  const discoveryRelaxed = evaluated.filter(result => result.violations.every(item => item.code === 'discovery'));
  const minimumBudget = budgetRelaxed.length ? Math.min(...budgetRelaxed.map(result => result.totalFee)) : null;
  base.diagnostics.relaxations = {
    minimumBudget,
    additionalBudget: minimumBudget == null ? null : money(Math.max(0, toCents(minimumBudget) - toCents(constraints.budget))),
    maximumDiscovery: discoveryRelaxed.length ? Math.max(...discoveryRelaxed.map(result => result.discoveredCount)) : null,
  };

  const baselineIds = unique([
    ...constraints.lockedIds,
    ...normalized.filter(item => item.exclusionReasons.length === 0).map(item => item.id),
  ]).slice(0, constraints.slots);
  const baseline = evaluate(baselineIds.map(id => normalized.find(item => item.id === id)), constraints, normalized);
  base.baseline = { label: 'First eligible input-order slate, with locks; not a popularity ranking', ...publicSlate(baseline), scoreDelta: null };

  if (!feasible.length) {
    base.status = 'infeasible';
    base.reasons = ['No slate satisfies all booking constraints.'];
    if (constraints.slots > normalized.length) base.reasons.push(`There are ${normalized.length} candidates for ${constraints.slots} required slots.`);
    if (constraints.lockedIds.length > constraints.slots) base.reasons.push('More acts are locked than there are slots.');
    const overlap = constraints.lockedIds.filter(id => constraints.excludedIds.includes(id));
    if (overlap.length) base.reasons.push(`An act cannot be both locked and excluded: ${overlap.join(', ')}.`);
    if (constraints.discoveryMin > constraints.slots) base.reasons.push('The discovery minimum exceeds the number of slots.');
    const eligibleCount = base.candidateAssessments.filter(item => item.eligible).length;
    if (eligibleCount < constraints.slots) base.reasons.push(`Only ${eligibleCount} acts have a valid fee, confirmed availability and no exclusion; ${constraints.slots} are required.`);
    if (minimumBudget != null && minimumBudget > constraints.budget) base.reasons.push(`The least expensive slate satisfying the other constraints costs ${minimumBudget.toFixed(2)}, requiring ${base.diagnostics.relaxations.additionalBudget.toFixed(2)} more budget.`);
    if (base.diagnostics.relaxations.maximumDiscovery != null && base.diagnostics.relaxations.maximumDiscovery < constraints.discoveryMin) base.reasons.push(`At most ${base.diagnostics.relaxations.maximumDiscovery} discovered acts fit the other constraints.`);
    const nearest = [...evaluated].sort((a, b) => a.violations.length - b.violations.length || compareResults(a, b)).slice(0, 3);
    base.diagnostics.nearestSlates = nearest.map(publicSlate);
    if (base.reasons.length === 1 && nearest.length) base.reasons.push(...nearest[0].violations.map(item => item.message));
    return base;
  }

  const winner = feasible[0];
  const selected = normalized.filter(item => winner.selectedIds.includes(item.id));
  const missingFitIds = selected.filter(item => item.fit == null).map(item => item.id);
  const confidence = {
    level: !winner.supportedFitCount ? 'insufficient' : missingFitIds.length ? 'mixed' : 'supported',
    supportedFitCount: winner.supportedFitCount,
    totalCount: selected.length,
    missingFitIds,
    notes: [],
  };
  if (missingFitIds.length) confidence.notes.push(`${missingFitIds.length} selected act(s) lack supported affinity. This is a provisional policy result, not a confident taste recommendation.`);
  if (selected.some(item => !item.genre)) confidence.notes.push('Unknown genres earn no breadth reward; their concentration cannot be verified.');
  if (selected.some(item => !item.evidence.local || !item.evidence.trends || !item.evidence.comparison)) confidence.notes.push('Some supporting local, trend or comparison evidence is absent; the objective exposes the resulting evidence penalty.');

  // A frontier option is dominated only if another is no dearer and no worse,
  // with at least one strict improvement. Equal cost/score options get one
  // deterministic representative, keeping the chart readable.
  const frontier = [];
  for (const result of [...feasible].sort((a, b) => a.totalFee - b.totalFee || compareResults(a, b))) {
    const bestEarlierScore = frontier.length ? frontier[frontier.length - 1].rawScore : -Infinity;
    if (result.rawScore > bestEarlierScore + EPSILON) frontier.push(result);
  }

  const alternatives = [];
  for (const removed of selected) for (const added of normalized.filter(item => !winner.selectedIds.includes(item.id))) {
    const swapped = normalized.filter(item => (winner.selectedIds.includes(item.id) && item.id !== removed.id) || item.id === added.id);
    const result = evaluate(swapped, constraints, normalized);
    const scoreDelta = round(result.rawScore - winner.rawScore);
    const costDelta = result.totalFee == null ? null : money(toCents(result.totalFee) - toCents(winner.totalFee));
    alternatives.push({
      removedId: removed.id, addedId: added.id, ...publicSlate(result), scoreDelta, costDelta,
      reason: result.feasible
        ? `Swap ${removed.name} for ${added.name}: ${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(2)} policy points; ${costDelta >= 0 ? '+' : ''}${costDelta.toFixed(2)} in fees. All constraints remain satisfied.`
        : `Swap ${removed.name} for ${added.name} is not bookable: ${result.violations.map(item => item.message).join(' ')}`,
    });
  }
  alternatives.sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.scoreDelta - a.scoreDelta || (a.costDelta ?? Infinity) - (b.costDelta ?? Infinity) || a.addedId.localeCompare(b.addedId) || a.removedId.localeCompare(b.removedId));

  return {
    ...base,
    status: missingFitIds.length ? 'provisional' : 'optimal', feasible: true,
    selectedIds: winner.selectedIds, totalFee: winner.totalFee,
    remainingBudget: winner.remainingBudget, score: winner.score,
    objectiveBreakdown: winner.objectiveBreakdown, confidence,
    ...(winner.festival ? { festival: winner.festival } : {}),
    reasons: [
      `Checked all ${base.checkedCount} exact-size combinations; ${base.feasibleCount} satisfy every booking constraint.`,
      missingFitIds.length ? 'This slate maximizes the declared policy with incomplete affinity evidence; review the missing evidence before booking.' : 'This slate has the highest declared policy score among all feasible combinations.',
      ...confidence.notes,
    ],
    frontier: frontier.map(publicSlate), alternatives,
    baseline: { ...base.baseline, scoreDelta: baseline.feasible ? round(winner.rawScore - baseline.rawScore) : null },
    receiptIds: unique([...selected.flatMap(item => item.receipts), ...(winner.festival?.pairs.flatMap(pair => pair.receiptId ? [pair.receiptId] : []) ?? [])]),
  };
}
