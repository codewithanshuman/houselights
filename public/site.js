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
    if(header.classList.contains('app-side')){bindSide(header);return;}
    const burger=header.querySelector('.site-burger'),nav=header.querySelector('.site-nav');
    burger?.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');burger.setAttribute('aria-expanded',String(open));burger.setAttribute('aria-label',open?'Close menu':'Open menu');});
    header.querySelectorAll('.site-links>a').forEach(link=>link.addEventListener('click',()=>{nav.classList.remove('is-open');burger?.setAttribute('aria-expanded','false');}));
    const tools_=header.querySelector('.site-tools');if(!tools_)return;
    document.addEventListener('click',event=>{if(tools_.open&&!tools_.contains(event.target))tools_.open=false;});
    tools_.addEventListener('keydown',event=>{if(event.key==='Escape'){tools_.open=false;tools_.querySelector('summary').focus();}});
  }
  // The app sidebar: a highlight that glides between rows under the pointer, a collapse
  // toggle remembered per browser, and a menu button on narrow screens.
  function bindSide(side){
    const nav=side.querySelector('.app-nav'),glide=side.querySelector('.app-glide'),toggle=side.querySelector('[data-side-toggle]'),menu=side.querySelector('[data-side-menu]');
    nav?.addEventListener('pointerover',event=>{
      const row=event.target.closest('[data-row],.nav-item');if(!row||!nav.contains(row))return;
      const top=row.getBoundingClientRect().top-nav.getBoundingClientRect().top;
      if(!nav.classList.contains('is-gliding'))glide.style.transition='none';
      glide.style.setProperty('--y',`${top}px`);glide.style.height=`${row.offsetHeight}px`;
      glide.getBoundingClientRect();glide.style.transition='';nav.classList.add('is-gliding');
    });
    nav?.addEventListener('pointerleave',()=>nav.classList.remove('is-gliding'));
    // On a page section with its own sub-row (the recorded session), the sub-row holds the highlight.
    const markSub=()=>{const current=side.querySelector('.app-row.is-current');let here=false;side.querySelectorAll('.app-subrow').forEach(row=>{const on=Boolean(row.hash)&&row.hash===location.hash;row.classList.toggle('is-here',on);if(on){row.setAttribute('aria-current','location');here=true;}else row.removeAttribute('aria-current');});if(side.querySelector('.app-subrow'))current?.classList.toggle('has-child-here',here);};
    markSub();addEventListener('hashchange',markSub);
    document.querySelector('[data-share]')?.addEventListener('click',async event=>{
      const label=event.currentTarget.querySelector('span');
      try{await navigator.clipboard.writeText(location.href);label.textContent='Link copied';}catch{label.textContent='Copy the address bar';}
      setTimeout(()=>{label.textContent='Share';},2200);
    });
    const setCollapsed=on=>{document.body.classList.toggle('side-collapsed',on);toggle?.setAttribute('aria-expanded',String(!on));toggle?.setAttribute('aria-label',on?'Expand sidebar':'Collapse sidebar');};
    try{if(localStorage.getItem('hl-side')==='collapsed')setCollapsed(true);}catch{}
    toggle?.addEventListener('click',()=>{const on=!document.body.classList.contains('side-collapsed');setCollapsed(on);try{localStorage.setItem('hl-side',on?'collapsed':'open');}catch{}});
    menu?.addEventListener('click',()=>{const open=side.classList.toggle('is-open');menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close menu':'Open menu');});
    side.addEventListener('keydown',event=>{if(event.key==='Escape'&&side.classList.contains('is-open')){side.classList.remove('is-open');menu.setAttribute('aria-expanded','false');menu.focus();}});
  }
  function renderFooter(footer){
    if(!footer.children.length)footer.innerHTML=`<div class="site-footer-inner"><span>Houselights<span class="site-brand-dot">.</span> Booking decisions with Qloo receipts.</span><span class="site-footer-links"><a href="/evidence.html">Evidence &amp; limits</a><a href="https://github.com/codewithanshuman/houselights">Source (MIT)</a></span><span class="site-release">Release <code id="site-release">…</code></span></div>`;
    fetchJSON('/healthz',{timeout:8000,retries:0}).then(health=>{const node=document.getElementById('site-release');if(node)node.textContent=health.release?String(health.release).slice(0,7):'local build';document.querySelectorAll('[data-release]').forEach(code=>{code.textContent=health.release?String(health.release).slice(0,7):'local build';});}).catch(()=>{const node=document.getElementById('site-release');if(node)node.textContent='unavailable';});
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
  // Pixel-dissolve buttons (GitHub): a grid of square cells floods dark from left to right
  // under the pointer, each cell stepping through greys, and drains away when it leaves.
  function pixelButtons(){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    document.querySelectorAll('.px-btn').forEach(button=>{
      const grid=button.querySelector('.px-cells');if(!grid)return;
      const build=()=>{
        const size=7,cols=Math.max(8,Math.round(button.offsetWidth/size)),rows=Math.max(3,Math.round(button.offsetHeight/size));
        grid.style.setProperty('--cols',cols);grid.textContent='';
        const frag=document.createDocumentFragment();
        for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const cell=document.createElement('i');cell.style.setProperty('--d',`${(c/cols*.3+Math.random()*.14).toFixed(3)}s`);frag.append(cell);}
        grid.append(frag);
      };
      build();
      const on=()=>{button.classList.remove('is-off');button.classList.add('is-on');};
      const off=()=>{if(!button.classList.contains('is-on'))return;button.classList.remove('is-on');button.classList.add('is-off');};
      button.addEventListener('pointerenter',on);button.addEventListener('pointerleave',off);
      button.addEventListener('focus',on);button.addEventListener('blur',off);
      let timer;new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(build,200);}).observe(button);
    });
  }
  // "On this page" for the long app pages (<main data-toc>): a list of the visible section
  // headings, as a rail on wide screens and a menu in the top bar otherwise. The current
  // section is highlighted while scrolling; sections that appear later (results, unlocked
  // panels) join the list.
  function pageToc(){
    const main=document.querySelector('main[data-toc]');if(!main)return;
    const slug=text=>text.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'section';
    const visible=node=>!node.closest('[hidden],dialog,details:not([open]),.receipt-drawer')&&node.getClientRects().length>0;
    const rail=document.createElement('nav');rail.className='toc-rail';rail.setAttribute('aria-label','On this page');
    const menu=document.createElement('details');menu.className='toc-menu';
    menu.innerHTML='<summary><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h13"/></svg><span>On this page</span></summary><nav class="toc-menu-list" aria-label="On this page (menu)"></nav>';
    document.body.append(rail);document.querySelector('.app-top .app-share')?.before(menu);
    let heads=[],observer=null;
    const build=()=>{
      const found=[...main.querySelectorAll('h2:not([data-toc-skip])')].filter(visible);
      if(found.length===heads.length&&found.every((h,i)=>h===heads[i]))return;
      heads=found;const used=new Set();
      heads.forEach(h=>{if(!h.id){let id=`s-${slug(h.textContent)}`,n=2;while(document.getElementById(id)||used.has(id))id=`s-${slug(h.textContent)}-${n++}`;h.id=id;}used.add(h.id);});
      const items=heads.map((h,i)=>`<a href="#${h.id}" data-toc-id="${h.id}"><span class="toc-no">${String(i+1).padStart(2,'0')}</span><span class="toc-label">${h.textContent.trim().replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}</span></a>`).join('');
      rail.innerHTML=`<p class="toc-title">On this page</p><div class="toc-list">${items}</div>`;
      menu.querySelector('.toc-menu-list').innerHTML=items;
      document.body.classList.toggle('has-toc',heads.length>1);
      observer?.disconnect();
      observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)document.querySelectorAll('[data-toc-id]').forEach(link=>link.classList.toggle('is-current',link.dataset.tocId===entry.target.id));},{rootMargin:'-15% 0px -70% 0px'});
      heads.forEach(h=>observer.observe(h));
    };
    document.addEventListener('click',event=>{
      const link=event.target.closest('[data-toc-id]');if(!link)return;
      const target=document.getElementById(link.dataset.tocId);if(!target)return;
      event.preventDefault();menu.open=false;
      document.querySelectorAll('.judge-main>*').forEach(node=>{node.style.contentVisibility='visible';});
      target.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      history.replaceState(null,'',`#${target.id}`);
    });
    document.addEventListener('click',event=>{if(menu.open&&!menu.contains(event.target))menu.open=false;});
    build();
    let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(build,250);}).observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','open']});
  }
  // Evidence page: a strip of counts read from the claims table that is already on the page.
  function evidenceKpis(){
    const table=document.querySelector('.claim-table table'),header=document.querySelector('#evidence-main>header');if(!table||!header)return;
    const status=[...table.querySelectorAll('tbody td .badge')].map(b=>b.textContent.trim());
    const count=test=>status.filter(test).length,verified=count(t=>t.startsWith('verified')),pending=count(t=>t==='pending'),unmeasured=count(t=>t==='not measured');
    header.insertAdjacentHTML('beforeend',`<dl class="kpi-strip" aria-label="Claims at a glance"><div><dt>Claims</dt><dd>${status.length}</dd></div><div class="is-good"><dt>Verified</dt><dd>${verified}<small>reproducible</small></dd></div><div class="is-warn"><dt>Pending</dt><dd>${pending}<small>not collected yet</small></dd></div><div><dt>Not measured</dt><dd>${unmeasured}</dd></div></dl>`);
  }
  // On phones, read-only result tables in the app stack as cards; each cell is labelled with
  // its column header. Tables you type into keep their rows.
  function stackTables(root=document){
    if(!document.body.classList.contains('app-shell'))return;
    root.querySelectorAll?.('main .table-scroll table').forEach(table=>{
      if(table.closest('.claim-table')||table.querySelector('input,select,textarea'))return;
      const heads=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());if(!heads.length)return;
      table.classList.add('stack-sm');
      table.querySelectorAll('tbody tr').forEach(row=>[...row.children].forEach((cell,i)=>{if(heads[i]&&!cell.dataset.label)cell.dataset.label=heads[i];}));
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
    if(!document.querySelector('[data-site-footer]')&&document.querySelector('[data-release]'))fetchJSON('/healthz',{timeout:8000,retries:0}).then(health=>document.querySelectorAll('[data-release]').forEach(code=>{code.textContent=health.release?String(health.release).slice(0,7):'local build';})).catch(()=>{});
    focusableScrollers();
    pixelButtons();
    evidenceKpis();
    stackTables();
    pageToc();
    new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){focusableScrollers(node);stackTables(node.closest?.('.table-scroll')?.parentNode??node);if(node.matches?.('.table-scroll,#receipts'))focusableScrollers(node.parentNode);}}).observe(document.body,{childList:true,subtree:true});
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
