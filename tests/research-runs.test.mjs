import test, {beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const dir=mkdtempSync(join(tmpdir(),'houselights-research-'));
process.env.DATA_DIR=dir;process.env.QLOO_MODE='mock';process.env.LLM_MODE='off';
process.env.PUBLIC_DEMO='1';process.env.ORGANIZER_TOKEN='research-test-token-'.repeat(3);
const jobs=await import('../server/research-runs.mjs');
const store=await import('../server/store.mjs');
const {db}=await import('../server/database.mjs');
const {Run}=await import('../server/qloo.mjs');
const {mockCall}=await import('../server/mock.mjs');
const {optimizeSlate}=await import('../server/optimizer.mjs');
const {decisionFingerprint}=await import('../server/decision-proof.mjs');
const {createApp}=await import('../server/app.mjs');
const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>{db.exec('DELETE FROM research_events; DELETE FROM research_runs; DELETE FROM quotas;');});
function source(){
  const items=['Radiohead','Caribou','Wolf Alice'].map((name,i)=>({id:`artist-${i}`,name,fit:1-i*.3,rank:i+1,of:3,evidence:{rank:true},evidenceReceipts:{rank:['r1']},receipts:['r1'],terms:{fee:[60,40,20][i],available:true,genre:'indie'}}));
  const constraints={budget:100,slots:2};
  return store.save({mock:true,input:{city:'London',anchors:['Radiohead']},receipts:[{id:'r1',tool:'rank',status:'ok',source:'synthetic',args:{options:items.map(i=>i.id)}}],
    memo:{mode:'mock',currency:'GBP',input:{city:'London',anchors:['Radiohead']},items,constraints,slate:optimizeSlate(items,constraints)}});
}
const submit=(id,kind='proof',key='test-request-key-1')=>jobs.createResearchRun({sourceId:id,kind,options:{}},key);
const post=(path,body,key='test-request-api-1',auth=true)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json','idempotency-key':key,...(auth?{authorization:'Bearer '+process.env.ORGANIZER_TOKEN}:{})},body:JSON.stringify(body)});

test('idempotent requests bind exact input and proof completion is atomic, immutable and unapproved',async()=>{
  const id=source(),original=store.load(id),created=submit(id);
  assert.equal(created.run.status,'queued');assert.equal(submit(id).run.id,created.run.id);assert.equal(submit(id).reused,true);
  assert.throws(()=>submit(id,'festival'),/different input/);
  const result=await jobs.executeNextResearchRun();assert.equal(result.status,'completed');
  const saved=store.load(result.resultId);assert.equal(saved.parentId,id);assert.equal(saved.decisionProof.inputDigest,decisionFingerprint(saved));
  assert.deepEqual(store.load(id),original);assert.equal(saved.decisionSession,undefined);
  assert.equal(db.prepare('SELECT pinned FROM snapshots WHERE id=?').get(id).pinned,1);
  assert.equal(db.prepare('SELECT pinned FROM snapshots WHERE id=?').get(result.resultId).pinned,1);
  assert.equal(jobs.getResearchRun(created.run.id).resultId,result.resultId);
});

test('progress replay uses monotonic cursors and a verifiable event hash chain',async()=>{
  const created=submit(source());await jobs.executeNextResearchRun();
  const page=jobs.researchEvents(created.run.id);let previous=null;
  for(const [index,row] of page.events.entries()){
    assert.equal(row.sequence,index+1);assert.equal(row.previousHash,previous);
    const {hash,...payload}=row;
    const canonical=JSON.stringify(payload,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
    assert.equal(hash,'sha256:'+createHash('sha256').update(canonical).digest('hex'));previous=hash;
  }
  assert.equal(previous,page.run.eventHash);assert.equal(page.run.workerOwner,undefined);
  assert.deepEqual(jobs.researchEvents(created.run.id,2).events,page.events.slice(2));
  assert.equal(jobs.researchEvents(created.run.id,page.nextCursor).events.length,0);
  assert.throws(()=>jobs.researchEvents(created.run.id,-1),/cursor/);
});

test('festival jobs record actual workflow receipts and produce a proof-bearing result',async()=>{
  const created=submit(source(),'festival');
  const result=await jobs.executeNextResearchRun({makeRun:options=>new Run({...options,cacheStore:new Map()})});
  assert.equal(result.status,'completed');const saved=store.load(result.resultId);
  assert.ok(saved.gm.trace.length);assert.ok(saved.decisionProof);
  const events=jobs.researchEvents(created.run.id).events;
  assert.ok(events.some(e=>e.type==='workflow_started'));assert.ok(events.some(e=>e.type==='receipt'));
  assert.ok(events.some(e=>e.type==='gm_stage'));assert.equal(saved.mock,true);
});

test('cancel during a workflow retains its receipt, prevents subsequent calls and cannot save a result',async()=>{
  const created=submit(source(),'festival');let release,started,calls=0;
  const first=new Promise(resolve=>started=resolve),wait=new Promise(resolve=>release=resolve);
  const execution=jobs.executeNextResearchRun({makeRun:options=>new Run({...options,cacheStore:new Map(),execute:async(...args)=>{calls++;started();await wait;return mockCall(...args);}})});
  await first;
  assert.equal(await jobs.executeNextResearchRun(),null,'a second worker cannot claim active work');
  const active=jobs.getResearchRun(created.run.id);
  assert.throws(()=>jobs.cancelResearchRun(active.id,active.revision-1),/state changed/);
  jobs.cancelResearchRun(active.id,active.revision);release();
  const result=await execution;assert.equal(result.status,'canceled');assert.equal(result.resultId,null);assert.equal(calls,1);
  assert.ok(jobs.researchEvents(active.id).events.some(e=>e.type==='receipt'));
});

test('queued cancellation uses no provider and stale worker expiry never restarts calls',async()=>{
  const created=submit(source());const canceled=jobs.cancelResearchRun(created.run.id,0);
  assert.equal(canceled.status,'canceled');assert.equal(await jobs.executeNextResearchRun(),null);
  const second=submit(source(),'proof','test-request-key-2').run;
  db.prepare('UPDATE research_runs SET body=? WHERE id=?').run(JSON.stringify({...second,status:'running',workerOwner:'dead-worker',leaseUntil:1}),second.id);
  assert.deepEqual(jobs.interruptExpiredRuns(2),[second.id]);
  assert.equal(jobs.getResearchRun(second.id).status,'interrupted');assert.equal(await jobs.executeNextResearchRun(),null);
});

test('source changes and execution failures cannot fabricate completion or expose raw errors',async()=>{
  const id=source(),created=submit(id);const changed=store.load(id);changed.memo.items[0].terms.fee=99;
  db.prepare('UPDATE snapshots SET body=? WHERE id=?').run(JSON.stringify(changed),id);
  assert.equal((await jobs.executeNextResearchRun()).status,'failed');assert.equal(jobs.getResearchRun(created.run.id).resultId,null);
  const failed=submit(source(),'festival','test-request-key-2');
  const result=await jobs.executeNextResearchRun({makeRun:()=>{throw new Error('provider-secret-never-export');}});
  assert.equal(result.status,'failed');assert.ok(!JSON.stringify(jobs.researchEvents(failed.run.id)).includes('provider-secret'));
});

test('queue is bounded and preflight rejects unsupported kinds and mode mismatches',()=>{
  const id=source();assert.throws(()=>submit(id,'invented'),/Choose festival/);
  for(let i=0;i<4;i++)submit(id,'proof',`test-request-queue-${i}`);
  assert.throws(()=>submit(id,'proof','test-request-queue-full'),/queue is full/);
  const saved=store.load(id);saved.mock=false;db.prepare('UPDATE snapshots SET body=? WHERE id=?').run(JSON.stringify(saved),id);
  assert.throws(()=>submit(id,'festival','test-request-wrong-mode'),/same live or synthetic/);
});

test('HTTP endpoints protect history and writes, replay idempotently and return terminal result links',async()=>{
  const input={sourceId:source(),kind:'proof'};
  assert.equal((await post('/api/research-runs',input,undefined,false)).status,401);
  assert.equal((await fetch(base+'/api/research-runs')).status,401);
  const response=await post('/api/research-runs',input);assert.equal(response.status,202);
  const {run}=await response.json();assert.equal((await post('/api/research-runs',input)).status,200);
  assert.equal((await fetch(base+`/api/research-runs/${run.id}/events`)).status,401);
  await jobs.executeNextResearchRun();
  const result=await (await fetch(base+`/api/research-runs/${run.id}/events?after=0`,{headers:{authorization:'Bearer '+process.env.ORGANIZER_TOKEN}})).json();
  assert.equal(result.run.status,'completed');assert.ok(result.run.resultId);assert.equal(result.events.at(-1).type,'completed');
});
