// Which candidates are worth a deep Qloo check? A deep check (where the fans are, audience
// overlap, six-month trend) costs calls from a fixed budget, so it should go where its result
// could change the bill. For each candidate this tries every result the check could return
// (local fans found or not, overlap available or not, trend rising, flat, cooling or unknown)
// while the other candidates keep their current evidence, and asks the exact optimizer for the
// bill in each case. A candidate whose possible results all lead to the same bill cannot
// change the decision on its own, so checking it is not a decision-relevant use of a call.
//
// This is a one-candidate-at-a-time (myopic) value-of-information test. It does not price
// joint outcomes across candidates; it ranks where a single check can matter.
import { optimizeSlate } from './optimizer.mjs';

const keyOf = ids => [...ids].sort().join('\u0000');
const OUTCOMES = [];
for (const local of [true, false]) for (const comparison of [true, false]) for (const momentum of ['rising', 'flat', 'cooling', 'unknown'])
  OUTCOMES.push({ local, comparison, momentum });

function withOutcome(item, outcome) {
  return { ...item, local: outcome.local ? 'yes' : 'no data', momentum: outcome.momentum,
    evidence: { ...item.evidence, local: outcome.local, comparison: outcome.comparison, trends: outcome.momentum !== 'unknown' } };
}

/** Per candidate: how many distinct bills its deep check could lead to, and whether it is in
 * the bill before any check. `items` carry rank evidence only (no deep evidence yet). */
export function researchValue(items, constraints) {
  const before = optimizeSlate(items, constraints);
  if (before.status === 'invalid') return { status: 'unavailable', reason: before.reasons.join(' '), candidates: [] };
  const candidates = items.map((item, index) => {
    const bills = new Map();
    for (const outcome of OUTCOMES) {
      const result = optimizeSlate(items.map((other, i) => i === index ? withOutcome(other, outcome) : other), constraints);
      const key = result.feasible ? keyOf(result.selectedIds) : '';
      if (!bills.has(key)) bills.set(key, { feasible: result.feasible, selectedIds: result.selectedIds, includes: result.selectedIds.includes(item.id) });
    }
    const outcomes = [...bills.values()];
    return { id: item.id, booked: before.feasible && before.selectedIds.includes(item.id), bills: outcomes.length,
      canEnter: outcomes.some(bill => bill.includes), canLeave: outcomes.some(bill => !bill.includes), couldChange: outcomes.length > 1 };
  });
  return { status: 'ready', method: 'value-of-information', outcomes: OUTCOMES.length, selectedIds: before.feasible ? before.selectedIds : [], candidates };
}

/** Deep-check order within `limit`: first the candidates whose result could change the bill,
 * then the booked acts (so every claim about the bill has its evidence), in `preference`
 * order. Everything else is skipped and says why. */
export function allocateResearch(value, preference, limit) {
  const byId = new Map(value.candidates.map(item => [item.id, item])), ordered = [...new Set([...preference, ...value.candidates.map(item => item.id)])].filter(id => byId.has(id));
  const changing = ordered.filter(id => byId.get(id).couldChange), verifying = ordered.filter(id => !byId.get(id).couldChange && byId.get(id).booked);
  const deep = [...changing, ...verifying].slice(0, Math.max(0, limit));
  const reasons = ordered.map(id => {
    const item = byId.get(id), picked = deep.includes(id);
    const reason = item.couldChange ? (picked ? 'could-change' : 'could-change-no-budget') : item.booked ? (picked ? 'verifies-bill' : 'verifies-bill-no-budget') : 'no-effect';
    return { id, reason, bills: item.bills, booked: item.booked };
  });
  return { deep, reasons };
}

export const RESEARCH_REASON = 'Check the acts whose Qloo evidence could change the bill first, then verify the booked acts; skip acts no result could change.';
export const RESEARCH_REASONS = ['could-change', 'could-change-no-budget', 'verifies-bill', 'verifies-bill-no-budget', 'no-effect'];
