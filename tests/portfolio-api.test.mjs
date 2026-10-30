import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'houselights-portfolio-'));
process.env.DATA_DIR=dir;process.env.QLOO_MODE='mock';process.env.PUBLIC_DEMO='1';process.env.ORGANIZER_TOKEN='portfolio-test-only-'.repeat(3);
process.env.LLM_PROVIDER='groq';process.env.GROQ_API_KEY='test-only';process.env.LLM_MODEL='openai/gpt-oss-120b';delete process.env.LLM_MODE;
const {db}=await import('../server/database.mjs');
const store=await import('../server/store.mjs');
const {createApp}=await import('../server/app.mjs');
const {executeNextResearchRun}=await import('../server/research-runs.mjs');
const {optimizeSlate}=await import('../server/optimizer.mjs');
const {createStudy,blindReview,submitBallot,studyReport}=await import('../server/reviews.mjs');
const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`,realFetch=globalThis.fetch;
after(async()=>{globalThis.fetch=realFetch;await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});});
const post=(path,body,auth=true)=>realFetch(base+path,{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID(),...(auth?{authorization:'Bearer '+process.env.ORGANIZER_TOKEN}:{})},body:JSON.stringify(body)});
const getBatch=async id=>(await realFetch(base+'/api/benchmarks/'+id,{headers:{authorization:'Bearer '+process.env.ORGANIZER_TOKEN}})).json();
const source=()=>{
  const items=['a','b','c','d'].map((id,i)=>({id,name:id,fit:1-i*.2,evidence:{rank:true},evidenceReceipts:{rank:['r1']},receipts:['r1'],terms:{fee:[60,40,30,20][i],available:true,genre:id}}));
  const memo={items,currency:'GBP',mode:'mock',input:{city:'London',anchors:['anchor']},constraints:{budget:100,slots:1}};memo.slate=optimizeSlate(items,memo.constraints);
  return store.save({mock:true,memo,receipts:[{id:'r1',tool:'rank',status:'ok',source:'synthetic'}]});
};
test('portfolio APIs retain only organizer sources, ignore client scores and preserve survivors during recovery',async()=>{
  const sourceId=source(),raw={budget:100,maxBookingsPerArtist:1,events:['01','15'].map((day,i)=>({id:`e${i}`,sourceId,start:`2027-04-${day}T18:00:00Z`,end:`2027-04-${day}T23:00:00Z`,resource:'Hall',items:[{id:'evil',fit:10000}]}))};
  assert.equal((await post('/api/portfolios',raw,false)).status,201);
  assert.equal(db.prepare('SELECT pinned FROM snapshots WHERE id=?').get(sourceId).pinned,0,'a visitor pins nothing');
  const response=await post('/api/portfolios',raw);assert.equal(response.status,201);const result=await response.json();assert.equal(result.status,'optimal');assert.equal(result.readiness.status,'evidence_required');assert.ok(!JSON.stringify(result.events).includes('evil'));
  assert.equal(db.prepare('SELECT pinned FROM snapshots WHERE id=?').get(sourceId).pinned,1);
  const old=await (await realFetch(base+'/api/portfolios/'+result.id)).json();
  assert.deepEqual(result,old);assert.equal(result.input.budget,raw.budget);assert.ok(result.createdAt);
  const canceled=old.events[0],survivor=old.events[1];
  const recovered=await (await post('/api/portfolios/'+old.id+'/recover',{eventId:canceled.eventId,artistId:canceled.selectedIds[0]})).json();
  assert.notEqual(recovered.id,old.id);assert.equal(recovered.feasible,true);assert.deepEqual(recovered.events[1].selectedIds,survivor.selectedIds);assert.ok(!recovered.events[0].selectedIds.includes(canceled.selectedIds[0]));
  assert.deepEqual((await (await realFetch(base+'/api/portfolios/'+old.id)).json()).events,old.events);
});
test('benchmark batches retain every provider attempt and predeclare first-trial review selection',async()=>{
  const sourceId=source();let calls=0;
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');const body=JSON.parse(options.body),brief=JSON.parse(body.messages[1].content);
    assert.ok(!JSON.stringify(brief).includes('rank'));assert.ok(!JSON.stringify(brief).includes('r1'));
    calls++;return new Response(JSON.stringify({id:`stub-${calls}`,model:'fixture-model',choices:[{message:{content:JSON.stringify({selectedIds:calls===1?['b']:['invented'],reason:'Synthetic test response'})},finish_reason:'stop'}]}));
  };
  assert.equal((await post('/api/benchmarks',{sourceId,trials:2},false)).status,401);
  const r=await post('/api/benchmarks',{sourceId,trials:2});assert.equal(r.status,202);const queued=await r.json();assert.equal(calls,0);
  await executeNextResearchRun();const batch=await getBatch(queued.run.id);assert.equal(calls,2);assert.equal(batch.summary.feasible,1);assert.equal(batch.summary.invalid,1);assert.equal(batch.reviewSourceId,batch.trials[0].snapshotId);
  assert.equal((await realFetch(base+'/api/benchmarks/'+batch.id)).status,401);
  assert.throws(()=>createStudy({sourceIds:[batch.trials[1].snapshotId],reviewers:['test']}),/first trial/);
  const study=createStudy({sourceIds:[batch.reviewSourceId],reviewers:['Fixture reviewer'],reviewerRoles:{'Fixture reviewer':'venue_programmer'}});
  const [studyId,token]=study.invitations[0].url.split('#')[1].split(':'),blind=blindReview(studyId,token);
  assert.equal(blind.cases[0].synthetic,true);assert.ok(!JSON.stringify(blind).includes('fixture-model'));
  const ratings={a:{culturalFit:4,programBreadth:null,bookingPracticality:3},b:{culturalFit:2,programBreadth:3,bookingPracticality:null}};
  assert.throws(()=>submitBallot(studyId,token,{judgments:[{caseId:blind.cases[0].caseId,preference:'a',reason:'Synthetic fixture only',ratings:{...ratings,a:{...ratings.a,culturalFit:6}}}]}),/1–5/);
  submitBallot(studyId,token,{judgments:[{caseId:blind.cases[0].caseId,preference:'tie',reason:'Synthetic fixture only; not human research.',ratings}]});
  const report=studyReport(studyId);assert.equal(report.roleCoverage[0].completed,1);assert.equal(report.cases[0].tie,1);assert.ok(report.cases[0].reasons[0].ratings.qloo);
  const changed=store.load(batch.reviewSourceId);changed.memo.items[0].terms.fee=61;
  assert.throws(()=>createStudy({sourceIds:[store.save(changed)],reviewers:['test']}),/assumptions changed/);
});

test('provider rate limiting leaves a partial batch with unattempted trials recorded',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{code:'rate_limit_exceeded'}}),{status:429});};
  const response=await post('/api/benchmarks',{sourceId:source(),trials:3});
  assert.equal(response.status,202);const queued=await response.json();await executeNextResearchRun();const batch=await getBatch(queued.run.id);
  assert.equal(calls,1);assert.equal(batch.status,'partial');assert.equal(batch.summary.notAttempted,2);
  assert.equal(batch.reviewSourceId,null);assert.equal(batch.trials[0].benchmark.generation.httpStatus,429);
});
