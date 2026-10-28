import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { db, dataRoot, transaction } from './database.mjs';
import { mergedCommercialFacts } from './commercial-facts.mjs';

// References are recognized against existing IDs, including nested investigation,
// study and report inputs. Never infer expiry from a record's business state.
export function referencesIn(value, ids, found = new Set()) {
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === 'string' && ids.has(current)) found.add(current);
    else if (current && typeof current === 'object') for (const value of Object.values(current)) pending.push(value);
  }
  return found;
}
export function referencedRecordIds(ids, { excludeTables = [] } = {}) {
  const found = new Set(), excluded = new Set(['qloo_cache', 'quotas', ...excludeTables]);
  const quote = name => '"' + name.replaceAll('"', '""') + '"';
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
    if (excluded.has(name)) continue;
    for (const row of db.prepare('SELECT * FROM ' + quote(name)).iterate()) {
      for (const [key, value] of Object.entries(row)) {
        if (typeof value !== 'string') continue;
        if (ids.has(value)) found.add(value);
        if (key === 'body' || key === 'case_ids') {
          let parsed;
          try { parsed = JSON.parse(value); }
          catch { throw new Error('Retention could not inspect a persisted record; no cleanup was applied.'); }
          referencesIn(parsed, ids, found);
        }
      }
    }
  }
  return found;
}
function pruneSnapshots() {
  if (db.prepare('SELECT count(*) AS count FROM snapshots WHERE pinned=0').get().count <= 500) return;
  const rows = db.prepare('SELECT id,body,pinned FROM snapshots ORDER BY created_at DESC, rowid DESC').all();
  const recent = rows.filter(row => !row.pinned);
  if (recent.length <= 500) return;
  const byId = new Map(rows.map(row => [row.id, row])), ids = new Set(byId.keys());
  const keep = referencedRecordIds(ids, { excludeTables: ['snapshots', 'operational_evidence'] });
  for (const row of [...rows.filter(row => row.pinned), ...recent.slice(0, 500)]) keep.add(row.id);
  const hasEvidence = !!db.prepare("SELECT name FROM sqlite_master WHERE name='operational_evidence'").get();
  const evidence = hasEvidence ? new Map(db.prepare('SELECT source_id,body FROM operational_evidence').all().map(row => [row.source_id, row.body])) : new Map();
  // Preserve original documents and distinct historical reviews, even if an old
  // unpin removed their retention flag. Only unchanged inherited copies can age
  // out with an otherwise unreferenced snapshot. Unknown legacy orphans remain
  // forensic evidence, requiring explicit recovery/retirement rather than guesses.
  for (const [id, body] of evidence) {
    const value = JSON.parse(body);
    if (!ids.has(id)) { referencesIn(value, ids, keep); continue; }
    const privateFields = ['documents', 'reviews', 'commercialFacts'];
    if (!privateFields.some(key => value[key]?.length)) continue;
    const parent = evidence.has(value.inheritedFrom) ? JSON.parse(evidence.get(value.inheritedFrom)) : null;
    if (!parent || privateFields.some(key => JSON.stringify(value[key] ?? []) !== JSON.stringify(parent[key] ?? []))) keep.add(id);
  }
  const visited = new Set(), pending = [...keep];
  while (pending.length) {
    const id = pending.pop();
    if (visited.has(id)) continue;
    visited.add(id);
    const row = byId.get(id);
    if (!row) continue;
    const dependencies = referencesIn(JSON.parse(row.body), ids);
    if (evidence.has(id)) referencesIn(JSON.parse(evidence.get(id)), ids, dependencies);
    for (const dependency of dependencies) if (!keep.has(dependency)) { keep.add(dependency); pending.push(dependency); }
  }
  const removeEvidence = hasEvidence ? db.prepare('DELETE FROM operational_evidence WHERE source_id=?') : null;
  const removeSnapshot = db.prepare('DELETE FROM snapshots WHERE id=?');
  for (const row of recent) if (!keep.has(row.id)) {
    removeEvidence?.run(row.id);
    removeSnapshot.run(row.id);
  }
}
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
    pruneSnapshots();
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
  const hasEvidence = db.prepare("SELECT name FROM sqlite_master WHERE name='operational_evidence'").get() &&
    db.prepare('SELECT 1 FROM operational_evidence WHERE source_id=?').get(id);
  db.prepare('UPDATE snapshots SET pinned=?,featured=? WHERE id=?').run(pinned || retainedByStudy || hasEvidence ? 1 : 0, pinned ? 1 : 0, id);
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
