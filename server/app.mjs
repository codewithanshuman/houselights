import express from 'express';
import { fileURLToPath } from 'node:url';
import { Run, isMock } from './qloo.mjs';
import { buildMemo, defaultConstraints } from './agent.mjs';
import { optimizeSlate } from './optimizer.mjs';
import { analyzeSlate } from './analysis.mjs';
import { evaluateGauntlet } from './gauntlet.mjs';
import { buildContingencyPlan } from './contingency.mjs';
import { buildBookingPacket, tourCalendar } from './operations.mjs';
import { buildDossier, answerDossierQuestion, dossierHtml } from './dossier.mjs';
import { createPipeline, applyPipelineEvent } from './pipeline.mjs';
import { normalizeIntelligenceInput, buildCulturalIntelligence, intelligenceWorkflowCount } from './intelligence.mjs';
import { buildCampaign } from './campaign.mjs';
import { buildVenuePlan } from './venues.mjs';
import { buildCapacityResearch } from './capacity-evidence.mjs';
import { activationWorkflowCount, buildLocalActivation, normalizeActivationInput } from './activation.mjs';
import { hasLLM } from './llm.mjs';
import { registerGMRoutes } from './gm-api.mjs';
import { withoutDerived, preserveRankProvenance } from './gm.mjs';
import { accessMiddleware, canEdit, protectedMode, routeQuota } from './access.mjs';
import { requestContext, publicReadCache, unknownApiRoute, staticAssets, diskOk } from './http-hygiene.mjs';
import { registerReviewRoutes } from './reviews.mjs';
import { registerDecisionRoutes, requirePlanningApproval, authorizePipelineEvent } from './decision-room.mjs';
import { registerOperationalRoutes } from './operational-evidence.mjs';
import { commercialStress } from './commercial-stress.mjs';
import { buildDecisionProof, decisionFingerprint } from './decision-proof.mjs';
import { registerPortfolioRoutes } from './portfolio-api.mjs';
import { registerBenchmarkRoutes } from './benchmark-api.mjs';
import { registerResearchRoutes } from './research-api.mjs';
import { registerJudgeRoutes } from './judge.mjs';
import { registerLivePlanRoutes } from './live-plan.mjs';
import { dataRoot } from './database.mjs';
import { registerAutopilotRoutes } from './autopilot-api.mjs';
import { registerEventRoutes } from './events-api.mjs';
import { registerDemandRoutes } from './demand-api.mjs';
import { registerFinancialRoutes } from './financial/api.mjs';
import { registerExperimentRoutes } from './experiments/experiment-api.mjs';
import * as store from './store.mjs';
import * as pipelineStore from './pipeline-store.mjs';

const pub = fileURLToPath(new URL('../public', import.meta.url));
const list = (value, max) => [...new Set((Array.isArray(value) ? value : String(value || '').split(',')).map(s => String(s).trim().slice(0, 100)).filter(Boolean))].slice(0, max);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const positiveInteger = (value, fallback) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const receiptOffset = (snapshot, prefix) => (snapshot?.receipts || []).reduce((max, receipt) => {
  const match = String(receipt?.id || '').match(new RegExp(`^${prefix}(\\d+)$`));
  return match ? Math.max(max, Number(match[1])) : max;
}, 0);
export function classifyRequestError(error) {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  return { status, message: status === 500 ? 'The request could not be completed.' : error.message };
}
function sendProcessingError(res, error) {
  const { status, message } = classifyRequestError(error);
  if (status === 500) console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', requestId: res.req?.id ?? null, path: res.req?.path ?? null, message: 'Unexpected Houselights request failure', error: String(error?.stack ?? error).slice(0, 2000) }));
  return res.status(status).json({ error: message });
}

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
  const items = preserveRankProvenance(source).map(item => {
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
  const app = express();
  const dailyCap = positiveInteger(process.env.DAILY_MEMO_CAP, 150);
  const budget = Math.min(60, positiveInteger(process.env.CALL_BUDGET, 30));
  const intelligenceBudget = Math.min(60, positiveInteger(process.env.INTELLIGENCE_CALL_BUDGET, 60));
  app.disable('x-powered-by');
  app.use(requestContext);
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'no-referrer');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    next();
  });
  app.use(express.json({ limit: '160kb' }));
  app.use(accessMiddleware);
  app.use(publicReadCache);
  registerResearchRoutes(app);
  registerDemandRoutes(app);
  registerFinancialRoutes(app);
  registerExperimentRoutes(app);
  registerJudgeRoutes(app);
  registerLivePlanRoutes(app);
  registerAutopilotRoutes(app);
  registerEventRoutes(app);
  registerOperationalRoutes(app);
  app.post('/api/investigation/:id/apply', (req,res) => {
    const source=store.load(req.params.id), investigation=source?.investigation;
    if(!source)return res.status(404).json({error:'Saved investigation not found.'});
    try {
      const parent=store.load(source.parentId);
      if(investigation?.status!=='completed'||!investigation.proposedScenario||!parent||investigation.sourceDigest!==decisionFingerprint(parent))return res.status(409).json({error:'A completed investigation with a current feasible proposed scenario is required.'});
      const constraints=investigation.proposedScenario.constraints;
      const slate=optimizeSlate(source.memo.items,constraints);
      if(!slate.feasible)return res.status(409).json({error:'The proposed scenario no longer passes the constraints.'});
      const snapshot={...withoutDerived(source),id:undefined,createdAt:undefined,parentId:source.id,
        memo:{...source.memo,items:preserveRankProvenance(source),slate,constraints:slate.constraints,input:{...source.memo.input,constraints:slate.constraints}},
        input:{...source.input,constraints:slate.constraints},investigationDecision:{sourceId:source.id,observationId:investigation.preferredScenarioId,scope:'Organizer-requested hypothetical scenario. Fresh planning approval required.'}};
      snapshot.decisionProof=buildDecisionProof(snapshot);
      const id=store.save(snapshot);store.retain(source.id);
      return res.status(201).json({id,proofStatus:snapshot.decisionProof.status});
    }catch(error){return sendProcessingError(res,error);}
  });
  app.post('/api/commercial-stress/:id', (req,res) => {
    const source=store.load(req.params.id);
    if(!source)return res.status(404).json({error:'Saved decision not found.'});
    try {
      const report=commercialStress(source,req.body);
      const id=store.save({...source,id:undefined,createdAt:undefined,parentId:source.id,commercialStress:report});
      return res.status(201).json({id,report});
    } catch(error){return res.status(400).json({error:error.message});}
  });
  app.get('/api/access', (req, res) => res.json({ protected: protectedMode(), editable: canEdit(req) }));
  app.get('/api/examples', (_req, res) => res.json(store.examples()));
  app.post('/api/examples/:id/pin', (req, res) => {
    try { res.json(store.pin(req.params.id, req.body?.pinned !== false)); }
    catch (error) { res.status(404).json({ error: error.message }); }
  });
  registerGMRoutes(app);
  registerReviewRoutes(app);
  registerDecisionRoutes(app);
  registerPortfolioRoutes(app);
  registerBenchmarkRoutes(app);
  if(process.env.PUBLIC_LANDING_PAGE==='judge')app.get('/',(_req,res)=>res.redirect(302,'/judge.html'));
  const [pages, files] = staticAssets(pub, express);
  app.use(pages, files);
  app.get('/healthz', (_req, res) => res.set('Cache-Control','no-store').json({ ok: true, version: '1.2.0', mock: isMock(), keyed: !!process.env.QLOO_API_KEY, llm: hasLLM(),
    protected:protectedMode(),diskOk:diskOk(dataRoot),release:/^[a-f0-9]{7,40}$/i.test(process.env.RELEASE_COMMIT??'')?process.env.RELEASE_COMMIT:null }));
  app.get('/m/:id', (_req, res) => res.sendFile(pub + '/index.html'));
  app.get('/api/memo/:id', (req, res) => {
    const snapshot = store.load(req.params.id);
    res.set('Cache-Control', 'no-store');
    return snapshot ? res.json(snapshot) : res.status(404).json({ error: 'Saved run not found.' });
  });
  app.get('/api/dossier/:id', (req, res) => {
    const snapshot = store.load(req.params.id);
    res.set('Cache-Control', 'no-store');
    if (!snapshot) return res.status(404).json({ error: 'Saved run not found.' });
    try { return res.json(buildDossier(snapshot, { investigationSource: store.load(snapshot.parentId) })); }
    catch (error) { return sendProcessingError(res,error); }
  });
  app.get('/api/dossier/:id/report', (req, res) => {
    const snapshot = store.load(req.params.id);
    if (!snapshot) return res.status(404).type('text/plain').send('Saved run not found.');
    try {
      res.set('Cache-Control', 'no-store');
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
      res.set('Content-Disposition', `attachment; filename="houselights-${req.params.id.replace(/[^a-z0-9_-]/gi, '')}-report.html"`);
      return res.type('html').send(dossierHtml(buildDossier(snapshot, { investigationSource: store.load(snapshot.parentId) })));
    } catch (error) { const failure=classifyRequestError(error); return res.status(failure.status).type('text/plain').send(failure.message); }
  });
  app.post('/api/dossier/:id/ask', (req, res) => {
    const snapshot = store.load(req.params.id);
    if (!snapshot) return res.status(404).json({ error: 'Saved run not found.' });
    try { return res.json(answerDossierQuestion(buildDossier(snapshot, { investigationSource: store.load(snapshot.parentId) }), req.body?.question)); }
    catch (error) { return res.status(400).json({ error: error.message }); }
  });
  app.post('/api/packet/:id', (req, res) => {
    const snapshot = store.load(req.params.id);
    if (!snapshot) return res.status(404).json({ error: 'Saved run not found.' });
    try { const approval = requirePlanningApproval(snapshot, req.body?.expectedDecisionRevision); return res.json({ ...buildBookingPacket(snapshot, req.body?.event), approval }); }
    catch (error) { return sendProcessingError(res,error); }
  });
  app.get('/api/tour-calendar/:id', (req, res) => {
    const snapshot = store.load(req.params.id);
    if (!snapshot) return res.status(404).type('text/plain').send('Saved run not found.');
    try {
      res.set('Cache-Control', 'no-store');
      res.set('Content-Disposition', `attachment; filename="houselights-${req.params.id.replace(/[^a-z0-9_-]/gi, '')}-tour.ics"`);
      return res.type('text/calendar').send(tourCalendar(snapshot));
    } catch (error) { const failure=classifyRequestError(error); return res.status(failure.status).type('text/plain').send(failure.message); }
  });
  app.get('/api/pipeline/:id', (req, res) => {
    const snapshot = store.load(req.params.id);
    res.set('Cache-Control', 'no-store');
    if (!snapshot) return res.status(404).json({ error: 'Saved run not found.' });
    try {
      const pipeline = pipelineStore.load(req.params.id) || pipelineStore.save(req.params.id, createPipeline(snapshot));
      return res.json(pipeline);
    } catch (error) { return sendProcessingError(res,error); }
  });
  app.post('/api/pipeline/:id/events', (req, res) => {
    const snapshot = store.load(req.params.id);
    if (!snapshot) return res.status(404).json({ error: 'Saved run not found.' });
    try {
      return res.json(pipelineStore.update(req.params.id, current => {
        const pipeline = current || createPipeline(snapshot);
        if (req.body?.expectedRevision !== pipeline.revision) throw Object.assign(new Error('Pipeline revision changed. Reload before acting.'), {status:409});
        const approval = authorizePipelineEvent(snapshot, req.body);
        const next = applyPipelineEvent(pipeline, req.body);
        if (approval) next.events.at(-1).approval = approval;
        return next;
      }));
    } catch (error) { return res.status(error.status ?? 400).json({ error: error.message }); }
  });
  app.get('/api/campaign/:id', (req, res) => {
    const snapshot = store.load(req.params.id);
    res.set('Cache-Control', 'no-store');
    if (!snapshot) return res.status(404).json({ error: 'Saved run not found.' });
    try {
      const pipeline = pipelineStore.load(req.params.id) || pipelineStore.save(req.params.id, createPipeline(snapshot));
      return res.json(buildCampaign(snapshot, pipeline));
    } catch (error) { return sendProcessingError(res,error); }
  });
  app.post('/api/intelligence/:id', async (req, res) => {
    const source = store.load(req.params.id);
    if (!source) return res.status(404).json({ error: 'Saved run not found.' });
    if (!isMock() && !process.env.QLOO_API_KEY) return res.status(503).json({ error: 'Set QLOO_API_KEY before running cultural intelligence, or use synthetic development mode.' });
    let input;
    try { input = normalizeIntelligenceInput(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const artistCount = source.memo?.slate?.selectedIds?.length || 0;
    if (!artistCount || !source.memo?.slate?.feasible) return res.status(400).json({ error: 'A feasible saved slate is required.' });
    const expectedCalls = intelligenceWorkflowCount(input, artistCount);
    if (expectedCalls > intelligenceBudget) return res.status(400).json({ error: `This analysis requires ${expectedCalls} workflows; reduce markets, route stops or slate size to the ${intelligenceBudget}-workflow limit.`, expectedCalls, callBudget: intelligenceBudget });
    if (!routeQuota(req, 'intelligence', { minuteLimit: 3, dayLimit: 50 })) return res.status(429).json({ error: 'Cultural-intelligence run limit reached. Existing intelligence remains available from its saved snapshot.' });
    try {
      const run = new Run({ budget: intelligenceBudget, receiptPrefix: 'i', receiptOffset: receiptOffset(source, 'i') });
      const intelligence = await buildCulturalIntelligence(source, input, run);
      const snapshot = { ...source, id: undefined, createdAt: undefined, parentId: source.id, intelligence, capacityResearch: undefined, venuePlan: undefined, localActivation: undefined, receipts: [...(source.receipts || []), ...run.receipts] };
      const id = store.save(snapshot);
      return res.status(201).json({ id, expectedCalls, workflowsUsed: run.used, snapshot: store.load(id) });
    } catch (error) { return sendProcessingError(res,error); }
  });
  app.post('/api/venues/:id/:action', (req, res) => {
    if (!['qualify', 'capacity-review'].includes(req.params.action)) return res.status(404).json({ error: 'Unknown venue action.' });
    const source = store.load(req.params.id);
    if (!source) return res.status(404).json({ error: 'Saved run not found.' });
    let result;
    const reviewing = req.params.action === 'capacity-review';
    try { result = reviewing ? buildCapacityResearch(source, req.body) : buildVenuePlan(source, req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    if (!routeQuota(req, 'venue', { minuteLimit: 12, dayLimit: 200 })) return res.status(429).json({ error: 'Venue-plan save limit reached. Existing plans remain available from their saved snapshots.' });
    const snapshot = { ...source, id: undefined, createdAt: undefined, parentId: source.id, localActivation: undefined,
      ...(reviewing ? { capacityResearch: result, venuePlan: undefined } : { venuePlan: result }) };
    const id = store.save(snapshot);
    return res.status(201).json({ id, snapshot: store.load(id) });
  });
  app.post('/api/activation/:id', async (req, res) => {
    const source = store.load(req.params.id);
    if (!source) return res.status(404).json({ error: 'Saved run not found.' });
    if (!isMock() && !process.env.QLOO_API_KEY) return res.status(503).json({ error: 'Set QLOO_API_KEY before running local activation, or use synthetic development mode.' });
    let input, expectedCalls;
    try { input = normalizeActivationInput(source, req.body); expectedCalls = activationWorkflowCount(source, input); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    if (expectedCalls > intelligenceBudget) return res.status(400).json({ error: `This activation requires up to ${expectedCalls} workflows; reduce markets or opener candidates to the ${intelligenceBudget}-workflow limit.`, expectedCalls, callBudget: intelligenceBudget });
    if (!routeQuota(req, 'activation', { minuteLimit: 3, dayLimit: 50 })) return res.status(429).json({ error: 'Local-activation run limit reached. Existing activation plans remain available from saved snapshots.' });
    try {
      const run = new Run({ budget: intelligenceBudget, receiptPrefix: 'l', receiptOffset: receiptOffset(source, 'l') });
      const localActivation = await buildLocalActivation(source, input, run);
      const snapshot = { ...source, id: undefined, createdAt: undefined, parentId: source.id, localActivation,
        receipts: [...(source.receipts || []), ...run.receipts] };
      const id = store.save(snapshot);
      return res.status(201).json({ id, expectedCalls, workflowsUsed: run.used, snapshot: store.load(id) });
    } catch (error) { return sendProcessingError(res,error); }
  });
  app.post('/api/optimize', (req, res) => {
    if (!Array.isArray(req.body?.items) || req.body.items.length > 20) return res.status(400).json({ error: 'Provide at most 20 candidates.' });
    const result = optimizeSlate(req.body.items, req.body.constraints);
    return result.status === 'invalid' ? res.status(400).json({ error: result.reasons.join(' '), ...result }) : res.json(result);
  });
  app.post('/api/analyze', (req, res) => {
    if (!Array.isArray(req.body?.items) || req.body.items.length > 12) return res.status(400).json({ error: 'Provide at most 12 candidates.' });
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
    if (!routeQuota(req, 'scenario', { minuteLimit: 12, dayLimit: 200 })) return res.status(429).json({ error: 'Scenario save limit reached. Existing evidence can still be re-optimized and exported.' });
    const normalizedConstraints = slate.constraints;
    const currency = ['GBP', 'USD', 'EUR', 'INR'].includes(b.currency) ? b.currency : source.memo.currency;
    const exampleBookingTerms = source.memo.exampleBookingTerms === true || source.input?.exampleBookingTerms === true;
    const terms = { ...source.input?.terms, ...Object.fromEntries(items.flatMap(item =>
      [...new Set([item.originalName, item.name].filter(Boolean))].map(name => [name, item.terms]))) };
    const snapshot = {
      ...withoutDerived(source), id: undefined, createdAt: undefined, parentId: source.id, scenario: true,
      scenarioName: String(b.name || 'Alternative slate').trim().slice(0, 80),
      input: { ...source.input, currency, exampleBookingTerms, constraints: normalizedConstraints, terms },
      memo: { ...source.memo, currency, exampleBookingTerms, input: { ...source.memo.input, currency, exampleBookingTerms, constraints: normalizedConstraints }, items, constraints: normalizedConstraints, slate }
    };
    const id = store.save(snapshot, { retain: true });
    return res.status(201).json({ id, snapshot: store.load(id) });
  });
  app.post('/api/memo', async (req, res) => {
    let input;
    try { input = bookingInput(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
    if (!isMock() && !process.env.QLOO_API_KEY) return res.status(503).json({ error: 'Set QLOO_API_KEY in the server environment, or use npm run dev for clearly labeled synthetic data.' });
    if (!routeQuota(req, 'memo', { minuteLimit: 4, dayLimit: dailyCap })) return res.status(429).json({ error: 'Run limit reached. Try again later. Re-optimizing existing evidence does not spend Qloo calls.' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const trace = [], startedAt = Date.now();
    const emit = event => {
      if (res.destroyed) throw new Error('Client disconnected');
      if (['start', 'stage', 'receipt', 'plan', 'needs_input', 'memo'].includes(event.type) && trace.length < 100) {
        trace.push({ elapsedMs: Date.now() - startedAt, type: event.type, text: String(event.text || event.reason || '').slice(0, 240),
          receiptId: event.receipt?.id || null, tool: event.receipt?.tool || null, status: event.receipt?.status || null,
          source: event.receipt?.source || null, ms: event.receipt?.ms ?? null, mock: event.type === 'start' ? event.mock === true : undefined,
          by: event.type === 'plan' ? event.by : undefined,
          deep: event.type === 'plan' && Array.isArray(event.deep) ? event.deep.slice(0, 4) : undefined,
          feasible: event.type === 'memo' ? event.slate?.feasible === true : undefined });
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 15000);
    try {
      emit({ type: 'start', mock: isMock() });
      const run = new Run({ budget, emit });
      const memo = await buildMemo(input, run);
      if (memo && !res.destroyed) emit({ type: 'saved', id: store.save({ input, mock: memo.mode === 'mock', receipts: run.receipts, memo, trace }, { retain: true }) });
    } catch {
      if (!res.destroyed) emit({ type: 'error', text: 'The run could not complete. Review the last receipt and try again. No booking was made.' });
    } finally { clearInterval(heartbeat); res.end(); }
  });
  app.use('/api', unknownApiRoute);
  // Anything else that matched no file or route gets the styled 404 page.
  app.use((req, res) => req.method === 'GET' || req.method === 'HEAD' ? res.status(404).type('html').send(pages.render('404.html')) : res.status(404).json({ error: 'Not found.' }));
  app.use((error, _req, res, _next) => {
    if (error.status === 413) return res.status(413).json({ error: 'Request is too large.' });
    if (error.type === 'entity.parse.failed' || error.status === 400) return res.status(400).json({ error: 'Invalid request body.' });
    return sendProcessingError(res, error);
  });
  return app;
}
