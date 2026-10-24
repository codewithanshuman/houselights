/* Houselights Autopilot panel. A recorded replay, a planning replay and a fresh
   organizer run are always labelled differently; a replay never claims new research. */
'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  let record=null,view=null,busy=false,editable=false,sequence=0;
  const recordedFile=fetch('/autopilot-recorded.json',{signal:AbortSignal.timeout(15000)}).then(r=>r.ok?r.json():null).catch(()=>null);
  fetch('/api/access',{signal:AbortSignal.timeout(15000)}).then(r=>r.json()).then(access=>{editable=access.editable===true;if(record)renderModes();}).catch(()=>{});
  const money=value=>value==null||!Number.isFinite(value)?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:record?.snapshot.memo.currency??'USD',maximumFractionDigits:0}).format(value);
  const nameOf=id=>view?.run.items?.find(item=>item.id===id)?.name??record?.snapshot.memo.items.find(item=>item.id===id)?.name??id;
  const names=ids=>ids?.length?ids.map(nameOf).join(' + '):'No feasible lineup';
  const tierLabel={ranking:'Ranking',material:'Decision-material',robustness:'Robustness check',justification:'Booking justification',fallback:'Fallback evidence',immaterial:'Not worth a call',blocked:'Blocked',done:'Answered'};
  const stopLabel={sufficient:'Evidence sufficient',exhausted:'All relevant questions attempted',budget_exhausted:'Research budget spent',round_limit:'Round limit',provider_unavailable:'Provider unavailable',planning_only:'Planning only — no calls',not_needed:'No follow-up needed'};

  async function post(path,body){
    const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
    const value=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(value.error??'Autopilot could not complete.');
    return value;
  }
  function status(text){$('autopilot-status').textContent=text;}
  function setBusy(state){busy=state;$('booking-autopilot').setAttribute('aria-busy',String(state));document.querySelectorAll('[data-autopilot-mode],#autopilot-replan,#autopilot-budget').forEach(control=>control.disabled=state);}

  function renderModes(){
    const hasRecorded=view?.recordedAvailable;
    $('autopilot-modes').innerHTML=`${hasRecorded?`<button type="button" class="autopilot-mode" data-autopilot-mode="recorded" aria-pressed="${view?.kind==='recorded'}"><small>REPLAY</small>Recorded live run</button>`:''}<button type="button" class="autopilot-mode" data-autopilot-mode="planning" aria-pressed="${view?.kind==='planning'}"><small>NO PROVIDER CALLS</small>Plan from saved evidence</button>${editable?`<button type="button" class="autopilot-mode" data-autopilot-mode="fresh" aria-pressed="${view?.kind==='fresh'}"><small>ORGANIZER · USES QLOO QUOTA</small>Run fresh research</button>`:''}`;
    $('autopilot-fresh-note').textContent=editable?'':'Fresh provider-backed runs are organizer-only. This public page shows the recorded run or plans from saved evidence.';
  }
  function banner(){
    const run=view.run;
    if(view.kind==='recorded')return `<div class="autopilot-banner autopilot-banner-recorded"><strong>RECORDED PROVIDER-BACKED RUN</strong><span>Captured ${e(view.file.capturedAt.replace('T',' ').slice(0,19))} UTC with ${e(view.file.providerCalls)} live Qloo workflow calls. You are watching a replay of that record. This page made no new provider calls.</span></div>`;
    if(view.kind==='planning')return `<div class="autopilot-banner"><strong>PLANNING REPLAY · SAVED EVIDENCE ONLY</strong><span>0 provider calls. The agent ranks the research it would do next; nothing below was newly researched.${run.briefChanged?' Brief changed from the published case.':''}</span></div>`;
    return run.mode==='synthetic'?`<div class="autopilot-banner autopilot-banner-warning"><strong>SYNTHETIC QLOO DATA</strong><span>This server runs development fixtures. These results are not real cultural evidence. Saved as run ${e(view.saved?.id)}.</span></div>`
      :`<div class="autopilot-banner autopilot-banner-live"><strong>FRESH PROVIDER-BACKED RUN</strong><span>${e(view.saved?.providerCalls??run.budget.used)} live Qloo workflow calls just now. Saved as run ${e(view.saved?.id)}.</span></div>`;
  }
  function pipeline(){
    const run=view.run,actions=run.events.filter(row=>row.type==='action').length,critical=run.stress.vulnerabilities.filter(row=>row.severity==='critical').length;
    const stages=[['Brief',`${run.items.length} artists · ${money(run.constraints.budget)}`],['Research',view.kind==='planning'?`${run.questions.filter(row=>['ranking','material','robustness','justification','fallback'].includes(row.tier)).length} queued`:`${actions} actions · ${run.budget.used}/${run.budget.maxCalls} calls`],
      ['Strategies',run.strategies.status==='feasible'?`${run.strategies.list.length} feasible`:'None feasible'],['Stress test',`${run.stress.resilience?.totalScenarios??0} scenarios · ${critical} critical`],['Decision packet',`${run.packet.nextSteps.length} next steps`]];
    return `<ol class="autopilot-pipeline">${stages.map(([label,detail],index)=>`<li><span>${String(index+1).padStart(2,'0')}</span><strong>${e(label)}</strong><small>${e(detail)}</small></li>`).join('')}</ol>`;
  }
  function receiptDetail(id){
    const receipt=view.run.receipts.find(row=>row.id===id);if(!receipt)return '';
    return `<details class="autopilot-receipt" id="autopilot-receipt-${e(id)}"><summary>Receipt ${e(id)} · ${e(receipt.tool)} · ${e(receipt.status)}${receipt.cached?' · cached':''}</summary><pre>${e(JSON.stringify(receipt,null,2))}</pre></details>`;
  }
  function timeline(){
    const run=view.run,events=run.events,rows=[],timed=view.kind!=='planning';
    const stamp=event=>timed?`<small class="autopilot-time">+${e((event.at/1000).toFixed(1))}s</small>`:'';
    for(let index=0;index<events.length;index++){
      const event=events[index];
      if(event.type==='frame')rows.push(`<li class="autopilot-event"><span class="autopilot-chip">Brief</span><p>${e(event.text)}</p>${stamp(event)}</li>`);
      else if(event.type==='questions')rows.push(`<li class="autopilot-event"><span class="autopilot-chip">Gaps found</span><p>${e(event.text)}</p>${stamp(event)}</li>`);
      else if(event.type==='action'){
        const observation=events.slice(index+1).find(row=>row.type==='observation'&&row.round===event.round),after=events.slice(index+1).find(row=>row.type==='reevaluate'&&row.round===event.round);
        rows.push(`<li class="autopilot-event autopilot-action ${after?.changed?'autopilot-changed':''}"><span class="autopilot-chip autopilot-tier-${e(event.tier)}">${e(tierLabel[event.tier]??event.tier)}</span><div><strong>${e(event.text)}</strong><p class="autopilot-why">Why: ${e(event.why)}</p>${observation?`<p class="autopilot-observed"><span>${e(event.tool)}</span> ${e(observation.text)}</p>${receiptDetail(observation.receiptId)}`:''}${after?`<p class="autopilot-after">${e(after.text)}</p>`:''}</div>${stamp(event)}</li>`);
      }else if(event.type==='stop')rows.push(`<li class="autopilot-event autopilot-stop"><span class="autopilot-chip">${e(stopLabel[event.reason]??event.reason)}</span><p>${e(event.text)}</p>${stamp(event)}</li>`);
      else if(['strategies','stress','followup','packet'].includes(event.type)||(event.type==='reevaluate'&&event.round==null))rows.push(`<li class="autopilot-event"><span class="autopilot-chip">${e({strategies:'Strategies',stress:'Stress test',followup:'Stress follow-up',packet:'Packet',reevaluate:'Re-evaluated'}[event.type])}</span><p>${e(event.text)}</p>${stamp(event)}</li>`);
    }
    const queued=view.kind==='planning'?run.questions.filter(row=>['ranking','material','robustness','justification','fallback'].includes(row.tier)):[];
    const skipped=run.questions.filter(row=>['immaterial','blocked'].includes(row.tier));
    return `<ol class="autopilot-timeline">${rows.join('')}</ol>${queued.length?`<div class="autopilot-queue"><h4>Research the agent would run next</h4><ol>${queued.slice(0,8).map(row=>`<li><span class="autopilot-chip autopilot-tier-${e(row.tier)}">${e(tierLabel[row.tier])}</span><strong>${e(row.question)}</strong><p>${e(row.why)}</p></li>`).join('')}</ol></div>`:''}${skipped.length?`<details class="autopilot-skipped"><summary>Questions the agent chose not to research (${skipped.length})</summary><ul>${skipped.map(row=>`<li><strong>${e(row.question)}</strong> <span class="autopilot-chip autopilot-tier-${e(row.tier)}">${e(tierLabel[row.tier])}</span><p>${e(row.why)}</p></li>`).join('')}</ul></details>`:''}`;
  }
  function strategies(){
    const run=view.run,list=run.strategies.list;
    if(run.strategies.status!=='feasible')return `<div class="autopilot-infeasible"><strong>No feasible strategy.</strong><p>${e((run.strategies.reasons??[]).join(' '))}</p></div>`;
    return `<div class="autopilot-strategies">${list.map((row,index)=>`<article class="${index===0?'autopilot-recommended':''}"><small>${index===0?'RECOMMENDED · ':''}${e(row.label.toUpperCase())}</small><h4>${e(names(row.selectedIds))}</h4><dl><div><dt>Artist fees</dt><dd>${e(money(row.totalFee))}</dd></div><div><dt>${index?'vs recommended':'Unallocated'}</dt><dd>${e(index?`${row.feeDelta>=0?'+':'−'}${money(Math.abs(row.feeDelta))} · −${row.scoreGap} pts`:money(row.headroom))}</dd></div><div><dt>Cancellations covered</dt><dd>${e(row.cancellationCoverage.covered)}/${e(row.cancellationCoverage.total)}</dd></div><div><dt>Stress survived unchanged</dt><dd>${row.stressSurvival?`${e(row.stressSurvival.survived)}/${e(row.stressSurvival.total)}`:'—'}</dd></div></dl><p>${e(row.rationale)}</p><span class="autopilot-evidence">${row.evidence.map(member=>`${e(member.name)}: ${e(member.kinds.join(', ')||'no evidence')}`).join(' · ')}</span></article>`).join('')}</div>${run.strategies.robustNote?`<p class="autopilot-note">${e(run.strategies.robustNote)}</p>`:''}<p class="autopilot-note">Policy points are the optimizer's declared objective, not ticket demand. Fees are illustrative booking inputs.</p>`;
  }
  function stress(){
    const run=view.run,rows=run.stress.vulnerabilities,breaks=run.stress.breakpoints??[];
    return `<p class="autopilot-summary">${e(run.stress.summary)}</p><ul class="autopilot-vulnerabilities">${rows.map(row=>`<li class="autopilot-severity-${e(row.severity)}"><span>${e(row.severity)}</span><p>${e(row.text)}</p></li>`).join('')||'<li><p>No vulnerability changed the recommendation.</p></li>'}</ul>${breaks.length?`<h4>Break points</h4><ul class="autopilot-breakpoints">${breaks.map(row=>`<li>${e(row.text)}</li>`).join('')}</ul>`:''}`;
  }
  function packet(){
    const run=view.run,p=run.packet,rec=p.recommendation;
    const links=view.kind==='recorded'?`<a class="button subtle" href="/api/autopilot/recorded/packet">Open printable packet</a>`:view.kind==='fresh'&&view.saved?`<a class="button subtle" href="/api/autopilot/runs/${e(view.saved.id)}/packet">Open printable packet</a>`:'';
    return `<div class="autopilot-packet-head"><div><small>DECISION PACKET · ${e(view.kind==='recorded'?'RECORDED RUN':view.kind==='planning'?'PLANNING REPLAY':run.mode==='synthetic'?'SYNTHETIC RUN':'FRESH RUN')}</small><h4>${rec?e(rec.names.join(' + ')):'No feasible booking'}</h4><p>${rec?`${e(money(rec.totalFee))} planned fees · ${e(money(rec.headroom))} unallocated · ${e(rec.policyScore)} policy points`:e(p.infeasibility?.reasons?.join(' '))}</p></div><div class="autopilot-packet-actions"><button type="button" class="button primary" data-autopilot-download="md">Download packet (.md)</button><button type="button" class="button subtle" data-autopilot-download="json">Download full run (JSON)</button>${links}</div></div>
      <p class="autopilot-verdict"><strong>Did research change the decision?</strong> ${e(p.research.verdict)}</p>
      ${rec?`<div class="autopilot-justification">${rec.artists.map(artist=>`<article><strong>${e(artist.name)}</strong><small>${e(money(artist.fee))}${artist.genre?` · ${e(artist.genre)}`:''}</small><ul>${artist.claims.map(claim=>`<li>${e(claim.text)} ${claim.receipts.map(receipt=>receipt.new?`<button type="button" class="judge-receipt-link" data-autopilot-receipt="${e(receipt.id)}">Receipt ${e(receipt.id)}</button>`:receiptButton(receipt.id)).join(' ')}</li>`).join('')}</ul></article>`).join('')}</div>`:''}
      <h4>Next steps</h4><ol class="autopilot-steps">${p.nextSteps.map(step=>`<li>${e(step)}</li>`).join('')}</ol>
      <details><summary>Evidence gaps (${p.evidenceGaps.length})</summary><ul class="autopilot-gaps">${p.evidenceGaps.map(row=>`<li><strong>${e(row.question)}</strong> <em>${e(row.status)}</em><p>${e(row.why)}</p></li>`).join('')}</ul></details>
      <details><summary>Assumptions and limits</summary><ul>${p.assumptions.map(row=>`<li>${e(row)}</li>`).join('')}</ul><p>${e(p.limits)}</p></details>`;
  }
  function receiptButton(id){
    const index=record.snapshot.receipts.findIndex(row=>row.id===id);
    return index<0?`<span class="autopilot-receipt-ref">${e(id)}</span>`:`<button type="button" class="judge-receipt-link" data-receipt-index="${index}">Receipt ${e(id)}</button>`;
  }
  function render(){
    if(!view){$('autopilot-output').innerHTML='';return;}
    renderModes();
    const run=view.run;
    $('autopilot-budget').value=String(run.constraints.budget);
    $('autopilot-output').innerHTML=`${banner()}${pipeline()}<div class="autopilot-grid"><section aria-labelledby="autopilot-trace-title"><h3 id="autopilot-trace-title">How the agent investigated</h3>${timeline()}</section><section aria-labelledby="autopilot-strategy-title"><h3 id="autopilot-strategy-title">Feasible strategies</h3>${strategies()}<h3>Stress test</h3>${stress()}</section></div><section class="autopilot-packet" aria-label="Decision packet">${packet()}</section>`;
  }
  async function show(kind,options={}){
    if(!record||busy)return;
    const id=record.id,mine=++sequence;
    if(kind==='recorded'){
      const file=await recordedFile;
      if(mine!==sequence||record?.id!==id)return;
      if(!file||file.caseId!==id){status('No recorded Autopilot run exists for this case.');return;}
      view={kind,run:file.run,file,recordedAvailable:true};render();status(`Showing the recorded run from ${file.capturedAt.slice(0,10)}. No new provider calls.`);return;
    }
    setBusy(true);status(kind==='fresh'?'Researching with live Qloo… this can take up to a minute.':'Planning from saved evidence…');
    try{
      const recordedAvailable=(await recordedFile)?.caseId===id;
      const budget=options.budget;
      if(kind==='planning'){
        const run=await post(`/api/judge/cases/${id}/autopilot`,budget==null?{}:{budget});
        if(mine!==sequence||record?.id!==id)return;
        view={kind,run,recordedAvailable};render();status(`Plan ready. ${run.providerCalls} provider calls; ${run.questions.filter(row=>['ranking','material','robustness','justification','fallback'].includes(row.tier)).length} research questions queued, not executed.`);
      }else{
        const saved=await post(`/api/judge/cases/${id}/autopilot/live`,{maxCalls:10,...(budget==null?{}:{budget})});
        if(mine!==sequence||record?.id!==id)return;
        view={kind,run:saved,saved,recordedAvailable};render();status(saved.mode==='synthetic'?`Synthetic run complete: ${saved.researchCalls} fixture calls, no provider contacted. Not real evidence.`:`Fresh run complete: ${saved.providerCalls} live Qloo workflow calls.`);
      }
    }catch(error){if(mine===sequence)status(`${error.message} ${view?'The previous Autopilot result is still displayed.':''}`);}
    finally{if(mine===sequence)setBusy(false);}
  }
  function download(format){
    if(!view)return;
    const run=view.run,base=`houselights-autopilot-${record.id}-${view.kind}`;
    const header=view.kind==='recorded'?`> Recorded provider-backed run captured ${view.file.capturedAt}. Replayed without new provider calls.\n\n`:view.kind==='planning'?'> Planning replay from saved evidence. No provider calls; listed research was not executed.\n\n':'';
    const [body,type,extension]=format==='md'?[header+run.packet.markdown,'text/markdown;charset=utf-8','md']:[JSON.stringify(view.kind==='recorded'?view.file:run,null,2),'application/json','json'];
    const url=URL.createObjectURL(new Blob([body],{type})),link=document.createElement('a');link.href=url;link.download=`${base}.${extension}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  document.addEventListener('click',event=>{
    const mode=event.target.closest('[data-autopilot-mode]');
    if(mode){const budget=Number($('autopilot-budget').value);void show(mode.dataset.autopilotMode,{budget:mode.dataset.autopilotMode==='recorded'||!Number.isFinite(budget)||budget===record?.snapshot.memo.constraints.budget?null:budget});return;}
    const receipt=event.target.closest('[data-autopilot-receipt]');
    if(receipt){const detail=$('autopilot-receipt-'+receipt.dataset.autopilotReceipt);if(detail){detail.open=true;detail.scrollIntoView({block:'center',behavior:reduced()?'instant':'smooth'});detail.querySelector('summary')?.focus({preventScroll:true});}return;}
    const exportButton=event.target.closest('[data-autopilot-download]');
    if(exportButton)download(exportButton.dataset.autopilotDownload);
  });
  $('autopilot-replan').addEventListener('click',()=>{const budget=Number($('autopilot-budget').value);if(!Number.isFinite(budget)||budget<0){status('Enter a non-negative budget.');return;}void show('planning',{budget});});
  document.addEventListener('booking:state',event=>{
    const next=event.detail.current;
    if(!next){record=null;view=null;++sequence;return;}
    if(record?.id===next.id)return;
    record=next;view=null;++sequence;busy=false;setBusy(false);
    $('autopilot-output').innerHTML='<p class="autopilot-loading">Preparing the Autopilot decision…</p>';
    $('autopilot-budget').value=String(next.snapshot.memo.constraints.budget);
    recordedFile.then(file=>{if(record?.id!==next.id)return;void show(file?.caseId===next.id?'recorded':'planning');});
  });
  document.dispatchEvent(new Event('booking:ready'));
})();
