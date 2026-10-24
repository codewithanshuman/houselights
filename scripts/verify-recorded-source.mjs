import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyProjection(bytes,expectedDigest,project,expected,title){
  if(!/^[a-f0-9]{64}$/.test(expectedDigest)||hash(bytes)!==expectedDigest)throw new Error('Private source digest mismatch.');
  let source;try{source=JSON.parse(bytes.toString('utf8'));}catch{throw new Error('Private source is not valid JSON.');}
  const projected=project(source);
  if(JSON.stringify(projected)!==JSON.stringify(expected))throw new Error('Private source public projection mismatch.');
  const caseId=hash(JSON.stringify({version:'1.0',title,snapshot:projected})).slice(0,24);
  return {passed:true,sourceDigest:expectedDigest,projectionMatches:true,caseId,
    events:projected.trace?.length??0,receipts:projected.receipts.length,providerCalls:0};
}
async function main(){
  const path=resolve(process.argv[2]??'artifacts/captured-source.json');
  // Confirm the retained original is ignored AND untracked, without printing it.
  execFileSync('git',['check-ignore','--quiet','--',path],{stdio:'ignore'});
  const tracked=execFileSync('git',['ls-files','--',path],{encoding:'utf8'}).trim();
  if(tracked)throw new Error('Private source must remain untracked.');
  const doc=readFileSync('docs/recorded-agent-run.md','utf8');
  const expectedDigest=doc.match(/file digest is `([a-f0-9]{64})`/)?.[1];
  const seed=JSON.parse(readFileSync('deploy/judge-cases.json','utf8'));
  const row=seed.cases.find(row=>row.title==='New York: watch a recorded Qloo research run');
  const dir=mkdtempSync(join(tmpdir(),'houselights-private-audit-'));
  process.env.DATA_DIR=dir;
  let db;
  try{
    const judge=await import('../server/judge.mjs');
    db=(await import('../server/database.mjs')).db;
    const report=verifyProjection(readFileSync(path),expectedDigest,judge.publicJudgeSnapshot,row.snapshot,row.title);
    if(report.caseId!=='8be4d03ef4792ca9f1466983')throw new Error('Public case identity mismatch.');
    console.log(JSON.stringify({...report,ignored:true,tracked:false,node:process.version}));
  }finally{db?.close();rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(()=>{console.error('Recorded-source verification failed. Inspect the local source, documented digest, ignore rules and public projection; no private content was emitted.');process.exitCode=1;});
}
