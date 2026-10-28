// @ts-check
// Qloo affinity scores, near-tie bands and rank comparability.
//
// Qloo's rank tool returns an affinity score for every ranked entity. Ordinal
// positions turn a 0.0001 affinity gap into a full rank step, so fit is derived
// from the scores themselves wherever every ranked candidate has one.
//
// Scaling: fit = 1 − (top score − score) / span, with span = max(pool range,
// AFFINITY_SPAN). Min-max scaling would stretch a tight pool (say a 0.03 range)
// over the whole 0–1 fit scale and exaggerate tiny score differences; a fixed
// floor on the span keeps a small gap small. Only pools wider than the span use
// their own range. Ordinal position is the fallback when scores are missing.
import { optimizeSlate } from './optimizer.mjs';

// Declared, not estimated: two candidates whose Qloo affinity scores differ by
// less than this are a near-tie, and the decision is re-checked with them equal.
// Qloo publishes no score uncertainty; repeated live captures returned identical
// scores, so the band is a decision-sensitivity threshold, not a noise estimate.
export const TIE_BAND = 0.002;
// Declared reference span: an affinity gap of 0.05 moves fit across the whole
// scale. It is near the widest spread in the published pools (0.019–0.057).
export const AFFINITY_SPAN = 0.05;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const bookable = item => item.terms?.available === true && finite(item.terms?.fee) && item.terms.fee >= 0;
const key = ids => [...ids].sort().join('\0');

/** The rank receipt the pool's rank evidence cites, and its affinity per candidate. */
export function affinityScores(items, receipts = []) {
  const counts = new Map();
  for (const item of items) for (const id of item.evidenceReceipts?.rank ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  const receiptId = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const receipt = receipts.find(row => row.id === receiptId);
  const scores = new Map((receipt?.evidence?.rows ?? []).filter(row => row.id && finite(row.affinity)).map(row => [row.id, row.affinity]));
  return { receiptId, scores };
}

// scale 'fixed-span' is current; 'min-max' reproduces records made before it.
export function scaleAffinity(values, scale = 'fixed-span') {
  const high = Math.max(...values), low = Math.min(...values), span = scale === 'min-max' ? high - low : Math.max(high - low, AFFINITY_SPAN);
  if (!(span > 0)) return { span, low, high, fit: () => .5 };
  // The legacy formula is kept verbatim so replays reproduce digests bit for bit.
  if (scale === 'min-max') return { span, low, high, fit: value => (value - low) / (high - low) };
  return { span, low, high, fit: value => Math.max(0, Math.min(1, 1 - (high - value) / span)) };
}

/**
 * Items with fit taken from Qloo affinity when every ranked candidate has a
 * score in the cited rank receipt; otherwise unchanged (ordinal fallback).
 */
export function withAffinityFit(items, receipts = [], { scale = 'fixed-span' } = {}) {
  const ranked = items.filter(item => item.evidence?.rank === true && finite(item.fit));
  const { receiptId, scores } = affinityScores(items, receipts);
  if (ranked.length < 2 || !ranked.every(item => scores.has(item.id)))
    return { items: items.map(item => ({ ...item, fitBasis: item.evidence?.rank ? 'ordinal-rank' : null })), basis: ranked.length ? 'ordinal-rank' : 'none', receiptId };
  const scaled = scaleAffinity(ranked.map(item => scores.get(item.id)), scale);
  return { basis: 'qloo-affinity', receiptId, range: { low: scaled.low, high: scaled.high, span: scaled.span },
    items: items.map(item => item.evidence?.rank === true && scores.has(item.id)
      ? { ...item, affinity: scores.get(item.id), fit: scaled.fit(scores.get(item.id)), fitBasis: 'qloo-affinity' }
      : { ...item, fitBasis: null }) };
}

/** Fit for an ordered rank response: affinity-based when every row has a score. */
export function fitsFromRankRows(order, rows, { scale = 'fixed-span' } = {}) {
  const scores = new Map((rows ?? []).filter(row => row.id && finite(row.affinity)).map(row => [row.id, row.affinity]));
  if (order.length > 1 && order.every(id => scores.has(id))) {
    const scaled = scaleAffinity(order.map(id => scores.get(id)), scale);
    return { basis: 'qloo-affinity', fits: new Map(order.map(id => [id, scaled.fit(scores.get(id))])), scores };
  }
  return { basis: 'ordinal-rank', fits: new Map(order.map((id, index) => [id, order.length > 1 ? 1 - index / (order.length - 1) : .5])), scores };
}

/** Pool-relative verdicts for new memos; never alters fit or optimizer inputs.
 * Adjacent near-ties form conservative label components: a chain may span more
 * than TIE_BAND, but no pair inside the band gets contradictory verdicts.
 * This does not change the optimizer's pairwise, non-chained sensitivity tests.
 */
export function relativeVerdicts(items) {
  const verdicts = new Map(items.map(item => [item.id, 'hold']));
  const ranked = items.filter(item => item.evidence?.rank === true && finite(item.fit))
    .sort((a, b) => b.fit - a.fit || String(a.id).localeCompare(String(b.id)));
  if (ranked.length < 2) return verdicts;
  const affinity = ranked.every(item => finite(item.affinity));
  const value = item => affinity ? item.affinity : item.fit;
  const groups = [];
  for (const item of ranked) {
    const group = groups.at(-1), previous = group?.at(-1);
    if (previous && (affinity ? Math.abs(value(previous) - value(item)) < TIE_BAND : value(previous) === value(item))) group.push(item);
    else groups.push([item]);
  }
  // An indistinguishable pool supports no relative endorsement.
  if (groups.length === 1) return verdicts;
  const high = value(ranked[0]), low = value(ranked.at(-1));
  if (!(high > low)) return verdicts;
  const labels = ['lean pass', 'hold', 'growth bet', 'lean yes'];
  let ceiling = 3;
  for (const group of groups) {
    const relative = (group.reduce((sum, item) => sum + value(item), 0) / group.length - low) / (high - low);
    let level = relative >= .6 ? 3 : relative >= .3 ? (group.every(item => item.found === true) ? 2 : 1) : 0;
    if (level === 3 && group.some(item => item.momentum === 'cooling')) level = 1;
    ceiling = Math.min(ceiling, level);
    for (const item of group) verdicts.set(item.id, labels[ceiling]);
  }
  return verdicts;
}

/**
 * Near-ties are pairs whose scores differ by less than the band. Pairs are not
 * chained, so no reported tie ever spans more than the band.
 */
export function nearTieGroups(items, band = TIE_BAND) {
  const scored = items.filter(item => finite(item.affinity)).sort((a, b) => b.affinity - a.affinity || String(a.id).localeCompare(String(b.id)));
  const pairs = [];
  for (let i = 0; i < scored.length; i++) for (let j = i + 1; j < scored.length && scored[i].affinity - scored[j].affinity < band; j++)
    pairs.push({ ids: [scored[i].id, scored[j].id], names: [scored[i].name, scored[j].name], spread: scored[i].affinity - scored[j].affinity, scores: [scored[i].affinity, scored[j].affinity] });
  return pairs;
}

/**
 * Re-optimizes with each near-tie pair given equal fit (the pair mean). A
 * recommendation "rests on a near-tie" when that changes the selected bill.
 */
export function tieSensitivity(items, constraints, band = TIE_BAND) {
  const base = optimizeSlate(items, constraints), groups = nearTieGroups(items, band);
  const checked = groups.map(group => {
    const members = new Set(group.ids), mean = group.ids.reduce((sum, id) => sum + items.find(item => item.id === id).fit, 0) / group.ids.length;
    const result = optimizeSlate(items.map(item => members.has(item.id) ? { ...item, fit: mean } : item), constraints);
    return { ...group, affectsBill: group.ids.some(id => base.selectedIds.includes(id)), changesBill: result.feasible && key(result.selectedIds) !== key(base.selectedIds), tiedSelectedIds: result.selectedIds };
  });
  return { band, groups: checked, restsOnNearTie: checked.some(group => group.changesBill) };
}

/**
 * A booking comparison is supported only when every bookable act has a
 * comparable Qloo rank from one complete query of the pool.
 */
export function rankComparability(items) {
  const candidates = items.filter(bookable).length ? items.filter(bookable) : items;
  const coverage = items.map(item => item.rankCoverage).find(Boolean);
  const unranked = candidates.filter(item => item.evidence?.rank !== true || !finite(item.fit));
  if (!unranked.length && coverage?.complete !== false) return { comparable: true, reason: null, returned: coverage?.returned ?? null, requested: coverage?.requested ?? null };
  return { comparable: false, returned: coverage?.returned ?? null, requested: coverage?.requested ?? null, unrankedIds: unranked.map(item => item.id),
    reason: `Qloo ranked ${coverage?.returned ?? '?'} of ${coverage?.requested ?? '?'} candidates, so ${unranked.length === candidates.length ? 'no bookable act has' : `${unranked.map(item => item.name).join(', ')} ${unranked.length === 1 ? 'has' : 'have'}`} a comparable audience rank. Cross-case and method comparisons exclude this brief.` };
}
