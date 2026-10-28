import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'houselights-retention-'));
process.env.DATA_DIR = dir;
const { db, transaction } = await import('../server/database.mjs');
const store = await import('../server/store.mjs');
const { createVerifiedBackup, verifyRestore } = await import('../server/backup.mjs');
db.exec('CREATE TABLE operational_evidence(source_id TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE audit_reports(id TEXT PRIMARY KEY,body TEXT NOT NULL)');
after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
const insert = db.prepare('INSERT INTO snapshots(id,body,created_at,pinned) VALUES(?,?,?,?)');
function seed(id, extra = {}, pinned = 0) {
  const body = { id, ...extra };
  insert.run(id, JSON.stringify(body), '2000-01-01T00:00:00.000Z', pinned);
  return body;
}
let generation = 0;
function fill(count = 501) {
  const batch = ++generation;
  transaction(() => { for (let i = 0; i < count; i++) seed(`f${batch}${String(i).padStart(6, '0')}`); });
}
function reset() { db.exec('DELETE FROM snapshots; DELETE FROM operational_evidence; DELETE FROM audit_reports; DELETE FROM pipelines; DELETE FROM studies;'); }
function evidence(id, value = {}) { db.prepare('INSERT INTO operational_evidence VALUES(?,?)').run(id, JSON.stringify({ sourceId: id, revision: 1, documents: [], reviews: [], ...value })); }

test('pruning deletes an unreferenced snapshot and its inherited private evidence atomically', () => {
  reset(); seed('parent001', {}, 1); evidence('parent001', { documents: [{ text: 'Private inherited copy' }] });
  seed('old000001', { parentId: 'parent001' }); evidence('old000001', { inheritedFrom: 'parent001', documents: [{ text: 'Private inherited copy' }] });
  fill(); store.save({ memo: {} });
  assert.equal(store.load('old000001'), null);
  assert.equal(db.prepare('SELECT 1 FROM operational_evidence WHERE source_id=?').get('old000001'), undefined);
  assert.equal(db.prepare('SELECT count(*) AS n FROM snapshots WHERE pinned=0').get().n, 500);
});

test('retained descendants and nested audit references protect ancestors through repeated pruning and backup/restore', async () => {
  reset(); seed('parent001'); evidence('parent001', { documents: [{ text: 'Private retained original' }] });
  const child = store.save({ parentId: 'parent001', memo: {} }, { retain: true });
  seed('audit0001', { parentId: 'parent001' });
  db.prepare('INSERT INTO audit_reports VALUES(?,?)').run('report', JSON.stringify({ investigation: { originalSnapshotId: 'audit0001' } }));
  fill(); store.save({ memo: {} });
  fill(510); store.save({ memo: {} });
  assert.ok(store.load('parent001')); assert.ok(store.load(child)); assert.ok(store.load('audit0001'));
  assert.ok(db.prepare('SELECT 1 FROM operational_evidence WHERE source_id=?').get(child));
  const backup = join(dir, 'backup'), restored = join(dir, 'restored');
  await createVerifiedBackup(join(dir, 'houselights.sqlite'), backup);
  await verifyRestore(backup, restored);
  const childRun = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const {db}=await import('./server/database.mjs'); const store=await import('./server/store.mjs');
    store.save({memo:{}});
    assert.ok(store.load('parent001')); assert.ok(store.load('audit0001'));
    assert.equal(store.load(process.env.RETAINED_CHILD).parentId,'parent001');
    assert.ok(db.prepare('SELECT 1 FROM operational_evidence WHERE source_id=?').get(process.env.RETAINED_CHILD));
    db.close(); console.log('retained lineage and private evidence survived restart and restore');
  `], { cwd: new URL('..', import.meta.url), env: { ...process.env, DATA_DIR: restored, RETAINED_CHILD: child }, encoding: 'utf8', timeout: 30000 });
  assert.equal(childRun.status, 0, childRun.stderr);
});

test('a failed cleanup rolls back the new child, inherited evidence and every deletion', () => {
  reset(); seed('old000001'); evidence('old000001'); seed('parent001', {}, 1); evidence('parent001'); fill();
  const before = db.prepare('SELECT count(*) AS n FROM snapshots').get().n;
  db.exec("CREATE TRIGGER fail_cleanup BEFORE DELETE ON snapshots WHEN OLD.id='old000001' BEGIN SELECT RAISE(ABORT,'cleanup interrupted'); END;");
  try { assert.throws(() => store.save({ parentId: 'parent001', memo: {} }), /cleanup interrupted/); }
  finally { db.exec('DROP TRIGGER fail_cleanup'); }
  assert.equal(db.prepare('SELECT count(*) AS n FROM snapshots').get().n, before);
  assert.equal(db.prepare('SELECT count(*) AS n FROM operational_evidence').get().n, 2);
  assert.ok(store.load('old000001'));
});

test('hiding a documented source does not retire its private evidence; unknown legacy orphans are preserved', () => {
  reset(); seed('source001', {}, 1); evidence('source001', { documents: [{ text: 'Original document' }] });
  evidence('orphan001', { inheritedFrom: 'source001' });
  store.pin('source001', false); fill(); store.save({ memo: {} });
  assert.ok(store.load('source001'));
  assert.equal(db.prepare('SELECT featured FROM snapshots WHERE id=?').get('source001').featured, 0);
  assert.ok(db.prepare('SELECT 1 FROM operational_evidence WHERE source_id=?').get('orphan001'));
});

test('legacy unpinned originals and distinct inherited reviews are never discarded as cache copies', () => {
  reset(); seed('parent001'); evidence('parent001', { documents: [{ text: 'Private original' }] });
  seed('child0001', { parentId: 'parent001' }); evidence('child0001', { inheritedFrom: 'parent001', documents: [{ text: 'Private original' }], reviews: [{ verdict: 'accepted', reason: 'Historical review' }] });
  fill(); store.save({ memo: {} });
  assert.ok(store.load('parent001')); assert.ok(store.load('child0001'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM operational_evidence').get().n, 2);
});

test('unreadable persisted references fail closed without exposing their contents or pruning data', () => {
  reset(); seed('old000001'); fill();
  db.prepare('INSERT INTO audit_reports VALUES(?,?)').run('damaged', 'PRIVATE_CONTENT_NOT_JSON');
  assert.throws(() => store.save({ memo: {} }), error => /Retention could not inspect/.test(error.message) && !error.message.includes('PRIVATE_CONTENT'));
  assert.ok(store.load('old000001'));
});

test('concurrent SQLite writers preserve retained lineage and never leave cleanup orphans', async () => {
  reset(); seed('parent001'); evidence('parent001'); fill();
  const run=()=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--input-type=module','-e',`
      const {db}=await import('./server/database.mjs'); const store=await import('./server/store.mjs');
      for(let i=0;i<12;i++)store.save({parentId:'parent001',memo:{}},{retain:true});
      db.close();
    `],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:dir},windowsHide:true,stdio:['ignore','ignore','pipe']});
    let error='';child.stderr.on('data',chunk=>{error+=chunk;});child.once('error',reject);
    child.once('exit',code=>code===0?resolve():reject(new Error(error)));
  });
  await Promise.all([run(),run()]);
  assert.ok(store.load('parent001'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM operational_evidence e LEFT JOIN snapshots s ON s.id=e.source_id WHERE s.id IS NULL').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM snapshots WHERE pinned=1').get().n,24);
});
