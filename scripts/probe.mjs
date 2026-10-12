// PowerShell: set QLOO_API_KEY in the server environment, then run:
// node --env-file-if-exists=.env scripts/probe.mjs "Radiohead" London
// Prints bounded fixture data for calibration; never prints credentials.
import { Run, closeQloo, isMock } from '../server/qloo.mjs';
import { idOf } from '../server/shape.mjs';
const [artist = 'Radiohead', city = 'London'] = process.argv.slice(2);
if (!isMock() && !process.env.QLOO_API_KEY) {
  console.error('Set QLOO_API_KEY in your environment, or use QLOO_MODE=mock for a synthetic transport check.');
  process.exitCode = 1;
} else {
  const run = new Run({ budget: 12, cacheStore: new Map() });
  const inspect = async (tool, args) => {
    const { env, receipt } = await run.call(tool, args, 'Adapter calibration probe');
    console.log(JSON.stringify({ tool, mode: run.mode, status: env.status, summary: env.summary,
      results: env.results.slice(0, 2), ...(env.comparison ? { comparison: env.comparison } : {}),
      error: env.error, provenance: receipt.provenance, receiptDigest: receipt.digest,
    }, null, 2));
    if (env.status === 'error') process.exitCode = 1;
    return env;
  };
  try {
    const resolved = await inspect('describe', { entity: artist, type: 'artist' });
    if (!['ok', 'partial'].includes(resolved.status) || !resolved.results.length) {
      console.error('Resolve the artist before calibrating downstream tools.');
      process.exitCode = 1;
    } else {
      const ref = idOf(resolved.results[0]) || artist;
      const end = new Date(), start = new Date(end.getTime() - 180 * 864e5);
      const calls = [
        ['entity_tags', { entities: [ref], entity_type: 'artist' }],
        ['audience_demographics', { entity: ref, entity_type: 'artist' }],
        ['recommend', { target_type: 'artist', signals: [ref], filter_location: city, limit: 3 }],
        ['where_popular', { entity: ref, entity_type: 'artist', within: city, limit: 3 }],
        ['compare_audiences', { group_a: [ref], group_b: ['Coldplay'], target_type: 'artist', limit: 3 }],
        ['trends', { entities: [ref], entity_type: 'artist', start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10), limit: 3 }],
        ['rank', { options: ['Coldplay', 'Portishead'], option_type: 'artist', signals: [ref], signal_location: city }],
      ];
      for (const [tool, args] of calls) await inspect(tool, args);
      console.log(JSON.stringify({ workflowAttempts: run.used, max: run.budget,
        calibration: 'Trend points and audience comparisons require live-fixture interpretation; no attendance or net-new percentages are inferred.' }));
    }
  } finally { await closeQloo(); }
}
