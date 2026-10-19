import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
// Run genuine controls over predeclared distinct briefs; no simulated fallback.
const base=process.env.HOUSELIGHTS_URL??'http://127.0.0.1:8082';
const headers={'content-type':'application/json',...(process.env.ORGANIZER_TOKEN?{authorization:'Bearer '+process.env.ORGANIZER_TOKEN}:{})};
async function request(path,body){const r=await fetch(new URL(path,base),{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(330000)});const value=await r.json();if(!r.ok)throw new Error(value.error??'Request failed.');return value;}
const inputPath=process.argv[2];
if(!inputPath){console.error('Usage: npm run evaluate:campaign -- manifest.json (sourceIds: 2–20 distinct saved briefs, trials: 1–5)');process.exitCode=1;}
else {
  let output,path;
  try {
    const input=JSON.parse(readFileSync(inputPath,'utf8'));
    if(!Array.isArray(input.sourceIds)||input.sourceIds.length<2||input.sourceIds.length>20||new Set(input.sourceIds).size!==input.sourceIds.length||!Number.isInteger(input.trials)||input.trials<1||input.trials>5)throw new Error('Choose 2–20 distinct sources and 1–5 trials.');
    const digests=new Set();
    for(const id of input.sourceIds){
      if(typeof id!=='string'||! /^[\w-]{6,12}$/.test(id))throw new Error('Invalid saved source ID.');
      const source=await request('/api/memo/'+id);
      const {benchmarkBrief}=await import('../server/gm.mjs');const {optimizeSlate}=await import('../server/optimizer.mjs');
      const constraints=optimizeSlate(source.memo.items,source.memo.constraints).constraints;
      const digest=createHash('sha256').update(JSON.stringify(benchmarkBrief(source,constraints))).digest('hex');
      if(digests.has(digest))throw new Error('Repeated booking briefs are not independent evaluation cases.');digests.add(digest);
    }
    mkdirSync('artifacts',{recursive:true});path=join('artifacts','evaluation-'+randomUUID()+'.json');
    output={createdAt:new Date().toISOString(),manifest:input,briefDigests:[...digests],status:'running',batches:[],reviewSourceIds:[],method:'All predeclared briefs and attempts retained. Only each first trial can enter independent review. No optimizer score establishes superiority.'};
    const save=()=>writeFileSync(path,JSON.stringify(output,null,2));save();
    const config=await request('/api/benchmarks/config');
    if(!config.enabled){output.status='blocked';output.blocker='Missing live LLM configuration';output.configuration=config;save();}
    else {
      for(const sourceId of input.sourceIds){
        try {const batch=await request('/api/benchmarks',{sourceId,trials:input.trials});output.batches.push(batch);if(batch.reviewSourceId)output.reviewSourceIds.push(batch.reviewSourceId);save();}
        catch(error){output.batches.push({sourceId,status:'request_failed',reason:error.message});output.status='interrupted';save();break;}
        // Respect the server's two-batch/minute limit; this CLI is deliberately sequential.
        if(sourceId!==input.sourceIds.at(-1))await new Promise(resolve=>setTimeout(resolve,31000));
      }
      if(output.status==='running')output.status='complete';save();
    }
    console.log(JSON.stringify({path,status:output.status,reviewSourceIds:output.reviewSourceIds,blocker:output.blocker},null,2));
    if(output.status!=='complete')process.exitCode=1;
  }catch(error){if(output&&path){output.status='interrupted';output.error=error.message;writeFileSync(path,JSON.stringify(output,null,2));}console.error(error.message);process.exitCode=1;}
}
