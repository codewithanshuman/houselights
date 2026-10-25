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
const planReason='Check leading fit, discovered choices and affordable alternatives within the tool budget.';
const fixedStages=new Set([
  'Resolve · confirming artist identities',
  'Discover · mapping the room’s taste and adjacent artists',
  'Rank · testing the candidate pool against your anchors',
  'Plan · allocating the remaining evidence budget',
  'Optimize · checking every possible slate against your constraints',
  'Write · assembling the booking brief from verified claim IDs',
]);

function publicResearchText(source) {
  const city=source.memo.input?.city;
  const names=(source.memo.items??[]).map(item=>item.name).filter(name=>typeof name==='string');
  const identities=[...names,...(source.memo.input?.anchors??[])];
  const objectives=new Set([
    'Taste vocabulary associated with the anchor artists',
    'Discover adjacent artists for this city',
    'Relative audience fit for this candidate pool and city',
    'Observed trend direction over the last six months',
    ...identities.map(name=>`Confirm “${name}”`),
    ...names.flatMap(name=>[
      `Geographic popularity evidence for ${name} within ${city}`,
      `Compare ${name} and the anchor audience; no net-new percentage inferred`,
    ]),
  ]);
  const stages=new Set([...fixedStages,...names.map(name=>`Verify · local and audience context for ${name}`)]);
  return {objectives,stages,names:new Set(names)};
}

// A separate public record, never a raw source snapshot or private source document.
export function publicJudgeSnapshot(source) {
  if(source?.memo?.exampleBookingTerms!==true&&source?.input?.exampleBookingTerms!==true)throw fault('Judge cases require explicitly illustrative booking terms.');
  if(!Array.isArray(source.memo.items)||source.memo.items.length<2||source.memo.items.length>12)throw fault('Choose a saved pool of 2–12 candidates.');
  if(source.memo.items.some(item=>!item||typeof item!=='object'||
    (item.culturalLinks!=null&&(!Array.isArray(item.culturalLinks)||item.culturalLinks.some(link=>!link||typeof link!=='object'||Array.isArray(link))))))
    throw fault('The saved case contains malformed cultural links.');
  const original=optimizeSlate(source.memo.items,source.memo.constraints);
  if(original.status==='invalid')throw fault('Resolve invalid source constraints first.');
  const researchText=publicResearchText(source);
  const receipts=(source.receipts??[]).slice(0,250).map(r=>({id:text(r.id),tool:text(r.tool),status:text(r.status,30),
    source:r.source==='synthetic'?'synthetic':r.source==='qloo'?'qloo':'unknown',fetchedAt:text(r.fetchedAt,40),
    ...(typeof r.cached==='boolean'?{cached:r.cached}:{}),
    ...(researchText.objectives.has(r.why)?{why:text(r.why,200)}:{}),
    originalDigest:/^sha256:[a-f0-9]{64}$/.test(r.digest??r.originalDigest??'')?(r.digest??r.originalDigest):null,
    args:Object.fromEntries(['options','option_type','signals','signal_location','entity_id','entity_ids','location','type'].filter(key=>r.args?.[key]!==undefined).map(key=>[key,Array.isArray(r.args[key])?strings(r.args[key]):text(r.args[key])])),
    evidence:{kind:text(r.evidence?.kind),rows:(Array.isArray(r.evidence?.rows)?r.evidence.rows:[]).slice(0,100).map(row=>({id:text(row.id),name:text(row.name),affinity:number(row.affinity),popularity:number(row.popularity)}))},
    projection:'Public query and row projection. Original digest identifies the saved source receipt, not this reduced object.'}));
  const receiptIds=new Set(receipts.map(receipt=>receipt.id));
  const eventTypes=new Set(['start','stage','receipt','plan','needs_input','memo']);
  // Older saved scenarios may have inherited the parent's research log.
  // It is not execution evidence for their changed booking decision.
  const trace=(!source.scenario&&!source.investigationDecision&&Array.isArray(source.trace)?source.trace:[]).slice(0,100)
    .filter(event=>event&&typeof event==='object'&&eventTypes.has(event.type)&&Number.isInteger(event.elapsedMs)&&event.elapsedMs>=0)
    .map(event=>({type:event.type,elapsedMs:event.elapsedMs,
      receiptId:receiptIds.has(event.receiptId)?event.receiptId:null,
      ...(event.type==='stage'&&researchText.stages.has(event.text)?{text:event.text}:{}),
      ...(event.type==='plan'?{
        ...(event.text===planReason?{text:planReason}:{}),
        ...(['llm','rules'].includes(event.by)?{by:event.by}:{}),
        ...(Array.isArray(event.deep)?{deep:strings(event.deep).filter(name=>researchText.names.has(name)).slice(0,4)}:{}),
      }:{}),
      feasible:event.type==='memo'?event.feasible===true:undefined}));
  const linked=trace.filter(event=>event.type==='receipt'&&event.receiptId).map(event=>event.receiptId);
  const complete=trace.length>0&&trace[0].type==='start'&&trace.at(-1).type==='memo'&&
    linked.length===receipts.length&&new Set(linked).size===receipts.length&&linked.every(id=>receiptIds.has(id))&&
    trace.every((event,index)=>index===0||event.elapsedMs>=trace[index-1].elapsedMs);
  const items=preserveRankProvenance(source).map(i=>({id:text(i.id),name:text(i.name),found:i.found===true,
    fit:number(i.fit),rank:number(i.rank),of:number(i.of),identityReceipt:text(i.identityReceipt),
    rankCoverage:i.rankCoverage?{complete:i.rankCoverage.complete===true,returned:number(i.rankCoverage.returned),requested:number(i.rankCoverage.requested)}:undefined,
    local:['yes','no','no data'].includes(i.local)?i.local:'no data',momentum:['rising','cooling','stable'].includes(i.momentum)?i.momentum:'unknown',
    evidence:Object.fromEntries(kinds.map(k=>[k,i.evidence?.[k]===true])),
    evidenceReceipts:Object.fromEntries(kinds.filter(k=>Array.isArray(i.evidenceReceipts?.[k])).map(k=>[k,strings(i.evidenceReceipts[k])])),receipts:strings(i.receipts),
    terms:{fee:number(i.terms?.fee),available:i.terms?.available===true,genre:text(i.terms?.genre,60)},
    culturalLinks:(i.culturalLinks??[]).slice(0,10).map(link=>({otherId:text(link.otherId),available:link.available===true,receiptId:text(link.receiptId),sharedTastes:strings(link.sharedTastes)}))}));
  const constraints=fields(original.constraints,['budget','slots','discoveryMin','maxPerGenre','riskTolerance','lockedIds','excludedIds','minimumAverageFit','festivalPolicy']);
  const snapshot={mock:source.mock===true,receipts,...(trace.length?{trace,traceMeta:{complete,linkedReceipts:linked.length,totalReceipts:receipts.length}}:{}),memo:{currency:['GBP','USD','EUR','INR'].includes(source.memo.currency)?source.memo.currency:'GBP',
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
  const allowed=['budget','lockedIds','excludedIds','cancelId','withdrawReceiptId','feeIncreaseId','unavailableId','qlooOff'];
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!allowed.includes(k)))throw fault('Only budget, locks, exclusions, cancellation, a 15% fee increase, unavailability and receipt withdrawal can be changed.');
  const snapshot=structuredClone(record.snapshot),baseline=snapshot.memo.slate;
  const ids=new Set(snapshot.memo.items.map(i=>i.id));
  const shockedIds=new Set([...baseline.selectedIds,...(snapshot.benchmark?.control?.selectedIds??[])]);
  for(const key of ['lockedIds','excludedIds'])if(raw[key]!==undefined&&(!Array.isArray(raw[key])||raw[key].length>12||raw[key].some(id=>!ids.has(id))))throw fault('Locks and exclusions must refer to this case’s candidate pool.');
  if(raw.budget!==undefined&&(typeof raw.budget!=='number'||!Number.isFinite(raw.budget)||raw.budget<0||raw.budget>1e9))throw fault('Budget must be a number between 0 and 1,000,000,000.');
  if(raw.qlooOff!==undefined&&typeof raw.qlooOff!=='boolean')throw fault('Qloo evidence toggle must be a boolean.');
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
  if(raw.qlooOff===true){
    for(const item of snapshot.memo.items){
      for(const kind of kinds)item.evidence[kind]=false;
      item.fit=null;item.rank=null;item.local='no data';item.momentum='unknown';item.culturalLinks=[];
      if(!affectedIds.includes(item.id))affectedIds.push(item.id);
    }
    snapshot.receipts=snapshot.receipts.map(r=>r.source==='qloo'||r.source==='synthetic'?{...r,status:'withdrawn'}:r);
  }
  snapshot.memo.constraints=constraints;snapshot.memo.slate=optimizeSlate(snapshot.memo.items,constraints);
  if(snapshot.memo.slate.status==='invalid')throw fault(snapshot.memo.slate.reasons.join(' '));
  const result=snapshot.memo.slate,proof=options.lightweight===true?null:buildDecisionProof(snapshot);
  const matchedEvidenceWithdrawal=raw.qlooOff===true&&
    JSON.stringify(constraints)===JSON.stringify(record.snapshot.memo.constraints)&&
    snapshot.memo.items.every((item,index)=>JSON.stringify(item.terms)===JSON.stringify(record.snapshot.memo.items[index].terms))&&
    !raw.cancelId&&!raw.unavailableId&&!raw.feeIncreaseId&&!raw.withdrawReceiptId;
  return {caseId:record.id,providerCalls:0,persisted:false,terms:record.terms,qlooOff:raw.qlooOff===true,snapshot,proof,
    methods:proof?judgeMethods(snapshot,proof,record.snapshot):null,
    comparison:{changed:!sameSelection(baseline.selectedIds,result.selectedIds),addedIds:result.selectedIds.filter(id=>!baseline.selectedIds.includes(id)),removedIds:baseline.selectedIds.filter(id=>!result.selectedIds.includes(id)),
      matchedEvidenceWithdrawal,
      feeDelta:result.feasible&&baseline.feasible?Math.round((result.totalFee-baseline.totalFee)*100)/100:null,
      survivorIds:survivors,survivorsPreserved:result.feasible?survivors.every(id=>result.selectedIds.includes(id)):null,affectedIds,
      interpretation:'Exact optimization within the saved pool under the declared policy. Evidence withdrawal measures dependence, not causal value. No approval or booking is created.'}};
}
// Experiments are deterministic (saved evidence, zero provider calls), so identical
// requests reuse a stored result. Quotas still apply first; any publish or unpublish
// clears the cache.
const experimentCache=new Map(),EXPERIMENT_CACHE_MAX=300;
const sortedJson=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function registerJudgeRoutes(app) {
  const handle=fn=>(req,res)=>{try{fn(req,res);}catch(error){
    if(Number.isInteger(error?.status)&&error.status>=400&&error.status<500)return res.status(error.status).json({error:error.message});
    console.error('Unexpected judge request failure:',error);
    return res.status(500).json({error:'The request could not be completed.'});
  }};
  app.get('/api/judge/cases',(_req,res)=>res.json({cases:listJudgeCases().map(r=>({id:r.id,title:r.title,city:r.snapshot.memo.input.city,synthetic:r.snapshot.mock,
    recordedTrace:r.snapshot.traceMeta?.complete===true,currency:r.snapshot.memo.currency,createdAt:r.createdAt}))}));
  app.post('/api/judge/cases',handle((req,res)=>{
    const source=store.load(req.body?.sourceId);if(!source)throw fault('Saved source not found.',404);
    experimentCache.clear();res.status(201).json(publishJudgeCase(source,req.body?.title));
  }));
  app.get('/api/judge/cases/:id',handle((req,res)=>{const record=loadJudgeCase(req.params.id);if(!record)throw fault('Published judge case not found.',404);res.json(record);}));
  app.delete('/api/judge/cases/:id',handle((req,res)=>{if(!loadJudgeCase(req.params.id))throw fault('Published judge case not found.',404);db.prepare('DELETE FROM judge_cases WHERE id=?').run(req.params.id);experimentCache.clear();res.json({unpublished:true});}));
  app.post('/api/judge/cases/:id/experiment',handle((req,res)=>{
    const record=loadJudgeCase(req.params.id);if(!record)throw fault('Published judge case not found.',404);
    const minute=Math.floor(Date.now()/60000),address=digest(req.ip??'unknown');
    const limited=()=>fault('Experiment limit reached. Wait a minute before another calculation.',429);
    if(!consumeQuota([{key:`judge:${minute}:${address}`,limit:20,expires:(minute+1)*60000}]))throw limited();
    const key=sortedJson([req.params.id,record.createdAt??null,req.body??{}]);
    let result=experimentCache.get(key);
    if(result){res.set('X-Cache','hit');}
    // The global cap protects the CPU, so only new calculations count; cached answers cost nothing.
    else if(!consumeQuota([{key:`judge-global:${minute}`,limit:60,expires:(minute+1)*60000}]))throw limited();
    else{result=judgeExperiment(record,req.body);if(experimentCache.size>=EXPERIMENT_CACHE_MAX)experimentCache.delete(experimentCache.keys().next().value);experimentCache.set(key,result);res.set('X-Cache','miss');}
    res.json(result);
  }));
}
