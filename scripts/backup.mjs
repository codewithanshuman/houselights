import { join, resolve } from 'node:path';
import { createVerifiedBackup, verifyRestore } from '../server/backup.mjs';
const [mode='create', first, second]=process.argv.slice(2);
try {
  let result;
  if(mode==='create')result=await createVerifiedBackup(join(process.env.DATA_DIR??'./data','houselights.sqlite'),first??join(process.env.DATA_DIR??'./data','backups',new Date().toISOString().replaceAll(':','-')));
  else if(mode==='verify'&&first&&second)result=await verifyRestore(resolve(first),resolve(second));
  else throw new Error('Usage: npm run backup -- create [new-backup-directory] OR npm run backup -- verify backup-directory new-restore-directory');
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
