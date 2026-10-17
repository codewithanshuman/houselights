import { canEdit } from './access.mjs';
import { createResearchRun, getResearchRun, publicRun, researchEvents, cancelResearchRun, listResearchRuns } from './research-runs.mjs';

export function registerResearchRoutes(app) {
  app.use('/api/research-runs',(req,res,next)=>canEdit(req)?next():res.status(401).json({error:'Organizer access required for research history.'}));
  const handle=fn=>(req,res)=>{try{fn(req,res);}catch(error){res.status(error.status??400).json({error:error.message});}};
  app.post('/api/research-runs',handle((req,res)=>{
    const result=createResearchRun(req.body,req.get('idempotency-key'));
    res.status(result.reused?200:202).json(result);
  }));
  app.get('/api/research-runs',handle((req,res)=>res.json({runs:listResearchRuns()})));
  app.get('/api/research-runs/:id',handle((req,res)=>{
    const run=getResearchRun(req.params.id);if(!run)return res.status(404).json({error:'Research run not found.'});
    res.json(publicRun(run));
  }));
  app.get('/api/research-runs/:id/events',handle((req,res)=>res.json(researchEvents(req.params.id,Number(req.query.after??0)))));
  app.post('/api/research-runs/:id/cancel',handle((req,res)=>res.json(cancelResearchRun(req.params.id,req.body?.expectedRevision))));
}
