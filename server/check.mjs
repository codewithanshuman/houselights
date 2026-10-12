// Number checker: model prose may only state facts that exist in the evidence ledger.
// Per sentence: unknown numbers, unknown receipt ids and forecast language are removed (and reported).
const FORBID = /\b(sell[- ]?outs?|tickets?|revenue|attendance|will (sell|draw|fill)|guarantee[sd]?|forecast(s|ed)?|predict(s|ed|ion)?)\b/i;
export function check(text, items, extra, receiptIds) {
  const ok = new Set(items.flatMap(i => [i.rank, i.of, i.netNew == null ? null : Math.round(i.netNew * 100)]).filter(v => v != null).map(String));
  for (const t of [...extra, ...items.map(i => i.name)]) for (const m of String(t).match(/\d+(\.\d+)?/g) || []) ok.add(m);
  const kept = [], removed = [];
  for (const s of String(text || '').split(/(?<=[.!?])\s+/).filter(Boolean)) {
    const bad = (s.replace(/\[r\d+\]/g, '').match(/\d+(\.\d+)?/g) || []).filter(n => !ok.has(n));
    const ghost = [...s.matchAll(/\[(r\d+)\]/g)].map(m => m[1]).filter(id => !receiptIds.has(id));
    const why = bad.length ? `unsupported number ${bad[0]}` : ghost.length ? `unknown receipt ${ghost[0]}` : FORBID.test(s) ? 'forecast language' : null;
    why ? removed.push({ sentence: s, reason: why }) : kept.push(s);
  }
  return { text: kept.join(' '), removed };
}
