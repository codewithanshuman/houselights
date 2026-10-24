import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyProjection} from '../scripts/verify-recorded-source.mjs';
const bytes=Buffer.from(JSON.stringify({private:'DO-NOT-EXPORT',value:1}));
const digest=createHash('sha256').update(bytes).digest('hex');
const project=source=>({receipts:[],value:source.value});
test('retained-source audit rejects byte changes before projection and emits no private content',()=>{
  let calls=0;
  assert.throws(()=>verifyProjection(Buffer.concat([bytes,Buffer.from(' ')]),digest,()=>{calls++;},{},'Fixture'),/digest mismatch/);
  assert.equal(calls,0);
  const result=verifyProjection(bytes,digest,project,{receipts:[],value:1},'Fixture');
  assert.equal(result.passed,true);assert.equal(result.providerCalls,0);
  assert.ok(!JSON.stringify(result).includes('DO-NOT-EXPORT'));
});
test('retained-source audit rejects a changed public projection',()=>{
  assert.throws(()=>verifyProjection(bytes,digest,project,{receipts:[],value:2},'Fixture'),/projection mismatch/);
});
