import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'houselights-autopilot-v2-'));
process.env.DATA_DIR=dir;process.env.QLOO_MODE='mock';
const {db}=await import('../server/database.mjs');
const {seedPublicCases}=await import('../server/release-seed.mjs');
const {loadJudgeCase}=await import('../server/judge.mjs');
const {runAutopilot}=await import('../server/autopilot.mjs');
const {jointMateriality}=await import('../server/autopilot-research.mjs');
const {computeStrategies,robustnessProfile,scenarioSet,applyScenario}=await import('../server/autopilot-strategy.mjs');
const {buildManifest,verifyEvidenceContent,receiptContentDigest,canonical}=await import('../server/autopilot-integrity.mjs');
const {verifyRecordedAutopilot}=await import('../server/autopilot-replay.mjs');
const {judgeAutopilotSource}=await import('../server/autopilot-api.mjs');
const {PINNED_MANIFESTS}=await import('../server/autopilot-pins.mjs');
const {optimizeSlate,enumerateSlates,evidencePoints,evaluateSelection}=await import('../server/optimizer.mjs');
seedPublicCases(join(import.meta.dirname,'..','deploy','judge-cases.json'));
const realFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('Autopilot 2.0 tests must not call any provider.');
after(()=>{globalThis.fetch=realFetch;db.close();rmSync(dir,{recursive:true,force:true});});
const root=join(import.meta.dirname,'..'),read=path=>JSON.parse(readFileSync(join(root,path),'utf8'));
const NY='8be4d03ef4792ca9f1466983';
const money=value=>`$${value}`;
const same=(a,b)=>[...a].sort().join()===[...b].sort().join();

function client(answer){
  const calls=[];let used=0;
  return {calls,research:{used:()=>used,call:async(tool,args)=>{used++;calls.push({tool,args});const a=answer(tool,args);if(a instanceof Error)throw a;
    return {receipt:{id:`t${used}`,tool,args,status:a?.status??'ok',source:'synthetic',cached:false,attempts:1,evidence:{kind:tool,rows:[],...(a?.evidence??{})}}};}}};
}
const item=(id,fit,fee,evidence={},extra={})=>({id,name:id.toUpperCase(),found:false,fit,rank:null,of:4,local:evidence.local?'yes':'no data',momentum:extra.momentum??'unknown',
  evidence:{rank:true,local:false,trends:false,comparison:false,...evidence},evidenceReceipts:{rank:['s1'],local:[],trends:[],comparison:[]},receipts:['s1'],terms:{fee,available:true,genre:id},...extra});
// c can only overtake b if two of its open gaps both come back favourably:
// b scores 52 evidence points, c 48 (deficit 2 per slot); local alone adds 1.375,
// a rising trend alone 1.875, together 3.25.
function interacting(){
  const items=[item('a',1,50,{local:true,trends:true,comparison:true},{momentum:'flat'}),item('b',.5,40,{local:true,trends:true,comparison:true},{momentum:'flat'}),item('c',.5,40),item('d',0,10,{local:true,trends:true,comparison:true},{momentum:'flat'})];
  return {receipts:[{id:'s1',tool:'rank',status:'ok',source:'synthetic'}],memo:{currency:'USD',exampleBookingTerms:true,input:{city:'Fixture',anchors:['Anchor'],anchorIds:['anchor']},items,constraints:{budget:100,slots:2,maxPerGenre:2,discoveryMin:0,riskTolerance:50,lockedIds:[],excludedIds:[]}}};
}
const favourable=tool=>tool==='where_popular'?{evidence:{rows:[{name:'tile'}]}}:tool==='trends'?{evidence:{rows:[{id:'c',change:1}]}}:tool==='compare_audiences'?{evidence:{comparisonAvailable:true}}:{evidence:{rows:['a','b','c','d'].map(id=>({id}))}};

test('evidencePoints reproduces the optimizer score change for every lineup',()=>{
  const source=judgeAutopilotSource(loadJudgeCase(NY)),items=source.memo.items,constraints=source.memo.constraints;
  const before=enumerateSlates(items,constraints);
  for(const target of items.slice(0,5))for(const [kind,patch] of [['local',{local:'yes'}],['trends',{momentum:'rising'}],['comparison',{}]]){
    if(target.evidence[kind])continue;
    const changed=items.map(row=>row.id===target.id?{...row,...patch,evidence:{...row.evidence,[kind]:true}}:row);
    const delta=(evidencePoints(changed.find(row=>row.id===target.id),constraints)-evidencePoints(target,constraints))/constraints.slots;
    enumerateSlates(changed,constraints).forEach((row,index)=>assert.ok(Math.abs(row.rawScore-before[index].rawScore-(row.selectedIds.includes(target.id)?delta:0))<1e-9,`${target.name} ${kind}`));
  }
});

test('joint materiality finds gaps that only change the bill together, and respects the call budget',()=>{
  const source=interacting(),items=source.memo.items,constraints=source.memo.constraints;
  const gaps=['local','comparison','trends'].map(kind=>({id:`${kind}:c`,kind,itemId:'c'}));
  const wide=jointMateriality(items,constraints,gaps,{callsLeft:4});
  assert.deepEqual(wide.incumbent.selectedIds.sort(),['a','b']);
  for(const id of ['local:c','trends:c']){assert.equal(wide.byGap.get(id).material,true);assert.equal(wide.byGap.get(id).single,false);assert.equal(wide.byGap.get(id).reachable,true);}
  assert.equal(wide.byGap.get('local:c').challengers[0].cost,2);
  // Each gap alone really is insufficient: the 1.0 single-gap test is right about that.
  for(const [kind,patch] of [['local',{local:'yes'}],['trends',{momentum:'rising'}]])assert.deepEqual(optimizeSlate(items.map(row=>row.id==='c'?{...row,...patch,evidence:{...row.evidence,[kind]:true}}:row),constraints).selectedIds.sort(),['a','b']);
  const narrow=jointMateriality(items,constraints,gaps,{callsLeft:1});
  assert.equal(narrow.byGap.get('local:c').material,true);assert.equal(narrow.byGap.get('local:c').reachable,false);
});

test('Autopilot 2.0 researches interacting evidence and reaches the full-information bill; 1.0 calls it immaterial',async()=>{
  const v1plan=await runAutopilot(interacting(),{},{policy:'value-v1'});
  // In the decision phase 1.0 sees no decision-relevant gap on c (it reaches c only later, as a cancellation fallback).
  const decisionPhase=v1plan.events.find(row=>row.type==='questions').questions;
  assert.ok(['local:c','trends:c'].every(id=>decisionPhase.find(row=>row.id===id).tier==='immaterial'));
  const v2plan=await runAutopilot(interacting(),{});
  const local=v2plan.questions.find(row=>row.id==='local:c');
  assert.equal(local.tier,'material');assert.equal(local.joint,true);assert.match(local.why,/Jointly with 1 other open question/);
  const v2=client(favourable),v1=client(favourable);
  const second=await runAutopilot(interacting(),{maxCalls:2},{research:v2.research,mode:'synthetic'});
  const first=await runAutopilot(interacting(),{maxCalls:2},{research:v1.research,mode:'synthetic',policy:'value-v1'});
  assert.deepEqual(second.packet.recommendation.selectedIds.sort(),['a','c']);
  // The first answer is only useful jointly; once it is in, the second gap becomes sufficient on its own.
  const actions=second.events.filter(row=>row.type==='action');
  assert.equal(actions[0].joint,true);assert.deepEqual(actions.slice(0,2).map(row=>row.questionId).sort(),['local:c','trends:c']);
  assert.equal(second.packet.research.decisionChanged,true);
  assert.deepEqual(first.packet.recommendation.selectedIds.sort(),['a','b'],'with 2 calls 1.0 spends one on the cross-check and reaches c only as a fallback, too late to complete the pair');
  assert.equal(v1.calls[0].tool,'rank');
  // With one call the pair cannot be completed, so 2.0 defers rather than spending a call that cannot matter.
  const tight=client(favourable),narrow=await runAutopilot(interacting(),{maxCalls:1},{research:tight.research,mode:'synthetic'});
  assert.ok(tight.calls.every(call=>!(call.tool==='where_popular'&&call.args.entity==='c')));
  const deferred=narrow.events.find(row=>row.type==='questions').questions.find(row=>row.id==='local:c');
  assert.equal(deferred.tier,'deferred');assert.match(deferred.why,/2 call\(s\) needed but 1 remain/);
});

test('robustness is measured on one common scenario set and a robust strategy needs a strict improvement',()=>{
  const ny=judgeAutopilotSource(loadJudgeCase(NY)),context={money,names:ids=>ids.join('+'),crossCheck:null,city:'New York'};
  const plan=computeStrategies(ny.memo.items,ny.memo.constraints,context);
  assert.ok(plan.list.every(row=>row.robustness.total===plan.scenarios.length));
  const robust=plan.list.find(row=>row.labels.includes('Most robust under disruption'));
  const recommended=plan.list[0].robustness;
  if(robust)assert.ok(robust.robustness.continued>recommended.continued||(robust.robustness.continued===recommended.continued&&robust.robustness.held>recommended.held));
  // "Held" means the unchanged bill is still feasible after the shock.
  const scenarios=scenarioSet(ny.memo.items,ny.memo.constraints),ids=plan.list[0].selectedIds,profile=robustnessProfile(ny.memo.items,ny.memo.constraints,ids,scenarios);
  scenarios.forEach((scenario,index)=>{const shocked=applyScenario(ny.memo.items,ny.memo.constraints,scenario);
    assert.equal(profile.outcomes[index].outcome==='held',evaluateSelection(shocked.items,shocked.constraints,ids).feasible,scenario.id);});
  // Identical survival: no bill may be labelled more robust, whatever its coverage.
  const flat={items:['x','y','z'].map((id,i)=>item(id,[1,.5,0][i],10)),constraints:{budget:30,slots:2,maxPerGenre:2,discoveryMin:0,riskTolerance:50,lockedIds:[],excludedIds:[]}};
  const tie=computeStrategies(flat.items,flat.constraints,context);
  assert.deepEqual(tie.list.map(row=>row.id),['cultural-fit']);assert.match(tie.robustNote,/No searched bill is more robust/);
  for(const backup of plan.backups)for(const option of backup.options){assert.ok(!option.selectedIds.includes(backup.artistId));assert.equal(evaluateSelection(ny.memo.items,{...ny.memo.constraints,excludedIds:[backup.artistId]},option.selectedIds).feasible,true);}
});

test('integrity: decision-relevant tampering is detected by the right check and the record states what is unverifiable',async()=>{
  const file=read('public/autopilot-recorded.json'),pin=PINNED_MANIFESTS['public/autopilot-recorded.json'];
  const clean=await verifyRecordedAutopilot(file,{pinnedManifestDigest:pin});
  assert.equal(clean.passed,true,JSON.stringify(clean));assert.equal(clean.providerProvenance.verified,false);assert.match(clean.providerProvenance.statement,/not independently verifiable/);
  const cases={
    affinity:f=>{f.run.receipts.find(row=>row.tool==='rank').evidence.rows[0].affinity+=.01;},
    entity:f=>{f.run.receipts.find(row=>row.tool==='rank').evidence.rows[0].name='Somebody Else';},
    status:f=>{f.run.receipts.find(row=>row.tool==='where_popular').status='error';},
    provenance:f=>{f.run.receipts.find(row=>row.tool==='where_popular').originalDigest='sha256:'+'0'.repeat(64);},
  };
  for(const [name,mutate] of Object.entries(cases)){
    const tampered=structuredClone(file);mutate(tampered);
    const report=await verifyRecordedAutopilot(tampered,{pinnedManifestDigest:pin});
    assert.equal(report.evidenceContent.passed,false,name);assert.ok(report.evidenceContent.problems.some(problem=>/Receipt a[0-9]+ /.test(problem)),name);
    assert.equal(report.decisionReproducibility.passed,false,`${name}: the decision digest covers receipt content`);
  }
  // A forger who rewrites content and recomputes every digest is caught only by the pin.
  const forged=structuredClone(file);forged.run.receipts.find(row=>row.tool==='rank').evidence.rows[0].affinity=0.5;
  forged.run.integrity=buildManifest({receipts:forged.run.receipts,sourceReceipts:loadJudgeCase(NY).snapshot.receipts,decisionDigest:forged.run.digest,items:forged.run.items});
  assert.equal(verifyEvidenceContent(forged.run,{sourceReceipts:loadJudgeCase(NY).snapshot.receipts}).passed,true);
  assert.match(verifyEvidenceContent(forged.run,{sourceReceipts:loadJudgeCase(NY).snapshot.receipts,pinnedManifestDigest:pin}).problems.join(' '),/independently pinned/);
  // Source receipts are mandatory: omitting them is a failure, never a pass.
  const unsupplied=verifyEvidenceContent(file.run,{pinnedManifestDigest:pin});
  assert.equal(unsupplied.passed,false);assert.match(unsupplied.problems.join(' '),/listed in the manifest was not supplied/);
  const oneMissing=verifyEvidenceContent(file.run,{sourceReceipts:loadJudgeCase(NY).snapshot.receipts.slice(1),pinnedManifestDigest:pin});
  assert.equal(oneMissing.passed,false);assert.equal(oneMissing.problems.length,1);
  // The reported count is what was actually verified, not what the manifest lists.
  const expected=file.run.integrity.sourceReceipts.length,full=verifyEvidenceContent(file.run,{sourceReceipts:loadJudgeCase(NY).snapshot.receipts,pinnedManifestDigest:pin});
  assert.equal(full.passed,true);assert.equal(full.sourceReceiptsVerified,expected);assert.equal(full.sourceReceiptsExpected,expected);
  assert.equal(unsupplied.sourceReceiptsVerified,0);assert.equal(unsupplied.sourceReceiptsExpected,expected);
  assert.equal(oneMissing.sourceReceiptsVerified,expected-1);
  const tampered=structuredClone(loadJudgeCase(NY).snapshot.receipts);tampered[0].summary='edited';
  assert.equal(verifyEvidenceContent(file.run,{sourceReceipts:tampered,pinnedManifestDigest:pin}).sourceReceiptsVerified,expected-1);
  assert.equal(verifyEvidenceContent(file.run,{sourceReceipts:loadJudgeCase(NY).snapshot.receipts}).pinChecked,false);
  // Content digests ignore capture timing but nothing else.
  const receipt=file.run.receipts.find(row=>row.tool==='where_popular');assert.equal(receiptContentDigest({...receipt,ms:1}),receiptContentDigest({...receipt,ms:999}));
  assert.notEqual(receiptContentDigest(receipt),receiptContentDigest({...receipt,fetchedAt:'2000-01-01T00:00:00.000Z'}));
  assert.equal(canonical({b:1,a:[2,{d:1,c:2}]}),'{"a":[2,{"c":2,"d":1}],"b":1}');
});

test('the migrated 1.0 record replays under the 1.0 policy and its numbers are now protected',async()=>{
  const file=read('results/autopilot-recorded-v1.json'),pin=PINNED_MANIFESTS['results/autopilot-recorded-v1.json'];
  assert.equal(file.migration.fromVersion,'1.0');assert.match(file.migration.sourceGitBlob,/^[a-f0-9]{40}$/);
  const report=await verifyRecordedAutopilot(file,{pinnedManifestDigest:pin});
  assert.equal(report.passed,true,JSON.stringify(report));assert.equal(report.decisionReproducibility.policy,'value-v1');
  // The 1.0 digest itself did not change when receipt numbers changed; the 2.0 manifest does catch it.
  const tampered=structuredClone(file);tampered.run.receipts[0].evidence.rows[0].affinity=0.01;
  const after=await verifyRecordedAutopilot(tampered,{pinnedManifestDigest:pin});
  assert.equal(after.decisionReproducibility.passed,true,'1.0 replay is blind to receipt numbers');
  assert.equal(after.evidenceContent.passed,false);
});

test('the 2.0 record captured before affinity fits still replays exactly on ordinal ranks',async()=>{
  const file=read('results/autopilot-recorded-v2-ordinal.json');
  assert.equal(file.run.fitBasis,undefined);
  const report=await verifyRecordedAutopilot(file,{pinnedManifestDigest:PINNED_MANIFESTS['results/autopilot-recorded-v2-ordinal.json']});
  assert.equal(report.passed,true,JSON.stringify(report));
  const current=read('public/autopilot-recorded.json');assert.equal(current.run.fitBasis,'qloo-affinity');
  assert.equal(current.run.packet.recommendation.restsOnNearTie,true,'the live record shows the Sault / Jordan Rakei near-tie deciding the bill');
});

test('the affinity record captured under min-max scaling replays exactly under that scale',async()=>{
  const file=read('results/autopilot-recorded-affinity-minmax.json');
  assert.equal(file.run.fitBasis,'qloo-affinity');assert.equal(file.run.fitScale,undefined);
  const report=await verifyRecordedAutopilot(file,{pinnedManifestDigest:PINNED_MANIFESTS['results/autopilot-recorded-affinity-minmax.json']});
  assert.equal(report.passed,true,JSON.stringify(report));
  const current=read('public/autopilot-recorded.json');assert.equal(current.run.fitScale,'fixed-span-0.05');
  assert.equal((await verifyRecordedAutopilot(current,{pinnedManifestDigest:PINNED_MANIFESTS['public/autopilot-recorded.json']})).passed,true);
});

test('provider exceptions and interruptions produce labelled partial runs without invented evidence',async()=>{
  const thrower=client(()=>new Error('socket hang up'));
  const failed=await runAutopilot(interacting(),{maxCalls:6},{research:thrower.research,mode:'live'});
  assert.equal(failed.stop.decision,'provider_unavailable');assert.equal(failed.status,'partial');assert.equal(failed.receipts.length,0);
  assert.equal(failed.failures.length,2);assert.ok(failed.events.some(row=>row.type==='failure'));
  assert.deepEqual(failed.items.map(row=>row.evidence),interacting().memo.items.map(row=>row.evidence));
  let calls=0;const stopper=client(favourable);
  const interrupted=await runAutopilot(interacting(),{maxCalls:6},{research:{...stopper.research,call:(...args)=>{calls++;return stopper.research.call(...args);}},mode:'live',shouldStop:()=>calls>=1});
  assert.equal(interrupted.stop.decision,'interrupted');assert.equal(interrupted.stop.followup,'interrupted');assert.equal(interrupted.status,'partial');assert.equal(calls,1);
  assert.match(interrupted.packet.research.verdict,/Partial run \(interrupted\)/);
});

test('an incomplete Qloo ranking stays provisional and adds an explicit ranked-only strategy',async()=>{
  const source=interacting();
  for(const row of source.memo.items){row.evidence.rank=false;row.fit=null;row.rank=null;row.rankCoverage={complete:false,returned:3,requested:4};}
  const ranker=client(tool=>tool==='rank'?{evidence:{rows:['a','b','d'].map(id=>({id}))}}:favourable(tool));
  const result=await runAutopilot(source,{maxCalls:2},{research:ranker.research,mode:'synthetic'});
  assert.equal(ranker.calls[0].tool,'rank');assert.deepEqual(ranker.calls[0].args.options,['a','b','c','d']);
  assert.equal(result.packet.recommendation.provisional,true);
  const ranked=result.strategies.list.find(row=>row.labels.includes('Best among acts Qloo could rank'));
  assert.ok(ranked);assert.ok(!ranked.selectedIds.includes('c'));
  assert.ok(result.packet.actions.some(row=>row.type==='approval'&&/no rank for this act/.test(row.text)));
});

test('the packet is consistent with the decision state and honest about assumptions',async()=>{
  const source=judgeAutopilotSource(loadJudgeCase(NY));
  source.memo.items[0]={...source.memo.items[0],name:'<script>alert(1)</script>'};
  const brief={name:'Test night',venue:'Room',date:'2027-01-01',objectives:['Sell out'],commercial:{capacity:500,ticketPrice:40,otherCosts:2000}};
  const result=await runAutopilot(source,{},{brief}),p=result.packet,slate=optimizeSlate(result.items,result.constraints);
  assert.deepEqual(p.recommendation.selectedIds,slate.selectedIds);assert.deepEqual(p.strategies[0].selectedIds,slate.selectedIds);
  assert.equal(p.recommendation.totalFee,p.recommendation.artists.reduce((sum,artist)=>sum+artist.fee,0));
  assert.equal(p.recommendation.headroom,result.constraints.budget-p.recommendation.totalFee);
  for(const row of p.financial.breakpoints.filter(row=>row.type==='fee'))assert.equal(row.maximumFee,row.currentFee+p.recommendation.headroom);
  assert.equal(p.financial.commercial.breakEvenTickets,Math.ceil((p.recommendation.totalFee+2000)/40));
  assert.equal(p.actions[0].type,'approval');assert.ok(p.actions.filter(row=>/Request a quote/.test(row.text)).every(row=>/not a quote/.test(row.text)));
  assert.ok(p.terms.every(row=>row.needsConfirmation),'illustrative terms always need confirmation');
  assert.ok(p.evidenceMatrix.every(row=>['rank','local','comparison','trends'].every(kind=>/^(Measured|Missing)/.test(row.cells[kind].label))));
  const {packetHtml}=await import('../server/autopilot-packet.mjs');
  const html=packetHtml(p,money);
  assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
  assert.match(p.markdown,/not a sales forecast/);assert.match(p.markdown,/Requires human approval/);
});
