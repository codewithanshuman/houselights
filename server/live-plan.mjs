// "Plan your show": a visitor names a city, an artist their audience loves, a budget and a
// number of acts. A capped live Qloo run discovers and ranks similar artists in that city,
// the exact optimizer picks the bill, and the result is saved as a shareable live plan that
// every judge experiment (Qloo off, budget cut, cancellation, receipts) works on.
import { createHash } from 'node:crypto';
import { Run, isMock } from './qloo.mjs';
import { buildMemo } from './agent.mjs';
import { consumeQuota } from './database.mjs';
import { saveLivePlan } from './judge.mjs';

// Qloo returns no booking fees. A discovered act's fee is an illustrative tier from its Qloo
// popularity percentile, labelled "estimated" wherever it is shown. Not a quote.
export const FEE_TIERS = [[0.995, 25000], [0.99, 15000], [0.98, 9000], [0.96, 6000], [0.93, 4000], [0.9, 2500], [0, 1500]];
export function estimateFee(popularity) {
  if (typeof popularity !== 'number' || !Number.isFinite(popularity) || popularity < 0 || popularity > 1) return null;
  return FEE_TIERS.find(([floor]) => popularity >= floor)[1];
}
export const LIVE_TERMS = 'Estimated fees: each act’s fee is an illustrative tier from its Qloo popularity, not a quote, and availability is assumed. This is a planning experiment, not a booking or a sales forecast.';

const fault = (message, status = 400) => Object.assign(new Error(message), { status });
const clean = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
export function planInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fault('Send a city, an artist, a budget and a number of acts.');
  const city = clean(body.city, 60), anchor = clean(body.anchor, 80);
  if (city.length < 2) throw fault('Enter a city.');
  if (anchor.length < 1) throw fault('Enter an artist your audience loves.');
  const budget = Number(body.budget), slots = Number(body.slots);
  if (!Number.isFinite(budget) || budget < 1000 || budget > 500000) throw fault('Artist budget must be between $1,000 and $500,000.');
  if (!Number.isInteger(slots) || slots < 1 || slots > 4) throw fault('Choose 1 to 4 acts.');
  const anchorId = typeof body.anchorId === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(body.anchorId) ? body.anchorId : null;
  return { city, anchor, anchorId, budget: Math.round(budget), slots };
}

const dailyCap = () => Math.max(1, Math.floor(Number(process.env.PUBLIC_PLAN_DAILY_CAP) || 40));
const PLAN_BUDGET = 12, PLAN_DEADLINE_MS = 120000;

export function registerLivePlanRoutes(app) {
  app.post('/api/plan', async (req, res) => {
    let input;
    try { input = planInput(req.body); } catch (error) { return res.status(error.status ?? 400).json({ error: error.message }); }
    if (!isMock() && !process.env.QLOO_API_KEY) return res.status(503).json({ error: 'Live Qloo research is not configured on this server. Open an example plan instead.' });
    const now = Date.now(), tenMinutes = Math.floor(now / 6e5), day = Math.floor(now / 864e5);
    const who = createHash('sha256').update(req.ip ?? 'unknown').digest('hex');
    if (!consumeQuota([
      { key: `plan:${tenMinutes}:${who}`, limit: 3, expires: (tenMinutes + 1) * 6e5 },
      { key: `plan-day:${day}:${who}`, limit: 10, expires: (day + 1) * 864e5 },
      { key: `plan-global:${day}`, limit: dailyCap(), expires: (day + 1) * 864e5 },
    ], now)) {
      res.set('Retry-After', String(Math.max(60, Math.ceil(((tenMinutes + 1) * 6e5 - now) / 1000))));
      return res.status(429).json({ error: 'Live plans are limited to 3 every 10 minutes per visitor, and a shared daily cap protects the Qloo quota. Open an example plan meanwhile.' });
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const trace = [], startedAt = Date.now();
    let choose = null;
    const send = event => { if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`); };
    const emit = event => {
      if (res.destroyed) throw new Error('Client disconnected');
      if (['start', 'stage', 'receipt', 'plan', 'needs_input', 'memo'].includes(event.type) && trace.length < 100) {
        trace.push({ elapsedMs: Date.now() - startedAt, type: event.type, text: String(event.text || event.reason || '').slice(0, 240),
          receiptId: event.receipt?.id || null, tool: event.receipt?.tool || null, status: event.receipt?.status || null,
          source: event.receipt?.source || null, ms: event.receipt?.ms ?? null, mock: event.type === 'start' ? event.mock === true : undefined,
          by: event.type === 'plan' ? event.by : undefined, deep: event.type === 'plan' && Array.isArray(event.deep) ? event.deep.slice(0, 4) : undefined,
          feasible: event.type === 'memo' ? event.slate?.feasible === true : undefined });
      }
      // The visitor sees progress, not raw evidence: stage text and each Qloo call's tool and status.
      if (event.type === 'stage') send({ type: 'stage', text: event.text });
      else if (event.type === 'receipt') send({ type: 'call', id: event.receipt.id, tool: event.receipt.tool, status: event.receipt.status, cached: event.receipt.cached, count: event.receipt.count ?? null, used: event.budget?.used, max: event.budget?.max });
      else if (event.type === 'needs_input' && !choose) choose = { name: event.name, options: (event.candidates ?? []).slice(0, 5) };
    };
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 15000);
    try {
      emit({ type: 'start', mock: isMock() });
      send({ type: 'start', synthetic: isMock(), budget: PLAN_BUDGET });
      const run = new Run({ budget: PLAN_BUDGET, emit, deadlineMs: PLAN_DEADLINE_MS, receiptPrefix: 'q' });
      const memo = await buildMemo({
        city: input.city, anchors: [input.anchor], offers: [], terms: {},
        picks: input.anchorId ? { [input.anchor]: { id: input.anchorId } } : {},
        constraints: { budget: input.budget, slots: input.slots, discoveryMin: 0, maxPerGenre: input.slots, riskTolerance: 50, lockedIds: [], excludedIds: [] },
        currency: 'USD', exampleBookingTerms: true,
        discover: { limit: 8, terms: row => {
          const fee = estimateFee(typeof row?.popularity === 'number' ? row.popularity : row?.query?.popularity);
          return fee == null ? null : { fee, available: true, genre: '' };
        } },
      }, run);
      if (!memo) {
        if (choose && choose.options.length) send({ type: 'choose', name: choose.name, options: choose.options });
        else send({ type: 'error', text: `Qloo could not confirm “${input.anchor}” or find similar artists in ${input.city}. Check the spelling or try a better-known artist.` });
        return;
      }
      if (memo.items.length < 2) { send({ type: 'error', text: `Qloo found fewer than two similar artists for ${input.city}. Try a better-known artist or a larger city.` }); return; }
      const source = { input: memo.input, mock: memo.mode === 'mock', receipts: run.receipts, memo, trace };
      const record = saveLivePlan(source, { title: `${input.city}: fans of ${input.anchor}`, terms: LIVE_TERMS, feeBasis: 'estimated-from-qloo-popularity' });
      send({ type: 'ready', id: record.id, synthetic: record.snapshot.mock === true, calls: run.used });
    } catch (error) {
      if (!res.destroyed) send({ type: 'error', text: error?.status ? error.message : 'The live plan could not complete. No booking was made. Try again, or open an example plan.' });
      if (!error?.status) console.error(JSON.stringify({ level: 'error', msg: 'live plan failed', requestId: req.id, error: String(error?.message ?? error).slice(0, 300) }));
    } finally { clearInterval(heartbeat); res.end(); }
  });
}
