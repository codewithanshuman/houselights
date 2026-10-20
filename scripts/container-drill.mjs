import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
if(process.env.QLOO_MODE!=='mock'||process.env.LLM_MODE!=='off'||!process.env.DATA_DIR)throw new Error('Container drill requires an isolated synthetic runtime with LLM disabled and explicit DATA_DIR.');
const store=await import('../server/store.mjs');
const {listJudgeCases}=await import('../server/judge.mjs');
const {createResearchRun,getResearchRun,researchEvents}=await import('../server/research-runs.mjs');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const file=join(process.env.DATA_DIR,'container-drill.json'),mode=process.argv[2];
if(mode==='prepare'){
  const cases=listJudgeCases();assert.equal(cases.length,4);
  const sourceId=store.save({...cases[0].snapshot,containerDrill:true});
  const requestKey=randomUUID(),input={sourceId,kind:'proof',options:{}};
  const submitted=createResearchRun(input,requestKey);
  const until=Date.now()+30000;
  let run=getResearchRun(submitted.run.id);
  while(run.status!=='completed'&&Date.now()<until){
    assert.ok(['queued','running'].includes(run.status),`Unexpected worker status: ${run.status}`);
    await new Promise(resolve=>setTimeout(resolve,250));run=getResearchRun(run.id);
  }
  assert.equal(run.status,'completed');assert.ok(run.resultId);assert.equal(run.expectedCalls,0);
  writeFileSync(file,JSON.stringify({caseDigest:digest(cases),sourceId,sourceDigest:digest(store.load(sourceId)),input,requestKey,
    runId:run.id,resultId:run.resultId,resultDigest:digest(store.load(run.resultId)),eventDigest:digest(researchEvents(run.id).events)}),{flag:'wx'});
  console.log(JSON.stringify({workerCompleted:true,providerCalls:0,checkpointWritten:true}));
}else if(mode==='verify'){
  const before=JSON.parse(readFileSync(file,'utf8'));
  assert.equal(digest(listJudgeCases()),before.caseDigest);
  assert.equal(digest(store.load(before.sourceId)),before.sourceDigest);
  assert.equal(digest(store.load(before.resultId)),before.resultDigest);
  assert.equal(getResearchRun(before.runId).status,'completed');
  assert.equal(digest(researchEvents(before.runId).events),before.eventDigest);
  const retry=createResearchRun(before.input,before.requestKey);
  assert.equal(retry.reused,true);assert.equal(retry.run.id,before.runId);
  console.log(JSON.stringify({restartPersistence:true,idempotentReconnect:true,cases:4,providerCalls:0}));
}else throw new Error('Usage: node scripts/container-drill.mjs prepare|verify');
