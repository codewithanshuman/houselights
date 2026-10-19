import {createHash} from 'node:crypto';
import {benchmarkBrief,withoutDerived} from './gm.mjs';
import {optimizeSlate} from './optimizer.mjs';
import {rankPool} from './festival-research.mjs';
const digest=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function rankOfferedEvaluationPool(source,run){
  const pool=source.memo.items.filter(item=>!item.found);
  if(pool.length<2||pool.length>6)throw new Error('A fixed evaluation pool requires 2–6 resolved offered artists.');
  if(!source.memo.input?.anchorIds?.length)throw new Error('Resolved audience anchors are required before ranking the fixed pool.');
  const call=await run.call('rank',{options:pool.map(item=>item.id),option_type:'artist',signals:source.memo.input.anchorIds,signal_location:source.memo.input.city},'Predeclared offered-only evaluation pool; no benchmark outcomes used to choose candidates');
  if(run.receipts.some(receipt=>source.receipts.some(old=>old.id===receipt.id)))throw new Error('Evaluation receipts must use a fresh namespace.');
  const rank=rankPool(call,pool);
  const items=pool.map(item=>{
    const row=rank.rows.find(row=>row.id===item.id);
    const claim={id:`${item.id}:rank`,text:rank.complete?`Ranks ${row.rank} of ${pool.length} in this fixed offered pool [${rank.receiptId}].`:`Full-pool rank is unavailable [${rank.receiptId}].`};
    const claims=[claim,...(item.claims??[]).filter(c=>c.id!==claim.id)];
    return {...item,rank:rank.complete?row.rank:null,of:pool.length,fit:row.utility,
      rankCoverage:{complete:rank.complete,returned:rank.returned,requested:rank.requested},verdict:!rank.complete?'hold':row.utility>=.6?'lean yes':row.utility<.3?'lean pass':'hold',
      evidence:{...item.evidence,rank:rank.complete},evidenceReceipts:{...item.evidenceReceipts,rank:[rank.receiptId]},receipts:[...item.receipts,rank.receiptId],claims,note:claims.map(c=>c.text).join(' ')};
  });
  return {...withoutDerived(source),id:undefined,createdAt:undefined,parentId:source.id,
    input:{...source.input,fixedOfferedPool:true},receipts:[...source.receipts,...run.receipts],
    poolRestriction:{reason:'Fixed offered-only evaluation pool declared before control generation.',excludedIds:source.memo.items.filter(item=>item.found).map(item=>item.id)},
    memo:{...source.memo,items,slate:optimizeSlate(items,source.memo.constraints),base:null,eval:null,
      summary:'Offered-only evaluation pool re-ranked before controls; fees and availability remain illustrative.',
      quality:{...source.memo.quality,resolved:items.length,ranked:rank.complete?items.length:0,receipts:source.receipts.length+run.receipts.length},
      caveats:[...source.memo.caveats,'Evaluation deliberately restricts choices to offered artists; this does not measure discovery value.']}};
}
export function evaluationPlan(sources,trials){
  if(!Array.isArray(sources)||sources.length<2||sources.length>20||!Number.isInteger(trials)||trials<1||trials>5)throw new Error('Choose 2–20 briefs and 1–5 trials.');
  const cases=sources.map(source=>{
    const slate=optimizeSlate(source.memo.items,source.memo.constraints);
    if(slate.status==='invalid')throw new Error('Invalid booking constraints.');
    const brief=benchmarkBrief(source,slate.constraints),poolIds=brief.candidates.map(c=>c.id).sort();
    return {sourceId:source.id,briefDigest:digest(brief),poolDigest:digest(poolIds),poolIds,city:brief.city,currency:brief.currency,
      budget:brief.constraints.budget,slots:brief.constraints.slots,candidateCount:poolIds.length,
      synthetic:source.mock===true,illustrativeTerms:source.memo.exampleBookingTerms===true||source.input?.exampleBookingTerms===true,
      rankCoverage:source.memo.items.filter(i=>i.evidence?.rank===true).length/poolIds.length};
  });
  if(new Set(cases.map(c=>c.sourceId)).size!==cases.length||new Set(cases.map(c=>c.briefDigest)).size!==cases.length)throw new Error('Duplicate sources or booking briefs cannot count as distinct evaluation cases.');
  const overlaps=[];
  for(let a=0;a<cases.length;a++)for(let b=a+1;b<cases.length;b++){
    const x=cases[a],y=cases[b],common=x.poolIds.filter(id=>y.poolIds.includes(id)).length;
    overlaps.push({sourceIds:[x.sourceId,y.sourceId],sharedCandidates:common,jaccard:common/new Set([...x.poolIds,...y.poolIds]).size});
  }
  return {version:'1.0',trials,cases,digest:digest({trials,cases}),coverage:{briefs:cases.length,cities:new Set(cases.map(c=>c.city)).size,
    distinctPools:new Set(cases.map(c=>c.poolDigest)).size,currencies:[...new Set(cases.map(c=>c.currency))],
    syntheticBriefs:cases.filter(c=>c.synthetic).length,illustrativeBriefs:cases.filter(c=>c.illustrativeTerms).length,poolOverlaps:overlaps},
    interpretation:'Predeclared integration coverage. Different briefs or currencies do not establish independent samples or commercial superiority.'};
}
export function evaluationSummary(plan,batches){
  const cases=plan.cases.map(c=>{
    const batch=batches.find(b=>b.sourceId===c.sourceId),trials=batch?.trials??[];
    return {sourceId:c.sourceId,city:c.city,planned:plan.trials,attempted:trials.length,feasible:trials.filter(t=>t.status==='compared').length,
      providerCalls:trials.filter(t=>t.benchmark?.generation?.mode==='live').length,notComparable:trials.filter(t=>t.status==='not_comparable').length,
      failed:trials.filter(t=>t.status!=='compared').length,notAttempted:Math.max(0,plan.trials-trials.length),
      distinctControls:new Set(trials.filter(t=>t.status==='compared').map(t=>[...t.benchmark.control.selectedIds].sort().join('|'))).size,
      identicalSelections:trials.filter(t=>t.status==='compared'&&[...t.benchmark.control.selectedIds].sort().join('|')===[...t.benchmark.qloo.selectedIds].sort().join('|')).length,
      reviewEligible:trials[0]?.status==='compared',status:batch?.status??'not_started'};
  });
  const totals=Object.fromEntries(['planned','attempted','providerCalls','notComparable','feasible','failed','notAttempted','identicalSelections'].map(key=>[key,cases.reduce((sum,row)=>sum+row[key],0)]));
  return {cases,totals,execution:totals.notAttempted?'partial':'complete',independentEvidence:false,
    interpretation:'Feasibility and selection agreement describe execution. Qloo-weighted scores do not prove superiority. Real blind judgments and outcomes are separate evidence.'};
}
