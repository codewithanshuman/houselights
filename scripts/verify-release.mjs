import {writeFileSync} from 'node:fs';
import {verifyPublicRelease} from '../server/release-check.mjs';
const [origin,...args]=process.argv.slice(2);
const value=name=>args.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
try{
  if(!origin||args.some(a=>!['--allow-local','--allow-synthetic'].includes(a)&&!a.startsWith('--output=')&&!a.startsWith('--commit=')))
    throw new Error('Usage: npm run release:verify -- https://host [--output=new-report.json] [--commit=SHA] [--allow-local] [--allow-synthetic]');
  const report=await verifyPublicRelease(origin,{allowLocal:args.includes('--allow-local'),allowSynthetic:args.includes('--allow-synthetic'),requireRecordedCase:true,expectedCommit:value('--commit')});
  if(value('--output'))writeFileSync(value('--output'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify(report,null,2));
  if(!report.passed)process.exitCode=1;
}catch(error){console.error(error.message);process.exitCode=1;}
