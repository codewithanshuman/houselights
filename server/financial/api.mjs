import { Worker } from 'node:worker_threads';
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
  app.get('/api/financial/jobs/:id', privateRead, (req, res) => {
    const job = loadFinancialJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Financial job not found.' });
    if (!verifyFinancialJob(job)) return res.status(409).json({ error: 'Financial job integrity check failed.' });
    return res.json(publicJob(job));
  });
  app.post('/api/financial/jobs', (req, res) => {
    if (workers.size >= 2) return res.status(429).json({ error: 'Two financial simulations are already running. Please retry after one finishes.' });
    if (!routeQuota(req, 'financial-job', { minuteLimit: 8, dayLimit: 40 })) return res.status(429).json({ error: 'Financial simulation quota reached.' });
    try {
      const sourceId = req.body?.sourceId, source = sourceId ? store.load(sourceId) : null;
      if (sourceId && !source) return res.status(404).json({ error: 'Saved Qloo source not found.' });
      const demandInput = normalizeDemandInput(req.body, source);
      const twinId = req.body?.twinId, twin = twinId ? loadAudienceTwin(twinId) : null;
      if (twinId) assertTwinCompatible(twin, demandInput);
      const config = normalizeFinancial(req.body?.financial, demandInput), model = demandModelStatus();
      const prefiltered = exactFeasibleLineups(demandInput, config, model, twin);
      const job = createFinancialJob({ config, demandInput, prefiltered, sourceId: sourceId ?? null, twinId: twinId ?? null, modelStatus: model.status });
      launch(job);
      return res.status(202).json({ id: job.id, status: job.status, checkedCount: prefiltered.checkedCount,
        feasibleCount: prefiltered.feasibleCount, shortlistedCount: prefiltered.shortlistedCount });
    } catch (error) { return res.status(400).json({ error: error.message }); }
  });
  app.post('/api/financial/jobs/:id/replay', (req, res) => {
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
    const worker = workers.get(req.params.id), job = loadFinancialJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Financial job not found.' });
    if (job.status !== 'running' || !worker) return res.status(409).json({ error: 'This job is not running.' });
    workers.delete(job.id); updateFinancialJob(job.id, { status: 'canceled', error: 'Canceled by organizer.' }); worker.terminate();
    return res.json({ id: job.id, status: 'canceled' });
  });
  app.post('/api/financial/outcomes', (req, res) => {
    try { return res.status(201).json(recordFinancialOutcome(req.body)); }
    catch (error) { return res.status(400).json({ error: error.message }); }
  });
}
