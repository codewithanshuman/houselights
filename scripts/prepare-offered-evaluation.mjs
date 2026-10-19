import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {rankOfferedEvaluationPool} from '../server/evaluation.mjs';
import {buildDecisionProof} from '../server/decision-proof.mjs';
import {Run,closeQloo,isMock} from '../server/qloo.mjs';
import * as store from '../server/store.mjs';

// Apply the same pool rule to every case before any control is generated.
const manifest=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(isMock()||!process.env.QLOO_API_KEY)throw new Error('Live Qloo configuration is required.');
if(!Array.isArray(manifest.sourceIds)||manifest.sourceIds.length<2||manifest.sourceIds.length>10||new Set(manifest.sourceIds).size!==manifest.sourceIds.length)throw new Error('Supply 2–10 distinct prepared source IDs.');
const sources=manifest.sourceIds.map(id=>store.load(id));
if(sources.some(s=>!s||s.mock||s.benchmark))throw new Error('Every source must be live and prepared before a benchmark.');
mkdirSync('artifacts',{recursive:true});
const path=`artifacts/evaluation-offered-${randomUUID()}.json`;
const declaration={rule:'Keep all resolved offered artists; exclude all discovered candidates. Re-rank the full offered pool before controls.',
  parents:sources.map(source=>({sourceId:source.id,poolIds:source.memo.items.filter(item=>!item.found).map(item=>item.id)}))};
const output={createdAt:new Date().toISOString(),declaration,declarationDigest:'sha256:'+createHash('sha256').update(JSON.stringify(declaration)).digest('hex'),
  status:'running',sourceIds:[],cases:[],trials:manifest.trials??2};
const save=()=>writeFileSync(path,JSON.stringify(output,null,2));save();
try{
  for(const source of sources){
    const offset=source.receipts.reduce((max,r)=>Math.max(max,Number(/^v(\d+)$/.exec(r.id)?.[1]??0)),0);
    const run=new Run({mode:'live',budget:1,receiptPrefix:'v',receiptOffset:offset,cacheStore:new Map()});
    try{
      const next=await rankOfferedEvaluationPool(source,run);next.decisionProof=buildDecisionProof(next);
      const sourceId=store.save(next);store.retain(sourceId);
      const complete=next.memo.items.every(item=>item.evidence.rank===true);
      output.sourceIds.push(sourceId);output.cases.push({parentId:source.id,sourceId,city:next.memo.input.city,status:complete?'prepared':'incomplete_rank',ranked:next.memo.quality.ranked,poolSize:next.memo.items.length,proofStatus:next.decisionProof.status});
    }catch(error){output.cases.push({parentId:source.id,status:'failed',reason:error.message,receipts:run.receipts});}
    save();console.log(JSON.stringify(output.cases.at(-1)));
  }
  output.status=output.cases.every(c=>c.status==='prepared')?'complete':'partial';save();
  console.log(JSON.stringify({path,status:output.status,sourceIds:output.sourceIds}));
}finally{await closeQloo();}
