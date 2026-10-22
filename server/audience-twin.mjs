import { randomBytes } from 'node:crypto';
import { db } from './database.mjs';
import { Run, isMock } from './qloo.mjs';
import { idOf, nameOf } from './shape.mjs';

const clamp=(value,low=0,high=1)=>Math.max(low,Math.min(high,value));
const round=value=>Math.round(value*10000)/10000;
const finite=(value,low,high)=>typeof value==='number'&&Number.isFinite(value)&&value>=low&&value<=high;
const ids=value=>Array.isArray(value)?value.map(String):[];
const key=value=>String(value||'').trim().toLowerCase();

export function validateTwinSeeds(raw,source,input) {
  if(!source?.memo?.items?.length)throw new Error('A saved Qloo source run is required for audience research.');
  if(source.memo.input.city.toLowerCase()!==input.brief.city.toLowerCase())throw new Error('Audience source city must match the event city.');
  const known=new Set([...source.memo.items.map(item=>item.id),...(source.memo.input.anchorIds||[])]);
  const seeds=raw?.segmentSeeds;
  if(!Array.isArray(seeds)||seeds.length<2||seeds.length>5)throw new Error('Provide 2–5 audience taste-seed hypotheses.');
  const labels=new Set();
  const normalized=seeds.map((row,index)=>{
    const label=String(row?.label||'').trim(),anchors=[...new Set(ids(row?.anchorIds))];
    if(!label||label.length>60||labels.has(key(label)))throw new Error(`Taste seed ${index+1} needs a unique label of at most 60 characters.`);
    labels.add(key(label));
    if(anchors.length<1||anchors.length>3||anchors.some(id=>!known.has(id)))throw new Error(`Taste seed ${label} needs 1–3 artist IDs from the saved Qloo source.`);
    if(!finite(row.weight,0.000001,1)||!finite(row.baseIntent,0,1)||!finite(row.priceElasticity,-5,0)||!finite(row.competitionLoss,0,1))
      throw new Error(`Taste seed ${label} needs weight, base intent, price elasticity and per-competing-event loss within documented ranges.`);
    return {label,anchorIds:anchors,weight:row.weight,baseIntent:row.baseIntent,priceElasticity:row.priceElasticity,competitionLoss:row.competitionLoss};
  });
  const total=normalized.reduce((sum,row)=>sum+row.weight,0);
  if(Math.abs(total-1)>.001)throw new Error('Taste-seed population weights must sum to 1.');
  if(!Number.isInteger(raw.audiencePool)||raw.audiencePool<1||raw.audiencePool>10000000)throw new Error('Enter an assumed reachable audience pool from 1 to 10,000,000.');
  if(!finite(raw.overlapAssumption,0,1))throw new Error('Overlap assumption must be between 0 and 1.');
  return {seeds,audiencePool:raw.audiencePool,overlapAssumption:raw.overlapAssumption};
}

const distance=(a,b)=>Math.sqrt(a.reduce((sum,value,index)=>sum+(value-b[index])**2,0)/a.length);
export function clusterRankProfiles(profiles) {
  // Complete-link clustering prevents a chain of dissimilar seeds merging.
  const clusters=profiles.map((profile,index)=>[index]);
  while(clusters.length>1){
    let best=null;
    for(let a=0;a<clusters.length;a++)for(let b=a+1;b<clusters.length;b++){
      const largest=Math.max(...clusters[a].flatMap(i=>clusters[b].map(j=>distance(profiles[i].vector,profiles[j].vector))));
      if(largest<=.18&&(best==null||largest<best.distance-1e-12))best={a,b,distance:largest};
    }
    if(!best)break;
    clusters[best.a].push(...clusters[best.b]);clusters.splice(best.b,1);
  }
  return clusters.map((members,index)=>{
    const rows=members.map(i=>profiles[i]),weight=rows.reduce((sum,row)=>sum+row.weight,0);
    return {id:`segment-${index+1}`,labels:rows.map(row=>row.label),weight:round(weight),
      baseIntent:round(rows.reduce((sum,row)=>sum+row.baseIntent*row.weight,0)/weight),
      priceElasticity:round(rows.reduce((sum,row)=>sum+row.priceElasticity*row.weight,0)/weight),
      competitionLoss:round(rows.reduce((sum,row)=>sum+row.competitionLoss*row.weight,0)/weight),
      affinity:Object.fromEntries(profiles[0].candidateIds.map((id,i)=>[id,round(rows.reduce((sum,row)=>sum+row.vector[i]*row.weight,0)/weight)])),
      receiptIds:rows.map(row=>row.receiptId),kind:'synthetic_profile_cluster'};
  });
}

export async function researchAudienceTwin(raw,source,input,{run}={}) {
  const checked=validateTwinSeeds(raw,source,input),candidateIds=input.candidates.map(item=>item.id);
  const workflow=run||new Run({budget:checked.seeds.length*3,receiptPrefix:'at',mode:isMock()?'mock':'live',deadlineMs:90000});
  const profiles=[];
  for(const seed of checked.seeds){
    const {env,receipt}=await workflow.call('rank',{options:candidateIds,option_type:'artist',signals:seed.anchorIds,signal_location:input.brief.city},`Relative artist ordering for synthetic taste seed ${seed.label}`);
    const ranked=(env.status==='ok'&&receipt.status==='ok')?env.results.map(row=>candidateIds.find(id=>key(id)===key(idOf(row)))||
      input.candidates.find(candidate=>key(candidate.name)===key(nameOf(row)))?.id).filter(Boolean):[];
    if(new Set(ranked).size!==candidateIds.length||ranked.length!==candidateIds.length){
      return {status:'insufficient_qloo_evidence',reason:`A complete comparable Qloo ranking was unavailable for ${seed.label}. No audience twin was saved.`,
        receipts:workflow.receipts,completedSeeds:profiles.length,synthetic:source.mock===true};
    }
    profiles.push({...seed,candidateIds,vector:candidateIds.map(id=>ranked.length===1?.5:1-ranked.indexOf(id)/(ranked.length-1)),receiptId:receipt.id});
  }
  const segments=clusterRankProfiles(profiles),createdAt=new Date().toISOString();
  const twin={id:randomBytes(12).toString('hex'),createdAt,status:'scenario_ready',city:input.brief.city,sourceId:source.id,
    candidateIds,audiencePool:checked.audiencePool,overlapAssumption:checked.overlapAssumption,segments,
    originalSeedCount:profiles.length,clusterCount:segments.length,receipts:workflow.receipts,synthetic:source.mock===true,
    interpretation:'Clusters group organizer-defined taste seeds by Qloo relative rank patterns for one fixed artist pool. Segment sizes and purchase parameters are organizer hypotheses, not Qloo demographics or real customer records.'};
  db.prepare('INSERT INTO audience_twins(id,body,created_at) VALUES(?,?,?)').run(twin.id,JSON.stringify(twin),createdAt);
  return twin;
}
export function loadAudienceTwin(id){
  if(!/^[a-f0-9]{24}$/.test(String(id||'')))return null;
  const row=db.prepare('SELECT body FROM audience_twins WHERE id=?').get(id);
  return row?JSON.parse(row.body):null;
}
export function assertTwinCompatible(twin,input){
  if(!twin||twin.status!=='scenario_ready'||twin.sourceId!==input.sourceId||key(twin.city)!==key(input.brief.city)||
    twin.candidateIds.length!==input.candidates.length||twin.candidateIds.some((id,i)=>id!==input.candidates[i].id))
    throw new Error('Saved audience twin must match this source, city and exact artist pool. Research a new twin for changed inputs.');
}

export function simulateAudienceTwin(twin,brief,selectedIds,{price=brief.ticketPrice,competitionCount=brief.competitionCount,overlap=twin.overlapAssumption}={}) {
  const segmentRows=twin.segments.map(segment=>{
    // The 20–80% response scale is a declared scenario mapping, not a Qloo
    // purchase probability. It keeps a top rank from implying full coverage.
    const appeal=selectedIds.map(id=>segment.affinity[id]).filter(value=>finite(value,0,1)).map(value=>.2+.6*value);
    const strongest=appeal.length?Math.max(...appeal):0;
    const independent=1-appeal.reduce((product,value)=>product*(1-value),1);
    const coverage=strongest+(independent-strongest)*(1-overlap);
    const base=twin.audiencePool*segment.weight*segment.baseIntent;
    const priceFactor=(price/brief.ticketPrice)**segment.priceElasticity;
    const competitionFactor=clamp(1-segment.competitionLoss*competitionCount);
    const raw=base*coverage*priceFactor*competitionFactor;
    const low=base*.75*strongest*priceFactor*competitionFactor;
    const high=base*1.25*independent*priceFactor*competitionFactor;
    return {id:segment.id,labels:segment.labels,weight:segment.weight,receiptIds:segment.receiptIds,
      artistAffinity:Object.fromEntries(selectedIds.map(id=>[id,segment.affinity[id]??null])),
      coverage:round(coverage),uniqueInterestProxy:round(coverage),scenarioTickets:Math.round(raw),
      scenarioRange:{low:Math.floor(low),high:Math.ceil(high)},
      incrementalCoverage:round(Math.max(0,coverage-strongest)),priceFactor:round(priceFactor),competitionFactor:round(competitionFactor)};
  });
  const sum=field=>segmentRows.reduce((value,row)=>value+field(row),0);
  const ticketsSold={low:Math.min(brief.capacity,Math.floor(sum(row=>row.scenarioRange.low))),
    point:Math.min(brief.capacity,Math.round(sum(row=>row.scenarioTickets))),
    high:Math.min(brief.capacity,Math.ceil(sum(row=>row.scenarioRange.high)))};
  return {status:'assumption_scenario',targetMetric:'paid_tickets_sold',selectedIds,price,competitionCount,ticketsSold,
    grossRevenue:{low:round(ticketsSold.low*price),point:round(ticketsSold.point*price),high:round(ticketsSold.high*price)},
    segments:segmentRows,uncertainty:{kind:'sensitivity_not_confidence_interval',
      low:'25% lower organizer base intent with maximal within-segment fan overlap.',
      high:'25% higher organizer base intent with independent within-segment artist appeal.',
      coverageGuarantee:false},
    caveat:'Simulated profiles are weighted organizer hypotheses. The illustrative 20–80% artist-response mapping transforms relative Qloo rank; it is not a measured purchase probability, observed fan overlap or validated ticket forecast.'};
}

export function compareAudienceTwins(twin,brief,originalIds,changedIds,competitionIncrease=0){
  if(!Number.isInteger(competitionIncrease)||competitionIncrease<0||competitionIncrease>10)throw new Error('Competition increase must be 0–10 events.');
  const before=simulateAudienceTwin(twin,brief,originalIds);
  const after=simulateAudienceTwin(twin,brief,changedIds,{competitionCount:brief.competitionCount+competitionIncrease});
  return {before,after,deltaScenarioTickets:after.ticketsSold.point-before.ticketsSold.point,
    segmentMigration:before.segments.map((row,index)=>({id:row.id,labels:row.labels,deltaScenarioTickets:after.segments[index].scenarioTickets-row.scenarioTickets})),
    interpretation:'Scenario sensitivity to lineup and competition assumptions; no individual audience migration is observed.'};
}
