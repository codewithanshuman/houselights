import { mkdirSync, writeFileSync } from 'node:fs';
import { Run, closeQloo } from '../server/qloo.mjs';
import { idOf } from '../server/shape.mjs';
const output = 'artifacts/live-validation.json';
if (!process.env.QLOO_API_KEY || process.env.QLOO_MODE === 'mock') {
  console.error('Live validation requires QLOO_API_KEY and QLOO_MODE unset. No synthetic substitute was run.');
  process.exitCode = 1;
} else {
  const run = new Run({ mode: 'live', budget: 12, deadlineMs: 120000, cacheStore: new Map() });
  const observations = [];
  const call = async (tool, args) => {
    const result = await run.call(tool, args, 'Bounded live release validation');
    observations.push({ tool, status: result.env.status, resultCount: result.env.result_count,
      resultKeys: Object.keys(result.env.results[0] ?? {}), comparisonKeys: Object.keys(result.env.comparison ?? {}), receipt: result.receipt });
    return result;
  };
  try {
    const a = await call('describe', { entity: 'Radiohead', type: 'artist' });
    const b = await call('describe', { entity: 'Coldplay', type: 'artist' });
    const ids = [a, b].map(result => idOf(result.env.results[0]));
    if (ids.every(Boolean) && [a, b].every(result => result.env.status === 'ok')) {
      await call('rank', { options: ids, option_type: 'artist', signal_location: 'London' });
      await call('rank', { options: ids, option_type: 'artist', signal_location: 'London', demographic: '35-44' });
      await call('audience_demographics', { entity: ids[0], entity_type: 'artist', limit: 12 });
      await call('compare_audiences', { group_a: [ids[0]], group_b: [ids[1]], target_type: 'artist', limit: 10 });
      await call('where_popular', { entity: ids[0], entity_type: 'artist', within: 'London', limit: 12 });
      await call('recommend', { target_type: 'book', signal_location: 'London', limit: 5 });
    }
    const rank = observations.find(item => item.tool === 'rank');
    const verified = ids.every(Boolean) && rank?.status === 'ok' && rank.resultCount === 2 && run.receipts.every(receipt => receipt.source === 'qloo');
    const report = { at: new Date().toISOString(), runtime: process.version, verifiedCoreResolutionAndRanking: verified,
      workflowsUsed: run.used, observations, limitation: 'A smoke test validates these calls and shapes only; it does not establish market relevance or benchmark superiority.' };
    mkdirSync('artifacts', { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, verifiedCoreResolutionAndRanking: verified, workflowsUsed: run.used, statuses: observations.map(({ tool, status, resultCount }) => ({ tool, status, resultCount })) }));
    if (!verified) process.exitCode = 1;
  } finally { await closeQloo(); }
}
