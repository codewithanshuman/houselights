import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { db } from '../database.mjs';
import { loadJudgeCase } from '../judge.mjs';
import { caseAssumptions, caseFinancialRequest } from './case-scenario.mjs';
import { canEdit, routeQuota } from '../access.mjs';
import * as store from '../store.mjs';
import { normalizeDemandInput } from '../demand.mjs';
import { demandModelStatus } from '../demand-ledger.mjs';
import { assertTwinCompatible, loadAudienceTwin } from '../audience-twin.mjs';
import { modelVersion, normalizeFinancial } from './schema.mjs';
import { exactFeasibleLineups } from './optimizer.mjs';
import { createFinancialJob, financialValidation, loadFinancialJob, recordFinancialOutcome, recoverInterruptedFinancialJobs, updateFinancialJob, verifyFinancialJob } from './ledger.mjs';

const workers = new Map();
recoverInterruptedFinancialJobs();
const privateRead = (req, res, next) => canEdit(req) ? next() : res.status(401).json({ error: 'Organizer access is required for private financial records.' });
// Jobs started from a published or live plan hold only public data, so anyone may read them.
const isPublic = job => job?.snapshot?.visibility === 'public';
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function publicJob(job) {
  return { id: job.id, parentId: job.parentId, createdAt: job.createdAt, completedAt: job.completedAt ?? null,
    status: job.status, modelVersion: job.modelVersion, inputDigest: job.inputDigest, resultDigest: job.resultDigest,
    provenance: job.provenance, config: job.snapshot.config, brief: job.snapshot.demandInput.brief, snapshot: job.snapshot,
    result: job.result, error: job.error };
}
function launch(job) {
  const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { config: job.snapshot.config, prefiltered: job.snapshot.prefiltered }, resourceLimits: { maxOldGenerationSizeMb: 400 } });
  workers.set(job.id, worker);
  let completed = false;
  worker.once('message', message => {
    if (completed || workers.get(job.id) !== worker) return;
    completed = true; workers.delete(job.id);
    const current = loadFinancialJob(job.id);
    if (current?.status === 'running') updateFinancialJob(job.id, message.error ? { status: 'failed', error: message.error } : { status: 'completed', result: message.result });
    worker.terminate();
  });
  worker.once('error', error => {
    if (completed || workers.get(job.id) !== worker) return; completed = true; workers.delete(job.id);
    if (loadFinancialJob(job.id)?.status === 'running') updateFinancialJob(job.id, { status: 'failed', error: error.message });
  });
  worker.once('exit', code => {
    if (completed || workers.get(job.id) !== worker) return; completed = true; workers.delete(job.id);
    if (loadFinancialJob(job.id)?.status === 'running') updateFinancialJob(job.id, { status: 'interrupted', error: `Simulation worker exited with code ${code}.` });
  });
}
export function registerFinancialRoutes(app) {
  app.get('/api/financial/validation', privateRead, (_req, res) => res.json(financialValidation()));
  app.get('/api/financial/jobs/:id', (req, res) => {
    const job = loadFinancialJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Financial job not found.' });
    if (!isPublic(job) && !canEdit(req)) return res.status(401).json({ error: 'Organizer access is required for private financial records.' });
    if (!verifyFinancialJob(job)) return res.status(409).json({ error: 'Financial job integrity check failed.' });
    return res.json(publicJob(job));
  });
  app.post('/api/financial/jobs', (req, res) => {
    // Anyone may run a scenario on a published or live plan: its candidates, Qloo fit and fees
    // come from the plan, and only the venue, ticket, cost and demand assumptions are typed in.
    // Free-form scenarios (organizer fees and artists) stay private.
    const caseId = typeof req.body?.caseId === 'string' ? req.body.caseId : null;
    if (!caseId && !canEdit(req)) return res.status(401).json({ error: 'Organizer access is required for a free-form scenario. Run one on a published or live plan instead.' });
    try {
      let record = null, body = req.body, assumptions = null;
      if (caseId) {
        record = loadJudgeCase(caseId);
        if (!record) return res.status(404).json({ error: 'Plan not found.' });
        if (record.snapshot.mock === true) return res.status(409).json({ error: 'Synthetic development plans cannot enter a financial scenario.' });
        assumptions = caseAssumptions(record, req.body?.assumptions);
        body = caseFinancialRequest(record, assumptions);
      }
      const sourceId = caseId ? null : req.body?.sourceId, source = record ? record.snapshot : sourceId ? store.load(sourceId) : null;
      if (sourceId && !source) return res.status(404).json({ error: 'Saved Qloo source not found.' });
      const demandInput = normalizeDemandInput(body, source);
      const twinId = caseId ? null : req.body?.twinId, twin = twinId ? loadAudienceTwin(twinId) : null;
      if (twinId) assertTwinCompatible(twin, demandInput);
      const config = normalizeFinancial(body?.financial, demandInput), model = demandModelStatus();
      // The same plan and assumptions give the same seeded result, so a finished run is reused.
      const key = caseId ? fingerprint([caseId, record.createdAt ?? null, assumptions, model.status]) : null;
      if (key) {
        const existing = db.prepare("SELECT body FROM financial_jobs WHERE json_extract(body,'$.snapshot.caseKey')=? AND json_extract(body,'$.status') IN ('completed','running') ORDER BY created_at DESC LIMIT 1").get(key);
        if (existing) { const job = JSON.parse(existing.body); return res.status(200).json({ id: job.id, status: job.status, reused: true }); }
      }
      if (workers.size >= 2) return res.status(429).json({ error: 'Two financial simulations are already running. Please retry after one finishes.' });
      if (!routeQuota(req, 'financial-job', { minuteLimit: 8, dayLimit: 40 })) return res.status(429).json({ error: 'Financial simulation quota reached.' });
      if (!canEdit(req) && !routeQuota(req, 'financial-public', { minuteLimit: 2, dayLimit: 60 })) return res.status(429).json({ error: 'Public financial runs are limited to 2 a minute and 60 a day across all visitors. Identical runs are reused for free.' });
      const prefiltered = exactFeasibleLineups(demandInput, config, model, twin);
      const job = createFinancialJob({ config, demandInput, prefiltered, sourceId: sourceId ?? null, twinId: twinId ?? null, modelStatus: model.status,
        ...(caseId ? { caseId, caseKey: key, visibility: 'public', assumptions } : {}) });
      launch(job);
      return res.status(202).json({ id: job.id, status: job.status, checkedCount: prefiltered.checkedCount,
        feasibleCount: prefiltered.feasibleCount, shortlistedCount: prefiltered.shortlistedCount });
    } catch (error) { return res.status(400).json({ error: error.message }); }
  });
  app.post('/api/financial/jobs/:id/replay', (req, res) => {
    if (!canEdit(req)) return res.status(401).json({ error: 'Organizer access is required to replay a financial job.' });
    if (workers.size >= 2) return res.status(429).json({ error: 'Financial worker capacity is full.' });
    const original = loadFinancialJob(req.params.id);
    if (!original) return res.status(404).json({ error: 'Financial job not found.' });
    if (!verifyFinancialJob(original)) return res.status(409).json({ error: 'Financial job integrity check failed.' });
    if (original.modelVersion !== modelVersion) return res.status(409).json({ error: 'Model version differs; exact replay cannot be guaranteed.' });
    try { const job = createFinancialJob({ ...original.snapshot, parentId: original.id }); launch(job);
      return res.status(202).json({ id: job.id, parentId: original.id, status: job.status, expectedResultDigest: original.resultDigest });
    } catch (error) { return res.status(400).json({ error: error.message }); }
  });
  app.post('/api/financial/jobs/:id/cancel', (req, res) => {
    if (!canEdit(req)) return res.status(401).json({ error: 'Organizer access is required to cancel a financial job.' });
    const worker = workers.get(req.params.id), job = loadFinancialJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Financial job not found.' });
    if (job.status !== 'running' || !worker) return res.status(409).json({ error: 'This job is not running.' });
    workers.delete(job.id); updateFinancialJob(job.id, { status: 'canceled', error: 'Canceled by organizer.' }); worker.terminate();
    return res.json({ id: job.id, status: 'canceled' });
  });
  app.post('/api/financial/outcomes', (req, res) => {
    if (!canEdit(req)) return res.status(401).json({ error: 'Organizer access is required to record an outcome.' });
    try { return res.status(201).json(recordFinancialOutcome(req.body)); }
    catch (error) { return res.status(400).json({ error: error.message }); }
  });
}
