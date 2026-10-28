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
  const html = await response.text();
  assert.match(html, /Error 404: this page does not exist/);
  assert.match(html, /Back to home<\/a>/);
});

test('rate limits say when to retry', async t => {
  let instant=Date.now();t.mock.method(Date,'now',()=>instant);
  db.prepare('DELETE FROM quotas').run();
  const id = seed.caseIds[0];
  let last;
  for (let i = 0; i < 21; i++) last = await fetch(`${url}/api/judge/cases/${id}/experiment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ budget: 1000 + i }) });
  assert.equal(last.status, 429);
  const retryAfter = Number(last.headers.get('retry-after'));
  assert.ok(retryAfter >= 1 && retryAfter <= 60, `Retry-After ${retryAfter}`);
  const body = await last.json();
  assert.match(body.error, /Experiment limit reached/);assert.ok(body.requestId);
  instant=(Math.floor(instant/60000)+1)*60000+1;
  const reset=await fetch(`${url}/api/judge/cases/${id}/experiment`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({budget:9999})});
  assert.equal(reset.status,200,'the next quota window accepts requests again');
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

test('a flood of forged ballots is rejected without storing anything, then rate-limited', async t => {
  // Keep this flood inside one quota window even if wall time crosses a minute.
  // The full number of real HTTP requests and all rate-limit assertions remain.
  const instant=Date.now();t.mock.method(Date,'now',()=>instant);
  db.prepare('DELETE FROM quotas').run();
  const before = db.prepare('SELECT COUNT(*) n FROM ballots').get().n;
  const statuses = [];
  for (let i = 0; i < 40; i++) {
    const response = await fetch(`${url}/api/reviews/study-${i}/ballot`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-review-token': `forged-token-${i}` }, body: JSON.stringify({ judgments: [{ caseId: 'x', preference: 'a', reason: 'flood' }] }) });
    statuses.push(response.status);
  }
  assert.ok(statuses.every(status => status >= 400 && status < 500), `no 5xx under a ballot flood: ${[...new Set(statuses)]}`);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ballots').get().n, before, 'no forged ballot is stored');
  // Sustained abuse from one address reaches the persistent per-IP limit.
  let limited = null;
  for (let i = 0; i < 200 && !limited; i++) { const response = await fetch(`${url}/api/reviews/flood/ballot`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); if (response.status === 429) limited = response; }
  assert.ok(limited, 'the per-IP limit engages');assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  db.prepare('DELETE FROM quotas').run();
});

test('the global experiment cap counts only new calculations, so cached answers still serve a busy room', async () => {
  db.prepare('DELETE FROM quotas').run();
  const id = seed.caseIds[1], post = body => fetch(`${url}/api/judge/cases/${id}/experiment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ qlooOff: true, budget: 11000 })).headers.get('x-cache'), 'miss');
  const minute = Math.floor(Date.now() / 60000);
  db.prepare('INSERT INTO quotas(key,count,expires) VALUES(?,60,?) ON CONFLICT(key) DO UPDATE SET count=60').run(`judge-global:${minute}`, (minute + 1) * 60000);
  const cached = await post({ qlooOff: true, budget: 11000 });
  assert.equal(cached.status, 200, 'a cached answer is served at the global cap');assert.equal(cached.headers.get('x-cache'), 'hit');
  const fresh = await post({ qlooOff: true, budget: 11100 });
  assert.equal(fresh.status, 429, 'a new calculation waits for the next minute');assert.ok(Number(fresh.headers.get('retry-after')) >= 1);
  db.prepare('DELETE FROM quotas').run();
});

test('pages are served with their navigation already in place: pill nav on the landing page, the app sidebar elsewhere, none on the 404 page', async () => {
  const desk = await (await fetch(`${url}/judge.html`)).text();
  assert.match(desk, /<header class="site-header" data-site-nav="booking"><nav class="site-nav"/);
  assert.match(desk, /<a href="\/judge.html" aria-current="page">Booking Desk<\/a>/);
  assert.match(desk, /Demand Lab and Audience Twin <span class="badge badge-warn">uncalibrated<\/span>/);
  const missing = await fetch(`${url}/no-such-page`);
  assert.equal(missing.status, 404);
  const missingHtml = await missing.text();
  assert.doesNotMatch(missingHtml, /site-nav|app-side/);
  const evidence = await (await fetch(`${url}/evidence.html`)).text();
  assert.match(evidence, /<body class="app-shell /);
  assert.match(evidence, /<header class="app-side" data-site-nav="evidence">/);
  assert.match(evidence, /<a class="app-row is-current" href="\/evidence.html" data-row aria-current="page">/);
  assert.doesNotMatch(evidence, /class="site-nav"/);
});

test('healthz reports disk headroom as a boolean only', async () => {
  const health = await (await fetch(`${url}/healthz`)).json();
  assert.equal(typeof health.diskOk, 'boolean');
  assert.ok(!JSON.stringify(health).match(/bytes|bavail|free/i), 'no disk figures are published');
});

test('unexpected parse errors never put private persisted content in HTTP responses or logs', async () => {
  const id='broken0001';
  db.prepare('INSERT INTO snapshots(id,body,created_at) VALUES(?,?,?)').run(id,'PRIVATE_EVIDENCE_MARKER not JSON',new Date().toISOString());
  const errors=[],original=console.error;
  console.error=(...args)=>errors.push(args.join(' '));
  try {
    const response=await fetch(`${url}/api/memo/${id}`);
    assert.equal(response.status,500);
    assert.ok(!(await response.text()).includes('PRIVATE_EVIDENCE_MARKER'));
    assert.ok(errors.length>0);
    assert.ok(!errors.join('\n').includes('PRIVATE_EVIDENCE_MARKER'));
  } finally {console.error=original;db.prepare('DELETE FROM snapshots WHERE id=?').run(id);}
});

test('only the landing page gets the server-rendered footer on the bridge drawing', async () => {
  const html = await (await fetch(`${url}/judge.html`)).text();
  assert.match(html, /<footer class="site-footer plan-footer" data-site-footer><picture class="footer-art">/);
  assert.match(html, /footer-bridge\.webp/);
  assert.match(html, /footer-qloo/);
  assert.doesNotMatch(html, /footer-legal|site-release/);
  for (const path of ['/evidence.html', '/proof-lab.html', '/workspace.html', '/no-such-page']) {
    const page = await (await fetch(`${url}${path}`)).text();
    assert.doesNotMatch(page, /data-site-footer/, path);
  }
});
