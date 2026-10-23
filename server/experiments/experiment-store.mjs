import { db, transaction } from '../database.mjs';
import { digest, VERSION } from './experiment-schema.mjs';

db.exec('CREATE TABLE IF NOT EXISTS qloo_experiments(id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL)');
export function createExperiment(locked) {
  const id = digest({ inputDigest: locked.inputDigest, version: VERSION }).slice(7, 31);
  const existing = loadExperiment(id);
  if (existing) {
    if (existing.inputDigest !== locked.inputDigest) throw new Error('Experiment ID collision.');
    return existing;
  }
  const record = { id, createdAt: new Date().toISOString(), status: 'pending', ...locked,
    result: null, resultDigest: null, error: null, startedAt: null, completedAt: null, attemptCount: 0 };
  db.prepare('INSERT OR IGNORE INTO qloo_experiments(id,body,created_at) VALUES(?,?,?)').run(id, JSON.stringify(record), record.createdAt);
  const saved = loadExperiment(id);
  if (saved.inputDigest !== locked.inputDigest) throw new Error('Experiment ID collision.');
  return saved;
}
export function loadExperiment(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) return null;
  const row = db.prepare('SELECT body FROM qloo_experiments WHERE id=?').get(id);
  return row ? JSON.parse(row.body) : null;
}
export function verifyExperiment(record) {
  return !!record && record.config?.version === VERSION &&
    digest({ config: record.config, frozen: record.frozen }) === record.inputDigest &&
    (!record.result || record.result.reportDigest === record.resultDigest &&
      digest(Object.fromEntries(Object.entries(record.result).filter(([key]) => key !== 'reportDigest'))) === record.resultDigest);
}
export function updateExperiment(id, changes) {
  const allowed = ['status', 'result', 'resultDigest', 'error', 'startedAt', 'completedAt', 'attemptCount'];
  if (Object.keys(changes).some(key => !allowed.includes(key))) throw new Error('Locked experiment inputs are immutable.');
  return transaction(() => {
    const current = loadExperiment(id);
    if (!verifyExperiment(current)) throw new Error('Experiment integrity check failed.');
    if (current.status === 'completed') throw new Error('Completed experiment reports are immutable.');
    const updated = { ...current, ...changes };
    if (!verifyExperiment(updated)) throw new Error('Invalid experiment result digest.');
    db.prepare('UPDATE qloo_experiments SET body=? WHERE id=?').run(JSON.stringify(updated), id);
    return updated;
  });
}
export function recoverInterruptedExperiments() {
  for (const row of db.prepare('SELECT id,body FROM qloo_experiments').all()) {
    const record = JSON.parse(row.body);
    if (record.status === 'running') db.prepare('UPDATE qloo_experiments SET body=? WHERE id=?')
      .run(JSON.stringify({ ...record, status: 'interrupted', error: 'The experiment worker stopped before saving a result.' }), row.id);
  }
}
