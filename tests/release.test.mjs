import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const dir=mkdtempSync(join(tmpdir(),'houselights-release-'));
process.env.DATA_DIR=dir;process.env.PUBLIC_DEMO='1';process.env.ORGANIZER_TOKEN='local-release-fixture-token-'.repeat(2);
process.env.QLOO_MODE='mock';process.env.LLM_MODE='off';process.env.PUBLIC_LANDING_PAGE='judge';process.env.RELEASE_COMMIT='a'.repeat(40);
const {db}=await import('../server/database.mjs');
const {seedPublicCases}=await import('../server/release-seed.mjs');
const {verifyPublicRelease,releaseOrigin}=await import('../server/release-check.mjs');
const {listJudgeCases}=await import('../server/judge.mjs');
const {createApp}=await import('../server/app.mjs');
const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,realFetch=globalThis.fetch;
globalThis.fetch=()=>assert.fail('Release seed and judge checks must not invoke providers.');
after(async()=>{globalThis.fetch=realFetch;await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>db.exec('DELETE FROM judge_cases;DELETE FROM release_seeds;DELETE FROM quotas;'));
const snapshot=()=>({mock:true,memo:{exampleBookingTerms:true,currency:'GBP',input:{city:'Fixture',anchors:['Example']},constraints:{slots:2,budget:100},
  items:['a','b','c'].map((id,i)=>({id,name:id,fit:1-i/3,rank:i+1,evidence:{rank:true},evidenceReceipts:{rank:['r1']},terms:{fee:40-i*10,available:true,genre:id}}))},
  receipts:[{id:'r1',tool:'rank',status:'ok',source:'synthetic',args:{options:['a','b','c']},evidence:{rows:['a','b','c'].map(id=>({id,name:id}))}}]});
function seedFile(cases=[{title:'Seeded fixture',snapshot:snapshot()}]){
  const path=join(dir,'seed.json');writeFileSync(path,JSON.stringify({version:'1.0',cases}));return path;
}
test('startup seed is atomic, imports only public cases and does not resurrect an unpublished case on restart',()=>{
  const path=seedFile(),first=seedPublicCases(path);assert.equal(first.imported,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM snapshots').get().n,0);
  assert.equal(seedPublicCases(path).reused,true);
  db.prepare('DELETE FROM judge_cases WHERE id=?').run(first.caseIds[0]);
  assert.equal(seedPublicCases(path).imported,0);assert.equal(listJudgeCases().length,0);
  const changed=seedFile([{title:'A new case',snapshot:snapshot()},{title:'Invalid case',snapshot:{}}]);
  assert.throws(()=>seedPublicCases(changed));assert.equal(listJudgeCases().length,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM release_seeds').get().n,1);
});
test('duplicate or oversized seeds are rejected without a partial catalog',()=>{
  const row={title:'Duplicate',snapshot:snapshot()};
  assert.throws(()=>seedPublicCases(seedFile([row,row])),/duplicate/);
  assert.equal(listJudgeCases().length,0);
  const path=join(dir,'large.json');writeFileSync(path,' '.repeat(2_000_001));
  assert.throws(()=>seedPublicCases(path),/2 MB/);
});
test('public release check exercises protected access and deterministic experiments without altering seeded cases',async()=>{
  seedPublicCases(seedFile());const before=JSON.stringify(listJudgeCases());
  const report=await verifyPublicRelease(origin,{allowLocal:true,allowSynthetic:true,expectedCommit:'a'.repeat(40),fetcher:realFetch});
  assert.equal(report.passed,true,JSON.stringify(report.checks.filter(c=>!c.passed)));
  assert.equal(report.scope,'local-rehearsal');assert.equal(report.cases.length,1);
  assert.equal(JSON.stringify(listJudgeCases()),before);
  assert.equal(db.prepare('SELECT count(*) AS n FROM snapshots').get().n,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM research_runs').get().n,0);
  const page=await realFetch(origin+'/',{redirect:'manual'});assert.equal(page.status,302);assert.equal(page.headers.get('location'),'/judge.html');
});
test('release checks fail for an incorrect commit, synthetic mode or missing access protection',async()=>{
  seedPublicCases(seedFile());
  let report=await verifyPublicRelease(origin,{allowLocal:true,expectedCommit:'b'.repeat(40),fetcher:realFetch});
  assert.equal(report.passed,false);assert.ok(report.checks.some(c=>c.name==='deployed-commit'&&!c.passed));
  assert.ok(report.checks.some(c=>c.name==='data-mode'&&!c.passed));
  const paths=[];
  report=await verifyPublicRelease('https://example.com',{fetcher:async url=>{
    paths.push(new URL(url).pathname);
    return new Response(JSON.stringify(url.endsWith('/api/access')?{protected:false,editable:true}:{ok:true,mock:false,keyed:true,llm:true,protected:false}),{headers:{'cache-control':'no-store'}});
  }});
  assert.equal(report.passed,false);assert.deepEqual(paths,['/healthz','/api/access']);
});
test('origin validation refuses credential-bearing or ambiguous targets',()=>{
  assert.equal(releaseOrigin('https://example.com'),'https://example.com');
  for(const value of ['https://user:secret@example.com','https://example.com/path','https://example.com/?token=secret','https://example.com/#secret','http://example.com','http://localhost:8082'])
    assert.throws(()=>releaseOrigin(value));
  assert.equal(releaseOrigin('http://127.0.0.1:8082',{allowLocal:true}),'http://127.0.0.1:8082');
});
