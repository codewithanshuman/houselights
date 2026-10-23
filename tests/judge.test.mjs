import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'houselights-judge-'));
process.env.DATA_DIR=dir;process.env.PUBLIC_DEMO='1';process.env.ORGANIZER_TOKEN='judge-organizer-token-'.repeat(3);process.env.QLOO_MODE='mock';
const {db}=await import('../server/database.mjs');
const store=await import('../server/store.mjs');
const {createApp}=await import('../server/app.mjs');
const judge=await import('../server/judge.mjs');
const {optimizeSlate}=await import('../server/optimizer.mjs');
const {benchmarkFestival}=await import('../server/gm.mjs');
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
    trace:[{type:'start',elapsedMs:0,text:'PRIVATE-SENTINEL'},{type:'stage',elapsedMs:5,text:'PRIVATE-SENTINEL'},
      {type:'receipt',elapsedMs:11,receiptId:'r1',text:'PRIVATE-SENTINEL'},
      {type:'plan',elapsedMs:15,text:'PRIVATE-SENTINEL'},{type:'memo',elapsedMs:20,feasible:true,text:'PRIVATE-SENTINEL'}],
    receipts:[{id:'r1',tool:'rank',status:'ok',source:'synthetic',args:{options:items.map(i=>i.id),signals:['anchor-id'],secret:'PRIVATE-SENTINEL'},evidence:{rows:items.map(i=>({id:i.id,name:i.name,secret:'PRIVATE-SENTINEL'}))},raw:'PRIVATE-SENTINEL'}]};
}
async function benchmarkSource(selectedIds=['a','c']){
  const s=source();
  s.benchmark=await benchmarkFestival(s,{propose:async()=>({selectedIds,reason:'PRIVATE-SENTINEL'})});
  // Fabricated provider metadata belongs only to this synthetic unit fixture.
  s.benchmark.generation={mode:'live',status:'ok',httpStatus:200,toolsAllowed:false,provider:'groq',model:'fixture-model',
    promptDigest:'sha256:'+'1'.repeat(64),requestDigest:'sha256:'+'2'.repeat(64),responseDigest:'sha256:'+'3'.repeat(64),requestId:'PRIVATE-SENTINEL',raw:'PRIVATE-SENTINEL'};
  s.benchmarkTrial={index:1,reviewTrial:1,batchId:'PRIVATE-SENTINEL'};
  return s;
}
test('organizer publishes an immutable projection; private fields stay out and export can be imported without changing its ID',async()=>{
  const id=store.save(source());assert.equal((await post('/api/judge/cases',{sourceId:id,title:'Fixture'})).status,401);
  const response=await post('/api/judge/cases',{sourceId:id,title:'Fixture'},true);assert.equal(response.status,201);const record=await response.json();
  assert.ok(!JSON.stringify(record).includes('PRIVATE-SENTINEL'));assert.ok(!JSON.stringify(record).includes(id));
  assert.deepEqual(record.snapshot.trace.map(event=>event.type),['start','stage','receipt','plan','memo']);
  assert.equal(record.snapshot.trace[2].receiptId,'r1');
  assert.equal(judge.publishJudgeCase(record.snapshot,record.title).id,record.id);
  const publicResult=await (await realFetch(base+'/api/judge/cases/'+record.id)).json();assert.deepEqual(publicResult,record);
  assert.deepEqual(record.snapshot.memo.slate.selectedIds,['a','b']);assert.equal(record.snapshot.memo.slate.score,source().memo.slate.score);
  assert.equal((await post('/api/judge/cases/'+id+'/experiment',{})).status,401);
  const original=store.load(id);original.memo.items[0].terms.fee=10000;
  db.prepare('UPDATE snapshots SET body=? WHERE id=?').run(JSON.stringify(original),id);
  assert.equal(judge.loadJudgeCase(record.id).snapshot.memo.items[0].terms.fee,60);
});
test('curated live case preserves a complete authentic event-to-receipt chain and matched Qloo counterfactual',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../deploy/judge-cases.json',import.meta.url),'utf8'));
  const row=manifest.cases.find(entry=>entry.title==='New York: watch a recorded Qloo research run');
  assert.ok(row);
  const record=judge.publishJudgeCase(row.snapshot,row.title),snapshot=record.snapshot;
  assert.equal(record.id,'8be4d03ef4792ca9f1466983');
  assert.equal(snapshot.mock,false);
  assert.equal(snapshot.traceMeta.complete,true);
  assert.equal(snapshot.traceMeta.linkedReceipts,snapshot.receipts.length);
  assert.equal(snapshot.trace[0].type,'start');
  assert.equal(snapshot.trace.at(-1).type,'memo');
  assert.deepEqual(snapshot.trace.filter(event=>event.type==='receipt').map(event=>event.receiptId),snapshot.receipts.map(receipt=>receipt.id));
  assert.ok(snapshot.receipts.every(receipt=>receipt.source==='qloo'&&receipt.why&&/^sha256:[a-f0-9]{64}$/.test(receipt.originalDigest)));
  assert.ok(snapshot.trace.some(event=>event.type==='plan'&&event.by==='llm'&&event.deep.length>0));
  assert.equal(judge.publishJudgeCase(snapshot,row.title).id,record.id);
  const off=judge.judgeExperiment(record,{qlooOff:true});
  assert.equal(off.comparison.matchedEvidenceWithdrawal,true);
  assert.equal(off.comparison.changed,true);
  assert.equal(off.providerCalls,0);
  assert.deepEqual(off.snapshot.memo.constraints,snapshot.memo.constraints);
  assert.deepEqual(off.snapshot.memo.items.map(item=>item.terms),snapshot.memo.items.map(item=>item.terms));
});
test('headline all-signal withdrawal agrees with the interactive replay for every published case',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../deploy/judge-cases.json',import.meta.url),'utf8'));
  for(const row of manifest.cases){
    const record=judge.publishJudgeCase(row.snapshot,row.title);
    const all=record.proof.ablations.find(candidate=>candidate.id==='class:all');
    const interactive=judge.judgeExperiment(record,{qlooOff:true});
    assert.ok(all,`missing saved all-signal withdrawal for ${row.title}`);
    assert.deepEqual([...all.selectedIds].sort(),[...interactive.snapshot.memo.slate.selectedIds].sort(),row.title);
    assert.equal(interactive.comparison.matchedEvidenceWithdrawal,true,row.title);
  }
});
test('public experiments recompute exact results, preserve survivors and never save or approve plans',async()=>{
  const record=judge.publishJudgeCase(source(),'Fixture'),path='/api/judge/cases/'+record.id+'/experiment';
  const before=db.prepare('SELECT count(*) AS n FROM snapshots').get().n;
  const response=await post(path,{budget:60});assert.equal(response.status,200);const result=await response.json();
  assert.deepEqual(result.snapshot.memo.slate.selectedIds,['b','c']);assert.equal(result.comparison.feeDelta,-40);assert.equal(result.persisted,false);assert.equal(result.providerCalls,0);
  const recovered=await (await post(path,{cancelId:'a'})).json();assert.deepEqual(recovered.snapshot.memo.slate.selectedIds,['b','c']);assert.equal(recovered.comparison.survivorsPreserved,true);
  const higherFee=judge.judgeExperiment(record,{feeIncreaseId:'a'});assert.equal(higherFee.snapshot.memo.items.find(item=>item.id==='a').terms.fee,69);
  const unavailable=judge.judgeExperiment(record,{unavailableId:'a'});assert.deepEqual(unavailable.snapshot.memo.slate.selectedIds,['b','c']);
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
test('Qloo-off replay withdraws every linked receipt and keeps the same booking constraints',()=>{
  const record=judge.publishJudgeCase(source(),'Fixture');
  const result=judge.judgeExperiment(record,{qlooOff:true});
  assert.equal(result.qlooOff,true);
  assert.equal(result.comparison.matchedEvidenceWithdrawal,true);
  assert.equal(result.providerCalls,0);
  assert.equal(result.proof.status,'blocked');
  assert.deepEqual(result.snapshot.memo.constraints,record.snapshot.memo.constraints);
  assert.ok(result.snapshot.memo.items.every(item=>item.fit===null&&Object.values(item.evidence).every(value=>value===false)));
  assert.ok(result.snapshot.receipts.every(receipt=>receipt.status==='withdrawn'));
  assert.equal(record.snapshot.receipts[0].status,'ok');
  assert.equal(judge.judgeExperiment(record,{qlooOff:true,budget:60}).comparison.matchedEvidenceWithdrawal,false);
  assert.equal(judge.judgeExperiment(record,{qlooOff:true,withdrawReceiptId:record.snapshot.receipts[0].id}).comparison.matchedEvidenceWithdrawal,false);
});
test('judge publication rejects malformed optional links and unexpected route failures stay private',async()=>{
  const malformed=source();malformed.memo.items[0].culturalLinks=[null];
  assert.throws(()=>judge.publishJudgeCase(malformed,'Malformed'),/malformed cultural links/);
  const id='a'.repeat(24);
  db.prepare('INSERT INTO judge_cases(id,body) VALUES(?,?)').run(id,'{invalid-json');
  const originalError=console.error;console.error=()=>{};
  try{
    const response=await realFetch(base+'/api/judge/cases/'+id);
    assert.equal(response.status,500);
    assert.deepEqual(await response.json(),{error:'The request could not be completed.'});
  }finally{console.error=originalError;}
});
test('rejects injected scores, unknown IDs, unsupported budgets and non-illustrative publication',async()=>{
  const record=judge.publishJudgeCase(source(),'Fixture'),path='/api/judge/cases/'+record.id+'/experiment';
  for(const body of [{items:[{fit:10000}]},{lockedIds:['invented']},{budget:'60'},{budget:-1},{budget:1e12},{cancelId:'c'},{feeIncreaseId:'c'},{unavailableId:'c'},{withdrawReceiptId:'invented'}])assert.equal((await post(path,body)).status,400);
  assert.equal((await post('/api/judge/cases/'+'f'.repeat(24)+'/experiment',{})).status,404);
  const real=source();real.input.exampleBookingTerms=false;assert.throws(()=>judge.publishJudgeCase(real,'Fixture'),/illustrative/);
});
test('public calculation quota bounds resource use while saved cases remain readable',async()=>{
  const record=judge.publishJudgeCase(source(),'Fixture'),minute=Math.floor(Date.now()/60000);
  db.prepare('INSERT INTO quotas(key,count,expires) VALUES(?,?,?)').run(`judge-global:${minute}`,60,(minute+1)*60000);
  assert.equal((await post('/api/judge/cases/'+record.id+'/experiment',{})).status,429);
  assert.equal((await realFetch(base+'/api/judge/cases/'+record.id)).status,200);
});

test('publishes a reduced first-trial control, recomputes all scores and preserves its export identity',async()=>{
  const s=await benchmarkSource();s.benchmark.control.score=999999;
  const record=judge.publishJudgeCase(s,'Three methods');
  assert.ok(!JSON.stringify(record).includes('PRIVATE-SENTINEL'));
  assert.deepEqual(record.methods.qloo.selectedIds,['a','b']);
  assert.deepEqual(record.methods.constraintOnly.selectedIds,['b','c']);
  assert.deepEqual(record.methods.llm.selectedIds,['a','c']);
  assert.equal(record.methods.llm.mode,'saved_benchmark');assert.equal(record.methods.llm.comparable,true);
  assert.notEqual(record.methods.llm.score,999999);assert.equal(record.methods.llm.totalFee,80);
  assert.equal(record.snapshot.benchmark.evidenceMode,'mock');
  assert.equal(judge.publishJudgeCase(record.snapshot,record.title).id,record.id);
  const roundtrip=judge.loadJudgeCase(record.id);assert.deepEqual(roundtrip,record);
  assert.equal(record.snapshot.benchmark.generation.requestId,undefined);
  assert.equal(record.snapshot.benchmarkTrial.batchId,undefined);
});

test('public budget and cancellation replays retain the original LLM choices and expose violations without provider calls',async()=>{
  const record=judge.publishJudgeCase(await benchmarkSource(),'Three methods');
  const response=await post('/api/judge/cases/'+record.id+'/experiment',{budget:60});
  assert.equal(response.status,200);const result=await response.json();
  assert.deepEqual(result.methods.qloo.selectedIds,['b','c']);assert.deepEqual(result.methods.llm.selectedIds,['a','c']);
  assert.equal(result.methods.llm.totalFee,80);assert.equal(result.methods.llm.feasible,false);
  assert.equal(result.methods.llm.status,'infeasible');assert.equal(result.methods.llm.sameBrief,false);
  assert.equal(result.methods.llm.mode,'fixed_selection_replay');assert.equal(result.methods.llm.comparable,false);
  assert.equal(result.methods.policyPointDelta,null);assert.equal(result.proof.llmOnly.status,'stale');
  assert.ok(result.methods.llm.violations.some(v=>v.includes('budget')));assert.equal(result.providerCalls,0);
  const canceled=judge.judgeExperiment(record,{cancelId:'a'});
  assert.deepEqual(canceled.methods.llm.selectedIds,['a','c']);
  assert.ok(canceled.methods.llm.violations.some(v=>v.includes('excluded')));
  assert.ok(canceled.methods.llm.violations.some(v=>v.includes('Locked')));
  const controlOnly=judge.judgeExperiment(record,{cancelId:'c'});
  assert.deepEqual(controlOnly.snapshot.memo.slate.selectedIds,['a','b']);
  assert.ok(controlOnly.methods.llm.violations.some(v=>v.includes('excluded')));
  assert.deepEqual(judge.loadJudgeCase(record.id),record);
  assert.equal(judge.judgeExperiment(record,{}).methods.llm.mode,'saved_benchmark');
});

test('receipt withdrawal invalidates score comparison even when booking inputs remain identical',async()=>{
  const record=judge.publishJudgeCase(await benchmarkSource(),'Three methods');
  const result=judge.judgeExperiment(record,{withdrawReceiptId:'r1'});
  assert.equal(result.methods.llm.sameBrief,true);assert.equal(result.methods.llm.evidenceChanged,true);
  assert.equal(result.methods.llm.mode,'fixed_selection_replay');assert.equal(result.methods.llm.comparable,false);
  assert.equal(result.methods.policyPointDelta,null);assert.equal(result.proof.llmOnly.status,'not_comparable');
  assert.equal(result.proof.status,'blocked');
});

test('rejects stale or altered briefs, later trials and unauditable model controls',async()=>{
  for(const mutate of [
    s=>{s.memo.constraints.budget=90;},
    s=>{s.benchmark.brief.city='Different';},
    s=>{s.benchmarkTrial.index=2;},
    s=>{s.benchmarkTrial.reviewTrial=2;s.benchmarkTrial.index=2;},
    s=>{delete s.benchmarkTrial;},
    s=>{s.benchmark.generation.mode='injected';},
    s=>{s.benchmark.generation.status='test_adapter';},
    s=>{s.benchmark.generation.toolsAllowed=true;},
    s=>{s.benchmark.generation.httpStatus=429;},
    s=>{delete s.benchmark.generation.responseDigest;},
    s=>{s.benchmark.control.selectedIds=['unknown'];},
    s=>{s.benchmark.control.selectedIds=['a','a'];},
    s=>{s.benchmark.qloo.selectedIds=['b','c'];},
    s=>{s.benchmark.evidenceMode='live';},
  ]){
    const s=await benchmarkSource();mutate(s);assert.throws(()=>judge.publishJudgeCase(s,'Rejected'));
  }
});

test('failed first trials stay visible and constraint failures are not repaired or compared',async()=>{
  const s=await benchmarkSource(['a']);assert.equal(s.benchmark.status,'constraint_failure');
  let record=judge.publishJudgeCase(s,'Constraint failure');
  assert.deepEqual(record.methods.llm.selectedIds,['a']);assert.equal(record.methods.llm.feasible,false);
  assert.equal(record.methods.policyPointDelta,null);
  const invalid=await benchmarkSource(['unknown']);record=judge.publishJudgeCase(invalid,'Invalid response');
  assert.equal(record.methods.llm.status,'invalid_control');assert.equal(record.methods.llm.available,false);
  const failed=await benchmarkSource();failed.benchmark.status='unavailable';failed.benchmark.control=null;
  failed.benchmark.generation.status='provider_error';failed.benchmark.generation.httpStatus=429;
  record=judge.publishJudgeCase(failed,'Provider unavailable');
  assert.equal(record.methods.llm.status,'unavailable');assert.equal(record.methods.llm.available,false);
  assert.equal(record.methods.llm.generation.httpStatus,429);
  assert.equal(judge.publishJudgeCase(record.snapshot,record.title).id,record.id);
});

test('incomplete ranks retain the non-comparable first trial without a model call or invented control',async()=>{
  const s=source();s.memo.items[0].evidence.rank=false;s.memo.items[0].fit=null;
  s.benchmark=await benchmarkFestival(s,{propose:async()=>assert.fail('Incomplete rankings must not call a model.')});
  s.benchmarkTrial={index:1,reviewTrial:1};
  const record=judge.publishJudgeCase(s,'Incomplete ranking');
  assert.equal(record.methods.llm.status,'not_comparable');assert.equal(record.methods.llm.available,false);
  assert.equal(record.snapshot.benchmark.generation.mode,'not_called');
  assert.equal(judge.publishJudgeCase(record.snapshot,record.title).id,record.id);
});
