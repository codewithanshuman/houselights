// "Plan your show": a visitor names a city, up to three artists their audience loves, a budget
// and a number of acts. A capped live Qloo run discovers and ranks similar artists in that city,
// the exact optimizer picks the bill, and the result is saved as a shareable live plan that
// every judge experiment (Qloo off, budget cut, cancellation, receipts) works on.
import { createHash } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { Run, isMock } from './qloo.mjs';
import { buildMemo } from './agent.mjs';
import { consumeQuota, refundQuota } from './database.mjs';
import { saveLivePlan } from './judge.mjs';
import { locatePlace, nearPlace, summarizePlace } from './place-check.mjs';
import { CURRENCIES, usdRate } from './fx.mjs';

import { estimateFee } from './fee-tiers.mjs';
export { FEE_TIERS, estimateFee } from './fee-tiers.mjs';
export const LIVE_TERMS = 'Estimated fees: each act’s fee is an illustrative tier from its Qloo popularity, not a quote, and availability is assumed. Genre limits are not applied in live plans because per-act genres are unverified. This is a planning experiment, not a booking or a sales forecast. Unpublished visitor plans expire after 7 days unless retained by an audit or evaluation.';

const fault = (message, status = 400) => Object.assign(new Error(message), { status });
const clean = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
export const MAX_ANCHORS = 3;
const idPattern = /^[A-Za-z0-9-]{1,80}$/;
export function planInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fault('Send a city, an artist, a budget and a number of acts.');
  const city = clean(body.city, 60);
  if (city.length < 2) throw fault('Enter a city.');
  // One artist (anchor) or up to three (anchors). Repeats are dropped, case-insensitively.
  if (body.anchors !== undefined && (!Array.isArray(body.anchors) || body.anchors.length > MAX_ANCHORS)) throw fault(`Name up to ${MAX_ANCHORS} artists your audience loves.`);
  const anchors = [];
  for (const name of (body.anchors ?? [body.anchor]).map(value => clean(value, 80)).filter(Boolean))
    if (!anchors.some(seen => seen.toLowerCase() === name.toLowerCase())) anchors.push(name);
  if (!anchors.length) throw fault('Enter an artist your audience loves.');
  const anchor = anchors[0];
  const budget = Number(body.budget), slots = Number(body.slots);
  const currency = body.currency === undefined ? 'USD' : String(body.currency);
  if (!CURRENCIES.includes(currency)) throw fault('Choose USD, INR, EUR or GBP.');
  // The range is in US dollars; a local budget is checked after conversion.
  if (!Number.isFinite(budget) || budget <= 0 || (currency === 'USD' && (budget < 1000 || budget > 500000))) throw fault('Artist budget must be between $1,000 and $500,000.');
  if (!Number.isInteger(slots) || slots < 1 || slots > 4) throw fault('Choose 1 to 4 acts.');
  // A pick settles which Qloo entity an ambiguous name means: anchorId for the first artist,
  // or picks keyed by artist name.
  const picks = {};
  if (typeof body.anchorId === 'string' && idPattern.test(body.anchorId)) picks[anchor] = { id: body.anchorId };
  if (body.picks && typeof body.picks === 'object' && !Array.isArray(body.picks))
    for (const [name, id] of Object.entries(body.picks)) {
      const match = anchors.find(value => value.toLowerCase() === clean(name, 80).toLowerCase());
      if (match && typeof id === 'string' && idPattern.test(id)) picks[match] = { id };
    }
  return { city, anchor, anchors, picks, anchorId: picks[anchor]?.id ?? null, budget: Math.round(budget), slots, currency };
}

export function planVisitorKey(address) {
  let identity = 'unknown';
  try {
    const parsed = ipaddr.process(address ?? '');
    identity = parsed.kind() === 'ipv6'
      ? `ipv6:${parsed.toByteArray().slice(0, 8).map(byte => byte.toString(16).padStart(2, '0')).join('')}/64`
      : parsed.toString();
  } catch { /* Invalid addresses share one conservative bucket. */ }
  return createHash('sha256').update(identity).digest('hex');
}
export function publicPlanDailyCap() {
  if (process.env.PUBLIC_PLAN_DAILY_CAP === undefined) return 40;
  const cap = Number(process.env.PUBLIC_PLAN_DAILY_CAP);
  return Number.isSafeInteger(cap) && cap >= 0 ? cap : 0;
}
const PLAN_BUDGET = 12, PLAN_DEADLINE_MS = 120000;
const listNames = names => names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

export function registerLivePlanRoutes(app, { memoBuilder = buildMemo } = {}) {
  app.post('/api/plan', async (req, res) => {
    let input;
    try { input = planInput(req.body); } catch (error) { return res.status(error.status ?? 400).json({ error: error.message }); }
    if (!isMock() && !process.env.QLOO_API_KEY) return res.status(503).json({ error: 'Live Qloo research is not configured on this server. Open an example plan instead.' });
    // Local budgets convert at a published rate; without one the plan is refused, never guessed.
    let fx;
    try { fx = await usdRate(input.currency); } catch (error) { return res.status(error.status ?? 503).json({ error: error.message }); }
    const budgetUsd = input.budget / fx.rate;
    if (budgetUsd < 999.5 || budgetUsd > 500000.5) return res.status(400).json({ error: `Artist budget must be about $1,000 to $500,000, which is ${Math.ceil(1000 * fx.rate).toLocaleString('en-US')} to ${Math.floor(500000 * fx.rate).toLocaleString('en-US')} ${input.currency} today.` });
    const now = Date.now(), tenMinutes = Math.floor(now / 6e5), day = Math.floor(now / 864e5);
    const who = planVisitorKey(req.ip);
    const quotaRules = [
      { key: `plan:${tenMinutes}:${who}`, limit: 3, expires: (tenMinutes + 1) * 6e5 },
      { key: `plan-day:${day}:${who}`, limit: 10, expires: (day + 1) * 864e5 },
      { key: `plan-global:${day}`, limit: publicPlanDailyCap(), expires: (day + 1) * 864e5 },
    ];
    if (!consumeQuota(quotaRules, now)) {
      res.set('Retry-After', String(Math.max(60, Math.ceil(((tenMinutes + 1) * 6e5 - now) / 1000))));
      return res.status(429).json({ error: 'Live plans are limited to 3 every 10 minutes per visitor, and a shared daily cap protects the Qloo quota. Open an example plan meanwhile.' });
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const trace = [], startedAt = Date.now();
    let choose = null, saved = false;
    const send = event => { if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`); };
    const emit = event => {
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
      // Which acts the agent will check in depth, and why: names only, no evidence.
      else if (event.type === 'plan' && event.checks) send({ type: 'research', checks: event.checks });
    };
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 15000);
    try {
      emit({ type: 'start', mock: isMock() });
      send({ type: 'start', synthetic: isMock(), budget: PLAN_BUDGET });
      // Confirm the place before any Qloo call. Synthetic runs have no real place to check.
      const place = isMock() ? { status: 'unchecked' } : await locatePlace(input.city);
      if (place.status === 'not-found') { send({ type: 'error', text: `We could not find “${input.city}” on the map. Check the spelling, or add the region or country, for example “Akole, Maharashtra”.` }); return; }
      const run = new Run({ budget: PLAN_BUDGET, emit, deadlineMs: PLAN_DEADLINE_MS, receiptPrefix: 'q' });
      const memo = await memoBuilder({
        city: input.city, anchors: input.anchors, offers: [], terms: {}, picks: input.picks,
        constraints: { budget: input.budget, slots: input.slots, discoveryMin: 0, maxPerGenre: input.slots, riskTolerance: 50, lockedIds: [], excludedIds: [] },
        currency: input.currency, exampleBookingTerms: true,
        discover: { limit: 8, research: 'value-of-information', ...(place.status === 'found' ? { nearPlace: rows => nearPlace(place, rows) } : {}), terms: row => {
          const fee = estimateFee(typeof row?.popularity === 'number' ? row.popularity : row?.query?.popularity);
          return fee == null ? null : { fee: Math.round(fee * fx.rate), available: true, genre: '' };
        } },
      }, run);
      if (!memo) {
        if (choose && choose.options.length) send({ type: 'choose', name: choose.name, options: choose.options });
        else send({ type: 'error', text: `Qloo could not confirm ${input.anchors.length > 1 ? 'these artists' : `“${input.anchor}”`} or find similar artists in ${input.city}. Check the spelling or try a better-known artist.` });
        return;
      }
      // Every named artist must be confirmed: a plan titled for three audiences cannot quietly
      // rest on two. An ambiguous name asks which one was meant; nothing is saved.
      if (choose && choose.options.length) { send({ type: 'choose', name: choose.name, options: choose.options }); return; }
      const unresolved = (memo.caveats ?? []).find(text => text.startsWith('Unresolved or unavailable artists: '));
      if (unresolved) { send({ type: 'error', text: `Qloo could not confirm ${unresolved.slice(35, -1)}. Check the spelling or remove that artist.` }); return; }
      if (memo.items.length < 2) { send({ type: 'error', text: `Qloo found fewer than two similar artists for ${input.city}. A comparison needs at least two candidates, even for a one-act show. Try a better-known artist or a larger city.` }); return; }
      const source = { input: memo.input, mock: memo.mode === 'mock', receipts: run.receipts, memo, trace };
      const record = saveLivePlan(source, { title: `${input.city}: fans of ${listNames(input.anchors)}`, terms: fx.rate === 1 ? LIVE_TERMS : `${LIVE_TERMS} Fee tiers are in US dollars, converted at 1 USD = ${fx.rate} ${input.currency} (${fx.source}, ${fx.date}).`, ...(fx.rate === 1 ? {} : { fx: { currency: input.currency, rate: fx.rate, date: fx.date } }), feeBasis: 'estimated-from-qloo-popularity', ...(place.status === 'unchecked' ? {} : { place: summarizePlace(place, run.receipts) }) });
      saved = true;
      send({ type: 'ready', id: record.id, synthetic: record.snapshot.mock === true, calls: run.used });
    } catch (error) {
      if (!res.destroyed) send({ type: 'error', text: error?.status ? error.message : 'The live plan could not complete. No booking was made. Try again, or open an example plan.' });
      if (!error?.status) console.error(JSON.stringify({ level: 'error', msg: 'live plan failed', requestId: req.id }));
    } finally {
      clearInterval(heartbeat);
      // A client disconnect does not cancel bounded work or erase its result.
      // Unsuccessful runs return their plan reservation, not spent Qloo attempts.
      if (!saved) {
        try { refundQuota(quotaRules); }
        catch { console.error(JSON.stringify({ level: 'error', msg: 'live plan quota refund failed', requestId: req.id })); }
      }
      if (!res.destroyed && !res.writableEnded) res.end();
    }
  });
}
