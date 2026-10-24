import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
const dir=mkdtempSync(join(tmpdir(),'houselights-events-'));
const token='events-organizer-token-'.repeat(3);
process.env.DATA_DIR=dir;process.env.PUBLIC_DEMO='1';process.env.ORGANIZER_TOKEN=token;process.env.QLOO_MODE='mock';process.env.LLM_MODE='off';
const {db}=await import('../server/database.mjs');
const {createApp}=await import('../server/app.mjs');
const {validateBrief}=await import('../server/events.mjs');
const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`,realFetch=globalThis.fetch;
globalThis.fetch=()=>assert.fail('Event tests must not call any provider.');
after(async()=>{globalThis.fetch=realFetch;await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>db.exec('DELETE FROM quotas; DELETE FROM organizer_events;'));
const call=async(method,path,body,{auth=true,origin=base}={})=>{const response=await realFetch(origin+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(auth?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  const text=await response.text();let json;try{json=JSON.parse(text);}catch{json=text;}return {status:response.status,body:json,headers:response.headers};};
const brief=()=>({name:'Riverside Soul Sessions',city:'Chicago',venue:'Example hall',date:'2027-03-12',direction:'Soul and jazz',audience:'Soul fans',objectives:['Fill the room'],anchors:['Leon Bridges'],currency:'USD',
  constraints:{budget:20000,slots:2},candidates:[{name:'Michael Kiwanuka',fee:9000,feeStatus:'estimate',availability:'assumed',genre:'soul'},{name:'Thundercat',fee:8500,feeStatus:'quoted',availability:'confirmed',genre:'jazz'},
  {name:'Durand Jones & The Indications',fee:6000,feeStatus:'estimate',availability:'assumed',genre:'soul'},{name:'Yussef Dayes',fee:null,availability:'unconfirmed',genre:'jazz'}],commercial:{capacity:700,ticketPrice:45,otherCosts:6000}});

test('brief validation rejects incomplete, contradictory and invented inputs',()=>{
  const cases=[
    [b=>{delete b.name;},/Event name is required/],
    [b=>{b.constraints.slots=5;},/Lineup size cannot exceed/],
    [b=>{b.candidates[1].name='michael kiwanuka';},/Candidate artists must be different/],
    [b=>{b.candidates[0].name='Leon Bridges';},/both an audience reference and a candidate/],
    [b=>{b.candidates[3].lock=true;},/locked artist needs a fee/],
    [b=>{b.date='2027-02-30';},/real calendar date/],
    [b=>{b.secret='x';},/unsupported field/],
    [b=>{b.candidates[3].feeStatus='quoted';},/needs an amount/],
    [b=>{b.candidates[0].fee=-5;},/between 0 and/],
    [b=>{b.candidates=[b.candidates[0]];},/List 2–8 candidate artists/],
    [b=>{b.anchors=[];},/1–3 audience reference artists/],
    [b=>{b.currency='BTC';},/Currency must be one of/],
    [b=>{b.picks={Nobody:{id:'X1',name:'Nobody'}};},/not in this brief/],
    [b=>{b.picks={Thundercat:{id:'bad id!',name:'T'}};},/valid entity ID/],
    [b=>{b.candidates[0].availability='maybe';},/availability must be one of/],
  ];
  for(const [mutate,pattern] of cases){const b=brief();mutate(b);assert.throws(()=>validateBrief(b),pattern);}
  const clean=validateBrief({...brief(),name:'  Night\u0000 one  '});
  assert.equal(clean.name,'Night one');assert.equal(clean.candidates[3].feeStatus,'unknown');assert.equal(clean.candidates[3].fee,null);
  assert.equal(clean.constraints.maxPerGenre,2);
});

test('events are private: no anonymous read, write or share path exposes them',async()=>{
  const created=await call('POST','/api/events',{brief:brief()});assert.equal(created.status,201);const id=created.body.id;
  for(const [method,path] of [['GET','/api/events'],['GET',`/api/events/${id}`],['POST','/api/events'],['POST',`/api/events/${id}/research`],['POST',`/api/events/${id}/autopilot`],['POST',`/api/events/${id}/revisions`],['DELETE',`/api/events/${id}`],['GET',`/api/events/${id}/compare?a=x&b=y`]])
    assert.equal((await call(method,path,method==='GET'||method==='DELETE'?undefined:{},{auth:false})).status,401,`${method} ${path}`);
  assert.equal((await call('GET',`/api/events/${id}`,undefined,{auth:false})).body.error.includes('Organizer access'),true);
  const wrong=await realFetch(`${base}/api/events/${id}`,{headers:{authorization:'Bearer not-the-token-'.repeat(4)}});assert.equal(wrong.status,401);
  assert.equal((await call('GET',`/api/events/ev_${'0'.repeat(20)}`)).status,404);
});

test('a new event runs end to end: research, decide, revise, decide on the same evidence, compare and export',async()=>{
  const id=(await call('POST','/api/events',{brief:brief()})).body.id;
  assert.equal((await call('POST',`/api/events/${id}/autopilot`,{maxCalls:0})).status,409,'deciding needs research first');
  const researched=await call('POST',`/api/events/${id}/research`);
  assert.equal(researched.status,201);assert.equal(researched.body.research.status,'complete');assert.equal(researched.body.research.mode,'synthetic');
  assert.ok(researched.body.research.callsUsed>0&&researched.body.research.callsUsed<=24);assert.equal(researched.body.research.snapshot,undefined,'the raw snapshot is not sent to the browser');
  const first=await call('POST',`/api/events/${id}/autopilot`,{maxCalls:4});
  assert.equal(first.status,201);assert.equal(first.body.mode,'synthetic');assert.ok(first.body.callsUsed>0&&first.body.callsUsed<=4);
  assert.ok(first.body.run.receipts.every(row=>row.id.startsWith('a1-')));
  const merged=(await call('GET',`/api/events/${id}`)).body;
  assert.deepEqual(merged.research.augmentedBy,[first.body.id],'evidence learned in a run joins the event research');
  const packetBrief=first.body.run.packet.brief;assert.equal(packetBrief.name,'Riverside Soul Sessions');assert.equal(packetBrief.venue,'Example hall');
  assert.ok(first.body.run.packet.terms.some(row=>row.name==='Thundercat'&&row.feeStatus==='quoted'&&row.availability==='confirmed'&&row.needsConfirmation===false));
  assert.ok(first.body.run.packet.terms.filter(row=>first.body.run.packet.recommendation.selectedIds.includes(row.id)).every(row=>row.needsConfirmation===(row.feeStatus!=='quoted'||row.availability!=='confirmed')));
  const revised=brief();revised.constraints.budget=15000;revised.candidates[0].fee=9500;
  const second=await call('POST',`/api/events/${id}/revisions`,{brief:revised,note:'Budget cut'});
  assert.equal(second.status,201);assert.equal(second.body.revisions.length,2);assert.deepEqual(second.body.revisions[1].changes,['Artist budget: 20000 → 15000','Michael Kiwanuka fee: 9000 → 9500']);
  assert.equal(second.body.researchStale,null,'fee and budget edits reuse the evidence');
  assert.equal((await call('POST',`/api/events/${id}/revisions`,{brief:revised})).status,409,'an unchanged revision is rejected');
  const plan=await call('POST',`/api/events/${id}/autopilot`,{maxCalls:0,revision:2});
  assert.equal(plan.status,201);assert.equal(plan.body.mode,'planning');assert.equal(plan.body.callsUsed,0);assert.equal(plan.body.run.constraints.budget,15000);
  assert.ok(plan.body.evidenceReceipts>first.body.evidenceReceipts-first.body.run.receipts.length,'the later plan sees the merged receipts');
  const old=await call('POST',`/api/events/${id}/autopilot`,{maxCalls:0,revision:1});assert.equal(old.body.run.constraints.budget,20000,'an earlier revision can be decided again');
  const compared=await call('GET',`/api/events/${id}/compare?a=${first.body.id}&b=${plan.body.id}`);
  assert.equal(compared.status,200);assert.deepEqual(compared.body.briefChanges,['Artist budget: 20000 → 15000','Michael Kiwanuka fee: 9000 → 9500']);
  assert.equal(typeof compared.body.lineupChanged,'boolean');assert.match(compared.body.note,/Policy points are an internal objective/);
  const html=await call('GET',`/api/events/${id}/runs/${plan.body.id}/packet`);
  assert.equal(html.status,200);assert.match(html.headers.get('content-security-policy'),/default-src 'none'/);assert.match(html.body,/Riverside Soul Sessions/);assert.match(html.body,/Fees and availability/);
  assert.match((await call('GET',`/api/events/${id}/runs/${plan.body.id}/packet?format=md`)).body,/## 10\. Next actions/);
  assert.equal((await call('GET',`/api/autopilot/runs/${plan.body.id}`,undefined,{auth:false})).status,404,'event runs are not reachable through public run links');
  // Adding an artist without evidence needs new research rather than an invented rank.
  revised.candidates.push({name:'Masego',fee:5000,feeStatus:'estimate',availability:'assumed'});
  await call('POST',`/api/events/${id}/revisions`,{brief:revised,note:'Add'});
  const stale=await call('POST',`/api/events/${id}/autopilot`,{maxCalls:0});
  assert.equal(stale.status,409);assert.match(stale.body.error,/Masego have no Qloo evidence yet/);
  assert.match((await call('POST',`/api/events/${id}/autopilot`,{maxCalls:99})).body.error,/Choose 0–16/);
  assert.match((await call('POST',`/api/events/${id}/autopilot`,{revision:1,maxCalls:0,extra:1})).body.error,/Unsupported field/);
});

test('ambiguous names: Qloo matches are offered, a chosen match is used and makes earlier research stale',async()=>{
  const b=brief();b.candidates[2]={name:'Phoenix',fee:5000,feeStatus:'estimate',availability:'assumed'};
  const id=(await call('POST','/api/events',{brief:b})).body.id;
  const researched=(await call('POST',`/api/events/${id}/research`)).body;
  assert.ok(researched.research.unresolved.includes('Phoenix'));
  const choices=researched.research.choices.find(row=>row.name==='Phoenix').choices;assert.ok(choices.length>=2);
  b.picks={Phoenix:{id:choices[0].id,name:choices[0].name}};
  const picked=await call('POST',`/api/events/${id}/revisions`,{brief:b,note:'Chose a Qloo match'});
  assert.match(picked.body.researchStale,/Qloo matches/);assert.ok(picked.body.revisions[1].changes.some(change=>/Qloo match for Phoenix/.test(change)));
  const again=(await call('POST',`/api/events/${id}/research`)).body;
  assert.ok(!again.research.unresolved.includes('Phoenix'));assert.ok(again.research.items.some(item=>item.originalName==='Phoenix'));
});

async function freePort(){const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));return port;}
async function start(dataDir,port){
  const child=spawn(process.execPath,['server/index.mjs'],{cwd:join(import.meta.dirname,'..'),env:{...process.env,DATA_DIR:dataDir,PORT:String(port),HOST:'127.0.0.1',PUBLIC_DEMO:'1',ORGANIZER_TOKEN:token,QLOO_MODE:'mock',LLM_MODE:'off',JUDGE_CASES_FILE:''},stdio:['ignore','pipe','pipe'],windowsHide:true});
  for(let tries=0;tries<80;tries++){try{if((await realFetch(`http://127.0.0.1:${port}/healthz`,{signal:AbortSignal.timeout(500)})).ok)return child;}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
  child.kill();throw new Error('Server did not start.');
}
test('saved events, research and decisions survive an application restart',async()=>{
  const dataDir=mkdtempSync(join(tmpdir(),'houselights-events-restart-')),port=await freePort(),origin=`http://127.0.0.1:${port}`;
  let child=await start(dataDir,port);
  try{
    const id=(await call('POST','/api/events',{brief:brief()},{origin})).body.id;
    await call('POST',`/api/events/${id}/research`,undefined,{origin});
    const run=(await call('POST',`/api/events/${id}/autopilot`,{maxCalls:0},{origin})).body;
    const before=(await call('GET',`/api/events/${id}`,undefined,{origin})).body;
    child.kill();await once(child,'exit');
    child=await start(dataDir,port);
    const afterRestart=(await call('GET',`/api/events/${id}`,undefined,{origin})).body;
    assert.deepEqual(afterRestart.revisions,before.revisions);assert.equal(afterRestart.research.completedAt,before.research.completedAt);
    assert.deepEqual(afterRestart.runs.map(row=>row.id),[run.id]);
    const full=(await call('GET',`/api/events/${id}/runs/${run.id}`,undefined,{origin})).body;assert.equal(full.run.digest,run.run.digest);
  }finally{if(child.exitCode==null){child.kill();await once(child,'exit');}rmSync(dataDir,{recursive:true,force:true});}
});
