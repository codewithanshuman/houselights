import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,copyFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {seededShockCases,syntheticShockCases,reproduceShocks,shocksMarkdown} from '../server/shocks.mjs';
import {benchmarkBrief} from '../server/gm.mjs';
import {festivalBaselineAttempt,llmConfiguration,providerPacing} from '../server/llm.mjs';

const capture=process.argv.includes('--capture-live'),repeats=3;
const resultsDir=join(process.cwd(),'results'),fixturePath=join(resultsDir,'shocks-llm-fixture.json');
const realSource=JSON.parse(readFileSync(join(process.cwd(),'deploy','judge-cases.json'),'utf8'));
const syntheticSource=JSON.parse(readFileSync(join(process.cwd(),'evals','shock-cases.json'),'utf8'));
mkdirSync(resultsDir,{recursive:true});
let fixture=existsSync(fixturePath)?JSON.parse(readFileSync(fixturePath,'utf8')):{version:'2.0',baselines:{},responses:{}};
if(fixture.version==='1.0')fixture={version:'2.0',baselines:{},responses:Object.fromEntries(Object.entries(fixture.responses).map(([key,row])=>[key,[row]]))};
if(fixture.version!=='2.0'||!fixture.responses||!fixture.baselines)throw new Error('Invalid shock LLM fixture.');
if(capture)for(const [key,rows] of Object.entries(fixture.responses))fixture.responses[key]=rows.filter(row=>!(row.status==='unavailable'&&row.generation?.httpStatus===429));
if(capture&&!llmConfiguration().enabled)throw new Error('Live capture requires an enabled LLM provider in the server environment.');
const saveFixture=()=>{
  const temp=fixturePath+'.tmp';writeFileSync(temp,JSON.stringify(fixture,null,2)+'\n');
  for(let attempt=0;attempt<8;attempt++)try{renameSync(temp,fixturePath);return;}
  catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100*(attempt+1));}
  // Antivirus/indexing can temporarily forbid replacing an open Windows file.
  // Preserve the capture even if an atomic replace remains unavailable.
  copyFileSync(temp,fixturePath);rmSync(temp,{force:true});
};
async function captureResponse(key,trial,brief,briefDigest){
  let response;
  for(let attempt=0;attempt<3;attempt++){
    response=await festivalBaselineAttempt(brief);
    if(response.receipt?.httpStatus!==429||attempt===2)break;
    const retryAfter=Number(response.receipt?.retryAfter);
    const pause=Math.min(60000,Math.max(15000,Number.isFinite(retryAfter)&&retryAfter>0?retryAfter*1000:30000,providerPacing(response.receipt)));
    await new Promise(resolve=>setTimeout(resolve,pause));
  }
  const receipt=response.receipt??{};
  const row={briefDigest,status:response.status,selectedIds:response.proposal?.selectedIds??null,
    generation:{provider:receipt.provider,model:receipt.model,mode:receipt.mode,status:receipt.status,httpStatus:receipt.httpStatus??null,
      promptDigest:receipt.promptDigest,requestDigest:receipt.requestDigest,responseDigest:receipt.responseDigest??null,
      toolsAllowed:receipt.toolsAllowed,startedAt:receipt.startedAt}};
  console.log(`${key} trial ${trial} ${row.status}${row.generation.httpStatus?` HTTP ${row.generation.httpStatus}`:''}`);
  return row;
}
let synthetic=syntheticShockCases(syntheticSource,fixture.baselines);
if(capture)for(const record of synthetic){
  if(fixture.baselines[record.id]?.status==='responded')continue;
  const brief=benchmarkBrief(record.snapshot,record.snapshot.memo.slate.constraints);
  const briefDigest='sha256:'+createHash('sha256').update(JSON.stringify(brief)).digest('hex');
  fixture.baselines[record.id]=await captureResponse(`${record.id}:original-control`,1,brief,briefDigest);
  saveFixture();
}
synthetic=syntheticShockCases(syntheticSource,fixture.baselines);
// Get the 12-candidate rate first if a free provider quota interrupts capture.
const cases=[...synthetic.sort((a,b)=>b.snapshot.memo.items.length-a.snapshot.memo.items.length),...seededShockCases(realSource)];
const reprompt=capture?async({key,trial,brief,briefDigest})=>{
  return captureResponse(key,trial,brief,briefDigest);
}:undefined;
const result=await reproduceShocks(cases,{fixture:fixture.responses,reprompt,onCaptured:capture?saveFixture:undefined,repeats});
writeFileSync(join(resultsDir,'shocks.json'),JSON.stringify(result,null,2)+'\n');
writeFileSync(join(resultsDir,'shocks.md'),shocksMarkdown(result));
if(capture)saveFixture();
console.log(JSON.stringify({cases:cases.length,shocks:result.rows.length,headline:result.headline,summary:result.summary,
  files:['results/shocks.json','results/shocks.md',...(capture?['results/shocks-llm-fixture.json']:[])]}));
