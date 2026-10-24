import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {benchmarkFestival,benchmarkBrief} from '../server/gm.mjs';
import {llmConfiguration,providerPacing} from '../server/llm.mjs';
import {digest,exportReplication} from '../server/replication-study.mjs';
async function main(){
const protocol=JSON.parse(readFileSync('evals/recorded-control-protocol.json','utf8'));
const committed=JSON.parse(execFileSync('git',['show','HEAD:evals/recorded-control-protocol.json'],{encoding:'utf8'}));
if(digest(protocol)!==digest(committed))throw new Error('Commit the protocol before collecting controls.');
const snapshot=JSON.parse(readFileSync('deploy/judge-cases.json','utf8')).cases.find(row=>row.title==='New York: watch a recorded Qloo research run').snapshot;
const path='artifacts/recorded-control-replication-private.json',target='public/recorded-control-study.json';
execFileSync('git',['check-ignore','--quiet','--',path],{stdio:'ignore'});
let journal;
const save=()=>writeFileSync(path,JSON.stringify(journal,null,2));
if(existsSync(path)){
  const bytes=readFileSync(path);
  const expected=readFileSync('docs/recorded-control-replication.md','utf8').match(/file digest is `([a-f0-9]{64})`/)?.[1];
  if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error('Private journal digest mismatch.');
  journal=JSON.parse(bytes);
  // An interrupted request's outcome stays unknown; repeating the command never
  // resamples an attempted trial or consumes additional provider calls.
}else{
  if(process.argv[2]!=='--capture')throw new Error('Use --capture once after preregistration; existing journals only replay.');
  const c=llmConfiguration();
  if(!c.enabled||c.provider!==protocol.provider||c.model!==protocol.model)throw new Error('The declared live provider/model is not configured.');
  const bound=protocol.trials*(Buffer.byteLength(JSON.stringify(benchmarkBrief(snapshot,snapshot.memo.constraints)),'utf8')+1024+protocol.maxCompletionTokensPerTrial);
  if(bound>30000)throw new Error('Conservative experiment token reservation exceeds 30,000.');
  journal={protocolDigest:digest(protocol),createdAt:new Date().toISOString(),tokenReservationUpperBound:bound,trials:[]};
  writeFileSync(path,JSON.stringify(journal,null,2),{flag:'wx'});
  for(let index=1;index<=protocol.trials;index++){
    journal.trials.push({index,startedAt:new Date().toISOString()});save();
    const benchmark=await benchmarkFestival(snapshot);
    journal.trials.at(-1).benchmark=benchmark;save();
    console.log(JSON.stringify({trial:index,status:benchmark.status,httpStatus:benchmark.generation?.httpStatus}));
    if(benchmark.generation?.httpStatus===429||benchmark.status==='not_comparable')break;
    const wait=providerPacing(benchmark.generation);if(index<protocol.trials&&wait)await new Promise(resolve=>setTimeout(resolve,wait));
  }
}
const report=exportReplication(protocol,snapshot,journal);
writeFileSync(target,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output:target,attempted:report.attemptedTrials,planned:report.plannedTrials,
  responses:report.trials.filter(row=>row.available).length,firstTrial:report.trials[0]?.status,additionalQlooCalls:0}));

}
main().catch(()=>{console.error('Recorded-control capture/replay failed. Check the local journal, protocol, provider configuration and public projection. No private content was emitted.');process.exitCode=1;});
