import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {buildMemo} from '../server/agent.mjs';
import {Run,closeQloo,isMock} from '../server/qloo.mjs';
import {buildDecisionProof} from '../server/decision-proof.mjs';
import * as store from '../server/store.mjs';
const inputPath=process.argv[2]??'evals/diverse-briefs.json';
const manifest=JSON.parse(readFileSync(inputPath,'utf8'));
if(isMock()||!process.env.QLOO_API_KEY)throw new Error('This preparation command requires configured live Qloo; synthetic results are never substituted.');
if(!Array.isArray(manifest.briefs)||manifest.briefs.length<2||manifest.briefs.length>10||!Number.isInteger(manifest.workflowBudgetPerBrief)||manifest.workflowBudgetPerBrief<10||manifest.workflowBudgetPerBrief>30)throw new Error('Use 2–10 briefs and a 10–30 workflow budget.');
for(const b of manifest.briefs)if(!b.city||!Array.isArray(b.anchors)||!b.anchors.length||b.anchors.length>3||!Array.isArray(b.offers)||!b.offers.length||b.offers.length>6||b.fees?.length!==b.offers.length||b.fees.some(f=>!Number.isFinite(f)||f<0)||!Number.isFinite(b.budget)||b.budget<0||!Number.isInteger(b.slots)||b.slots<1||b.slots>6||!['GBP','USD','EUR','INR'].includes(b.currency))throw new Error('Invalid evaluation brief; no provider calls made.');
mkdirSync('artifacts',{recursive:true});
const path=`artifacts/evaluation-preparation-${randomUUID()}.json`;
const output={createdAt:new Date().toISOString(),manifest,manifestDigest:'sha256:'+createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),status:'running',cases:[],sourceIds:[],trials:manifest.trials??2};
const save=()=>writeFileSync(path,JSON.stringify(output,null,2));save();
// Research uses deterministic claim selection so Groq is reserved for controls.
process.env.LLM_MODE='off';
try {
  for(const b of manifest.briefs){
    const input={city:b.city,anchors:b.anchors,offers:b.offers,currency:b.currency,exampleBookingTerms:true,
      constraints:{budget:b.budget,slots:b.slots,maxPerGenre:b.slots,discoveryMin:0,riskTolerance:50,lockedIds:[],excludedIds:[]},
      terms:Object.fromEntries(b.offers.map((name,i)=>[name,{fee:b.fees[i],genre:b.genre,available:true}]))};
    const run=new Run({mode:'live',budget:manifest.workflowBudgetPerBrief,deadlineMs:180000,cacheStore:new Map()});
    try {
      const memo=await buildMemo(input,run);
      if(!memo){output.cases.push({label:b.label,status:'unresolved',receipts:run.receipts});save();continue;}
      const snapshot={input,memo,mock:false,receipts:run.receipts};snapshot.decisionProof=buildDecisionProof(snapshot);
      const sourceId=store.save(snapshot);store.retain(sourceId);
      output.cases.push({label:b.label,sourceId,status:memo.slate.feasible?'prepared':'infeasible',resolved:memo.items.length,ranked:memo.quality.ranked,workflows:run.used,proofStatus:snapshot.decisionProof.status,receiptStatuses:run.receipts.map(r=>({id:r.id,status:r.status}))});
      output.sourceIds.push(sourceId);save();console.log(JSON.stringify(output.cases.at(-1)));
    }catch(error){output.cases.push({label:b.label,status:'failed',reason:'Research stopped; inspect retained receipt statuses.',receipts:run.receipts});save();}
  }
  output.status=output.cases.every(c=>c.status==='prepared')?'complete':'partial';save();
  console.log(JSON.stringify({path,status:output.status,sourceIds:output.sourceIds}));
}finally{await closeQloo();}
