import { enumerateSlates } from './optimizer.mjs';
import { demandFeatures, predictDemand, qlooProtocol } from './demand-model.mjs';
import { simulateAudienceTwin } from './audience-twin.mjs';

const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const amount = (value, max = 1e9) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const round = value => Math.round(value * 10000) / 10000;
const unique = values => [...new Set(values)];
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const match = (source, candidate) => source?.memo?.items?.find(item => item.id === candidate.id || item.name.toLowerCase() === candidate.name.toLowerCase());

function verified(item, source, kind) {
  if (!item?.evidence?.[kind]) return false;
  return (item.evidenceReceipts?.[kind] || []).some(id => source?.receipts?.some(receipt => receipt.id === id &&
    receipt.status === 'ok' && (receipt.source === 'qloo' || source?.mock === true && receipt.source === 'synthetic')));
}

export function normalizeDemandInput(raw, source = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Provide an event brief and candidate pool.');
  const brief = raw.brief || {};
  const city = String(brief.city || '').trim(), genre = String(brief.genre || '').trim(), venue = String(brief.venue || '').trim();
  if (!city || city.length > 100 || !genre || genre.length > 80) throw new Error('City and event genre are required.');
  if (venue.length > 120) throw new Error('Venue name is too long.');
  if (!day(brief.eventDate)) throw new Error('Event date must be a valid YYYY-MM-DD date.');
  if (!integer(brief.capacity, 1, 1000000)) throw new Error('Capacity must be an integer from 1 to 1,000,000.');
  if (!amount(brief.ticketPrice) || brief.ticketPrice === 0) throw new Error('Ticket price must be a positive finite amount.');
  if (!integer(brief.competitionCount ?? 0, 0, 100)) throw new Error('Competing-event count must be an integer from 0 to 100.');
  if (source && String(source.memo?.input?.city || source.input?.city || '').toLowerCase() !== city.toLowerCase()) throw new Error('Saved Qloo source city must match the event city.');
  if (!Array.isArray(raw.candidates) || raw.candidates.length < 1 || raw.candidates.length > 20) throw new Error('Provide 1–20 candidate artists.');
  const ids = new Set();
  const candidates = raw.candidates.map((candidate, index) => {
    const id = String(candidate?.id || '').trim(), name = String(candidate?.name || '').trim();
    if (!id || id.length > 180 || !name || name.length > 180 || ids.has(id)) throw new Error(`Candidate ${index + 1} needs a unique ID and name.`);
    ids.add(id);
    const sourceItem = match(source, {id,name});
    const fee = candidate?.fee ?? sourceItem?.terms?.fee ?? null;
    if (fee !== null && !amount(fee)) throw new Error(`Fee for ${name} must be a non-negative amount or null.`);
    const available = candidate?.available === true;
    const candidateGenre = String(candidate?.genre || sourceItem?.terms?.genre || '').trim();
    if (candidateGenre.length > 80) throw new Error(`Genre for ${name} is too long.`);
    const rank = verified(sourceItem,source,'rank') && Number.isFinite(sourceItem.fit) && sourceItem.fit >= 0 && sourceItem.fit <= 1;
    const qloo = {rank,fit:rank?sourceItem.fit:null,local:verified(sourceItem,source,'local'),
      trend:verified(sourceItem,source,'trends')?sourceItem.momentum:null,
      source:sourceItem?(source.mock?'synthetic':'qloo'):'missing',
      receiptIds:sourceItem?unique(Object.values(sourceItem.evidenceReceipts || {}).flat().filter(id => source.receipts?.some(receipt=>receipt.id===id))):[]};
    return {id,name,terms:{fee,available,genre:candidateGenre},found:sourceItem?.found===true,
      fit:qloo.fit,evidence:{rank,local:qloo.local,trends:!!qloo.trend,comparison:verified(sourceItem,source,'comparison')},
      qloo,local:qloo.local?'yes':'no data',momentum:qloo.trend||'unknown',receipts:qloo.receiptIds,
      culturalLinks:Array.isArray(sourceItem?.culturalLinks)?sourceItem.culturalLinks:[],
      tags:Array.isArray(sourceItem?.tags)?sourceItem.tags:[]};
  });
  const constraints = {...(raw.constraints || {}),budget:raw.constraints?.budget,slots:raw.constraints?.slots,
    maxPerGenre:raw.constraints?.maxPerGenre,discoveryMin:raw.constraints?.discoveryMin ?? 0};
  if (!amount(constraints.budget)) throw new Error('A non-negative booking budget is required.');
  if (!integer(constraints.slots,1,5)) throw new Error('Demand planning supports 1–5 artist slots.');
  if (!integer(constraints.maxPerGenre,1,5)) throw new Error('A genre cap from 1 to 5 is required.');
  const assumptions=raw.assumptions || {};
  if (assumptions.baseSellThrough != null && (!amount(assumptions.baseSellThrough,1) || assumptions.baseSellThrough > 1)) throw new Error('Assumed sell-through must be between 0 and 1.');
  if (assumptions.priceElasticity != null && (typeof assumptions.priceElasticity !== 'number' || !Number.isFinite(assumptions.priceElasticity) || assumptions.priceElasticity < -5 || assumptions.priceElasticity > 0)) throw new Error('Assumed price elasticity must be between -5 and 0.');
  for (const field of ['fixedCosts','variableCostPerAttendee']) if (assumptions[field] != null && !amount(assumptions[field])) throw new Error(`${field} must be a non-negative amount.`);
  const overlaps = Array.isArray(raw.observedAudienceOverlap)?raw.observedAudienceOverlap:[];
  if(overlaps.length>100)throw new Error('At most 100 aggregate overlap observations are supported.');
  const observedAudienceOverlap=overlaps.map(row=>{
    if(!ids.has(row?.a)||!ids.has(row?.b)||row.a===row.b||!amount(row.fraction,1)||!String(row.sourceReference||'').trim())
      throw new Error('Each observed overlap needs two distinct candidate IDs, a 0–1 fraction and an aggregate source reference.');
    return {a:row.a,b:row.b,fraction:row.fraction,sourceReference:String(row.sourceReference).slice(0,200)};
  });
  return {brief:{city,genre,venue,qlooProtocol:source&&!source.mock?qlooProtocol(source):null,eventDate:brief.eventDate,capacity:brief.capacity,ticketPrice:brief.ticketPrice,
    currency:['GBP','USD','EUR','INR'].includes(brief.currency)?brief.currency:'GBP',competitionCount:brief.competitionCount??0},
    candidates,constraints,assumptions:{baseSellThrough:assumptions.baseSellThrough??null,
      priceElasticity:assumptions.priceElasticity??null,fixedCosts:assumptions.fixedCosts??0,variableCostPerAttendee:assumptions.variableCostPerAttendee??0},
    observedAudienceOverlap,sourceId:source?.id??null,synthetic:source?.mock===true};
}

function culturalSignals(selected, overlaps) {
  const known=selected.filter(item=>item.qloo.rank), pairs=[];
  for(let a=0;a<selected.length;a++)for(let b=a+1;b<selected.length;b++){
    const left=selected[a],right=selected[b];
    const observation=overlaps.find(row=>row.a===left.id&&row.b===right.id||row.a===right.id&&row.b===left.id);
    const shared=left.culturalLinks.find(row=>row.otherId===right.id&&row.available===true&&row.receiptId);
    pairs.push({a:left.id,b:right.id,observedBuyerOverlap:observation?.fraction??null,
      observedSource:observation?.sourceReference??null,culturalBridge:shared?.sharedTastes?.length>0,
      culturalReceiptId:shared?.receiptId??null});
  }
  const meanFit=known.length?known.reduce((sum,item)=>sum+item.fit,0)/known.length:null;
  const localFraction=selected.filter(item=>item.qloo.local).length/selected.length;
  const genres=new Set(selected.map(item=>item.terms.genre.toLowerCase()).filter(Boolean));
  const observedPairs=pairs.filter(pair=>pair.observedBuyerOverlap!==null);
  const meanOverlap=observedPairs.length?observedPairs.reduce((sum,pair)=>sum+pair.observedBuyerOverlap,0)/observedPairs.length:null;
  const bridgeFraction=pairs.length?pairs.filter(pair=>pair.culturalBridge).length/pairs.length:0;
  // Editorial ranking utility. Never display it as a probability or tickets sold.
  const proxy=round(Math.max(0,Math.min(100,
    50*(meanFit??0)+15*localFraction+10*selected.filter(item=>item.qloo.trend==='rising').length/selected.length+
    10*Math.max(0,genres.size-1)/Math.max(1,selected.length-1)+5*bridgeFraction-
    10*(meanOverlap??0)-15*(1-known.length/selected.length))));
  return {proxy,rankCoverage:known.length/selected.length,meanFit:meanFit==null?null:round(meanFit),
    localFraction:round(localFraction),genreCount:genres.size,culturalBridgeFraction:round(bridgeFraction),
    observedOverlapPairs:observedPairs.length,totalPairs:pairs.length,meanObservedBuyerOverlap:meanOverlap==null?null:round(meanOverlap),pairs,
    interpretation:'Proxy points rank cultural evidence only. Shared themes are not unique buyers; measured pair overlap requires an aggregate ticketing source.'};
}

function financial(brief,fees,ticketsSold,assumptions) {
  if(!ticketsSold)return null;
  const calculation=count=>round(count*(brief.ticketPrice-assumptions.variableCostPerAttendee)-fees-assumptions.fixedCosts);
  return {grossRevenue:{low:round(ticketsSold.low*brief.ticketPrice),point:round(ticketsSold.point*brief.ticketPrice),high:round(ticketsSold.high*brief.ticketPrice)},
    operatingMargin:{low:calculation(ticketsSold.low),point:calculation(ticketsSold.point),high:calculation(ticketsSold.high)},
    basis:'Arithmetic on the stated paid-ticket scenario or backtested observational range; artist fees, fixed and variable costs remain buyer-entered.'};
}

function priceScenarios(brief,selected,modelReport,assumptions) {
  const features=demandFeatures(brief,selected),hasModel=modelReport.status==='backtested';
  return [.8,.9,1,1.1,1.2].map(multiplier=>{
    const price=round(brief.ticketPrice*multiplier),changed={...brief,ticketPrice:price};
    const model=hasModel?predictDemand(modelReport,changed,demandFeatures(changed,selected)):null;
    const scenario=assumptions.baseSellThrough!=null&&assumptions.priceElasticity!=null
      ?Math.round(brief.capacity*Math.max(0,Math.min(1,assumptions.baseSellThrough*(price/brief.ticketPrice)**assumptions.priceElasticity))):null;
    return {ticketPrice:price,modelTicketsSold:model?.ticketsSold??null,assumedTicketsSold:scenario,
      basis:model?'Observational model association, not causal price elasticity.':scenario!=null?'Buyer-supplied sell-through and elasticity assumptions; not a forecast.':'Price effect unavailable without a trained model or explicit assumptions.'};
  });
}

export function planDemand(input, modelReport, twin=null) {
  const {brief,candidates,constraints,assumptions,observedAudienceOverlap}=input;
  const rows=enumerateSlates(candidates,constraints),feasible=rows.filter(row=>row.feasible);
  if(!feasible.length)return {status:'infeasible',mode:'none',checkedCount:rows.length,feasibleCount:0,
    reasons:['No lineup satisfies the booking constraints. No demand or financial outcome is inferred.'],modelStatus:modelReport.status};
  const assess=row=>{
    const selected=row.selectedIds.map(id=>candidates.find(item=>item.id===id));
    const cultural=culturalSignals(selected,observedAudienceOverlap),features=demandFeatures(brief,selected);
    const forecast=predictDemand(modelReport,brief,features);
    const scenario=assumptions.baseSellThrough!=null?{status:'buyer_assumption',low:Math.floor(brief.capacity*Math.max(0,assumptions.baseSellThrough-.15)),
      point:Math.round(brief.capacity*assumptions.baseSellThrough),high:Math.ceil(brief.capacity*Math.min(1,assumptions.baseSellThrough+.15)),
      note:'The ±15 percentage-point band is a planning stress, not a statistical interval.'}:null;
    const ticketsSold=forecast?.ticketsSold??scenario;
    const twinScenario=twin?simulateAudienceTwin(twin,brief,row.selectedIds):null;
    const economics=financial(brief,row.totalFee,ticketsSold??twinScenario?.ticketsSold,assumptions);
    return {selectedIds:row.selectedIds,fees:row.totalFee,cultural,features,forecast,scenario,twinScenario,economics,
      objective:forecast?economics.operatingMargin.low:twinScenario?economics.operatingMargin.point:cultural.proxy};
  };
  const assessed=feasible.map(assess).sort((a,b)=>b.objective-a.objective||a.fees-b.fees||a.selectedIds.join('|').localeCompare(b.selectedIds.join('|')));
  const best=assessed[0], selected=best.selectedIds.map(id=>candidates.find(item=>item.id===id));
  return {status:'feasible',mode:best.forecast?'backtested_observational_forecast':twin?'synthetic_audience_scenario':'cultural_scenario_proxy',targetMetric:'paid_tickets_sold',
    brief,checkedCount:rows.length,feasibleCount:feasible.length,
    objective:best.forecast?'Maximize lower-bound modeled operating margin under hard constraints.':twin?'Maximize organizer-assumed audience scenario operating margin under hard constraints; this is not a validated forecast.':'Maximize explicitly uncalibrated cultural proxy under hard constraints.',
    selected:best,alternatives:assessed.slice(1,4),priceScenarios:priceScenarios(brief,selected,modelReport,assumptions),
    audienceTwin:twin?{id:twin.id,sourceId:twin.sourceId,synthetic:twin.synthetic,originalSeedCount:twin.originalSeedCount,clusterCount:twin.clusterCount,
      audiencePool:twin.audiencePool,overlapAssumption:twin.overlapAssumption,
      priceScenarios:[.8,.9,1,1.1,1.2].map(multiplier=>simulateAudienceTwin(twin,brief,best.selectedIds,{price:round(brief.ticketPrice*multiplier)})),
      interpretation:twin.interpretation}:null,
    candidateEvidence:candidates.map(item=>({id:item.id,name:item.name,source:item.qloo.source,rankFit:item.qloo.fit,
      local:item.qloo.local,receiptIds:item.qloo.receiptIds,bookable:item.terms.available&&item.terms.fee!=null})),
    modelStatus:modelReport.status,backtest:modelReport.status==='backtested'?{
      eligible:modelReport.eligible,train:modelReport.train,heldOut:modelReport.heldOut,
      trainingCutoff:modelReport.trainingCutoff,holdoutStart:modelReport.holdoutStart,
      baseline:modelReport.baseline.heldOut,qlooComparison:modelReport.qlooComparison}:null,
    caveats:[
      ...(twin?['Audience-twin weights, reachable pool, intent, elasticity and overlap are organizer assumptions. Its range is a sensitivity stress, not a calibrated prediction interval.']:[]),
      best.forecast?'Paid tickets sold is an observational forecast with a held-out residual range; it is not a guarantee or a count of venue entries.':'No calibrated paid-ticket model exists. Cultural proxy and buyer assumptions are not ticket-demand estimates.',
      best.cultural.observedOverlapPairs===best.cultural.totalPairs?'Aggregate pairwise buyer-overlap observations are available for every pair.':'Audience overlap is unmeasured for some or all selected pairs; cultural similarity cannot be turned into unique buyers.',
      input.synthetic?'Qloo source is synthetic and must never be presented as live market evidence.':'Qloo receipts describe aggregate taste relationships, not sales outcomes.',
    ]};
}
