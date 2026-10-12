import express from 'express';
import { fileURLToPath } from 'node:url';
import { Run, isMock } from './qloo.mjs';
import { buildMemo, defaultConstraints } from './agent.mjs';
import { optimizeSlate } from './optimizer.mjs';
import { analyzeSlate } from './analysis.mjs';
import { evaluateGauntlet } from './gauntlet.mjs';
import { buildContingencyPlan } from './contingency.mjs';
import { hasLLM } from './llm.mjs';
import * as store from './store.mjs';

const pub = fileURLToPath(new URL('../public', import.meta.url));
const list = (value, max) => [...new Set((Array.isArray(value) ? value : String(value || '').split(',')).map(s => String(s).trim().slice(0, 100)).filter(Boolean))].slice(0, max);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const positiveInteger = (value, fallback) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;

function bookingInput(body) {
  const b = object(body) ? body : {};
  const city = String(b.city || '').trim().slice(0, 100), anchors = list(b.anchors, 3), offers = list(b.offers, 6);
  if (!city || !anchors.length || !offers.length) throw new Error('Provide a city, 1–3 anchor artists and 1–6 offers.');
  const picks = Object.fromEntries(Object.entries(object(b.picks) ? b.picks : {}).slice(0, 9)
    .map(([key, value]) => [key.slice(0, 100), { name: String(value?.name || '').slice(0, 180), id: String(value?.id || '').slice(0, 180) }]));
  const terms = Object.fromEntries(Object.entries(object(b.terms) ? b.terms : {}).slice(0, 12).map(([key, value]) => {
    if (value?.fee != null && (typeof value.fee !== 'number' || !Number.isFinite(value.fee) || value.fee < 0 || value.fee > 1e9)) throw new Error('Artist fees must be non-negative amounts, or left unknown.');
    return [key.slice(0, 180), { fee: value?.fee ?? null, genre: String(value?.genre || '').trim().slice(0, 60), available: value?.available === true }];
  }));
  const constraints = { ...defaultConstraints, ...(object(b.constraints) ? b.constraints : {}), lockedIds: [], excludedIds: [] };
  const validation = optimizeSlate([], constraints);
  if (validation.status === 'invalid') throw new Error(validation.reasons.join(' '));
  return { city, anchors, offers, picks, terms, constraints, exampleBookingTerms: b.exampleBookingTerms === true, currency: ['GBP', 'USD', 'EUR', 'INR'].includes(b.currency) ? b.currency : 'GBP' };
}

function trustedScenarioInput(source, body, label) {
  if (!object(body.terms) || Object.keys(body.terms).some(id => !source.memo.items.some(item => item.id === id))) {
    return { error: `${label} terms must refer to artists from the saved run.` };
  }
  const items = source.memo.items.map(item => {
    const edit = body.terms[item.id];
    if (!edit) return item;
    return { ...item, terms: { fee: edit.fee ?? null, genre: String(edit.genre || '').trim().slice(0, 60), available: edit.available === true } };
  });
  if (items.some(item => item.terms.fee != null && (typeof item.terms.fee !== 'number' || !Number.isFinite(item.terms.fee) || item.terms.fee < 0 || item.terms.fee > 1e9))) {
    return { error: 'Fees must be valid non-negative amounts or unknown.' };
  }
  return { items, constraints: object(body.constraints) ? body.constraints : source.memo.constraints };
}

export function createApp() {
  const app = express(), hits = new Map(), scenarioHits = new Map();
  let day = { date: '', count: 0, scenarioCount: 0 };
  const resetDay = () => { const date = new Date().toISOString().slice(0, 10); if (day.date !== date) day = { date, count: 0, scenarioCount: 0 }; };
  const dailyCap = positiveInteger(process.env.DAILY_MEMO_CAP, 150);
  const budget = Math.min(60, positiveInteger(process.env.CALL_BUDGET, 30));
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'no-referrer'); next(); });
  app.use(express.json({ limit: '160kb' }));
  app.use(express.static(pub));
  app.get('/healthz', (_req, res) => res.json({ ok: true, version: '0.5.0', mock: isMock(), keyed: !!process.env.QLOO_API_KEY, llm: hasLLM() }));
  app.get('/m/:id', (_req, res) => res.sendFile(pub + '/index.html'));
  app.get('/api/memo/:id', (req, res) => {
    const snapshot = store.load(req.params.id);
    res.set('Cache-Control', 'no-store');
    return snapshot ? res.json(snapshot) : res.status(404).json({ error: 'Saved run not found.' });
  });
  app.post('/api/optimize', (req, res) => {
    if (!Array.isArray(req.body?.items) || req.body.items.length > 10) return res.status(400).json({ error: 'Provide at most 10 candidates.' });
    const result = optimizeSlate(req.body.items, req.body.constraints);
    return result.status === 'invalid' ? res.status(400).json({ error: result.reasons.join(' '), ...result }) : res.json(result);
  });
  app.post('/api/analyze', (req, res) => {
    if (!Array.isArray(req.body?.items) || req.body.items.length > 10) return res.status(400).json({ error: 'Provide at most 10 candidates.' });
    const result = analyzeSlate(req.body.items, req.body.constraints);
    return result.baseline.status === 'invalid' ? res.status(400).json({ error: result.warnings?.join(' ') || 'Invalid scenario inputs.', ...result }) : res.json(result);
  });
  app.post('/api/gauntlet', (req, res) => {
    const b = object(req.body) ? req.body : {}, source = store.load(String(b.sourceId || ''));
    if (!source) return res.status(404).json({ error: 'The source run was not found. Build a slate before entering the Decision Gauntlet.' });
    const { error, items, constraints } = trustedScenarioInput(source, b, 'Gauntlet');
    if (error) return res.status(400).json({ error });
    const result = evaluateGauntlet(items, constraints, source.input?.constraints || source.memo.input?.constraints || source.memo.constraints);
    return result.slate.status === 'invalid' ? res.status(400).json({ error: result.slate.reasons.join(' '), ...result }) : res.json(result);
  });
  app.post('/api/contingency', (req, res) => {
    const b = object(req.body) ? req.body : {}, source = store.load(String(b.sourceId || ''));
    if (!source) return res.status(404).json({ error: 'The source run was not found. Build a slate before generating a contingency plan.' });
    const { error, items, constraints } = trustedScenarioInput(source, b, 'Contingency');
    if (error) return res.status(400).json({ error });
    const result = buildContingencyPlan(items, constraints);
    return result.baseline.status === 'invalid' ? res.status(400).json({ error: result.baseline.reasons.join(' '), ...result }) : res.json(result);
  });
  app.post('/api/scenario', (req, res) => {
    const b = object(req.body) ? req.body : {}, source = store.load(String(b.sourceId || ''));
    if (!source) return res.status(404).json({ error: 'The source run was not found. Build a new slate before saving a scenario.' });
    const { error, items, constraints } = trustedScenarioInput(source, b, 'Scenario');
    if (error) return res.status(400).json({ error });
    const slate = optimizeSlate(items, constraints);
    if (slate.status === 'invalid') return res.status(400).json({ error: slate.reasons.join(' ') });
    resetDay();
    const now = Date.now();
    for (const [ip, times] of scenarioHits) if (times.every(time => now - time >= 60000)) scenarioHits.delete(ip);
    const recent = (scenarioHits.get(req.ip) || []).filter(time => now - time < 60000);
    if (recent.length >= 12 || day.scenarioCount >= 200) return res.status(429).json({ error: 'Scenario save limit reached. Existing evidence can still be re-optimized and exported.' });
    scenarioHits.set(req.ip, [...recent, now]); day.scenarioCount++;
    const normalizedConstraints = slate.constraints;
    const currency = ['GBP', 'USD', 'EUR', 'INR'].includes(b.currency) ? b.currency : source.memo.currency;
    const exampleBookingTerms = source.memo.exampleBookingTerms === true || source.input?.exampleBookingTerms === true;
    const terms = { ...source.input?.terms, ...Object.fromEntries(items.flatMap(item =>
      [...new Set([item.originalName, item.name].filter(Boolean))].map(name => [name, item.terms]))) };
    const snapshot = {
      ...source, id: undefined, createdAt: undefined, parentId: source.id, scenario: true,
      scenarioName: String(b.name || 'Alternative slate').trim().slice(0, 80),
      input: { ...source.input, currency, exampleBookingTerms, constraints: normalizedConstraints, terms },
      memo: { ...source.memo, currency, exampleBookingTerms, input: { ...source.memo.input, currency, exampleBookingTerms, constraints: normalizedConstraints }, items, constraints: normalizedConstraints, slate }
    };
    const id = store.save(snapshot);
    return res.status(201).json({ id, snapshot: store.load(id) });
  });
  app.post('/api/memo', async (req, res) => {
    let input;
    try { input = bookingInput(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
    if (!isMock() && !process.env.QLOO_API_KEY) return res.status(503).json({ error: 'Set QLOO_API_KEY in the server environment, or use npm run dev for clearly labeled synthetic data.' });
    const now = Date.now();
    resetDay();
    for (const [key, times] of hits) if (times.every(t => now - t >= 60000)) hits.delete(key);
    const recent = (hits.get(req.ip) || []).filter(t => now - t < 60000);
    if (recent.length >= 4 || day.count >= dailyCap) return res.status(429).json({ error: 'Run limit reached. Try again later. Re-optimizing existing evidence does not spend Qloo calls.' });
    hits.set(req.ip, [...recent, now]); day.count++;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const emit = event => { if (res.destroyed) throw new Error('Client disconnected'); res.write(`data: ${JSON.stringify(event)}\n\n`); };
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 15000);
    try {
      emit({ type: 'start', mock: isMock() });
      const run = new Run({ budget, emit });
      const memo = await buildMemo(input, run);
      if (memo && !res.destroyed) emit({ type: 'saved', id: store.save({ input, mock: memo.mode === 'mock', receipts: run.receipts, memo }) });
    } catch {
      if (!res.destroyed) emit({ type: 'error', text: 'The run could not complete. Review the last receipt and try again. No booking was made.' });
    } finally { clearInterval(heartbeat); res.end(); }
  });
  app.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : 400).json({ error: error.status === 413 ? 'Request is too large.' : 'Invalid request body.' }));
  return app;
}
