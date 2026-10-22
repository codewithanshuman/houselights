import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {seededShockCases,reproduceShocks,shocksMarkdown} from '../server/shocks.mjs';
import {festivalBaselineAttempt,llmConfiguration,providerPacing} from '../server/llm.mjs';

const capture=process.argv.includes('--capture-live');
const resultsDir=join(process.cwd(),'results'),fixturePath=join(resultsDir,'shocks-llm-fixture.json');
const source=JSON.parse(readFileSync(join(process.cwd(),'deploy','judge-cases.json'),'utf8'));
const cases=seededShockCases(source);
mkdirSync(resultsDir,{recursive:true});
const fixture=existsSync(fixturePath)?JSON.parse(readFileSync(fixturePath,'utf8')):{version:'1.0',responses:{}};
if(fixture.version!=='1.0'||!fixture.responses||typeof fixture.responses!=='object')throw new Error('Invalid shock LLM fixture.');
if(capture&&!llmConfiguration().enabled)throw new Error('Live capture requires an enabled LLM provider in the server environment.');
if(capture)for(const [key,row] of Object.entries(fixture.responses))if(row.status==='unavailable'&&row.generation?.httpStatus===429)delete fixture.responses[key];
const saveFixture=()=>{
  const temp=fixturePath+'.tmp';writeFileSync(temp,JSON.stringify(fixture,null,2)+'\n');renameSync(temp,fixturePath);
};
const reprompt=capture?async({key,brief,briefDigest})=>{
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
  fixture.responses[key]=row;saveFixture();
  console.log(`${key} ${row.status}${row.generation.httpStatus?` HTTP ${row.generation.httpStatus}`:''}`);
  return row;
}:undefined;
const result=await reproduceShocks(cases,{fixture:fixture.responses,reprompt});
writeFileSync(join(resultsDir,'shocks.json'),JSON.stringify(result,null,2)+'\n');
writeFileSync(join(resultsDir,'shocks.md'),shocksMarkdown(result));
console.log(JSON.stringify({cases:cases.length,shocks:result.rows.length,summary:result.summary,
  files:['results/shocks.json','results/shocks.md',...(capture?['results/shocks-llm-fixture.json']:[])]}));
