import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.QLOO_MODE = 'mock';
process.env.LLM_MODE = 'off';
process.env.ACCESS_LOG = 'off';
process.env.PUBLIC_DEMO = '1';
const dir = mkdtempSync(join(tmpdir(), 'houselights-plan-'));
process.env.DATA_DIR = dir;
const { createApp } = await import('../server/app.mjs');
const { estimateFee, planInput } = await import('../server/live-plan.mjs');
const { db } = await import('../server/database.mjs');
const server = createApp().listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }); });

async function plan(body) {
  const response = await fetch(`${url}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.headers.get('content-type')?.includes('event-stream')) return { status: response.status, body: await response.json(), events: [] };
  const text = await response.text();
  return { status: response.status, events: text.split('\n\n').filter(chunk => chunk.startsWith('data: ')).map(chunk => JSON.parse(chunk.slice(6))) };
}

test('fees are illustrative tiers from Qloo popularity, never invented without it', () => {
  assert.equal(estimateFee(0.999), 25000);
  assert.equal(estimateFee(0.985), 9000);
  assert.equal(estimateFee(0.5), 1500);
  assert.equal(estimateFee(null), null);
  assert.equal(estimateFee(1.5), null);
});

test('plan input is validated and cleaned', () => {
  assert.throws(() => planInput({ city: 'X', anchor: 'A', budget: 5000, slots: 2 }), /city/);
  assert.throws(() => planInput({ city: 'Leeds', anchor: '', budget: 5000, slots: 2 }), /artist/);
  assert.throws(() => planInput({ city: 'Leeds', anchor: 'A', budget: 50, slots: 2 }), /budget/i);
  assert.throws(() => planInput({ city: 'Leeds', anchor: 'A', budget: 5000, slots: 9 }), /1 to 4/);
  assert.deepEqual(planInput({ city: '  Leeds <b> ', anchor: 'Arlo   Parks', budget: 12000.4, slots: 2 }), { city: 'Leeds b', anchor: 'Arlo Parks', anchorId: null, budget: 12000, slots: 2 });
});

test('a live plan streams progress, saves a shareable plan and supports the Qloo-off experiment', async () => {
  db.prepare('DELETE FROM quotas').run();
  const { status, events } = await plan({ city: 'Leeds', anchor: 'Arlo Parks', budget: 12000, slots: 2 });
  assert.equal(status, 200);
  assert.equal(events[0].type, 'start');
  assert.ok(events.some(event => event.type === 'stage'), 'stages are streamed');
  assert.ok(events.some(event => event.type === 'call' && event.tool === 'recommend'), 'Qloo calls are streamed');
  const ready = events.at(-1);
  assert.equal(ready.type, 'ready', JSON.stringify(events.at(-1)));
  assert.equal(ready.synthetic, true, 'mock runs are labelled synthetic');
  const record = await (await fetch(`${url}/api/judge/cases/${ready.id}`)).json();
  assert.equal(record.live, true);
  assert.equal(record.feeBasis, 'estimated-from-qloo-popularity');
  assert.match(record.terms, /Estimated fees/);
  assert.ok(record.snapshot.memo.items.length >= 2);
  assert.ok(record.snapshot.memo.items.every(item => item.found && typeof item.terms.fee === 'number'));
  assert.ok(record.snapshot.memo.slate.selectedIds.length <= 2);
  const off = await fetch(`${url}/api/judge/cases/${ready.id}/experiment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ qlooOff: true }) });
  assert.equal(off.status, 200);
  assert.equal((await off.json()).qlooOff, true);
  const list = await (await fetch(`${url}/api/judge/cases`)).json();
  assert.ok(!list.cases.some(item => item.id === ready.id), 'live plans are never listed as published cases');
});

test('live plans are limited per visitor', async () => {
  db.prepare('DELETE FROM quotas').run();
  for (let i = 0; i < 3; i++) assert.equal((await plan({ city: 'Bristol', anchor: 'Arlo Parks', budget: 9000, slots: 1 })).status, 200);
  const limited = await plan({ city: 'Bristol', anchor: 'Arlo Parks', budget: 9000, slots: 1 });
  assert.equal(limited.status, 429);
  assert.match(limited.body.error, /3 every 10 minutes/);
  db.prepare('DELETE FROM quotas').run();
});

test('bad input is refused before any Qloo call', async () => {
  const response = await plan({ city: 'Leeds', anchor: 'Arlo Parks', budget: 10, slots: 2 });
  assert.equal(response.status, 400);
});
