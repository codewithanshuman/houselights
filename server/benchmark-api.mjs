import { llmConfiguration } from './llm.mjs';
import { canEdit } from './access.mjs';
import { createResearchRun } from './research-runs.mjs';
import { loadBenchmarkBatch } from './benchmark-batches.mjs';

export function enqueueBenchmark(req,res,sourceId=req.body?.sourceId) {
  try {
    const result=createResearchRun({sourceId,kind:'benchmark',options:{trials:req.body?.trials??3}},req.get('Idempotency-Key'));
    return res.status(result.reused?200:202).json({...result,batch:loadBenchmarkBatch(result.run.id)});
  }catch(error){return res.status(error.status??400).json({error:error.message});}
}
export function registerBenchmarkRoutes(app) {
  app.get('/api/benchmarks/config',(req,res)=>res.json(llmConfiguration()));
  app.post('/api/benchmarks',(req,res)=>enqueueBenchmark(req,res));
  app.get('/api/benchmarks/:id',(req,res)=>{
    if(!canEdit(req))return res.status(401).json({error:'Organizer access required for benchmark batches.'});
    const batch=loadBenchmarkBatch(req.params.id);
    if(!batch)return res.status(404).json({error:'Benchmark batch not found.'});res.json(batch);
  });
}
