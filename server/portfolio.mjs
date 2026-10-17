import { createHash } from 'node:crypto';
import { enumerateSlates, optimizeSlate } from './optimizer.mjs';
import { firstFreeSlot } from './resource-schedule.mjs';
import { decisionFingerprint, evidenceDependencies } from './decision-proof.mjs';

const cents = value => Math.round((value + Number.EPSILON) * 100);
const amount = value => value / 100;
const key = ids => JSON.stringify([...ids].sort());
const hash = value => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
const money = (value, field) => {
  if(typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e9) throw new Error(field+' must be between 0 and 1000000000.');
  return cents(value);
};
const integer = (value,min,max,field) => { if(!Number.isInteger(value)||value<min||value>max)throw new Error(field+` must be ${min}–${max}.`);return value; };
function timestamp(value) {
  if(typeof value !== 'string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value))) throw new Error('Event times need an ISO timestamp with a timezone.');
  if(new Date(value.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==value.slice(0,10))throw new Error('Invalid event date.');
  return Date.parse(value);
}
export function normalizePortfolio(raw, load) {
  if(!Array.isArray(raw?.events)||raw.events.length<2||raw.events.length>6)throw new Error('Choose 2–6 events.');
  const budget=money(raw.budget,'Portfolio budget'), maxBookings=integer(raw.maxBookingsPerArtist??1,1,6,'Maximum bookings per artist');
  const restHours=integer(raw.restHours??24,0,720,'Rest hours');
  const events=raw.events.map((event,index)=>{
    const snapshot=load(event.sourceId,event.id??`event-${index+1}`);
    if(!snapshot?.memo?.items)throw new Error('Every event must use a saved candidate pool.');
    const start=timestamp(event.start),end=timestamp(event.end);
    if(end<=start||end-start>7*864e5)throw new Error('Events must last more than zero and at most seven days.');
    const id=String(event.id??`event-${index+1}`);
    if(!/^[\w-]{1,40}$/.test(id))throw new Error('Event IDs must use 1–40 letters, digits, underscores or hyphens.');
    const resource=typeof event.resource==='string'?event.resource.trim():'';
    if(!resource||resource.length>120)throw new Error('Name the venue or shared resource for every event.');
    const fixedCost=money(event.fixedCost??0,'Event fixed cost');
    const depositPercent=integer(event.depositPercent??50,0,100,'Deposit percentage');
    const depositAt=timestamp(event.depositAt??event.start);
    if(depositAt>start)throw new Error('Deposit date must not follow the event start.');
    const weight=integer(event.weight??1,1,5,'Event priority weight');
    return {id,sourceId:event.sourceId,name:String(event.name||`Event ${index+1}`).slice(0,120),resource,start,end,fixedCost,depositPercent,depositAt,weight,snapshot};
  });
  if(new Set(events.map(e=>e.id)).size!==events.length)throw new Error('Event IDs must be unique.');
  const currencies=new Set(events.map(e=>e.snapshot.memo.currency));
  if(currencies.size!==1||!['GBP','USD','EUR','INR'].includes([...currencies][0]))throw new Error('All events must use the same supported currency; no exchange rates are assumed.');
  const cashLimits=(raw.cashLimits??[]);
  if(!Array.isArray(cashLimits)||cashLimits.length>12)throw new Error('Use at most 12 cash checkpoints.');
  return {budget,maxBookings,restHours,currency:[...currencies][0],events,cashLimits:cashLimits.map(row=>({at:timestamp(row.at),available:money(row.available,'Available cash')}))};
}
function payments(event,row) {
  const fee=cents(row.totalFee), deposit=Math.round(fee*event.depositPercent/100);
  return [{eventId:event.id,kind:'artist_deposit',at:event.depositAt,cents:deposit},{eventId:event.id,kind:'artist_balance',at:event.start,cents:fee-deposit},{eventId:event.id,kind:'fixed_cost',at:event.start,cents:event.fixedCost}];
}
function clashes(events) {
  const result=[];
  for(let i=0;i<events.length;i++)for(let j=i+1;j<events.length;j++){
    const a=events[i],b=events[j];
    if(a.resource.toLowerCase()===b.resource.toLowerCase()&&a.start<b.end&&b.start<a.end){
      const suggestion=firstFreeSlot(events.filter(e=>e.id!==b.id&&e.resource.toLowerCase()===b.resource.toLowerCase()).map(e=>({start:new Date(e.start).toISOString(),end:new Date(e.end).toISOString()})),b.start,b.end-b.start);
      result.push({code:'resource_overlap',eventIds:[a.id,b.id],resource:a.resource,suggestedSlot:suggestion,note:'A gap in the supplied schedule only. Artist and venue availability for a shifted event must be checked separately.'});
    }
  }
  return result;
}
export function optimizePortfolio(raw, load, {maxNodes=250000}={}) {
  const input=normalizePortfolio(raw,load), {events}=input;
  const conflicts=clashes(events);
  const options=events.map(event=>enumerateSlates(event.snapshot.memo.items,event.snapshot.memo.constraints).filter(row=>row.feasible)
    .sort((a,b)=>b.rawScore-a.rawScore||a.totalFee-b.totalFee||(key(a.selectedIds)<key(b.selectedIds)?-1:1)));
  const invalid=events.filter((_,i)=>!options[i].length).map(event=>({code:'event_infeasible',eventIds:[event.id]}));
  const ledger=(rows)=>rows.flatMap((row,i)=>payments(events[i],row));
  function violations(rows) {
    const issues=[], fees=rows.reduce((sum,row,i)=>sum+cents(row.totalFee)+events[i].fixedCost,0);
    if(fees>input.budget)issues.push({code:'portfolio_budget',excess:amount(fees-input.budget)});
    const booked=new Map();
    rows.forEach((row,i)=>row.selectedIds.forEach(id=>booked.set(id,[...(booked.get(id)??[]),i])));
    for(const [artistId,indexes] of booked){
      if(indexes.length>input.maxBookings)issues.push({code:'artist_reuse',artistId,eventIds:indexes.map(i=>events[i].id)});
      for(let a=0;a<indexes.length;a++)for(let b=a+1;b<indexes.length;b++){
        const x=events[indexes[a]],y=events[indexes[b]],rest=input.restHours*36e5;
        if(x.start<y.end+rest&&y.start<x.end+rest)issues.push({code:'artist_rest_or_overlap',artistId,eventIds:[x.id,y.id]});
      }
    }
    const entries=ledger(rows);
    for(const checkpoint of input.cashLimits){const due=entries.filter(e=>e.at<=checkpoint.at).reduce((s,e)=>s+e.cents,0);if(due>checkpoint.available)issues.push({code:'cash_checkpoint',at:new Date(checkpoint.at).toISOString(),shortfall:amount(due-checkpoint.available)});}
    return issues;
  }
  const independent=events.map(event=>optimizeSlate(event.snapshot.memo.items,event.snapshot.memo.constraints));
  const independentViolations=[...conflicts,...invalid,...violations(independent)];
  let best=null,visitedNodes=0,examinedExtensions=0,limited=false,prunedBudget=0,prunedBound=0;
  const rejects={};
  const suffixCost=Array(events.length+1).fill(0),suffixScore=Array(events.length+1).fill(0);
  for(let i=events.length-1;i>=0;i--){suffixCost[i]=suffixCost[i+1]+(options[i].length?Math.min(...options[i].map(r=>cents(r.totalFee))):Infinity)+events[i].fixedCost;suffixScore[i]=suffixScore[i+1]+(options[i][0]?.rawScore??0)*events[i].weight;}
  function visit(rows,cost,score){
    if(visitedNodes>=maxNodes){limited=true;return;}visitedNodes++;
    const depth=rows.length;
    if(cost+suffixCost[depth]>input.budget){prunedBudget++;return;}
    if(best&&score+suffixScore[depth]<best.score-1e-9){prunedBound++;return;}
    if(depth===events.length){
      const id=rows.map(r=>key(r.selectedIds)).join(';');
      if(!best||score>best.score+1e-9||Math.abs(score-best.score)<=1e-9&&(cost<best.cost||cost===best.cost&&id<best.key))best={rows,cost,score,key:id};
      return;
    }
    for(const row of options[depth]){
      if(examinedExtensions>=maxNodes){limited=true;return;}examinedExtensions++;
      const next=[...rows,row],issues=violations(next);
      if(issues.length){issues.forEach(issue=>rejects[issue.code]=(rejects[issue.code]??0)+1);continue;}
      visit(next,cost+cents(row.totalFee)+events[depth].fixedCost,score+row.rawScore*events[depth].weight);
      if(limited)return;
    }
  }
  if(!conflicts.length&&!invalid.length)visit([],0,0);
  const sourceDigests=events.map(e=>({eventId:e.id,sourceId:e.sourceId,digest:decisionFingerprint(e.snapshot)}));
  const eventResults=best?.rows.map((row,i)=>({eventId:events[i].id,sourceId:events[i].sourceId,name:events[i].name,city:events[i].snapshot.memo.input?.city,
    start:new Date(events[i].start).toISOString(),end:new Date(events[i].end).toISOString(),resource:events[i].resource,selectedIds:row.selectedIds,
    artists:row.selectedIds.map(id=>{const item=events[i].snapshot.memo.items.find(item=>item.id===id);return {id,name:item.name,fee:item.terms.fee,receiptIds:item.receipts??[],rankSupported:item.evidence?.rank===true};}),
    bookingCost:row.totalFee,fixedCost:amount(events[i].fixedCost),score:row.score,weight:events[i].weight,changedFromIndependent:key(row.selectedIds)!==key(independent[i].selectedIds)}))??[];
  const entries=best?ledger(best.rows).sort((a,b)=>a.at-b.at||a.eventId.localeCompare(b.eventId)):[];
  let cumulative=0;
  const paymentSchedule=entries.map(entry=>({eventId:entry.eventId,kind:entry.kind,at:new Date(entry.at).toISOString(),amount:amount(entry.cents),cumulative:amount(cumulative+=entry.cents),status:'planned_not_paid'}));
  const evidenceChecks=eventResults.flatMap(row=>row.selectedIds.map(id=>{
    const source=events.find(event=>event.id===row.eventId).snapshot,item=source.memo.items.find(item=>item.id===id),rank=evidenceDependencies(source,item).rank;
    const supported=item.evidence?.rank===true&&Number.isFinite(item.fit)&&item.fit>=0&&item.fit<=1&&rank.mapping==='linked'&&rank.receiptIds.every(receiptId=>source.receipts?.some(receipt=>receipt.id===receiptId&&['ok','partial','degraded'].includes(receipt.status)));
    return {eventId:row.eventId,artistId:id,supported,receiptIds:rank.receiptIds,synthetic:source.mock===true||source.memo.mode==='mock'||source.receipts?.some(receipt=>receipt.source==='synthetic')===true};
  }));
  const deterministicPass=!!best&&!limited,evidencePass=evidenceChecks.length>0&&evidenceChecks.every(check=>check.supported&&!check.synthetic);
  return {version:'1.0',status:limited?'search_limit':best?'optimal':'infeasible',feasible:!!best,certifiedOptimal:!!best&&!limited,
    currency:input.currency,totalCost:best?amount(best.cost):null,remainingBudget:best?amount(input.budget-best.cost):null,objective:best?.score??null,
    events:eventResults,paymentSchedule,sourceDigests,inputDigest:hash({raw,sourceDigests}),
    readiness:{status:!deterministicPass?'blocked':!evidencePass?'evidence_required':'ready_for_organizer_review',deterministicPass,evidencePass,evidenceChecks,
      basis:'Independent deterministic and provenance checks must both pass before organizer review. No automatic booking or payment authority is granted.'},
    search:{visitedNodes,examinedExtensions,maxNodes,maxExtensions:maxNodes,prunedBudget,prunedBound,rejectedExtensions:rejects,combinationProduct:options.reduce((n,rows)=>n*rows.length,1),upperBound:limited?suffixScore[0]:best?.score??null},
    independent:{feasible:independentViolations.length===0,violations:independentViolations,eventSelections:independent.map((row,i)=>({eventId:events[i].id,selectedIds:row.selectedIds,totalFee:row.totalFee}))},
    diagnostics:[...conflicts,...invalid,...(!best&&!conflicts.length&&!invalid.length?[{code:limited?'search_incomplete':'joint_constraints',message:limited?'The bounded search ended without a feasible solution; infeasibility is not established.':'No combination satisfies the shared budget, cash, artist reuse and rest constraints.'}]:[])],
    assumptions:{budget:amount(input.budget),maxBookingsPerArtist:input.maxBookings,restHours:input.restHours,eventWeights:events.map(e=>({eventId:e.id,weight:e.weight})),cashLimits:input.cashLimits.map(c=>({at:new Date(c.at).toISOString(),available:amount(c.available)}))},
    limitations:['Policy points from different event contexts are aggregated using explicit organizer weights; they are not a calibrated cross-market demand measure.','Fees, timing, resources, deposits and availability are organizer assumptions; no holds, contracts or payments are executed.','Rest hours are a buyer rule, not a verified travel-time estimate.','Cash checkpoints limit cumulative gross outflows; no ticket income, refunds or credit are assumed.','Optimal means optimal within these saved bounded pools and declared rules, only when certifiedOptimal is true.']};
}
