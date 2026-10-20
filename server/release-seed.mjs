import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {db,transaction} from './database.mjs';
import {publishJudgeCase} from './judge.mjs';

db.exec(`CREATE TABLE IF NOT EXISTS release_seeds(
  digest TEXT PRIMARY KEY, imported_at TEXT NOT NULL, case_ids TEXT NOT NULL)`);

// Only the curated public case format is accepted. This never imports snapshots,
// invitation tokens, operational documents, approvals or the private database.
export function seedPublicCases(path) {
  if(!path)return {configured:false,imported:0};
  if(statSync(path).size>2_000_000)throw new Error('Public case seed exceeds 2 MB.');
  const file=JSON.parse(readFileSync(path,'utf8'));
  if(file.version!=='1.0'||!Array.isArray(file.cases)||file.cases.length<1||file.cases.length>20)throw new Error('Expected a public case export containing 1–20 cases.');
  const digest=createHash('sha256').update(JSON.stringify(file)).digest('hex');
  return transaction(()=>{
    const existing=db.prepare('SELECT case_ids FROM release_seeds WHERE digest=?').get(digest);
    // An organizer may unpublish a seeded case. A routine restart must not undo it.
    if(existing)return {configured:true,imported:0,reused:true,digest,caseIds:JSON.parse(existing.case_ids)};
    const caseIds=file.cases.map(row=>publishJudgeCase(row.snapshot,row.title).id);
    if(new Set(caseIds).size!==caseIds.length)throw new Error('Public case seed contains duplicate cases.');
    db.prepare('INSERT INTO release_seeds(digest,imported_at,case_ids) VALUES(?,?,?)').run(digest,new Date().toISOString(),JSON.stringify(caseIds));
    return {configured:true,imported:caseIds.length,reused:false,digest,caseIds};
  });
}
