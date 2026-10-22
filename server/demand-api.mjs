import { canEdit, routeQuota } from './access.mjs';
import * as store from './store.mjs';
import { normalizeDemandInput, planDemand } from './demand.mjs';
import { demandModelStatus, listDemandOutcomes, loadDemandForecast, recordDemandOutcome,
  recordHistoricalEvent, saveDemandForecast } from './demand-ledger.mjs';
import { listReportedOutcomes, reportedOutcomeStatus } from './reported-outcomes.mjs';
import { assertTwinCompatible, loadAudienceTwin, researchAudienceTwin, compareAudienceTwins } from './audience-twin.mjs';
import { enumerateSlates } from './optimizer.mjs';

export function registerDemandRoutes(app) {
  const privateRead=(req,res,next)=>canEdit(req)?next():res.status(401).json({error:'Organizer access is required for private demand records.'});
  app.get('/api/demand/model',privateRead,(_req,res)=>{
    const model=demandModelStatus();
    res.json({status:model.status,eligible:model.eligible,required:model.required??40,
      train:model.train??0,calibration:model.calibration??0,heldOut:model.heldOut??0,trainingCutoff:model.trainingCutoff??null,
      baseline:model.baseline?.heldOut??null,qlooComparison:model.qlooComparison??null,
      reason:model.reason??null,provenance:model.provenance??null,
      outcomeCount:listDemandOutcomes().length,reported:reportedOutcomeStatus()});
  });
  app.get('/api/demand/reported-outcomes',privateRead,(_req,res)=>res.json({status:reportedOutcomeStatus(),outcomes:listReportedOutcomes()}));
  app.get('/api/demand/twins/:id',privateRead,(req,res)=>{
    const twin=loadAudienceTwin(req.params.id);return twin?res.json(twin):res.status(404).json({error:'Audience twin not found.'});
  });
  app.get('/api/demand/twin-validation',privateRead,(_req,res)=>{
    const all=listDemandOutcomes().filter(row=>row.twinComparison?.status==='scenario_vs_observed_total');
    const rows=all.filter(row=>row.provenance?.realOutcome===true&&row.provenance?.preEventFeatures===true&&row.synthetic!==true&&row.twinComparison.syntheticSource!==true);
    const mae=rows.length?rows.reduce((sum,row)=>sum+row.twinComparison.absoluteError,0)/rows.length:null;
    const within=rows.length?rows.filter(row=>row.twinComparison.withinSensitivityRange).length/rows.length:null;
    res.json({status:rows.length?'observed_event_totals':'no_matched_outcomes',count:rows.length,excluded:all.length-rows.length,meanAbsoluteError:mae,
      withinSensitivityRange:within,rangeIsCalibrated:false,segmentValidationAvailable:false,
      caveat:'Only immutable pre-event twin scenarios paired with later sourced paid-ticket totals qualify. The range is assumption sensitivity, not a confidence interval.'});
  });
  app.post('/api/demand/twins',async(req,res)=>{
    if(!routeQuota(req,'audience-twin',{minuteLimit:2,dayLimit:30}))return res.status(429).json({error:'Audience-research limit reached.'});
    const source=store.load(req.body?.sourceId);
    if(!source)return res.status(404).json({error:'Saved Qloo source not found.'});
    try{
      const input=normalizeDemandInput(req.body,source),twin=await researchAudienceTwin(req.body,source,input);
      return res.status(twin.status==='scenario_ready'?201:422).json(twin);
    }catch(error){return res.status(400).json({error:error.message});}
  });
  app.post('/api/demand/twins/:id/compare',(req,res)=>{
    const twin=loadAudienceTwin(req.params.id);
    if(!twin)return res.status(404).json({error:'Audience twin not found.'});
    try{
      const input=normalizeDemandInput(req.body,store.load(twin.sourceId));assertTwinCompatible(twin,input);
      const original=req.body?.originalIds,changed=req.body?.changedIds;
      if(!Array.isArray(original)||!Array.isArray(changed)||[original,changed].some(list=>
        list.length!==input.constraints.slots||new Set(list).size!==list.length||list.some(id=>!twin.rankedCandidateIds.includes(id))))
        throw new Error('Both lineups must contain distinct artists from this twin and fill every slot.');
      const feasible=new Set(enumerateSlates(input.candidates,input.constraints).filter(row=>row.feasible).map(row=>[...row.selectedIds].sort().join('|')));
      if(!feasible.has([...original].sort().join('|'))||!feasible.has([...changed].sort().join('|')))
        throw new Error('Both compared lineups must satisfy the original booking constraints.');
      return res.json(compareAudienceTwins(twin,input.brief,original,changed,req.body?.competitionIncrease??0));
    }catch(error){return res.status(400).json({error:error.message});}
  });
  app.get('/api/demand/forecasts/:id',privateRead,(req,res)=>{
    const forecast=loadDemandForecast(req.params.id);
    return forecast?res.json(forecast):res.status(404).json({error:'Forecast not found.'});
  });
  app.post('/api/demand/plan',(req,res)=>{
    if(!routeQuota(req,'demand-plan',{minuteLimit:3,dayLimit:100}))return res.status(429).json({error:'Demand-planning limit reached.'});
    const sourceId=req.body?.sourceId,source=sourceId?store.load(sourceId):null;
    if(sourceId&&!source)return res.status(404).json({error:'Saved Qloo source not found.'});
    try {
      const input=normalizeDemandInput(req.body,source),model=demandModelStatus(),twin=req.body?.twinId?loadAudienceTwin(req.body.twinId):null;
      if(req.body?.twinId)assertTwinCompatible(twin,input);
      const result=planDemand(input,model,twin);
      const forecast=req.body?.save===true&&result.status==='feasible'?saveDemandForecast(input,result,source):null;
      return res.json({...result,forecastId:forecast?.id??null,savedAt:forecast?.createdAt??null,
        sourceClassification:input.synthetic?'synthetic':source?'saved_qloo':'no_qloo_source'});
    }catch(error){return res.status(400).json({error:error.message});}
  });
  app.post('/api/demand/outcomes',(req,res)=>{
    try {const outcome=recordDemandOutcome(req.body);return res.status(201).json(outcome);}
    catch(error){return res.status(400).json({error:error.message});}
  });
  app.post('/api/demand/historical-events',(req,res)=>{
    const source=req.body?.sourceId?store.load(req.body.sourceId):null;
    if(req.body?.sourceId&&!source)return res.status(404).json({error:'Saved Qloo source not found.'});
    try {const outcome=recordHistoricalEvent(req.body,source);return res.status(201).json(outcome);}
    catch(error){return res.status(400).json({error:error.message});}
  });
  app.get('/api/demand/outcomes',privateRead,(_req,res)=>res.json({outcomes:listDemandOutcomes()}));
}
