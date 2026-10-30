// When a booked act drops out, the saved pool may not hold the best replacement. This asks Qloo
// again: who else do these fans love, now that the rest of the bill is fixed? It discovers new
// acts, ranks them against the remaining pool for the same audience, and the exact optimizer
// rebooks with the surviving acts locked. Nothing here changes the saved plan.
import { optimizeSlate } from './optimizer.mjs';
import { fitsFromRankRows } from './affinity.mjs';
import { estimateFee } from './fee-tiers.mjs';
import { nameOf, idOf } from './shape.mjs';

export const REPLAN_CALLS = 2;
// Qloo ranks at most ten options in one call.
export const MAX_OPTIONS = 10;
const MAX_NEW = 4, MIN_NEW = 2, low = value => String(value ?? '').toLowerCase().trim();
const fault = (message, status = 400) => Object.assign(new Error(message), { status });
const usable = env => ['ok', 'partial', 'degraded'].includes(env.status);
export const REPLAN_NOTE = 'A fresh Qloo run for this cancellation. New acts have fees estimated from Qloo popularity tiers and assumed availability, and no location or trend checks yet. The saved plan is unchanged.';

export async function buildReplan(record, cancelId, run, { budget = record.snapshot.memo.constraints.budget, checkActs = null } = {}) {
  const snapshot = record.snapshot, memo = snapshot.memo, slate = memo.slate, city = memo.input.city;
  if (!slate?.feasible || !slate.selectedIds.includes(cancelId)) throw fault('Choose an act on the booked bill.');
  const survivors = slate.selectedIds.filter(id => id !== cancelId), pool = memo.items.filter(item => item.id !== cancelId);
  const cancelled = memo.items.find(item => item.id === cancelId);
  // The same audience: the anchor artists' Qloo identities from the plan's own receipts.
  const anchors = (memo.input.anchors ?? []).map(low);
  const anchorIds = [...new Set(snapshot.receipts.filter(receipt => receipt.tool === 'describe').flatMap(receipt => receipt.evidence?.rows ?? [])
    .filter(row => row.id && anchors.includes(low(row.name))).map(row => row.id))];
  const signals = [...new Set([...anchorIds, ...survivors])];
  if (!anchorIds.length) throw fault('This plan has no saved Qloo identities to research from.', 409);

  const names = memo.items.map(item => item.name);
  const found = await run.call('recommend', { target_type: 'artist', signals, signal_location: city, limit: 12 },
    `Find a replacement for ${cancelled?.name ?? 'the cancelled act'} that fits the rest of the bill in ${city}`);
  if (!usable(found.env)) throw fault('Qloo could not search for a replacement just now. The plan is unchanged.', 502);
  const known = new Set([...memo.items.flatMap(item => [low(item.id), low(item.name)]), ...anchors, ...anchorIds.map(low)]);
  // Room for new acts, keeping the surviving acts and the best-ranked of the rest of the pool.
  const room = Math.max(MIN_NEW, Math.min(MAX_NEW, MAX_OPTIONS - pool.length)), fresh = [];
  const unseen = found.env.results.map(nameOf).filter(name => name && !known.has(low(name)));
  const acts = checkActs ? await checkActs(unseen) : null, ended = [];
  for (const row of found.env.results) {
    const id = idOf(row), name = nameOf(row), tier = estimateFee(typeof row?.popularity === 'number' ? row.popularity : row?.query?.popularity);
    const fee = tier == null ? null : Math.round(tier * (record.fx?.rate ?? 1));
    if (!id || !name || fee == null || known.has(low(id)) || known.has(low(name)) || fresh.length >= room) continue;
    known.add(low(id)); known.add(low(name));
    if (acts?.get(name)?.status === 'ended') { ended.push(name); continue; }
    fresh.push({ id, name, found: true, terms: { fee, available: true, genre: '' }, local: 'no data', momentum: 'unknown', isNew: true,
      evidence: { rank: false, local: false, comparison: false, trends: false }, receipts: [found.receipt.id] });
  }
  const others = pool.filter(item => !survivors.includes(item.id)).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const kept = [...pool.filter(item => survivors.includes(item.id)), ...others].slice(0, MAX_OPTIONS - fresh.length);
  const candidates = [...kept.map(item => ({ ...item })), ...fresh], ids = candidates.map(item => item.id);
  // Ranked for the plan's own audience: Qloo leaves a signal out of its own ranking, so the
  // surviving acts search with the audience but are ranked for it, like every other candidate.
  const ranked = await run.call('rank', { options: ids, option_type: 'artist', signals: anchorIds, signal_location: city },
    `Rank the remaining pool and ${fresh.length} newly found ${fresh.length === 1 ? 'act' : 'acts'} for the same audience`);
  const rows = ranked.receipt.evidence?.rows ?? [], byKey = new Map(candidates.flatMap(item => [[low(item.id), item.id], [low(item.name), item.id]]));
  const order = [...new Set(rows.map(row => byKey.get(low(row.id)) ?? byKey.get(low(row.name))).filter(Boolean))];
  if (!usable(ranked.env) || order.length !== ids.length) throw fault('Qloo could not rank every candidate, so no replacement is claimed. The plan is unchanged.', 502);
  const scored = fitsFromRankRows(order, rows.map(row => ({ ...row, id: byKey.get(low(row.id)) ?? byKey.get(low(row.name)) })));
  const items = candidates.map(item => ({ ...item, fit: scored.fits.get(item.id), affinity: scored.scores.get(item.id), rank: order.indexOf(item.id) + 1, of: order.length,
    rankCoverage: { complete: true, returned: order.length, requested: order.length }, evidence: { ...item.evidence, rank: true } }));
  const result = optimizeSlate(items, { ...memo.constraints, budget, lockedIds: survivors, excludedIds: [] });
  if (result.status === 'invalid') throw fault(result.reasons.join(' '));
  const describe = id => { const item = items.find(entry => entry.id === id); return { id, name: item.name, fee: item.terms.fee, isNew: item.isNew === true, rank: item.rank, of: item.of, ...(typeof item.affinity === 'number' ? { affinity: item.affinity } : {}) }; };
  return { version: '1.0', cancelId, budget, ...(ended.length ? { endedActs: ended } : {}), cancelledName: cancelled?.name ?? cancelId, survivorIds: survivors, feasible: result.feasible, reasons: result.reasons ?? [],
    acts: result.feasible ? result.selectedIds.map(describe) : [], totalFee: result.feasible ? result.totalFee : null, checkedCount: result.checkedCount, feasibleCount: result.feasibleCount,
    newCount: fresh.length, poolNames: names, note: REPLAN_NOTE, createdAt: new Date().toISOString(), mock: run.mode === 'mock', rankReceiptId: ranked.receipt.id, foundReceiptId: found.receipt.id,
    receipts: run.receipts.map(r => ({ id: r.id, tool: r.tool, args: r.args, status: r.status, count: r.count, cached: r.cached, source: r.source, fetchedAt: r.fetchedAt, digest: r.digest, evidence: r.evidence })) };
}
