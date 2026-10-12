// Qloo-on vs Qloo-off. Metrics are descriptive, not a claim of accuracy.
const POS = v => v === 'lean yes' || v === 'growth bet';
export function spearman(a, b) {
  const k = a.filter(x => b.includes(x)), n = k.length; if (n < 3) return null;
  const rb = b.filter(y => k.includes(y)), d2 = k.reduce((s, x, i) => s + (i - rb.indexOf(x)) ** 2, 0);
  return +(1 - (6 * d2) / (n * (n * n - 1))).toFixed(2);
}
export function evaluate({ items, ranked, base, receipts }) {
  if (!base) return null;
  const low = s => String(s).toLowerCase();
  const bv = new Map(base.verdicts.map(v => [low(v.name), v]));
  const rows = items.map(i => ({ name: i.name, qloo: i.verdict, base: bv.get(low(i.name))?.verdict ?? null }));
  const both = rows.filter(r => r.base), share = f => (both.length ? +(both.filter(f).length / both.length).toFixed(2) : null);
  return { rows, exact: share(r => r.qloo === r.base), direction: share(r => POS(r.qloo) === POS(r.base)),
    rho: spearman(base.order.map(low), ranked.map(low)),
    untraceableNumbers: base.verdicts.reduce((n, v) => n + (String(v.reason).match(/\d+/g) || []).length, 0), receipts: receipts.length };
}
