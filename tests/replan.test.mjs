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

test('only a booked act can be replaced, and searches are rate limited', async () => {
  const id = await plan();
  assert.equal((await post(`/api/judge/cases/${id}/replan`, { cancelId: 'not-on-the-bill' })).status, 400);
  assert.equal((await post(`/api/judge/cases/${'0'.repeat(24)}/replan`, { cancelId: 'x' })).status, 404);
});
