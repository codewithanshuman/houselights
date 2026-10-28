// Provider HTTP accounting, separate from workflow/visitor budgets. All workers
// share the existing SQLite database. Never store credentials, URLs or payloads.
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {db,transaction} from './database.mjs';

export const QLOO_HTTP_DEFAULTS=Object.freeze({requestsPerSecond:10,requestsPer30Days:50000,windowMs:30*86400000,source:'Hackathon support defaults supplied by the organizer, 28 October 2026'});
const scopeFor=key=>createHash('sha256').update('houselights-qloo-http:'+key.trim()).digest('hex');
const load=scope=>{
  const raw=db.prepare('SELECT body FROM qloo_http_state WHERE scope=?').get(scope);
  const state=raw?JSON.parse(raw.body):{};
  if(!state||typeof state!=='object'||Array.isArray(state)||
    ['safeRemaining','safeSince','observedLimit','observedRemaining','observedAt','blockedUntil','lastDispatchedAt','dispatchLeaseUntil'].some(key=>state[key]!=null&&(!Number.isSafeInteger(state[key])||state[key]<0))||
    (state.dispatchLeaseId!=null&&(typeof state.dispatchLeaseId!=='string'||!/^[a-f0-9-]{36}$/.test(state.dispatchLeaseId)||!Number.isSafeInteger(state.dispatchLeaseUntil)))||
    (state.dispatchLeaseUntil!=null&&state.dispatchLeaseId==null))throw new Error('Qloo HTTP quota state is unavailable.');
  return state;
};
const save=(scope,state)=>db.prepare('INSERT INTO qloo_http_state(scope,body) VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET body=excluded.body').run(scope,JSON.stringify(state));
function fresh(state,now){
  // Never invent a calendar-month reset. An old observation stops constraining
  // admission only after a full 30 days; the local rolling ledger still applies.
  if(state.safeSince!=null&&now-state.safeSince>=QLOO_HTTP_DEFAULTS.windowMs){state.safeRemaining=null;state.safeSince=null;}
  return state;
}
const used=(scope,now)=>db.prepare('SELECT count(*) AS n FROM qloo_http_requests WHERE scope=? AND started_at>?').get(scope,now-QLOO_HTTP_DEFAULTS.windowMs).n;
function quotaError(message,retryAt){const error=new Error(message);error.code='QLOO_HTTP_QUOTA';error.retryAt=retryAt;return error;}
function integer(value){return typeof value==='string'&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):null;}

export function qlooQuotaStatus(apiKey=process.env.QLOO_API_KEY,{now=Date.now()}={}){
  if(!apiKey?.trim())return{configured:false,defaults:QLOO_HTTP_DEFAULTS,observed:null,local:null,blocked:false};
  return transaction(()=>{
    const scope=scopeFor(apiKey),state=fresh(load(scope),now),count=used(scope,now);
    const limit=Math.min(QLOO_HTTP_DEFAULTS.requestsPer30Days,state.observedLimit??Infinity);
    const remaining=Math.max(0,Math.min(limit-count,state.safeRemaining??Infinity));
    return {configured:true,defaults:QLOO_HTTP_DEFAULTS,
      observed:state.observedAt==null?null:{limit:state.observedLimit,remaining:state.observedRemaining,at:new Date(state.observedAt).toISOString(),source:'Qloo x-month-ratelimit response headers'},
      local:{rolling30DayHttpAttempts:count,rolling30DayLimit:limit,conservativeRemaining:remaining,blockedUntil:state.blockedUntil?new Date(state.blockedUntil).toISOString():null},
      blocked:remaining===0,
      scope:'This installation counts its own HTTP attempts. Other clients appear only through observed provider headers. Missing headers are unknown, not zero.'};
  });
}

export function createQlooHttpFetch({apiKey=process.env.QLOO_API_KEY,baseUrl=process.env.QLOO_BASE_URL??'https://api.qloo.com',fetchImpl=globalThis.fetch,
  now=Date.now,sleep=(ms,signal)=>delay(ms,undefined,{signal}),requestsPerSecond=10,requestsPer30Days=50000,permitHeaderProbe=false}={}){
  if(typeof apiKey!=='string'||!apiKey.trim())throw new Error('A configured Qloo credential is required.');
  if(!Number.isInteger(requestsPerSecond)||requestsPerSecond<1||requestsPerSecond>10||!Number.isInteger(requestsPer30Days)||requestsPer30Days<1||requestsPer30Days>50000)throw new Error('Qloo HTTP limits must not exceed the supported hackathon defaults.');
  const origin=new URL(baseUrl).origin,scope=scopeFor(apiKey);let probeAvailable=permitHeaderProbe===true;
  return async function limitedQlooFetch(input,init={}){
    const url=new URL(input instanceof Request?input.url:input);
    if(url.origin!==origin)return fetchImpl(input,init);
    const signal=init.signal??(input instanceof Request?input.signal:undefined);
    let ticket;
    for(;;){
      signal?.throwIfAborted();
      // Persist the spend first, then serialize the transport handoff. A slow
      // reservation commit must not compress the actual HTTP start interval.
      const decision=transaction(()=>{
        const time=now(),cutoff=time-QLOO_HTTP_DEFAULTS.windowMs;
        db.prepare('DELETE FROM qloo_http_requests WHERE started_at<=?').run(cutoff);
        const state=fresh(load(scope),time),count=used(scope,time),limit=Math.min(requestsPer30Days,state.observedLimit??Infinity);
        if(count>=limit)throw quotaError('Houselights paused Qloo HTTP requests because its rolling 30-day request budget is exhausted.',db.prepare('SELECT min(started_at) AS t FROM qloo_http_requests WHERE scope=?').get(scope).t+QLOO_HTTP_DEFAULTS.windowMs);
        if(state.safeRemaining===0&&!probeAvailable)throw quotaError('Houselights paused Qloo HTTP requests because the observed provider quota is exhausted. Cached evidence remains available.',(state.safeSince??time)+QLOO_HTTP_DEFAULTS.windowMs);
        if((state.blockedUntil??0)>time)return{wait:state.blockedUntil-time};
        if(state.dispatchLeaseId){
          if(state.dispatchLeaseUntil>time)return{wait:Math.min(105,state.dispatchLeaseUntil-time)};
          // An abandoned handoff may already have sent its request. Wait a full
          // rate window before allowing another owner; the old owner is fenced.
          delete state.dispatchLeaseId;delete state.dispatchLeaseUntil;
          state.lastDispatchedAt=Math.max(state.lastDispatchedAt??0,time+1000);save(scope,state);return{wait:1000};
        }
        const last=state.lastDispatchedAt??db.prepare('SELECT max(started_at) AS t FROM qloo_http_requests WHERE scope=?').get(scope).t;
        // Small scheduling headroom avoids boundary bursts across processes.
        const interval=Math.ceil(1000/requestsPerSecond)+5;
        if(last!=null&&last+interval>time)return{wait:last+interval-time};
        const id=randomUUID(),probe=probeAvailable;
        db.prepare('INSERT INTO qloo_http_requests(id,scope,started_at) VALUES(?,?,?)').run(id,scope,time);
        if(state.safeRemaining!=null)state.safeRemaining=Math.max(0,state.safeRemaining-1);
        state.dispatchLeaseId=id;state.dispatchLeaseUntil=time+30000;
        save(scope,state);return{id,probe,startedAt:time};
      });
      if(decision.wait!=null){await sleep(decision.wait,signal);continue;}
      ticket=decision;probeAvailable=false;
      break;
    }
    let response,transport,synchronousError;
    try{
      // Automatic redirects would create uncounted requests and could forward
      // credentials outside the trusted endpoint. SDK trust checks stay intact.
      try{transaction(()=>{
        const state=load(scope);
        if(state.dispatchLeaseId!==ticket.id||state.dispatchLeaseUntil<=now())throw quotaError('The Qloo HTTP handoff expired before dispatch.',now()+1000);
        // Only the synchronous fetch invocation is inside this short critical
        // section. HTTP responses are awaited after releasing the SQLite lock.
        try{transport=fetchImpl(input,{...init,redirect:'error'});}catch(error){synchronousError=error;}
        state.lastDispatchedAt=now();delete state.dispatchLeaseId;delete state.dispatchLeaseUntil;save(scope,state);
      });}catch(error){if(transport)try{await(await transport).body?.cancel();}catch{}throw error;}
      if(synchronousError)throw synchronousError;
      response=await transport;
      return response;
    }finally{
      try{transaction(()=>{
        const time=now(),state=fresh(load(scope),time);
        // settled is the completion timestamp (zero means still unresolved).
        db.prepare('UPDATE qloo_http_requests SET settled=? WHERE id=? AND scope=?').run(time,ticket.id,scope);
        const limit=integer(response?.headers.get('x-month-ratelimit-limit'));
        const remaining=integer(response?.headers.get('x-month-ratelimit-remaining'));
        if(limit!=null&&limit>0&&remaining!=null&&remaining<=limit){
          // A response can arrive after a later request already completed.
          // Subtract all overlapping attempts, not only those still pending.
          const uncertain=db.prepare('SELECT count(*) AS n FROM qloo_http_requests WHERE scope=? AND id<>? AND (started_at>=? OR settled>=? OR (settled=0 AND started_at>?))').get(scope,ticket.id,ticket.startedAt,ticket.startedAt,time-120000).n;
          const conservative=Math.max(0,remaining-uncertain);
          state.observedLimit=limit;state.observedRemaining=remaining;state.observedAt=time;
          if(ticket.probe||state.safeRemaining==null){state.safeRemaining=conservative;state.safeSince=time;}
          else state.safeRemaining=Math.min(state.safeRemaining,conservative);
        }
        if(response?.status===429){
          const raw=response.headers.get('retry-after'),seconds=integer(raw),date=raw?Date.parse(raw):NaN;
          const wait=seconds!=null?seconds*1000:Number.isFinite(date)?Math.max(0,date-time):1000;
          if(Number.isSafeInteger(wait))state.blockedUntil=Math.max(state.blockedUntil??0,time+Math.max(1000,wait));
        }
        save(scope,state);
      });}catch(error){await response?.body?.cancel().catch(()=>{});throw error;}
      // Failed requests remain spent locally: an aborted socket cannot prove
      // that Qloo did not receive/charge the attempted HTTP request.
    }
  };
}
