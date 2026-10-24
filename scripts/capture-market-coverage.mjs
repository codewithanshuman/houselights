import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildMemo} from '../server/agent.mjs';
import {Run,closeQloo,isMock} from '../server/qloo.mjs';
import {rankOfferedEvaluationPool} from '../server/evaluation.mjs';
import {benchmarkFestival,benchmarkBrief} from '../server/gm.mjs';
import {llmConfiguration,providerPacing} from '../server/llm.mjs';
import {publicJudgeSnapshot} from '../server/judge.mjs';
import * as store from '../server/store.mjs';
const hash=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main(){
 const protocol=JSON.parse(readFileSync('evals/market-coverage-protocol.json','utf8'));
 const committed=JSON.parse(execFileSync('git',['show','HEAD:evals/market-coverage-protocol.json'],{encoding:'utf8'}));
 if(hash(protocol)!==hash(committed)||protocol.briefs.length!==7||protocol.maximumLlmRequests!==7||protocol.maximumQlooWorkflowAttempts!==175)throw new Error('Protocol must be committed and bounded.');
 const path='artifacts/market-coverage-private.json';
 execFileSync('git',['check-ignore','--quiet','--',path],{stdio:'ignore'});
 let journal;
 if(existsSync(path)){const bytes=readFileSync(path);const expected=readFileSync('docs/market-coverage.md','utf8').match(/file digest is `([a-f0-9]{64})`/)?.[1];if('sha256:'+expected!=='sha256:'+createHash('sha256').update(bytes).digest('hex'))throw new Error('Private journal digest mismatch.');journal=JSON.parse(bytes);if(journal.protocolDigest!==hash(protocol))throw new Error('Existing journal belongs to another protocol.');}
 else{
  if(process.argv[2]!=='--capture'||isMock()||!process.env.QLOO_API_KEY)throw new Error('Explicit live capture configuration is required.');
  const c=llmConfiguration();if(!c.enabled||c.provider!==protocol.provider||c.model!==protocol.model)throw new Error('Declared model unavailable.');
  journal={protocolDigest:hash(protocol),createdAt:new Date().toISOString(),qlooWorkflows:0,modelRequests:0,reservedTokens:0,cases:[]};
  writeFileSync(path,JSON.stringify(journal,null,2),{flag:'wx'});
  const save=()=>writeFileSync(path,JSON.stringify(journal,null,2));
  let modelLimited=false;
  for(const b of protocol.briefs){
   const entry={label:b.label,city:b.city,status:'research_started'};journal.cases.push(entry);save();
   process.env.LLM_MODE='off';
   const input={city:b.city,anchors:b.anchors,offers:b.offers,currency:b.currency,exampleBookingTerms:true,
    constraints:b.constraints,terms:Object.fromEntries(b.offers.map((name,i)=>[name,{fee:b.fees[i],genre:b.genres[i],available:true}]))};
   const run=new Run({mode:'live',budget:protocol.workflowBudgetPerBrief,deadlineMs:180000});
   try{
    const memo=await buildMemo(input,run);
    entry.receipts=run.receipts;
    if(!memo){entry.status='unresolved';continue;}
    const source={input,memo,mock:false,receipts:run.receipts};
    const parentId=store.save(source,{retain:true});entry.parentId=parentId;
    const rank=new Run({mode:'live',budget:1,receiptPrefix:'v',deadlineMs:45000});
    let next;
    try{next=await rankOfferedEvaluationPool({...source,id:parentId},rank);}finally{journal.qlooWorkflows+=rank.used;}
    const sourceId=store.save(next,{retain:true});entry.sourceId=sourceId;
    const bound=Buffer.byteLength(JSON.stringify(benchmarkBrief(next,next.memo.constraints)),'utf8')+1024+4096;
    const complete=next.memo.items.every(item=>item.evidence.rank&&item.rankCoverage?.complete!==false);
    if(!modelLimited&&journal.reservedTokens+bound<=protocol.conservativeLlmTokenBudget){
     process.env.LLM_MODE='live';
     if(complete){journal.reservedTokens+=bound;entry.controlState='started';save();}
     next.benchmark=await benchmarkFestival(next);next.benchmarkTrial={index:1,reviewTrial:1};
     if(next.benchmark.generation?.mode==='live')journal.modelRequests++;
     entry.benchmark=next.benchmark;entry.controlState=next.benchmark.status;
     modelLimited=next.benchmark.generation?.httpStatus===429;
     const wait=providerPacing(next.benchmark.generation);if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
    }else entry.controlState=modelLimited?'not_attempted_rate_limit':'not_attempted_token_reservation';
    entry.publicSnapshot=publicJudgeSnapshot(next);entry.title='Illustrative: '+b.label;
    entry.status=complete?'published_candidate':'incomplete_rank_candidate';
   }catch{entry.status='failed';entry.failure='Capture or projection did not complete; inspect retained private evidence. No alternate case substituted.';}
   finally{
    journal.qlooWorkflows+=run.used;entry.receipts=run.receipts;
    if(journal.qlooWorkflows>175||journal.modelRequests>7)throw new Error('Declared capture cap exceeded.');
    save();console.log(JSON.stringify({city:b.city,status:entry.status,control:entry.controlState??'not_attempted',qlooWorkflows:journal.qlooWorkflows}));
   }
  }
 }
 // Retain each first trial as an immutable private review source. The original
 // pre-control research stays intact; no provider call is repeated on replay.
 for(const entry of journal.cases){
  if(entry.benchmark&&!entry.reviewSourceId){
   const source=store.load(entry.sourceId);if(!source)throw new Error('Retained source missing.');
   const saved={...source,id:undefined,createdAt:undefined,parentId:source.id,benchmark:entry.benchmark,benchmarkTrial:{index:1,reviewTrial:1}};
   if(hash(publicJudgeSnapshot(saved))!==hash(entry.publicSnapshot))throw new Error('Review source projection changed.');
   entry.reviewSourceId=store.save(saved,{retain:true});
  }
 }
 writeFileSync(path,JSON.stringify(journal,null,2));
 const cases=journal.cases.filter(row=>row.publicSnapshot).map(row=>({title:row.title,snapshot:row.publicSnapshot}));
 writeFileSync('artifacts/market-coverage-public.json',JSON.stringify({version:'1.0',cases},null,2)+'\n');
 const report={version:protocol.version,protocolDigest:journal.protocolDigest,plannedBriefs:7,capturedBriefs:cases.length,
  qlooWorkflows:journal.qlooWorkflows,modelRequests:journal.modelRequests,reservedTokens:journal.reservedTokens,
  cases:journal.cases.map(row=>({city:row.city,status:row.status,control:row.controlState??'not_attempted'})),
  limitation:'Illustrative curated planning inputs with genuine Qloo responses; not independently sampled organizer requests, contracts, judgments or event outcomes.'};
 writeFileSync('results/market-coverage-capture.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({captured:cases.length,planned:7,qlooWorkflows:journal.qlooWorkflows,modelRequests:journal.modelRequests}));
}
try{await main();}catch{console.error('Market coverage capture failed. Private content was not emitted; existing evidence was preserved.');process.exitCode=1;}finally{await closeQloo();}
