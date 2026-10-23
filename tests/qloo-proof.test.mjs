import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const dir = mkdtempSync(join(tmpdir(), 'houselights-proof-'));
process.env.DATA_DIR = dir;
process.env.ORGANIZER_TOKEN = 'qloo-proof-integration-token-1234567890';
process.env.PUBLIC_DEMO = '1';
const [{ createApp }, store, { db }, { optimizeSlate }, { benchmarkFestival },
  { lockExperiment }, { runExperiment }, { publicJudgeSnapshot }] = await Promise.all([
  import('../server/app.mjs'), import('../server/store.mjs'), import('../server/database.mjs'),
  import('../server/optimizer.mjs'), import('../server/gm.mjs'),
  import('../server/experiments/experiment-schema.mjs'), import('../server/experiments/orchestrator.mjs'),
  import('../server/judge.mjs'),
]);
const server = createApp().listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(async () => {
  await new Promise(resolve => server.close(resolve)); db.close();
  const target = resolve(dir), parent = resolve(tmpdir());
  if (!target.startsWith(join(parent, 'houselights-proof-'))) throw new Error('Unsafe test cleanup target.');
  rmSync(target, { recursive: true, force: true });
});
function source(constraints = {}) {
  const items = ['a', 'b', 'c', 'd'].map((id, index) => ({ id, name: `Artist ${id}`, found: false,
    fit: [1, .8, .4, .2][index], rank: index + 1, of: 4,
    evidence: { rank: true, local: index < 2, trends: false, comparison: false },
    evidenceReceipts: { rank: ['shared-rank'], local: index < 2 ? ['local-1'] : [], trends: [], comparison: [] },
    receipts: ['shared-rank', ...(index < 2 ? ['local-1'] : [])],
    local: index < 2 ? 'yes' : 'no data', momentum: 'unknown',
    terms: { fee: [50, 40, 20, 10][index], available: true, genre: id } }));
  const policy = { budget: 70, slots: 2, ...constraints };
  return { mock: true, input: { exampleBookingTerms: true },
    memo: { items, constraints: policy, currency: 'GBP', exampleBookingTerms: true,
      input: { city: 'London', anchors: ['jazz'] }, slate: optimizeSlate(items, policy) },
    receipts: [{ id: 'shared-rank', tool: 'rank', status: 'ok', source: 'synthetic',
      fetchedAt: '2026-10-20T00:00:00.000Z', digest: 'sha256:' + '1'.repeat(64),
      args: { options: items.map(item => item.id) } },
      { id: 'local-1', tool: 'where_popular', status: 'ok', source: 'synthetic',
        fetchedAt: '2026-01-01T00:00:00.000Z', digest: 'sha256:' + '2'.repeat(64) }] };
}
const asOf = '2026-10-22T00:00:00.000Z';
test('all 16 coalitions, shared-receipt withdrawal, exact attribution and deterministic replay', () => {
  const s = source(), before = structuredClone(s);
  const locked = lockExperiment(s, { evidenceAsOf: asOf });
  const a = runExperiment(locked), b = runExperiment(locked);
  assert.equal(a.reportDigest, b.reportDigest);
  assert.deepEqual(s, before);
  assert.deepEqual(a.ablations.coalitions.map(row => row.mask), Array.from({ length: 16 }, (_, i) => i));
  assert.deepEqual(a.ablations.receipts.find(row => row.receiptId === 'shared-rank').affectedIds, ['a', 'b', 'c', 'd']);
  assert.equal(a.ablations.coalitions[0].enabled.length, 0);
  assert.equal(a.ablations.coalitions[0].selectedIds.join(','), a.methods.qloo_ablated.selectedIds.join(','));
  assert.equal(a.contributions.status, 'computed');
  assert.ok(Math.abs(a.contributions.groups.reduce((sum, row) => sum + row.contribution, 0) -
    (a.contributions.fullValue - a.contributions.noSignalValue)) < .00001);
  assert.equal(a.evidence.counts.stale, 2);
  assert.equal(a.independentEvaluation.human.submittedJudgments, 0);
  assert.equal(a.independentEvaluation.independentOutcomes.count, 0);
});
test('fit floor is never silently removed and invalid LLM selections are not repaired', async () => {
  const original = source({ minimumAverageFit: .6 });
  const o = runExperiment(lockExperiment(original, { evidenceAsOf: asOf }));
  assert.equal(o.config.policy, 'original');
  assert.equal(o.methods.constraint_only.status, 'not_comparable');
  assert.equal(o.methods.qloo_ablated.status, 'not_comparable');
  const shared = runExperiment(lockExperiment(original, { policy: 'shared_operational', evidenceAsOf: asOf }));
  assert.equal(shared.config.originalFitFloor, .6);
  assert.equal(shared.config.constraints.minimumAverageFit, undefined);
  assert.equal(shared.methods.constraint_only.feasible, true);
  const s = source(); s.benchmark = await benchmarkFestival(s, { propose: async () => ({ selectedIds: ['unknown'] }) });
  const invalid = runExperiment(lockExperiment(s, { evidenceAsOf: asOf }));
  assert.equal(invalid.methods.llm_only.status, 'invalid_control');
  assert.deepEqual(invalid.methods.llm_only.selectedIds, []);
  const fresh = source(); fresh.benchmark = await benchmarkFestival(fresh, { propose: async () => ({ selectedIds: ['a', 'c'] }) });
  const matched = runExperiment(lockExperiment(fresh, { evidenceAsOf: asOf }));
  assert.deepEqual(matched.methods.llm_only.selectedIds, ['a', 'c']);
  fresh.memo.items[0].terms.fee = 49;
  assert.equal(runExperiment(lockExperiment(fresh, { evidenceAsOf: asOf })).methods.llm_only.status, 'stale');
});
test('private experiment API enforces access, persists immutable output, and public projection excludes private fields', async () => {
  const raw = source(); raw.private = 'PRIVATE-SENTINEL'; raw.memo.private = 'PRIVATE-SENTINEL';
  const sourceSnapshotId = store.save(raw);
  const url = '/api/experiments', auth = { authorization: `Bearer ${process.env.ORGANIZER_TOKEN}`, 'content-type': 'application/json' };
  const body = JSON.stringify({ sourceSnapshotId, policy: 'original', evidenceAsOf: asOf });
  assert.equal((await fetch(base + url, { method: 'POST', body, headers: { 'content-type': 'application/json' } })).status, 401);
  assert.equal((await fetch(base + url + '/abcdefabcdefabcdefabcdef')).status, 401);
  const created = await fetch(base + url, { method: 'POST', body, headers: auth });
  assert.equal(created.status, 201); const first = await created.json();
  const again = await (await fetch(base + url, { method: 'POST', body, headers: auth })).json();
  assert.equal(again.id, first.id);
  const start = await fetch(base + `${url}/${first.id}/run`, { method: 'POST', headers: auth, body: '{}' });
  assert.equal(start.status, 202);
  let state;
  for (let attempt = 0; attempt < 50; attempt++) {
    await delay(100);
    state = await (await fetch(base + `${url}/${first.id}`, { headers: auth })).json();
    if (state.status !== 'running') break;
  }
  assert.equal(state.status, 'completed', state.error);
  const result = await (await fetch(base + `${url}/${first.id}/results`, { headers: auth })).json();
  assert.equal(result.reportDigest, state.resultDigest);
  const exported = await (await fetch(base + `${url}/${first.id}/export`, { headers: auth })).json();
  assert.equal(exported.result.reportDigest, state.resultDigest);
  const rerun = await (await fetch(base + `${url}/${first.id}/run`, { method: 'POST', headers: auth, body: '{}' })).json();
  assert.equal(rerun.status, 'completed');
  const published = publicJudgeSnapshot(raw);
  assert.ok(!JSON.stringify(published).includes('PRIVATE-SENTINEL'));
  const publicList = await fetch(base + '/api/experiments/public');
  assert.equal(publicList.status, 200);
});
test('independent discovery stays separate and rejects unsupported independence claims', async () => {
  const { compareDiscovery } = await import('../server/experiments/discovery-comparison.mjs');
  const brief = { city: 'London', eventDate: '2026-12-12', genre: 'Electronic', budget: 100, slots: 1 };
  const candidate = (id, checked = true) => ({ id, name: id, terms: { fee: 40, available: true, genre: 'Electronic' },
    commonCheck: checked ? { identitySource: `identity-${id}`, availabilitySource: `availability-${id}`, checkedAt: asOf } : {} });
  const arms = Object.fromEntries(['qloo', 'llm', 'non_qloo'].map((name, index) => [name, {
    runDigest: `sha256:${index + 1}`.padEnd(71, '0'), sourceReference: `source-${name}`,
    generatedAt: asOf, candidates: [candidate(`act-${index}`)] }]));
  const report = compareDiscovery({ brief, arms });
  assert.equal(report.comparable, true);
  assert.equal(report.independentValidation.status, 'pending_external_review');
  assert.ok(report.overlap.every(row => row.jaccard === 0));
  arms.llm.sourceReference = arms.qloo.sourceReference;
  assert.equal(compareDiscovery({ brief, arms }).comparable, false);
  delete arms.non_qloo;
  assert.equal(compareDiscovery({ brief, arms }).methods.non_qloo.status, 'not_submitted');
  const auth = { authorization: `Bearer ${process.env.ORGANIZER_TOKEN}`, 'content-type': 'application/json' };
  const created = await fetch(base + '/api/experiments/discovery', { method: 'POST', headers: auth,
    body: JSON.stringify({ brief, arms }) });
  assert.equal(created.status, 201);
  const saved = await fetch(base + `/api/experiments/discovery/${(await created.json()).id}`, { headers: auth });
  assert.equal(saved.status, 200);
});
test('a changed saved source is flagged before running its locked experiment', async () => {
  const sourceSnapshotId = store.save(source());
  const headers = { authorization: `Bearer ${process.env.ORGANIZER_TOKEN}`, 'content-type': 'application/json' };
  const created = await (await fetch(base + '/api/experiments', { method: 'POST', headers,
    body: JSON.stringify({ sourceSnapshotId, evidenceAsOf: asOf }) })).json();
  const changed = store.load(sourceSnapshotId); changed.memo.items[0].terms.fee += 1;
  db.prepare('UPDATE snapshots SET body=? WHERE id=?').run(JSON.stringify(changed), sourceSnapshotId);
  const state = await (await fetch(base + `/api/experiments/${created.id}`, { headers })).json();
  assert.equal(state.sourceChangedSinceLock, true);
  const response = await fetch(base + `/api/experiments/${created.id}/run`, { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 409);
});
test('twelve-candidate five-slot synthetic stress case enumerates every coalition', () => {
  const items = Array.from({ length: 12 }, (_, index) => ({ id: `artist-${index}`, name: `Synthetic artist ${index}`,
    fit: 1 - index / 12, rank: index + 1, of: 12, evidence: { rank: true },
    terms: { fee: 100 + index * 10, available: true, genre: `genre-${index % 4}` } }));
  const synthetic = { mock: true, memo: { items, currency: 'GBP', input: { city: 'Synthetic stress city' },
    constraints: { budget: 900, slots: 5, maxPerGenre: 2 } } };
  const report = runExperiment(lockExperiment(synthetic, { evidenceAsOf: asOf }));
  assert.equal(report.ablations.coalitions.length, 16);
  assert.equal(report.methods.full_houselights.feasible, true);
  assert.equal(report.brief.synthetic, true);
  assert.ok(report.ablations.coalitions.every(row => row.selectedIds.length === 5 || !row.feasible));
});
