import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { db, dataRoot, transaction } from './database.mjs';
import { mergedCommercialFacts } from './commercial-facts.mjs';
export function save(snap, { withinTransaction = false, retain = false } = {}) {
  const id = randomBytes(7).toString('base64url'), createdAt = new Date().toISOString();
  const persist = () => {
    db.prepare('INSERT INTO snapshots(id,body,created_at,pinned) VALUES(?,?,?,?)').run(id, JSON.stringify({ ...snap, id, createdAt }), createdAt, retain ? 1 : 0);
    // Private source evidence follows immutable child decisions without entering
    // the public snapshot JSON. Each child has independent review history.
    if (snap.parentId && db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='operational_evidence'").get()) {
      const parent = db.prepare('SELECT body FROM operational_evidence WHERE source_id=?').get(snap.parentId);
      const evidence = parent ? JSON.parse(parent.body) : { revision: 0, documents: [], reviews: [] };
      const commercialFacts = mergedCommercialFacts(snap.parentId, evidence.commercialFacts ?? []);
      if (parent || commercialFacts.length) db.prepare('INSERT INTO operational_evidence(source_id,body) VALUES(?,?)').run(id, JSON.stringify({ ...evidence, commercialFacts, sourceId:id, inheritedFrom:snap.parentId }));
    }
    db.exec('DELETE FROM snapshots WHERE pinned=0 AND id NOT IN (SELECT id FROM snapshots WHERE pinned=0 ORDER BY created_at DESC, rowid DESC LIMIT 500)');
  };
  if (withinTransaction) persist(); else transaction(persist);
  return id;
}
export function load(id) {
  if (typeof id !== 'string' || !/^[\w-]{6,12}$/.test(id)) return null;
  const row = db.prepare('SELECT body FROM snapshots WHERE id=?').get(id);
  if (row) return JSON.parse(row.body);
  try {
    const body = JSON.parse(readFileSync(join(dataRoot, `${id}.json`), 'utf8'));
    db.prepare('INSERT OR IGNORE INTO snapshots(id,body,created_at) VALUES(?,?,?)').run(id, JSON.stringify(body), body.createdAt || new Date().toISOString());
    return body;
  } catch { return null; }
}
export function pin(id, pinned = true) {
  if (!load(id)) throw new Error('Saved run not found.');
  // Study retention must not publish blind evaluation sources in the examples list.
  const retainedByStudy = db.prepare('SELECT body FROM studies').all().some(row => JSON.parse(row.body).cases.some(item => item.sourceId === id));
  db.prepare('UPDATE snapshots SET pinned=?,featured=? WHERE id=?').run(pinned || retainedByStudy ? 1 : 0, pinned ? 1 : 0, id);
  return { id, pinned };
}
export function retain(id) {
  if (!load(id)) throw new Error('Saved run not found.');
  db.prepare('UPDATE snapshots SET pinned=1 WHERE id=?').run(id);
}
export function examples() {
  return db.prepare('SELECT id,body FROM snapshots WHERE featured=1 ORDER BY created_at DESC').all().map(row => {
    const snapshot = JSON.parse(row.body);
    return { id: row.id, city: snapshot.memo?.input?.city, title: snapshot.scenarioName || 'Festival decision', mock: snapshot.mock === true };
  });
}
