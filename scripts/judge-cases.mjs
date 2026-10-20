import {readFileSync,writeFileSync} from 'node:fs';
import {publishJudgeCase,listJudgeCases} from '../server/judge.mjs';
import * as store from '../server/store.mjs';
const [command,...args]=process.argv.slice(2);
try{
  if(command==='publish'){
    const source=store.load(args[0]);if(!source)throw new Error('Saved source not found.');
    const result=publishJudgeCase(source,args.slice(1).join(' '));console.log(JSON.stringify({id:result.id,url:'/judge.html#'+result.id,title:result.title}));
  }else if(command==='export'){
    if(!args[0])throw new Error('Choose a new output file.');
    const cases=listJudgeCases().map(({title,snapshot})=>({title,snapshot}));
    writeFileSync(args[0],JSON.stringify({version:'1.0',cases},null,2),{flag:'wx'});console.log(JSON.stringify({file:args[0],cases:cases.length,contains:'Curated public projections only; no private source records.'}));
  }else if(command==='import'){
    const file=JSON.parse(readFileSync(args[0],'utf8'));
    if(file.version!=='1.0'||!Array.isArray(file.cases)||file.cases.length>20)throw new Error('Expected a version 1.0 export with at most 20 cases.');
    for(const row of file.cases){const result=publishJudgeCase(row.snapshot,row.title);console.log(JSON.stringify({id:result.id,title:result.title}));}
  }else throw new Error('Usage: npm run judge:cases -- publish SOURCE_ID Title | export NEW_FILE.json | import FILE.json');
}catch(error){console.error(error.message);process.exitCode=1;}
