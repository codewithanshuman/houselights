import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'houselights-demand-'));
process.env.QLOO_MODE='mock';
process.env.LLM_MODE='off';
const {normalizeDemandInput,planDemand}=await import('../server/demand.mjs');
const {trainDemandModel,predictDemand,demandFeatures}=await import('../server/demand-model.mjs');
const {createApp}=await import('../server/app.mjs');
const {db}=await import('../server/database.mjs');
const {importReportedOutcomes,reportedOutcomeStatus}=await import('../server/reported-outcomes.mjs');
const server=createApp().listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(process.env.DATA_DIR,{recursive:true,force:true});});
const candidate=(id,fee,genre='electronic')=>({id,name:id,fee,available:true,genre});
const raw={brief:{city:'London',eventDate:'2027-12-12',capacity:5000,ticketPrice:45,currency:'GBP',genre:'Electronic / Indie',competitionCount:2},
  candidates:[candidate('a',10000),candidate('b',8000,'indie'),candidate('c',6000,'indie')],
  constraints:{budget:20000,slots:2,maxPerGenre:1},assumptions:{baseSellThrough:.6,priceElasticity:-1.1,fixedCosts:2000,variableCostPerAttendee:3}};

test('uncalibrated demand plan uses exact booking constraints and labels assumption arithmetic',()=>{
  const input=normalizeDemandInput(raw),model=trainDemandModel([]),result=planDemand(input,model);
  assert.equal(result.status,'feasible');
  assert.equal(result.mode,'cultural_scenario_proxy');
  assert.equal(result.selected.forecast,null);
  assert.equal(result.selected.scenario.status,'buyer_assumption');
  assert.equal(result.selected.economics.grossRevenue.point,135000);
  assert.ok(result.selected.selectedIds.length===2);
  assert.equal(result.selected.cultural.observedOverlapPairs,0);
  assert.match(result.caveats[0],/not ticket demand estimates/);
  assert.ok(result.priceScenarios[0].assumedAttendance>result.priceScenarios.at(-1).assumedAttendance);
  assert.ok(result.alternatives.every(row=>row.selectedIds.length===2));
  const noAssumptions=planDemand(normalizeDemandInput({...raw,assumptions:{}}),model);
  assert.equal(noAssumptions.selected.scenario,null);
  assert.equal(noAssumptions.selected.economics,null);
});

test('Qloo evidence is accepted only through a matching saved receipt and not as buyer overlap',()=>{
  const source={id:'source1',mock:false,createdAt:'2026-10-01T00:00:00Z',memo:{input:{city:'London'},items:[
    {id:'a',name:'a',fit:.8,evidence:{rank:true,local:true},evidenceReceipts:{rank:['r1'],local:['r2']},culturalLinks:[{otherId:'b',available:true,receiptId:'r3',sharedTastes:['electronic']}]},
    {id:'b',name:'b',fit:.5,evidence:{rank:true},evidenceReceipts:{rank:['missing']}}]},
    receipts:[{id:'r1',source:'qloo',status:'ok'},{id:'r2',source:'qloo',status:'ok'},{id:'r3',source:'qloo',status:'ok'}]};
  const input=normalizeDemandInput(raw,source);
  assert.equal(input.candidates[0].qloo.fit,.8);
  assert.equal(input.candidates[1].qloo.fit,null);
  assert.equal(input.candidates[0].qloo.local,true);
  const degraded=structuredClone(source);degraded.receipts[0].status='degraded';
  assert.equal(normalizeDemandInput(raw,degraded).candidates[0].qloo.rank,false);
  const report=planDemand(input,trainDemandModel([]));
  assert.ok(report.selected.cultural.rankCoverage<1);
  assert.match(report.selected.cultural.interpretation,/not unique buyers/);
  assert.throws(()=>normalizeDemandInput({...raw,brief:{...raw.brief,city:'Berlin'}},source),/city must match/);
  assert.throws(()=>normalizeDemandInput({...raw,observedAudienceOverlap:[{a:'a',b:'b',fraction:.5}]},source),/source reference/);
});

test('chronological real-outcome gate, held-out error, Qloo ablation and cold-start widening',()=>{
  const records=Array.from({length:50},(_,index)=>{
    const date=new Date(Date.UTC(2025,0,1+index*3)).toISOString().slice(0,10);
    const capacity=3000+(index%4)*500,price=30+(index%7)*4,qlooMean=.2+(index%9)*.07;
    const paidAttendance=Math.min(capacity,Math.round(capacity*(.32+.32*qlooMean-.002*(price-30))));
    return {id:`real-${index}`,eventDate:date,city:index%2?'London':'Berlin',capacity,paidAttendance,
      features:{city:index%2?'London':'Berlin',qlooProtocol:'fixed-pool-test',logCapacity:Math.log(capacity),logPrice:Math.log(price),competition:index%3,actCount:2,
        qlooMean,qlooCoverage:1,localFraction:index%2},synthetic:false,
      provenance:{realOutcome:true,preEventFeatures:true,qlooPreEvent:true,qlooProtocol:'fixed-pool-test'}};
  });
  assert.equal(trainDemandModel(records.slice(0,39)).status,'insufficient_outcomes');
  assert.equal(trainDemandModel(records.map(row=>({...row,synthetic:true}))).status,'insufficient_outcomes');
  const report=trainDemandModel(records);
  assert.equal(report.status,'backtested');
  assert.equal(report.heldOut,10);
  assert.equal(report.qlooComparison.heldOut,10);
  assert.equal(report.qlooComparison.withoutQloo.count,report.qlooComparison.withQloo.count);
  assert.ok(Number.isFinite(report.qlooComparison.deltaMae));
  const brief={city:'London',qlooProtocol:'fixed-pool-test',capacity:5000,ticketPrice:45,competitionCount:2};
  const features=demandFeatures(brief,[{qloo:{rank:true,fit:.7,local:true}}]);
  const prediction=predictDemand(report,brief,features);
  assert.equal(prediction.model,'qloo_augmented');
  assert.ok(prediction.attendance.low<=prediction.attendance.point);
  assert.ok(prediction.attendance.point<=prediction.attendance.high);
  assert.ok(prediction.explanations.terms.qlooMean!==undefined);
  const changedPool=predictDemand(report,{...brief,qlooProtocol:'another-pool'},demandFeatures({...brief,qlooProtocol:'another-pool'},[{qloo:{rank:true,fit:.7,local:true}}]));
  assert.equal(changedPool.model,'market_baseline');
  const unseen=predictDemand(report,{...brief,city:'Tokyo'},demandFeatures({...brief,city:'Tokyo'},[{qloo:{rank:false,fit:null,local:false}}]));
  assert.equal(unseen.coldStartCity,true);
  assert.equal(unseen.nominalIntervalCoverage,null);
  const repeated=[...records,{...records[0],id:'duplicate-plan',eventKey:'2025-01-01|berlin|capacity:3000'}];
  const keyed=records.map(row=>({...row,eventKey:`${row.eventDate}|${row.city.toLowerCase()}|capacity:${row.capacity}`}));
  assert.equal(trainDemandModel([...keyed,repeated.at(-1)]).duplicatesExcluded,1);
});

test('publisher-reported outcomes are deduplicated and excluded from model training',async()=>{
  const row={sourceKey:'P2024_003',eventDate:'2024-10-20',eventType:'Concert',headliner:'Becky Hill',
    venue:'AO Arena',city:'Manchester',country:'United Kingdom',showCount:1,sellableCapacity:14557,
    paidTicketsSold:14217,sourcePublisher:'Pollstar',sourceUrl:'https://fliphtml5.com/zuaoq/kdka/011325.issue_digital/',
    outcomeType:'single_show_outcome',preEventFeatureCutoff:null,trainingEligible:false,
    trainingExclusion:'No timestamped pre-event features.',
    sourceClassification:'publisher_reported_transcription_not_independently_audited'};
  const report={schemaVersion:1,summary:{zipMismatches:[]},catalog:[row]};
  assert.equal(importReportedOutcomes(report).inserted,1);
  assert.equal(importReportedOutcomes(report).alreadyPresent,1);
  assert.equal(reportedOutcomeStatus().singleShow,1);
  assert.equal(trainDemandModel([]).eligible,0);
  assert.throws(()=>importReportedOutcomes({...report,catalog:[{...row,paidTicketsSold:1}]}),/different values/);
  const api=await(await fetch(origin+'/api/demand/reported-outcomes')).json();
  assert.equal(api.status.trainingEligible,0);
  assert.equal(api.outcomes[0].paidTicketsSold,14217);
});

test('private API saves immutable pre-event plans and refuses premature or unsupported outcomes',async()=>{
  const response=await fetch(origin+'/api/demand/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...raw,save:true})});
  assert.equal(response.status,200);
  const plan=await response.json();
  assert.match(plan.forecastId,/^[a-f0-9]{24}$/);
  assert.equal((await fetch(origin+'/api/demand/forecasts/'+plan.forecastId)).status,200);
  const outcome=await fetch(origin+'/api/demand/outcomes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({forecastId:plan.forecastId,paidAttendance:3000,sourceKind:'box_office_export',sourceReference:'box-office-123'})});
  assert.equal(outcome.status,400);
  assert.match((await outcome.json()).error,/event date must have passed/);
  const status=await(await fetch(origin+'/api/demand/model')).json();
  assert.equal(status.status,'insufficient_outcomes');
  assert.equal(status.outcomeCount,0);
  assert.equal(status.reported.count,1);
});

test('production access gate protects private demand evidence and all writes',async()=>{
  const oldToken=process.env.ORGANIZER_TOKEN,oldDemo=process.env.PUBLIC_DEMO;
  process.env.ORGANIZER_TOKEN='a'.repeat(40);process.env.PUBLIC_DEMO='1';
  try {
    assert.equal((await fetch(origin+'/api/demand/model')).status,401);
    assert.equal((await fetch(origin+'/api/demand/reported-outcomes')).status,401);
    assert.equal((await fetch(origin+'/api/demand/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(raw)})).status,401);
    assert.equal((await fetch(origin+'/api/demand/model',{headers:{authorization:`Bearer ${process.env.ORGANIZER_TOKEN}`}})).status,200);
  } finally {
    if(oldToken===undefined)delete process.env.ORGANIZER_TOKEN;else process.env.ORGANIZER_TOKEN=oldToken;
    if(oldDemo===undefined)delete process.env.PUBLIC_DEMO;else process.env.PUBLIC_DEMO=oldDemo;
  }
});
