import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const dataDir = mkdtempSync(join(tmpdir(), 'houselights-financial-'));
process.env.DATA_DIR = dataDir;
process.env.ORGANIZER_TOKEN = 'financial-integration-test-secret-token-123456789';
const [{ createApp }, { demoInput }] = await Promise.all([
  import('../server/app.mjs'), import('../scripts/generate-financial-demo.mjs'),
]);
const { db } = await import('../server/database.mjs');
const app = createApp(), server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const headers = { authorization: `Bearer ${process.env.ORGANIZER_TOKEN}`, 'content-type': 'application/json' };
async function request(path, options = {}) {
  const response = await fetch(origin + path, { ...options, headers: { ...headers, ...options.headers } });
  return { status: response.status, data: await response.json() };
}
async function finish(id) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const row = await request(`/api/financial/jobs/${id}`);
    assert.equal(row.status, 200, `Polling job ${id}: ${row.data.error ?? row.status}`);
    if (row.data.status !== 'running') return row.data;
    await delay(500);
  }
  throw new Error('Financial worker did not complete within 100 seconds.');
}
test.after(async () => {
  await new Promise(done => server.close(done)); db.close(); await delay(300);
  const target = resolve(dataDir), parent = resolve(tmpdir());
  if (!target.startsWith(parent + '\\') || !target.includes('houselights-financial-')) throw new Error('Unsafe test cleanup target.');
  rmSync(target, { recursive: true, force: true });
});

test('private financial API runs, persists and exactly replays one seeded decision', async () => {
  const anonymous = await fetch(origin + '/api/financial/validation');
  assert.equal(anonymous.status, 401);
  const initial = await request('/api/financial/validation');
  assert.equal(initial.data.count, 0); assert.equal(initial.data.calibrated, false);
  const started = await request('/api/financial/jobs', { method: 'POST', body: JSON.stringify(demoInput) });
  assert.equal(started.status, 202); assert.ok(started.data.feasibleCount >= 5);
  const first = await finish(started.data.id);
  assert.equal(first.status, 'completed'); assert.equal(first.result.status, 'scenario_complete');
  assert.equal(first.result.stressTests.length, 5);
  assert.ok(first.inputDigest && first.resultDigest);
  const replay = await request(`/api/financial/jobs/${first.id}/replay`, { method: 'POST', body: '{}' });
  assert.equal(replay.status, 202);
  const second = await finish(replay.data.id);
  assert.equal(second.status, 'completed'); assert.equal(second.resultDigest, first.resultDigest);
  assert.equal(second.inputDigest, first.inputDigest);
});

test('invalid assumptions and interrupted jobs cannot become completed decisions', async () => {
  const invalid = structuredClone(demoInput); invalid.financial.correlation = [[1, 2, 0, 0], [2, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  const rejected = await request('/api/financial/jobs', { method: 'POST', body: JSON.stringify(invalid) });
  assert.equal(rejected.status, 400); assert.match(rejected.data.error, /Correlation/);
  const long = structuredClone(demoInput); long.financial.simulation.draws = 100000;
  const started = await request('/api/financial/jobs', { method: 'POST', body: JSON.stringify(long) });
  assert.equal(started.status, 202);
  const stopped = await request(`/api/financial/jobs/${started.data.id}/cancel`, { method: 'POST', body: '{}' });
  assert.equal(stopped.status, 200); assert.equal(stopped.data.status, 'canceled');
  const stored = await request(`/api/financial/jobs/${started.data.id}`);
  assert.equal(stored.data.status, 'canceled'); assert.equal(stored.data.result, null);
});

test('100,000-draw job completes and concurrent requests stop at two workers', async () => {
  const large = structuredClone(demoInput); large.financial.simulation.draws = 100000;
  large.financial.assumptionSets = [large.financial.assumptionSets[0]];
  const started = await request('/api/financial/jobs', { method: 'POST', body: JSON.stringify(large) });
  assert.equal(started.status, 202);
  const second = await request('/api/financial/jobs', { method: 'POST', body: JSON.stringify(large) });
  assert.equal(second.status, 202);
  const third = await request('/api/financial/jobs', { method: 'POST', body: JSON.stringify(large) });
  assert.equal(third.status, 429); assert.match(third.data.error, /Two financial simulations/);
  const canceled = await request(`/api/financial/jobs/${second.data.id}/cancel`, { method: 'POST', body: '{}' });
  assert.equal(canceled.data.status, 'canceled');
  const done = await finish(started.data.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.result.assumptionResults[0].rows[0].metrics.profit.count, 100000);
});
