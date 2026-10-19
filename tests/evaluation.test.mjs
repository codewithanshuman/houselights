import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluationPlan,evaluationSummary,rankOfferedEvaluationPool} from '../server/evaluation.mjs';
import {optimizeSlate} from '../server/optimizer.mjs';
const source=(id,city,prefix='x')=>{
 const items=[1,2,3].map(n=>({id:prefix+n,name:prefix+n,fit:1/n,evidence:{rank:true},terms:{fee:n*10,available:true,genre:'declared'}})),constraints={budget:60,slots:2};
 return {id,memo:{input:{city},currency:'GBP',exampleBookingTerms:true,items,constraints,slate:optimizeSlate(items,constraints)}};
};
test('evaluation measures distinct candidate pools and overlap without treating renamed cities as new pools',()=>{
 const sources=[source('source11','London'),source('source22','Berlin'),source('source33','Mumbai','y')];
 const p=evaluationPlan(sources,2);assert.equal(p.coverage.cities,3);assert.equal(p.coverage.distinctPools,2);
 assert.deepEqual(p.coverage.poolOverlaps.map(r=>r.jaccard),[1,0,0]);assert.equal(p.coverage.illustrativeBriefs,3);
 assert.throws(()=>evaluationPlan([sources[0],{...sources[0],id:'different'}],2),/Duplicate/);
});
test('evaluation retains failed, unstarted and incomplete cases and never promotes a later trial for review',()=>{
 const plan=evaluationPlan([source('source11','London'),source('source22','Berlin')],2);
 const result=evaluationSummary(plan,[{sourceId:'source11',status:'complete',trials:[{status:'unavailable'},{status:'compared',benchmark:{control:{selectedIds:['x1','x2']},qloo:{selectedIds:['x2','x1']}}}]}]);
 assert.deepEqual(result.totals,{planned:4,attempted:2,providerCalls:0,notComparable:0,feasible:1,failed:1,notAttempted:2,identicalSelections:1});
 assert.equal(result.execution,'partial');assert.equal(result.cases[0].reviewEligible,false);assert.equal(result.independentEvidence,false);
});

test('offered evaluation re-ranks the exact smaller pool and retains the original evidence',async()=>{
 const s=source('source11','London');s.memo.input.anchorIds=['anchor'];s.memo.caveats=[];s.receipts=[{id:'r1'}];
 s.memo.items.forEach((item,index)=>{item.found=index===2;item.receipts=['r1'];item.claims=[{id:item.id+':rank',text:'Old ranking'}];});
 const original=JSON.stringify(s),receipt={id:'v1',status:'ok'};
 const run={receipts:[receipt],call:async(tool,args)=>{assert.equal(tool,'rank');assert.deepEqual(args.options,['x1','x2']);return{receipt,env:{results:[{id:'x2'},{id:'x1'}]}};}};
 const child=await rankOfferedEvaluationPool(s,run);
 assert.equal(JSON.stringify(s),original);assert.deepEqual(child.memo.items.map(i=>i.fit),[0,1]);
 assert.equal(child.memo.quality.resolved,2);assert.deepEqual(child.poolRestriction.excludedIds,['x3']);
 assert.equal(child.memo.items[0].claims[0].text,'Ranks 2 of 2 in this fixed offered pool [v1].');
 assert.deepEqual(child.memo.items[0].evidenceReceipts.rank,['v1']);assert.equal(child.receipts.length,2);
 run.call=async()=>({receipt,env:{results:[{id:'x1'}]}});
 const partial=await rankOfferedEvaluationPool(s,run);
 assert.ok(partial.memo.items.every(i=>i.fit===null&&i.evidence.rank===false));
});
