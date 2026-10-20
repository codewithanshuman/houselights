import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {evaluationPlan,evaluationSummary} from '../server/evaluation.mjs';
// Run genuine controls over predeclared distinct briefs; no simulated fallback.
const base=process.env.HOUSELIGHTS_URL??'http://127.0.0.1:8082';
const headers={'content-type':'application/json',...(process.env.ORGANIZER_TOKEN?{authorization:'Bearer '+process.env.ORGANIZER_TOKEN}:{})};
async function request(path,body,key){const r=await fetch(new URL(path,base),{headers:{...headers,...(key?{'idempotency-key':key}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const value=await r.json();if(!r.ok)throw new Error(value.error??'Request failed.');return value;}
const resume=process.argv[2]==='--resume',inputPath=process.argv[resume?3:2];
if(!inputPath){console.error('Usage: npm run evaluate:campaign -- manifest.json OR --resume artifacts/evaluation-UUID.json');process.exitCode=1;}
else {
  let output,path;
  try {
    const document=JSON.parse(readFileSync(inputPath,'utf8')),input=resume?document.manifest:document;
    if(!Array.isArray(input.sourceIds)||input.sourceIds.length<2||input.sourceIds.length>20||new Set(input.sourceIds).size!==input.sourceIds.length||!Number.isInteger(input.trials)||input.trials<1||input.trials>5)throw new Error('Choose 2–20 distinct sources and 1–5 trials.');
    const sources=[];
    for(const id of input.sourceIds){
      if(typeof id!=='string'||! /^[\w-]{6,12}$/.test(id))throw new Error('Invalid saved source ID.');
      const source=await request('/api/memo/'+id);
      sources.push(source);
    }
    mkdirSync('artifacts',{recursive:true});path=resume?inputPath:join('artifacts','evaluation-'+randomUUID()+'.json');
    const plan=evaluationPlan(sources,input.trials);
    if(resume&&(document.plan?.digest!==plan.digest||!Array.isArray(document.requests)||document.requests.length!==input.sourceIds.length||document.requests.some((r,i)=>r.sourceId!==input.sourceIds[i]||typeof r.key!=='string')))throw new Error('Cannot resume: source assumptions changed or this artifact predates durable requests. Original attempts must not be replayed.');
    output=resume?document:{createdAt:new Date().toISOString(),manifest:input,plan,batches:[],requests:input.sourceIds.map(sourceId=>({sourceId,key:randomUUID()})),reviewSourceIds:[],method:'All predeclared briefs and attempts retained. Only each first trial can enter independent review. No optimizer score establishes superiority.'};
    output.status='running';delete output.error;
    const save=()=>{output.reviewSourceIds=output.batches.flatMap(b=>b.reviewSourceId?[b.reviewSourceId]:[]);output.summary=evaluationSummary(plan,output.batches);writeFileSync(path,JSON.stringify(output,null,2));};save();
    const config=await request('/api/benchmarks/config');
    if(!config.enabled){output.status='blocked';output.blocker='Missing live LLM configuration';output.configuration=config;save();}
    else {
      for(const pending of output.requests){
        const {sourceId}=pending;
        try {
          // The key was saved before submission: a lost response can be retried safely.
          const queued=await request('/api/benchmarks',{sourceId,trials:input.trials},pending.key);pending.runId=queued.run.id;save();
          const deadline=Date.now()+15*60000;
          while(true){
            const run=await request('/api/research-runs/'+pending.runId);
            const batch=await request('/api/benchmarks/'+pending.runId);
            output.batches=output.batches.filter(b=>b.sourceId!==sourceId);output.batches.push(batch);save();
            if(run.terminal)break;
            if(Date.now()>deadline)throw new Error('Polling window ended. The server job continues; resume this artifact to reconnect.');
            await new Promise(resolve=>setTimeout(resolve,1500));
          }
        }
        catch(error){pending.error=error.message;output.status='interrupted';save();break;}
        // Respect the server's two-batch/minute limit; this CLI is deliberately sequential.
        if(sourceId!==input.sourceIds.at(-1))await new Promise(resolve=>setTimeout(resolve,31000));
      }
      if(output.status==='running')output.status=evaluationSummary(plan,output.batches).execution;save();
    }
    console.log(JSON.stringify({path,status:output.status,reviewSourceIds:output.reviewSourceIds,blocker:output.blocker},null,2));
    if(output.status!=='complete')process.exitCode=1;
  }catch(error){if(output&&path){output.status='interrupted';output.error=error.message;writeFileSync(path,JSON.stringify(output,null,2));}console.error(error.message);process.exitCode=1;}
}
