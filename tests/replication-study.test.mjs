import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {digest,exportReplication} from '../server/replication-study.mjs';
import {benchmarkBrief} from '../server/gm.mjs';
import {evaluateSelection} from '../server/optimizer.mjs';
const protocol=JSON.parse(readFileSync(new URL('../evals/recorded-control-protocol.json',import.meta.url)));
const snapshot=JSON.parse(readFileSync(new URL('../deploy/judge-cases.json',import.meta.url))).cases.find(row=>row.title==='New York: watch a recorded Qloo research run').snapshot;
function fixture(){
  // Fabricated provenance is restricted to these unit-test fixtures.
  const generation={provider:protocol.provider,model:protocol.model,mode:'live',status:'ok',httpStatus:200,toolsAllowed:false,
    startedAt:protocol.declaredAt,promptDigest:'sha256:'+'1'.repeat(64),requestDigest:'sha256:'+'2'.repeat(64),responseDigest:'sha256:'+'3'.repeat(64),requestId:'PRIVATE-REQUEST-ID',raw:'PRIVATE-RAW'};
  const benchmark={status:'compared',briefDigest:digest(benchmarkBrief(snapshot,snapshot.memo.slate.constraints)),
    control:{selectedIds:snapshot.memo.slate.selectedIds,reason:'PRIVATE-REASON'},generation};
  return {protocolDigest:digest(protocol),trials:[{index:1,benchmark}]};
}
test('replication export freezes inputs, retains first-trial rule and excludes private prose and identifiers',()=>{
  const journal=fixture(),out=exportReplication(protocol,snapshot,journal);
  assert.equal(out.attemptedTrials,1);assert.equal(out.unattemptedTrials,2);
  assert.equal(out.reviewTrial,1);assert.equal(out.trials[0].comparisonEligible,true);
  assert.equal(out.independentOutcomeEvidence,false);assert.equal(out.additionalQlooCalls,0);
  assert.ok(!JSON.stringify(out).includes('PRIVATE-'));
  for(const modify of [j=>j.protocolDigest='changed',j=>j.trials[0].index=2,j=>j.trials[0].benchmark.briefDigest='changed',
    j=>j.trials[0].benchmark.generation.toolsAllowed=true,j=>j.trials[0].benchmark.generation.startedAt='2000-01-01T00:00:00Z']){
    const altered=structuredClone(journal);modify(altered);assert.throws(()=>exportReplication(protocol,snapshot,altered));
  }
});
test('failed, invalid and interrupted trials remain missing rather than repaired',()=>{
  const journal=fixture();journal.trials[0].benchmark.status='unavailable';journal.trials[0].benchmark.control=null;
  journal.trials[0].benchmark.generation.status='provider_error';journal.trials[0].benchmark.generation.httpStatus=429;
  journal.trials.push({index:2});
  const out=exportReplication(protocol,snapshot,journal);
  assert.equal(out.trials[0].status,'unavailable');assert.equal(out.trials[0].available,false);
  assert.equal(out.trials[1].status,'interrupted_unknown');assert.equal(out.unattemptedTrials,1);
});
test('repeats cannot change their model request, and observed public selections satisfy the frozen brief',()=>{
  const journal=fixture();journal.trials.push(structuredClone(journal.trials[0]));journal.trials[1].index=2;
  journal.trials[1].benchmark.generation.requestDigest='sha256:'+'9'.repeat(64);
  assert.throws(()=>exportReplication(protocol,snapshot,journal),/request changed/);
  const observed=JSON.parse(readFileSync(new URL('../public/recorded-control-study.json',import.meta.url)));
  assert.equal(observed.protocolDigest,digest(protocol));assert.equal(observed.publicSnapshotDigest,digest(snapshot));
  assert.equal(observed.trials.length,3);
  for(const trial of observed.trials){
    const evaluated=evaluateSelection(snapshot.memo.items,snapshot.memo.constraints,trial.selectedIds);
    assert.equal(evaluated.feasible,trial.feasible);assert.equal(evaluated.totalFee,trial.plannedFees);
    assert.equal(trial.generation.toolsAllowed,false);assert.equal(trial.generation.httpStatus,200);
  }
  assert.equal(observed.independentOutcomeEvidence,false);
});
