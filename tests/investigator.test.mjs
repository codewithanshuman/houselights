import test from 'node:test';
import assert from 'node:assert/strict';
import { investigateDecision, investigatorOptions, investigatorPacing } from '../server/investigator.mjs';
import { optimizeSlate } from '../server/optimizer.mjs';
const source=()=>{
  const items=['a','b','c'].map((id,i)=>({id,name:id,fit:1-i*.3,evidence:{rank:true},evidenceReceipts:{rank:['r1']},receipts:['r1'],terms:{fee:[40,30,20][i],available:true,genre:id}}));
  const constraints={budget:70,slots:2};
  return {mock:true,memo:{items,constraints,currency:'GBP',input:{city:'London'},slate:optimizeSlate(items,constraints)},receipts:[{id:'r1',status:'ok',tool:'rank',source:'synthetic'}]};
};
const adapter=actions=>async()=>({status:'responded',proposal:actions.shift()??{tool:'finish',args:{findings:[{text:'Synthetic test interpretation.',observationIds:['o1']}]}},receipt:{mode:'injected',status:'test_adapter'}});
test('investigator uses observations to choose subsequent tools and preserves source',async()=>{
  const snapshot=source(),before=structuredClone(snapshot);let calls=0,turn=0;
  const run={call:async(tool,args)=>{calls++;assert.equal(tool,'rank');assert.deepEqual(args.options,['a','b','c']);return {receipt:{id:'g1',status:'ok'},env:{results:[{entity_id:'c'},{entity_id:'b'},{entity_id:'a'}]}};}};
  const result=await investigateDecision(snapshot,{maxSteps:4,maxQueries:1},run,{propose:async(_system,user)=>{
    const ctx=JSON.parse(user);turn++;
    const proposal=turn===1?{tool:'market_rank',args:{city:'London'}}:turn===2?{tool:'test_scenario',args:{excludedIds:['a']}}:{tool:'finish',args:{findings:[{text:'Tested alternative survives the exclusion.',observationIds:['o3']}],preferredScenarioId:'o3'}};
    if(turn===2)assert.equal(ctx.observations.at(-1).result.complete,true);
    return {status:'responded',proposal,receipt:{mode:'injected'}};
  }});
  assert.equal(result.status,'completed');assert.equal(calls,1);assert.equal(result.queries,1);
  assert.deepEqual(result.proposedScenario.selectedIds.sort(),['b','c']);assert.equal(result.findings[0].independentlyVerified,false);
  assert.deepEqual(snapshot,before);assert.equal(result.attempts.length,3);
});
test('tool allowlist, query bounds, candidate scope and fake citations fail closed',async()=>{
  let calls=0;const run={call:async()=>{calls++;throw new Error('should not execute');}};
  const result=await investigateDecision(source(),{maxSteps:6,maxQueries:0},run,{propose:adapter([
    {tool:'send_email',args:{recipient:'x'}}, {tool:'test_scenario',args:{excludedIds:['invented']}},
    {tool:'market_rank',args:{city:'London'}},{tool:'finish',args:{findings:[{text:'Fake claim',observationIds:['invented']}]}}
  ])});
  assert.equal(calls,0);assert.equal(result.observations.filter(o=>o.status==='rejected').length,6);
  assert.equal(result.status,'step_limit');assert.equal(result.findings.length,0);
});
test('unavailable model is retained without a fake investigation and cancellation propagates',async()=>{
  const result=await investigateDecision(source(),{maxQueries:0},{},{propose:async()=>({status:'unavailable',proposal:null,receipt:{status:'provider_error',httpStatus:429}})});
  assert.equal(result.status,'model_unavailable');assert.deepEqual(result.findings,[]);assert.equal(result.attempts[0].receipt.httpStatus,429);
  await assert.rejects(()=>investigateDecision(source(),{maxQueries:0},{},{check:()=>{throw Object.assign(new Error('canceled'),{status:499});}}),/canceled/);
  assert.throws(()=>investigatorOptions(source(),{maxQueries:5}),/0–4/);
});
test('original locks cannot be removed by proposed scenarios and unsupported market queries cannot run',async()=>{
  const snapshot=source();snapshot.memo.constraints.lockedIds=['a'];
  const result=await investigateDecision(snapshot,{maxSteps:4,maxQueries:1},{call:()=>assert.fail('no call allowed')},{propose:adapter([
    {tool:'market_rank',args:{city:'Unauthorized market'}},
    {tool:'test_scenario',args:{excludedIds:['a']}},
    {tool:'finish',args:{findings:[{text:'Contradiction found.',observationIds:['o3']}],preferredScenarioId:'o3'}}
  ])});
  assert.equal(result.observations[1].status,'rejected');assert.equal(result.observations[2].result.feasible,false);
  assert.equal(result.observations[3].status,'rejected');assert.equal(result.preferredScenarioId,null);
});
test('provider pacing is bounded and failed attempts survive a retry without invented observations',async()=>{
  assert.equal(investigatorPacing({remainingTokens:1,usage:{prompt_tokens:1000},tokenResetAfter:'7.66s'}),8660);
  assert.equal(investigatorPacing({remainingTokens:1,usage:{prompt_tokens:1000},tokenResetAfter:'2m'}),60000);
  assert.equal(investigatorPacing({remainingTokens:9000,usage:{prompt_tokens:1000},tokenResetAfter:'2m'}),0);
  let attempts=0,waited=0;
  const actions=adapter([{tool:'inspect_receipt',args:{receiptId:'r1'}},{tool:'test_scenario',args:{budget:50}},{tool:'finish',args:{findings:[{text:'A lower budget was checked.',observationIds:['o3']}]}}]);
  const r=await investigateDecision(source(),{maxSteps:4,maxQueries:0},{},{pause:async ms=>{waited+=ms;},propose:async()=>++attempts===1?{status:'unavailable',receipt:{httpStatus:429,retryAfter:'2'}}:actions()});
  assert.equal(r.status,'completed');assert.equal(r.attempts.length,4);assert.equal(waited,2000);assert.equal(r.observations.length,3);
});
test('completion requires a changed scenario and findings that cite the executed test',async()=>{
  const result=await investigateDecision(source(),{maxSteps:7,maxQueries:0},{},{propose:adapter([
    {tool:'finish',args:{findings:[{text:'Premature conclusion.',observationIds:['o1']}]}},
    {tool:'test_scenario',args:{budget:70}},
    {tool:'test_scenario',args:{budget:50}},
    {tool:'inspect_receipt',args:{receiptId:'r1'}},
    {tool:'finish',args:{findings:[{text:'Unconnected conclusion.',observationIds:['o1']}]}},
    {tool:'finish',args:{findings:[{text:'Lower budget tested.',observationIds:['o4']}],preferredScenarioId:'o4'}}
  ])});
  assert.equal(result.status,'completed');assert.equal(result.observations.filter(o=>o.status==='rejected').length,3);
  assert.equal(result.proposedScenario.totalFee,50);assert.equal(result.attempts.length,6);
});
test('native choices remove spent queries and require finish on the final ready step',async()=>{
  let turn=0;
  const result=await investigateDecision(source(),{maxSteps:3,maxQueries:1},{call:async()=>({receipt:{id:'g1',status:'ok'},env:{results:[]}})},{propose:async(_system,user,_tokens,options)=>{
    const ctx=JSON.parse(user),allowed=options.actionSchema.properties.tool.enum;turn++;
    assert.deepEqual(allowed,ctx.availableActions);
    if(turn===1){assert.ok(!allowed.includes('finish'));return adapter([{tool:'market_rank',args:{city:'London'}}])();}
    assert.ok(!allowed.includes('market_rank'));assert.ok(!allowed.includes('artist_context'));
    if(turn===2)return adapter([{tool:'test_scenario',args:{budget:50}}])();
    assert.deepEqual(allowed,['finish']);
    return adapter([{tool:'finish',args:{findings:[{text:'Only saved observations inform this conclusion.',observationIds:['o3']}]}}])();
  }});
  assert.equal(result.status,'completed');assert.equal(result.queries,1);
});
