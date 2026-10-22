import { randomBytes, createHash } from 'node:crypto';
import { db } from '../database.mjs';
import { modelVersion } from './schema.mjs';
import { signedMinor, major } from './money.mjs';

const newId = () => randomBytes(12).toString('hex');
const digest = body => createHash('sha256').update(JSON.stringify(body)).digest('hex');
export function createFinancialJob({ config, demandInput, prefiltered, sourceId, twinId, modelStatus, parentId = null }) {
  const id = newId(), createdAt = new Date().toISOString();
  const snapshot = { config, demandInput, prefiltered, sourceId, twinId, modelStatus };
  const job = { id, parentId, createdAt, status: 'running', modelVersion, inputDigest: digest(snapshot),
    snapshot, result: null, resultDigest: null, error: null,
    provenance: { sourceId, twinId, modelStatus, assumptionSet: config.simulation.assumptionSet,
      evidenceReferences: config.evidenceReferences, seed: config.simulation.seed, draws: config.simulation.draws,
      syntheticSource: demandInput.synthetic === true, sourceClassification: demandInput.synthetic ? 'synthetic' : sourceId ? 'saved_qloo' : 'organizer_assumptions' } };
  db.prepare('INSERT INTO financial_jobs(id,body,created_at) VALUES(?,?,?)').run(id, JSON.stringify(job), createdAt);
  return job;
}
export function loadFinancialJob(id) {
  if (!/^[a-f0-9]{24}$/.test(String(id))) return null;
  const row = db.prepare('SELECT body FROM financial_jobs WHERE id=?').get(id);
  return row ? JSON.parse(row.body) : null;
}
export function verifyFinancialJob(job) {
  return !!job && job.inputDigest === digest(job.snapshot) && (!job.result || job.resultDigest === digest(job.result));
}
export function updateFinancialJob(id, update) {
  const job = loadFinancialJob(id);
  if (!job) throw new Error('Financial job not found.');
  if (job.status !== 'running') throw new Error('Only a running financial job can change state.');
  const next = { ...job, ...update, completedAt: new Date().toISOString() };
  if (update.result) next.resultDigest = digest(update.result);
  db.prepare('UPDATE financial_jobs SET body=? WHERE id=?').run(JSON.stringify(next), id);
  return next;
}
export function recoverInterruptedFinancialJobs() {
  const rows = db.prepare('SELECT id,body FROM financial_jobs').all();
  for (const row of rows) {
    const job = JSON.parse(row.body);
    if (job.status === 'running') db.prepare('UPDATE financial_jobs SET body=? WHERE id=?').run(JSON.stringify({ ...job,
      status: 'interrupted', error: 'Process restarted before this simulation finished; replay the immutable snapshot.', completedAt: new Date().toISOString() }), row.id);
  }
}
export function recordFinancialOutcome(raw) {
  const job = loadFinancialJob(raw?.jobId);
  if (!job || job.status !== 'completed') throw new Error('Completed financial scenario not found.');
  if (!verifyFinancialJob(job)) throw new Error('Financial job integrity check failed.');
  if (job.snapshot.demandInput.synthetic) throw new Error('Synthetic sources cannot enter historical financial validation.');
  const eventDate = job.snapshot.demandInput.brief.eventDate;
  if (Date.now() <= Date.parse(`${eventDate}T23:59:59.999Z`)) throw new Error('A settlement can only be recorded after the event date.');
  const assumption = job.result.assumptionResults.find(row => row.id === raw.assumptionSetId);
  const result = assumption?.rows.find(row => JSON.stringify(row.selectedIds) === JSON.stringify(raw.selectedIds));
  if (!result) throw new Error('Choose a lineup and assumption set from the saved simulation.');
  const sourceKind = String(raw.sourceKind ?? ''), sourceReference = String(raw.sourceReference ?? '').trim();
  if (!['venue_settlement', 'box_office_export', 'audited_pnl'].includes(sourceKind) || sourceReference.length < 6 || sourceReference.length > 240)
    throw new Error('Provide a genuine settlement or audited P&L source reference.');
  const actualProfitCents = signedMinor(raw.actualProfit, 'Settled profit');
  if (!Number.isInteger(raw.actualPaidTickets) || raw.actualPaidTickets < 0 || raw.actualPaidTickets > job.snapshot.config.sellableCapacity)
    throw new Error('Actual paid tickets must be an integer within sellable capacity.');
  const id = digest([job.id, assumption.id, result.selectedIds]).slice(0, 24);
  if (db.prepare('SELECT id FROM financial_outcomes WHERE id=?').get(id)) throw new Error('This lineup already has a recorded settlement.');
  const outcome = { id, jobId: job.id, createdAt: new Date().toISOString(), eventDate,
    assumptionSetId: assumption.id, selectedIds: result.selectedIds,
    actualProfit: major(actualProfitCents), actualPaidTickets: raw.actualPaidTickets,
    predictedExpectedProfit: result.metrics.profit.mean, predictedMedianProfit: result.metrics.profit.median,
    predictedP5Profit: result.metrics.profit.p5, predictedP95Profit: result.metrics.profit.p95,
    predictedBreakEvenProbability: result.metrics.breakEvenProbability,
    predictedAttendance: result.metrics.attendance.mean,
    profitError: result.metrics.profit.mean - major(actualProfitCents),
    attendanceError: result.metrics.attendance.mean - raw.actualPaidTickets,
    source: { kind: sourceKind, reference: sourceReference },
    provenance: { realOutcome: true, preEventSimulation: Date.parse(job.createdAt) < Date.parse(`${eventDate}T00:00:00Z`),
      inputDigest: job.inputDigest, resultDigest: job.resultDigest, sourceAttestedByOrganizer: true,
      caveat: 'The app validates chronology and arithmetic; it does not inspect or authenticate the private settlement document.' } };
  db.prepare('INSERT INTO financial_outcomes(id,body,created_at) VALUES(?,?,?)').run(id, JSON.stringify(outcome), outcome.createdAt);
  return outcome;
}

export function financialValidation() {
  const all = db.prepare('SELECT body FROM financial_outcomes ORDER BY created_at').all().map(row => JSON.parse(row.body));
  const rows = all.filter(row => row.provenance.realOutcome && row.provenance.preEventSimulation);
  if (!rows.length) return { status: 'no_matched_financial_outcomes', count: 0, excluded: all.length,
    meanAbsoluteProfitError: null, meanProfitBias: null, breakEvenBrierScore: null,
    empiricalProfitRangeCoverage: null, calibrated: false,
    caveat: 'No genuine prospective settlement is recorded. Financial scenario probabilities and intervals have no demonstrated calibration.' };
  const mean = values => values.reduce((total, value) => total + value, 0) / values.length;
  return { status: 'observational_comparison', count: rows.length, excluded: all.length,
    meanAbsoluteProfitError: mean(rows.map(row => Math.abs(row.profitError))),
    meanProfitBias: mean(rows.map(row => row.profitError)),
    breakEvenBrierScore: mean(rows.map(row => (row.predictedBreakEvenProbability - Number(row.actualProfit >= 0)) ** 2)),
    meanAbsoluteAttendanceError: mean(rows.map(row => Math.abs(row.attendanceError))),
    empiricalP5P95Coverage: mean(rows.map(row => Number(row.actualProfit >= row.predictedP5Profit && row.actualProfit <= row.predictedP95Profit))),
    calibrated: false,
    caveat: 'These are prospective scenario-versus-settlement errors, not a calibrated forecasting claim. More representative outcomes and a held-out evaluation are needed.' };
}
