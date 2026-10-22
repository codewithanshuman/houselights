import {createHash} from 'node:crypto';
import {db,consumeQuota} from './database.mjs';
import * as store from './store.mjs';
import {optimizeSlate} from './optimizer.mjs';
import {buildDecisionProof,evidenceDependencies} from './decision-proof.mjs';
import {preserveRankProvenance} from './gm.mjs';
import {publicBenchmark,judgeMethods} from './judge-comparison.mjs';

db.exec('CREATE TABLE IF NOT EXISTS judge_cases(id TEXT PRIMARY KEY, body TEXT NOT NULL)');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fault=(message,status=400)=>Object.assign(new Error(message),{status});
const text=(value,max=180)=>typeof value==='string'?value.slice(0,max):'';
const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const strings=value=>Array.isArray(value)?value.filter(v=>typeof v==='string').slice(0,100).map(v=>text(v)):[];
const kinds=['rank','local','trends','comparison'];
const fields=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,value[key]]));
const sameSelection=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());

// A separate public record, never a raw source snapshot or private source document.
export function publicJudgeSnapshot(source) {
  if(source?.memo?.exampleBookingTerms!==true&&source?.input?.exampleBookingTerms!==true)throw fault('Judge cases require explicitly illustrative booking terms.');
  if(!Array.isArray(source.memo.items)||source.memo.items.length<2||source.memo.items.length>12)throw fault('Choose a saved pool of 2–12 candidates.');
  const original=optimizeSlate(source.memo.items,source.memo.constraints);
  if(original.status==='invalid')throw fault('Resolve invalid source constraints first.');
  const receipts=(source.receipts??[]).slice(0,250).map(r=>({id:text(r.id),tool:text(r.tool),status:text(r.status,30),
    source:r.source==='synthetic'?'synthetic':r.source==='qloo'?'qloo':'unknown',fetchedAt:text(r.fetchedAt,40),
    originalDigest:/^sha256:[a-f0-9]{64}$/.test(r.digest??r.originalDigest??'')?(r.digest??r.originalDigest):null,
    args:Object.fromEntries(['options','option_type','signals','signal_location','entity_id','entity_ids','location','type'].filter(key=>r.args?.[key]!==undefined).map(key=>[key,Array.isArray(r.args[key])?strings(r.args[key]):text(r.args[key])])),
    evidence:{kind:text(r.evidence?.kind),rows:(Array.isArray(r.evidence?.rows)?r.evidence.rows:[]).slice(0,100).map(row=>({id:text(row.id),name:text(row.name),affinity:number(row.affinity),popularity:number(row.popularity)}))},
    projection:'Public query and row projection. Original digest identifies the saved source receipt, not this reduced object.'}));
  const items=preserveRankProvenance(source).map(i=>({id:text(i.id),name:text(i.name),found:i.found===true,
    fit:number(i.fit),rank:number(i.rank),of:number(i.of),identityReceipt:text(i.identityReceipt),
    rankCoverage:i.rankCoverage?{complete:i.rankCoverage.complete===true,returned:number(i.rankCoverage.returned),requested:number(i.rankCoverage.requested)}:undefined,
    local:['yes','no','no data'].includes(i.local)?i.local:'no data',momentum:['rising','cooling','stable'].includes(i.momentum)?i.momentum:'unknown',
    evidence:Object.fromEntries(kinds.map(k=>[k,i.evidence?.[k]===true])),
    evidenceReceipts:Object.fromEntries(kinds.filter(k=>Array.isArray(i.evidenceReceipts?.[k])).map(k=>[k,strings(i.evidenceReceipts[k])])),receipts:strings(i.receipts),
    terms:{fee:number(i.terms?.fee),available:i.terms?.available===true,genre:text(i.terms?.genre,60)},
    culturalLinks:(i.culturalLinks??[]).slice(0,10).map(link=>({otherId:text(link.otherId),available:link.available===true,receiptId:text(link.receiptId),sharedTastes:strings(link.sharedTastes)}))}));
  const constraints=fields(original.constraints,['budget','slots','discoveryMin','maxPerGenre','riskTolerance','lockedIds','excludedIds','minimumAverageFit','festivalPolicy']);
  const snapshot={mock:source.mock===true,receipts,memo:{currency:['GBP','USD','EUR','INR'].includes(source.memo.currency)?source.memo.currency:'GBP',
    exampleBookingTerms:true,input:{city:text(source.memo.input?.city,100),anchors:strings(source.memo.input?.anchors),anchorIds:strings(source.memo.input?.anchorIds)},items,constraints}};
  snapshot.memo.slate=optimizeSlate(items,constraints);
  if(!sameSelection(original.selectedIds,snapshot.memo.slate.selectedIds)||original.score!==snapshot.memo.slate.score)throw fault('This source uses unsupported decision fields. Its public projection would change the result.');
  const benchmark=publicBenchmark(source,snapshot);
  if(benchmark){snapshot.benchmark=benchmark;snapshot.benchmarkTrial={index:1,reviewTrial:1};}
  return snapshot;
}
export function publishJudgeCase(source,title) {
  if(typeof title!=='string'||!title.trim()||title.length>120)throw fault('Provide a case title of 1–120 characters.');
  const snapshot=publicJudgeSnapshot(source),payload={version:'1.0',title:title.trim(),snapshot};
  const id=digest(payload).slice(0,24),existing=loadJudgeCase(id);if(existing)return existing;
  const record={id,...payload,createdAt:new Date().toISOString(),proof:buildDecisionProof(snapshot),
    terms:'Illustrative fees, availability and genres. This is a planning experiment, not a booking or sales prediction.',providerCalls:0};
  record.methods=judgeMethods(snapshot,record.proof);
  db.prepare('INSERT INTO judge_cases(id,body) VALUES(?,?)').run(id,JSON.stringify(record));return loadJudgeCase(id);
}
export function loadJudgeCase(id) {
  if(typeof id!=='string'||! /^[a-f0-9]{24}$/.test(id))return null;
  const row=db.prepare('SELECT body FROM judge_cases WHERE id=?').get(id);return row?JSON.parse(row.body):null;
}
export function listJudgeCases(){return db.prepare('SELECT body FROM judge_cases ORDER BY rowid').all().map(row=>JSON.parse(row.body));}
export function judgeExperiment(record,raw={},options={}) {
  const allowed=['budget','lockedIds','excludedIds','cancelId','withdrawReceiptId','feeIncreaseId','unavailableId'];
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!allowed.includes(k)))throw fault('Only budget, locks, exclusions, cancellation, a 15% fee increase, unavailability and receipt withdrawal can be changed.');
  const snapshot=structuredClone(record.snapshot),baseline=snapshot.memo.slate;
  const ids=new Set(snapshot.memo.items.map(i=>i.id));
  const shockedIds=new Set([...baseline.selectedIds,...(snapshot.benchmark?.control?.selectedIds??[])]);
  for(const key of ['lockedIds','excludedIds'])if(raw[key]!==undefined&&(!Array.isArray(raw[key])||raw[key].length>12||raw[key].some(id=>!ids.has(id))))throw fault('Locks and exclusions must refer to this case’s candidate pool.');
  if(raw.budget!==undefined&&(typeof raw.budget!=='number'||!Number.isFinite(raw.budget)||raw.budget<0||raw.budget>1e9))throw fault('Budget must be a number between 0 and 1,000,000,000.');
  for(const key of ['feeIncreaseId','unavailableId'])if(raw[key]!==undefined&&(!shockedIds.has(raw[key])||!ids.has(raw[key])||typeof raw[key]!=='string'))throw fault(`${key} must refer to an artist selected by a published arm.`);
  if(raw.feeIncreaseId!==undefined){
    const item=snapshot.memo.items.find(item=>item.id===raw.feeIncreaseId);
    if(typeof item.terms.fee!=='number'||!Number.isFinite(item.terms.fee))throw fault('A fee shock requires a known buyer-entered fee.');
    item.terms.fee=Math.round(item.terms.fee*115)/100;
  }
  if(raw.unavailableId!==undefined)snapshot.memo.items.find(item=>item.id===raw.unavailableId).terms.available=false;
  const constraints={...snapshot.memo.constraints,...fields(raw,['budget','lockedIds','excludedIds'])};
  let survivors=[];
  if(raw.cancelId!==undefined&&raw.cancelId!==null&&raw.cancelId!=='') {
    if(!shockedIds.has(raw.cancelId)||!ids.has(raw.cancelId))throw fault('Cancel an artist selected by a published arm.');
    survivors=baseline.selectedIds.filter(id=>id!==raw.cancelId);
    constraints.lockedIds=[...new Set([...constraints.lockedIds.filter(id=>id!==raw.cancelId),...survivors])];
    constraints.excludedIds=[...new Set([...constraints.excludedIds,raw.cancelId])];
  }
  const affectedIds=[];
  if(raw.withdrawReceiptId!==undefined&&raw.withdrawReceiptId!==null&&raw.withdrawReceiptId!=='') {
    const receiptId=raw.withdrawReceiptId;
    if(!snapshot.receipts.some(r=>r.id===receiptId))throw fault('Choose a receipt from this published case.');
    for(const item of snapshot.memo.items){
      const links=evidenceDependencies(snapshot,item);let changed=false;
      for(const kind of kinds)if(links[kind].receiptIds.includes(receiptId)){
        item.evidence[kind]=false;changed=true;
        if(kind==='rank'){item.fit=null;item.rank=null;}
        if(kind==='local')item.local='no data';
        if(kind==='trends')item.momentum='unknown';
      }
      const before=item.culturalLinks.length;item.culturalLinks=item.culturalLinks.filter(link=>link.receiptId!==receiptId);
      if(changed||before!==item.culturalLinks.length)affectedIds.push(item.id);
    }
    snapshot.receipts=snapshot.receipts.map(r=>r.id===receiptId?{...r,status:'withdrawn'}:r);
  }
  snapshot.memo.constraints=constraints;snapshot.memo.slate=optimizeSlate(snapshot.memo.items,constraints);
  if(snapshot.memo.slate.status==='invalid')throw fault(snapshot.memo.slate.reasons.join(' '));
  const result=snapshot.memo.slate,proof=options.lightweight===true?null:buildDecisionProof(snapshot);
  return {caseId:record.id,providerCalls:0,persisted:false,terms:record.terms,snapshot,proof,
    methods:proof?judgeMethods(snapshot,proof,record.snapshot):null,
    comparison:{changed:!sameSelection(baseline.selectedIds,result.selectedIds),addedIds:result.selectedIds.filter(id=>!baseline.selectedIds.includes(id)),removedIds:baseline.selectedIds.filter(id=>!result.selectedIds.includes(id)),
      feeDelta:result.feasible&&baseline.feasible?Math.round((result.totalFee-baseline.totalFee)*100)/100:null,
      survivorIds:survivors,survivorsPreserved:result.feasible?survivors.every(id=>result.selectedIds.includes(id)):null,affectedIds,
      interpretation:'Exact optimization within the saved pool under the declared policy. Evidence withdrawal measures dependence, not causal value. No approval or booking is created.'}};
}
export function registerJudgeRoutes(app) {
  const handle=fn=>(req,res)=>{try{fn(req,res);}catch(error){res.status(error.status??400).json({error:error.message});}};
  app.get('/api/judge/cases',(_req,res)=>res.json({cases:listJudgeCases().map(r=>({id:r.id,title:r.title,city:r.snapshot.memo.input.city,synthetic:r.snapshot.mock,currency:r.snapshot.memo.currency,createdAt:r.createdAt}))}));
  app.post('/api/judge/cases',handle((req,res)=>{
    const source=store.load(req.body?.sourceId);if(!source)throw fault('Saved source not found.',404);
    res.status(201).json(publishJudgeCase(source,req.body?.title));
  }));
  app.get('/api/judge/cases/:id',handle((req,res)=>{const record=loadJudgeCase(req.params.id);if(!record)throw fault('Published judge case not found.',404);res.json(record);}));
  app.delete('/api/judge/cases/:id',handle((req,res)=>{if(!loadJudgeCase(req.params.id))throw fault('Published judge case not found.',404);db.prepare('DELETE FROM judge_cases WHERE id=?').run(req.params.id);res.json({unpublished:true});}));
  app.post('/api/judge/cases/:id/experiment',handle((req,res)=>{
    const record=loadJudgeCase(req.params.id);if(!record)throw fault('Published judge case not found.',404);
    const minute=Math.floor(Date.now()/60000),address=digest(req.ip??'unknown');
    if(!consumeQuota([{key:`judge:${minute}:${address}`,limit:20,expires:(minute+1)*60000},{key:`judge-global:${minute}`,limit:60,expires:(minute+1)*60000}]))throw fault('Experiment limit reached. Wait a minute before another calculation.',429);
    res.json(judgeExperiment(record,req.body));
  }));
}
