import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {verifyPublicRelease} from '../server/release-check.mjs';
import {createVerifiedBackup,verifyRestore} from '../server/backup.mjs';

const output=resolve(process.argv[2]??'artifacts/release-rehearsal-'+Date.now());
mkdirSync(output,{recursive:false});
const data=join(output,'data'),repo=resolve(import.meta.dirname,'..'),logs=[];
const allocator=createServer();allocator.listen(0,'127.0.0.1');await once(allocator,'listening');
const port=allocator.address().port;await new Promise(resolve=>allocator.close(resolve));
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
const dirty=!!execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim();
const env={...process.env,DATA_DIR:data,PORT:String(port),HOST:'127.0.0.1',PUBLIC_DEMO:'1',NODE_ENV:'production',
  ORGANIZER_TOKEN:randomBytes(32).toString('hex'),QLOO_MODE:'mock',LLM_MODE:'off',PUBLIC_LANDING_PAGE:'judge',
  JUDGE_CASES_FILE:join(repo,'deploy','judge-cases.json'),RELEASE_COMMIT:revision};
for(const key of ['QLOO_API_KEY','GROQ_API_KEY','ANTHROPIC_API_KEY'])delete env[key];
let child;
async function stop(){
  if(child&&child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}
  child=null;
}
async function start(){
  child=spawn(process.execPath,['server/index.mjs'],{cwd:repo,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>logs.push(chunk.toString()));child.stderr.on('data',chunk=>logs.push(chunk.toString()));
  for(let tries=0;tries<80;tries++){
    if(child.exitCode!==null||child.signalCode!==null)throw new Error('Rehearsal server stopped unexpectedly.');
    try{if((await fetch(`http://127.0.0.1:${port}/healthz`,{signal:AbortSignal.timeout(500)})).ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  // Include the server's own output so a slow or failed start explains itself.
  throw new Error(`Rehearsal server did not become healthy within the wait. Last server output:\n${logs.join('').slice(-1500)||'(none)'}`);
}
try{
  await start();
  const http=await verifyPublicRelease(`http://127.0.0.1:${port}`,{allowLocal:true,allowSynthetic:true,requireRecordedCase:true,expectedCommit:revision});
  if(!http.passed)throw new Error('HTTP rehearsal failed: '+http.checks.filter(c=>!c.passed).map(c=>c.name).join(', '));
  // These subprocesses write only the explicitly isolated rehearsal DATA_DIR.
  const prepared=JSON.parse(execFileSync(process.execPath,['scripts/container-drill.mjs','prepare'],{cwd:repo,env,windowsHide:true,encoding:'utf8',timeout:45000}));
  await stop();await start();
  const retained=JSON.parse(execFileSync(process.execPath,['scripts/container-drill.mjs','verify'],{cwd:repo,env,windowsHide:true,encoding:'utf8',timeout:45000}));
  const backup=await createVerifiedBackup(join(data,'houselights.sqlite'),join(output,'backup'));
  const restored=await verifyRestore(join(output,'backup'),join(output,'restored'));
  const report={passed:true,scope:'Isolated local Node process restart; not a hosted VM or Docker result',revision,dirtyWorkingTree:dirty,
    http,prepared,retained,backupIntegrity:backup.integrity,restoredIntegrity:restored.integrity,providerCalls:0};
  writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({passed:true,output,checks:http.checks.length,providerCalls:0,scope:report.scope}));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{await stop();writeFileSync(join(output,'server.log'),logs.join(''),{flag:'wx'});}
