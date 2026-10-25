/* The Booking Desk: plan a show live with Qloo, or open a saved plan. Every plan, live or
   saved, is a published record, so the same experiments work on both: turn Qloo off, cut
   the budget, drop an act. Decisions come from the server's exact optimizer; this file only
   renders them. */
'use strict';
(()=>{
  const {e,money,fetchJSON,state}=window.HL,$=id=>document.getElementById(id);
  const FEATURED='8be4d03ef4792ca9f1466983';
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const usd=value=>money(value,'USD');
  const result=$('plan-result'),form=$('plan-form'),progress=$('plan-progress');
  let view=null; // {record, base, off, current, budget, cancelId, qlooOff}

  // ── Data helpers ───────────────────────────────────────────────────────────────
  const itemsOf=snapshot=>snapshot.memo.items;
  const nameOf=(snapshot,id)=>itemsOf(snapshot).find(item=>item.id===id)?.name??id;
  const billNames=(snapshot,slate=snapshot.memo.slate)=>slate.selectedIds.map(id=>nameOf(snapshot,id));
  const rankReceipt=snapshot=>snapshot.receipts.find(receipt=>receipt.tool==='rank'&&receipt.evidence?.rows?.length);
  const affinityOf=(snapshot,item)=>{const rows=rankReceipt(snapshot)?.evidence.rows??[];const row=rows.find(r=>r.id===item.id)||rows.find(r=>r.name&&r.name.toLowerCase()===item.name.toLowerCase());return typeof row?.affinity==='number'?row.affinity:null;};
  const anchorText=snapshot=>(snapshot.memo.input.anchors??[]).join(', ');
  const estimated=record=>record.feeBasis==='estimated-from-qloo-popularity';
  const initials=name=>name.replace(/^the\s+/i,'').split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();
  const hue=name=>[...name].reduce((sum,ch)=>(sum*31+ch.charCodeAt(0))%360,7);
  const sameIds=(a,b)=>a.length===b.length&&a.every(id=>b.includes(id));

  // ── Saved plans ────────────────────────────────────────────────────────────────
  async function loadExamples(){
    const box=$('plan-examples');
    try{
      const {cases}=await fetchJSON('/api/judge/cases',{timeout:12000});
      // One saved plan per brief: bookable, real Qloo data, the featured run first.
      const seen=new Set(),listed=cases.filter(item=>!item.synthetic&&item.feasible&&item.anchors?.length).sort((a,b)=>(b.id===FEATURED)-(a.id===FEATURED))
        .filter(item=>{const key=`${item.city}|${item.anchors.join()}`;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,6);
      box.innerHTML=listed.map(item=>`<button type="button" class="plan-chip" data-case="${e(item.id)}">${e(item.city)}<span>fans of ${e(item.anchors.join(', '))}</span></button>`).join('');
      box.addEventListener('click',event=>{const chip=event.target.closest('[data-case]');if(chip)void openCase(chip.dataset.case,{scroll:true});});
    }catch{box.innerHTML='<p class="plan-note">Saved plans are unavailable right now.</p>';}
  }

  async function openCase(id,{scroll=false}={}){
    result.setAttribute('aria-busy','true');
    state(result,{kind:'loading'});
    try{
      const record=await fetchJSON(`/api/judge/cases/${encodeURIComponent(id)}`,{timeout:15000});
      view={record,base:record.snapshot,current:record.snapshot,off:null,budget:record.snapshot.memo.constraints.budget,cancelId:null,qlooOff:false};
      render();if(record.id===FEATURED)fillFan(record.snapshot,null);
      if(record.id!==FEATURED||location.search||location.hash)history.replaceState(null,'',record.live?`?plan=${record.id}`:`#${record.id}`);
      if(scroll)result.scrollIntoView({block:'start',behavior:reduced()?'instant':'smooth'});
      // The Qloo-off comparison is shown on every plan, so fetch it once up front.
      experiment({qlooOff:true}).then(data=>{if(view?.record.id===record.id){view.off=data.snapshot;render();if(record.id===FEATURED)fillFan(record.snapshot,data.snapshot);}}).catch(problem=>{if(view?.record.id===record.id){view.offError=problem;render();}});
    }catch(problem){
      state(result,{kind:problem.kind??'server',title:problem.status===404?'Plan not found':undefined,text:problem.status===404?'This plan link is not valid. Open a saved plan above.':problem.message,retry:()=>openCase(id,{scroll})});
    }finally{result.setAttribute('aria-busy','false');}
  }

  const experiment=body=>fetchJSON(`/api/judge/cases/${view.record.id}/experiment`,{method:'POST',body,timeout:20000,retries:0});

  async function rerun(){
    const body={};
    if(view.budget!==view.base.memo.constraints.budget)body.budget=view.budget;
    if(view.cancelId)body.cancelId=view.cancelId;
    if(view.qlooOff)body.qlooOff=true;
    const status=$('result-status');
    if(!Object.keys(body).length){view.current=view.base;render();return true;}
    if(Object.keys(body).length===1&&body.qlooOff&&view.off){view.current=view.off;render();return true;}
    result.setAttribute('aria-busy','true');
    try{const data=await experiment(body);if(Object.keys(body).length===1&&body.qlooOff){view.off=data.snapshot;view.offError=null;}view.current=data.snapshot;render();return true;}
    catch(problem){if(status)status.textContent=problem.status===429?'Too many changes at once. Wait a minute and try again; the last result is still shown.':`${problem.message} The last result is still shown.`;return false;}
    finally{result.setAttribute('aria-busy','false');}
  }

  // ── Rendering ──────────────────────────────────────────────────────────────────
  function render(){
    const {record,base,current}=view,slate=current.memo.slate,baseSlate=base.memo.slate,input=base.memo.input;
    const anchors=anchorText(base),budget=current.memo.constraints.budget,slots=current.memo.constraints.slots;
    const changed=!sameIds(slate.selectedIds,baseSlate.selectedIds);
    const offBill=view.off?billNames(view.off):null,offFee=view.off?.memo.slate.totalFee;
    const badges=[record.live?'<span class="badge badge-live">Live plan</span>':'<span class="badge badge-saved">Saved live Qloo run</span>',
      base.mock?'<span class="badge badge-warn">Synthetic test data</span>':'',
      estimated(record)?'<span class="badge badge-warn">Estimated fees</span>':'<span class="badge badge-muted">Illustrative fees</span>'].join('');
    const decision=slate.feasible
      ?`Book <span class="decision-bill">${e(billNames(current).join(' + '))}</span> for <span class="decision-fee">${e(usd(slate.totalFee))}</span>.`
      :'No bill fits these rules.';
    const sub=slate.feasible
      ?`${e(usd(slate.remainingBudget))} under budget · every booking rule passes · best of ${e(slate.feasibleCount)} bookable bills out of ${e(slate.checkedCount)} checked`
      :e((slate.reasons??[]).join(' ')||'Every combination breaks the budget or a rule. Raise the budget or reset.');
    result.innerHTML=`
      <div class="result-head">
        <p class="result-meta">${e(input.city)} · fans of ${e(anchors)} · ${e(usd(budget))} artist budget · ${e(slots)} act${slots===1?'':'s'}</p>
        <div class="result-badges">${badges}</div>
        <h2 id="result-title" class="result-decision${changed?' is-changed':''}">${decision}</h2>
        <p class="result-sub">${sub}</p>
        ${slate.feasible&&slots>1?`<p class="result-why">Not simply Qloo’s top ${e(slots)}: the optimizer weighs each act’s Qloo fit against its fee and books the highest scoring set that fits the budget.</p>`:''}
        ${changed?`<p class="result-changed">Changed from the original bill: ${e(billNames(base).join(' + '))} (${e(usd(baseSlate.totalFee))}).</p>`:''}
      </div>
      <div class="result-qloo">
        <button type="button" class="fs-switch" id="plan-switch" role="switch" aria-checked="${!view.qlooOff}" aria-describedby="plan-switch-note">
          <span class="fs-switch-track" aria-hidden="true"><span class="fs-switch-thumb"></span></span><span>Qloo evidence ${view.qlooOff?'off':'on'}</span>
        </button>
        <p id="plan-switch-note" class="result-qloo-note">${offBill?(sameIds(view.off.memo.slate.selectedIds,baseSlate.selectedIds)
          ?`Without Qloo evidence, the same rules book the same bill. Here Qloo explains the choice but does not change it.`
          :`Without Qloo evidence, the same rules book <strong>${e(offBill.join(' + '))}</strong> for ${e(usd(offFee))}. Qloo changes this decision.`)
          :view.offError?'The comparison without Qloo could not load just now. Use the switch to try again.':'Checking what the same rules book without Qloo…'}</p>
      </div>
      ${actSections()}
      <div class="result-controls" aria-labelledby="controls-title">
        <h3 id="controls-title">Change the plan</h3>
        <div class="control-budget">
          <label for="plan-budget-range">Artist budget: <strong id="plan-budget-value">${e(usd(view.budget))}</strong></label>
          <input type="range" id="plan-budget-range" min="${Math.max(0,Math.round(base.memo.constraints.budget*.4/100)*100)}" max="${Math.round(base.memo.constraints.budget*1.5/100)*100}" step="100" value="${view.budget}">
          <div class="control-presets">${[1,.9,.8,.7].map(f=>`<button type="button" class="button subtle small" data-budget="${Math.round(base.memo.constraints.budget*f)}">${f===1?'Original':`${Math.round(f*100)}%`}</button>`).join('')}</div>
        </div>
        <p class="control-help">Drop a booked act with its <strong>Drop</strong> button to see the best replacement. Every change runs the exact optimizer again on the same saved evidence, with no new Qloo calls.</p>
        <button type="button" class="button subtle small" id="plan-reset"${view.budget===base.memo.constraints.budget&&!view.cancelId&&!view.qlooOff?' disabled':''}>Reset changes</button>
        <p id="result-status" class="result-status" role="status" aria-live="polite"></p>
      </div>
      <p class="result-terms">${e(record.terms)}${record.live?` <button type="button" class="link-button" id="plan-share">Copy link to this plan</button>`:''}</p>`;
    wire();
  }

  function card(item){
    const {record,current,base}=view,selected=current.memo.slate.selectedIds,city=base.memo.input.city,anchors=anchorText(base);
    const scores=itemsOf(current).map(i=>affinityOf(base,i)).filter(v=>v!=null),min=Math.min(...scores),max=Math.max(...scores);
    const budget=current.memo.constraints.budget,rank=rankReceipt(base);
    const booked=selected.includes(item.id),dropped=view.cancelId===item.id,score=affinityOf(base,item);
    const width=score==null?0:max>min?8+92*(score-min)/(max-min):100;
    const fee=item.terms.fee,over=fee!=null&&fee>budget;
    const status=dropped?'<span class="act-status act-dropped">Dropped</span>':booked?'<span class="act-status act-booked">Booked</span>':fee==null?'<span class="act-status act-over">No fee</span>':over?'<span class="act-status act-over">Over budget</span>':'<span class="act-status act-bench">Not picked</span>';
    // Why an act is not on the bill: could it replace any booked act within the budget?
    const total=current.memo.slate.feasible?current.memo.slate.totalFee:null,bookedItems=itemsOf(current).filter(i=>selected.includes(i.id));
    const fitsSwap=fee!=null&&total!=null&&bookedItems.some(b=>total-(b.terms.fee??0)+fee<=budget);
    const why=booked||dropped?'':fee==null?'':over?'Costs more than the whole budget.':total==null?'':fitsSwap?'Fits the budget, but the booked set scores higher overall.':'Over budget alongside the rest of the bill.';
    const chips=[item.found?'Suggested by Qloo':'',item.local==='yes'?`Fans concentrated in ${city}`:'',item.momentum==='rising'?'Rising':item.momentum==='cooling'?'Cooling':''].filter(Boolean);
    return `<li class="act-card${booked?' is-booked':''}${dropped?' is-dropped':''}">
      <div class="act-top"><span class="act-avatar" style="--act-hue:${hue(item.name)}" aria-hidden="true">${e(initials(item.name))}</span>
        <div class="act-name"><h4>${e(item.name)}</h4><p>${fee==null?'No fee quoted, so it cannot be booked':`${e(usd(fee))}${estimated(record)?' <abbr title="Estimated from Qloo popularity, not a quote">est.</abbr>':''}`}</p></div>${status}</div>
      <div class="act-fit"><p>${item.rank?`Qloo ranks it <strong>${e(item.rank)} of ${e(item.of)}</strong> for ${e(anchors)} fans in ${e(city)}`:'No Qloo rank for this act'}</p>
        ${score!=null?`<div class="act-bar" role="img" aria-label="Qloo affinity ${score.toFixed(3)}"><span style="width:${width.toFixed(1)}%"></span></div><p class="act-score">Qloo affinity ${e(score.toFixed(3))}</p>`:''}</div>
      ${why?`<p class="act-why">${e(why)}</p>`:''}
      ${chips.length?`<p class="act-chips">${chips.map(chip=>`<span>${e(chip)}</span>`).join('')}</p>`:''}
      <div class="act-actions">${rank?`<button type="button" class="button subtle small" data-receipt="${e(rank.id)}" data-entity="${e(item.name)}">Qloo receipt</button>`:''}${booked&&!view.qlooOff?`<button type="button" class="button subtle small" data-drop="${e(item.id)}" aria-label="Drop ${e(item.name)} and rebook">Drop</button>`:''}</div>
    </li>`;
  }
  function actSections(){
    const selected=view.current.memo.slate.selectedIds,items=[...itemsOf(view.current)].sort((a,b)=>(a.rank??99)-(b.rank??99));
    const booked=selected.map(id=>items.find(item=>item.id===id)).filter(Boolean),others=items.filter(item=>!selected.includes(item.id));
    return `<h3 class="act-heading">The bill</h3><ul class="act-grid" aria-label="Booked acts">${booked.map(card).join('')||'<li class="act-empty">No act can be booked under these rules.</li>'}</ul>
      ${others.length?`<details class="act-others"${matchMedia('(min-width: 700px)').matches?' open':''}><summary>The other ${others.length} candidates Qloo ranked</summary><ul class="act-grid act-grid-compact" aria-label="Other candidates">${others.map(card).join('')}</ul></details>`:''}`;
  }

  function wire(){
    const say=text=>{const status=$('result-status');if(status)status.textContent=text;};
    $('plan-switch').addEventListener('click',async()=>{
      view.qlooOff=!view.qlooOff;if(view.qlooOff)view.cancelId=null;
      // A refused request leaves the shown bill unchanged, so the switch must not stay flipped.
      if(!await rerun()){view.qlooOff=!view.qlooOff;const message=$('result-status').textContent;render();$('result-status').textContent=message;$('plan-switch').focus();return;}
      $('plan-switch').focus();
      say(view.qlooOff?`Qloo evidence off. The bill is ${billNames(view.current).join(' and ')}.`:`Qloo evidence on. The bill is ${billNames(view.current).join(' and ')}.`);
    });
    const range=$('plan-budget-range');let timer;
    range.addEventListener('input',()=>{view.budget=Number(range.value);$('plan-budget-value').textContent=usd(view.budget);clearTimeout(timer);timer=setTimeout(async()=>{await rerun();$('plan-budget-range').focus();},350);});
    result.querySelectorAll('[data-budget]').forEach(button=>button.addEventListener('click',async()=>{view.budget=Number(button.dataset.budget);await rerun();say(`Budget set to ${usd(view.budget)}. ${view.current.memo.slate.feasible?`The bill is ${billNames(view.current).join(' and ')}.`:'No bill fits.'}`);}));
    result.querySelectorAll('[data-drop]').forEach(button=>button.addEventListener('click',async()=>{view.cancelId=button.dataset.drop;const name=nameOf(view.base,view.cancelId);await rerun();say(`${name} dropped. ${view.current.memo.slate.feasible?`The best replacement bill is ${billNames(view.current).join(' and ')}.`:'No bill fits without them.'}`);}));
    $('plan-reset').addEventListener('click',async()=>{view.budget=view.base.memo.constraints.budget;view.cancelId=null;view.qlooOff=false;await rerun();say('Changes reset to the original plan.');$('plan-switch').focus();});
    result.querySelectorAll('[data-receipt]').forEach(button=>button.addEventListener('click',()=>openReceipt(button.dataset.receipt,button.dataset.entity,button)));
    $('plan-share')?.addEventListener('click',async()=>{const link=location.href;try{await navigator.clipboard.writeText(link);say('Link copied.');}catch{say(`Copy this link: ${link}`);}});
  }

  // ── Receipts ───────────────────────────────────────────────────────────────────
  const describeReceipt=(receipt,snapshot)=>{
    const city=snapshot.memo.input.city,anchors=anchorText(snapshot);
    return ({describe:'Qloo confirmed the artist’s identity',recommend:`Artists Qloo links to ${anchors} fans in ${city}`,rank:`Qloo’s ranking of every candidate for ${anchors} fans in ${city}`,
      where_popular:`Where the fans are within ${city}`,compare_audiences:`How the audience overlaps with ${anchors}’s`,trends:'Six-month popularity trend',entity_tags:'Taste tags for the anchor artist'})[receipt.tool]??`Qloo ${receipt.tool} call`;
  };
  function openReceipt(id,entity,opener){
    const snapshot=view.base,receipt=snapshot.receipts.find(r=>r.id===id),drawer=$('receipt-drawer');if(!receipt)return;
    const same=(a,b)=>String(a??'').toLowerCase()===String(b??'').toLowerCase();
    const rows=receipt.evidence?.rows??[];
    $('receipt-title').textContent=describeReceipt(receipt,snapshot);
    $('receipt-body').innerHTML=`<p class="receipt-meta">Receipt <code>${e(receipt.id)}</code> · Qloo <code>${e(receipt.tool)}</code> · ${e(receipt.status)}${receipt.fetchedAt?` · fetched ${e(new Date(receipt.fetchedAt).toUTCString().replace(' GMT',' UTC'))}`:''}${receipt.cached?' · served from cache':''}</p>
      ${rows.some(r=>r.name)?`<div class="table-scroll"><table class="data-table"><caption>What Qloo returned${entity?` (highlighted: ${e(entity)})`:''}</caption><thead><tr><th scope="col">Artist</th><th scope="col">Qloo affinity</th><th scope="col">Popularity</th></tr></thead><tbody>${rows.filter(r=>r.name).map(r=>`<tr${same(r.name,entity)?' class="is-highlight"':''}><th scope="row">${e(r.name)}</th><td>${r.affinity==null?'—':e(r.affinity.toFixed(4))}</td><td>${r.popularity==null?'—':e(r.popularity.toFixed(3))}</td></tr>`).join('')}</tbody></table></div>`:'<p>This call returned no named rows in the public record.</p>'}
      <p class="receipt-note">Affinity is Qloo’s measure of how strongly this audience is drawn to an artist; it is cultural fit, not ticket demand. ${receipt.originalDigest?`Original record digest <code class="receipt-digest">${e(receipt.originalDigest)}</code>.`:''}</p>`;
    drawer.showModal();
    $('receipt-close').onclick=()=>drawer.close();
    drawer.addEventListener('close',()=>opener?.focus(),{once:true});
  }

  // ── Live planning ──────────────────────────────────────────────────────────────
  const STEPS=[['Resolve','Confirming {anchor} with Qloo'],['Discover','Finding artists {anchor} fans love in {city}'],['Rank','Ranking every candidate for this audience'],
    ['Plan','Choosing which acts to check in depth'],['Verify','Checking where fans are and how audiences overlap'],['Optimize','Checking every possible bill against your budget'],['Write','Writing up the decision']];
  const fill=(text,input)=>text.replace('{anchor}',input.anchor).replace('{city}',input.city);
  function stepList(input,active){
    $('progress-steps').innerHTML=STEPS.map(([key,text],index)=>`<li class="${index<active?'is-done':index===active?'is-active':''}"><span class="step-mark" aria-hidden="true">${index<active?'✓':index+1}</span>${e(fill(text,input))}</li>`).join('');
  }
  function readInput(){
    const data=new FormData(form);
    const input={city:String(data.get('city')??'').trim(),anchor:String(data.get('anchor')??'').trim(),budget:Number(String(data.get('budget')??'').replace(/[$,\s]/g,'')),slots:Number(data.get('slots'))};
    const fail=(field,message)=>{const error=$('plan-error');error.textContent=message;error.hidden=false;$(field).setAttribute('aria-invalid','true');$(field).focus();return null;};
    form.querySelectorAll('[aria-invalid]').forEach(node=>node.removeAttribute('aria-invalid'));$('plan-error').hidden=true;
    if(input.city.length<2)return fail('plan-city','Enter a city.');
    if(!input.anchor)return fail('plan-anchor','Enter an artist your audience loves.');
    if(!Number.isFinite(input.budget)||input.budget<1000||input.budget>500000)return fail('plan-budget','Artist budget must be between $1,000 and $500,000.');
    return input;
  }
  async function planLive(input){
    const submit=$('plan-submit'),status=$('progress-status');
    submit.disabled=true;submit.textContent='Planning…';progress.hidden=false;$('progress-choose').hidden=true;$('progress-calls').textContent='';
    stepList(input,0);progress.scrollIntoView({block:'start',behavior:reduced()?'instant':'smooth'});
    status.textContent=`Researching a show in ${input.city} for fans of ${input.anchor}.`;
    const showError=text=>{const error=$('plan-error');error.textContent=text;error.hidden=false;progress.hidden=true;};
    try{
      const response=await fetch('/api/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(180000)});
      if(!response.ok||!response.body){let message='The live plan could not start.';try{message=(await response.json()).error||message;}catch{}showError(message);return;}
      const reader=response.body.pipeThrough(new TextDecoderStream()).getReader();let buffer='',done=false;
      while(!done){
        const chunk=await reader.read();if(chunk.done)break;buffer+=chunk.value;
        let cut;while((cut=buffer.indexOf('\n\n'))>=0){
          const block=buffer.slice(0,cut);buffer=buffer.slice(cut+2);
          if(!block.startsWith('data: '))continue;
          const event=JSON.parse(block.slice(6));
          if(event.type==='stage'){const index=STEPS.findIndex(([key])=>event.text.startsWith(key));if(index>=0)stepList(input,index);}
          else if(event.type==='call'&&event.max)$('progress-calls').textContent=`Qloo calls: ${event.used} of ${event.max}`;
          else if(event.type==='choose'){
            const box=$('progress-choose');box.hidden=false;
            box.innerHTML=`<p>Qloo found more than one “${e(event.name)}”. Which one did you mean?</p><div class="plan-chips">${event.options.map(option=>`<button type="button" class="plan-chip" data-anchor-id="${e(option.id)}" data-anchor-name="${e(option.name)}">${e(option.name)}</button>`).join('')}</div>`;
            box.querySelectorAll('[data-anchor-id]').forEach(button=>button.addEventListener('click',()=>{$('plan-anchor').value=button.dataset.anchorName;void planLive({...input,anchor:button.dataset.anchorName,anchorId:button.dataset.anchorId});},{once:true}));
            status.textContent='Choose which artist you meant.';done=true;
          }
          else if(event.type==='error'){showError(event.text);done=true;}
          else if(event.type==='ready'){stepList(input,STEPS.length);status.textContent='Your plan is ready.';progress.hidden=true;await openCase(event.id,{scroll:true});done=true;}
        }
      }
    }catch(problem){showError(problem?.name==='TimeoutError'?'The live plan took too long. Try again, or open a saved plan.':'The live plan was interrupted. Try again, or open a saved plan.');}
    finally{submit.disabled=false;submit.innerHTML='Plan my bill <span aria-hidden="true">→</span>';}
  }
  form.addEventListener('submit',event=>{event.preventDefault();const input=readInput();if(input)void planLive(input);});

  // ── Landing ────────────────────────────────────────────────────────────────────
  // The hero cards show the featured plan; they are filled from the published record so
  // they always match the decision below.
  function fillFan(snapshot,off){
    const set=(key,text)=>document.querySelectorAll(`[data-fan="${key}"]`).forEach(node=>{node.textContent=text;});
    const top=[...itemsOf(snapshot)].filter(item=>item.rank).sort((a,b)=>a.rank-b.rank)[0],score=top?affinityOf(snapshot,top):null;
    if(top){set('top-act',top.name);if(score!=null)set('top-score',`Affinity ${score.toFixed(3)} · rank ${top.rank} of ${top.of}`);}
    set('bill',billNames(snapshot).join(' + '));set('fee',usd(snapshot.memo.slate.totalFee));
    if(off){set('off-bill',billNames(off).join(' + '));set('off-fee',`${usd(off.memo.slate.totalFee)} · a different bill`);}
  }
  // Sections fade up as they enter; the tagline lights word by word along the reading line.
  if('IntersectionObserver' in window){
    document.documentElement.classList.add('has-reveal');
    const reveal=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-in');reveal.unobserve(entry.target);}},{rootMargin:'0px 0px -10% 0px'});
    document.querySelectorAll('.reveal').forEach(node=>reveal.observe(node));
    const tagline=$('tagline-text');
    if(tagline){
      tagline.innerHTML=tagline.textContent.trim().split(/\s+/).map(word=>`<span class="word">${e(word)}</span>`).join(' ');
      const light=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-lit');light.unobserve(entry.target);}},{rootMargin:'0px 0px -38% 0px'});
      tagline.querySelectorAll('.word').forEach(word=>light.observe(word));
    }
  }
  document.querySelectorAll('a[href="#planner"]').forEach(link=>link.addEventListener('click',event=>{
    event.preventDefault();$('planner').scrollIntoView({block:'start',behavior:reduced()?'instant':'smooth'});$('plan-city').focus({preventScroll:true});
  }));

  // ── Start ──────────────────────────────────────────────────────────────────────
  const fromUrl=new URLSearchParams(location.search).get('plan')||(/^#[a-f0-9]{24}$/.test(location.hash)?location.hash.slice(1):null);
  void loadExamples();
  void openCase(fromUrl&&/^[a-f0-9]{24}$/.test(fromUrl)?fromUrl:FEATURED);
})();
