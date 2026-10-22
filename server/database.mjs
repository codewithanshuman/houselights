import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
export const dataRoot = process.env.DATA_DIR || './data';
mkdirSync(dataRoot, { recursive: true });
export const db = new DatabaseSync(join(dataRoot, 'houselights.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS pipelines(id TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quotas(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS qloo_cache(key TEXT PRIMARY KEY, body TEXT NOT NULL, fetched_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS demand_forecasts(id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS demand_outcomes(id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reported_outcomes(source_key TEXT PRIMARY KEY, body TEXT NOT NULL, imported_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audience_twins(id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS financial_jobs(id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS financial_outcomes(id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS studies(id TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ballots(study_id TEXT NOT NULL, reviewer_hash TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(study_id, reviewer_hash));`);
if (!db.prepare('PRAGMA table_info(snapshots)').all().some(column => column.name === 'featured')) {
  db.exec('ALTER TABLE snapshots ADD COLUMN featured INTEGER NOT NULL DEFAULT 0');
}
export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const value = fn(); db.exec('COMMIT'); return value; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function consumeQuota(rules, now = Date.now()) {
  return transaction(() => {
    db.prepare('DELETE FROM quotas WHERE expires <= ?').run(now);
    for (const rule of rules) {
      const row = db.prepare('SELECT count FROM quotas WHERE key = ?').get(rule.key);
      if ((row?.count ?? 0) >= rule.limit) return false;
    }
    for (const rule of rules) db.prepare('INSERT INTO quotas(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(rule.key, rule.expires);
    return true;
  });
}
