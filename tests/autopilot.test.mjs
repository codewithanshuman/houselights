import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'houselights-autopilot-'));
process.env.DATA_DIR=dir;process.env.PUBLIC_DEMO='1';process.env.ORGANIZER_TOKEN='autopilot-organizer-token-'.repeat(3);process.env.QLOO_MODE='mock';
const {db}=await import('../server/database.mjs');
const {createApp}=await import('../server/app.mjs');
const {seedPublicCases}=await import('../server/release-seed.mjs');
const {listJudgeCases,loadJudgeCase}=await import('../server/judge.mjs');
const {runAutopilot}=await import('../server/autopilot.mjs');
const {judgeAutopilotSource,publicAutopilotReceipt}=await import('../server/autopilot-api.mjs');
const {replayRecordedAutopilot}=await import('../server/autopilot-replay.mjs');
const {evaluateSelection}=await import('../server/optimizer.mjs');
seedPublicCases(join(import.meta.dirname,'..','deploy','judge-cases.json'));
const server=createApp().listen(0,'127.0.0.1');
// Client and server share this event loop. CPU-heavy offline replays can defer
// both ends' idle timers, letting fetch reuse a socket just as it expires.
// These functional tests do not test idle expiry; keep their local sockets open.
server.keepAliveTimeout=0;
await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`,realFetch=globalThis.fetch;
globalThis.fetch=()=>assert.fail('Autopilot tests must not call any provider.');
after(async()=>{globalThis.fetch=realFetch;await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>db.exec('DELETE FROM quotas;'));
const post=(path,body,auth=false)=>realFetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+process.env.ORGANIZER_TOKEN}:{})},body:JSON.stringify(body)});
const recordedCase='8be4d03ef4792ca9f1466983';

// A scripted research client. Each answer is a receipt-shaped observation the
// test declares; unknown tools fail rather than inventing data.
function scripted(answers){
  const calls=[];let used=0;
  return {calls,research:{used:()=>used,call:async(tool,args)=>{
    used++;const answer=answers(tool,args,calls.length);calls.push({tool,args});
    if(!answer)throw new Error(`Unscripted ${tool} call.`);
    return {receipt:{id:`a${calls.length}`,tool,args,status:answer.status??'ok',source:'synthetic',cached:false,attempts:1,evidence:{kind:tool,rows:[],...answer.evidence}}};
  }}};
}
function nearTie(){
  // b and c tie on fit and b has local evidence. Local evidence for the cheaper c
  // would equalise their scores, so the fee tie-break would choose c.
  const item=(id,fit,fee,extra={})=>({id,name:id.toUpperCase(),found:false,fit,rank:null,of:4,local:'no data',momentum:'unknown',
    evidence:{rank:true,local:false,trends:false,comparison:false,...extra.evidence},evidenceReceipts:{rank:['r1'],local:[],trends:[],comparison:[]},receipts:['r1'],
    terms:{fee,available:true,genre:id},...extra});
  const items=[item('a',1,50),item('b',.5,40,{evidence:{rank:true,local:true,trends:false,comparison:false},local:'yes'}),item('c',.5,39),item('d',0,10)];
  return {receipts:[{id:'r1',tool:'rank',status:'ok',source:'synthetic'}],memo:{currency:'GBP',exampleBookingTerms:true,input:{city:'Fixture City',anchors:['Anchor'],anchorIds:['anchor-1']},items,constraints:{budget:100,slots:2,maxPerGenre:2,discoveryMin:0,riskTolerance:50,lockedIds:[],excludedIds:[]}}};
}

test('public planning replays saved evidence with zero provider calls and explains every question',async()=>{
  const response=await post(`/api/judge/cases/${recordedCase}/autopilot`,{});
  assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.providerCalls,0);assert.equal(body.mode,'planning');assert.equal(body.stop.decision,'planning_only');
  assert.equal(body.receipts.length,0);assert.ok(body.questions.length>=10);
  for(const question of body.questions)assert.ok(question.why.length>20,`question ${question.id} needs a reason`);
  assert.ok(body.questions.some(row=>row.tier==='immaterial'),'some gaps must be judged not worth a call');
  assert.deepEqual(body.packet.recommendation.names,['Michael Kiwanuka','Sault']);
  assert.match(body.packet.markdown,/Planning|No provider calls/i);
  assert.equal((await post(`/api/judge/cases/${recordedCase}/autopilot`,{maxCalls:4})).status,400);
  assert.equal((await post(`/api/judge/cases/${recordedCase}/autopilot`,{fee:1})).status,400);
});

test('a changed public brief is re-planned exactly and flagged as changed',async()=>{
  const body=await (await post(`/api/judge/cases/${recordedCase}/autopilot`,{budget:12150})).json();
  assert.equal(body.briefChanged,true);assert.deepEqual(body.packet.recommendation.names,['Michael Kiwanuka','Jordan Rakei']);
  assert.equal(body.packet.brief.briefChanged,true);
});

test('fresh research is organizer-only, labelled synthetic here, persisted and exportable',async()=>{
  assert.equal((await post(`/api/judge/cases/${recordedCase}/autopilot/live`,{maxCalls:4})).status,401);
  const response=await post(`/api/judge/cases/${recordedCase}/autopilot/live`,{maxCalls:4},true);
  assert.equal(response.status,201);const saved=await response.json();
  assert.equal(saved.mode,'synthetic');assert.equal(saved.providerCalls,0);assert.ok(saved.researchCalls>0&&saved.researchCalls<=4);
  assert.ok(saved.receipts.every(row=>row.source==='synthetic'));assert.match(saved.packet.markdown,/SYNTHETIC QLOO DATA/);
  const again=await (await realFetch(`${base}/api/autopilot/runs/${saved.id}`)).json();assert.equal(again.digest,saved.digest);
  const html=await realFetch(`${base}/api/autopilot/runs/${saved.id}/packet`);
  assert.match(html.headers.get('content-security-policy'),/default-src 'none'/);assert.match(await html.text(),/Next actions<\/h2>/);
  const md=await realFetch(`${base}/api/autopilot/runs/${saved.id}/packet?format=md`);assert.match(md.headers.get('content-disposition'),/attachment/);
  assert.equal((await realFetch(`${base}/api/autopilot/runs/not-a-run`)).status,404);
});

test('the agent researches the decision-material gap first and the observation changes the bill',async()=>{
  const {calls,research}=scripted(tool=>tool==='where_popular'?{evidence:{rows:[{name:'tile'}]}}:tool==='rank'?{evidence:{rows:['a','b','c','d'].map(id=>({id}))}}:{evidence:{comparisonAvailable:true}});
  const result=await runAutopilot(nearTie(),{maxCalls:4},{research,mode:'synthetic'});
  const first=result.events.find(row=>row.type==='action');
  assert.equal(first.tier,'material');assert.equal(first.questionId,'local:c');assert.equal(calls[0].tool,'where_popular');
  assert.deepEqual(calls[0].args,{entity:'c',entity_type:'artist',within:'Fixture City',limit:10});
  assert.deepEqual(result.history[0].selectedIds.sort(),['a','b']);
  assert.deepEqual(result.packet.recommendation.selectedIds.sort(),['a','c']);
  assert.equal(result.packet.research.decisionChanged,true);
  // On a knife-edge tie each new observation is re-evaluated; the first change is caused by the local receipt.
  assert.deepEqual(result.history[1].cause,{questionId:'local:c',receiptId:'a1'});
  assert.ok(result.history.slice(1).every(row=>row.cause&&result.receipts.some(receipt=>receipt.id===row.cause.receiptId)));
  assert.match(result.packet.research.verdict,/Research changed the decision/);
});

test('when research cannot change the bill the agent says why and still justifies booked acts',async()=>{
  const {research}=scripted(tool=>tool==='where_popular'?{evidence:{rows:[]}}:tool==='rank'?{evidence:{rows:['a','b','c','d'].map(id=>({id}))}}:tool==='trends'?{evidence:{rows:[]}}:{evidence:{comparisonAvailable:true}});
  const source=nearTie();source.memo.items[2].fit=.1;// c is no longer close to the tie.
  // e can never be booked alongside anyone, so its evidence cannot matter.
  source.memo.items.push({...structuredClone(source.memo.items[3]),id:'e',name:'E',fit:.2,terms:{fee:95,available:true,genre:'e'}});
  const result=await runAutopilot(source,{maxCalls:8},{research,mode:'synthetic'});
  assert.equal(result.packet.research.decisionChanged,false);
  assert.ok(result.events.filter(row=>row.type==='action').every(row=>row.tier!=='immaterial'));
  assert.match(result.packet.research.verdict,/did not change because the winning margin is/);
  assert.ok(result.questions.some(row=>row.tier==='immaterial'&&/could not change the recommended, alternative or fallback bills/.test(row.why)));
});

test('provider failures stop the agent without fabricating evidence or changing the plan',async()=>{
  const {research,calls}=scripted(()=>({status:'error',evidence:{error:'TRANSPORT'}}));
  const source=nearTie(),planning=await runAutopilot(source,{});
  const result=await runAutopilot(source,{maxCalls:10},{research,mode:'live'});
  assert.equal(result.stop.decision,'provider_unavailable');assert.equal(calls.length,2);assert.equal(result.status,'partial');
  assert.match(result.packet.research.verdict,/Partial run/);
  assert.deepEqual(result.items.map(item=>item.evidence),planning.items.map(item=>item.evidence));
  assert.deepEqual(result.packet.recommendation.selectedIds,planning.packet.recommendation.selectedIds);
  assert.ok(result.packet.evidenceGaps.some(row=>row.status.startsWith('researched: unavailable')));
});

test('budget exhaustion, missing identities, unbookable artists and infeasible briefs are explicit',async()=>{
  const {research}=scripted(tool=>({evidence:tool==='where_popular'?{rows:[{name:'x'}]}:{comparisonAvailable:true,rows:[]}}));
  const limited=await runAutopilot(nearTie(),{maxCalls:1},{research,mode:'synthetic'});
  assert.equal(limited.stop.decision,'budget_exhausted');assert.equal(limited.budget.used,1);
  const anonymous=nearTie();anonymous.memo.input.anchorIds=[];anonymous.memo.items[3].terms={fee:null,available:false,genre:''};
  const planned=await runAutopilot(anonymous,{});
  assert.ok(planned.questions.filter(row=>row.kind==='comparison').every(row=>row.tier==='blocked'));
  assert.ok(planned.questions.some(row=>row.itemId==='d'&&row.tier==='blocked'&&/request a quote/.test(row.why)));
  const infeasible=nearTie();infeasible.memo.constraints.budget=5;
  const {research:never,calls}=scripted(()=>null);
  const result=await runAutopilot(infeasible,{maxCalls:6},{research:never,mode:'synthetic'});
  assert.equal(calls.length,0);assert.equal(result.packet.recommendation,null);assert.ok(result.packet.infeasibility.reasons.length);
});

test('every recommended, alternative and fallback bill honours the hard constraints on every published brief',async()=>{
  for(const record of listJudgeCases()){
    const result=await runAutopilot(judgeAutopilotSource(record),{});
    for(const strategy of result.strategies.list)assert.equal(evaluateSelection(result.items,result.constraints,strategy.selectedIds).feasible,true,`${record.title} ${strategy.id}`);
    for(const row of result.stress.cancellations.filter(row=>row.feasible)){
      const constraints={...result.constraints,excludedIds:[...result.constraints.excludedIds,row.canceledId]};
      assert.equal(evaluateSelection(result.items,constraints,row.selectedIds).feasible,true,`${record.title} cancel ${row.canceledId}`);
    }
  }
});

test('the recorded provider-backed run replays exactly offline and a tampered receipt is detected',async()=>{
  const file=JSON.parse(readFileSync(join(import.meta.dirname,'..','public','autopilot-recorded.json'),'utf8'));
  assert.equal(file.caseId,recordedCase);assert.ok(file.run.receipts.length>0);
  assert.ok(file.run.receipts.every(row=>row.source==='qloo'&&row.cached===false));
  assert.doesNotMatch(JSON.stringify(file),/api[_-]?key|authorization|bearer/i);
  const report=await replayRecordedAutopilot(file);
  assert.equal(report.passed,true,JSON.stringify(report));assert.equal(report.providerCalls,0);
  const tampered=structuredClone(file);tampered.run.receipts.find(row=>row.tool==='rank').args.options=[...tampered.run.receipts.find(row=>row.tool==='rank').args.options].reverse();
  assert.equal((await replayRecordedAutopilot(tampered)).passed,false);
  const altered=structuredClone(file),local=altered.run.receipts.find(row=>row.tool==='where_popular');local.evidence.rows=[];
  assert.equal((await replayRecordedAutopilot(altered)).passed,false);
  const packet=await realFetch(`${base}/api/autopilot/recorded/packet`);
  assert.equal(packet.status,200);assert.match(await packet.text(),/Recorded provider-backed run captured/);
});

test('public receipt projection keeps policy inputs and drops coordinates and unknown fields',()=>{
  const projected=publicAutopilotReceipt({id:'a1',tool:'where_popular',args:{entity:'x',within:'NYC',secret:'s'},status:'ok',source:'qloo',evidence:{kind:'where_popular',rows:[{name:'tile',lat:1,lon:2,tags:['t']}],total:1},raw:'payload'});
  assert.deepEqual(projected.args,{entity:'x',within:'NYC'});assert.deepEqual(projected.evidence.rows,[{name:'tile'}]);
  assert.equal(projected.raw,undefined);
});

test('the seeded recorded case exists for the Booking Desk',()=>{assert.ok(loadJudgeCase(recordedCase));});
