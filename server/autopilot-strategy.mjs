// Booking strategies and stress testing for Autopilot. Every strategy is an
// exact optimizer result; robustness is measured on one common scenario set so
// strategies are compared under identical assumptions.
import { optimizeSlate, enumerateSlates } from './optimizer.mjs';
import { buildContingencyPlan } from './contingency.mjs';
import { buildDecisionProof } from './decision-proof.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const cents = value => Math.round((value + Number.EPSILON) * 100) / 100;
const key = ids => [...ids].sort().join('\0');
const same = (a, b) => key(a) === key(b);
const unique = values => [...new Set(values)];
export const bookable = item => item.terms?.available === true && finite(item.terms?.fee) && item.terms.fee >= 0;
const ROBUST_POOL = 16;

export const ROBUSTNESS_DEFINITION = {
  scenarios: 'Budget cuts of 5, 10, 15 and 20%; +10, +20 and +30% on each bookable artist\'s fee; each bookable artist becoming unavailable; and three combined shocks (5% cut with all fees +10%, 10% with +15%, 15% with +20%).',
  outcomes: '"Held": the planned bill stays feasible unchanged. "Repaired": one act is swapped and the others stay booked. "Failed": no bill keeps the other acts.',
  ranking: 'Scenarios where the plan continues (held or repaired), then scenarios held unchanged, then the worst policy score reached, then policy score, then cost. A strategy is called more robust only if it strictly beats the recommendation on plan continuity or, at equal continuity, on unchanged holds.',
  scope: 'Searches the 16 highest-scoring feasible bills plus every cost-frontier bill. Scenarios are rehearsals, not probabilities.',
};

// One scenario list shared by every bill in a comparison.
export function scenarioSet(pool, constraints) {
  const bookableIds = pool.filter(bookable).map(item => item.id);
  return [
    ...[5, 10, 15, 20].map(cut => ({ id: `budget-${cut}`, kind: 'budget_cut', cut })),
    ...bookableIds.flatMap(id => [10, 20, 30].map(increase => ({ id: `fee-${id}-${increase}`, kind: 'fee_increase', artistId: id, increase }))),
    ...bookableIds.map(id => ({ id: `unavailable-${id}`, kind: 'unavailable', artistId: id })),
    ...[[5, 10], [10, 15], [15, 20]].map(([cut, increase]) => ({ id: `combined-${cut}-${increase}`, kind: 'combined', cut, increase })),
  ];
}

export function applyScenario(pool, constraints, scenario) {
  const fee = (item, increase) => ({ ...item, terms: { ...item.terms, fee: cents(item.terms.fee * (1 + increase / 100)) } });
  let items = pool, budget = constraints.budget;
  if (scenario.kind === 'budget_cut' || scenario.kind === 'combined') budget = cents(constraints.budget * (1 - scenario.cut / 100));
  if (scenario.kind === 'fee_increase') items = pool.map(item => item.id === scenario.artistId ? fee(item, scenario.increase) : item);
  if (scenario.kind === 'combined') items = pool.map(item => finite(item.terms?.fee) ? fee(item, scenario.increase) : item);
  if (scenario.kind === 'unavailable') items = pool.map(item => item.id === scenario.artistId ? { ...item, terms: { ...item.terms, available: false } } : item);
  return { items, constraints: { ...constraints, budget } };
}

// Each shocked scenario is enumerated once and every candidate bill is scored
// against it. "Held": the bill itself is still feasible. "Repaired": the best
// feasible bill that keeps all but one planned act. Otherwise "failed".
export function robustnessProfiles(pool, constraints, idSets, scenarios = scenarioSet(pool, constraints)) {
  const states = idSets.map(() => ({ held: 0, repaired: 0, failed: 0, worstScore: Infinity, outcomes: [] }));
  const members = idSets.map(ids => new Set(ids));
  for (const scenario of scenarios) {
    const shocked = applyScenario(pool, constraints, scenario);
    const rows = enumerateSlates(shocked.items, shocked.constraints).filter(row => row.feasible);
    const byKey = new Map(rows.map(row => [key(row.selectedIds), row]));
    idSets.forEach((ids, index) => {
      const state = states[index], exact = byKey.get(key(ids));
      if (exact) { state.held++; state.worstScore = Math.min(state.worstScore, exact.score); state.outcomes.push({ scenarioId: scenario.id, outcome: 'held' }); return; }
      let best = null;
      for (const row of rows) if (row.selectedIds.filter(id => members[index].has(id)).length === ids.length - 1 && (!best || row.rawScore > best.rawScore)) best = row;
      if (best) { state.repaired++; state.worstScore = Math.min(state.worstScore, best.score); state.outcomes.push({ scenarioId: scenario.id, outcome: 'repaired', droppedId: ids.find(id => !best.selectedIds.includes(id)), selectedIds: best.selectedIds }); }
      else { state.failed++; state.outcomes.push({ scenarioId: scenario.id, outcome: 'failed' }); }
    });
  }
  return states.map(state => ({ held: state.held, repaired: state.repaired, failed: state.failed, continued: state.held + state.repaired, total: scenarios.length, worstScore: Number.isFinite(state.worstScore) ? cents(state.worstScore) : null, outcomes: state.outcomes }));
}
export const robustnessProfile = (pool, constraints, ids, scenarios = scenarioSet(pool, constraints)) => robustnessProfiles(pool, constraints, [ids], scenarios)[0];

const robustnessOrder = (a, b) => b.profile.continued - a.profile.continued || b.profile.held - a.profile.held ||
  (b.profile.worstScore ?? -Infinity) - (a.profile.worstScore ?? -Infinity) || b.row.rawScore - a.row.rawScore || a.row.totalFee - b.row.totalFee || key(a.row.selectedIds).localeCompare(key(b.row.selectedIds));
const strictlyMoreRobust = (a, b) => a.continued > b.continued || (a.continued === b.continued && a.held > b.held);

export function backupsFor(pool, constraints, ids, depth = 2) {
  return ids.map(id => {
    const options = [];
    let excluded = [id];
    for (let index = 0; index < depth; index++) {
      const result = optimizeSlate(pool, { ...constraints, lockedIds: unique([...(constraints.lockedIds ?? []).filter(other => other !== id), ...ids.filter(other => other !== id)]), excludedIds: unique([...(constraints.excludedIds ?? []), ...excluded]) });
      if (!result.feasible) break;
      const replacement = result.selectedIds.filter(other => !ids.includes(other));
      if (!replacement.length) break;
      options.push({ replacementIds: replacement, selectedIds: result.selectedIds, totalFee: result.totalFee, score: result.score });
      excluded = [...excluded, ...replacement];
    }
    return { artistId: id, options };
  });
}

export function computeStrategies(pool, constraints, context) {
  const { money, names, crossCheck, partialRank, city } = context;
  const best = optimizeSlate(pool, constraints);
  if (!best.feasible) return { status: 'infeasible', reasons: best.reasons, relaxations: best.diagnostics?.relaxations ?? null, list: [], comparison: null };
  const rows = enumerateSlates(pool, constraints).filter(row => row.feasible).sort((a, b) => b.rawScore - a.rawScore || a.totalFee - b.totalFee || key(a.selectedIds).localeCompare(key(b.selectedIds)));
  const bestRow = rows.find(row => same(row.selectedIds, best.selectedIds));
  const scenarios = scenarioSet(pool, constraints);
  const profiles = new Map();
  const frontierKeys = new Set(best.frontier.map(row => key(row.selectedIds)));
  const searched = rows.filter((row, index) => index < ROBUST_POOL || frontierKeys.has(key(row.selectedIds)));
  // Profile every bill a strategy could come from in one pass over the scenarios.
  const batch = searched.map(row => row.selectedIds);
  robustnessProfiles(pool, constraints, batch, scenarios).forEach((result, index) => profiles.set(key(batch[index]), result));
  const profile = ids => { const id = key(ids); if (!profiles.has(id)) profiles.set(id, robustnessProfile(pool, constraints, ids, scenarios)); return profiles.get(id); };
  const evidenceOf = ids => pool.filter(item => ids.includes(item.id)).map(item => ({ id: item.id, name: item.name, kinds: ['rank', 'local', 'comparison', 'trends'].filter(kind => item.evidence?.[kind]) }));
  const describe = (id, label, row, rationale, preferWhen) => {
    const evidence = evidenceOf(row.selectedIds), robustness = profile(row.selectedIds);
    return { id, labels: [label], label, selectedIds: row.selectedIds, totalFee: row.totalFee, headroom: cents(constraints.budget - row.totalFee), score: row.score,
      scoreGap: cents(best.score - row.score), feeDelta: cents(row.totalFee - best.totalFee), robustness: { held: robustness.held, repaired: robustness.repaired, failed: robustness.failed, continued: robustness.continued, total: robustness.total, worstScore: robustness.worstScore },
      cancellationCoverage: { covered: row.selectedIds.filter(member => robustness.outcomes.find(outcome => outcome.scenarioId === `unavailable-${member}`)?.outcome !== 'failed').length, total: row.selectedIds.length },
      evidence, evidenceCompleteness: cents(evidence.reduce((sum, member) => sum + member.kinds.length, 0) / Math.max(1, evidence.length * 4)), rationale, preferWhen };
  };
  const recommended = describe('cultural-fit', 'Strongest cultural fit', bestRow, 'Highest declared policy score among all feasible bills: the best-supported cultural fit under the declared model.', null);
  const list = [recommended];
  const add = (id, label, row, rationale, preferWhen) => {
    const existing = list.find(entry => same(entry.selectedIds, row.selectedIds));
    if (existing) { existing.labels.push(label); existing.label = existing.labels.join(' · '); existing.rationale += ` ${rationale}`; if (preferWhen) existing.preferWhen = [existing.preferWhen, preferWhen].filter(Boolean).join(' '); return existing; }
    const entry = describe(id, label, row, rationale, preferWhen); list.push(entry); return entry;
  };
  const cheaper = rows.filter(row => row.totalFee < best.totalFee).sort((a, b) => b.rawScore - a.rawScore || a.totalFee - b.totalFee || key(a.selectedIds).localeCompare(key(b.selectedIds)))[0];
  if (cheaper) add('lower-cost', 'Lower-cost alternative', cheaper, `Best policy score among cheaper bills: saves ${money(best.totalFee - cheaper.totalFee)} for ${cents(best.score - cheaper.score)} policy points.`,
    `Prefer it if the ${money(best.totalFee - cheaper.totalFee)} saving matters more than the cultural-fit gap, or if the artist budget may fall below ${money(best.totalFee)}.`);
  // Robust search: highest-scoring bills plus the cost frontier, under the same scenarios.
  const ranked = searched.map(row => ({ row, profile: profile(row.selectedIds) })).sort(robustnessOrder);
  const top = ranked[0], recommendedProfile = profile(best.selectedIds);
  let robustNote;
  if (top && strictlyMoreRobust(top.profile, recommendedProfile)) {
    add('robust', 'Most robust under disruption', top.row, `Continues in ${top.profile.continued}/${top.profile.total} disruption scenarios (${top.profile.held} unchanged) versus ${recommendedProfile.continued}/${recommendedProfile.total} (${recommendedProfile.held} unchanged) for the recommendation.`,
      `Prefer it if cancellations, fee increases or budget cuts are likely: it gives up ${cents(best.score - top.row.score)} policy points for that resilience.`);
    robustNote = null;
  } else robustNote = `No searched bill is more robust than the recommendation under the common scenarios: it continues in ${recommendedProfile.continued}/${recommendedProfile.total} (${recommendedProfile.held} unchanged).`;
  if (crossCheck?.complete && !crossCheck.agrees && crossCheck.feasible) {
    const row = rows.find(slate => same(slate.selectedIds, crossCheck.selectedIds));
    if (row) add('location-free', 'Preferred without the city signal', row, `The optimizer's choice under a location-free Qloo ranking [${crossCheck.receiptId}].`, `Prefer it if the audience is not mainly local to ${city}.`);
  }
  // Incomplete Qloo ranking: best bill among the acts Qloo did rank, with unranked
  // bookable acts excluded. Positions come only from the one returned query.
  if (partialRank) {
    const ranked = new Set(partialRank.order), missing = partialRank.missingIds.filter(id => pool.find(item => item.id === id && bookable(item)));
    if (missing.length) {
      const fitOf = id => partialRank.fits?.[id] ?? (partialRank.order.length > 1 ? 1 - partialRank.order.indexOf(id) / (partialRank.order.length - 1) : .5);
      const subset = pool.map(item => ranked.has(item.id) ? { ...item, fit: fitOf(item.id), evidence: { ...item.evidence, rank: true } } : item);
      const result = optimizeSlate(subset, { ...constraints, excludedIds: unique([...(constraints.excludedIds ?? []), ...missing]) });
      const row = result.feasible ? rows.find(slate => same(slate.selectedIds, result.selectedIds)) : null;
      if (row) add('ranked-only', 'Best among acts Qloo could rank', row, `Qloo returned no rank for ${names(missing)} [${partialRank.receiptId}]. Excluding ${missing.length === 1 ? 'it' : 'them'} and using the returned order, this is the optimizer's choice.`, `Prefer it if you want every booked act backed by a Qloo audience rank.`);
    }
  }
  recommended.preferWhen = `Recommended: it maximizes the declared cultural-fit objective and continues in ${recommendedProfile.continued}/${recommendedProfile.total} disruption scenarios.`;
  const backups = backupsFor(pool, constraints, best.selectedIds);
  return { status: 'feasible', list, robustNote, robustnessDefinition: ROBUSTNESS_DEFINITION, scenarios: scenarios.map(({ id, kind }) => ({ id, kind })), backups,
    frontier: best.frontier.map(row => ({ selectedIds: row.selectedIds, totalFee: row.totalFee, score: row.score })),
    margin: rows.length > 1 ? { feasibleCount: rows.length, points: cents(rows[0].rawScore - rows[1].rawScore), runnerUpIds: rows[1].selectedIds } : { feasibleCount: rows.length, points: null, runnerUpIds: [] },
    recommendedOutcomes: recommendedProfile.outcomes };
}

export function stressTest(pool, constraints, context) {
  const { money, names, nameOf, crossCheck, city, receipts } = context;
  const best = optimizeSlate(pool, constraints);
  if (!best.feasible) return { summary: 'No feasible recommendation to stress-test.', vulnerabilities: [], contexts: [], cancellations: [], breakpoints: [], budgetCuts: [], quoteShocks: [], evidence: null };
  const plan = buildContingencyPlan(pool, constraints, { robustSearch: false });
  const proof = buildDecisionProof({ memo: { items: pool, constraints }, receipts });
  const vulnerabilities = [], contexts = [], breakpoints = [];
  for (const row of plan.cancellations) {
    const lost = nameOf(row.canceledId);
    if (!row.feasible) vulnerabilities.push({ type: 'artist_unavailable', severity: 'critical', artistId: row.canceledId, text: `If ${lost} becomes unavailable, no replacement satisfies the brief while keeping the other booked acts.` });
    else {
      vulnerabilities.push({ type: 'artist_unavailable', severity: row.scoreDelta < -10 ? 'high' : 'moderate', artistId: row.canceledId, replacementIds: row.replacementIds,
        text: `If ${lost} becomes unavailable, replace with ${names(row.replacementIds)}: ${names(row.selectedIds)} at ${money(row.totalFee)} (${row.scoreDelta} policy points, ${row.costDelta >= 0 ? '+' : '−'}${money(Math.abs(row.costDelta))}).` });
      contexts.push({ id: `cancel:${row.canceledId}`, label: `${lost} cancels`, constraints: { ...constraints, lockedIds: best.selectedIds.filter(id => id !== row.canceledId), excludedIds: unique([...(constraints.excludedIds ?? []), row.canceledId]) }, focusIds: row.selectedIds });
    }
  }
  for (const id of best.selectedIds) {
    const item = pool.find(row => row.id === id), limit = cents(item.terms.fee + best.remainingBudget);
    const after = optimizeSlate(pool.map(row => row.id === id ? { ...row, terms: { ...row.terms, fee: cents(limit + .01) } } : row), constraints);
    breakpoints.push({ type: 'fee', artistId: id, currentFee: item.terms.fee, maximumFee: limit, increasePercent: item.terms.fee ? cents((limit / item.terms.fee - 1) * 100) : null, nextSelectedIds: after.selectedIds, nextFeasible: after.feasible,
      text: `${item.name}'s fee can rise to ${money(limit)}${item.terms.fee ? ` (+${cents((limit / item.terms.fee - 1) * 100)}%)` : ''} before this bill exceeds the budget; above that the plan becomes ${after.feasible ? names(after.selectedIds) : 'infeasible'}.` });
  }
  const floor = best.totalFee, below = optimizeSlate(pool, { ...constraints, budget: Math.max(0, cents(floor - .01)) });
  breakpoints.push({ type: 'budget', minimumBudget: floor, cutPercent: constraints.budget ? cents((1 - floor / constraints.budget) * 100) : 0, nextSelectedIds: below.selectedIds, nextFeasible: below.feasible, nextFee: below.totalFee,
    text: `The bill survives budget cuts down to ${money(floor)} (${constraints.budget ? cents((1 - floor / constraints.budget) * 100) : 0}% below the brief); below that the plan becomes ${below.feasible ? `${names(below.selectedIds)} at ${money(below.totalFee)}` : 'infeasible'}.` });
  if (below.feasible) contexts.push({ id: 'budget-floor', label: `budget below ${money(floor)}`, constraints: { ...constraints, budget: Math.max(0, cents(floor - .01)) }, focusIds: below.selectedIds });
  for (const row of plan.individualQuoteShocks.filter(row => !same(row.selectedIds, best.selectedIds) && row.increasePercent === 10))
    vulnerabilities.push({ type: 'fee_increase', severity: row.feasible ? 'moderate' : 'critical', artistId: row.shockedId, text: `A 10% quote increase for ${nameOf(row.shockedId)} changes the plan to ${row.feasible ? names(row.selectedIds) : 'no feasible lineup'}.` });
  const firstCut = plan.budgetCuts.find(row => !same(row.selectedIds, best.selectedIds));
  if (firstCut) vulnerabilities.push({ type: 'budget_cut', severity: firstCut.feasible ? (firstCut.cutPercent <= 10 ? 'high' : 'moderate') : 'critical', text: `A ${firstCut.cutPercent}% budget cut (${money(firstCut.budget)}) changes the plan to ${firstCut.feasible ? `${names(firstCut.selectedIds)} at ${money(firstCut.totalFee)}` : 'no feasible lineup'}.` });
  const combined = plan.combinedShocks.find(row => !row.feasible);
  if (combined) vulnerabilities.push({ type: 'combined', severity: 'high', text: `Under a ${combined.budgetCutPercent}% budget cut with ${combined.quoteIncreasePercent}% higher quotes, no lineup satisfies the brief.` });
  const ablation = id => proof.ablations.find(row => row.id === id);
  const all = ablation('class:all'), rank = ablation('class:rank');
  const evidence = { allWithdrawn: all ? { changed: all.changed, selectedIds: all.selectedIds, feasible: all.feasible } : null, rankWithdrawn: rank ? { changed: rank.changed, selectedIds: rank.selectedIds } : null,
    byClass: proof.ablations.filter(row => row.kind === 'class').map(row => ({ evidenceClass: row.evidenceClass, changed: row.changed, selectedIds: row.selectedIds })) };
  if (all?.changed) vulnerabilities.push({ type: 'missing_evidence', severity: 'dependency', text: `Without Qloo evidence the optimizer would choose ${names(all.selectedIds)}. The recommendation rests on the cultural receipts listed in this packet.` });
  else if (all) vulnerabilities.push({ type: 'missing_evidence', severity: 'survived', text: 'Withdrawing all Qloo evidence leaves the same bill: the choice is driven by fees and constraints, and Qloo evidence validates rather than changes it.' });
  if (crossCheck?.complete && !crossCheck.agrees) {
    const moved = best.selectedIds.filter(id => !crossCheck.selectedIds.includes(id));
    vulnerabilities.push({ type: 'cultural_specification', severity: 'high', receiptId: crossCheck.receiptId, selectedIds: crossCheck.selectedIds,
      text: `Without the ${city} location signal, Qloo's ranking [${crossCheck.receiptId}] would choose ${names(crossCheck.selectedIds)}. ${names(moved)} ${moved.length === 1 ? 'holds its' : 'hold their'} place because of local taste; if the audience is not mainly local, weigh the location-free bill.` });
  } else if (crossCheck?.complete && crossCheck.agrees) vulnerabilities.push({ type: 'cultural_specification', severity: 'survived', receiptId: crossCheck.receiptId, text: `A location-free Qloo ranking [${crossCheck.receiptId}] selects the same bill; the choice does not hinge on the ${city} signal.` });
  const weakEvidence = best.selectedIds.filter(id => { const item = pool.find(row => row.id === id); return !item.evidence.local || !item.evidence.comparison; });
  if (weakEvidence.length) vulnerabilities.push({ type: 'missing_evidence', severity: 'moderate', text: `${names(weakEvidence)} still lack${weakEvidence.length === 1 ? 's' : ''} geographic or audience-comparison evidence; their cultural justification relies mainly on rank.` });
  const order = { critical: 0, high: 1, dependency: 2, moderate: 3, survived: 4 };
  vulnerabilities.sort((a, b) => order[a.severity] - order[b.severity]);
  const resilience = plan.resilience;
  return { summary: `${resilience.totalScenarios} contingency scenarios: the plan adapts feasibly in ${resilience.feasibleScenarios}; ${resilience.cancellationCoverage}/${resilience.cancellationCount} cancellations have a clean replacement; ${vulnerabilities.filter(row => row.severity === 'critical').length} critical vulnerabilities.`,
    vulnerabilities, contexts, breakpoints, evidence, resilience,
    cancellations: plan.cancellations.map(row => ({ canceledId: row.canceledId, feasible: row.feasible, selectedIds: row.selectedIds, replacementIds: row.replacementIds, totalFee: row.totalFee, scoreDelta: row.scoreDelta })),
    budgetCuts: plan.budgetCuts.map(row => ({ cutPercent: row.cutPercent, budget: row.budget, feasible: row.feasible, selectedIds: row.selectedIds, totalFee: row.totalFee, retained: same(row.selectedIds, best.selectedIds) })),
    quoteShocks: plan.individualQuoteShocks.map(row => ({ shockedId: row.shockedId, increasePercent: row.increasePercent, feasible: row.feasible, selectedIds: row.selectedIds, retained: same(row.selectedIds, best.selectedIds) })),
    sensitivity: proof.sensitivity.map(row => ({ name: row.name, selectedIds: row.selectedIds, changed: row.changed })) };
}
