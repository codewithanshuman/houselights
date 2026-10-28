import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'houselights-plan-recovery-'));
Object.assign(process.env, { DATA_DIR: directory, QLOO_MODE: 'mock', LLM_MODE: 'off', ACCESS_LOG: 'off', PUBLIC_DEMO: '1', ORGANIZER_TOKEN: 'test-only-recovery-token-'.repeat(3) });
const { createApp } = await import('../server/app.mjs');
const { buildMemo } = await import('../server/agent.mjs');
const { db } = await import('../server/database.mjs');
let builder = buildMemo;
const server = createApp({ memoBuilder: (...args) => builder(...args) }).listen(0, '127.0.0.1');
server.keepAliveTimeout = 0;
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const brief = { city: 'Leeds', anchor: 'Arlo Parks', budget: 12000, slots: 2 };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const post = (path, body, signal) => fetch(origin + path, { method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.ORGANIZER_TOKEN}` }, body: JSON.stringify(body) });
const counters = () => db.prepare("SELECT key,count,expires FROM quotas WHERE key LIKE 'plan%' ORDER BY key").all();
async function until(check) {
  const deadline = Date.now() + 5000;
  while (!check()) { if (Date.now() >= deadline) assert.fail('The bounded background run did not persist.'); await new Promise(done => setTimeout(done, 10)); }
}
beforeEach(() => { builder = buildMemo; db.exec('DELETE FROM quotas'); });
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory, { recursive: true, force: true }); });

test('a disconnected live plan completes, retains its trace and saves once', async () => {
  const gate = deferred(), started = deferred(), closed = deferred();
  const before = db.prepare('SELECT count(*) AS n FROM judge_cases').get().n;
  builder = async (...args) => { started.resolve(); await gate.promise; return buildMemo(...args); };
  server.once('request', (_req, res) => res.once('close', closed.resolve));
  const controller = new AbortController();
  const response = await post('/api/plan', brief, controller.signal);
  await response.body.getReader().read(); await started.promise;
  controller.abort(); await closed.promise; gate.resolve();
  await until(() => db.prepare('SELECT count(*) AS n FROM judge_cases').get().n === before + 1);
  const record = JSON.parse(db.prepare('SELECT body FROM judge_cases ORDER BY rowid DESC LIMIT 1').get().body);
  assert.equal(record.live, true); assert.equal(record.snapshot.trace.at(-1).type, 'memo');
  assert.equal(record.snapshot.memo.slate.feasible, true);
  assert.deepEqual(counters().map(row => row.count), [1, 1, 1]);
});

test('a disconnected organizer memo is saved with all completed research', async () => {
  const gate = deferred(), closed = deferred();
  const before = db.prepare('SELECT count(*) AS n FROM snapshots').get().n;
  builder = async (...args) => { await gate.promise; return buildMemo(...args); };
  server.once('request', (_req, res) => res.once('close', closed.resolve));
  const controller = new AbortController();
  const response = await post('/api/memo', { city: 'London', anchors: ['Radiohead'], offers: ['The xx', 'Wolf Alice'], constraints: { budget: 9000, slots: 1 }, terms: { 'The xx': { fee: 1500, available: true }, 'Wolf Alice': { fee: 1600, available: true } } }, controller.signal);
  await response.body.getReader().read(); controller.abort(); await closed.promise; gate.resolve();
  await until(() => db.prepare('SELECT count(*) AS n FROM snapshots').get().n === before + 1);
  const saved = JSON.parse(db.prepare('SELECT body FROM snapshots ORDER BY rowid DESC LIMIT 1').get().body);
  assert.equal(saved.trace.at(-1).type, 'memo'); assert.ok(saved.receipts.length > 0);
});

test('failed and unresolved plans refund only their three plan reservations, never attempted workflows', async () => {
  let attempted;
  builder = async (_input, run) => { await run.call('describe', { entity: 'Arlo Parks', type: 'artist' }, 'Recovery test', { refresh: true }); attempted = run.used; throw new Error('private transport detail'); };
  const response = await post('/api/plan', brief), text = await response.text();
  assert.match(text, /"type":"error"/); assert.doesNotMatch(text, /private transport detail/);
  assert.equal(attempted, 1); assert.deepEqual(counters().map(row => row.count), [0, 0, 0]);
  assert.ok(db.prepare("SELECT count FROM quotas WHERE key LIKE 'http:%'").get().count > 0);
  builder = async () => undefined;
  await (await post('/api/plan', brief)).text();
  assert.deepEqual(counters().map(row => row.count), [0, 0, 0]);
});

test('a failed concurrent plan cannot refund a successful plan or underflow counters', async () => {
  const gate = deferred();
  builder = async (input, run) => { if (input.city === 'Failure') { await gate.promise; throw new Error('fixture failure'); } return buildMemo(input, run); };
  const failure = await post('/api/plan', { ...brief, city: 'Failure' });
  const success = await post('/api/plan', brief); assert.match(await success.text(), /"type":"ready"/);
  gate.resolve(); await failure.text();
  assert.deepEqual(counters().map(row => row.count), [1, 1, 1]);
});

test('refunds cannot touch replacement quota windows after a delayed failure', async () => {
  const gate = deferred();
  builder = async () => { await gate.promise; throw new Error('fixture delayed failure'); };
  const response = await post('/api/plan', brief);
  db.exec("UPDATE quotas SET count=7,expires=expires+86400000 WHERE key LIKE 'plan%'");
  gate.resolve(); await response.text();
  assert.deepEqual(counters().map(row => row.count), [7, 7, 7]);
});

test('a failed final save refunds the reservation and exposes no internal database error', async () => {
  const before = db.prepare('SELECT count(*) AS n FROM judge_cases').get().n;
  db.exec("CREATE TRIGGER reject_plan_save BEFORE INSERT ON judge_cases BEGIN SELECT RAISE(ABORT,'private save detail'); END;");
  try {
    const text = await (await post('/api/plan', brief)).text();
    assert.match(text, /"type":"error"/); assert.doesNotMatch(text, /private save detail/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM judge_cases').get().n, before);
    assert.deepEqual(counters().map(row => row.count), [0, 0, 0]);
  } finally { db.exec('DROP TRIGGER reject_plan_save'); }
});
