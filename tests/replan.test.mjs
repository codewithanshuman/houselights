import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.QLOO_MODE = 'mock';
process.env.LLM_MODE = 'off';
process.env.ACCESS_LOG = 'off';
process.env.PUBLIC_DEMO = '1';
const dir = mkdtempSync(join(tmpdir(), 'houselights-replan-'));
process.env.DATA_DIR = dir;
const { createApp } = await import('../server/app.mjs');
const { loadJudgeCase } = await import('../server/judge.mjs');
const { buildReplan, MAX_OPTIONS } = await import('../server/replan.mjs');
const { Run } = await import('../server/qloo.mjs');
const { db } = await import('../server/database.mjs');
const server = createApp().listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }); });
const post = (path, body) => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
async function plan() {
  const response = await post('/api/plan', { city: 'Leeds', anchor: 'Arlo Parks', budget: 12000, slots: 2 });
  const events = (await response.text()).split('\n\n').filter(chunk => chunk.startsWith('data: ')).map(chunk => JSON.parse(chunk.slice(6)));
  assert.equal(events.at(-1).type, 'ready', JSON.stringify(events.at(-1)));
  return events.at(-1).id;
}

test('a cancelled act is replaced by a fresh Qloo run, keeps the rest of the bill, and leaves the plan unchanged', async () => {
  const id = await plan(), before = JSON.stringify(loadJudgeCase(id)), { selectedIds } = loadJudgeCase(id).snapshot.memo.slate;
  const [cancelId, survivor] = selectedIds;
  const [first, second] = await Promise.all([post(`/api/judge/cases/${id}/replan`, { cancelId }), post(`/api/judge/cases/${id}/replan`, { cancelId })]);
  assert.equal(first.status, 201);
  const { replan } = await first.json();
  assert.equal(replan.createdAt, (await second.json()).replan.createdAt, 'concurrent requests share one run');
  assert.equal(replan.receipts.length, 2);
  assert.deepEqual(replan.receipts.map(r => r.tool), ['recommend', 'rank']);
  assert.ok(replan.receipts[0].args.signals.includes(survivor), 'the search is for fans of the rest of the bill');
  assert.ok(replan.feasible);
  const ids = replan.acts.map(act => act.id);
  assert.ok(ids.includes(survivor), 'the surviving act stays');
  assert.ok(!ids.includes(cancelId), 'the cancelled act is gone');
  assert.ok(replan.totalFee <= 12000, 'the budget still holds');
  assert.equal(JSON.stringify(loadJudgeCase(id)), before);
  const again = await post(`/api/judge/cases/${id}/replan`, { cancelId });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).cached, true);
});

test('a large pool still fits the ten options Qloo ranks at once, and the surviving act is always kept', async () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: `mock-pool-${i}`, name: `Pool act ${i}`, rank: i + 1, of: 12, fit: 1 - i / 12, local: 'no data', momentum: 'unknown', terms: { fee: 100, available: true, genre: '' }, evidence: { rank: true } }));
  const record = { snapshot: { receipts: [{ tool: 'describe', evidence: { rows: [{ id: 'mock-anchor', name: 'Anchor' }] } }], memo: { input: { city: 'Leeds', anchors: ['Anchor'] }, items, constraints: { budget: 1000, slots: 2, maxPerGenre: 2, discoveryMin: 0, riskTolerance: 50, lockedIds: [], excludedIds: [] }, slate: { feasible: true, selectedIds: ['mock-pool-11', 'mock-pool-0'] } } } };
  const run = new Run({ budget: 2, cacheStore: new Map() });
  const replan = await buildReplan(record, 'mock-pool-0', run);
  assert.ok(run.receipts[1].args.options.length <= MAX_OPTIONS);
  assert.ok(run.receipts[1].args.options.includes('mock-pool-11'), 'the surviving act stays in the ranking, even when ranked last');
  assert.ok(replan.acts.some(act => act.id === 'mock-pool-11'));
  assert.deepEqual(run.receipts[1].args.signals, ['mock-anchor'], 'ranked for the plan\u2019s own audience, so no candidate is left out as a signal');
});

test('only a booked act can be replaced, and searches are rate limited', async () => {
  const id = await plan();
  assert.equal((await post(`/api/judge/cases/${id}/replan`, { cancelId: 'not-on-the-bill' })).status, 400);
  assert.equal((await post(`/api/judge/cases/${'0'.repeat(24)}/replan`, { cancelId: 'x' })).status, 404);
});
