import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'benchmark-jobs-'));
process.env.DATA_DIR=directory;process.env.QLOO_MODE='mock';process.env.LLM_PROVIDER='groq';process.env.GROQ_API_KEY='test-only';process.env.LLM_MODEL='fixture';delete process.env.LLM_MODE;
const jobs=await import('../server/research-runs.mjs');
const {loadBenchmarkBatch}=await import('../server/benchmark-batches.mjs');
const store=await import('../server/store.mjs');
const {db}=await import('../server/database.mjs');
const {optimizeSlate}=await import('../server/optimizer.mjs');
beforeEach(()=>db.exec('DELETE FROM research_events; DELETE FROM research_runs; DELETE FROM benchmark_batches; DELETE FROM quotas;'));
after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
function source(){
  const items=['a','b','c'].map((id,index)=>({id,name:id,fit:1-index*.3,evidence:{rank:true},terms:{fee:30,available:true,genre:id}}));
  const constraints={budget:70,slots:2};
  return store.save({mock:true,memo:{items,constraints,currency:'GBP',input:{city:'Fixture'},slate:optimizeSlate(items,constraints)},receipts:[]});
}
const submit=(sourceId,key='benchmark-job-key',trials=3)=>jobs.createResearchRun({sourceId,kind:'benchmark',options:{trials}},key);
const proposal={selectedIds:['a','b'],reason:'Test fixture; not independent evidence.'};
test('enqueue is idempotent, binds exact input, and retains the first trial rather than the best one',async()=>{
  const id=source(),request=submit(id);assert.equal(loadBenchmarkBatch(request.run.id).status,'queued');
  assert.equal(submit(id).run.id,request.run.id);assert.throws(()=>submit(id,'benchmark-job-key',2),/different input/);
  let calls=0;
  const result=await jobs.executeNextResearchRun({propose:async()=>{calls++;return calls===1?{...proposal,selectedIds:['invented']}:proposal;}});
  const batch=loadBenchmarkBatch(result.id);
  assert.equal(result.status,'completed');assert.equal(calls,3);assert.equal(batch.summary.invalid,1);assert.equal(batch.summary.feasible,2);assert.equal(batch.reviewSourceId,null);
  assert.equal(batch.trials.length,3);assert.equal(submit(id).reused,true);assert.equal(await jobs.executeNextResearchRun(),null);
  for(const row of batch.trials)assert.equal(store.load(row.snapshotId).benchmarkTrial.index,row.index);
  assert.equal(jobs.researchEvents(result.id).events.filter(e=>e.type==='benchmark_trial_completed').length,3);
});
test('queued cancellation starts no trial and leaves an inspectable batch',async()=>{
  const {run}=submit(source());jobs.cancelResearchRun(run.id,run.revision);
  assert.equal(await jobs.executeNextResearchRun(),null);
  const batch=loadBenchmarkBatch(run.id);assert.equal(batch.status,'canceled');assert.equal(batch.summary.notAttempted,3);assert.equal(batch.summary.unknown,0);
});
test('cancellation during a provider call preserves its returned attempt and never starts another',async()=>{
  const {run}=submit(source());let calls=0;
  const result=await jobs.executeNextResearchRun({propose:async()=>{
    calls++;const running=jobs.getResearchRun(run.id);jobs.cancelResearchRun(run.id,running.revision);return proposal;
  }});
  const batch=loadBenchmarkBatch(run.id);assert.equal(result.status,'canceled');assert.equal(calls,1);
  assert.equal(batch.status,'canceled');assert.equal(batch.trials.length,1);assert.equal(batch.summary.notAttempted,2);assert.equal(batch.summary.unknown,0);
  assert.equal(batch.reviewSourceId,batch.trials[0].snapshotId);
});
test('expired in-flight lease records uncertainty and cannot be replayed or overwritten by the former worker',async()=>{
  const id=source(),{run}=submit(id);let calls=0;
  await jobs.executeNextResearchRun({propose:async()=>{
    calls++;const running=jobs.getResearchRun(run.id);running.leaseUntil=0;
    db.prepare('UPDATE research_runs SET body=? WHERE id=?').run(JSON.stringify(running),run.id);
    assert.deepEqual(jobs.interruptExpiredRuns(),[run.id]);return proposal;
  }});
  const batch=loadBenchmarkBatch(run.id);assert.equal(batch.status,'interrupted');assert.equal(batch.summary.unknown,1);assert.equal(batch.summary.notAttempted,2);assert.equal(batch.trials.length,0);
  assert.equal(submit(id).run.status,'interrupted');assert.equal(await jobs.executeNextResearchRun(),null);assert.equal(calls,1);
});
test('source changes fail before calling a model; generic research endpoint shares benchmark limits',async()=>{
  const id=source(),{run}=submit(id),changed=store.load(id);changed.memo.constraints.budget=100;
  db.prepare('UPDATE snapshots SET body=? WHERE id=?').run(JSON.stringify(changed),id);
  await jobs.executeNextResearchRun({propose:async()=>assert.fail('changed inputs must not run')});
  assert.equal(loadBenchmarkBatch(run.id).status,'failed');
  submit(source(),'second-benchmark-key');assert.throws(()=>submit(source(),'third-benchmark-key'),/quota/);
});
