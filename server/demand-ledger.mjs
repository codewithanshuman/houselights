import { randomBytes } from 'node:crypto';
import { db } from './database.mjs';
import { demandFeatures, qlooProtocol, trainDemandModel } from './demand-model.mjs';

const id = () => randomBytes(12).toString('hex');
const read = (table, key) => {
  const row = db.prepare(`SELECT body FROM ${table} WHERE id=?`).get(key);
  return row ? JSON.parse(row.body) : null;
};
const eventEnd = date => Date.parse(`${date}T23:59:59.999Z`);
const validDay = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const eventKey = (brief) => [brief.eventDate,brief.city.trim().toLowerCase(),
  brief.venue?.trim().toLowerCase()||`capacity:${brief.capacity}`].join('|');
const requiredSource = raw => {
  const kind=String(raw.sourceKind||''),reference=String(raw.sourceReference||'').trim();
  if(!['box_office_export','ticketing_report','venue_settlement'].includes(kind)||reference.length<6||reference.length>200)
    throw new Error('A genuine box-office, ticketing or venue-settlement source type and reference are required.');
  return {kind,reference};
};

export function saveDemandForecast(input, result, source) {
  if(result.status!=='feasible')throw new Error('Only a feasible demand plan can be saved for later validation.');
  if(Date.now()>=Date.parse(`${input.brief.eventDate}T00:00:00Z`))throw new Error('A validation forecast must be saved before the event date.');
  const createdAt=new Date().toISOString(), forecast={id:id(),createdAt,brief:input.brief,
    sourceId:input.sourceId,sourceCreatedAt:source?.createdAt??null,synthetic:input.synthetic,
    selectedIds:result.selected.selectedIds,features:result.selected.features,
    mode:result.mode,ticketsSold:result.selected.forecast?.ticketsSold??null,targetMetric:'paid_tickets_sold',
    assumptions:input.assumptions,modelStatus:result.modelStatus,
    note:'Immutable pre-event prediction/assumption snapshot. Its creation time is recorded before any outcome is attached.'};
  db.prepare('INSERT INTO demand_forecasts(id,body,created_at) VALUES(?,?,?)').run(forecast.id,JSON.stringify(forecast),createdAt);
  return forecast;
}
export const loadDemandForecast = key => /^[a-f0-9]{24}$/.test(String(key||''))?read('demand_forecasts',key):null;
export const listDemandOutcomes = () => db.prepare('SELECT body FROM demand_outcomes ORDER BY created_at,id').all().map(row=>JSON.parse(row.body));
export const demandModelStatus = () => trainDemandModel(listDemandOutcomes());

export function recordDemandOutcome(raw) {
  const forecast=loadDemandForecast(raw?.forecastId);
  if(!forecast)throw new Error('Saved forecast not found.');
  if(Date.now()<=eventEnd(forecast.brief.eventDate))throw new Error('The event date must have passed before recording an outcome.');
  if(!Number.isInteger(raw?.paidTicketsSold)||raw.paidTicketsSold<0||raw.paidTicketsSold>forecast.brief.capacity)
    throw new Error('Paid tickets sold must be an integer within sellable capacity.');
  const source=requiredSource(raw),createdAt=new Date().toISOString();
  const preEvent=Date.parse(forecast.createdAt)<Date.parse(`${forecast.brief.eventDate}T00:00:00Z`);
  const qlooPreEvent=preEvent&&!forecast.synthetic&&forecast.features.qlooCoverage===1&&forecast.sourceCreatedAt&&
    Date.parse(forecast.sourceCreatedAt)<Date.parse(`${forecast.brief.eventDate}T00:00:00Z`);
  const outcome={id:forecast.id,eventKey:eventKey(forecast.brief),eventDate:forecast.brief.eventDate,city:forecast.brief.city,
    capacity:forecast.brief.capacity,paidTicketsSold:raw.paidTicketsSold,features:forecast.features,targetMetric:'paid_tickets_sold',
    forecastGeneratedAt:forecast.createdAt,forecastTicketsSold:forecast.ticketsSold?.point??null,
    forecastError:forecast.ticketsSold?.point==null?null:forecast.ticketsSold.point-raw.paidTicketsSold,
    absoluteForecastError:forecast.ticketsSold?.point==null?null:Math.abs(forecast.ticketsSold.point-raw.paidTicketsSold),
    synthetic:forecast.synthetic,createdAt,provenance:{realOutcome:true,preEventFeatures:preEvent,
      qlooPreEvent:!!qlooPreEvent,qlooProtocol:forecast.brief.qlooProtocol??null,source,classification:preEvent?'prospective':'retrospective_excluded',
      note:'The organizer attests to the source. The application validates timing and arithmetic, not the external document.'}};
  if(read('demand_outcomes',outcome.id))throw new Error('An outcome is already recorded for this forecast.');
  db.prepare('INSERT INTO demand_outcomes(id,body,created_at) VALUES(?,?,?)').run(outcome.id,JSON.stringify(outcome),createdAt);
  return outcome;
}

export function recordHistoricalEvent(raw, sourceSnapshot=null) {
  const brief=raw?.brief||{},selected=raw?.lineup;
  if(typeof brief.city!=='string'||!brief.city.trim()||brief.city.length>100||typeof brief.eventDate!=='string'||
    !validDay(brief.eventDate)||
    !Number.isInteger(brief.capacity)||brief.capacity<1||brief.capacity>1000000||
    typeof brief.ticketPrice!=='number'||!Number.isFinite(brief.ticketPrice)||brief.ticketPrice<=0||brief.ticketPrice>1e9||
    !Number.isInteger(brief.competitionCount)||brief.competitionCount<0||brief.competitionCount>100||
    (brief.venue!=null&&(typeof brief.venue!=='string'||brief.venue.length>120))||
    !Array.isArray(selected)||selected.length<1||selected.length>20||
    !Number.isInteger(raw.paidTicketsSold)||raw.paidTicketsSold<0||raw.paidTicketsSold>brief.capacity)
    throw new Error('Historical event needs a valid city, date, capacity, price, competition count, lineup and paid tickets sold.');
  if(Date.now()<=eventEnd(brief.eventDate))throw new Error('Historical outcome must be after the event date.');
  if(typeof raw.featureObservedAt!=='string'||Number.isNaN(Date.parse(raw.featureObservedAt)))throw new Error('Feature observation timestamp is required.');
  const source=requiredSource(raw),observed=Date.parse(raw.featureObservedAt),before=observed<Date.parse(`${brief.eventDate}T00:00:00Z`);
  if(sourceSnapshot&&String(sourceSnapshot.memo?.input?.city||sourceSnapshot.input?.city||'').toLowerCase()!==brief.city.trim().toLowerCase())
    throw new Error('Historical Qloo source city must match the event city.');
  if(selected.some(item=>typeof item?.id!=='string'||!item.id.trim()))throw new Error('Historical lineup needs artist IDs.');
  const qlooSourceBefore=!!sourceSnapshot&&!sourceSnapshot.mock&&sourceSnapshot.createdAt&&
    Date.parse(sourceSnapshot.createdAt)<Date.parse(`${brief.eventDate}T00:00:00Z`);
  const joined=selected.map(item=>{
    const evidence=sourceSnapshot?.memo?.items?.find(row=>row.id===item.id);
    const rank=qlooSourceBefore&&evidence?.evidence?.rank===true&&Number.isFinite(evidence.fit)&&
      evidence.evidenceReceipts?.rank?.some(receiptId=>sourceSnapshot.receipts?.some(r=>r.id===receiptId&&r.source==='qloo'&&r.status==='ok'));
    const local=rank&&evidence?.evidence?.local===true&&evidence.evidenceReceipts?.local?.some(receiptId=>
      sourceSnapshot.receipts?.some(r=>r.id===receiptId&&r.source==='qloo'&&r.status==='ok'));
    return {qloo:{rank:!!rank,fit:rank?evidence.fit:null,local:!!local}};
  });
  const features=demandFeatures({...brief,qlooProtocol:qlooSourceBefore?qlooProtocol(sourceSnapshot):null},joined),createdAt=new Date().toISOString();
  const outcome={id:id(),eventKey:eventKey(brief),eventDate:brief.eventDate,city:brief.city.trim(),capacity:brief.capacity,
    paidTicketsSold:raw.paidTicketsSold,features,synthetic:false,createdAt,targetMetric:'paid_tickets_sold',
    provenance:{realOutcome:true,preEventFeatures:before,qlooPreEvent:!!(before&&qlooSourceBefore&&features.qlooCoverage===1),qlooProtocol:features.qlooProtocol,
      source,featureObservedAt:raw.featureObservedAt,sourceId:sourceSnapshot?.id??null,
      classification:before?'organizer_attested_historical':'post_event_features_excluded',
      note:'Historical features and outcome are organizer-attested. No independent source verification or prospective prediction is implied.'}};
  db.prepare('INSERT INTO demand_outcomes(id,body,created_at) VALUES(?,?,?)').run(outcome.id,JSON.stringify(outcome),createdAt);
  return outcome;
}
