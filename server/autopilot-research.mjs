// Research-selection analysis for Autopilot. Pure functions over the exact
// optimizer; no provider calls.
//
// Evidence enters the declared objective additively per artist (fit, momentum,
// local support and that artist's share of the missing-evidence penalty), so
// for any challenger lineup L and the incumbent I the largest possible swing
// is: best case for every open gap on L \ I, worst case for every open gap on
// I \ L. Checking that bound for every feasible lineup finds evidence that is
// only decision-relevant in combination, without enumerating outcome sets.
import { enumerateSlates, optimizeSlate, evidencePoints } from './optimizer.mjs';

export const GAP_KINDS = ['local', 'comparison', 'trends'];
const EPSILON = 1e-9;
const key = ids => [...ids].sort().join('\0');

export function withOutcome(items, id, kind, outcome) {
  return items.map(item => {
    if (item.id !== id) return item;
    const copy = { ...item, evidence: { ...item.evidence, [kind]: true } };
    if (kind === 'local') copy.local = 'yes';
    if (kind === 'trends') copy.momentum = outcome;
    return copy;
  });
}

// The answers a Qloo call can actually produce for each gap. An empty or
// uninterpretable answer leaves the item unchanged (delta 0).
export function outcomesFor(kind) {
  return kind === 'trends' ? ['rising', 'cooling', 'flat'] : [kind === 'local' ? 'local evidence returned' : 'comparison returned'];
}

// Best and worst change in raw slate score (points per slot) for one gap.
export function gapBounds(items, constraints, gap) {
  const item = items.find(row => row.id === gap.itemId), slots = constraints.slots;
  const base = evidencePoints(item, constraints);
  const deltas = [0, ...outcomesFor(gap.kind).map(outcome => evidencePoints(withOutcome([item], item.id, gap.kind, outcome)[0], constraints) - base)];
  return { best: Math.max(...deltas) / slots, worst: Math.min(...deltas) / slots,
    bestOutcome: outcomesFor(gap.kind)[deltas.slice(1).indexOf(Math.max(...deltas.slice(1)))], worstOutcome: gap.kind === 'trends' ? 'cooling' : null };
}

// Calls needed to answer a set of gaps: trend questions share one batched call.
export const callCost = gaps => gaps.filter(gap => gap.kind !== 'trends').length + (gaps.some(gap => gap.kind === 'trends') ? 1 : 0);

const overtakes = (advantage, challenger, incumbent) => advantage > EPSILON ||
  (Math.abs(advantage) <= EPSILON && (challenger.totalFee < incumbent.totalFee || (challenger.totalFee === incumbent.totalFee && key(challenger.selectedIds) < key(incumbent.selectedIds))));

/**
 * For each open gap: can it, alone or together with other open gaps, change
 * the optimizer's choice in this context, and how many calls would that take?
 * `gaps` are researchable questions {id, itemId, kind}. Returns per-gap
 * analysis plus the challengers that some evidence outcome could promote.
 */
export function jointMateriality(items, constraints, gaps, { callsLeft = Infinity } = {}) {
  const incumbent = optimizeSlate(items, constraints);
  const result = new Map(gaps.map(gap => [gap.id, { material: false, single: false, reachable: false, challengers: [] }]));
  if (!incumbent.feasible) return { incumbent, challengers: [], byGap: result };
  const rows = enumerateSlates(items, constraints).filter(row => row.feasible);
  const incumbentRow = rows.find(row => key(row.selectedIds) === key(incumbent.selectedIds));
  const bounds = new Map(gaps.map(gap => [gap.id, gapBounds(items, constraints, gap)]));
  const byItem = new Map();
  for (const gap of gaps) byItem.set(gap.itemId, [...(byItem.get(gap.itemId) ?? []), gap]);
  const challengers = [];
  for (const row of rows) {
    if (row === incumbentRow) continue;
    const gains = [
      ...row.selectedIds.filter(id => !incumbent.selectedIds.includes(id)).flatMap(id => (byItem.get(id) ?? []).map(gap => ({ gap, gain: bounds.get(gap.id).best, outcome: bounds.get(gap.id).bestOutcome }))),
      ...incumbent.selectedIds.filter(id => !row.selectedIds.includes(id)).flatMap(id => (byItem.get(id) ?? []).map(gap => ({ gap, gain: -bounds.get(gap.id).worst, outcome: bounds.get(gap.id).worstOutcome }))),
    ].filter(entry => entry.gain > EPSILON).sort((a, b) => b.gain - a.gain || a.gap.id.localeCompare(b.gap.id));
    const deficit = incumbentRow.rawScore - row.rawScore;
    if (!overtakes(gains.reduce((sum, entry) => sum + entry.gain, 0) - deficit, row, incumbentRow)) continue;
    // Smallest set by count: take the largest gains until the bound flips.
    const needed = [];
    let total = 0;
    for (const entry of gains) { needed.push(entry); total += entry.gain; if (overtakes(total - deficit, row, incumbentRow)) break; }
    const cost = callCost(needed.map(entry => entry.gap));
    // Any gap that could flip the bill on its own is also a complete answer set.
    const singleIds = gains.filter(entry => overtakes(entry.gain - deficit, row, incumbentRow)).map(entry => entry.gap.id);
    challengers.push({ selectedIds: row.selectedIds, totalFee: row.totalFee, deficit, neededGapIds: needed.map(entry => entry.gap.id), singleIds, contributingGapIds: gains.map(entry => entry.gap.id),
      outcomes: Object.fromEntries(needed.map(entry => [entry.gap.id, entry.outcome])), cost, reachable: cost <= callsLeft });
  }
  challengers.sort((a, b) => a.cost - b.cost || a.deficit - b.deficit || key(a.selectedIds).localeCompare(key(b.selectedIds)));
  for (const challenger of challengers) for (const id of challenger.contributingGapIds) {
    const row = result.get(id), alone = challenger.singleIds.includes(id), needed = alone || challenger.neededGapIds.includes(id);
    const cost = alone ? 1 : challenger.cost;
    row.material = true;
    row.challengers.push({ selectedIds: challenger.selectedIds, cost, needed, partners: alone ? [] : challenger.neededGapIds.filter(other => other !== id), reachable: cost <= callsLeft, deficit: challenger.deficit, outcome: challenger.outcomes[id] ?? gapBounds(items, constraints, gaps.find(gap => gap.id === id)).bestOutcome });
    if (cost <= callsLeft && needed) row.reachable = true;
    if (alone) row.single = true;
  }
  for (const row of result.values()) row.challengers.sort((a, b) => Number(b.reachable && b.needed) - Number(a.reachable && a.needed) || a.cost - b.cost || a.deficit - b.deficit);
  return { incumbent, challengers, byGap: result, margin: rows.length > 1 ? Math.max(0, incumbentRow.rawScore - Math.max(...rows.filter(row => row !== incumbentRow).map(row => row.rawScore))) : null };
}

// Laplace-smoothed answer rate per evidence kind, from this run's observations.
// A kind that keeps returning unusable data loses priority instead of being retried blindly.
export function answerRates(observations) {
  const tally = Object.fromEntries(GAP_KINDS.map(kind => [kind, { resolved: 0, attempted: 0 }]));
  for (const observation of observations) for (const result of observation.results ?? []) {
    const kind = String(result.questionId ?? '').split(':')[0];
    if (!tally[kind]) continue;
    tally[kind].attempted++;
    if (result.state === 'resolved') tally[kind].resolved++;
  }
  return Object.fromEntries(Object.entries(tally).map(([kind, row]) => [kind, (row.resolved + 1) / (row.attempted + 2)]));
}
