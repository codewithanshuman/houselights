// Qloo affinity scores, near-tie bands and rank comparability.
//
// Qloo's rank tool returns an affinity score for every ranked entity. Ordinal
// positions turn a 0.0001 affinity gap into a full rank step, so fit is derived
// from the scores themselves wherever every ranked candidate has one:
// fit = (affinity − lowest) / (highest − lowest) across the ranked pool, which is
// the optimizer's declared "0–1 relative affinity index". Ordinal position is the
// fallback only when scores are missing.
import { optimizeSlate } from './optimizer.mjs';

// Declared, not estimated: two candidates whose Qloo affinity scores differ by
// less than this are a near-tie, and the decision is re-checked with them equal.
// Qloo publishes no score uncertainty; repeated live captures returned identical
// scores, so the band is a decision-sensitivity threshold, not a noise estimate.
export const TIE_BAND = 0.002;
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

/**
 * Items with fit taken from Qloo affinity when every ranked candidate has a
 * score in the cited rank receipt; otherwise unchanged (ordinal fallback).
 */
export function withAffinityFit(items, receipts = []) {
  const ranked = items.filter(item => item.evidence?.rank === true && finite(item.fit));
  const { receiptId, scores } = affinityScores(items, receipts);
  if (ranked.length < 2 || !ranked.every(item => scores.has(item.id)))
    return { items: items.map(item => ({ ...item, fitBasis: item.evidence?.rank ? 'ordinal-rank' : null })), basis: ranked.length ? 'ordinal-rank' : 'none', receiptId };
  const values = ranked.map(item => scores.get(item.id)), low = Math.min(...values), high = Math.max(...values);
  return { basis: 'qloo-affinity', receiptId, range: { low, high },
    items: items.map(item => item.evidence?.rank === true && scores.has(item.id)
      ? { ...item, affinity: scores.get(item.id), fit: high > low ? (scores.get(item.id) - low) / (high - low) : .5, fitBasis: 'qloo-affinity' }
      : { ...item, fitBasis: null }) };
}

/** Fit for an ordered rank response: affinity-based when every row has a score. */
export function fitsFromRankRows(order, rows) {
  const scores = new Map((rows ?? []).filter(row => row.id && finite(row.affinity)).map(row => [row.id, row.affinity]));
  if (order.length > 1 && order.every(id => scores.has(id))) {
    const values = order.map(id => scores.get(id)), low = Math.min(...values), high = Math.max(...values);
    return { basis: 'qloo-affinity', fits: new Map(order.map(id => [id, high > low ? (scores.get(id) - low) / (high - low) : .5])), scores };
  }
  return { basis: 'ordinal-rank', fits: new Map(order.map((id, index) => [id, order.length > 1 ? 1 - index / (order.length - 1) : .5])), scores };
}

/** Groups of candidates whose consecutive affinity scores are within the band. */
export function nearTieGroups(items, band = TIE_BAND) {
  const scored = items.filter(item => finite(item.affinity)).sort((a, b) => b.affinity - a.affinity);
  const groups = [];
  let current = [];
  for (const item of scored) {
    if (current.length && current.at(-1).affinity - item.affinity < band) current.push(item);
    else { if (current.length > 1) groups.push(current); current = [item]; }
  }
  if (current.length > 1) groups.push(current);
  return groups.map(group => ({ ids: group.map(item => item.id), names: group.map(item => item.name), spread: group[0].affinity - group.at(-1).affinity,
    scores: group.map(item => item.affinity) }));
}

/**
 * Re-optimizes with each near-tie group given equal fit (the group mean). A
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
