import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'houselights-judge-'));
process.env.DATA_DIR=dir;process.env.PUBLIC_DEMO='1';process.env.ORGANIZER_TOKEN='judge-organizer-token-'.repeat(3);process.env.QLOO_MODE='mock';
const {db}=await import('../server/database.mjs');
const store=await import('../server/store.mjs');
const {createApp}=await import('../server/app.mjs');
const judge=await import('../server/judge.mjs');
const {optimizeSlate}=await import('../server/optimizer.mjs');
const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`,realFetch=globalThis.fetch;
globalThis.fetch=()=>assert.fail('Judge experiments must not call any provider.');
after(async()=>{globalThis.fetch=realFetch;await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>db.exec('DELETE FROM judge_cases; DELETE FROM quotas;'));
const post=(path,body,auth=false)=>realFetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+process.env.ORGANIZER_TOKEN}:{})},body:JSON.stringify(body)});
function source(){
  const items=['a','b','c'].map((id,i)=>({id,name:id,fit:[1,.8,.3][i],rank:i+1,of:3,found:false,evidence:{rank:true},evidenceReceipts:{rank:['r1']},receipts:['r1'],
    note:'PRIVATE-SENTINEL',terms:{fee:[60,40,20][i],available:true,genre:id,contract:'PRIVATE-SENTINEL'}}));
  const constraints={budget:100,slots:2};return {mock:true,input:{exampleBookingTerms:true,private:'PRIVATE-SENTINEL'},memo:{items,constraints,currency:'GBP',input:{city:'Fixture',anchors:['Anchor'],secret:'PRIVATE-SENTINEL'},slate:optimizeSlate(items,constraints),private:'PRIVATE-SENTINEL'},
    investigation:{secret:'PRIVATE-SENTINEL'},benchmark:{secret:'PRIVATE-SENTINEL'},decisionSession:{token:'PRIVATE-SENTINEL'},
    receipts:[{id:'r1',tool:'rank',status:'ok',source:'synthetic',args:{options:items.map(i=>i.id),signals:['anchor-id'],secret:'PRIVATE-SENTINEL'},evidence:{rows:items.map(i=>({id:i.id,name:i.name,secret:'PRIVATE-SENTINEL'}))},raw:'PRIVATE-SENTINEL'}]};
}
test('organizer publishes an immutable projection; private fields stay out and export can be imported without changing its ID',async()=>{
  const id=store.save(source());assert.equal((await post('/api/judge/cases',{sourceId:id,title:'Fixture'})).status,401);
  const response=await post('/api/judge/cases',{sourceId:id,title:'Fixture'},true);assert.equal(response.status,201);const record=await response.json();
  assert.ok(!JSON.stringify(record).includes('PRIVATE-SENTINEL'));assert.ok(!JSON.stringify(record).includes(id));
  assert.equal(judge.publishJudgeCase(record.snapshot,record.title).id,record.id);
  const publicResult=await (await realFetch(base+'/api/judge/cases/'+record.id)).json();assert.deepEqual(publicResult,record);
  assert.deepEqual(record.snapshot.memo.slate.selectedIds,['a','b']);assert.equal(record.snapshot.memo.slate.score,source().memo.slate.score);
  assert.equal((await post('/api/judge/cases/'+id+'/experiment',{})).status,401);
  const original=store.load(id);original.memo.items[0].terms.fee=10000;
  db.prepare('UPDATE snapshots SET body=? WHERE id=?').run(JSON.stringify(original),id);
  assert.equal(judge.loadJudgeCase(record.id).snapshot.memo.items[0].terms.fee,60);
});
test('public experiments recompute exact results, preserve survivors and never save or approve plans',async()=>{
  const record=judge.publishJudgeCase(source(),'Fixture'),path='/api/judge/cases/'+record.id+'/experiment';
  const before=db.prepare('SELECT count(*) AS n FROM snapshots').get().n;
  const response=await post(path,{budget:60});assert.equal(response.status,200);const result=await response.json();
  assert.deepEqual(result.snapshot.memo.slate.selectedIds,['b','c']);assert.equal(result.comparison.feeDelta,-40);assert.equal(result.persisted,false);assert.equal(result.providerCalls,0);
  const recovered=await (await post(path,{cancelId:'a'})).json();assert.deepEqual(recovered.snapshot.memo.slate.selectedIds,['b','c']);assert.equal(recovered.comparison.survivorsPreserved,true);
  const impossible=await (await post(path,{cancelId:'a',excludedIds:['b']})).json();assert.equal(impossible.snapshot.memo.slate.feasible,false);assert.equal(impossible.comparison.survivorsPreserved,null);
  assert.equal(db.prepare('SELECT count(*) AS n FROM snapshots').get().n,before);assert.deepEqual(judge.loadJudgeCase(record.id),record);
  assert.equal((await post('/api/benchmarks',{sourceId:'anything'})).status,401);assert.equal((await post('/api/scenario',{})).status,401);
});
test('withdrawing rank evidence makes fit unknown for every dependent artist and blocks proof',async()=>{
  const record=judge.publishJudgeCase(source(),'Fixture');
  const result=judge.judgeExperiment(record,{withdrawReceiptId:'r1'});
  assert.equal(result.proof.status,'blocked');assert.deepEqual(result.comparison.affectedIds,['a','b','c']);
  assert.ok(result.snapshot.memo.items.every(i=>i.fit===null&&i.evidence.rank===false));
  assert.ok(result.proof.findings.some(f=>f.id==='missing-rank'));assert.equal(record.snapshot.receipts[0].status,'ok');
});
test('rejects injected scores, unknown IDs, unsupported budgets and non-illustrative publication',async()=>{
  const record=judge.publishJudgeCase(source(),'Fixture'),path='/api/judge/cases/'+record.id+'/experiment';
  for(const body of [{items:[{fit:10000}]},{lockedIds:['invented']},{budget:'60'},{budget:-1},{budget:1e12},{cancelId:'c'},{withdrawReceiptId:'invented'}])assert.equal((await post(path,body)).status,400);
  assert.equal((await post('/api/judge/cases/'+'f'.repeat(24)+'/experiment',{})).status,404);
  const real=source();real.input.exampleBookingTerms=false;assert.throws(()=>judge.publishJudgeCase(real,'Fixture'),/illustrative/);
});
test('public calculation quota bounds resource use while saved cases remain readable',async()=>{
  const record=judge.publishJudgeCase(source(),'Fixture'),minute=Math.floor(Date.now()/60000);
  db.prepare('INSERT INTO quotas(key,count,expires) VALUES(?,?,?)').run(`judge-global:${minute}`,60,(minute+1)*60000);
  assert.equal((await post('/api/judge/cases/'+record.id+'/experiment',{})).status,429);
  assert.equal((await realFetch(base+'/api/judge/cases/'+record.id)).status,200);
});
