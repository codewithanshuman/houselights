import test from 'node:test';
import assert from 'node:assert/strict';
import { investigationFacts, selectInvestigationFacts } from '../server/investigation-facts.mjs';
import { investigateDecision } from '../server/investigator.mjs';
import { optimizeSlate } from '../server/optimizer.mjs';
const source = () => {
  const items=['a','b','c'].map((id,i)=>({id,name:id,fit:1-i*.2,evidence:{rank:true},evidenceReceipts:{rank:['r1']},receipts:['r1'],terms:{fee:[40,30,20][i],available:true,genre:id}}));
  const constraints={budget:100,slots:2};
  return {mock:true,memo:{items,constraints,currency:'GBP',input:{city:'London'},slate:optimizeSlate(items,constraints)},receipts:[{id:'r1',tool:'rank',status:'ok',source:'synthetic'}]};
};
test('verified facts distinguish the budget from costs and preserve exact money differences',()=>{
  const s=source(),observations=[{id:'o1',tool:'initial_proof',status:'ok',result:{baseline:s.memo.slate}},
    {id:'o2',tool:'test_scenario',status:'ok',result:{...optimizeSlate(s.memo.items,{...s.memo.constraints,budget:50}),constraints:{budget:50}}}];
  const facts=investigationFacts(s,observations);
  assert.match(facts.find(f=>f.id==='o1:budget').text,/GBP 100.00/);
  assert.match(facts.find(f=>f.id==='o1:selection').text,/GBP 70.00/);
  assert.equal(facts.find(f=>f.id==='o2:fee_difference').values.feeDifference,-20);
  assert.throws(()=>selectInvestigationFacts(s,observations,['invented']),/claimIds/);
  assert.throws(()=>selectInvestigationFacts(s,observations,['o1:budget']),/test_scenario/);
  assert.throws(()=>selectInvestigationFacts(s,observations,['o2:selection','o2:selection']),/distinct/);
  assert.equal(selectInvestigationFacts(s,observations,['o2:selection'])[0].kind,'server_verified_fact');
});
test('incomplete ranks and failed tools cannot yield ranking or demand facts',()=>{
  const rows=[{id:'o2',tool:'market_rank',status:'ok',args:{city:'London'},result:{complete:false,returned:1,requested:3,receiptId:'r2',rows:[{id:'a',name:'a',rank:1}]}},
    {id:'o3',tool:'market_rank',status:'unavailable',args:{city:'London'},result:{complete:true,returned:3,requested:3}}];
  const facts=investigationFacts(source(),rows);
  assert.equal(facts.length,1);assert.equal(facts[0].values.complete,false);
  assert.match(facts[0].text,/does not support/);
});
test('native investigator rejects authored prose even with valid citations, then accepts only catalog facts',async()=>{
  let turn=0;
  const result=await investigateDecision(source(),{maxSteps:4,maxQueries:0},{},{propose:async(_system,user,_tokens,options)=>{
    const context=JSON.parse(user),actions=[{tool:'test_scenario',args:{budget:50}},{tool:'inspect_receipt',args:{receiptId:'r1'}},
      {tool:'finish',args:{findings:[{text:'Revenue is guaranteed to double.',observationIds:['o2']}]}},
      {tool:'finish',args:{claimIds:['o1:budget','o1:selection','o2:selection','o2:fee_difference'],preferredScenarioId:'o2'}}];
    assert.deepEqual(options.actionSchema.properties.args.properties.claimIds.items.enum,context.verifiedFacts.map(f=>f.id));
    return {status:'responded',proposal:actions[turn++],receipt:{mode:'injected'}};
  }});
  assert.equal(result.status,'completed');assert.equal(result.observations.at(-1).status,'rejected');
  assert.ok(!JSON.stringify(result.findings).includes('guaranteed'));
  assert.equal(result.verification.claimEntailment,'deterministic_fact_templates');
  assert.ok(result.findings.every(f=>f.kind==='server_verified_fact'&&!f.independentlyVerified));
});
