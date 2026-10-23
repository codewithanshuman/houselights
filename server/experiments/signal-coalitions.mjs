import { optimizeSlate } from '../optimizer.mjs';
import { evidenceDependencies, stripEvidence } from '../decision-proof.mjs';
import { GROUPS } from './experiment-schema.mjs';

const short = result => ({ selectedIds: result.selectedIds, feasible: result.feasible, status: result.status,
  totalFee: result.totalFee, score: result.score, violations: result.violations ?? result.reasons ?? [],
  confidence: result.confidence });

export function runCoalitions(snapshot, constraints) {
  const items = snapshot.memo.items;
  const links = new Map(items.map(item => [item.id, evidenceDependencies(snapshot, item)]));
  const coalitions = [];
  for (let mask = 0; mask < 16; mask++) {
    const enabled = GROUPS.filter((_, index) => mask & (1 << index));
    let input = items;
    for (const group of GROUPS.filter(group => !enabled.includes(group))) input = stripEvidence(input, links, group);
    const result = optimizeSlate(input, constraints);
    coalitions.push({ mask, enabled, disabled: GROUPS.filter(group => !enabled.includes(group)),
      retainedEvidence: enabled.length / 4, ...short(result) });
  }
  const receiptIds = [...new Set(items.flatMap(item => {
    const dependencies = links.get(item.id);
    return [...GROUPS.flatMap(group => dependencies[group].mapping === 'linked' ? dependencies[group].receiptIds : []),
      ...(item.culturalLinks ?? []).map(link => link.receiptId)];
  }).filter(Boolean))].filter(id => snapshot.receipts?.some(receipt => receipt.id === id));
  const receipts = receiptIds.slice(0, 64).map(id => {
    const input = stripEvidence(items, links, null, id);
    const affectedIds = items.filter((item, index) => JSON.stringify(item.evidence) !== JSON.stringify(input[index].evidence) ||
      JSON.stringify(item.culturalLinks ?? []) !== JSON.stringify(input[index].culturalLinks)).map(item => item.id);
    return { receiptId: id, affectedIds, ...short(optimizeSlate(input, constraints)) };
  });
  return { coalitions, receipts, receiptCoverage: { eligible: receiptIds.length, tested: receipts.length,
    omitted: receiptIds.length - receipts.length }, dependencies: Object.fromEntries(links) };
}

export function exactSignalContributions(coalitions) {
  const byMask = new Map(coalitions.map(row => [row.mask, row]));
  if (coalitions.length !== 16 || coalitions.some(row => !row.feasible || !Number.isFinite(row.diagnosticScore)))
    return { status: 'unavailable', reason: 'Every coalition needs a feasible selection and a frozen-reference diagnostic score.' };
  const factorial = [1, 1, 2, 6, 24];
  const groups = GROUPS.map((group, index) => {
    let value = 0;
    for (let mask = 0; mask < 16; mask++) {
      if (mask & (1 << index)) continue;
      const size = mask.toString(2).replaceAll('0', '').length;
      value += factorial[size] * factorial[3 - size] / factorial[4] *
        (byMask.get(mask | (1 << index)).diagnosticScore - byMask.get(mask).diagnosticScore);
    }
    return { group, contribution: Math.round(value * 1e6) / 1e6 };
  });
  return { status: 'computed', metric: 'Full-evidence policy score of each coalition-selected lineup, evaluated after selection on the frozen full-evidence candidate pool.',
    scope: 'Internal decision attribution only; not causal cultural impact, audience preference, attendance or sales uplift.',
    noSignalValue: byMask.get(0).diagnosticScore, fullValue: byMask.get(15).diagnosticScore, groups };
}
