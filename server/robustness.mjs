// How solid is a bill? Exact checks on a saved decision, with no provider calls.
//
// 1. Fee robustness: every fee is redrawn (seeded, so a plan always reports the same figure)
//    and the optimizer's choice is recomputed for each draw. Buyer-entered fees move within
//    ±20%. Fees estimated from Qloo popularity move across their own tier, because the tier is
//    where the uncertainty is. The most robust bookable bill is reported when it differs.
// 2. Flip points: one act's fee moves while every other fee stays fixed. For a booked act,
//    the highest fee at which the bill still stands and what replaces it above that; for an
//    unbooked act, the fee at which it would enter the bill and the bill it would bring.
// 3. Budget ladder: every budget at which the decision changes, with the bill at each step.
// 4. Affinity noise: Qloo's affinities are perturbed within the near-tie band and turned into
//    fit by the same scaling that produced the saved fits. Each booked act reports how often
//    it survives, and which act replaces it when it does not.
//
// The fee checks rest on one property of the optimizer: a bill's score does not depend on
// fees. Fees only decide which bills fit the budget, so the slates are enumerated once and
// each fee scenario reprices them. The affinity check uses the other half of that property:
// fit enters the score as one additive term. Either way the result equals rerunning
// optimizeSlate on the changed inputs, which the unit tests check draw by draw. Festival
// policy scores replacement coverage, which depends on fees, so it is not covered.
import { enumerateSlates, optimizeSlate } from './optimizer.mjs';
import { affinityScores, scaleAffinity, TIE_BAND } from './affinity.mjs';
import { tierRange } from './fee-tiers.mjs';

const EPSILON = 1e-9, DRAWS = 500, SPREAD = 0.2, SEED = 23, AFFINITY_SEED = 29;
const toCents = value => Math.round((value + Number.EPSILON) * 100);
const fromCents = cents => cents / 100;
const keyOf = ids => [...ids].sort().join('\u0000');
const isFee = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);

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
    .map(row => ({ ids: row.selectedIds, key: keyOf(row.selectedIds), score: row.rawScore, fitPart: row.rawBreakdown.fit,
      total: row.selectedIds.reduce((sum, id) => sum + fees.get(id), 0) }))
    .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { status: 'ready', items, constraints, baseline, fees, rows, budget: toCents(constraints.budget) };
}

// The optimizer's order: highest score, then lowest total, then the lexicographic ID key
// (the same order as compareResults).
const better = (score, total, key, best) => !best || score - best.score > EPSILON ||
  (Math.abs(score - best.score) <= EPSILON && (total < best.total || (total === best.total && key < best.key)));

// The optimizer's choice under one fee table. Rows are sorted by score, so the scan stops at
// the first score below an affordable bill's.
function choose(rows, feeOf, budget) {
  let best = null;
  for (const row of rows) {
    if (best && best.score - row.score > EPSILON) break;
    let total = 0;
    for (const id of row.ids) total += feeOf(id);
    if (total > budget) continue;
    if (better(row.score, total, row.key, best)) best = { ids: row.ids, key: row.key, score: row.score, total };
  }
  return best;
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

/** How each fee is redrawn: uniform within ±spread, or log-uniform across its popularity tier
 * when the fees were estimated from Qloo popularity. One uniform draw per fee, in ID order. */
export function feeModel(snapshot, { spread = SPREAD, feeBasis = null } = {}) {
  const tiers = feeBasis === 'estimated-from-qloo-popularity', ranges = new Map();
  for (const item of snapshot?.memo?.items ?? []) {
    if (!isFee(item.terms?.fee)) continue;
    const range = tiers ? tierRange(item.terms.fee) : null;
    ranges.set(item.id, range ? { kind: 'tier', low: range[0], high: range[1] } : { kind: 'uniform', low: 1 - spread, high: 1 + spread });
  }
  return { name: tiers ? 'popularity-tiers' : 'uniform', spread, ranges };
}
export function drawFee(cents, range, u) {
  return range.kind === 'tier' ? Math.round(cents * range.low * (range.high / range.low) ** u) : Math.round(cents * (range.low + (range.high - range.low) * u));
}

export function feeRobustness(snapshot, { draws = DRAWS, spread = SPREAD, seed = SEED, feeBasis = null } = {}) {
  const ctx = prepare(snapshot);
  if (ctx.status !== 'ready') return { status: ctx.status, reason: ctx.reason };
  const { rows, fees, budget, baseline } = ctx, random = seededRandom(seed), ids = [...fees.keys()].sort();
  const model = feeModel(snapshot, { spread, feeBasis });
  const baseKey = baseline.feasible ? keyOf(baseline.selectedIds) : null;
  const tally = new Map();
  let holds = 0, none = 0;
  for (let draw = 0; draw < draws; draw++) {
    const drawn = new Map(ids.map(id => [id, drawFee(fees.get(id), model.ranges.get(id), random())]));
    const winner = choose(rows, id => drawn.get(id), budget);
    if (!winner) { none++; continue; }
    if (winner.key === baseKey) { holds++; continue; }
    const entry = tally.get(winner.key) ?? { selectedIds: winner.ids, key: winner.key, count: 0, totals: [] };
    entry.count++; entry.totals.push(winner.total); tally.set(winner.key, entry);
  }
  const ranked = [...tally.values()].sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const alternatives = ranked.slice(0, 3).map(entry => ({ selectedIds: entry.selectedIds, draws: entry.count, share: entry.count / draws,
    medianTotal: fromCents(entry.totals.sort((a, b) => a - b)[Math.floor(entry.totals.length / 2)]) }));
  // A safer pick: the bill that wins more scenarios than the chosen one and can be booked at
  // today's fees. It is advisory; its score cost against the chosen bill is reported with it.
  let safer = null;
  if (baseline.feasible) {
    const byKey = new Map(rows.map(row => [row.key, row])), chosen = byKey.get(baseKey);
    const entry = ranked.find(item => item.count > holds && byKey.get(item.key).total <= budget);
    if (entry && chosen) {
      const row = byKey.get(entry.key);
      safer = { selectedIds: row.ids, draws: entry.count, share: entry.count / draws, total: fromCents(row.total), scoreGap: chosen.score - row.score };
    }
  }
  const tierText = 'Fees estimated from Qloo popularity move across their tier (from the geometric midpoint with the tier below to the one above); any other fee moves within ±' + Math.round(spread * 100) + '%.';
  return { status: baseline.feasible ? 'ready' : 'no-bill', method: 'exact-reprice', draws, spread, seed, feeModel: model.name,
    holds, share: baseline.feasible ? holds / draws : null, noBill: none, otherBills: tally.size, alternatives, safer,
    interpretation: `${model.name === 'popularity-tiers' ? tierText : `Every fee is redrawn independently within ±${Math.round(spread * 100)}%.`} The exact optimizer chooses again for each draw. Fees are illustrative; this measures how close the decision is, not ticket demand.` };
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

/** Every budget at which the optimizer's choice changes, at today's fees. Between two steps the
 * bill stays the same; below the first step no bill fits. Budget only decides which bills fit,
 * so the winner at a budget is the best bill whose total is within it. */
export function budgetLadder(snapshot) {
  const ctx = prepare(snapshot);
  if (ctx.status !== 'ready') return { status: ctx.status, reason: ctx.reason };
  const byTotal = [...ctx.rows].sort((a, b) => a.total - b.total);
  const steps = [];
  let best = null;
  for (let i = 0; i < byTotal.length;) {
    const total = byTotal[i].total;
    for (; i < byTotal.length && byTotal[i].total === total; i++) {
      const row = byTotal[i];
      if (better(row.score, row.total, row.key, best)) best = row;
    }
    if (!steps.length || steps.at(-1).key !== best.key) steps.push({ key: best.key, budget: fromCents(total), selectedIds: best.ids, total: fromCents(best.total), score: best.score });
  }
  return { status: 'ready', method: 'exact-budget-breakpoints', current: fromCents(ctx.budget),
    steps: steps.map(({ key, ...step }) => step),
    interpretation: 'At today’s fees, the bill changes only at these budgets. Each step is the smallest budget at which that bill is the optimizer’s choice.' };
}

// Fit from affinity through each scaling the project has used. The saved fits say which one
// produced them; the noise check only runs through a scaling that reproduces them exactly.
function fitsFor(ids, scores, scale, order) {
  if (scale === 'ordinal') {
    const sorted = [...ids].sort((a, b) => scores.get(b) - scores.get(a) || order.get(a) - order.get(b));
    return new Map(sorted.map((id, i) => [id, sorted.length > 1 ? 1 - i / (sorted.length - 1) : .5]));
  }
  const scaled = scaleAffinity(ids.map(id => scores.get(id)), scale);
  return new Map(ids.map(id => [id, scaled.fit(scores.get(id))]));
}
export function affinityScaling(snapshot) {
  const items = snapshot?.memo?.items ?? [], ranked = items.filter(item => item.evidence?.rank === true && finite(item.fit));
  if (ranked.length < 2) return null;
  const { scores: fromReceipt } = affinityScores(items, snapshot.receipts ?? []);
  const scores = new Map(ranked.map(item => [item.id, finite(item.affinity) ? item.affinity : fromReceipt.get(item.id)]));
  if (![...scores.values()].every(finite)) return null;
  // Ties in affinity keep the order of the saved fits, as Qloo's returned order did.
  const order = new Map([...ranked].sort((a, b) => b.fit - a.fit).map((item, i) => [item.id, i])), ids = ranked.map(item => item.id);
  for (const scale of ['fixed-span', 'min-max', 'ordinal']) {
    const fits = fitsFor(ids, scores, scale, order);
    if (ranked.every(item => Math.abs(fits.get(item.id) - item.fit) < 1e-9)) return { scale, ids, scores, order };
  }
  return null;
}

export function affinityRobustness(snapshot, { draws = DRAWS, band = TIE_BAND, seed = AFFINITY_SEED } = {}) {
  const ctx = prepare(snapshot);
  if (ctx.status !== 'ready') return { status: ctx.status, reason: ctx.reason };
  const { rows, budget, baseline, constraints } = ctx;
  if (!baseline.feasible) return { status: 'no-bill' };
  if (constraints.minimumAverageFit != null) return { status: 'unsupported', reason: 'A fit floor makes bookability depend on fit.' };
  const scaling = affinityScaling(snapshot);
  if (!scaling) return { status: 'unsupported', reason: 'No complete Qloo affinity ranking reproduces the saved fits.' };
  const items = new Map(snapshot.memo.items.map(item => [item.id, item])), weight = baseline.policy.weights.fit, slots = Math.max(1, constraints.slots);
  // Only bills that fit today's budget compete; fees do not move in this check.
  const affordable = rows.filter(row => row.total <= budget).map(row => ({ ...row, rest: row.score - row.fitPart }));
  const random = seededRandom(seed), baseKey = keyOf(baseline.selectedIds), half = band / 2;
  const kept = new Map(baseline.selectedIds.map(id => [id, 0])), replacements = new Map(baseline.selectedIds.map(id => [id, new Map()]));
  let holds = 0;
  for (let draw = 0; draw < draws; draw++) {
    const scores = new Map(scaling.ids.map(id => [id, scaling.scores.get(id) + (2 * random() - 1) * half]));
    const fits = fitsFor(scaling.ids, scores, scaling.scale, scaling.order);
    const fitOf = id => fits.get(id) ?? items.get(id).fit ?? 0;
    let best = null;
    for (const row of affordable) {
      let sum = 0;
      for (const id of row.ids) sum += fitOf(id);
      const score = row.rest + sum * weight / slots;
      if (better(score, row.total, row.key, best)) best = { ids: row.ids, key: row.key, score, total: row.total };
    }
    if (best.key === baseKey) holds++;
    const added = best.ids.filter(id => !baseline.selectedIds.includes(id));
    for (const id of baseline.selectedIds) {
      if (best.ids.includes(id)) { kept.set(id, kept.get(id) + 1); continue; }
      for (const other of added) replacements.get(id).set(other, (replacements.get(id).get(other) ?? 0) + 1);
    }
  }
  const acts = baseline.selectedIds.map(id => {
    const share = kept.get(id) / draws, rival = [...replacements.get(id)].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    return { id, share, affinity: scaling.scores.get(id) ?? null, verdict: share >= .9 ? 'clear' : share >= .6 ? 'likely' : 'coin-flip',
      rival: rival ? { id: rival[0], draws: rival[1], affinity: scaling.scores.get(rival[0]) ?? null } : null };
  });
  return { status: 'ready', method: 'exact-rescore', draws, band, seed, scale: scaling.scale, holds, share: holds / draws, acts,
    interpretation: `Each Qloo affinity moves independently by up to ±${half.toFixed(3)} (half the ${band} near-tie band) and becomes fit through the same ${scaling.scale} scaling as the saved plan. Fees stay fixed. This shows which picks Qloo’s scores separate clearly; it is not a confidence interval for Qloo.` };
}

// A plan is still served if its analysis cannot be computed; the page then omits it.
export function analyzeDecision(snapshot, { feeBasis = null } = {}) {
  const safe = fn => { try { return fn(); } catch { return { status: 'unavailable' }; } };
  return { robustness: safe(() => feeRobustness(snapshot, { feeBasis })), flips: safe(() => flipPoints(snapshot)),
    ladder: safe(() => budgetLadder(snapshot)), affinity: safe(() => affinityRobustness(snapshot)) };
}
