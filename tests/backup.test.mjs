import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createVerifiedBackup,verifyRestore} from '../server/backup.mjs';
const dir=mkdtempSync(join(tmpdir(),'houselights-backup-'));
after(()=>rmSync(dir,{recursive:true,force:true}));
test('online WAL backup and offline restore preserve private data and schema without overwriting',async()=>{
  const source=join(dir,'source.sqlite'),db=new DatabaseSync(source);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE records(id TEXT PRIMARY KEY, body TEXT NOT NULL)');
  db.prepare('INSERT INTO records VALUES(?,?)').run('a','private source text');
  const backup=await createVerifiedBackup(source,join(dir,'backup'));
  assert.equal(backup.integrity,'ok');assert.equal(backup.tables[0].rows,1);
  db.prepare('INSERT INTO records VALUES(?,?)').run('b','later source text');db.close();
  const restored=await verifyRestore(join(dir,'backup'),join(dir,'restore'));assert.equal(restored.status,'verified');
  const check=new DatabaseSync(join(dir,'restore','houselights.sqlite'));assert.equal(check.prepare('SELECT count(*) AS n FROM records').get().n,1);check.close();
  await assert.rejects(()=>createVerifiedBackup(source,join(dir,'backup')),/never overwritten/);
  await assert.rejects(()=>verifyRestore(join(dir,'backup'),join(dir,'restore')),/new destination/);
});
test('tampered backups fail manifest verification',async()=>{
  const source=join(dir,'tamper.sqlite'),db=new DatabaseSync(source);db.exec('CREATE TABLE t(n INTEGER); INSERT INTO t VALUES(1)');db.close();
  await createVerifiedBackup(source,join(dir,'tampered'));
  const edited=new DatabaseSync(join(dir,'tampered','houselights.sqlite'));edited.exec('INSERT INTO t VALUES(2)');edited.close();
  await assert.rejects(()=>verifyRestore(join(dir,'tampered'),join(dir,'must-not-restore')),/does not match/);
});
