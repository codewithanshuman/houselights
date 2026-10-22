const round=n=>Math.round(n*100)/100;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function releaseOrigin(value,{allowLocal=false}={}) {
  let url;try{url=new URL(value);}catch{throw new Error('Provide the deployment origin.');}
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.protocol!=='https:'&&!(allowLocal&&loopback&&url.protocol==='http:')||loopback&&!allowLocal)
    throw new Error('Use a public HTTPS origin, or explicitly allow a local rehearsal.');
  return url.origin;
}

// Anonymous checks only. No credentials are transmitted and no paid provider
// workflow, saved plan, ballot, approval or booking is created.
export async function verifyPublicRelease(value,{allowLocal=false,allowSynthetic=false,expectedCommit,fetcher=fetch}={}) {
  const origin=releaseOrigin(value,{allowLocal}),checks=[],cases=[];
  const record=(name,passed,detail)=>checks.push({name,passed:!!passed,...(detail?{detail}: {})});
  async function request(path,{body,format='json'}={}){
    const response=await fetcher(origin+path,{redirect:'error',signal:AbortSignal.timeout(20000),
      ...(body!==undefined?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
    const text=await response.text();
    if(text.length>5_000_000)throw new Error('A release response exceeded the inspection limit.');
    const data=format==='json'?JSON.parse(text):text;
    return {status:response.status,cache:response.headers.get('cache-control')??'',csp:response.headers.get('content-security-policy')??'',data};
  }
  try{
    const health=await request('/healthz');
    record('health',health.status===200&&health.data.ok===true);
    record('health-not-cached',health.cache.includes('no-store'));
    record('production-access-mode',health.data.protected===true);
    record('data-mode',allowSynthetic||health.data.mock===false);
    record('qloo-key-configured',allowSynthetic||health.data.keyed===true,'Configuration is not a live provider test.');
    record('llm-configured',allowSynthetic||health.data.llm===true,'Configuration is not a live provider test.');
    if(expectedCommit)record('deployed-commit',health.data.release===expectedCommit);
    const access=await request('/api/access');
    record('anonymous-is-read-only',access.status===200&&access.data.protected===true&&access.data.editable===false);
    if(!checks.find(c=>c.name==='anonymous-is-read-only').passed)throw new Error('Access protection failed; further checks stopped.');
    for(const path of ['/api/judge/cases','/api/research-runs','/api/benchmarks','/api/demand/plan','/api/demand/twins','/api/financial/jobs']){
      const response=await request(path,{body:{}});
      record('protected-write:'+path,response.status===401);
    }
    record('protected-private-read',(await request('/api/studies/missing-release-check')).status===401);
    record('protected-demand-model',(await request('/api/demand/model')).status===401);
    record('protected-reported-outcomes',(await request('/api/demand/reported-outcomes')).status===401);
    record('protected-audience-twin',(await request('/api/demand/twins/000000000000000000000000')).status===401);
    record('protected-twin-validation',(await request('/api/demand/twin-validation')).status===401);
    record('protected-financial-validation',(await request('/api/financial/validation')).status===401);
    record('protected-financial-job',(await request('/api/financial/jobs/000000000000000000000000')).status===401);
    for(const path of ['/judge.html','/index.html','/review.html','/evidence.html','/demand.html','/financial.html']){
      const page=await request(path,{format:'text'});
      record('page:'+path,page.status===200&&/<!doctype html/i.test(page.data));
      if(path==='/demand.html')record('audience-twin-ui',page.data.includes('id="research-twin"')&&page.data.includes('id="twin-seeds"')&&
        page.data.includes('id="load-twin"')&&page.data.includes('id="add-seed"'));
      if(path==='/financial.html')record('financial-risk-ui',page.data.includes('id="chart"')&&page.data.includes('id="frontier"')&&page.data.includes('id="stress"'));
      if(path==='/judge.html')record('content-security-policy',page.csp.includes("script-src 'self'")&&page.csp.includes("frame-ancestors 'none'"));
    }
    const financialDemo=await request('/financial-demo.json');
    record('published-financial-scenario',financialDemo.status===200&&financialDemo.data.label?.includes('SYNTHETIC')&&
      financialDemo.data.result?.status==='scenario_complete'&&financialDemo.data.result.assumptionResults?.[0]?.rows?.length>=5);
    const shocks=await request('/shocks-summary.json');
    record('published-shock-study',shocks.status===200&&shocks.data.summary?.houselights?.shocks===93&&shocks.data.headlineDenominator?.candidateCount===12);
    const reviews=await request('/api/evidence/reviews');
    record('review-evidence-status',reviews.status===200&&Number.isInteger(reviews.data.completedReviewers)&&Array.isArray(reviews.data.cases));
    const catalog=await request('/api/judge/cases');
    record('catalog-not-cached',catalog.cache.includes('no-store'));
    record('published-cases',catalog.status===200&&Array.isArray(catalog.data.cases)&&catalog.data.cases.length>0);
    if(!Array.isArray(catalog.data.cases))throw new Error('No valid public case catalog.');
    // Three calculations per case, four cases maximum: below the 20/IP/min cap.
    for(const item of catalog.data.cases.slice(0,4)){
      const path='/api/judge/cases/'+item.id,baseline=await request(path),b=baseline.data;
      if(!b.snapshot?.memo)throw new Error('A public case is missing its decision inputs.');
      const budget=b.snapshot.memo.constraints.budget;
      const same=await request(path+'/experiment',{body:{budget}});
      record(item.id+':baseline-replay',same.status===200&&same.data.providerCalls===0&&same.data.persisted===false&&equal(same.data.snapshot?.memo.slate.selectedIds,b.snapshot.memo.slate.selectedIds));
      const tighter=Math.max(0,Math.floor((b.snapshot.memo.slate.totalFee??budget)*.9));
      const changed=await request(path+'/experiment',{body:{budget:tighter}});
      const slate=changed.data.snapshot?.memo.slate,selected=b.snapshot.memo.items.filter(i=>slate?.selectedIds.includes(i.id));
      record(item.id+':budget-check',changed.status===200&&changed.data.providerCalls===0&&changed.data.persisted===false&&
        typeof slate?.feasible==='boolean'&&(!slate.feasible||(round(selected.reduce((sum,i)=>sum+i.terms.fee,0))===slate.totalFee&&slate.totalFee<=tighter)));
      const receipt=b.snapshot.memo.items.flatMap(i=>i.evidenceReceipts?.rank??[]).find(id=>b.snapshot.receipts.some(r=>r.id===id));
      if(receipt){
        const withdrawn=await request(path+'/experiment',{body:{withdrawReceiptId:receipt}});
        record(item.id+':evidence-withdrawal',withdrawn.status===200&&withdrawn.data.providerCalls===0&&withdrawn.data.comparison?.affectedIds.length>0&&withdrawn.data.proof?.status==='blocked');
      }
      const withoutQloo=await request(path+'/experiment',{body:{qlooOff:true}});
      record(item.id+':qloo-off',withoutQloo.status===200&&withoutQloo.data.qlooOff===true&&withoutQloo.data.providerCalls===0&&
        withoutQloo.data.snapshot?.memo.items.every(i=>i.fit===null&&i.evidence.rank===false));
      const after=await request(path);
      record(item.id+':case-unchanged',equal(after.data,b));
      cases.push({id:item.id,title:item.title,synthetic:b.snapshot.mock===true,controlStatus:b.methods?.llm.status??'unavailable'});
    }
  }catch(error){
    record('verification-completed',false,error.name==='TimeoutError'?'A request timed out.':error.message);
  }
  return {version:'1.0',checkedAt:new Date().toISOString(),origin,scope:allowLocal?'local-rehearsal':'public-http-check',
    passed:checks.length>0&&checks.every(c=>c.passed),checks,cases,
    notVerified:['Host restart and persistent volume','Live Qloo/LLM requests','Human outcome validation','Organizer-attested artwork and entrant eligibility'],
    sideEffects:'Anonymous, temporary judge experiments and request-quota increments only.'};
}
