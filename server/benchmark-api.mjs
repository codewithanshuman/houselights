import { randomBytes } from 'node:crypto';
import { db, consumeQuota } from './database.mjs';
import * as store from './store.mjs';
import { benchmarkFestival } from './gm.mjs';
import { llmConfiguration, providerPacing } from './llm.mjs';
import { canEdit } from './access.mjs';

db.exec('CREATE TABLE IF NOT EXISTS benchmark_batches(id TEXT PRIMARY KEY, body TEXT NOT NULL)');
export function registerBenchmarkRoutes(app){
  app.get('/api/benchmarks/config',(req,res)=>res.json(llmConfiguration()));
  app.post('/api/benchmarks',async(req,res)=>{
    const source=store.load(req.body?.sourceId),trials=req.body?.trials??3;
    if(!source)return res.status(404).json({error:'Saved brief not found.'});
    if(!Number.isInteger(trials)||trials<1||trials>5)return res.status(400).json({error:'Choose 1–5 trials.'});
    if(!llmConfiguration().enabled)return res.status(503).json({error:'Configure the model and provider key before running a genuine benchmark.',configuration:llmConfiguration()});
    const minute=Math.floor(Date.now()/60000),day=Math.floor(Date.now()/864e5);
    // Reserve the entire batch before calling the provider; parallel requests cannot bypass the budget.
    if(!consumeQuota([{key:`benchmark-batch:${minute}`,limit:2,expires:(minute+1)*60000},{key:`benchmark-batch-day:${day}`,limit:20,expires:(day+1)*864e5}]))return res.status(429).json({error:'Benchmark batch limit reached.'});
    const id=randomBytes(12).toString('base64url'),batch={id,sourceId:source.id,status:'running',requestedTrials:trials,createdAt:new Date().toISOString(),trials:[],selectionRule:'The first trial is the predeclared review source. All attempts are retained; no best-of selection.'};
    const save=()=>db.prepare('INSERT INTO benchmark_batches(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(id,JSON.stringify(batch));
    save();store.retain(source.id);
    try{
      for(let index=0;index<trials;index++){
        const waitMs=providerPacing(batch.trials.at(-1)?.benchmark.generation);
        if(waitMs){batch.waitUntil=new Date(Date.now()+waitMs).toISOString();save();await new Promise(resolve=>setTimeout(resolve,waitMs));delete batch.waitUntil;}
        const benchmark=await benchmarkFestival(source),snapshotId=store.save({...source,id:undefined,createdAt:undefined,parentId:source.id,decisionProof:undefined,benchmark,benchmarkTrial:{batchId:id,index:index+1,reviewTrial:1}});store.retain(snapshotId);
        batch.trials.push({index:index+1,snapshotId,status:benchmark.status,benchmark});save();
        if(benchmark.generation?.httpStatus===429||benchmark.status==='not_comparable'){batch.stopReason=benchmark.reason;break;}
      }
      batch.status=batch.trials.length===trials?'complete':'partial';
    }catch(error){batch.status='interrupted';batch.stopReason='The batch stopped unexpectedly; completed attempts remain available.';}
    batch.finishedAt=new Date().toISOString();batch.reviewSourceId=batch.trials[0]?.status==='compared'?batch.trials[0].snapshotId:null;
    batch.summary={planned:trials,notAttempted:trials-batch.trials.length,attempted:batch.trials.length,feasible:batch.trials.filter(t=>t.status==='compared').length,unavailable:batch.trials.filter(t=>t.status==='unavailable').length,invalid:batch.trials.filter(t=>['invalid_control','constraint_failure'].includes(t.status)).length,
      uniqueControls:new Set(batch.trials.filter(t=>t.status==='compared').map(t=>[...t.benchmark.control.selectedIds].sort().join('|'))).size};save();
    res.status(201).json(batch);
  });
  app.get('/api/benchmarks/:id',(req,res)=>{
    if(!canEdit(req))return res.status(401).json({error:'Organizer access required for benchmark batches.'});
    const row=db.prepare('SELECT body FROM benchmark_batches WHERE id=?').get(req.params.id);
    if(!row)return res.status(404).json({error:'Benchmark batch not found.'});res.json(JSON.parse(row.body));
  });
}
