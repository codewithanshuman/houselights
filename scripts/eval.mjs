// `QLOO_API_KEY=... ANTHROPIC_API_KEY=... npm run eval` -> evals/results.json. Report it as it is, even if modest.
import { readFileSync, writeFileSync } from 'node:fs';
import { Run } from '../server/qloo.mjs';
import { buildMemo } from '../server/agent.mjs';
const out = [], avg = k => { const v = out.map(o => o.eval?.[k]).filter(x => x != null); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null; };
for (const c of JSON.parse(readFileSync(new URL('../evals/cases.json', import.meta.url)))) {
  const memo = await buildMemo(c, new Run({ budget: 30 }));
  out.push({ case: c, eval: memo?.eval ?? null, removedByChecker: memo?.removed.length ?? null });
  console.log(c.city, memo?.eval ? { exact: memo.eval.exact, direction: memo.eval.direction, rho: memo.eval.rho, untraceable: memo.eval.untraceableNumbers } : 'no baseline (set ANTHROPIC_API_KEY)');
}
const summary = { cases: out.length, exact: avg('exact'), direction: avg('direction'), rho: avg('rho') };
console.log('SUMMARY', summary); writeFileSync(new URL('../evals/results.json', import.meta.url), JSON.stringify({ summary, out }, null, 2)); process.exit(0);
