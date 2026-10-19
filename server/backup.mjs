import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const quote = name => '"' + name.replaceAll('"','""') + '"';
export function inspectDatabase(path) {
  const db = new DatabaseSync(path, {readOnly:true});
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all().map(row=>Object.values(row)[0]);
    if (integrity.length!==1 || integrity[0]!=='ok') throw new Error('Database integrity check failed.');
    const tables = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return {integrity:'ok',tables:tables.map(table=>{
      const rows=db.prepare('SELECT * FROM '+quote(table.name)).all().map(row=>JSON.stringify(row)).sort();
      return {name:table.name,rows:rows.length,digest:'sha256:'+createHash('sha256').update(JSON.stringify({schema:table.sql,rows})).digest('hex')};
    })};
  } finally {db.close();}
}
export async function createVerifiedBackup(source, directory) {
  source=resolve(source);directory=resolve(directory);
  if(!existsSync(source))throw new Error('Source database does not exist.');
  if(existsSync(directory))throw new Error('Use a new backup directory; existing files are never overwritten.');
  mkdirSync(directory,{recursive:true});
  const destination=join(directory,'houselights.sqlite'),db=new DatabaseSync(source,{readOnly:true});
  try {await backup(db,destination);} finally {db.close();}
  const inspection=inspectDatabase(destination);
  const manifest={version:'1.0',createdAt:new Date().toISOString(),...inspection,method:'SQLite online backup; integrity and table-content digests verified. Contains private operational data; do not publish.'};
  writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
  return {directory,...manifest};
}
export async function verifyRestore(directory, destination) {
  directory=resolve(directory);destination=resolve(destination);
  if(existsSync(destination))throw new Error('Restore drill requires a new destination directory.');
  const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
  const inspection=inspectDatabase(join(directory,'houselights.sqlite'));
  if(JSON.stringify(inspection.tables)!==JSON.stringify(manifest.tables))throw new Error('Backup content does not match its manifest.');
  mkdirSync(destination,{recursive:true});
  const db=new DatabaseSync(join(directory,'houselights.sqlite'),{readOnly:true});
  try {await backup(db,join(destination,'houselights.sqlite'));}finally{db.close();}
  const restored=inspectDatabase(join(destination,'houselights.sqlite'));
  if(JSON.stringify(restored.tables)!==JSON.stringify(manifest.tables))throw new Error('Restored content does not match its backup.');
  return {status:'verified',destination,...restored,scope:'Offline integrity and content-preserving restore drill. Hosted volume persistence must still be checked on the chosen host.'};
}
