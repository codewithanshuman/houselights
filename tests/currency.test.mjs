import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.QLOO_MODE = 'mock';
process.env.LLM_MODE = 'off';
process.env.ACCESS_LOG = 'off';
process.env.PUBLIC_DEMO = '1';
const dir = mkdtempSync(join(tmpdir(), 'houselights-fx-'));
process.env.DATA_DIR = dir;
const { createApp } = await import('../server/app.mjs');
const { usdRate, clearRates } = await import('../server/fx.mjs');
const { planInput } = await import('../server/live-plan.mjs');
const { loadJudgeCase } = await import('../server/judge.mjs');
const { caseAssumptions, caseFinancialRequest } = await import('../server/financial/case-scenario.mjs');
const { feeModel } = await import('../server/robustness.mjs');
const { db } = await import('../server/database.mjs');
const server = createApp().listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }); });
const rates = async () => ({ ok: true, json: async () => ({ date: '2026-10-29', rates: { INR: 95.27, EUR: 0.9, GBP: 0.75 } }) });
const realFetch = globalThis.fetch;
const withRates = async run => {
  clearRates();
  globalThis.fetch = (input, options) => String(input).includes('frankfurter') ? rates() : realFetch(input, options);
  try { await run(); } finally { globalThis.fetch = realFetch; }
};
const plan = body => realFetch(`${url}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('a rate comes from the service or not at all', async () => {
  clearRates();
  assert.equal((await usdRate('USD')).rate, 1);
  assert.equal((await usdRate('INR', { fetcher: rates })).rate, 95.27);
  clearRates();
  await assert.rejects(usdRate('INR', { fetcher: async () => { throw new Error('offline'); } }), /unavailable/);
  await assert.rejects(usdRate('INR', { fetcher: async () => ({ ok: true, json: async () => ({ rates: {} }) }) }), /unavailable/);
  clearRates();
  await assert.rejects(usdRate('JPY', { fetcher: rates }), /USD, INR, EUR or GBP/);
  assert.equal(planInput({ city: 'Pune', anchor: 'A', budget: 2000000, slots: 2, currency: 'INR' }).currency, 'INR');
  assert.throws(() => planInput({ city: 'Pune', anchor: 'A', budget: 20000, slots: 2, currency: 'JPY' }), /USD, INR/);
});

test('a plan in rupees converts every estimated fee at the stated rate and says so', () => withRates(async () => {
  const response = await plan({ city: 'Pune', anchor: 'Arlo Parks', budget: 1900000, slots: 2, currency: 'INR' });
  const events = (await response.text()).split('\n\n').filter(chunk => chunk.startsWith('data: ')).map(chunk => JSON.parse(chunk.slice(6)));
  assert.equal(events.at(-1).type, 'ready', JSON.stringify(events.at(-1)));
  const record = loadJudgeCase(events.at(-1).id), memo = record.snapshot.memo;
  assert.equal(memo.currency, 'INR');
  assert.deepEqual(record.fx, { currency: 'INR', rate: 95.27, date: '2026-10-29' });
  assert.match(record.terms, /1 USD = 95.27 INR/);
  assert.ok(memo.items.every(item => Math.abs(item.terms.fee / 95.27 - Math.round(item.terms.fee / 95.27 / 500) * 500) < 1), 'each fee is a dollar tier times the rate');
  assert.equal(feeModel(record.snapshot, { feeBasis: record.feeBasis, fxRate: 95.27 }).name, 'popularity-tiers', 'fee scenarios still move across real tiers');
  const assumptions = caseAssumptions(record), request = caseFinancialRequest(record, assumptions);
  assert.equal(assumptions.ticketPrice, 1500, 'a local default, not a converted dollar price');
  assert.equal(request.financial.currency, 'INR');
  assert.throws(() => caseAssumptions(record, { ticketPrice: 1e9 }), /ticketPrice/);
}));

test('a budget outside the range is refused in its own currency', () => withRates(async () => {
  const response = await plan({ city: 'Pune', anchor: 'Arlo Parks', budget: 20000, slots: 2, currency: 'INR' });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /INR today/);
}));
