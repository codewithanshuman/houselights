// How solid is a bill? Two exact checks on a saved decision, with no provider calls.
//
// 1. Fee robustness: every fee is redrawn uniformly within ±20% (seeded, so a plan always
//    reports the same figure) and the optimizer's choice is recomputed for each draw.
// 2. Flip points: one act's fee moves while every other fee stays fixed. For a booked act,
//    the highest fee at which the bill still stands and what replaces it above that; for an
//    unbooked act, the fee at which it would enter the bill and the bill it would bring.
//
// Both rest on one property of the optimizer: a bill's score does not depend on fees. Fees
// only decide which bills fit the budget, so the slates are enumerated once and each fee
// scenario reprices them. The result equals rerunning optimizeSlate on the changed fees.
// Festival policy scores replacement coverage, which depends on fees, so it is not covered.
import { enumerateSlates, optimizeSlate } from './optimizer.mjs';

const EPSILON = 1e-9, DRAWS = 500, SPREAD = 0.2, SEED = 23;
const toCents = value => Math.round((value + Number.EPSILON) * 100);
const fromCents = cents => cents / 100;
const keyOf = ids => [...ids].sort().join('\u0000');
const isFee = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function prepare(snapshot) {
  const items = snapshot?.memo?.items, raw = snapshot?.memo?.constraints;
  if (!Array.isArray(items) || !raw) return { status: 'unavailable', reason: 'No saved candidate pool.' };
  if (raw.festivalPolicy) return { status: 'unsupported', reason: 'Festival policy scores replacement coverage, which depends on fees.' };
  const baseline = optimizeSlate(items, raw);
  if (baseline.status === 'invalid') return { status: 'unavailable', reason: baseline.reasons.join(' ') };
  const constraints = baseline.constraints, fees = new Map();
  for (const item of items) if (isFee(item.terms?.fee)) fees.set(item.id, toCents(item.terms.fee));
  // Only the budget depends on fees. Slates that break any other rule never become bookable.
  const rows = enumerateSlates(items, constraints)
    .filter(row => row.violationCodes.every(code => code === 'budget') && row.selectedIds.every(id => fees.has(id)))
    .map(row => ({ ids: row.selectedIds, key: keyOf(row.selectedIds), score: row.rawScore }))
    .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { status: 'ready', items, constraints, baseline, fees, rows, budget: toCents(constraints.budget) };
}

// The optimizer's choice under one fee table: highest score that fits, then lowest total,
// then the lexicographic ID key (the same order as compareResults).
function choose(rows, feeOf, budget) {
  let best = null, bestTotal = 0;
  for (const row of rows) {
    if (best && best.score - row.score > EPSILON) break;
    let total = 0;
    for (const id of row.ids) total += feeOf(id);
    if (total > budget) continue;
    if (!best || total < bestTotal || (total === bestTotal && row.key < best.key)) { best = row; bestTotal = total; }
  }
  return best ? { ids: best.ids, key: best.key, total: bestTotal } : null;
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function feeRobustness(snapshot, { draws = DRAWS, spread = SPREAD, seed = SEED } = {}) {
  const ctx = prepare(snapshot);
  if (ctx.status !== 'ready') return { status: ctx.status, reason: ctx.reason };
  const { rows, fees, budget, baseline } = ctx, random = seededRandom(seed), ids = [...fees.keys()].sort();
  const baseKey = baseline.feasible ? keyOf(baseline.selectedIds) : null;
  const tally = new Map();
  let holds = 0, none = 0;
  for (let draw = 0; draw < draws; draw++) {
    const drawn = new Map(ids.map(id => [id, Math.round(fees.get(id) * (1 - spread + 2 * spread * random()))]));
    const winner = choose(rows, id => drawn.get(id), budget);
    if (!winner) { none++; continue; }
    if (winner.key === baseKey) { holds++; continue; }
    const entry = tally.get(winner.key) ?? { selectedIds: winner.ids, count: 0, totals: [] };
    entry.count++; entry.totals.push(winner.total); tally.set(winner.key, entry);
  }
  const alternatives = [...tally.values()].sort((a, b) => b.count - a.count || keyOf(a.selectedIds).localeCompare(keyOf(b.selectedIds))).slice(0, 3)
    .map(entry => ({ selectedIds: entry.selectedIds, draws: entry.count, share: entry.count / draws,
      medianTotal: fromCents(entry.totals.sort((a, b) => a - b)[Math.floor(entry.totals.length / 2)]) }));
  return { status: baseline.feasible ? 'ready' : 'no-bill', method: 'exact-reprice', draws, spread, seed,
    holds, share: baseline.feasible ? holds / draws : null, noBill: none, otherBills: tally.size, alternatives,
    interpretation: `Every fee is redrawn independently within ±${Math.round(spread * 100)}% and the exact optimizer chooses again. Fees are illustrative; this measures how close the decision is, not ticket demand.` };
}

export function flipPoints(snapshot) {
  const ctx = prepare(snapshot);
  if (ctx.status !== 'ready') return { status: ctx.status, reason: ctx.reason };
  const { rows, fees, budget, baseline, items } = ctx;
  if (!baseline.feasible) return { status: 'no-bill', booked: [], entries: [] };
  const baseKey = keyOf(baseline.selectedIds);
  const winnerAt = (id, cents) => choose(rows, other => other === id ? cents : fees.get(other), budget);
  // Largest integer in [low, high] where test holds, given test is true at low and monotone.
  const largest = (low, high, test) => { while (low < high) { const mid = Math.floor((low + high + 1) / 2); if (test(mid)) low = mid; else high = mid - 1; } return low; };
  const booked = [], entries = [];
  for (const item of items) {
    if (!fees.has(item.id)) continue;
    const fee = fees.get(item.id);
    if (baseline.selectedIds.includes(item.id)) {
      // Raising a booked act's fee only makes bills containing it costlier, so once the bill
      // stops winning it never returns. The bill cannot survive beyond the remaining budget.
      const ceiling = fee + (budget - toCents(baseline.totalFee));
      const max = largest(fee, ceiling, cents => winnerAt(item.id, cents)?.key === baseKey);
      const next = winnerAt(item.id, max + 1);
      booked.push({ id: item.id, fee: fromCents(fee), maxFee: fromCents(max), headroom: fromCents(max - fee),
        replacement: next ? { selectedIds: next.ids, total: fromCents(next.total) } : null });
    } else {
      // Lowering an unbooked act's fee only helps bills containing it, so the fees at which it
      // is booked form an interval from zero up to its entry fee.
      const enters = cents => winnerAt(item.id, cents)?.ids.includes(item.id) === true;
      if (!enters(0)) { entries.push({ id: item.id, fee: fromCents(fee), entryFee: null, bill: null }); continue; }
      const entry = largest(0, Math.max(0, fee - 1), enters), bill = winnerAt(item.id, entry);
      entries.push({ id: item.id, fee: fromCents(fee), entryFee: fromCents(entry), cut: fromCents(fee - entry), bill: { selectedIds: bill.ids, total: fromCents(bill.total) } });
    }
  }
  return { status: 'ready', method: 'exact-single-fee', booked, entries,
    interpretation: 'One fee moves while every other fee stays fixed. Each figure is the exact point where the optimizer’s choice changes.' };
}

// A plan is still served if its analysis cannot be computed; the page then omits it.
export function analyzeDecision(snapshot) {
  try { return { robustness: feeRobustness(snapshot), flips: flipPoints(snapshot) }; }
  catch { return { robustness: { status: 'unavailable' }, flips: { status: 'unavailable' } }; }
}
