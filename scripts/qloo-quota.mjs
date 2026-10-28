// Default is a local read. --refresh makes exactly one metered HTTP request,
// including when a prior header balance is zero; it never resets the ledger.
import {createQlooHttpFetch,qlooQuotaStatus} from '../server/qloo-http.mjs';
try{
  let httpStatus=null;
  if(process.argv.includes('--refresh')){
    const base=new URL(process.env.QLOO_BASE_URL??'https://api.qloo.com');
    const trusted=new URL(process.env.QLOO_TRUSTED_BASE_URL??base.origin);
    if(base.origin!==trusted.origin||!['https://api.qloo.com','https://hackathon.api.qloo.com'].includes(base.origin))throw new Error('Use a configured, trusted Qloo API endpoint.');
    const request=createQlooHttpFetch({permitHeaderProbe:true});
    const response=await request(new URL('/',base),{headers:{'X-Api-Key':process.env.QLOO_API_KEY,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
    httpStatus=response.status;await response.body?.cancel();if(!response.ok)process.exitCode=1;
  }
  console.log(JSON.stringify({httpStatus,...qlooQuotaStatus()}));
}catch(error){console.error(JSON.stringify({error:error?.code==='QLOO_HTTP_QUOTA'?error.message:'Quota check failed; inspect the configured credential and trusted endpoint privately.'}));process.exitCode=1;}
