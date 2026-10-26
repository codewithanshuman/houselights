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
      render();if(record.id===FEATURED){fillFan(record.snapshot,null);fillPipeline(record.snapshot);if(watchReady)startReplay();}
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
  // The decision is printed on the owner's blank gig ticket, beside a poster ticket; the Qloo panel sets the two
  // bills side by side; booked acts get cards with a rank ring and every other candidate
  // sits in one ranked table that says why it was not booked.
  const ring=(fraction,label,cls='')=>{
    const r=20,c=2*Math.PI*r,f=Math.max(0,Math.min(1,fraction||0));
    return `<svg class="ring ${cls}" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="${r}" class="ring-track"/><circle cx="24" cy="24" r="${r}" class="ring-fill" stroke-dasharray="${(c*f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 24 24)"/><text x="24" y="25" class="ring-text">${e(label)}</text></svg>`;
  };
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
    const used=slate.feasible&&budget?slate.totalFee/budget:0;
    const side=(key,label,names,fee,active)=>`<div class="compare-side${active?' is-active':''}" data-side="${key}">
        <p class="compare-label">${label}</p>
        <p class="compare-bill">${names?e(names.join(' + ')):'<span class="skeleton-line" aria-hidden="true"></span><span class="sr-only">Loading</span>'}</p>
        <p class="compare-fee">${fee!=null?e(usd(fee)):'&nbsp;'}</p>
      </div>`;
    result.innerHTML=`
      <div class="decision">
        <div class="ticket-stage">
          <img class="ticket-poster" src="/assets/brand/ticket-vinyl.webp" alt="" width="445" height="820" loading="lazy">
          <article class="ticket-art${changed?' is-changed':''}" aria-labelledby="result-title">
            <img class="ticket-paper" src="/assets/brand/ticket-blank.webp" alt="" width="449" height="1120">
            <div class="tk-head">
              <p class="tk-admit">Admit one</p>
              <p class="result-meta">${e(input.city)} · fans of ${e(anchors)} · ${e(usd(budget))} artist budget · ${e(slots)} act${slots===1?'':'s'}</p>
              <div class="result-badges">${badges}</div>
            </div>
            <p class="tk-band tk-band-1" aria-hidden="true">The bill</p>
            <div class="tk-body">
              <h2 id="result-title" class="result-decision">${decision}</h2>
              <p class="result-sub">${slate.feasible?`Every booking rule passes. Best of ${e(slate.feasibleCount)} bookable bills out of ${e(slate.checkedCount)} checked.`:sub}</p>
            </div>
            <p class="tk-band tk-band-2">${slate.feasible?`${e(usd(slate.remainingBudget))} under budget`:'No bookable bill'}</p>
            <dl class="tk-stats">
              <div><dt>Budget used</dt><dd>${slate.feasible?`${Math.round(used*100)}%`:'—'}</dd></div>
              <div><dt>Checked</dt><dd>${e(slate.checkedCount)}</dd></div>
              <div><dt>Bookable</dt><dd>${e(slate.feasibleCount)}</dd></div>
            </dl>
          </article>
        </div>
        <section class="result-qloo" aria-label="What Qloo changes">
          <div class="qloo-head">
            <button type="button" class="light-switch" id="plan-switch" role="switch" aria-checked="${!view.qlooOff}" aria-describedby="plan-switch-note">
              <span class="ls-plate" aria-hidden="true"><span class="ls-word ls-on">ON</span><span class="ls-screw ls-screw-l"></span><span class="ls-rocker"><span></span></span><span class="ls-screw ls-screw-r"></span><span class="ls-word ls-off">OFF</span></span>
              <span class="ls-label"><span class="ls-title">Qloo evidence</span> <span class="ls-state">${view.qlooOff?'off':'on'}</span></span>
            </button>
            <p id="plan-switch-note" class="result-qloo-note">${offBill?(sameIds(view.off.memo.slate.selectedIds,baseSlate.selectedIds)
              ?`Without Qloo evidence, the same rules book the same bill. Here Qloo explains the choice but does not change it.`
              :`Without Qloo evidence, the same rules book <strong>${e(offBill.join(' + '))}</strong> for ${e(usd(offFee))}. Qloo changes this decision.`)
              :view.offError?'The comparison without Qloo could not load just now. Use the switch to try again.':'Checking what the same rules book without Qloo…'}</p>
          </div>
          <div class="compare${view.qlooOff?' is-off':''}">
            <span class="compare-glide" aria-hidden="true"></span>
            ${side('on','With Qloo evidence',billNames(base),baseSlate.totalFee,!view.qlooOff)}
            <span class="compare-arrow" aria-hidden="true">→</span>
            ${side('off','Without Qloo evidence',offBill,offFee,view.qlooOff)}
          </div>
          ${slate.feasible&&slots>1?`<p class="result-why">Not simply Qloo’s top ${e(slots)}: the optimizer weighs each act’s Qloo fit against its fee and books the highest scoring set that fits the budget.</p>`:''}
          ${changed?`<p class="result-changed">Changed from the original bill: ${e(billNames(base).join(' + '))} (${e(usd(baseSlate.totalFee))}).</p>`:''}
        </section>
      </div>
      ${actSections()}
      <div class="result-controls" aria-labelledby="controls-title">
        <div class="controls-copy">
          <h3 id="controls-title">Change the plan</h3>
          <p class="control-help">Move the budget or drop a booked act. The exact optimizer runs again on the same saved evidence, with no new Qloo calls.</p>
        </div>
        <div class="control-budget">
          <label for="plan-budget-range">Artist budget <strong id="plan-budget-value">${e(usd(view.budget))}</strong></label>
          <input type="range" id="plan-budget-range" min="${Math.max(0,Math.round(base.memo.constraints.budget*.4/100)*100)}" max="${Math.round(base.memo.constraints.budget*1.5/100)*100}" step="100" value="${view.budget}">
          <div class="control-presets">${[1,.9,.8,.7].map(f=>{const value=Math.round(base.memo.constraints.budget*f);return `<button type="button" class="preset${value===view.budget?' is-on':''}" data-budget="${value}">${f===1?'Original':`${Math.round(f*100)}%`}</button>`;}).join('')}
            <button type="button" class="preset preset-reset" id="plan-reset"${view.budget===base.memo.constraints.budget&&!view.cancelId&&!view.qlooOff?' disabled':''}>Reset changes</button></div>
        </div>
        <p id="result-status" class="result-status" role="status" aria-live="polite"></p>
      </div>
      <p class="result-terms">${e(record.terms)}${record.live?` <button type="button" class="link-button" id="plan-share">Copy link to this plan</button>`:''}</p>`;
    wire();
  }

  // What the table and cards say about one act.
  function actFacts(item){
    const {record,current,base}=view,selected=current.memo.slate.selectedIds,city=base.memo.input.city;
    const scores=itemsOf(current).map(i=>affinityOf(base,i)).filter(v=>v!=null),min=Math.min(...scores),max=Math.max(...scores);
    // With Qloo evidence switched off there is no affinity to show.
    const budget=current.memo.constraints.budget,score=view.qlooOff?null:affinityOf(base,item);
    const position=score==null?0:max>min?.12+.88*(score-min)/(max-min):1;
    const booked=selected.includes(item.id),dropped=view.cancelId===item.id,fee=item.terms.fee,over=fee!=null&&fee>budget;
    const total=current.memo.slate.feasible?current.memo.slate.totalFee:null,bookedItems=itemsOf(current).filter(i=>selected.includes(i.id));
    const fitsSwap=fee!=null&&total!=null&&bookedItems.some(b=>total-(b.terms.fee??0)+fee<=budget);
    const status=dropped?['act-dropped','Dropped']:booked?['act-booked','Booked']:fee==null?['act-over','No fee']:over?['act-over','Over budget']:['act-bench','Not picked'];
    const why=booked?'':dropped?'You dropped this act.':fee==null?'No fee quoted, so it cannot be booked.':over?'Costs more than the whole budget.':total==null?'':fitsSwap?'Fits the budget, but the booked set scores higher.':'Over budget alongside the rest of the bill.';
    const chips=[item.found?'Suggested by Qloo':'',item.local==='yes'?`Fans concentrated in ${city}`:'',item.momentum==='rising'?'Rising':item.momentum==='cooling'?'Cooling':''].filter(Boolean);
    const feeText=fee==null?'No fee':`${usd(fee)}${estimated(record)?' est.':''}`;
    return {score,position,booked,dropped,status,why,chips,feeText,rank:rankReceipt(base)};
  }
  function card(item){
    const f=actFacts(item),anchors=anchorText(view.base),city=view.base.memo.input.city;
    return `<li class="act-card is-booked">
      <div class="act-ring">${ring(f.position,item.rank?`#${item.rank}`:'—')}</div>
      <div class="act-main">
        <p class="act-kicker"><span class="act-status act-booked">Booked</span>${item.rank?`Qloo rank ${e(item.rank)} of ${e(item.of)}`:'No Qloo rank'}</p>
        <h4>${e(item.name)}</h4>
        <p class="act-fee">${e(f.feeText)}${f.score!=null?` · affinity ${e(f.score.toFixed(3))}`:''}</p>
        <p class="act-for">For ${e(anchors)} fans in ${e(city)}</p>
        ${f.chips.length?`<p class="act-chips">${f.chips.map(chip=>`<span>${e(chip)}</span>`).join('')}</p>`:''}
      </div>
      <div class="act-actions">${f.rank?`<button type="button" class="button subtle small" data-receipt="${e(f.rank.id)}" data-entity="${e(item.name)}">Qloo receipt</button>`:''}${!view.qlooOff?`<button type="button" class="button subtle small" data-drop="${e(item.id)}" aria-label="Drop ${e(item.name)} and rebook">Drop</button>`:''}</div>
    </li>`;
  }
  function row(item){
    const f=actFacts(item);
    return `<li class="act-card rank-row${f.dropped?' is-dropped':''}">
      <span class="rank-no">${item.rank?`#${e(item.rank)}`:'—'}</span>
      <span class="rank-name"><strong>${e(item.name)}</strong>${f.chips.length?`<small>${e(f.chips.join(' · '))}</small>`:''}</span>
      <span class="rank-aff">${f.score!=null?`<span class="rank-bar"><span style="width:${(f.position*100).toFixed(1)}%"></span></span><span class="rank-num">${e(f.score.toFixed(3))}</span>`:'<span class="rank-num">—</span>'}</span>
      <span class="rank-fee">${e(f.feeText)}</span>
      <span class="rank-why"><span class="act-status ${f.status[0]}">${f.status[1]}</span>${f.why?`<small>${e(f.why)}</small>`:''}</span>
      ${f.rank?`<button type="button" class="rank-receipt" data-receipt="${e(f.rank.id)}" data-entity="${e(item.name)}" aria-label="Qloo receipt for ${e(item.name)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg></button>`:'<span></span>'}
    </li>`;
  }
  function actSections(){
    const selected=view.current.memo.slate.selectedIds,items=[...itemsOf(view.current)].sort((a,b)=>(a.rank??99)-(b.rank??99));
    const booked=selected.map(id=>items.find(item=>item.id===id)).filter(Boolean),others=items.filter(item=>!selected.includes(item.id));
    return `<div class="lineup">
        <h3 class="act-heading">The bill</h3>
        <ul class="act-grid" aria-label="Booked acts">${booked.map(card).join('')||'<li class="act-empty">No act can be booked under these rules.</li>'}</ul>
        ${others.length?`<details class="act-others"${matchMedia('(min-width: 700px)').matches?' open':''}><summary>The other ${others.length} candidates Qloo ranked</summary>
          <div class="rank-table">
            <div class="rank-head" aria-hidden="true"><span>Rank</span><span>Artist</span><span>Qloo affinity</span><span>Fee</span><span>Why not booked</span><span></span></div>
            <ol aria-label="Other candidates">${others.map(row).join('')}</ol>
          </div></details>`:''}
      </div>`;
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
    const top=Math.max(0,...rows.map(r=>r.affinity??0))||1,chip=(label,value)=>`<span class="receipt-chip"><small>${e(label)}</small><code>${e(value)}</code></span>`;
    $('receipt-body').innerHTML=`<p class="receipt-meta">${chip('Receipt',receipt.id)}${chip('Qloo tool',receipt.tool)}${chip('Status',receipt.status)}${receipt.fetchedAt?chip('Fetched',new Date(receipt.fetchedAt).toUTCString().replace(' GMT',' UTC')):''}${receipt.cached?chip('Source','cache'):''}</p>
      ${rows.some(r=>r.name)?`<div class="table-scroll"><table class="data-table receipt-table"><caption>What Qloo returned${entity?` (highlighted: ${e(entity)})`:''}</caption><thead><tr><th scope="col">Artist</th><th scope="col">Qloo affinity</th><th scope="col">Popularity</th></tr></thead><tbody>${rows.filter(r=>r.name).map((r,index)=>`<tr style="--i:${index}"${same(r.name,entity)?' class="is-highlight"':''}><th scope="row">${e(r.name)}</th><td>${r.affinity==null?'—':`<span class="receipt-aff"><span class="receipt-bar" aria-hidden="true"><span style="--w:${(Math.max(0,r.affinity)/top*100).toFixed(1)}%"></span></span>${e(r.affinity.toFixed(4))}</span>`}</td><td>${r.popularity==null?'—':e(r.popularity.toFixed(3))}</td></tr>`).join('')}</tbody></table></div>`:'<p>This call returned no named rows in the public record.</p>'}
      <p class="receipt-note">Affinity is Qloo’s measure of how strongly this audience is drawn to an artist; it is cultural fit, not ticket demand. ${receipt.originalDigest?`Original record digest <code class="receipt-digest">${e(receipt.originalDigest)}</code>.`:''}</p>`;
    drawer.showModal();
    // Closing plays the sheet's exit animation first (Escape, the close button or a click outside).
    const sheet=drawer.querySelector('.receipt-sheet');
    const close=()=>{
      if(drawer.classList.contains('is-closing'))return;
      if(matchMedia('(prefers-reduced-motion: reduce)').matches||!sheet){drawer.close();return;}
      drawer.classList.add('is-closing');
      const done=()=>{drawer.classList.remove('is-closing');if(drawer.open)drawer.close();};
      sheet.addEventListener('animationend',event=>{if(event.target===sheet)done();},{once:true});
      setTimeout(done,400);
    };
    $('receipt-close').onclick=close;
    drawer.oncancel=event=>{event.preventDefault();close();};
    drawer.onclick=event=>{if(event.target===drawer)close();};
    drawer.addEventListener('close',()=>opener?.focus(),{once:true});
  }

  // ── Live planning ──────────────────────────────────────────────────────────────
  // The agent card first replays the saved New York run; a live plan takes it over.
  const agent=$('agent-trace');
  let replaying=null,replayStarted=false,watchReady=false;
  function startReplay(){
    if(replayStarted||!view||view.record.id!==FEATURED||!window.HLTrace)return;
    replayStarted=true;replaying=window.HLTrace.replay(agent,view.base,{speed:2});
  }
  if('IntersectionObserver' in window){
    const watch=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){watch.disconnect();watchReady=true;startReplay();}},{rootMargin:'0px 0px -20% 0px'});
    watch.observe(agent);
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
    replaying?.cancel();replayStarted=true;
    submit.disabled=true;submit.textContent='Planning…';$('progress-choose').hidden=true;
    $('agent-caption').textContent=`Live run: ${input.city}, fans of ${input.anchor}`;
    const trace=window.HLTrace.create(agent,{city:input.city,anchor:input.anchor,label:`Researching ${input.city} with Qloo`});
    trace.stage('Resolve');
    if(matchMedia('(max-width: 900px)').matches)agent.scrollIntoView({block:'center',behavior:reduced()?'instant':'smooth'});
    status.textContent=`Researching a show in ${input.city} for fans of ${input.anchor}.`;
    const showError=text=>{const error=$('plan-error');error.textContent=text;error.hidden=false;trace.fail('The live plan stopped');};
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
          if(event.type==='stage')trace.stage(event.text);
          else if(event.type==='call'){trace.call({tool:event.tool,count:event.count,status:event.status});trace.setBudget(event.used,event.max);}
          else if(event.type==='choose'){
            trace.fail(`Which “${event.name}” did you mean?`);
            const box=$('progress-choose');box.hidden=false;
            box.innerHTML=`<p>Qloo found more than one “${e(event.name)}”. Which one did you mean?</p><div class="plan-chips">${event.options.map(option=>`<button type="button" class="plan-chip" data-anchor-id="${e(option.id)}" data-anchor-name="${e(option.name)}">${e(option.name)}</button>`).join('')}</div>`;
            box.querySelectorAll('[data-anchor-id]').forEach(button=>button.addEventListener('click',()=>{$('plan-anchor').value=button.dataset.anchorName;void planLive({...input,anchor:button.dataset.anchorName,anchorId:button.dataset.anchorId});},{once:true}));
            status.textContent='Choose which artist you meant.';done=true;
          }
          else if(event.type==='error'){showError(event.text);done=true;}
          else if(event.type==='ready'){
            trace.done(`Planned with ${event.calls} Qloo calls`,'Every call is saved as a receipt you can open on the plan.');
            status.textContent='Your plan is ready.';await openCase(event.id,{scroll:true});done=true;
          }
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
  // The pipeline shows the featured run's real numbers and counts up when it scrolls in.
  function fillPipeline(snapshot){
    const values={calls:snapshot.receipts.length,candidates:itemsOf(snapshot).length,checked:snapshot.memo.slate.checkedCount,bookable:snapshot.memo.slate.feasibleCount,booked:snapshot.memo.slate.feasible?1:0};
    for(const [key,value] of Object.entries(values))document.querySelectorAll(`[data-pipe="${key}"]`).forEach(node=>{node.dataset.value=String(value);node.textContent=String(value);});
    document.querySelectorAll('[data-pipe="bill"]').forEach(node=>{node.textContent=billNames(snapshot).join(' + ');});
  }
  const pipeline=$('pipeline');
  function countUp(){
    pipeline.classList.add('is-in');
    if(reduced())return;
    pipeline.querySelectorAll('.pipe-num').forEach((node,index)=>{
      const target=Number(node.dataset.value??node.textContent),start=performance.now()+index*260,duration=900;
      const step=time=>{const t=Math.min(1,Math.max(0,(time-start)/duration)),eased=1-Math.pow(1-t,3);node.textContent=String(Math.round(target*eased));if(t<1)requestAnimationFrame(step);};
      node.textContent='0';requestAnimationFrame(step);
    });
  }
  if(pipeline&&'IntersectionObserver' in window){
    const pipeWatch=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){pipeWatch.disconnect();countUp();}},{rootMargin:'0px 0px -25% 0px'});
    pipeWatch.observe(pipeline);
  }else pipeline?.classList.add('is-in');
  // The frosted tile field behind the facts: fill the stage with square tiles. The top rows
  // become paper with a stepped edge (deeper columns rise higher), the rest get random
  // strength and breathing delays.
  (()=>{
    const grid=document.querySelector('.tiles-grid');if(!grid)return;
    const build=()=>{
      const box=grid.getBoundingClientRect(),size=box.width<640?58:74,cols=Math.max(4,Math.round(box.width/size)),rows=Math.ceil(box.height/size)+1;
      grid.style.setProperty('--tc',cols);grid.style.setProperty('--ts',`${box.width/cols}px`);grid.textContent='';
      const edge=Array.from({length:cols},(_,c)=>Math.max(1,Math.round(rows*.52+Math.sin(c*1.3+.6)*1.2+(c%4===1?1:0)-(c%5===3?1:0))));
      const frag=document.createDocumentFragment();
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        const tile=document.createElement('i');
        if(r<edge[c]-1)tile.className='is-paper';
        else{tile.style.setProperty('--o',(r<edge[c]?.55:.7+Math.random()*.3).toFixed(2));tile.style.setProperty('--dl',`${(-Math.random()*7).toFixed(2)}s`);tile.style.setProperty('--dur',`${(5+Math.random()*4).toFixed(2)}s`);}
        frag.append(tile);
      }
      grid.append(frag);
    };
    build();let timer;new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(build,200);}).observe(grid);
  })();
  // The selection frame over the three facts follows the pointer; left alone it steps
  // through the columns every few seconds (not with reduced motion, not off screen).
  (()=>{
    const stage=document.querySelector('.facts-stage'),sel=stage?.querySelector('.sel');if(!sel)return;
    const facts=[...stage.querySelectorAll('.fact')],tag=sel.querySelector('.sel-tag'),names=['Qloo pick','Booked','Without Qloo'];
    let current=1,hovering=false,timer=null;
    const place=index=>{
      const fact=facts[index],box=fact.getBoundingClientRect(),base=stage.getBoundingClientRect(),pad=6;
      sel.style.transform=`translate(${box.left-base.left-pad}px,${box.top-base.top-pad}px)`;
      sel.style.width=`${box.width+pad*2}px`;sel.style.height=`${box.height+pad*2}px`;
      tag.textContent=`${names[index]} · ${Math.round(box.width)} × ${Math.round(box.height)}`;
      sel.classList.add('is-on','is-moving');clearTimeout(place.t);place.t=setTimeout(()=>sel.classList.remove('is-moving'),500);
      current=index;
    };
    facts.forEach((fact,index)=>fact.addEventListener('pointerenter',()=>{hovering=true;place(index);}));
    stage.addEventListener('pointerleave',()=>{hovering=false;});
    addEventListener('resize',()=>place(current));
    place(1);
    if(reduced())return;
    const cycle=()=>{if(!hovering&&!document.hidden)place((current+1)%facts.length);};
    if('IntersectionObserver' in window)new IntersectionObserver(([entry])=>{clearInterval(timer);if(entry.isIntersecting)timer=setInterval(cycle,3200);}).observe(stage);
  })();
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
