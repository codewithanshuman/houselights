import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
const directory=mkdtempSync(join(tmpdir(),'houselights-http-quota-'));
process.env.DATA_DIR=directory;process.env.QLOO_MODE='mock';process.env.LLM_MODE='off';
const {db}=await import('../server/database.mjs');
const {createQlooHttpFetch,qlooQuotaStatus,QLOO_HTTP_DEFAULTS}=await import('../server/qloo-http.mjs');
const key='test-only-qloo-http-key',origin='https://hackathon.api.qloo.com';
beforeEach(()=>db.exec('DELETE FROM qloo_http_requests;DELETE FROM qloo_http_state;DELETE FROM quotas;'));
after(()=>{db.close();const resolved=realpathSync(directory);assert.ok(resolved.startsWith(realpathSync(tmpdir())+sep));rmSync(resolved,{recursive:true,force:true,maxRetries:3});});
const ok=(remaining='49999',limit='50000')=>new Response('{}',{headers:{'x-month-ratelimit-limit':limit,'x-month-ratelimit-remaining':remaining}});
const factory=options=>createQlooHttpFetch({apiKey:key,baseUrl:origin,...options});
const count=()=>db.prepare('SELECT count(*) AS n FROM qloo_http_requests').get().n;

test('real HTTP admissions obey the rolling 10-per-second limit across concurrent fetchers',async()=>{
  const started=[],fetchImpl=async()=>{started.push(Date.now());return new Response('{}');};
  const a=factory({fetchImpl}),b=factory({fetchImpl});
  await Promise.all(Array.from({length:23},(_,i)=>(i%2?a:b)(origin+'/')));
  assert.equal(started.length,23);assert.equal(count(),23);
  for(const t of started)assert.ok(started.filter(x=>x>=t&&x<t+1000).length<=10);
});

test('provider rate reservations are shared across separate Node workers',async()=>{
  const code=`import{createQlooHttpFetch}from'./server/qloo-http.mjs';const starts=[];const f=createQlooHttpFetch({apiKey:${JSON.stringify(key)},baseUrl:${JSON.stringify(origin)},fetchImpl:async()=>{starts.push(Date.now());return new Response('{}')}});await Promise.all(Array.from({length:8},()=>f(${JSON.stringify(origin)})));console.log(JSON.stringify(starts));`;
  const child=()=>new Promise((resolve,reject)=>{
    const p=spawn(process.execPath,['--input-type=module','-e',code],{cwd:process.cwd(),env:{...process.env,DATA_DIR:directory},stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',v=>output+=v);p.stderr.on('data',()=>{});p.on('error',reject);p.on('exit',c=>c?reject(new Error('Isolated quota worker failed')):resolve(JSON.parse(output)));
  });
  const starts=(await Promise.all([child(),child()])).flat().sort((a,b)=>a-b);
  assert.equal(starts.length,16);assert.equal(count(),16);
  for(const t of starts)assert.ok(starts.filter(x=>x>=t&&x<t+1000).length<=10);
});

test('a slow durable reservation commit cannot bunch actual HTTP starts',async()=>{
  let time=Date.now(),delayed=false;const started=[],original=db.exec;
  db.exec=function(sql){const result=original.call(this,sql);if(sql==='COMMIT'&&!delayed){delayed=true;time+=110;}return result;};
  try{
    const f=factory({now:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async()=>{started.push(time);return new Response('{}');}});
    await Promise.all(Array.from({length:23},()=>f(origin+'/')));
    assert.equal(started.length,23);
    for(let i=1;i<started.length;i++)assert.ok(started[i]-started[i-1]>=105,'Transport starts retain the full pacing interval after a slow commit');
    for(const t of started)assert.ok(started.filter(x=>x>=t&&x<t+1000).length<=10);
  }finally{db.exec=original;}
});

test('abandoned dispatch owners are fenced and recovery waits a full rate window',async()=>{
  let time=Date.now();const started=[];const f=factory({now:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async()=>{started.push(time);return new Response('{}');}});
  await f(origin+'/');const row=db.prepare('SELECT scope,body FROM qloo_http_state').get(),state=JSON.parse(row.body);
  state.dispatchLeaseId='00000000-0000-4000-8000-000000000001';state.dispatchLeaseUntil=time+100;
  db.prepare('UPDATE qloo_http_state SET body=? WHERE scope=?').run(JSON.stringify(state),row.scope);
  const abandonedUntil=state.dispatchLeaseUntil;await f(origin+'/');assert.ok(started[1]>=abandonedUntil+1000);
  let replaced=false,called=false;const original=db.exec;
  db.exec=function(sql){const result=original.call(this,sql);if(sql==='COMMIT'&&!replaced){replaced=true;const saved=JSON.parse(db.prepare('SELECT body FROM qloo_http_state').get().body);saved.dispatchLeaseId='00000000-0000-4000-8000-000000000002';db.prepare('UPDATE qloo_http_state SET body=?').run(JSON.stringify(saved));}return result;};
  time+=1000;
  try{await assert.rejects(factory({now:()=>time,fetchImpl:()=>{called=true;return new Response('{}');}})(origin+'/'),{code:'QLOO_HTTP_QUOTA'});assert.equal(called,false);assert.equal(count(),3);}
  finally{db.exec=original;}
});

test('provider headers are captured case-insensitively and no credential enters quota status or storage',async()=>{
  await factory({fetchImpl:async()=>new Response('{}',{headers:{'X-Month-Ratelimit-Limit':'50000','X-Month-Ratelimit-Remaining':'48776'}})})(origin+'/');
  const state=qlooQuotaStatus(key);assert.equal(state.observed.limit,50000);assert.equal(state.observed.remaining,48776);assert.equal(state.local.rolling30DayHttpAttempts,1);assert.equal(state.local.conservativeRemaining,48776);
  assert.deepEqual(qlooQuotaStatus(' '+key+' ').observed,state.observed,'HTTP header whitespace normalization must not fork the same credential budget');
  const stored=JSON.stringify({state,rows:db.prepare('SELECT * FROM qloo_http_state').all(),requests:db.prepare('SELECT * FROM qloo_http_requests').all()});
  assert.ok(!stored.includes(key));assert.ok(!stored.includes(origin));
});

test('missing or malformed headers stay unknown and never overwrite a valid observed balance',async()=>{
  let response=new Response('{}');const f=factory({fetchImpl:async()=>response});await f(origin+'/');assert.equal(qlooQuotaStatus(key).observed,null);
  response=ok('8','10');await f(origin+'/');const before=qlooQuotaStatus(key).observed;
  for(const headers of [{'x-month-ratelimit-limit':'10','x-month-ratelimit-remaining':'11'},{'x-month-ratelimit-limit':'10','x-month-ratelimit-remaining':'-1'},{'x-month-ratelimit-limit':'NaN','x-month-ratelimit-remaining':'0'},{}]){
    response=new Response('{}',{headers});await f(origin+'/');assert.deepEqual(qlooQuotaStatus(key).observed,before);
  }
});

test('an exhausted observed balance blocks new HTTP requests while an explicit metered probe can verify replenishment',async()=>{
  let calls=0;const f=factory({fetchImpl:async()=>{calls++;return ok('0');}});await f(origin+'/');
  await assert.rejects(f(origin+'/'),{code:'QLOO_HTTP_QUOTA'});assert.equal(calls,1);assert.equal(count(),1);assert.equal(qlooQuotaStatus(key).blocked,true);
  await factory({permitHeaderProbe:true,fetchImpl:async()=>ok('20')})(origin+'/');assert.equal(count(),2);assert.equal(qlooQuotaStatus(key).local.conservativeRemaining,20);
});

test('rolling budgets survive factory recreation and do not reset on a calendar-month boundary',async()=>{
  let time=Date.parse('2026-01-31T23:59:59Z'),calls=0;
  const settings={now:()=>time,requestsPer30Days:2,fetchImpl:async()=>{calls++;return new Response('{}');}};
  await factory(settings)(origin+'/');time+=2000;await factory(settings)(origin+'/');
  await assert.rejects(factory(settings)(origin+'/'),{code:'QLOO_HTTP_QUOTA'});assert.equal(calls,2);
  time+=QLOO_HTTP_DEFAULTS.windowMs+1;await factory(settings)(origin+'/');assert.equal(calls,3);assert.equal(count(),1);
});

test('canceled waits spend no HTTP quota and failed network attempts are never refunded',async()=>{
  const aborted=new AbortController();aborted.abort();await assert.rejects(factory({fetchImpl:async()=>ok()})(origin+'/',{signal:aborted.signal}));assert.equal(count(),0);
  const f=factory({fetchImpl:async()=>{throw Error('Fixture socket dropped');}});await assert.rejects(f(origin+'/'));assert.equal(count(),1);
  const waiting=factory({requestsPerSecond:1,fetchImpl:async()=>ok()});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20);
  try{await assert.rejects(waiting(origin+'/',{signal:controller.signal}));assert.equal(count(),1);}finally{clearTimeout(timer);}
});

test('out-of-order headers never increase the conservative balance and Retry-After pauses all callers',async()=>{
  let time=Date.now();const pending=[];const f=factory({now:()=>time,fetchImpl:()=>new Promise(resolve=>pending.push(resolve))});
  const first=f(origin+'/');time+=1001;const second=f(origin+'/');assert.equal(pending.length,2);
  pending[1](ok('8','10'));await second;const reduced=qlooQuotaStatus(key).local.conservativeRemaining;
  pending[0](ok('9','10'));await first;assert.ok(qlooQuotaStatus(key).local.conservativeRemaining<=reduced);
  time+=1001;let finishProbe;
  const probe=factory({permitHeaderProbe:true,now:()=>time,fetchImpl:()=>new Promise(resolve=>finishProbe=resolve)})(origin+'/');
  time+=1001;await factory({now:()=>time,fetchImpl:async()=>ok('8','10')})(origin+'/');
  finishProbe(ok('9','10'));await probe;assert.ok(qlooQuotaStatus(key).local.conservativeRemaining<=8,'A late operator probe cannot restore a completed overlapping request');
  time+=2000;let waited=0;
  await factory({now:()=>time,fetchImpl:async()=>new Response('{}',{status:429,headers:{'retry-after':'2'}})})(origin+'/');
  await factory({now:()=>time,sleep:async ms=>{waited+=ms;time+=ms;},fetchImpl:async()=>new Response('{}')})(origin+'/');assert.equal(waited,2000);
});

test('a failed quota write after receiving headers cancels the response and retains the spent attempt',async()=>{
  let canceled=false;
  const f=factory({fetchImpl:async()=>{
    db.exec("CREATE TEMP TRIGGER deny_quota_update BEFORE UPDATE ON qloo_http_state BEGIN SELECT RAISE(ABORT,'fixture quota write failure'); END");
    return new Response(new ReadableStream({cancel(){canceled=true;}}));
  }});
  try{await assert.rejects(f(origin+'/'));assert.equal(canceled,true);assert.equal(count(),1);}finally{db.exec('DROP TRIGGER IF EXISTS deny_quota_update');}
});

test('automatic redirects cannot create unmetered HTTP requests or forward provider credentials',async()=>{
  let first=0,second=0;
  const target=createServer((_req,res)=>{second++;res.end('{}');});await new Promise(resolve=>target.listen(0,'127.0.0.1',resolve));
  const source=createServer((_req,res)=>{first++;res.writeHead(302,{location:`http://127.0.0.1:${target.address().port}/`});res.end();});await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${source.address().port}`;
  try{await assert.rejects(createQlooHttpFetch({apiKey:key,baseUrl:base})(base,{headers:{'X-Api-Key':key}}));assert.equal(first,1);assert.equal(second,0);assert.equal(count(),1);}
  finally{await Promise.all([new Promise(resolve=>source.close(resolve)),new Promise(resolve=>target.close(resolve))]);}
});

test('quota telemetry requires organizer access and performs no provider call',async()=>{
  process.env.ORGANIZER_TOKEN='test-organizer-quota-token-'.repeat(2);process.env.QLOO_API_KEY=key;
  const {createApp}=await import('../server/app.mjs');const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const url=`http://127.0.0.1:${server.address().port}/api/qloo/quota`;
  try{assert.equal((await fetch(url)).status,401);const response=await fetch(url,{headers:{authorization:'Bearer '+process.env.ORGANIZER_TOKEN}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.equal(body.observed,null);assert.equal(body.defaults.requestsPerSecond,10);assert.equal(count(),0);assert.ok(!JSON.stringify(body).includes(key));}
  finally{await new Promise(resolve=>server.close(resolve));delete process.env.ORGANIZER_TOKEN;delete process.env.QLOO_API_KEY;}
});

test('cached Qloo evidence remains available when the observed HTTP allowance is exhausted',async()=>{
  process.env.QLOO_API_KEY=key;
  const {Run}=await import('../server/qloo.mjs');let calls=0;
  const run=new Run({mode:'live',execute:async()=>{calls++;return{status:'ok',results:[{name:'Cached quota fixture',entity_id:'cached-quota-fixture'}]};}});run.sharedLive=true;
  try{
    const args={entity:'Cached quota fixture',type:'artist'};await run.call('describe',args,'Fixture cache preparation');
    await factory({fetchImpl:async()=>ok('0')})(origin+'/');run.cache.clear();
    const cached=await run.call('describe',args,'Read retained cache');assert.equal(cached.receipt.cached,true);assert.equal(cached.receipt.attempts,0);assert.equal(cached.env.status,'ok');
    const blocked=await run.call('describe',{entity:'Uncached quota fixture',type:'artist'},'Respect observed HTTP allowance');assert.equal(blocked.env.error.code,'PROVIDER_QUOTA');assert.equal(blocked.receipt.attempts,0);assert.equal(calls,1);assert.equal(count(),1);
  }finally{delete process.env.QLOO_API_KEY;}
});

test('invalid configuration or corrupted durable quota state fails closed without a provider request',async()=>{
  assert.throws(()=>factory({requestsPerSecond:11}));assert.throws(()=>factory({requestsPer30Days:50001}));
  const f=factory({fetchImpl:async()=>ok()});await f(origin+'/');db.prepare("UPDATE qloo_http_state SET body='broken-state'").run();let called=false;
  await assert.rejects(factory({fetchImpl:async()=>{called=true;return ok();}})(origin+'/'));assert.equal(called,false);assert.equal(count(),1);
});
