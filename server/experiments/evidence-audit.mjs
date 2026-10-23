import { evidenceDependencies } from '../decision-proof.mjs';
import { GROUPS } from './experiment-schema.mjs';

export function auditEvidence(snapshot, asOf, maxAgeDays = 90) {
  const receipts = snapshot.receipts ?? [], byId = new Map(receipts.map(row => [row.id, row]));
  const end = Date.parse(asOf);
  const observations = snapshot.memo.items.flatMap(item => GROUPS.map(group => {
    const dependency = evidenceDependencies(snapshot, item)[group];
    const matched = dependency.receiptIds.map(id => byId.get(id)).filter(Boolean);
    const flags = [];
    if (item.evidence?.[group] === true && !dependency.receiptIds.length) flags.push('unsupported');
    if (dependency.mapping === 'ambiguous') flags.push('ambiguous');
    if (dependency.receiptIds.some(id => !byId.has(id))) flags.push('missing_receipt');
    if (matched.some(receipt => !['ok', 'partial', 'degraded'].includes(receipt.status))) flags.push('unusable_receipt');
    if (matched.some(receipt => !Number.isFinite(Date.parse(receipt.fetchedAt)))) flags.push('missing_timestamp');
    if (matched.some(receipt => Number.isFinite(Date.parse(receipt.fetchedAt)) && end - Date.parse(receipt.fetchedAt) > maxAgeDays * 864e5)) flags.push('stale');
    if (group === 'rank' && item.evidence?.rank === true && item.rankCoverage?.complete === false) flags.push('incomplete_pool');
    if (item.evidence?.[group] !== true) flags.push('not_observed');
    return { candidateId: item.id, group, supported: item.evidence?.[group] === true, receiptIds: dependency.receiptIds,
      mapping: dependency.mapping, flags, fetchedAt: matched.map(receipt => receipt.fetchedAt ?? null) };
  }));
  const flagged = observations.filter(row => row.flags.some(flag => flag !== 'not_observed'));
  return { asOf, maxAgeDays, observations, counts: { observations: observations.length,
    supported: observations.filter(row => row.supported).length, flagged: flagged.length,
    stale: flagged.filter(row => row.flags.includes('stale')).length,
    ambiguous: flagged.filter(row => row.flags.includes('ambiguous')).length,
    unsupported: flagged.filter(row => row.flags.includes('unsupported')).length },
    receiptIndex: receipts.map(receipt => ({ id: receipt.id, tool: receipt.tool, source: receipt.source,
      status: receipt.status, fetchedAt: receipt.fetchedAt ?? null,
      digest: receipt.digest ?? receipt.originalDigest ?? null })) };
}
