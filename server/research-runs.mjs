import { randomUUID, createHash } from 'node:crypto';
import { db, transaction, consumeQuota } from './database.mjs';
import * as store from './store.mjs';
import { Run, isMock } from './qloo.mjs';
import { normalizeFestivalResearch, festivalWorkflowCount } from './festival-research.mjs';
import { prepareThemeResearch, researchThemeSeason } from './theme-research.mjs';
import { runFestivalGM } from './gm.mjs';
import { buildDecisionProof, decisionFingerprint } from './decision-proof.mjs';
import { investigatorOptions, investigateDecision } from './investigator.mjs';
import { llmConfiguration } from './llm.mjs';
import { initializeBenchmark, executeBenchmark, stopBenchmark } from './benchmark-batches.mjs';

// The owner-supplied MIT reference's persisted replay and PartDrop's transition ledger informed
// this implementation. Provider execution is never silently replayed on restart.
db.exec(`CREATE TABLE IF NOT EXISTS research_runs(
  id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS research_events(
  run_id TEXT NOT NULL, sequence INTEGER NOT NULL, body TEXT NOT NULL,
  PRIMARY KEY(run_id, sequence));
CREATE INDEX IF NOT EXISTS research_run_status ON research_runs(json_extract(body,'$.status'));`);
const terminal = new Set(['completed', 'failed', 'canceled', 'interrupted']);
const owner = randomUUID();
const leaseMs = 90000;
const stable = value => JSON.stringify(value, (_, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
  ? Object.fromEntries(Object.entries(entry).sort(([a],[b]) => a.localeCompare(b))) : entry);
const hash = value => 'sha256:' + createHash('sha256').update(stable(value)).digest('hex');
const fault = (message, status=400) => Object.assign(new Error(message), {status});
const now = () => new Date().toISOString();
export const getResearchRun = id => {
  const row = db.prepare('SELECT body FROM research_runs WHERE id=?').get(id);
  return row ? JSON.parse(row.body) : null;
};
const write = run => db.prepare('UPDATE research_runs SET body=? WHERE id=?').run(JSON.stringify(run), run.id);
function append(run, type, data) {
  const entry = {runId:run.id, sequence:run.eventCount+1, at:now(), type, data, previousHash:run.eventHash};
  entry.hash = hash(entry);
  db.prepare('INSERT INTO research_events(run_id,sequence,body) VALUES(?,?,?)').run(run.id, entry.sequence, JSON.stringify(entry));
  run.eventCount = entry.sequence; run.eventHash = entry.hash; write(run);
  return entry;
}
export function researchEvents(id, after=0) {
  if(!Number.isSafeInteger(after)||after<0)throw fault('Event cursor must be a non-negative integer.');
  const run=getResearchRun(id);if(!run)throw fault('Research run not found.',404);
  const events=db.prepare('SELECT body FROM research_events WHERE run_id=? AND sequence>? ORDER BY sequence LIMIT 100').all(id,after).map(row=>JSON.parse(row.body));
  return {run:publicRun(run),events,nextCursor:events.at(-1)?.sequence??after,hasMore:(events.at(-1)?.sequence??after)<run.eventCount};
}
export function publicRun(run) {
  const {workerOwner,leaseUntil,requestKey,...visible}=run;
  return {...visible,terminal:terminal.has(run.status)};
}
export function listResearchRuns() {
  return db.prepare('SELECT body FROM research_runs ORDER BY rowid DESC LIMIT 20').all().map(row=>publicRun(JSON.parse(row.body)));
}
function preflight(source, kind, options) {
  if(!['festival','season','proof','investigation','benchmark'].includes(kind))throw fault('Choose festival, season, proof, investigation or benchmark research.');
  if(kind==='proof')return {expectedCalls:0,budget:0,input:{}};
  if(kind==='benchmark') {
    const trials=options?.trials??3;
    if(!Number.isInteger(trials)||trials<1||trials>5)throw fault('Choose 1–5 trials.');
    if(!llmConfiguration().enabled)throw fault('Configure the model and provider key before running a genuine benchmark.',503);
    return {expectedCalls:trials,budget:trials,input:{trials}};
  }
  if(kind==='investigation') {
    const input=investigatorOptions(source,options);
    if(!llmConfiguration().enabled)throw fault('Configure the LLM provider key and model before starting an investigation.',503);
    if(input.maxQueries>0 && (!!source.mock!==isMock() || !isMock()&&!process.env.QLOO_API_KEY))throw fault('Qloo research needs matching source mode and a configured live key.',503);
    return {expectedCalls:input.maxQueries,budget:input.maxQueries,input};
  }
  if(!!source.mock!==isMock())throw fault('Research must use the same live or synthetic mode as its saved source.',409);
  if(!isMock()&&!process.env.QLOO_API_KEY)throw fault('Configure QLOO_API_KEY before live research.',503);
  const input=kind==='festival'?normalizeFestivalResearch(source,options):prepareThemeResearch(source,options);
  const configured=Number(process.env.GM_CALL_BUDGET??60);
  const budget=Number.isInteger(configured)&&configured>0?Math.min(120,configured):60;
  const expectedCalls=kind==='festival'?festivalWorkflowCount(source,input):input.expectedCalls;
  if(expectedCalls>budget)throw fault(`Research requires up to ${expectedCalls} workflows; budget is ${budget}. Reduce the requested scope.`);
  return {input,expectedCalls,budget};
}
export function createResearchRun(raw, requestKey) {
  if(typeof requestKey!=='string'||! /^[\w-]{12,100}$/.test(requestKey))throw fault('Supply a unique Idempotency-Key of 12–100 letters, digits, underscores or hyphens.');
  const input={sourceId:raw?.sourceId,kind:raw?.kind,options:raw?.options??{}};
  const requestDigest=hash(input);
  const existing=db.prepare('SELECT body FROM research_runs WHERE request_key=?').get(requestKey);
  if(existing){const run=JSON.parse(existing.body);if(run.requestDigest!==requestDigest)throw fault('This request key belongs to different input.',409);return {run:publicRun(run),reused:true};}
  const source=store.load(input.sourceId);if(!source)throw fault('Saved source not found.',404);
  const plan=preflight(source,input.kind,input.options);
  const minute=Math.floor(Date.now()/60000),day=Math.floor(Date.now()/864e5);
  const quotas=[{key:`research-runs:${minute}`,limit:6,expires:(minute+1)*60000},{key:`research-runs-day:${day}`,limit:100,expires:(day+1)*864e5}];
  if(input.kind==='benchmark')quotas.push({key:`benchmark-batch:${minute}`,limit:2,expires:(minute+1)*60000},{key:`benchmark-batch-day:${day}`,limit:20,expires:(day+1)*864e5});
  if(!consumeQuota(quotas))throw fault('Research or benchmark batch quota reached.',429);
  return transaction(()=>{
    // Recheck inside the write transaction for concurrent server instances.
    const duplicate=db.prepare('SELECT body FROM research_runs WHERE request_key=?').get(requestKey);
    if(duplicate){const run=JSON.parse(duplicate.body);if(run.requestDigest!==requestDigest)throw fault('This request key belongs to different input.',409);return {run:publicRun(run),reused:true};}
    const active=db.prepare("SELECT count(*) AS count FROM research_runs WHERE json_extract(body,'$.status') IN ('queued','running','cancel_requested')").get().count;
    if(active>=4)throw fault('Research queue is full. Reconnect to an existing run or wait for it to finish.',429);
    const run={id:randomUUID(),requestKey,requestDigest,...input,sourceDigest:decisionFingerprint(source),
      mode:source.mock?'mock':'live',expectedCalls:plan.expectedCalls,budget:plan.budget,status:'queued',revision:0,
      eventCount:0,eventHash:null,createdAt:now(),resultId:null,workerOwner:null,leaseUntil:null};
    db.prepare('INSERT INTO research_runs(id,request_key,body) VALUES(?,?,?)').run(run.id,requestKey,JSON.stringify(run));
    if(run.kind==='benchmark')initializeBenchmark(run);
    append(run,'queued',{kind:run.kind,sourceId:run.sourceId,expectedCalls:run.expectedCalls,budget:run.budget});
    db.prepare('UPDATE snapshots SET pinned=1 WHERE id=?').run(source.id);
    return {run:publicRun(run),reused:false};
  });
}
export function cancelResearchRun(id, expectedRevision) {
  return transaction(()=>{
    const run=getResearchRun(id);if(!run)throw fault('Research run not found.',404);
    if(run.revision!==expectedRevision)throw fault('Run state changed. Refresh before canceling.',409);
    if(terminal.has(run.status))throw fault('This run has already ended.',409);
    if(run.status==='cancel_requested')return publicRun(run);
    run.status=run.status==='queued'?'canceled':'cancel_requested';run.revision++;
    if(run.status==='canceled')run.finishedAt=now();
    if(run.kind==='benchmark'&&run.status==='canceled')stopBenchmark(run.id,'canceled');
    append(run,run.status,{message:'No further workflow will start. An in-flight provider call may finish and its receipt will be retained.'});
    return publicRun(run);
  });
}
export function interruptExpiredRuns(time=Date.now()) {
  return transaction(()=>{
    const interrupted=[];
    for(const row of db.prepare("SELECT body FROM research_runs WHERE json_extract(body,'$.status') IN ('running','cancel_requested')").all()){
      const run=JSON.parse(row.body);
      if(['running','cancel_requested'].includes(run.status)&&run.leaseUntil<time){
        run.status='interrupted';run.revision++;run.finishedAt=now();run.workerOwner=null;run.leaseUntil=null;
        if(run.kind==='benchmark')stopBenchmark(run.id,'interrupted');
        append(run,'interrupted',{message:'Worker lease expired. Saved events remain available. No provider calls were automatically repeated.'});interrupted.push(run.id);
      }
    }
    return interrupted;
  });
}
function claim() {
  return transaction(()=>{
    const runs=db.prepare("SELECT body FROM research_runs WHERE json_extract(body,'$.status') IN ('queued','running','cancel_requested') ORDER BY rowid").all().map(row=>JSON.parse(row.body));
    if(runs.some(run=>['running','cancel_requested'].includes(run.status)))return null;
    const run=runs.find(run=>run.status==='queued');if(!run)return null;
    run.status='running';run.revision++;run.startedAt=now();run.workerOwner=owner;run.leaseUntil=Date.now()+leaseMs;
    append(run,'started',{message:'Worker claimed this run. Closing the browser does not cancel it.'});return run;
  });
}
function owned(id) {
  const run=getResearchRun(id);
  if(run?.workerOwner!==owner||!['running','cancel_requested'].includes(run.status))throw fault('Research worker no longer owns this run.',409);
  return run;
}
function checkCancellation(id) {
  if(owned(id).status==='cancel_requested')throw fault('Research canceled at a workflow boundary.',499);
}
function record(id,type,data) {return transaction(()=>append(owned(id),type,data));}
export async function executeNextResearchRun({makeRun=options=>new Run(options),propose}={}) {
  interruptExpiredRuns();const job=claim();if(!job)return null;
  const heartbeat=setInterval(()=>{
    try{transaction(()=>{const run=owned(job.id);run.leaseUntil=Date.now()+leaseMs;write(run);});}catch{/* A lost lease cannot be reacquired by this worker. */}
  },10000);heartbeat.unref();
  try{
    const source=store.load(job.sourceId);
    if(!source||decisionFingerprint(source)!==job.sourceDigest)throw fault('Saved source changed; create a new run.');
    const plan=preflight(source,job.kind,job.options);checkCancellation(job.id);
    if(job.kind==='benchmark') {
      const batch=await executeBenchmark(job,source,{propose,check:()=>checkCancellation(job.id),
        commit:(type,update)=>transaction(()=>{const run=owned(job.id);append(run,type,update());})});
      transaction(()=>{
        const run=owned(job.id);checkCancellation(job.id);
        run.resultId=batch.trials[0]?.snapshotId??null;run.batchId=batch.id;run.status='completed';run.revision++;run.finishedAt=now();run.workerOwner=null;run.leaseUntil=null;
        append(run,'completed',{resultId:run.resultId,batchId:batch.id,status:batch.status,message:'Benchmark batch finished. Inspect every attempt and any unattempted trials.'});
      });
      return publicRun(getResearchRun(job.id));
    }
    let snapshot=structuredClone(source);
    if(job.kind!=='proof'){
      const offset=(source.receipts??[]).reduce((max,r)=>Math.max(max,Number(/^g(\d+)$/.exec(r.id)?.[1]??0)),0);
      const run=makeRun({budget:job.budget,mode:job.mode,deadlineMs:job.kind==='investigation'?600000:120000,receiptPrefix:'g',receiptOffset:offset,
        emit:event=>record(job.id,event.type,event)});
      const call=run.call.bind(run);
      run.call=async(...args)=>{checkCancellation(job.id);record(job.id,'workflow_started',{tool:args[0],why:args[2]});const result=await call(...args);checkCancellation(job.id);return result;};
      if(job.kind==='investigation') {
        const investigation=await investigateDecision(source,plan.input,run,{propose,check:()=>checkCancellation(job.id),emit:event=>record(job.id,event.type,event)});
        snapshot={...source,investigation,receipts:[...(source.receipts??[]),...run.receipts]};
        investigation.resultDigest=decisionFingerprint(snapshot);
      } else snapshot=job.kind==='festival'?await runFestivalGM(source,plan.input,run):await researchThemeSeason(source,job.options,run);
    }
    checkCancellation(job.id);
    record(job.id,'verification',{message:'Building exact decision proof, evidence challenges and cancellation checks.'});
    snapshot={...snapshot,id:undefined,createdAt:undefined,parentId:source.id};
    snapshot.decisionProof=buildDecisionProof(snapshot);
    checkCancellation(job.id);
    transaction(()=>{
      const run=owned(job.id);if(run.status==='cancel_requested')throw fault('Research canceled.',499);
      // Snapshot and terminal event are committed together; no orphan completion.
      const resultId=store.save(snapshot,{withinTransaction:true});
      db.prepare('UPDATE snapshots SET pinned=1 WHERE id=?').run(resultId);
      run.resultId=resultId;run.status='completed';run.revision++;run.finishedAt=now();run.workerOwner=null;run.leaseUntil=null;
      append(run,'completed',{resultId,proofStatus:snapshot.decisionProof.status,decisionState:snapshot.gm?.state??null,investigationStatus:snapshot.investigation?.status??null,
        message:'Computation complete. Evidence blockers still require resolution; no planning approval was granted.'});
    });
  }catch(error){
    transaction(()=>{
      const run=getResearchRun(job.id);if(run?.workerOwner!==owner||terminal.has(run.status))return;
      run.status=run.status==='cancel_requested'||error.status===499?'canceled':'failed';run.revision++;run.finishedAt=now();run.workerOwner=null;run.leaseUntil=null;
      if(run.kind==='benchmark')stopBenchmark(run.id,run.status);
      // Never persist arbitrary provider errors, credentials, or stack traces.
      append(run,run.status,{message:run.status==='canceled'?'Stopped at a workflow boundary. Partial receipts remain inspectable.':'Execution stopped. Inspect saved events and source assumptions; no result or approval was fabricated.'});
    });
  }finally{clearInterval(heartbeat);}
  return publicRun(getResearchRun(job.id));
}
let timer=null,working=false;
export function startResearchWorker(){
  if(timer)return;
  const tick=async()=>{if(working)return;working=true;try{await executeNextResearchRun();}catch{/* Retained lease/state exposes storage or worker interruption. */}finally{working=false;}};
  timer=setInterval(tick,1000);timer.unref();void tick();
}
