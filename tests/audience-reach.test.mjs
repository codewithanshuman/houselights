import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.QLOO_MODE = 'mock';
process.env.LLM_MODE = 'off';
process.env.ACCESS_LOG = 'off';
process.env.PUBLIC_DEMO = '1';
const dir = mkdtempSync(join(tmpdir(), 'houselights-reach-'));
process.env.DATA_DIR = dir;
const { createApp } = await import('../server/app.mjs');
const { driversOf, buildReach, REACH_CALLS, REACH_LEADS } = await import('../server/audience-reach.mjs');
const { Run } = await import('../server/qloo.mjs');
const { loadJudgeCase } = await import('../server/judge.mjs');
const { db } = await import('../server/database.mjs');
const server = createApp().listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }); });

async function livePlan(body) {
  const response = await fetch(`${url}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const events = (await response.text()).split('\n\n').filter(chunk => chunk.startsWith('data: ')).map(chunk => JSON.parse(chunk.slice(6)));
  assert.equal(events.at(-1).type, 'ready', JSON.stringify(events.at(-1)));
  return events.at(-1).id;
}
const reach = id => fetch(`${url}/api/judge/cases/${id}/reach`, { method: 'POST' });

test('each booked act’s share comes from Qloo explainability, or is absent', () => {
  const row = { explainability: { 'signal.interests.entities': [{ entity_id: 'a', score: 0.6 }, { entity_id: 'b', score: 0.2 }, { entity_id: 'x', score: 9 }] } };
  const drivers = driversOf(row, ['a', 'b']);
  assert.deepEqual(drivers.map(d => d.id), ['a', 'b']);
  assert.ok(Math.abs(drivers[0].share - 0.75) < 1e-12 && Math.abs(drivers[1].share - 0.25) < 1e-12, 'shares are normalized over the booked acts only');
  assert.deepEqual(driversOf(row, ['a', 'c']), [], 'a booked act without a score yields no shares, never a guess');
  assert.deepEqual(driversOf({}, ['a']), []);
  assert.deepEqual(driversOf({ explainability: { 'signal.interests.entities': [{ entity_id: 'a', score: 0 }] } }, ['a']), []);
});

test('reach uses the booked acts as signals, one call per domain, and never touches the bill', async () => {
  const snapshot = { memo: { input: { city: 'London' }, items: [{ id: 'mock-a', name: 'A' }, { id: 'mock-b', name: 'B' }, { id: 'mock-c', name: 'C' }],
    slate: { feasible: true, selectedIds: ['mock-a', 'mock-b'] } } };
  const before = JSON.stringify(snapshot), run = new Run({ budget: REACH_CALLS, receiptPrefix: 'b' });
  const result = await buildReach(snapshot, run);
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(run.receipts.length, REACH_CALLS);
  assert.deepEqual(result.groups.map(g => g.type), ['venue', 'brand', 'place', 'podcast']);
  for (const [index, receipt] of run.receipts.entries()) {
    assert.deepEqual(receipt.args.signals, ['mock-a', 'mock-b'], 'signals are exactly the booked acts');
    assert.equal(result.groups[index].receiptId, receipt.id);
  }
  assert.equal(run.receipts[2].args.filter_location, 'London', 'places are filtered to the plan’s city');
  assert.ok(result.groups.every(g => g.leads.length > 0 && g.leads.length <= REACH_LEADS));
  assert.equal(result.mock, true);
  await assert.rejects(buildReach({ memo: { ...snapshot.memo, slate: { feasible: false, selectedIds: [] } } }, new Run({ budget: 3 })), /bookable bill/);
});

test('a plan’s audience map is made once, saved beside the case, and returned to everyone', async () => {
  const id = await livePlan({ city: 'Leeds', anchor: 'Arlo Parks', budget: 12000, slots: 2 });
  const before = JSON.stringify(loadJudgeCase(id));
  assert.equal('reach' in (await (await fetch(`${url}/api/judge/cases/${id}`)).json()), false, 'no field until a map exists');
  const [first, second] = await Promise.all([reach(id), reach(id)]);
  assert.equal(first.status, 201);
  const a = await first.json(), b = await second.json();
  assert.equal(a.reach.createdAt, b.reach.createdAt, 'concurrent requests share one run');
  assert.equal(a.reach.receipts.length, REACH_CALLS);
  assert.deepEqual(a.reach.selectedIds, loadJudgeCase(id).snapshot.memo.slate.selectedIds);
  const again = await reach(id);
  assert.equal(again.status, 200);
  assert.equal((await again.json()).cached, true);
  assert.equal(JSON.stringify(loadJudgeCase(id)), before, 'the case record and its digests are unchanged');
  const record = await (await fetch(`${url}/api/judge/cases/${id}`)).json();
  assert.equal(record.reach.createdAt, a.reach.createdAt);
  assert.equal((await reach('0'.repeat(24))).status, 404);
});

test('a plan with no bookable bill has no audience to map', async () => {
  const id = await livePlan({ city: 'York', anchor: 'Arlo Parks', budget: 1000, slots: 4 });
  if (loadJudgeCase(id).snapshot.memo.slate.feasible) return;
  const response = await reach(id);
  assert.equal(response.status, 409);
});

test('rooms to book are concert rooms near the place, or an honest none', async () => {
  const { REACH_DOMAINS } = await import('../server/audience-reach.mjs');
  const room = REACH_DOMAINS.find(domain => domain.key === 'venue');
  assert.ok(room.keep({ name: 'Prithvi Theatre' }));
  assert.ok(!room.keep({ name: 'Siddhi Gardens and Banquets' }));
  assert.ok(!room.keep({ name: 'R K Lawns & Hall' }));
  const snapshot = { memo: { input: { city: 'Akole' }, slate: { feasible: true, selectedIds: ['a'] }, items: [{ id: 'a', name: 'A' }] } };
  const near = { name: 'Near Hall', entity_id: 'n', location: { lat: 19.55, lon: 74.02 } }, far = { name: 'Far Hall', entity_id: 'f', location: { lat: 18.93, lon: 72.83 } };
  const run = { mode: 'mock', receipts: [], call: async () => ({ env: { status: 'ok', results: [near, far, { name: 'No Coordinates', entity_id: 'x' }] }, receipt: { id: 'b1' } }) };
  const reach = await buildReach(snapshot, run, { place: { status: 'found', lat: 19.54, lon: 74.01 } });
  const rooms = reach.groups.find(group => group.type === 'venue');
  assert.deepEqual(rooms.leads.map(lead => lead.name), ['Near Hall']);
  assert.equal(rooms.farAway, 2);
});
