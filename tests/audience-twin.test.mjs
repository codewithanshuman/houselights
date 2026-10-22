import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'houselights-twin-'));
process.env.QLOO_MODE='mock';
process.env.LLM_MODE='off';
const {Run}=await import('../server/qloo.mjs');
const {researchAudienceTwin,simulateAudienceTwin,compareAudienceTwins,validateTwinSeeds,assertTwinCompatible,loadAudienceTwin}=await import('../server/audience-twin.mjs');
const {normalizeDemandInput,planDemand}=await import('../server/demand.mjs');
const {trainDemandModel}=await import('../server/demand-model.mjs');
const {createApp}=await import('../server/app.mjs');
const {db}=await import('../server/database.mjs');
const {save}=await import('../server/store.mjs');
const server=createApp().listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(process.env.DATA_DIR,{recursive:true,force:true});});

const source={mock:true,memo:{input:{city:'London',anchorIds:['anchor-a','anchor-b']},items:[
  {id:'a',name:'A',fit:.8,evidence:{rank:true},evidenceReceipts:{rank:['r1']},terms:{fee:600,genre:'electronic',available:true}},
  {id:'b',name:'B',fit:.5,evidence:{rank:true},evidenceReceipts:{rank:['r1']},terms:{fee:700,genre:'indie',available:true}},
  {id:'c',name:'C',fit:.2,evidence:{rank:true},evidenceReceipts:{rank:['r1']},terms:{fee:500,genre:'indie',available:true}}]},
  receipts:[{id:'r1',source:'synthetic',status:'ok'}]};
source.id=save(source);
const raw={sourceId:source.id,brief:{city:'London',eventDate:'2027-12-12',capacity:1000,ticketPrice:45,genre:'Electronic / Indie',competitionCount:1},
  candidates:[{id:'a',name:'A',fee:600,available:true,genre:'electronic'},{id:'b',name:'B',fee:700,available:true,genre:'indie'},
    {id:'c',name:'C',fee:500,available:true,genre:'indie'}],
  constraints:{budget:1400,slots:2,maxPerGenre:1},assumptions:{fixedCosts:100,variableCostPerAttendee:2},
  audiencePool:2500,overlapAssumption:.4,segmentSeeds:[
    {label:'A-facing',anchorIds:['anchor-a'],weight:.6,baseIntent:.5,priceElasticity:-.8,competitionLoss:.05},
    {label:'B-facing',anchorIds:['anchor-b'],weight:.4,baseIntent:.4,priceElasticity:-1.4,competitionLoss:.1}]};
const input=normalizeDemandInput(raw,source);
const execute=async(_tool,args)=>({status:'ok',results:(args.signals[0]==='anchor-a'?['a','b','c']:['c','b','a']).map(id=>({entity_id:id,name:id}))});
const run=()=>new Run({mode:'mock',execute,budget:2,cacheStore:new Map()});

test('taste seeds are bounded organizer hypotheses; incomplete Qloo rank refuses a twin',async()=>{
  assert.throws(()=>validateTwinSeeds({...raw,segmentSeeds:raw.segmentSeeds.map(seed=>({...seed,weight:.1}))},source,input),/sum to 1/);
  assert.throws(()=>validateTwinSeeds({...raw,segmentSeeds:[{...raw.segmentSeeds[0],anchorIds:['unverified']},raw.segmentSeeds[1]]},source,input),/saved Qloo source/);
  const bad=new Run({mode:'mock',budget:2,cacheStore:new Map(),execute:async()=>({status:'partial',results:[{entity_id:'a'}]})});
  const result=await researchAudienceTwin(raw,source,input,{run:bad});
  assert.equal(result.status,'insufficient_qloo_evidence');
  assert.equal(result.receipts.length,1);
});

test('fixed-pool Qloo rankings produce clustered synthetic profiles, bounded overlap and price response',async()=>{
  const twin=await researchAudienceTwin(raw,source,input,{run:run()});
  assert.equal(twin.status,'scenario_ready');
  assert.equal(twin.clusterCount,2);
  assert.equal(twin.receipts.length,2);
  assert.ok(twin.receipts.every(receipt=>receipt.source==='synthetic'));
  assert.equal(loadAudienceTwin(twin.id).id,twin.id);
  assert.doesNotThrow(()=>assertTwinCompatible(twin,input));
  assert.throws(()=>assertTwinCompatible(twin,normalizeDemandInput({...raw,candidates:[...raw.candidates].reverse()},source)),/exact artist pool/);
  const original=simulateAudienceTwin(twin,input.brief,['a','b']);
  const cheaper=simulateAudienceTwin(twin,input.brief,['a','b'],{price:36});
  const strongerOverlap=simulateAudienceTwin(twin,input.brief,['a','b'],{overlap:1});
  assert.equal(original.targetMetric,'paid_tickets_sold');
  assert.ok(original.ticketsSold.low<=original.ticketsSold.point&&original.ticketsSold.point<=original.ticketsSold.high);
  assert.ok(cheaper.ticketsSold.point>=original.ticketsSold.point);
  assert.ok(strongerOverlap.ticketsSold.point<=original.ticketsSold.point);
  assert.equal(original.uncertainty.coverageGuarantee,false);
  const migration=compareAudienceTwins(twin,input.brief,['a','b'],['a','c'],2);
  assert.equal(migration.segmentMigration.length,2);
  assert.equal(migration.after.competitionCount,3);
  const plan=planDemand(input,trainDemandModel([]),twin);
  assert.equal(plan.mode,'synthetic_audience_scenario');
  assert.equal(plan.audienceTwin.priceScenarios.length,5);
  assert.ok(plan.selected.fees<=raw.constraints.budget);
  assert.ok(plan.selected.twinScenario.ticketsSold.point<=raw.brief.capacity);
  assert.match(plan.caveats.join(' '),/not a calibrated prediction interval/);
});

test('seed artists inside the lineup pool are excluded symmetrically before Qloo ranking',async()=>{
  const changed={...raw,constraints:{...raw.constraints,maxPerGenre:2},segmentSeeds:[raw.segmentSeeds[0],{...raw.segmentSeeds[1],anchorIds:['a']}]};
  const normalized=normalizeDemandInput(changed,source);
  const seedRun=new Run({mode:'mock',budget:2,cacheStore:new Map(),execute:async(_tool,args)=>({status:'ok',results:args.options.map(id=>({entity_id:id,name:id}))})});
  const twin=await researchAudienceTwin(changed,source,normalized,{run:seedRun});
  assert.equal(twin.status,'scenario_ready');
  assert.deepEqual(twin.excludedSeedArtistIds,['a']);
  assert.ok(twin.receipts.every(receipt=>receipt.args.options.every(id=>id!=='a')));
  assert.throws(()=>simulateAudienceTwin(twin,normalized.brief,['a','b']),/complete rank evidence/);
  const plan=planDemand(normalized,trainDemandModel([]),twin);
  assert.equal(plan.status,'feasible');
  assert.ok(plan.selected.selectedIds.every(id=>id!=='a'));
});

test('private twin and validation APIs are gated and a saved twin can enter exact optimization',async()=>{
  const twin=await researchAudienceTwin(raw,source,input,{run:run()});
  const planResponse=await fetch(origin+'/api/demand/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...raw,twinId:twin.id,save:true})});
  assert.equal(planResponse.status,200);
  const plan=await planResponse.json();
  assert.equal(plan.mode,'synthetic_audience_scenario');
  assert.ok(plan.forecastId);
  const forecast=await(await fetch(origin+'/api/demand/forecasts/'+plan.forecastId)).json();
  assert.equal(forecast.twinSnapshot.twinId,twin.id);
  assert.equal((await(await fetch(origin+'/api/demand/twin-validation')).json()).status,'no_matched_outcomes');
  const created=await fetch(origin+'/api/demand/twins',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(raw)});
  assert.equal(created.status,201);
  const fromApi=await created.json();
  assert.equal(fromApi.status,'scenario_ready');
  const compare=await fetch(origin+`/api/demand/twins/${fromApi.id}/compare`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({...raw,originalIds:['a','b'],changedIds:['a','c'],competitionIncrease:2})});
  assert.equal(compare.status,200);
  assert.equal((await compare.json()).after.competitionCount,3);
  db.prepare('INSERT INTO demand_outcomes(id,body,created_at) VALUES(?,?,?)').run('scenario-test',JSON.stringify({id:'scenario-test',
    synthetic:false,provenance:{realOutcome:true,preEventFeatures:true},
    twinComparison:{status:'scenario_vs_observed_total',syntheticSource:false,absoluteError:20,withinSensitivityRange:true}}),new Date().toISOString());
  db.prepare('INSERT INTO demand_outcomes(id,body,created_at) VALUES(?,?,?)').run('synthetic-test',JSON.stringify({id:'synthetic-test',
    synthetic:true,provenance:{realOutcome:true,preEventFeatures:true},
    twinComparison:{status:'scenario_vs_observed_total',syntheticSource:true,absoluteError:999,withinSensitivityRange:false}}),new Date().toISOString());
  const validation=await(await fetch(origin+'/api/demand/twin-validation')).json();
  assert.equal(validation.count,1);
  assert.equal(validation.excluded,1);
  assert.equal(validation.meanAbsoluteError,20);
  assert.equal(validation.rangeIsCalibrated,false);
  const old=process.env.ORGANIZER_TOKEN;process.env.ORGANIZER_TOKEN='x'.repeat(40);
  try{assert.equal((await fetch(origin+'/api/demand/twins/'+twin.id)).status,401);
    assert.equal((await fetch(origin+'/api/demand/twin-validation')).status,401);}
  finally{if(old===undefined)delete process.env.ORGANIZER_TOKEN;else process.env.ORGANIZER_TOKEN=old;}
});
