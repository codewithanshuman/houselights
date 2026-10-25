import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.QLOO_MODE = 'mock';
process.env.LLM_MODE = 'off';
process.env.ACCESS_LOG = 'off';
const dir = mkdtempSync(join(tmpdir(), 'houselights-hygiene-'));
process.env.DATA_DIR = dir;
const { createApp } = await import('../server/app.mjs');
const { seedPublicCases } = await import('../server/release-seed.mjs');
const { db } = await import('../server/database.mjs');
const seed = seedPublicCases(new URL('../deploy/judge-cases.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const server = createApp().listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }); });

test('unknown API routes answer with the JSON error shape and a request ID', async () => {
  const response = await fetch(`${url}/api/does-not-exist`);
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.match(body.error, /Unknown API route/);
  assert.equal(body.requestId, response.headers.get('x-request-id'));
  const supplied = await fetch(`${url}/api/does-not-exist`, { headers: { 'x-request-id': 'trace-abc-12345' } });
  assert.equal(supplied.headers.get('x-request-id'), 'trace-abc-12345', 'a safe incoming request ID is kept');
  const unsafe = await fetch(`${url}/api/does-not-exist`, { headers: { 'x-request-id': 'bad id <script>' } });
  assert.notEqual(unsafe.headers.get('x-request-id'), 'bad id <script>');
});

test('unknown pages get the styled 404 page, not a bare error', async () => {
  const response = await fetch(`${url}/no-such-page`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /This page isn’t on the bill\./);
});

test('rate limits say when to retry', async () => {
  db.prepare('DELETE FROM quotas').run();
  const id = seed.caseIds[0];
  let last;
  for (let i = 0; i < 21; i++) last = await fetch(`${url}/api/judge/cases/${id}/experiment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ budget: 1000 + i }) });
  assert.equal(last.status, 429);
  const retryAfter = Number(last.headers.get('retry-after'));
  assert.ok(retryAfter >= 1 && retryAfter <= 60, `Retry-After ${retryAfter}`);
  const body = await last.json();
  assert.match(body.error, /Experiment limit reached/);assert.ok(body.requestId);
  db.prepare('DELETE FROM quotas').run();
});

test('public judge reads and identical experiments are served from the server cache', async () => {
  db.prepare('DELETE FROM quotas').run();
  const first = await fetch(`${url}/api/judge/cases`), second = await fetch(`${url}/api/judge/cases`);
  assert.equal(first.headers.get('x-cache'), 'miss');assert.equal(second.headers.get('x-cache'), 'hit');
  assert.match(second.headers.get('cache-control'), /no-store/, 'browsers still revalidate');
  assert.deepEqual(await first.json(), await second.json());
  const id = seed.caseIds[2], body = JSON.stringify({ budget: 12000, qlooOff: true });
  const a = await fetch(`${url}/api/judge/cases/${id}/experiment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const b = await fetch(`${url}/api/judge/cases/${id}/experiment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ qlooOff: true, budget: 12000 }) });
  assert.equal(a.headers.get('x-cache'), 'miss');assert.equal(b.headers.get('x-cache'), 'hit', 'key order does not matter');
  assert.deepEqual((await a.json()).snapshot.memo.slate.selectedIds, (await b.json()).snapshot.memo.slate.selectedIds);
});
