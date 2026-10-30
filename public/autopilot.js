/* Houselights Autopilot panel on the Booking Desk. A recorded replay, a planning
   replay and a fresh organizer run are always labelled differently; a replay never claims new research. */
'use strict';
(()=>{
  const $=id=>document.getElementById(id),View=window.HouselightsAutopilotView,e=View.escape;
  let record=null,view=null,busy=false,editable=false,sequence=0;
  const recordedFile=fetch('/autopilot-recorded.json',{signal:AbortSignal.timeout(15000)}).then(r=>r.ok?r.json():null).catch(()=>null);
  fetch('/api/access',{signal:AbortSignal.timeout(15000)}).then(r=>r.json()).then(access=>{editable=access.editable===true;if(record)renderModes();}).catch(()=>{});
  const money=value=>value==null||!Number.isFinite(Number(value))?'—':window.HL.money(value,record?.snapshot.memo.currency??'USD');

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
    $('autopilot-modes').innerHTML=`${hasRecorded?`<button type="button" class="autopilot-mode" data-autopilot-mode="recorded" aria-pressed="${view?.kind==='recorded'}"><small>REPLAY</small>Recorded live run</button>`:''}<button type="button" class="autopilot-mode" data-autopilot-mode="planning" aria-pressed="${view?.kind==='planning'}"><small>NO PROVIDER CALLS</small>Plan from saved evidence</button><button type="button" class="autopilot-mode" data-autopilot-mode="fresh" aria-pressed="${view?.kind==='fresh'}"><small>LIVE QLOO · UP TO 10 CALLS</small>Run fresh research</button>`;
    $('autopilot-fresh-note').textContent=editable?'':'Fresh research makes up to 10 live Qloo calls. Public runs share a small hourly and daily allowance that protects the Qloo quota.';
  }
  function banner(){
    const run=view.run;
    if(view.kind==='recorded')return `<div class="autopilot-banner autopilot-banner-recorded"><strong>RECORDED PROVIDER-BACKED RUN</strong><span>Captured ${e(view.file.capturedAt.replace('T',' ').slice(0,19))} UTC with ${e(view.file.providerCalls)} live Qloo workflow calls. You are watching a replay of that record. This page made no new provider calls.</span></div>`;
    if(view.kind==='planning')return `<div class="autopilot-banner"><strong>PLANNING REPLAY · SAVED EVIDENCE ONLY</strong><span>0 provider calls. The agent ranks the research it would do next; nothing below was newly researched.${run.briefChanged?' Brief changed from the published case.':''}</span></div>`;
    return run.mode==='synthetic'?`<div class="autopilot-banner autopilot-banner-warning"><strong>SYNTHETIC QLOO DATA</strong><span>This server runs development fixtures. These results are not real cultural evidence. Saved as run ${e(view.saved?.id)}.</span></div>`
      :`<div class="autopilot-banner autopilot-banner-live"><strong>FRESH PROVIDER-BACKED RUN</strong><span>${e(view.saved?.providerCalls??run.budget.used)} live Qloo workflow calls just now. Saved as run ${e(view.saved?.id)}.</span></div>`;
  }
  function receiptLink(id){
    const index=record.snapshot.receipts.findIndex(row=>row.id===id);
    return index<0?`<span class="autopilot-receipt-ref">${e(id)}</span>`:`<button type="button" class="judge-receipt-link" data-receipt-index="${index}">Receipt ${e(id)}</button>`;
  }
  function render(){
    if(!view){$('autopilot-output').innerHTML='';return;}
    renderModes();
    $('autopilot-budget').value=String(view.run.constraints.budget);
    const links=view.kind==='recorded'?'<a class="button subtle" href="/api/autopilot/recorded/packet" target="_blank" rel="noopener">Open printable packet</a>':view.kind==='fresh'&&view.saved?`<a class="button subtle" href="/api/autopilot/runs/${e(view.saved.id)}/packet" target="_blank" rel="noopener">Open printable packet</a>`:'';
    const actionsHtml=`<button type="button" class="button primary" data-autopilot-download="md">Download packet (.md)</button><button type="button" class="button subtle" data-autopilot-download="json">Download full run (JSON)</button>${links}`;
    const packetLabel=view.kind==='recorded'?'RECORDED RUN':view.kind==='planning'?'PLANNING REPLAY':view.run.mode==='synthetic'?'SYNTHETIC RUN':'FRESH RUN';
    $('autopilot-output').innerHTML=banner()+View.render(view.run,{kind:view.kind,money,receiptLink,actionsHtml,packetLabel,scope:'autopilot'});
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
    if(format==='md')View.download(`${base}.md`,header+run.packet.markdown,'text/markdown;charset=utf-8');
    else View.download(`${base}.json`,JSON.stringify(view.kind==='recorded'?view.file:run,null,2),'application/json');
  }
  document.addEventListener('click',event=>{
    const mode=event.target.closest('[data-autopilot-mode]');
    if(mode){const budget=Number($('autopilot-budget').value);void show(mode.dataset.autopilotMode,{budget:mode.dataset.autopilotMode==='recorded'||!Number.isFinite(budget)||budget===record?.snapshot.memo.constraints.budget?null:budget});return;}
    const receipt=event.target.closest('[data-autopilot-receipt]');
    if(receipt&&receipt.dataset.autopilotScope==='autopilot'){View.openReceipt(receipt);return;}
    const exportButton=event.target.closest('[data-autopilot-download]');
    if(exportButton)download(exportButton.dataset.autopilotDownload);
  });
  $('autopilot-replan').addEventListener('click',()=>{const raw=String($('autopilot-budget').value).trim().replace(/[$,\s]/g,''),entered=Number(raw);if(!raw||!Number.isFinite(entered)){status('Enter an artist budget in US dollars, for example 12000.');$('autopilot-budget').focus();return;}const budget=Math.min(10000000,Math.max(0,Math.round(entered)));if(budget!==entered){$('autopilot-budget').value=String(budget);status(`Budget adjusted to $${budget.toLocaleString('en-US')}: the allowed range is $0 to $10,000,000.`);}void show('planning',{budget});});
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
