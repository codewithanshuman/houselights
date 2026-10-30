import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.QLOO_MODE = 'mock';
process.env.LLM_MODE = 'off';
process.env.ACCESS_LOG = 'off';
process.env.PUBLIC_DEMO = '1';
process.env.ORGANIZER_TOKEN = 'public-slate-organizer-token-'.repeat(2);
const dir = mkdtempSync(join(tmpdir(), 'houselights-slate-'));
process.env.DATA_DIR = dir;
const { createApp } = await import('../server/app.mjs');
const { db } = await import('../server/database.mjs');
const server = createApp().listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }); });

const brief = { city: 'London', anchors: 'Arlo Parks', offers: 'Nilüfer Yanya, Pip Millett, Joy Crookes',
  terms: { 'Nilüfer Yanya': { fee: 9000, genre: 'Indie', available: true }, 'Pip Millett': { fee: 7000, genre: 'Soul', available: true }, 'Joy Crookes': { fee: 8000, genre: 'Soul', available: true } },
  constraints: { budget: 20000, slots: 2, maxPerGenre: 2, discoveryMin: 0, riskTolerance: 50, lockedIds: [], excludedIds: [] }, currency: 'GBP' };
async function build(auth) {
  const response = await fetch(`${url}/api/memo`, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${process.env.ORGANIZER_TOKEN}` } : {}) }, body: JSON.stringify(brief) });
  assert.equal(response.status, 200);
  const events = (await response.text()).split('\n\n').filter(chunk => chunk.startsWith('data: ')).map(chunk => JSON.parse(chunk.slice(6)));
  return events.find(event => event.type === 'saved')?.id;
}
const pinned = id => db.prepare('SELECT pinned FROM snapshots WHERE id=?').get(id)?.pinned;

test('a visitor can build a live slate; it is saved unpinned so it ages out', async () => {
  const id = await build(false);
  assert.ok(id, 'the run finished and was saved');
  assert.equal(pinned(id), 0);
  const memo = await (await fetch(`${url}/api/memo/${id}`)).json();
  assert.ok(memo.receipts.length > 0, 'every recommendation has receipts');
  const scenario = await fetch(`${url}/api/scenario`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceId: id, name: 'Smaller budget', terms: {}, constraints: { ...memo.memo.constraints, budget: 15000 } }) });
  assert.equal(scenario.status, 201);
  assert.equal(pinned((await scenario.json()).id), 0);
  for (const path of ['/api/optimize', '/api/analyze']) {
    const response = await fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: memo.memo.items, constraints: memo.memo.constraints }) });
    assert.equal(response.status, 200, path);
  }
});

test('an organizer’s slate is retained', async () => {
  assert.equal(pinned(await build(true)), 1);
});

test('public slate runs share a small daily allowance', async () => {
  db.exec('DELETE FROM quotas');
  const statuses = [];
  for (let i = 0; i < 3; i++) statuses.push((await fetch(`${url}/api/memo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(brief) })).status);
  assert.deepEqual(statuses.slice(0, 2), [200, 200]);
  assert.equal(statuses[2], 429, 'a third run in the same minute is refused');
});

test('private organizer routes stay private', async () => {
  for (const [method, path] of [['GET', '/api/pipeline/x'], ['GET', '/api/events'], ['POST', '/api/judge/cases']])
    assert.equal((await fetch(`${url}${path}`, { method, headers: { 'content-type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) })).status, 401, path);
});
