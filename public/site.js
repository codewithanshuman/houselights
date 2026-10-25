/* Shared across every Houselights page: one nav, one footer (with the live release
   hash), one fetch helper (timeout, retry, friendly errors) and one number format. */
'use strict';
(()=>{
  // The hash as the page was opened: pages rewrite it later (the Booking Desk adds the case).
  const openedHash=location.hash;
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

  // The navigation is rendered into each page by the server (server/site-chrome.mjs) so it
  // is part of the first paint; this adds the Organizer tools menu behaviour.
  function bindNav(header){
    const tools_=header.querySelector('.site-tools');if(!tools_)return;
    document.addEventListener('click',event=>{if(tools_.open&&!tools_.contains(event.target))tools_.open=false;});
    tools_.addEventListener('keydown',event=>{if(event.key==='Escape'){tools_.open=false;tools_.querySelector('summary').focus();}});
  }
  function renderFooter(footer){
    if(!footer.querySelector('#site-release'))footer.innerHTML=`<div class="site-footer-inner"><span>Houselights<span class="site-brand-dot">.</span> Booking decisions with Qloo receipts.</span><span class="site-footer-links"><a href="/evidence.html">Evidence &amp; limits</a><a href="https://github.com/codewithanshuman/houselights">Source (MIT)</a></span><span class="site-release">Release <code id="site-release">…</code></span></div>`;
    fetchJSON('/healthz',{timeout:8000,retries:0}).then(health=>{const node=document.getElementById('site-release');if(node)node.textContent=health.release?String(health.release).slice(0,7):'local build';}).catch(()=>{const node=document.getElementById('site-release');if(node)node.textContent='unavailable';});
  }
  // Scrollable tables and logs must be reachable by keyboard (WCAG 2.1.1): every scroll
  // container, including ones rendered later, gets tabindex and a name.
  function focusableScrollers(root=document){
    root.querySelectorAll?.('.table-scroll,#receipts').forEach(node=>{
      if(node.hasAttribute('tabindex'))return;
      node.setAttribute('tabindex','0');
      if(!node.hasAttribute('role'))node.setAttribute('role','region');
      if(!node.hasAttribute('aria-label')&&!node.hasAttribute('aria-labelledby')){const caption=node.querySelector('caption')?.textContent?.trim();node.setAttribute('aria-label',caption?caption.slice(0,80)+' (scrollable)':'Scrollable table');}
    });
  }
  function start(){
    document.querySelectorAll('[data-site-nav]').forEach(bindNav);
    // Below-the-fold sections skip layout while the page loads (content-visibility in site.css).
    // Lay them out before the first click or key press, so in-page jumps land where they should
    // in every browser (Firefox and Safari do not correct a smooth scroll for estimated sizes).
    const settle=()=>document.querySelectorAll('.judge-main>*').forEach(node=>{node.style.contentVisibility='visible';});
    const opened=openedHash.length>1?document.getElementById(decodeURIComponent(openedHash.slice(1))):null;
    if(opened&&!document.getElementById('first-screen')?.contains(opened))settle();else['pointerdown','keydown'].forEach(type=>addEventListener(type,settle,{once:true,capture:true}));
    document.querySelectorAll('[data-site-footer]').forEach(renderFooter);
    focusableScrollers();
    new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){focusableScrollers(node);if(node.matches?.('.table-scroll,#receipts'))focusableScrollers(node.parentNode);}}).observe(document.body,{childList:true,subtree:true});
  }
  // Every GET without its own signal gets a 20-second timeout, so no page waits forever
  // on a stalled request. POSTs keep their own progress handling (research can take 150 s).
  const nativeFetch=window.fetch.bind(window);
  window.fetch=(input,init={})=>{
    const method=String(init.method??(input instanceof Request?input.method:'GET')).toUpperCase();
    if(method!=='GET'||init.signal)return nativeFetch(input,init);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new DOMException('The request timed out.','TimeoutError')),20000);
    return nativeFetch(input,{...init,signal:controller.signal}).finally(()=>clearTimeout(timer));
  };
  // Accessible jargon: the explanation shows on hover and keyboard focus, is linked by
  // aria-describedby (not the title attribute) and closes with Escape.
  const TERMS={
    policyPoints:'The optimizer’s internal score: Qloo fit plus small bonuses for local evidence, trends and variety, minus a penalty for missing evidence. A ranking tool, not a forecast of sales.',
    evidencePenalty:'Points subtracted when an act lacks Qloo evidence (rank, local, trend or audience comparison), so unsupported acts cannot win on missing data.',
    cvar:'Conditional value at risk: the average loss across the worst 5% of simulated outcomes. Lower is safer. The scenarios are assumptions, not observed results.'};
  let termCount=0;
  const term=(label,key)=>{const id='term-tip-'+(++termCount);return `<span class="term" tabindex="0" aria-describedby="${id}">${e(label)}<span class="term-tip" role="tooltip" id="${id}">${e(TERMS[key]??key)}</span></span>`;};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.activeElement?.classList?.contains('term'))document.activeElement.blur();});
  window.HL={e,money,signedMoney,affinity,count,fetchJSON,FetchProblem,state,term};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
