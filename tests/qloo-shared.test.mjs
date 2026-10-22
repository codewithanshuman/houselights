import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'houselights-qloo-shared-'));
process.env.DATA_DIR=dir;
process.env.QLOO_API_KEY='test-only-not-a-real-credential';
process.env.DAILY_QLOO_WORKFLOW_CAP='1';
const {Run}=await import('../server/qloo.mjs');
const {db}=await import('../server/database.mjs');
after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});

test('shared live cache survives memory eviction and daily workflow cap fails closed',async()=>{
  let calls=0;
  const run=new Run({mode:'live',execute:async()=>{calls++;return {status:'ok',results:[{name:'Cache Fixture',entity_id:'cache-fixture'}]};}});
  run.sharedLive=true;
  const args={entity:'Unique shared cache fixture',type:'artist'};
  const first=await run.call('describe',args,'Test shared cache');
  assert.equal(first.env.status,'ok');assert.equal(calls,1);
  run.cache.clear();
  const second=await run.call('describe',args,'Reuse durable cache');
  assert.equal(second.receipt.cached,true);assert.equal(second.receipt.attempts,0);assert.equal(calls,1);
  const blocked=await run.call('describe',{entity:'Another uncached fixture',type:'artist'},'Respect daily cap');
  assert.equal(blocked.env.error.code,'SHARED_CAP');assert.equal(calls,1);
});
