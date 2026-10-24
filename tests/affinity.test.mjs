import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {withAffinityFit,fitsFromRankRows,nearTieGroups,tieSensitivity,rankComparability,TIE_BAND}=await import('../server/affinity.mjs');
const {optimizeSlate}=await import('../server/optimizer.mjs');
const {runAutopilot}=await import('../server/autopilot.mjs');
const cases=JSON.parse(readFileSync(new URL('../deploy/judge-cases.json',import.meta.url),'utf8')).cases;
const byTitle=title=>cases.find(row=>row.title.startsWith(title)).snapshot;
const names=(snapshot,ids)=>ids.map(id=>snapshot.memo.items.find(item=>item.id===id).name).sort();

test('fit comes from Qloo affinity scores, scaled across the ranked pool, with an ordinal fallback',()=>{
  const ny=byTitle('New York: compare'),{items,basis,receiptId}=withAffinityFit(ny.memo.items,ny.receipts);
  assert.equal(basis,'qloo-affinity');assert.ok(receiptId);
  const scored=items.filter(item=>item.fitBasis==='qloo-affinity');
  assert.equal(scored.length,5);
  assert.equal(Math.max(...scored.map(item=>item.fit)),1);assert.equal(Math.min(...scored.map(item=>item.fit)),0);
  const sault=scored.find(item=>item.name==='Sault'),rakei=scored.find(item=>item.name==='Jordan Rakei');
  assert.ok(Math.abs(sault.affinity-rakei.affinity)<0.0002,'Qloo scores Sault and Rakei almost identically');
  assert.ok(Math.abs(sault.fit-rakei.fit)<0.01,'so their fits are almost identical, unlike ordinal ranks 2 and 3');
  // A missing score anywhere in the ranked pool falls back to ordinal positions.
  const partial=structuredClone(ny);partial.receipts.find(row=>row.id===receiptId).evidence.rows[1].affinity=undefined;
  assert.equal(withAffinityFit(partial.memo.items,partial.receipts).basis,'ordinal-rank');
  const rows=fitsFromRankRows(['a','b','c'],[{id:'a',affinity:.9},{id:'b',affinity:.85},{id:'c',affinity:.8}]);
  assert.equal(rows.basis,'qloo-affinity');assert.ok(Math.abs(rows.fits.get('b')-.5)<1e-9);
  assert.equal(fitsFromRankRows(['a','b'],[{id:'a'},{id:'b',affinity:.8}]).basis,'ordinal-rank');
});

test('near-ties are identified within the declared band and re-checked against the decision',()=>{
  const items=[{id:'a',name:'A',affinity:.95},{id:'b',name:'B',affinity:.9495},{id:'c',name:'C',affinity:.9482},{id:'d',name:'D',affinity:.93}];
  const groups=nearTieGroups(items,TIE_BAND);
  assert.equal(TIE_BAND,0.002);assert.deepEqual(groups.map(group=>group.ids),[['a','b','c']]);
  assert.ok(Math.abs(groups[0].spread-.0018)<1e-9);
  // b beats c by a hair and a fee tie-break cannot apply; treated as tied, the cheaper c wins.
  const pool=[['x',1,50],['b',.6,40],['c',.59,30]].map(([id,fit,fee])=>({id,name:id,fit,affinity:id==='x'?.99:id==='b'?.9501:.95,evidence:{rank:true,local:true,trends:true,comparison:true},momentum:'flat',local:'yes',terms:{fee,available:true,genre:id}}));
  const constraints={budget:100,slots:2};
  assert.deepEqual(optimizeSlate(pool,constraints).selectedIds.sort(),['b','x']);
  const check=tieSensitivity(pool,constraints);
  assert.equal(check.restsOnNearTie,true);assert.deepEqual(check.groups[0].tiedSelectedIds.sort(),['c','x']);
});

test('briefs without a complete Qloo ranking are not comparable; complete ones are',()=>{
  const verdicts=Object.fromEntries(cases.map(row=>[row.title.split(':')[0].replace('Illustrative','').trim()||row.title,rankComparability(row.snapshot.memo.items).comparable]));
  for(const title of ['Mumbai','Paris crossover bill','Sydney psychedelic and indie bill'])
    assert.equal(rankComparability(cases.find(row=>row.title.includes(title)).snapshot.memo.items).comparable,false,title);
  assert.equal(cases.filter(row=>rankComparability(row.snapshot.memo.items).comparable).length,9);
  assert.match(rankComparability(byTitle('Mumbai').memo.items).reason,/Qloo ranked 4 of 5 candidates, so no bookable act has a comparable audience rank/);
  assert.ok(verdicts);
});

test('Autopilot uses affinity, says when ordinal ranks would differ, and labels non-comparable briefs',async()=>{
  const ny=byTitle('New York: compare'),result=await runAutopilot({...ny,memo:{...ny.memo,exampleBookingTerms:true}},{});
  assert.equal(result.fitBasis,'qloo-affinity');
  assert.deepEqual(names(ny,result.packet.recommendation.selectedIds),['Jordan Rakei','Michael Kiwanuka']);
  assert.deepEqual(names(ny,result.ordinalStartIds),['Michael Kiwanuka','Sault']);
  assert.match(result.packet.ordinalComparison.text,/ordinal positions alone.*Michael Kiwanuka \+ Sault/);
  assert.ok(result.packet.ties.groups.some(group=>group.names.includes('Sault')&&group.names.includes('Jordan Rakei')&&group.spread<0.0002));
  assert.match(result.packet.markdown,/Affinity versus ordinal/);assert.match(result.packet.markdown,/Fit basis: Qloo affinity scores/);
  assert.ok(result.packet.recommendation.artists.some(artist=>artist.claims.some(claim=>/^Qloo affinity 0\.9\d{3}/.test(claim.text))));
  const sydney=byTitle('Illustrative: Sydney'),planned=await runAutopilot({...sydney,memo:{...sydney.memo,exampleBookingTerms:true}},{});
  assert.equal(planned.comparability.comparable,false);assert.equal(planned.packet.recommendation.provisional,true);
  assert.match(planned.packet.markdown,/Not comparable: Qloo ranked 5 of 6 candidates/);
});

test('the research agent derives fit from the affinity Qloo returns',async()=>{
  process.env.LLM_MODE='off';
  const {buildMemo}=await import('../server/agent.mjs');
  const {Run}=await import('../server/qloo.mjs');
  const scores={'id-a':.97,'id-b':.9695,'id-c':.91};
  const execute=async(tool,args)=>{
    const ok=results=>({status:'ok',summary:'',results});
    if(tool==='describe')return ok([{name:args.entity,entity_id:`id-${args.entity.toLowerCase()}`}]);
    if(tool==='rank')return ok(args.options.map(id=>({entity_id:id,name:id,query:{affinity:scores[id]}})));
    return ok([]);
  };
  const run=new Run({budget:20,mode:'live',execute,cacheStore:new Map()});
  const memo=await buildMemo({city:'X',anchors:['Z'],offers:['A','B','C'],terms:{A:{fee:10,available:true},B:{fee:10,available:true},C:{fee:10,available:true}},constraints:{budget:100,slots:2}},run);
  const fit=id=>memo.items.find(item=>item.id===id);
  assert.equal(fit('id-a').fitBasis,'qloo-affinity');assert.equal(fit('id-a').fit,1);assert.equal(fit('id-c').fit,0);
  assert.ok(fit('id-b').fit>.99,'B is 0.0005 behind A in Qloo affinity, so its fit is nearly 1 rather than the ordinal 0.5');
});
