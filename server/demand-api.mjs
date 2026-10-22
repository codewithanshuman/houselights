import { canEdit, routeQuota } from './access.mjs';
import * as store from './store.mjs';
import { normalizeDemandInput, planDemand } from './demand.mjs';
import { demandModelStatus, listDemandOutcomes, loadDemandForecast, recordDemandOutcome,
  recordHistoricalEvent, saveDemandForecast } from './demand-ledger.mjs';
import { listReportedOutcomes, reportedOutcomeStatus } from './reported-outcomes.mjs';

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
  app.get('/api/demand/forecasts/:id',privateRead,(req,res)=>{
    const forecast=loadDemandForecast(req.params.id);
    return forecast?res.json(forecast):res.status(404).json({error:'Forecast not found.'});
  });
  app.post('/api/demand/plan',(req,res)=>{
    if(!routeQuota(req,'demand-plan',{minuteLimit:3,dayLimit:100}))return res.status(429).json({error:'Demand-planning limit reached.'});
    const sourceId=req.body?.sourceId,source=sourceId?store.load(sourceId):null;
    if(sourceId&&!source)return res.status(404).json({error:'Saved Qloo source not found.'});
    try {
      const input=normalizeDemandInput(req.body,source),model=demandModelStatus(),result=planDemand(input,model);
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
