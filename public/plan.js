/* The Booking Desk: plan a show live with Qloo, or open a saved plan. Every plan, live or
   saved, is a published record, so the same experiments work on both: turn Qloo off, cut
   the budget, drop an act. Decisions come from the server's exact optimizer; this file only
   renders them. */
'use strict';
(()=>{
  const {e,money,fetchJSON,state}=window.HL,$=id=>document.getElementById(id);
  const FEATURED='8be4d03ef4792ca9f1466983';
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const usd=value=>money(value,view?.base?.memo?.currency??'USD');
  const result=$('plan-result'),form=$('plan-form'),progress=$('plan-progress');
  let view=null; // {record, base, off, current, budget, cancelId, qlooOff}
  let caseRequest=0,calculationRequest=0,autoReach=null; // autoReach: a live plan just made here maps its crowd at once

  // ── Data helpers ───────────────────────────────────────────────────────────────
  const itemsOf=snapshot=>snapshot.memo.items;
  const nameOf=(snapshot,id)=>itemsOf(snapshot).find(item=>item.id===id)?.name??id;
  const billNames=(snapshot,slate=snapshot.memo.slate)=>slate.selectedIds.map(id=>nameOf(snapshot,id));
  const rankReceipt=snapshot=>{
    const bound=new Set(itemsOf(snapshot).flatMap(item=>item.evidenceReceipts?.rank??[]));
    return snapshot.receipts.find(receipt=>receipt.tool==='rank'&&receipt.evidence?.rows?.length&&(!bound.size||bound.has(receipt.id)));
  };
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
    const request=++caseRequest;
    calculationRequest++;
    result.setAttribute('aria-busy','true');
    state(result,{kind:'loading'});
    try{
      const record=await fetchJSON(`/api/judge/cases/${encodeURIComponent(id)}`,{timeout:15000});
      if(request!==caseRequest)return;
      record.snapshot.__analysis=record.analysis;record.snapshot.__proof=record.proof;
      view={record,base:record.snapshot,current:record.snapshot,off:null,budget:record.snapshot.memo.constraints.budget,cancelId:null,qlooOff:false};
      render();if(record.id===FEATURED&&(watchReady||form.contains(document.activeElement)))startReplay();
      if(record.id!==FEATURED||location.search||location.hash)history.replaceState(null,'',record.live?`?plan=${record.id}`:`#${record.id}`);
      if(scroll)result.scrollIntoView({block:'start',behavior:reduced()?'instant':'smooth'});
      if(autoReach===record.id){autoReach=null;if(!record.reach&&record.snapshot.memo.slate.feasible)void requestReach();}
      // The Qloo-off comparison is shown on every plan, so fetch it once up front.
      experiment({qlooOff:true}).then(data=>{if(request===caseRequest&&view?.record.id===record.id){view.off=data.snapshot;render();}}).catch(problem=>{if(request===caseRequest&&view?.record.id===record.id){view.offError=problem;render();}});
    }catch(problem){
      if(request!==caseRequest)return;
      state(result,{kind:problem.kind??'server',title:problem.status===410?'Plan expired':problem.status===404?'Plan not found':undefined,text:problem.status===404?'This plan link is not valid. Open a saved plan above.':problem.message,retry:()=>openCase(id,{scroll})});
    }finally{if(request===caseRequest)result.setAttribute('aria-busy','false');}
  }

  // Each result snapshot keeps the analysis and decision proof computed for it.
  const experiment=body=>fetchJSON(`/api/judge/cases/${view.record.id}/experiment`,{method:'POST',body,timeout:20000,retries:0})
    .then(data=>{data.snapshot.__analysis=data.analysis;data.snapshot.__proof=data.proof;return data;});

  async function rerun(){
    const owner=view,generation=caseRequest,request=++calculationRequest;
    const current=()=>view===owner&&generation===caseRequest&&request===calculationRequest;
    const body={};
    if(view.budget!==view.base.memo.constraints.budget)body.budget=view.budget;
    if(view.cancelId)body.cancelId=view.cancelId;
    if(view.qlooOff)body.qlooOff=true;
    const status=$('result-status');
    if(!Object.keys(body).length){view.current=view.base;render();result.setAttribute('aria-busy','false');return true;}
    if(Object.keys(body).length===1&&body.qlooOff&&view.off){view.current=view.off;render();result.setAttribute('aria-busy','false');return true;}
    result.setAttribute('aria-busy','true');
    try{const data=await experiment(body);if(!current())return null;if(Object.keys(body).length===1&&body.qlooOff){view.off=data.snapshot;view.offError=null;}view.current=data.snapshot;render();return true;}
    catch(problem){if(!current())return null;if(status)status.textContent=problem.status===429?'Too many changes at once. Wait a minute and try again; the last result is still shown.':`${problem.message} The last result is still shown.`;return false;}
    finally{if(current())result.setAttribute('aria-busy','false');}
  }

  // ── Rendering ──────────────────────────────────────────────────────────────────
  // The decision is printed on the owner's blank gig ticket, beside a poster ticket (purple
  // artwork while Qloo evidence is on, red while it is off); the Qloo panel sets the two
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
    const incompleteAffinity=itemsOf(base).some(item=>item.evidence?.rank!==true||!Number.isFinite(item.fit)||item.rankCoverage?.complete===false);
    const provisional=slate.feasible&&(incompleteAffinity||(!view.qlooOff&&slate.status==='provisional'));
    const offBill=view.off?billNames(view.off):null,offFee=view.off?.memo.slate.totalFee;
    const labels={'ordinal-rank':'ordinal rank','min-max-affinity':'min-max affinity','fixed-span-affinity':'fixed-span affinity',unavailable:'unavailable (incomplete rank)',unrecorded:'version not recorded'};
    const ranked=(base.memo.items??[]).filter(item=>item.evidence?.rank===true&&Number.isFinite(item.fit));
    const legacyOrdinal=ranked.length>0&&ranked.every(item=>Number.isFinite(item.rank)&&Number.isFinite(item.of)&&Math.abs(item.fit-(item.of>1?1-(item.rank-1)/(item.of-1):.5))<1e-9);
    const version=record.scoringVersion??(legacyOrdinal?'ordinal-rank':ranked.length?'unrecorded':'unavailable');
    const badges=[record.live?'<span class="badge badge-live">Live plan</span>':'<span class="badge badge-saved">Saved live Qloo run</span>',
      provisional?'<span class="badge badge-warn">Provisional · insufficient affinity evidence</span>':'',
      base.mock?'<span class="badge badge-warn">Synthetic test data</span>':'',
      estimated(record)?'<span class="badge badge-warn">Estimated fees</span>':'<span class="badge badge-muted">Illustrative fees</span>',
      '<span class="badge badge-muted">Assumed availability</span>',
      `<span class="badge badge-muted" data-scoring-version="${e(version)}">Original scoring: ${e(labels[version]??labels.unrecorded)}</span>`,
      record.live?'<span class="badge badge-warn">Genre limits not applied</span>':''].join('');
    const decision=slate.feasible
      ?`${provisional?'Provisional:':'Book'} <span class="decision-bill">${e(billNames(current).join(' + '))}</span> for <span class="decision-fee">${e(usd(slate.totalFee))}</span>.`
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
        <div class="ticket-stage ${view.qlooOff?'is-qloo-off':'is-qloo-on'}${view.flip?' is-swapping':''}">
          <span class="ticket-poster"><img class="tk-on" src="/assets/brand/ticket-vinyl-on.webp" alt="" width="446" height="820"><img class="tk-off" src="/assets/brand/ticket-vinyl.webp" alt="" width="445" height="820"></span>
          <article class="ticket-art${changed?' is-changed':''}" aria-labelledby="result-title">
            <span class="ticket-paper"><img class="tk-on" src="/assets/brand/ticket-blank-on.webp" alt="" width="449" height="1120"><img class="tk-off" src="/assets/brand/ticket-blank.webp" alt="" width="449" height="1120"></span>
            <div class="tk-head">
              <p class="tk-admit">Admit one</p>
              <p class="result-meta">${e(input.city)} · fans of ${e(anchors)} · ${e(usd(budget))} artist budget · ${e(slots)} act${slots===1?'':'s'}</p>
            </div>
            <p class="tk-band tk-band-1" aria-hidden="true">The bill</p>
            <div class="tk-body">
              <h2 id="result-title" class="result-decision">${decision}</h2>
              <p class="result-sub">${slate.feasible?(provisional?'Booking rules pass; affinity evidence is incomplete.':`Every booking rule passes. Best of ${e(slate.feasibleCount)} bookable bills out of ${e(slate.checkedCount)} checked.`):sub}</p>
            </div>
            <p class="tk-band tk-band-2" aria-label="${slate.feasible?`${e(usd(slate.remainingBudget))} under budget`:'No bookable bill'}">${slate.feasible?`${e(usd(slate.remainingBudget))} left`:'No bookable bill'}</p>
            <dl class="tk-stats">
              <div><dt>Budget used</dt><dd>${slate.feasible?`${Math.round(used*100)}%`:'—'}</dd></div>
              <div><dt>Checked</dt><dd>${e(slate.checkedCount)}</dd></div>
              <div><dt>Bookable</dt><dd>${e(slate.feasibleCount)}</dd></div>
            </dl>
          </article>
        </div>
        <section class="result-qloo" aria-label="What Qloo changes">
          <div class="result-badges" aria-label="Plan assumptions and scoring">${badges}</div>
          ${placeNote()}
          <div class="qloo-head">
            <button type="button" class="runway-switch${view.flip?` is-flip-${view.flip}`:''}" id="plan-switch" role="switch" aria-checked="${!view.qlooOff}" aria-describedby="plan-switch-note">
              <span class="rw-track" aria-hidden="true"><span class="rw-ink rw-ink-a"></span><span class="rw-ink rw-ink-b"></span><svg class="rw-water" viewBox="0 0 160 40" preserveAspectRatio="none"><path d="M0 22Q10 17 20 22T40 22T60 22T80 22T100 22T120 22T140 22T160 22V40H0z"/></svg><svg class="rw-wake" viewBox="0 0 200 40" preserveAspectRatio="none"><path pathLength="100" d="M0 20Q12.5 8 25 20T50 20T75 20T100 20T125 20T150 20T175 20T200 20"/></svg><span class="rw-knob"></span></span>
              <span class="rw-label"><span class="rw-title">Qloo evidence</span> <span class="rw-state">${view.qlooOff?'off':'on'}</span></span>
            </button>
            <p id="plan-switch-note" class="result-qloo-note${view.flip?' is-arriving':''}">${incompleteAffinity?'Affinity comparison unavailable: complete Qloo ranking evidence is missing. The on/off view is a supporting-evidence diagnostic, not proof that Qloo improves the bill.':offBill?(sameIds(view.off.memo.slate.selectedIds,baseSlate.selectedIds)
              ?`Without Qloo evidence, the same rules select the same bill. Here Qloo explains the choice but does not change it.`
              :`Without Qloo evidence, the same rules select <strong>${e(offBill.join(' + '))}</strong> for ${e(usd(offFee))}. Qloo changes this decision.`)
              :view.offError?'The comparison without Qloo could not load just now. Use the switch to try again.':'Checking what the same rules select without Qloo…'}</p>
          </div>
          <div class="compare${view.qlooOff?' is-off':''}">
            <span class="compare-glide" aria-hidden="true"></span>
            ${side('on','With Qloo evidence',billNames(base),baseSlate.totalFee,!view.qlooOff)}
            <span class="compare-arrow" aria-hidden="true">→</span>
            ${side('off','Without Qloo evidence',offBill,offFee,view.qlooOff)}
          </div>
          ${slate.feasible&&slots>1?`<p class="result-why">${provisional?'This provisional bill meets booking constraints, but missing affinity cannot support a confident taste recommendation.':`Not simply Qloo’s top ${e(slots)}: the optimizer weighs each act’s Qloo fit against its fee and selects the highest scoring set that fits the budget.`}</p>`:''}
          ${changed?`<p class="result-changed">Changed from the original bill: ${e(billNames(base).join(' + '))} (${e(usd(baseSlate.totalFee))}).</p>`:''}
        </section>
      </div>
      ${solidSection()}
      ${actSections()}
      ${reachSection()}
      ${nextSteps()}
      <div class="result-controls" aria-labelledby="controls-title">
        <div class="controls-copy">
          <h3 id="controls-title">Change the plan</h3>
          <p class="control-help">Move the budget or drop a selected act. The exact optimizer runs again on the same saved evidence, with no new Qloo calls.</p>
        </div>
        <div class="control-budget">
          <label for="plan-budget-range">Artist budget <strong id="plan-budget-value">${e(usd(view.budget))}</strong></label>
          <input type="range" id="plan-budget-range"${ladderTicks()} min="${Math.max(0,Math.round(base.memo.constraints.budget*.4/100)*100)}" max="${Math.round(base.memo.constraints.budget*1.5/100)*100}" step="100" value="${view.budget}">
          <div class="control-presets">${[1,.9,.8,.7].map(f=>{const value=Math.round(base.memo.constraints.budget*f);return `<button type="button" class="preset${value===view.budget?' is-on':''}" data-budget="${value}">${f===1?'Original':`${Math.round(f*100)}%`}</button>`;}).join('')}
            <button type="button" class="preset preset-reset" id="plan-reset"${view.budget===base.memo.constraints.budget&&!view.cancelId&&!view.qlooOff?' disabled':''}>Reset changes</button></div>
          ${ladderHtml()}
        </div>
        <p id="result-status" class="result-status" role="status" aria-live="polite"></p>
      </div>
      ${record.live?`<p class="result-terms">${e(record.terms)} <button type="button" class="link-button" id="plan-share">Copy link to this plan</button></p>`:''}`;
    view.flip=null;
    wire();
  }

  // How solid is the bill shown: the share of ±20% fee scenarios that keep it, the fee at
  // which each booked act would flip it and the cut that would bring another act in, and
  // which class of Qloo evidence the decision rests on. Each figure is exact and comes from
  // the server; this only lays them out.
  const SIGNALS=[['rank','Audience ranking','Qloo’s affinity of each candidate for these fans'],['local','Where the fans are','Qloo’s popularity of each act within the city'],
    ['trends','Six-month trend','Rising or cooling interest'],['comparison','Audience overlap','How each act’s audience overlaps the anchors’']];
  const whole=value=>usd(Math.floor(value+1e-9));
  const pct=share=>`${Math.round(share*100)}%`;
  // How a live plan spent its deep Qloo checks (value of information), from the saved run.
  function researchTrail(){
    const research=view.base.memo.research;
    if(research?.method!=='value-of-information'||!research.candidates?.length)return '';
    const billed=view.base.memo.slate.feasible;
    const reasons={'could-change':['Checked','Its result could change the bill'],'verifies-bill':['Checked','In the bill before checks; verified'],'could-change-no-budget':['Not checked','Could change the bill; no calls left'],'verifies-bill-no-budget':['Not checked','In the bill before checks; no calls left'],
      'no-effect':['Skipped',billed?'No possible result changes the bill':'No possible result makes a bill fit']};
    const checked=research.candidates.filter(row=>row.reason==='could-change'||row.reason==='verifies-bill').length;
    return `<article class="solid-card solid-research" id="solid-research">
        <p class="solid-kicker">How the agent spent its Qloo calls</p>
        <p class="solid-text">Before any deep check, the agent tried all ${e(research.outcomes)} results a check could return for each act and asked the optimizer whether the bill would change. “Before checks” means the bill from Qloo’s ranking alone; the checks can still change it. ${checked?`It checked ${e(checked)} of ${e(research.candidates.length)} acts.`:billed?'No check could change the bill, so it made none.':'No check could make any bill fit this budget, so it made none and saved those Qloo calls.'}</p>
        <ul class="trail-list">${research.candidates.map(row=>{const [tag,why]=reasons[row.reason]??['',''];return `<li class="trail is-${e(row.reason)}"><strong>${e(nameOf(view.base,row.id))}</strong><span class="trail-tag">${e(tag)}</span><small>${e(why)}${row.bills>1?` · ${e(row.bills)} possible bills`:''}</small></li>`;}).join('')}</ul>
      </article>`;
  }
  // When no bill fits: the smallest budget at which one does (from the ladder), and the
  // research trail, which explains why the agent spent no calls on deep checks.
  function noBillSection(){
    const first=view.current.__analysis?.ladder?.status==='ready'?view.current.__analysis.ladder.steps.find(step=>step.budget>view.budget):null;
    const trail=researchTrail();
    if(!first&&!trail)return '';
    const names=ids=>ids.map(id=>nameOf(view.current,id)).join(' + ');
    return `<section class="solid solid-none" aria-labelledby="solid-title">
        <div class="solid-head"><h3 id="solid-title">Why no bill fits</h3><p>Exact checks on the same saved evidence. No new Qloo calls.</p></div>
        ${first?`<article class="solid-card solid-first">
          <p class="solid-kicker">The first bill that fits</p>
          <p class="solid-text">At today’s fees the cheapest bill that passes every other rule costs <strong>${e(usd(first.total))}</strong>, ${e(usd(first.total-view.budget))} over this budget. From ${e(usd(first.budget))} the optimizer books <strong>${e(names(first.selectedIds))}</strong>.</p>
          <button type="button" class="preset solid-first-go" data-budget="${e(first.budget)}">Set budget to ${e(usd(first.budget))}</button>
        </article>`:''}
        ${trail}
      </section>`;
  }
  function solidSection(){
    const {current,record}=view,slate=current.memo.slate,analysis=current.__analysis,proof=current.__proof;
    if(!slate.feasible)return noBillSection();
    if(!analysis)return '';
    const names=ids=>ids.map(id=>nameOf(current,id)).join(' + '),robust=analysis.robustness,flips=analysis.flips;
    const est=estimated(record)?' est.':'';
    let meter='';
    if(robust?.status==='ready'){
      const alts=robust.alternatives,others=Math.max(0,robust.draws-robust.holds-robust.noBill-alts.reduce((sum,row)=>sum+row.draws,0));
      const segments=[['hold',robust.holds,'This bill'],...alts.map((row,index)=>[`alt-${index+1}`,row.draws,names(row.selectedIds)]),['other',others,'Other bills'],['none',robust.noBill,'No bill fits']].filter(([,count])=>count>0);
      const verdict=robust.share>=.9?'Solid':robust.share>=.6?'Holds in most scenarios':robust.share>=.35?'Close call':'Fragile';
      meter=`<article class="solid-card solid-meter" id="solid-fees" data-share="${e(robust.share.toFixed(3))}">
          <p class="solid-kicker">Fee robustness</p>
          <p class="solid-figure"><strong>${e(pct(robust.share))}</strong><span>${e(verdict)}</span></p>
          <p class="solid-text">In ${e(robust.holds)} of ${e(robust.draws)} scenarios where ${robust.feeModel==='popularity-tiers'?'each estimated fee moves across its Qloo popularity tier':`every fee moves by up to ±${e(Math.round(robust.spread*100))}%`}, the optimizer books this same bill.</p>
          <div class="solid-bar" role="img" aria-label="${e(segments.map(([,count,label])=>`${label} ${pct(count/robust.draws)}`).join(', '))}">${segments.map(([key,count])=>`<span class="seg seg-${key}" style="flex-grow:${count}"></span>`).join('')}</div>
          ${alts.length||robust.noBill?`<ul class="solid-legend">${alts.map((row,index)=>`<li><span class="dot seg-alt-${index+1}" aria-hidden="true"></span>${e(names(row.selectedIds))}<b>${e(pct(row.share))}</b></li>`).join('')}${robust.noBill?`<li><span class="dot seg-none" aria-hidden="true"></span>No bill fits the budget<b>${e(pct(robust.noBill/robust.draws))}</b></li>`:''}</ul>`:'<p class="solid-note">No other bill wins in any scenario.</p>'}
          ${robust.safer?`<div class="safer"><p class="safer-title">Safer pick</p><p class="safer-bill">${e(names(robust.safer.selectedIds))} <span>${e(usd(robust.safer.total))}${est}</span></p>
            <p class="solid-note">Wins ${e(pct(robust.safer.share))} of scenarios against this bill’s ${e(pct(robust.share))}, and fits today’s budget. It scores ${e(robust.safer.scoreGap.toFixed(1))} points lower at today’s fees, which is why the optimizer did not choose it.</p></div>`:''}
        </article>`;
    }
    let points='';
    if(flips?.status==='ready'){
      // One row per booked act: today's fee, the highest fee at which the bill still stands,
      // and the bill above that. Phones show each row as a small card.
      const booked=flips.booked.map(flip=>`<tr class="flip-row" data-act="${e(flip.id)}">
            <th scope="row" data-label="Act">${e(nameOf(current,flip.id))}</th>
            <td data-label="Fee today">${e(usd(flip.fee))}${est}</td>
            <td data-label="Holds up to">${flip.headroom>=1?`<strong>${e(whole(flip.maxFee))}</strong> <span class="flip-room">+${e(whole(flip.headroom))}</span>`:'<strong>At its limit</strong>'}</td>
            <td data-label="Above that">${flip.replacement?e(names(flip.replacement.selectedIds)):'No bill fits'}</td>
          </tr>`).join('');
      const close=flips.entries.filter(entry=>entry.entryFee!=null).sort((a,b)=>a.cut/a.fee-b.cut/b.fee).slice(0,3);
      const shut=flips.entries.length-flips.entries.filter(entry=>entry.entryFee!=null).length;
      points=`<article class="solid-card solid-flips" id="solid-flips">
          <p class="solid-kicker">Flip points</p>
          <p class="solid-text">One fee moves, every other fee stays. The exact fee at which each booked act changes the bill.</p>
          <table class="flip-table"><thead><tr><th scope="col">Act</th><th scope="col">Fee today</th><th scope="col">Holds up to</th><th scope="col">Above that, the bill becomes</th></tr></thead><tbody>${booked}</tbody></table>
          ${close.length?`<p class="solid-sub">Closest to getting in</p><ul class="entry-list">${close.map(entry=>`<li><strong>${e(nameOf(current,entry.id))}</strong> at ${e(whole(entry.entryFee))} or less <span class="entry-cut">−${e(usd(Math.ceil(entry.cut-1e-9)))}</span><small>Bill: ${e(names(entry.bill.selectedIds))}</small></li>`).join('')}</ul>`:''}
          ${shut?`<p class="solid-note">${e(shut)} other act${shut===1?'':'s'} would not enter at any fee: the bill outscores every set that includes ${shut===1?'it':'them'}.</p>`:''}
        </article>`;
    }
    let signals='';
    if(view.qlooOff)signals=`<article class="solid-card solid-signals" id="solid-signals"><p class="solid-kicker">Qloo signals</p><p class="solid-text">Qloo evidence is off, so no signal shapes this bill. Switch it on to see which one decides it.</p></article>`;
    else if(proof?.ablations){
      const rows=SIGNALS.map(([kind,label,hint])=>{
        const row=proof.ablations.find(item=>item.id===`class:${kind}`);if(!row)return '';
        const used=row.affectedIds?.length>0,moved=used&&row.changed;
        return `<li class="signal${moved?' is-decisive':''}${used?'':' is-absent'}" data-signal="${kind}">
            <span class="signal-mark" aria-hidden="true"></span>
            <p><strong>${e(label)}</strong><small>${e(hint)}</small></p>
            <p class="signal-effect">${!used?'Not gathered for this pool':moved?(row.feasible?`Without it: ${e(names(row.selectedIds))}`:'Without it: no bill fits'):'Same bill without it'}</p>
          </li>`;}).join('');
      const decisive=SIGNALS.filter(([kind])=>{const row=proof.ablations.find(item=>item.id===`class:${kind}`);return row?.affectedIds?.length&&row.changed;}).map(([,label])=>label.toLowerCase());
      const all=proof.ablations.find(item=>item.id==='class:all');
      signals=`<article class="solid-card solid-signals" id="solid-signals">
          <p class="solid-kicker">Which Qloo signal decides it</p>
          <p class="solid-text">${decisive.length?`Removing ${e(listNames(decisive))} on ${decisive.length===1?'its':'their'} own changes the bill.`:all?.changed?'No single signal changes the bill alone; together they do.':'The bill stands without any one signal.'}</p>
          <ul class="signal-list">${rows}</ul>
        </article>`;
    }
    // Does Qloo separate the picks? Each booked act's survival when affinities move within the
    // near-tie band, and the act that takes its place when it does not survive.
    let separation='';
    const aff=analysis.affinity;
    if(!view.qlooOff&&aff?.status==='ready'){
      const labels={clear:'Clear pick','likely':'Likely pick','coin-flip':'Coin flip'};
      separation=`<article class="solid-card solid-affinity" id="solid-affinity">
          <p class="solid-kicker">Does Qloo separate the picks?</p>
          <p class="solid-text">Each Qloo affinity moves by up to ±${e((aff.band/2).toFixed(3))}, the near-tie band, in ${e(aff.draws)} draws. The bill stays in <strong>${e(pct(aff.share))}</strong>.</p>
          <ul class="sep-list">${aff.acts.map(act=>`<li class="sep is-${e(act.verdict)}" data-act="${e(act.id)}">
              <p class="sep-name"><strong>${e(nameOf(current,act.id))}</strong><span class="sep-chip">${e(labels[act.verdict])}</span></p>
              <span class="flip-track" aria-hidden="true"><span style="width:${(act.share*100).toFixed(1)}%"></span></span>
              <p class="flip-text">Stays in ${e(pct(act.share))} of draws${act.rival&&act.share<1?`; otherwise ${e(nameOf(current,act.rival.id))}${act.affinity!=null&&act.rival.affinity!=null?` (affinity ${e(act.affinity.toFixed(4))} vs ${e(act.rival.affinity.toFixed(4))})`:''}`:''}.</p>
            </li>`).join('')}</ul>
          <p class="solid-note">${aff.scale==='ordinal'?'This plan scored fit by Qloo rank order, so a near-tie that swaps two ranks moves fit by a whole rank step.':'Fit comes from Qloo affinity on a fixed 0.05 span.'}</p>
        </article>`;
    }
    const trail=researchTrail();
    if(!meter&&!points&&!signals&&!separation&&!trail)return '';
    // The verdict in one line: each item names the finding and links to the card behind it.
    const verdicts=[];
    if(robust?.status==='ready')verdicts.push(['solid-fees',robust.share>=.9?'good':robust.share>=.6?'':'warn',`Holds in ${pct(robust.share)} of fee scenarios`]);
    if(!view.qlooOff&&aff?.status==='ready'){
      const coin=aff.acts.filter(act=>act.verdict==='coin-flip');
      verdicts.push(['solid-affinity',coin.length?'warn':'good',coin.length?`${coin.length===1?'One coin-flip pick':`${coin.length} coin-flip picks`}: ${listNames(coin.map(act=>nameOf(current,act.id)))}`:'Qloo separates every pick']);
    }
    if(!view.qlooOff&&proof?.ablations){
      const decisive=SIGNALS.filter(([kind])=>{const row=proof.ablations.find(item=>item.id===`class:${kind}`);return row?.affectedIds?.length&&row.changed;}).map(([,label])=>label);
      verdicts.push(['solid-signals','',decisive.length?`${listNames(decisive)} decide${decisive.length===1?'s':''} it`:'No single Qloo signal decides it']);
    }
    const ladder=analysis.ladder;
    if(ladder?.status==='ready'&&ladder.steps.length>1)verdicts.push(['ladder-title','',`Bill changes at ${ladder.steps.slice(-3).map(step=>whole(step.budget)).join(' · ')}`]);
    const research=view.base.memo.research;
    if(trail&&research)verdicts.push(['solid-research','',`Agent checked ${research.candidates.filter(row=>row.reason==='could-change'||row.reason==='verifies-bill').length} of ${research.candidates.length} acts`]);
    const strip=verdicts.length?`<ul class="verdict-strip" aria-label="Summary">${verdicts.map(([target,tone,text])=>`<li><a href="#${target}" class="verdict${tone?` is-${tone}`:''}" data-jump="${target}">${e(text)}</a></li>`).join('')}</ul>`:'';
    // On phones each card starts folded to its headline; the button opens the rest.
    const more='<button type="button" class="solid-more" aria-expanded="false">Show details</button>';
    const fold=html=>{const card=html.trimEnd().replace('<article class="solid-card ','<article class="solid-card is-collapsed ');return `${card.slice(0,-'</article>'.length)}${more}</article>`;};
    return `<section class="solid" aria-labelledby="solid-title">
        <div class="solid-head"><h3 id="solid-title">How solid is this bill?</h3><p>Exact checks on the same saved evidence. No new Qloo calls; fees remain${estimated(record)?' estimates':' illustrative'}.</p></div>
        ${strip}
        <div class="solid-grid">${[meter,points,separation,signals].filter(Boolean).map(fold).join('')}</div>${trail?fold(trail):''}
      </section>`;
  }

  // Every budget within the slider's range at which the bill changes, at today's fees. Each
  // step is a button that sets the budget there; the step holding the current budget is marked.
  const ladderRange=()=>{const budget=view.base.memo.constraints.budget;return [Math.max(0,Math.round(budget*.4/100)*100),Math.round(budget*1.5/100)*100];};
  // Marks on the slider track where the bill changes.
  // Marks drawn into the slider track (as background layers) where the bill changes.
  function ladderTicks(){
    const ladder=view.current.__analysis?.ladder,[min,max]=ladderRange();
    if(ladder?.status!=='ready'||!(max>min))return '';
    const marks=ladder.steps.filter(step=>step.budget>=min&&step.budget<=max);
    if(!marks.length)return '';
    const layers=marks.map(()=>'linear-gradient(var(--pp-accent),var(--pp-accent))').join(','),at=marks.map(step=>`${((step.budget-min)/(max-min)*100).toFixed(2)}% 0`).join(',');
    return ` style="--tick-layers:${layers};--tick-at:${at};--tick-size:${marks.map(()=>'2px 100%').join(',')}"`;
  }
  function ladderHtml(){
    const ladder=view.current.__analysis?.ladder,[min,max]=ladderRange();
    if(ladder?.status!=='ready'||!ladder.steps.length)return '';
    const steps=ladder.steps.filter(step=>step.budget<=max),shown=steps.filter((step,index)=>step.budget>=min||steps[index+1]?.budget>min);
    if(!shown.length)return '';
    const currentIndex=steps.reduce((found,step,index)=>step.budget<=view.budget?index:found,-1);
    const names=ids=>ids.map(id=>nameOf(view.current,id)).join(' + ');
    return `<div class="ladder" aria-labelledby="ladder-title">
        <p class="ladder-title" id="ladder-title">Where the bill changes <small>at today’s fees</small></p>
        <ol class="ladder-steps">${shown.map(step=>{const at=steps.indexOf(step)===currentIndex;
          return `<li${at?' class="is-current"':''}><button type="button" data-budget="${Math.max(step.budget,min)}" aria-label="Set budget to ${e(usd(Math.max(step.budget,min)))}: ${e(names(step.selectedIds))}${at?' (current bill)':''}"><span class="ladder-at">${step.budget<min?`below ${e(usd(min))}`:`from ${e(usd(step.budget))}`}</span><span class="ladder-bill">${e(names(step.selectedIds))}</span><span class="ladder-fee">${e(usd(step.total))}</span></button></li>`;}).join('')}</ol>
        ${currentIndex<0?`<p class="ladder-note">No bill fits below ${e(usd(steps[0].budget))}.</p>`:''}
      </div>`;
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
    const status=dropped?['act-dropped','Dropped']:booked?['act-booked','Selected']:fee==null?['act-over','No fee']:over?['act-over','Over budget']:['act-bench','Not picked'];
    const why=booked?'':dropped?'You dropped this act.':fee==null?'No fee supplied, so it cannot be selected.':over?'Costs more than the whole budget.':total==null?'':fitsSwap?'Fits the budget, but the selected set scores higher.':'Over budget alongside the rest of the bill.';
    const chips=[item.found?'Suggested by Qloo':'',item.local==='yes'?`Fans concentrated in ${city}`:'',item.momentum==='rising'?'Rising':item.momentum==='cooling'?'Cooling':''].filter(Boolean);
    const feeText=fee==null?'No fee':`${usd(fee)}${estimated(record)?' est.':''}`;
    return {score,position,booked,dropped,status,why,chips,feeText,rank:rankReceipt(base)};
  }
  // What the analysis says about one booked act, next to the act itself: whether Qloo
  // separates it, how far its fee can rise, and whether the agent checked it in depth.
  function actInsights(item){
    const analysis=view.current.__analysis,out=[];if(!analysis)return out;
    const act=!view.qlooOff&&analysis.affinity?.status==='ready'?analysis.affinity.acts.find(row=>row.id===item.id):null;
    if(act)out.push(['solid-affinity',act.verdict==='coin-flip'?'warn':act.verdict==='clear'?'good':'',act.verdict==='coin-flip'?`Coin flip with ${act.rival?nameOf(view.current,act.rival.id):'another act'}`:act.verdict==='clear'?'Clear Qloo pick':`Likely pick · ${pct(act.share)}`]);
    const flip=analysis.flips?.status==='ready'?analysis.flips.booked.find(row=>row.id===item.id):null;
    if(flip)out.push(['solid-flips','',flip.headroom>=1?`Fee can rise ${whole(flip.headroom)}`:'At its fee limit']);
    const research=view.base.memo.research?.candidates?.find(row=>row.id===item.id);
    if(research)out.push(['solid-research','',{'could-change':'Checked in depth: could change the bill','verifies-bill':'Checked in depth','could-change-no-budget':'Not checked: no calls left','verifies-bill-no-budget':'Not checked: no calls left','no-effect':'Not checked: no result changes it'}[research.reason]??'']);
    return out.filter(([, ,text])=>text);
  }
  function card(item){
    const f=actFacts(item),anchors=anchorText(view.base),city=view.base.memo.input.city,insights=actInsights(item);
    return `<li class="act-card is-booked">
      <div class="act-ring">${ring(f.position,item.rank?`#${item.rank}`:'—')}</div>
      <div class="act-main">
        <p class="act-kicker"><span class="act-status act-booked">Selected</span>${item.rank?`Qloo rank ${e(item.rank)} of ${e(item.of)}`:'No Qloo rank'}</p>
        <h4>${e(item.name)}</h4>
        <p class="act-fee">${e(f.feeText)}${f.score!=null?` · affinity ${e(f.score.toFixed(3))}`:''}</p>
        <p class="act-for">For ${e(anchors)} fans in ${e(city)}</p>
        ${f.chips.length?`<p class="act-chips">${f.chips.map(chip=>`<span>${e(chip)}</span>`).join('')}</p>`:''}
        ${insights.length?`<ul class="act-insights" aria-label="Analysis for ${e(item.name)}">${insights.map(([target,tone,text])=>`<li><a href="#${target}" class="insight${tone?` is-${tone}`:''}" data-jump="${target}">${e(text)}</a></li>`).join('')}</ul>`:''}
      </div>
      <div class="act-actions">${f.rank?`<button type="button" class="button subtle small" data-receipt="${e(f.rank.id)}" data-entity="${e(item.name)}">Qloo receipt</button>`:''}${!view.qlooOff?`<button type="button" class="button subtle small" data-drop="${e(item.id)}" aria-label="Drop ${e(item.name)} and rebook">Drop</button>`:''}</div>
    </li>`;
  }
  // The fee at which an unbooked act would enter the bill (exact, other fees fixed).
  function entryText(item){
    const flips=view.current.__analysis?.flips;if(flips?.status!=='ready'||view.cancelId===item.id)return '';
    const entry=flips.entries.find(row=>row.id===item.id);if(!entry)return '';
    return entry.entryFee==null?'A lower fee would not bring it in.':`Enters at ${whole(entry.entryFee)} or less.`;
  }
  function row(item){
    const f=actFacts(item);
    return `<li class="act-card rank-row${f.dropped?' is-dropped':''}">
      <span class="rank-no">${item.rank?`#${e(item.rank)}`:'—'}</span>
      <span class="rank-name"><strong>${e(item.name)}</strong>${f.chips.length?`<small>${e(f.chips.join(' · '))}</small>`:''}</span>
      <span class="rank-aff">${f.score!=null?`<span class="rank-bar"><span style="width:${(f.position*100).toFixed(1)}%"></span></span><span class="rank-num">${e(f.score.toFixed(3))}</span>`:'<span class="rank-num">—</span>'}</span>
      <span class="rank-fee">${e(f.feeText)}</span>
      <span class="rank-why"><span class="act-status ${f.status[0]}">${f.status[1]}</span>${f.why?`<small>${e(f.why)}</small>`:''}${entryText(item)?`<small class="rank-entry">${e(entryText(item))}</small>`:''}</span>
      ${f.rank?`<button type="button" class="rank-receipt" data-receipt="${e(f.rank.id)}" data-entity="${e(item.name)}" aria-label="Qloo receipt for ${e(item.name)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg></button>`:'<span></span>'}
    </li>`;
  }
  function actSections(){
    const selected=view.current.memo.slate.selectedIds,items=[...itemsOf(view.current)].sort((a,b)=>(a.rank??99)-(b.rank??99));
    const booked=selected.map(id=>items.find(item=>item.id===id)).filter(Boolean),others=items.filter(item=>!selected.includes(item.id));
    return `<div class="lineup">
        <h3 class="act-heading">The bill</h3>
        <ul class="act-grid" aria-label="Selected acts">${booked.map(card).join('')||'<li class="act-empty">No act can be selected under these rules.</li>'}</ul>
        ${others.length?`<details class="act-others"${matchMedia('(min-width: 700px)').matches?' open':''}><summary>The other ${others.length} candidates${itemsOf(view.base).every(item=>item.evidence?.rank===true&&Number.isFinite(item.fit)&&item.rankCoverage?.complete!==false)?' Qloo ranked':''}</summary>
          <div class="rank-table">
            <div class="rank-head" aria-hidden="true"><span>Rank</span><span>Artist</span><span>Qloo affinity</span><span>Fee</span><span>Why not selected</span><span></span></div>
            <ol aria-label="Other candidates">${others.map(row).join('')}</ol>
          </div></details>`:''}
      </div>`;
  }

  // What the map says about this plan's location. Qloo answers for any place name, so a live plan
  // measures Qloo's location data against the place confirmed on OpenStreetMap.
  function placeNote(){
    const place=view.record.place;if(!place)return '';
    const near=place.nearKm??75,name=e(place.name??view.base.memo.input.city);
    const text={'this-place':['good',`Location checked: Qloo’s location data for this plan sits around <strong>${name}</strong>.`],
      partly:['warn',`Location partly matched: ${e(place.within)} of ${e(place.tiles)} Qloo location results are within ${e(near)} km of <strong>${name}</strong>. Only an act with a result that close can count as having local fans.`],
      elsewhere:['warn',`Qloo has no location data near <strong>${name}</strong>: its nearest result is about ${e(place.nearestKm)} km away, so this plan claims no local fans. The audience ranking is Qloo’s wider view of this place name.`],
      unmeasured:['',`<strong>${name}</strong> is confirmed on the map. This plan ran no location check against it.`],
      unavailable:['warn','The map check was unavailable, so this place was not verified.']}[place.status];
    if(!text)return '';
    return `<p class="place-note${text[0]?` is-${text[0]}`:''}" data-place="${e(place.status)}">${text[1]} <small>Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a></small></p>`;
  }
  // Where a bookable, real plan can go next.
  function nextSteps(){
    if(!view.base.memo.slate.feasible||view.base.mock===true)return '';
    return `<section class="plan-next" aria-labelledby="next-title"><div><h3 id="next-title">Would this night make money?</h3><p>Run this plan’s artists through 10,000 scenarios with your own venue, ticket and cost assumptions.</p></div><a class="hero-cta sketch-btn" href="/financial.html?plan=${encodeURIComponent(view.record.id)}">Run the finances <span aria-hidden="true">→</span></a></section>`;
  }

  // ── Who the bill reaches ───────────────────────────────────────────────────────
  // Brands, places and podcasts that fans of the booked acts favour, from three Qloo calls
  // made after the decision and saved beside the plan. Qloo's explainability gives each
  // booked act's share of every lead. The leads never change the bill.
  const ACT_TONES=['#5E44B8','#C2557F','#2F7FA3','#A87414'];
  function reachSection(){
    const base=view.base;if(!base.memo.slate.feasible)return '';
    const reach=view.record.reach,city=base.memo.input.city,bill=billNames(base);
    const head=`<div class="solid-head"><h3 id="reach-title" tabindex="-1">Who this bill reaches</h3><p>What fans of ${e(bill.join(' + '))} like beyond music, from Qloo. The bill does not change.</p></div>`;
    if(!reach)return `<section class="reach" id="reach" aria-labelledby="reach-title">${head}
        <div class="solid-card reach-empty">
          <p class="solid-kicker">Beyond the bill</p>
          <p class="solid-text">Qloo’s taste graph spans brands, places and podcasts, not just artists. Using the booked acts as the signal, three Qloo calls find sponsor leads, places in ${e(city)} for posters and an aftershow, and podcasts to advertise on, with the act that drives each one.</p>
          <p class="reach-go"><button type="button" class="hero-cta reach-run" id="reach-run"${view.reachBusy?' disabled aria-busy="true"':''}>${view.reachBusy?'Asking Qloo…':'Map this crowd with Qloo <span aria-hidden="true">→</span>'}</button><small>3 Qloo calls, saved with this plan</small></p>
          ${view.reachError?`<p class="reach-error" role="alert">${e(view.reachError)}</p>`:''}
        </div>
      </section>`;
    const acts=reach.selectedIds.map((id,index)=>({id,name:nameOf(base,id),tone:ACT_TONES[index%ACT_TONES.length]}));
    const tone=id=>acts.find(act=>act.id===id)?.tone??'#D9D6E0';
    const leads=reach.groups.flatMap(group=>group.leads).filter(item=>item.drivers?.length===acts.length);
    // Each act's average share of Qloo's explanation across every lead it was given for.
    const pull=acts.map(act=>({...act,share:leads.length?leads.reduce((sum,item)=>sum+(item.drivers.find(d=>d.id===act.id)?.share??0),0)/leads.length:null}));
    const top=type=>reach.groups.find(group=>group.type===type)?.leads[0]?.name;
    const parts=[top('brand')&&`favour <strong>${e(top('brand'))}</strong>`,top('podcast')&&`listen to <strong>${e(top('podcast'))}</strong>`,top('place')&&`go to <strong>${e(top('place'))}</strong>`].filter(Boolean);
    const lead=item=>{
      const d=item.drivers?.length===acts.length&&acts.length>1?item.drivers:[];
      const split=d.map(x=>`${nameOf(base,x.id)} ${pct(x.share)}`).join(', ');
      const leader=d.length?[...d].sort((a,b)=>b.share-a.share)[0]:null;
      return `<li class="reach-lead">
          <p class="reach-name"><strong>${e(item.name)}</strong>${item.affinity!=null?`<span class="reach-aff" title="Qloo affinity">${e(item.affinity.toFixed(3))}</span>`:''}</p>
          ${item.address?`<small class="reach-addr">${e(item.address)}</small>`:''}
          ${d.length?`<span class="reach-mix" role="img" aria-label="${e(`Qloo explanation: ${split}`)}">${d.map(x=>`<span style="flex-grow:${x.share.toFixed(4)};background:${tone(x.id)}"></span>`).join('')}</span>
          <small class="reach-who">${leader.share>=.55?`Mostly ${e(nameOf(base,leader.id))}`:leader.share<1/d.length+.02?'Even split across the bill':`Leans ${e(nameOf(base,leader.id))} · ${e(pct(leader.share))}`}</small>`:''}
        </li>`;
    };
    const changed=!sameIds(view.current.memo.slate.selectedIds,reach.selectedIds);
    return `<section class="reach" id="reach" aria-labelledby="reach-title">${head}
        ${parts.length?`<p class="reach-line">Fans of this bill ${parts.length>1?`${parts.slice(0,-1).join(', ')} and ${parts.at(-1)}`:parts[0]}.</p>`:''}
        ${acts.length>1&&leads.length?`<ul class="reach-legend" aria-label="Which booked act drives these leads">${pull.map(act=>`<li><span class="dot" style="background:${act.tone}" aria-hidden="true"></span>${e(act.name)}<b>${e(pct(act.share))}</b></li>`).join('')}<li class="reach-legend-note">average share of Qloo’s explanation</li></ul>`:''}
        ${changed?'<p class="reach-changed">These leads are for the original bill. The changed bill above would reach a different crowd.</p>':''}
        <div class="reach-grid">${reach.groups.map(group=>`<article class="solid-card reach-card" data-domain="${e(group.type)}">
            <p class="solid-kicker">${e(group.label)}</p>
            <p class="solid-text">${e(group.hint)}${group.type==='place'?` in ${e(reach.city)}`:''}</p>
            ${group.leads.length?`<ol class="reach-list">${group.leads.map(lead).join('')}</ol>`:'<p class="solid-note">Qloo returned none for this crowd.</p>'}
            <button type="button" class="link-button reach-receipt" data-receipt="${e(group.receiptId)}">Qloo receipt</button>
          </article>`).join('')}</div>
        <p class="solid-note reach-note">${reach.mock?'<strong>Synthetic development data, not from Qloo.</strong> ':''}${e(reach.note)} ${e(reach.receipts.length)} Qloo calls on ${e(new Date(reach.createdAt).toUTCString().slice(5,16))}.</p>
      </section>`;
  }
  async function requestReach(){
    const owner=view;if(!owner||owner.reachBusy)return;
    owner.reachBusy=true;owner.reachError=null;render();
    try{owner.record.reach=(await fetchJSON(`/api/judge/cases/${encodeURIComponent(owner.record.id)}/reach`,{method:'POST',timeout:90000,retries:0})).reach;}
    catch(problem){owner.reachError=problem?.message||'Qloo could not map this audience just now. The plan is unchanged.';}
    finally{
      owner.reachBusy=false;if(view!==owner)return;
      render();
      const status=$('result-status');if(status)status.textContent=owner.record.reach?'Audience mapped: sponsor leads, places and podcasts for fans of this bill.':owner.reachError;
      if(owner.record.reach)$('reach-title')?.focus({preventScroll:true});else $('reach-run')?.focus({preventScroll:true});
    }
  }

  function wire(){
    const owner=view,generation=caseRequest,current=()=>view===owner&&generation===caseRequest;
    const say=text=>{const status=$('result-status');if(status)status.textContent=text;};
    $('plan-switch').addEventListener('click',async()=>{
      view.qlooOff=!view.qlooOff;if(view.qlooOff)view.cancelId=null;view.flip=view.qlooOff?'off':'on';
      // A refused request leaves the shown bill unchanged, so the switch must not stay flipped.
      const applied=await rerun();if(applied===null||!current())return;
      if(!applied){view.qlooOff=!view.qlooOff;const message=$('result-status').textContent;render();$('result-status').textContent=message;$('plan-switch').focus();return;}
      $('plan-switch').focus();
      say(view.qlooOff?`Qloo evidence off. The bill is ${billNames(view.current).join(' and ')}.`:`Qloo evidence on. The bill is ${billNames(view.current).join(' and ')}.`);
    });
    const range=$('plan-budget-range');let timer;
    range.addEventListener('input',()=>{calculationRequest++;view.budget=Number(range.value);$('plan-budget-value').textContent=usd(view.budget);clearTimeout(timer);timer=setTimeout(async()=>{if(!current())return;const applied=await rerun();if(applied===null||!current())return;$('plan-budget-range').focus();},350);});
    result.querySelectorAll('[data-budget]').forEach(button=>button.addEventListener('click',async()=>{view.budget=Number(button.dataset.budget);const applied=await rerun();if(applied===null||!current())return;say(`Budget set to ${usd(view.budget)}. ${view.current.memo.slate.feasible?`The bill is ${billNames(view.current).join(' and ')}.`:'No bill fits.'}`);}));
    result.querySelectorAll('[data-drop]').forEach(button=>button.addEventListener('click',async()=>{view.cancelId=button.dataset.drop;const name=nameOf(view.base,view.cancelId);const applied=await rerun();if(applied===null||!current())return;say(`${name} dropped. ${view.current.memo.slate.feasible?`The best replacement bill is ${billNames(view.current).join(' and ')}.`:'No bill fits without them.'}`);}));
    $('plan-reset').addEventListener('click',async()=>{view.budget=view.base.memo.constraints.budget;view.cancelId=null;view.qlooOff=false;const applied=await rerun();if(applied===null||!current())return;say('Changes reset to the original plan.');$('plan-switch').focus();});
    $('reach-run')?.addEventListener('click',()=>void requestReach());
    result.querySelectorAll('[data-receipt]').forEach(button=>button.addEventListener('click',()=>openReceipt(button.dataset.receipt,button.dataset.entity,button)));
    // Summary and insight links open the card they point to (folded on phones) and move focus there.
    result.querySelectorAll('[data-jump]').forEach(link=>link.addEventListener('click',event=>{
      const target=document.getElementById(link.dataset.jump);if(!target)return;event.preventDefault();
      const card=target.closest('.solid-card');if(card?.classList.contains('is-collapsed')){card.classList.remove('is-collapsed');card.querySelector('.solid-more')?.setAttribute('aria-expanded','true');const more=card.querySelector('.solid-more');if(more)more.textContent='Hide details';}
      target.setAttribute('tabindex','-1');target.scrollIntoView({block:'start',behavior:reduced()?'instant':'smooth'});target.focus({preventScroll:true});
    }));
    result.querySelectorAll('.solid-more').forEach(button=>button.addEventListener('click',()=>{const card=button.closest('.solid-card'),open=card.classList.toggle('is-collapsed')===false;button.setAttribute('aria-expanded',String(open));button.textContent=open?'Hide details':'Show details';}));
    $('plan-share')?.addEventListener('click',async()=>{const link=location.href;try{await navigator.clipboard.writeText(link);say('Link copied.');}catch{say(`Copy this link: ${link}`);}});
  }

  // ── Receipts ───────────────────────────────────────────────────────────────────
  const REACH_TITLES={brand:'Brands fans of this bill favour',place:'Places fans of this bill go',podcast:'Podcasts fans of this bill listen to'};
  const reachType=receipt=>receipt.tool==='recommend'&&REACH_TITLES[receipt.args?.target_type]?receipt.args.target_type:null;
  const describeReceipt=(receipt,snapshot)=>{
    const city=snapshot.memo.input.city,anchors=anchorText(snapshot);
    if(reachType(receipt))return `${REACH_TITLES[reachType(receipt)]}${receipt.args.filter_location?` in ${receipt.args.filter_location}`:''}`;
    return ({describe:'Qloo confirmed the artist’s identity',recommend:`Artists Qloo links to ${anchors} fans in ${city}`,rank:`Qloo’s ranking of every candidate for ${anchors} fans in ${city}`,
      where_popular:`Where the fans are within ${city}`,compare_audiences:`How the audience overlaps with ${anchors}’s`,trends:'Six-month popularity trend',entity_tags:'Taste tags for the anchor artist'})[receipt.tool]??`Qloo ${receipt.tool} call`;
  };
  function openReceipt(id,entity,opener){
    const snapshot=view.base,receipt=snapshot.receipts.find(r=>r.id===id)??view.record.reach?.receipts.find(r=>r.id===id),drawer=$('receipt-drawer');if(!receipt)return;
    const same=(a,b)=>String(a??'').toLowerCase()===String(b??'').toLowerCase();
    const rows=receipt.evidence?.rows??[];
    $('receipt-title').textContent=describeReceipt(receipt,snapshot);
    const top=Math.max(0,...rows.map(r=>r.affinity??0))||1,chip=(label,value)=>`<span class="receipt-chip"><small>${e(label)}</small><code>${e(value)}</code></span>`;
    $('receipt-body').innerHTML=`<p class="receipt-meta">${chip('Receipt',receipt.id)}${chip('Qloo tool',receipt.tool)}${chip('Status',receipt.status)}${receipt.fetchedAt?chip('Fetched',new Date(receipt.fetchedAt).toUTCString().replace(' GMT',' UTC')):''}${receipt.cached?chip('Source','cache'):''}</p>
      ${rows.some(r=>r.name)?`<div class="table-scroll"><table class="data-table receipt-table"><caption>What Qloo returned${entity?` (highlighted: ${e(entity)})`:''}</caption><thead><tr><th scope="col">${reachType(receipt)?'Name':'Artist'}</th><th scope="col">Qloo affinity</th><th scope="col">Popularity</th></tr></thead><tbody>${rows.filter(r=>r.name).map((r,index)=>`<tr style="--i:${index}"${same(r.name,entity)?' class="is-highlight"':''}><th scope="row">${e(r.name)}</th><td>${r.affinity==null?'—':`<span class="receipt-aff"><span class="receipt-bar" aria-hidden="true"><span style="--w:${(Math.max(0,r.affinity)/top*100).toFixed(1)}%"></span></span>${e(r.affinity.toFixed(4))}</span>`}</td><td>${r.popularity==null?'—':e(r.popularity.toFixed(3))}</td></tr>`).join('')}</tbody></table></div>`:'<p>This call returned no named rows in the public record.</p>'}
      <p class="receipt-note">${reachType(receipt)?'Affinity is Qloo’s measure of how strongly fans of the booked acts are drawn to each result. It is cultural fit, not a partnership, availability or audience size.':'Affinity is Qloo’s measure of how strongly this audience is drawn to an artist; it is cultural fit, not ticket demand.'} ${receipt.originalDigest?`Original record digest <code class="receipt-digest">${e(receipt.originalDigest)}</code>.`:''}</p>`;
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
  let replaying=null,replayStarted=false,watchReady=false,replayStatic=false;
  function startReplay({animate=!form.contains(document.activeElement)}={}){
    if(replayStarted||!view||view.record.id!==FEATURED||!window.HLTrace||$('plan-submit').disabled)return;
    replayStarted=true;replayStatic=!animate||reduced();
    replaying=window.HLTrace.replay(agent,view.base,{speed:2,animate,onReplay:()=>{replaying?.cancel();replayStarted=false;startReplay({animate:true});}});
  }
  // Once someone starts their own brief, keep the complete genuine saved record
  // inspectable without timed updates moving the adjacent controls.
  form.addEventListener('focusin',()=>{
    if(replayStatic||view?.record.id!==FEATURED||$('plan-submit').disabled)return;
    replaying?.cancel();replayStarted=false;startReplay({animate:false});
  });
  if('IntersectionObserver' in window){
    const watch=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){watch.disconnect();watchReady=true;startReplay();}},{rootMargin:'0px 0px -20% 0px'});
    watch.observe(agent);
  }
  // Up to three artists the audience loves. Extra rows are added and removed in place;
  // focus moves to the new field, or back to the add button after a removal.
  const MAX_ANCHORS=3,anchorMore=$('plan-anchor-more'),anchorAdd=$('plan-anchor-add');
  const anchorRows=()=>[...anchorMore.querySelectorAll('.plan-anchor-row')];
  function syncAnchors(){
    anchorRows().forEach((row,index)=>{const n=index+2,input=row.querySelector('input'),label=row.querySelector('label');
      input.id=`plan-anchor-${n}`;label.htmlFor=input.id;label.textContent=`Artist ${n} your audience loves`;row.querySelector('button').setAttribute('aria-label',`Remove artist ${n}`);});
    anchorAdd.hidden=anchorRows().length>=MAX_ANCHORS-1;
  }
  function addAnchor(value=''){
    if(anchorRows().length>=MAX_ANCHORS-1)return null;
    const row=document.createElement('div');row.className='plan-anchor-row';
    row.innerHTML='<label class="sr-only"></label><input name="anchor" autocomplete="off" maxlength="80" placeholder="Another artist"><button type="button" class="plan-anchor-remove"><span aria-hidden="true">×</span></button>';
    row.querySelector('input').value=value;
    row.querySelector('button').addEventListener('click',()=>{row.remove();syncAnchors();(anchorAdd.hidden?$('plan-anchor'):anchorAdd).focus();});
    anchorMore.append(row);syncAnchors();return row.querySelector('input');
  }
  anchorAdd.addEventListener('click',()=>addAnchor()?.focus());
  const anchorInputs=()=>[...form.querySelectorAll('input[name="anchor"]')];
  const listNames=names=>names.length<3?names.join(' and '):`${names.slice(0,-1).join(', ')} and ${names.at(-1)}`;
  function readInput(){
    const data=new FormData(form),anchors=[];
    for(const name of data.getAll('anchor').map(value=>String(value).trim()).filter(Boolean))if(!anchors.some(seen=>seen.toLowerCase()===name.toLowerCase()))anchors.push(name);
    const input={city:String(data.get('city')??'').trim(),anchors,budget:Number(String(data.get('budget')??'').replace(/[$,\s]/g,'')),slots:Number(data.get('slots'))};
    const fail=(field,message)=>{const error=$('plan-error');error.textContent=message;error.hidden=false;$(field).setAttribute('aria-invalid','true');$(field).focus();return null;};
    form.querySelectorAll('[aria-invalid]').forEach(node=>node.removeAttribute('aria-invalid'));$('plan-error').hidden=true;
    if(input.city.length<2)return fail('plan-city','Enter a city.');
    if(!input.anchors.length)return fail('plan-anchor','Enter an artist your audience loves.');
    if(!Number.isFinite(input.budget)||input.budget<1000||input.budget>500000)return fail('plan-budget','Artist budget must be between $1,000 and $500,000.');
    return input;
  }
  async function planLive(input){
    const submit=$('plan-submit'),status=$('progress-status');
    replaying?.cancel();replaying=null;replayStarted=true;
    submit.disabled=true;submit.textContent='Planning…';$('progress-choose').hidden=true;
    const fans=listNames(input.anchors);
    $('agent-caption').textContent=`Live run: ${input.city}, fans of ${fans}`;
    const trace=window.HLTrace.create(agent,{city:input.city,anchor:fans,label:`Researching ${input.city} with Qloo`});
    trace.stage('Resolve');
    if(matchMedia('(max-width: 900px)').matches)agent.scrollIntoView({block:'center',behavior:reduced()?'instant':'smooth'});
    status.textContent=`Researching a show in ${input.city} for fans of ${fans}.`;
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
          else if(event.type==='research'){const html=window.HLTrace.researchNote(event.checks);if(html)trace.note(html);}
          else if(event.type==='choose'){
            trace.fail(`Which “${event.name}” did you mean?`);
            const box=$('progress-choose');box.hidden=false;
            box.innerHTML=`<p>Qloo found more than one “${e(event.name)}”. Which one did you mean?</p><div class="plan-chips">${event.options.map(option=>`<button type="button" class="plan-chip" data-anchor-id="${e(option.id)}" data-anchor-name="${e(option.name)}">${e(option.name)}</button>`).join('')}</div>`;
            // The chosen entity replaces the ambiguous name, in the form and in the request.
            box.querySelectorAll('[data-anchor-id]').forEach(button=>button.addEventListener('click',()=>{
              const chosen=button.dataset.anchorName,asked=event.name.toLowerCase();
              const field=anchorInputs().find(node=>node.value.trim().toLowerCase()===asked);if(field)field.value=chosen;
              void planLive({...input,anchors:input.anchors.map(name=>name.toLowerCase()===asked?chosen:name),picks:{...input.picks,[chosen]:button.dataset.anchorId}});
            },{once:true}));
            status.textContent='Choose which artist you meant.';done=true;
          }
          else if(event.type==='error'){showError(event.text);done=true;}
          else if(event.type==='ready'){
            trace.done(`Planned with ${event.calls} Qloo calls`,'Every call is saved as a receipt you can open on the plan.');
            status.textContent='Your plan is ready.';autoReach=event.id;await openCase(event.id,{scroll:true});done=true;
          }
        }
      }
      if(!done)showError('The connection ended before a result was received. Research may still finish on the server. Try again, or open a saved plan.');
    }catch(problem){showError(problem?.name==='TimeoutError'?'The live plan took too long. Try again, or open a saved plan.':'The live plan was interrupted. Try again, or open a saved plan.');}
    finally{submit.disabled=false;submit.innerHTML='Plan my bill <span aria-hidden="true">→</span>';}
  }
  form.addEventListener('submit',event=>{event.preventDefault();const input=readInput();if(input)void planLive(input);});

  // Sections fade up as they enter; the tagline lights word by word along the reading line.
  if('IntersectionObserver' in window){
    document.documentElement.classList.add('has-reveal');
    const reveal=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-in');reveal.unobserve(entry.target);}},{rootMargin:'0px 0px -10% 0px'});
    document.querySelectorAll('.qa').forEach(node=>reveal.observe(node));
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
