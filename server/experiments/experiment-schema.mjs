import { createHash } from 'node:crypto';
import { optimizeSlate } from '../optimizer.mjs';

export const GROUPS = Object.freeze(['rank', 'local', 'trends', 'comparison']);
export const METHODS = Object.freeze(['llm_only', 'constraint_only', 'qloo_ablated', 'full_houselights']);
export const VERSION = 'qloo-proof-v1';
export const digest = value => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function publishedEvidenceAsOf(snapshot) {
  const observed = (snapshot.receipts ?? []).map(receipt => receipt.fetchedAt)
    .filter(value => typeof value === 'string' && Number.isFinite(Date.parse(value)));
  return observed.length ? observed.sort().at(-1) : '2026-10-22T00:00:00.000Z';
}
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };

export function lockExperiment(snapshot, raw = {}) {
  if (!snapshot?.memo || !Array.isArray(snapshot.memo.items) || !snapshot.memo.items.length) fail('A saved decision with a candidate pool is required.');
  if (snapshot.memo.items.length > 12) fail('Proof Lab supports at most 12 locked candidates per case.');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Experiment configuration must be an object.');
  if (raw.experimentType && raw.experimentType !== 'fixed_pool') fail('Use the separate discovery protocol for independently discovered pools.');
  if (raw.methods && (JSON.stringify(raw.methods) !== JSON.stringify(METHODS))) fail('All four declared methods must remain in the fixed-pool experiment.');
  if (raw.signalGroups && JSON.stringify(raw.signalGroups) !== JSON.stringify(GROUPS)) fail('All four Qloo signal groups must be evaluated.');
  if (raw.policy != null && raw.policy !== 'original' && raw.policy !== 'shared_operational') fail('Choose original or shared_operational evaluation policy.');
  if (raw.datasetVersion != null && (typeof raw.datasetVersion !== 'string' || !/^[\w.-]{1,50}$/.test(raw.datasetVersion))) fail('Invalid dataset version.');
  if (raw.seed != null && !Number.isSafeInteger(raw.seed)) fail('Seed must be a safe integer.');
  if (raw.studyId != null && (typeof raw.studyId !== 'string' || !/^[\w-]{1,80}$/.test(raw.studyId))) fail('Invalid linked study ID.');
  const source = optimizeSlate(snapshot.memo.items, snapshot.memo.constraints);
  if (source.status === 'invalid') fail(source.reasons.join(' '));
  if (Array.isArray(snapshot.memo.slate?.selectedIds) &&
    JSON.stringify([...snapshot.memo.slate.selectedIds].sort()) !== JSON.stringify([...source.selectedIds].sort()))
    fail('Saved selection no longer matches its candidate pool and constraints. Save a new decision before locking an experiment.');
  const policy = raw.policy ?? 'original';
  const constraints = structuredClone(source.constraints);
  if (policy === 'shared_operational') delete constraints.minimumAverageFit;
  const checked = optimizeSlate(snapshot.memo.items, constraints);
  if (checked.status === 'invalid') fail(checked.reasons.join(' '));
  const sourceId = snapshot.id ?? null;
  const frozen = structuredClone({ id: sourceId, mock: snapshot.mock === true, memo: { items: snapshot.memo.items,
    currency: snapshot.memo.currency, input: snapshot.memo.input, constraints, exampleBookingTerms: snapshot.memo.exampleBookingTerms,
    slate: snapshot.memo.slate }, receipts: snapshot.receipts ?? [], festivalResearch: snapshot.festivalResearch ?? null,
    benchmark: snapshot.benchmark ?? null, benchmarkTrial: snapshot.benchmarkTrial ?? null });
  const config = { version: VERSION, experimentType: 'fixed_pool', sourceSnapshotId: sourceId,
    datasetVersion: raw.datasetVersion ?? 'unversioned',
    policy, originalFitFloor: source.constraints.minimumAverageFit ?? null, constraints,
    candidateIds: frozen.memo.items.map(item => item.id), groups: GROUPS, methods: METHODS,
    seed: raw.seed ?? 20261022,
    evidenceAsOf: typeof raw.evidenceAsOf === 'string' && !Number.isNaN(Date.parse(raw.evidenceAsOf)) ? new Date(raw.evidenceAsOf).toISOString() :
      new Date(snapshot.createdAt ?? Date.now()).toISOString(),
    studyId: raw.studyId ?? null,
    scope: 'Fixed-pool selection; the shared pool may already contain Qloo-discovered artists.' };
  const inputDigest = digest({ config, frozen });
  return { config, frozen, inputDigest, sourceDigest: digest(snapshot) };
}
