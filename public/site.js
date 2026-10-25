/* Shared across every Houselights page: one nav, one footer (with the live release
   hash), one fetch helper (timeout, retry, friendly errors) and one number format. */
'use strict';
(()=>{
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Numbers: whole currency with a symbol and separators; affinity always to 4 places.
  const money=(value,currency='USD')=>value==null||!Number.isFinite(Number(value))?'—':new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:Number(value)%1?2:0,minimumFractionDigits:Number(value)%1?2:0}).format(Number(value));
  const signedMoney=(value,currency='USD')=>value==null?'—':(value<0?'−':value>0?'+':'')+money(Math.abs(value),currency);
  const affinity=value=>Number.isFinite(value)?value.toFixed(4):'—';
  const count=value=>Number.isFinite(value)?value.toLocaleString('en-US'):'—';

  // Every client fetch gets a timeout and a readable failure. Rate limits report when to
  // retry; nothing ever renders a raw JSON body.
  class FetchProblem extends Error{constructor(kind,message,retryAfter=null,status=null){super(message);this.kind=kind;this.retryAfter=retryAfter;this.status=status;}}
  async function fetchJSON(url,{timeout=15000,retries=1,method='GET',body,headers={},signal}={}){
    let last;
    for(let attempt=0;attempt<=retries;attempt++){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('timeout','TimeoutError')),timeout);
      if(signal)signal.addEventListener('abort',()=>controller.abort(signal.reason),{once:true});
      try{
        const response=await fetch(url,{method,headers:body?{'content-type':'application/json',...headers}:headers,body:body?JSON.stringify(body):undefined,signal:controller.signal});
        clearTimeout(timer);
        if(response.status===429){const wait=Number(response.headers.get('retry-after'))||60;throw new FetchProblem('rate-limit',`Too many requests right now. Try again in about ${wait} seconds.`,wait,429);}
        if(!response.ok){
          let message='';try{message=(await response.json()).error??'';}catch{}
          throw new FetchProblem(response.status>=500?'server':'request',typeof message==='string'&&message&&message.length<240?message:response.status>=500?'The server could not complete this request.':'This request was not accepted.',null,response.status);
        }
        return await response.json();
      }catch(error){
        clearTimeout(timer);
        last=error instanceof FetchProblem?error:error?.name==='AbortError'||error?.name==='TimeoutError'?new FetchProblem('timeout','The server took too long to answer.'):new FetchProblem('network','The server could not be reached. Check your connection.');
        if(last.kind==='rate-limit'||last.kind==='request'||signal?.aborted)break;
        if(attempt<retries)await new Promise(resolve=>setTimeout(resolve,800*(attempt+1)));
      }
    }
    throw last;
  }
  // A designed state block: loading skeleton, error with retry, or an informational state.
  function state(target,{kind='loading',title,text,retry}={}){
    if(!target)return;
    target.setAttribute('aria-busy',kind==='loading'?'true':'false');
    if(kind==='loading'){target.innerHTML='<div class="skeleton" aria-hidden="true"></div><span class="sr-only">Loading</span>';return;}
    const labels={timeout:'Taking too long',network:'Offline or unreachable','rate-limit':'Busy for a moment',server:'Server problem',request:'Not accepted',mock:'Synthetic data',partial:'Partial evidence',empty:'Nothing here yet'};
    target.innerHTML=`<div class="state state-${e(kind)}" role="status"><strong>${e(title??labels[kind]??'Unavailable')}</strong><p>${e(text??'')}</p>${retry?'<button type="button" class="button subtle small" data-state-retry>Try again</button>':''}</div>`;
    if(retry)target.querySelector('[data-state-retry]').addEventListener('click',()=>retry(),{once:true});
  }

  // One navigation and footer for all pages. Organizer tools are uncalibrated and sit
  // behind a menu so judges land on the Booking Desk.
  const pages=[['booking','/judge.html','Booking Desk'],['evidence','/evidence.html','Evidence & limits'],['proof','/proof-lab.html','Qloo Proof Lab']];
  const tools=[['/workspace.html','Organizer workspace',false],['/index.html','Slate studio',false],['/demand.html','Demand Lab and Audience Twin',true],['/financial.html','Financial Risk Lab',true],['/index.html#gauntlet','Festival GM and Gauntlet',true]];
  function renderNav(header){
    const current=header.dataset.siteNav;
    header.innerHTML=`<nav class="site-nav" aria-label="Main navigation"><a class="site-brand" href="/judge.html"><img src="/assets/brand/portal-logo-v2.webp" alt="" width="36" height="36"><span>Houselights<span class="site-brand-dot">.</span></span></a>
      <div class="site-links">${pages.map(([key,href,label])=>`<a href="${href}"${key===current?' aria-current="page"':''}>${e(label)}</a>`).join('')}
      <details class="site-tools"><summary>Organizer tools</summary><div class="site-tools-menu">${tools.map(([href,label,uncalibrated])=>`<a href="${href}">${e(label)}${uncalibrated?' <span class="badge badge-warn">uncalibrated</span>':''}</a>`).join('')}<p>Private planning tools. Their forecasts are not calibrated against real outcomes.</p></div></details></div></nav>`;
    const tools_=header.querySelector('.site-tools');
    document.addEventListener('click',event=>{if(tools_.open&&!tools_.contains(event.target))tools_.open=false;});
    tools_.addEventListener('keydown',event=>{if(event.key==='Escape'){tools_.open=false;tools_.querySelector('summary').focus();}});
  }
  function renderFooter(footer){
    footer.innerHTML=`<div class="site-footer-inner"><span>Houselights<span class="site-brand-dot">.</span> Booking decisions with Qloo receipts.</span><span class="site-footer-links"><a href="/evidence.html">Evidence &amp; limits</a><a href="https://github.com/codewithanshuman/houselights">Source (MIT)</a></span><span class="site-release">Release <code id="site-release">…</code></span></div>`;
    fetchJSON('/healthz',{timeout:8000,retries:0}).then(health=>{const node=document.getElementById('site-release');if(node)node.textContent=health.release?String(health.release).slice(0,7):'local build';}).catch(()=>{const node=document.getElementById('site-release');if(node)node.textContent='unavailable';});
  }
  function start(){
    document.querySelectorAll('[data-site-nav]').forEach(renderNav);
    document.querySelectorAll('[data-site-footer]').forEach(renderFooter);
  }
  window.HL={e,money,signedMoney,affinity,count,fetchJSON,FetchProblem,state};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
