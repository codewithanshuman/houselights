import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, dataRoot, transaction } from './database.mjs';
const valid = id => /^[\w-]{6,12}$/.test(String(id || ''));

export function load(id) {
  if (!valid(id)) return null;
  const row = db.prepare('SELECT body FROM pipelines WHERE id=?').get(id);
  if (row) return JSON.parse(row.body);
  try { return JSON.parse(readFileSync(join(dataRoot, 'pipelines', `${id}.json`), 'utf8')); } catch { return null; }
}

export function save(id, pipeline) {
  if (!valid(id)) throw new Error('Invalid pipeline source ID.');
  db.prepare('INSERT INTO pipelines(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(id, JSON.stringify(pipeline));
  return pipeline;
}
export function update(id, fn) { return transaction(() => save(id, fn(load(id)))); }
