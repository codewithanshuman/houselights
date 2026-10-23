import { Worker } from 'node:worker_threads';
import * as sourceStore from '../store.mjs';
import { loadJudgeCase, listJudgeCases } from '../judge.mjs';
import { studyReport, publicReviewEvidence } from '../reviews.mjs';
import { routeQuota } from '../access.mjs';
import { lockExperiment, digest, publishedEvidenceAsOf } from './experiment-schema.mjs';
import { runExperiment } from './orchestrator.mjs';
import { summarizeExperiments } from './statistical-analysis.mjs';
import { compareDiscovery } from './discovery-comparison.mjs';
import { db } from '../database.mjs';
import { createExperiment, loadExperiment, recoverInterruptedExperiments, updateExperiment, verifyExperiment } from './experiment-store.mjs';

const workers = new Map();
const published = new Map();
recoverInterruptedExperiments();
db.exec('CREATE TABLE IF NOT EXISTS discovery_experiments(id TEXT PRIMARY KEY, body TEXT NOT NULL)');
const fail = (res, error) => res.status(error.status ?? 400).json({ error: error.message });
const sourceDrift = job => {
  const current = sourceStore.load(job.config.sourceSnapshotId);
  return !current || digest(current) !== job.sourceDigest;
};
const publicCase = record => {
  if (!record) return null;
  if (published.has(record.id)) return published.get(record.id);
  const locked = lockExperiment({ ...record.snapshot, id: record.id }, { policy: 'original', evidenceAsOf: publishedEvidenceAsOf(record.snapshot),
    datasetVersion: 'published-judge-v1' });
  const report = runExperiment(locked);
  const result = { caseId: record.id, title: record.title, publishedAt: record.createdAt,
    names: record.snapshot.memo.items.map(item => ({ id: item.id, name: item.name })), report,
    review: publicReviewEvidence() };
  published.set(record.id, result);
  return result;
};
function launch(job, humanReport) {
  const worker = new Worker(new URL('./experiment-worker.mjs', import.meta.url),
    { workerData: { locked: { config: job.config, frozen: job.frozen, inputDigest: job.inputDigest,
      sourceDigest: job.sourceDigest }, humanReport }, resourceLimits: { maxOldGenerationSizeMb: 300 } });
  workers.set(job.id, worker);
  let done = false;
  const finish = changes => {
    if (done || workers.get(job.id) !== worker) return;
    done = true; workers.delete(job.id);
    if (loadExperiment(job.id)?.status === 'running') updateExperiment(job.id, changes);
    worker.terminate();
  };
  worker.once('message', message => finish(message.error ? { status: 'failed', error: message.error }
    : { status: 'completed', result: message.result, resultDigest: message.result.reportDigest,
      completedAt: new Date().toISOString(), error: null }));
  worker.once('error', error => finish({ status: 'failed', error: error.message }));
  worker.once('exit', code => finish({ status: 'interrupted', error: `Worker exited with code ${code}.` }));
}
export function registerExperimentRoutes(app) {
  app.post('/api/experiments/discovery', (req, res) => {
    if (!routeQuota(req, 'discovery-comparison', { minuteLimit: 5, dayLimit: 30 })) return res.status(429).json({ error: 'Discovery comparison quota reached.' });
    try {
      const report = compareDiscovery(req.body);
      const id = report.reportDigest.slice(7, 31);
      db.prepare('INSERT OR IGNORE INTO discovery_experiments(id,body) VALUES(?,?)').run(id, JSON.stringify(report));
      res.status(201).json({ id, reportDigest: report.reportDigest, comparable: report.comparable,
        independentValidation: report.independentValidation });
    } catch (error) { fail(res, error); }
  });
  app.get('/api/experiments/discovery/:id', (req, res) => {
    if (!/^[a-f0-9]{24}$/.test(req.params.id)) return res.status(404).json({ error: 'Discovery experiment not found.' });
    const row = db.prepare('SELECT body FROM discovery_experiments WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Discovery experiment not found.' });
    const report = JSON.parse(row.body);
    if (digest(Object.fromEntries(Object.entries(report).filter(([key]) => key !== 'reportDigest'))) !== report.reportDigest)
      return res.status(409).json({ error: 'Discovery report integrity check failed.' });
    res.json(report);
  });
  app.get('/api/experiments/public', (_req, res) => {
    try {
      const cases = listJudgeCases().map(record => publicCase(record));
      res.json({ cases: cases.map(row => ({ id: row.caseId, title: row.title, city: row.report.brief.city,
        synthetic: row.report.brief.synthetic, candidateCount: row.report.brief.candidateCount,
        llmStatus: row.report.methods.llm_only.status })), coverage: summarizeExperiments(cases.map(row => row.report)).coverage,
        review: publicReviewEvidence() });
    } catch (error) { fail(res, error); }
  });
  app.get('/api/experiments/public/:id', (req, res) => {
    try {
      const record = loadJudgeCase(req.params.id);
      if (!record) return res.status(404).json({ error: 'Published case not found.' });
      res.json(publicCase(record));
    } catch (error) { fail(res, error); }
  });
  app.post('/api/experiments', (req, res) => {
    if (!routeQuota(req, 'qloo-experiment-create', { minuteLimit: 8, dayLimit: 50 })) return res.status(429).json({ error: 'Experiment quota reached.' });
    try {
      const source = sourceStore.load(req.body?.sourceSnapshotId);
      if (!source) return res.status(404).json({ error: 'Saved source decision not found.' });
      const locked = lockExperiment(source, req.body);
      if (locked.config.studyId) {
        const study = studyReport(locked.config.studyId);
        if (locked.config.policy !== 'original' || !study.cases.some(row => row.sourceId === source.id))
          return res.status(400).json({ error: 'A linked blind study must contain this exact source under its original decision policy.' });
      }
      const job = createExperiment(locked);
      sourceStore.retain(source.id);
      res.status(201).json({ id: job.id, status: job.status, inputDigest: job.inputDigest,
        policy: job.config.policy, candidateCount: job.config.candidateIds.length });
    } catch (error) { fail(res, error); }
  });
  app.get('/api/experiments/:id', (req, res) => {
    const job = loadExperiment(req.params.id);
    if (!job) return res.status(404).json({ error: 'Experiment not found.' });
    if (!verifyExperiment(job)) return res.status(409).json({ error: 'Experiment integrity check failed.' });
    res.json({ id: job.id, status: job.status, config: job.config, inputDigest: job.inputDigest,
      resultDigest: job.resultDigest, attemptCount: job.attemptCount, error: job.error,
      sourceChangedSinceLock: sourceDrift(job),
      createdAt: job.createdAt, completedAt: job.completedAt,
      replayRuntimeMs: job.startedAt && job.completedAt ? Date.parse(job.completedAt) - Date.parse(job.startedAt) : null,
      newProviderCalls: 0, providerCost: null });
  });
  app.post('/api/experiments/:id/run', (req, res) => {
    const job = loadExperiment(req.params.id);
    if (!job) return res.status(404).json({ error: 'Experiment not found.' });
    if (!verifyExperiment(job)) return res.status(409).json({ error: 'Experiment integrity check failed.' });
    if (job.status === 'completed' || job.status === 'running') return res.json({ id: job.id, status: job.status, resultDigest: job.resultDigest });
    if (sourceDrift(job)) return res.status(409).json({ error: 'Source snapshot changed or disappeared after the experiment was locked. Create a new experiment.' });
    if (workers.size >= 2) return res.status(429).json({ error: 'Experiment worker capacity is full.' });
    if (!routeQuota(req, 'qloo-experiment-run', { minuteLimit: 6, dayLimit: 30 })) return res.status(429).json({ error: 'Experiment run quota reached.' });
    try {
      const linked = job.config.studyId ? studyReport(job.config.studyId) : null;
      const humanReport = linked ? { ...linked,
        cases: linked.cases.filter(row => row.sourceId === job.config.sourceSnapshotId), distinctBriefs: 1 } : null;
      const running = updateExperiment(job.id, { status: 'running', error: null,
        startedAt: new Date().toISOString(), attemptCount: job.attemptCount + 1 });
      launch(running, humanReport);
      res.status(202).json({ id: job.id, status: 'running', inputDigest: job.inputDigest });
    } catch (error) { fail(res, error); }
  });
  const section = (name, pick) => app.get(`/api/experiments/:id/${name}`, (req, res) => {
    const job = loadExperiment(req.params.id);
    if (!job) return res.status(404).json({ error: 'Experiment not found.' });
    if (!verifyExperiment(job)) return res.status(409).json({ error: 'Experiment integrity check failed.' });
    if (job.status !== 'completed') return res.status(409).json({ error: 'Experiment has not completed.', status: job.status });
    res.json(pick(job));
  });
  section('results', job => ({ methods: job.result.methods, metrics: job.result.metrics,
    independentEvaluation: job.result.independentEvaluation, reportDigest: job.resultDigest }));
  section('ablations', job => ({ ...job.result.ablations, reportDigest: job.resultDigest }));
  section('contributions', job => ({ contributions: job.result.contributions,
    decisionDifference: job.result.decisionDifference, consistency: job.result.consistency,
    reportDigest: job.resultDigest }));
  section('evidence', job => ({ ...job.result.evidence, reportDigest: job.resultDigest }));
  section('export', job => ({ format: 'houselights-qloo-proof-v1', locked: { config: job.config,
    frozen: job.frozen, inputDigest: job.inputDigest, sourceDigest: job.sourceDigest },
    result: job.result, resultDigest: job.resultDigest,
    replay: 'Run the versioned experiment orchestrator with locked inputs; compare the report digest.' }));
}
