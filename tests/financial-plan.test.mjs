import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const dataDir = mkdtempSync(join(tmpdir(), 'houselights-finplan-'));
process.env.DATA_DIR = dataDir;
process.env.PUBLIC_DEMO = '1';
process.env.ACCESS_LOG = 'off';
process.env.ORGANIZER_TOKEN = 'financial-plan-test-secret-token-123456789';
const { createApp } = await import('../server/app.mjs');
const { seedPublicCases } = await import('../server/release-seed.mjs');
const { loadJudgeCase } = await import('../server/judge.mjs');
const { caseAssumptions, caseFinancialRequest, PUBLIC_DRAWS } = await import('../server/financial/case-scenario.mjs');
const { db } = await import('../server/database.mjs');
seedPublicCases(join(import.meta.dirname, '..', 'deploy', 'judge-cases.json'));
const featured = '8be4d03ef4792ca9f1466983';
const server = createApp().listen(0);
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
test.after(async () => { await new Promise(done => server.close(done)); db.close(); await delay(300); rmSync(dataDir, { recursive: true, force: true }); });
const post = body => fetch(`${origin}/api/financial/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
async function finish(id) {
  for (let attempt = 0; attempt < 240; attempt++) {
    const response = await fetch(`${origin}/api/financial/jobs/${id}`);
    assert.equal(response.status, 200);
    const job = await response.json();
    if (job.status !== 'running') return job;
    await delay(500);
  }
  throw new Error('Financial job did not finish.');
}

test('a scenario on a real plan uses the plan’s own candidates and fees, and only stated assumptions', () => {
  const record = loadJudgeCase(featured), assumptions = caseAssumptions(record, { capacity: 1200, ticketPrice: 38 });
  const request = caseFinancialRequest(record, assumptions);
  assert.deepEqual(request.candidates.map(item => item.name), record.snapshot.memo.items.map(item => item.name));
  assert.deepEqual(request.candidates.map(item => item.fee), record.snapshot.memo.items.map(item => item.terms.fee));
  assert.equal(request.constraints.budget, record.snapshot.memo.constraints.budget);
  assert.equal(request.brief.city, record.snapshot.memo.input.city);
  assert.equal(request.brief.capacity, 1200);
  assert.equal(request.financial.simulation.draws, PUBLIC_DRAWS);
  assert.ok(request.candidates.every(item => !/^(Pop|Jazz|Indie|Electronic|Local) [A-Z]$/.test(item.name)), 'no placeholder artists');
  assert.throws(() => caseAssumptions(record, { capacity: 12.5 }), /whole number/);
  assert.throws(() => caseAssumptions(record, { sellThrough: 2 }), /from 0.05 to 1/);
});

test('anyone can run one on a published plan; the same run is reused, and free-form runs stay private', async () => {
  const started = await post({ caseId: featured, assumptions: { capacity: 1200 } });
  assert.equal(started.status, 202, JSON.stringify(await started.clone().json()));
  const job = await finish((await started.json()).id);
  assert.equal(job.status, 'completed', job.error);
  assert.equal(job.result.status, 'scenario_complete');
  assert.equal(job.provenance.sourceClassification, 'saved_qloo_plan');
  const names = new Set(loadJudgeCase(featured).snapshot.memo.items.map(item => item.id));
  for (const row of job.result.assumptionResults[0].rows) assert.ok(row.selectedIds.every(id => names.has(id)), 'every lineup is drawn from the plan');
  assert.ok(job.result.assumptionResults[0].rows.some(row => row.culturalFit != null), 'Qloo fit flows through from the plan');
  const again = await post({ caseId: featured, assumptions: { capacity: 1200 } });
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { id: job.id, status: 'completed', reused: true });
  assert.equal((await post({ brief: {}, candidates: [] })).status, 401);
  assert.equal((await post({ caseId: '0'.repeat(24) })).status, 404);
  assert.equal((await fetch(`${origin}/api/financial/validation`)).status, 401);
  assert.equal((await fetch(`${origin}/api/financial/jobs/${job.id}/replay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
});
