import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.QLOO_MODE = 'mock';
process.env.LLM_MODE = 'off';
process.env.ACCESS_LOG = 'off';
process.env.PUBLIC_DEMO = '1';
const dir = mkdtempSync(join(tmpdir(), 'houselights-tools-'));
process.env.DATA_DIR = dir;
const { createApp } = await import('../server/app.mjs');
const { loadJudgeCase } = await import('../server/judge.mjs');
const { db } = await import('../server/database.mjs');
const server = createApp().listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }); });
const post = (path, body) => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
let opened;
async function openPlan() {
  if (opened) return opened;
  const response = await post('/api/plan', { city: 'Leeds', anchor: 'Arlo Parks', budget: 12000, slots: 2 });
  const events = (await response.text()).split('\n\n').filter(chunk => chunk.startsWith('data: ')).map(chunk => JSON.parse(chunk.slice(6)));
  const caseId = events.at(-1).id, source = await post(`/api/judge/cases/${caseId}/source`, {});
  assert.equal(source.status, 201);
  return opened = { caseId, sourceId: (await source.json()).id };
}
const demandRequest = (sourceId, record) => {
  const { memo } = record.snapshot;
  return { sourceId, brief: { city: memo.input.city, eventDate: '2027-05-01', capacity: 2000, ticketPrice: 40, currency: memo.currency ?? 'USD', genre: 'Indie', competitionCount: 0 },
    constraints: { budget: memo.constraints.budget, slots: memo.constraints.slots, maxPerGenre: memo.constraints.maxPerGenre ?? 2 },
    candidates: memo.items.map(item => ({ id: item.id, name: item.name, fee: item.terms.fee, genre: item.terms.genre || 'Indie', available: true })) };
};

test('a visitor can open a published plan once, as an unpinned source, with no ID to find', async () => {
  const { caseId, sourceId } = await openPlan();
  const again = await post(`/api/judge/cases/${caseId}/source`, {});
  assert.equal(again.status, 200);
  assert.equal((await again.json()).id, sourceId, 'the same plan is not copied twice');
  assert.equal(db.prepare('SELECT pinned FROM snapshots WHERE id=?').get(sourceId).pinned, 0);
  assert.equal((await fetch(`${url}/api/memo/${sourceId}`)).status, 200);
  assert.equal((await post(`/api/judge/cases/${'0'.repeat(24)}/source`, {})).status, 404);
});

test('the Demand Lab calculates for a visitor, and the real-outcomes record stays closed', async () => {
  const { caseId, sourceId } = await openPlan(), request = demandRequest(sourceId, loadJudgeCase(caseId));
  const before = db.prepare('SELECT count(*) AS n FROM demand_outcomes').get().n;
  const planned = await post('/api/demand/plan', request);
  assert.equal(planned.status, 200, await planned.clone().text());
  assert.equal((await planned.json()).sourceClassification, 'synthetic', 'the mock source says so');
  assert.equal((await post('/api/demand/plan', { ...request, save: true })).status, 401);
  assert.equal((await post('/api/demand/outcomes', { forecastId: 'x', paidTicketsSold: 900 })).status, 401);
  assert.equal((await post('/api/demand/historical-events', {})).status, 401);
  assert.equal(db.prepare('SELECT count(*) AS n FROM demand_outcomes').get().n, before);
});

test('a visitor can build a season without pinning anything, and can recover from a cancellation', async () => {
  const { sourceId } = await openPlan();
  const raw = { budget: 40000, maxBookingsPerArtist: 2, events: ['01', '15'].map((day, index) => ({ id: `e${index}`, sourceId, name: `Night ${index}`, start: `2027-04-${day}T18:00:00Z`, end: `2027-04-${day}T23:00:00Z`, resource: 'Hall', fixedCost: 0, depositPercent: 20, depositAt: '2027-03-01T12:00:00Z' })) };
  const built = await post('/api/portfolios', raw);
  assert.equal(built.status, 201, await built.clone().text());
  const portfolio = await built.json();
  assert.equal(db.prepare('SELECT pinned FROM snapshots WHERE id=?').get(sourceId).pinned, 0);
  const [event] = portfolio.events;
  assert.equal((await post(`/api/portfolios/${portfolio.id}/recover`, { eventId: event.eventId, artistId: event.selectedIds[0] })).status, 201);
});

test('a visitor can run the Festival GM on a saved plan, but not the costliest research', async () => {
  const { sourceId } = await openPlan();
  const run = await post(`/api/gm/${sourceId}/run`, {});
  assert.equal(run.status, 201, await run.clone().text());
  const { id } = await run.json();
  assert.equal(db.prepare('SELECT pinned FROM snapshots WHERE id=?').get(id).pinned, 0);
  assert.equal((await post(`/api/gm/${sourceId}/run`, {})).status, 429, 'one festival run a minute');
  assert.equal((await post(`/api/gm/${sourceId}/benchmark`, {})).status, 401);
  assert.equal((await post(`/api/gm/${sourceId}/season-research`, {})).status, 401);
  assert.equal((await post('/api/events', {})).status, 401);
  assert.equal((await post('/api/experiments', {})).status, 401);
});
