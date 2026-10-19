'use strict';
(() => {
  const e=escapeHTML, pendingKey='houselights-pending-research';
  let current=null, cursor=0, entries=[], watching=null, submitting=false;
  $('gm-operation').insertAdjacentHTML('afterend',`<section class="panel"><h3>Persistent research history</h3><p>Closing this page leaves research running on the server. Reconnect to inspect progress and receipts. Interrupted provider calls are never automatically repeated.</p><button type="button" class="button subtle" id="research-history">Refresh run history</button> <button type="button" class="button subtle" id="research-reconnect">Reconnect last request</button> <button type="button" class="button subtle" id="research-proof">Build proof from saved evidence</button><div id="research-list"></div><p id="research-status" role="status" aria-live="polite"></p><button type="button" class="button subtle" id="research-stop" hidden>Request cancellation</button> <button type="button" class="button subtle" id="research-export" hidden>Export recorded events</button><details><summary>Inspect recorded progress</summary><ol id="research-events"></ol></details></section>`);
  const say=message=>$('research-status').textContent=message;
  $('research-list').insertAdjacentHTML('beforebegin',`<details><summary>Model-directed investigator</summary><p>The model can inspect receipts, challenge the proof, test hypothetical budgets and query the saved candidate pool. It cannot approve, book or send. Configure a model key on the server first.</p><label>Investigation question<textarea id="investigator-question" maxlength="2000">Challenge the selected lineup, investigate its weakest evidence, and test a feasible alternative.</textarea></label><label>Maximum new Qloo queries<input id="investigator-queries" type="number" min="0" max="4" value="3"></label><button type="button" class="button subtle" id="investigator-start">Start bounded investigation</button><button type="button" class="button subtle" id="investigator-report">Inspect saved investigation</button><div id="investigator-output"></div></details>`);
  $('investigator-start').onclick=()=>{
    if(!state.savedId||state.busy||state.dirty||state.briefDirty||state.memo?.modifiedLocally){say('Save pending changes before investigating.');return;}
    launch('investigation',{question:$('investigator-question').value,maxQueries:Number($('investigator-queries').value)}).catch(error=>say(error.message));
  };
  $('investigator-report').onclick=async()=>{try{
    const sourceId=state.savedId,saved=await request(`/api/memo/${encodeURIComponent(sourceId)}`);
    if(state.savedId!==sourceId)return;
    const report=saved.investigation;
    if(!report){$('investigator-output').textContent='No investigation saved on this decision yet. Open the completed investigation result first.';return;}
    const names=ids=>ids.map(id=>saved.memo.items.find(i=>i.id===id)?.name??id).join(' + ');
    const facts=report.observations.filter(o=>o.status==='ok'&&['test_scenario','market_rank','inspect_receipt'].includes(o.tool)).map(o=>`<li>${e(o.id)}: ${o.tool==='test_scenario'?e(`${o.result.feasible?'Feasible':'Infeasible'} tested scenario; ${names(o.result.selectedIds)}; fee ${saved.memo.currency} ${o.result.totalFee??'unknown'}; hypothetical budget ${o.result.constraints.budget}.`):o.tool==='market_rank'?e(`Fixed-pool ranking ${o.result.complete?'complete':'incomplete'}; receipt ${o.result.receiptId??'unavailable'}.`):e(`Inspected source receipt ${o.args.receiptId}.`)}<details><summary>Read this observation</summary><pre>${e(JSON.stringify(o.result,null,2))}</pre></details></li>`).join('');
    $('investigator-output').innerHTML=`<h4>Investigation: ${e(label(report.status))}</h4><p>${e(report.attempts.length)} model attempts · ${e(report.queries)} Qloo queries. Current booked-fee assumption: ${e(saved.memo.currency)} ${e(saved.memo.slate.totalFee)}; budget: ${e(saved.memo.currency)} ${e(saved.memo.constraints.budget)}.</p><h4>Server-executed results</h4><ul>${facts}</ul>${report.proposedScenario?`<p>Tested alternative: <strong>${e(names(report.proposedScenario.selectedIds))}</strong> · ${e(saved.memo.currency)} ${e(report.proposedScenario.totalFee)}. Hypothetical budget: ${e(report.proposedScenario.constraints.budget)}.</p><button class="button subtle" id="investigator-apply">Save proposed scenario for review</button>`:'<p>No final feasible alternative was selected. Partial observations remain inspectable.</p>'}<details><summary>${report.verification?.claimEntailment==='deterministic_fact_templates'?'Verified fact selections':'Model commentary — requires review'}</summary><p>${report.verification?.claimEntailment==='deterministic_fact_templates'?'The model selected these facts; their wording and amounts are rendered by the server from saved observations. Booking assumptions still require real-world confirmation.':'Legacy report: citations resolve to observations, but the wording is not automatically verified. Check statements against original receipts.'}</p><ul>${report.findings.map(f=>`<li>${e(f.text)} <small>Observations: ${e(f.observationIds.join(', '))}</small></li>`).join('')}</ul></details><details><summary>Inspect all observations and model receipts</summary><pre>${e(JSON.stringify(report,null,2))}</pre></details>`;
    if($('investigator-apply'))$('investigator-apply').onclick=async()=>{try{if(state.savedId!==saved.id)throw new Error('Saved decision changed. Reload the investigation report.');const result=await request(`/api/investigation/${saved.id}/apply`,{});if(!await loadSaved(result.id))throw new Error(`Scenario ${result.id} was saved but could not be loaded. Open its saved decision to retry.`);window.history.replaceState(null,'',`/m/${result.id}#room`);setView('room');say('Alternative saved with a new proof; planning approval is still required.');}catch(error){say(error.message);}};
  }catch(error){say(error.message);}};
  document.addEventListener('houselights:decision-loaded',()=>$('investigator-output').replaceChildren());
  async function request(path,body,key){
    const response=await fetch(path,{...(body?{method:'POST',headers:{'content-type':'application/json',...(key?{'idempotency-key':key}:{})},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Research request failed.');return result;
  }
  function render(){
    say(`${current.id} · ${current.status} · ${current.eventCount} recorded events · ${current.mode==='mock'?'synthetic demonstration':'saved/live evidence'}`);
    $('research-stop').hidden=current.terminal;
    $('research-stop').disabled=current.status==='cancel_requested';
    $('research-export').hidden=false;
    $('research-events').innerHTML=entries.slice(-100).map(row=>`<li><strong>${e(row.sequence)} · ${e(label(row.type))}</strong> — ${e(row.data.message??row.data.detail??row.data.receipt?.summary??row.data.why??row.data.tool??'')} ${row.data.receipt?e('Receipt '+row.data.receipt.id+' · '+row.data.receipt.status):''}</li>`).join('');
    if(current.resultId){
      $('research-status').insertAdjacentHTML('beforeend',` · <a href="/m/${e(current.resultId)}#room">Open saved decision and proof</a>`);
    }
  }
  async function watch(id){
    const ticket={id};watching=ticket;cursor=0;entries=[];
    while(watching===ticket){
      const page=await request(`/api/research-runs/${encodeURIComponent(id)}/events?after=${cursor}`);
      if(watching!==ticket)throw new Error('Observation switched to another run. Server research continues.');
      current=page.run;entries.push(...page.events);cursor=page.nextCursor;render();
      if(page.hasMore)continue;
      if(current.terminal){
        try{const pending=JSON.parse(sessionStorage.getItem(pendingKey));if(pending?.id===id)sessionStorage.removeItem(pendingKey);}catch{}
        if(current.status!=='completed')throw new Error(`Research ${current.status}. Recorded events remain available. No successful result was substituted.`);
        return {id:current.resultId};
      }
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
    throw new Error('Observation stopped; server research continues.');
  }
  async function launch(kind,options={},reconnect=false){
    if(submitting)throw new Error('A research request is already being submitted.');
    let pending;
    if(reconnect){pending=JSON.parse(sessionStorage.getItem(pendingKey)||'null');if(!pending)throw new Error('No pending request in this tab. Refresh run history to find saved runs.');}
    else{pending={key:crypto.randomUUID(),body:{sourceId:state.savedId,kind,options}};sessionStorage.setItem(pendingKey,JSON.stringify(pending));}
    say('Submitting a durable research request…');
    submitting=true;
    let result;
    try{result=await request('/api/research-runs',pending.body,pending.key);}finally{submitting=false;}
    pending.id=result.run.id;sessionStorage.setItem(pendingKey,JSON.stringify(pending));
    return watch(result.run.id);
  }
  async function history(){
    try{const {runs}=await request('/api/research-runs');
      $('research-list').innerHTML=runs.map(run=>`<p>${e(label(run.kind))} · ${e(run.status)} · ${e(run.createdAt)} <button type="button" class="button subtle" data-research-watch="${e(run.id)}">Inspect ${e(run.id.slice(0,8))}</button>${run.resultId?` <a href="/m/${e(run.resultId)}#room">Saved result</a>`:''}</p>`).join('')||'<p>No research runs recorded yet.</p>';
      document.querySelectorAll('[data-research-watch]').forEach(button=>button.onclick=()=>watch(button.dataset.researchWatch).catch(error=>say(error.message)));
    }catch(error){say(error.message);}
  }
  $('research-history').onclick=history;
  $('research-reconnect').onclick=()=>launch(null,{},true).catch(error=>say(error.message));
  $('research-proof').onclick=()=>{
    if(!state.savedId||state.busy||state.dirty||state.briefDirty||state.memo?.modifiedLocally){say('Load a saved decision and save pending changes before building a proof.');return;}
    if(current&&!current.terminal){say('Inspect or cancel the current research run first.');return;}
    launch('proof').catch(error=>say(error.message));
  };
  $('research-stop').onclick=async()=>{try{current=await request(`/api/research-runs/${current.id}/cancel`,{expectedRevision:current.revision});render();}catch(error){say(error.message);}};
  $('research-export').onclick=async()=>{
    try{
      const id=current.id,events=[];let after=0,run;
      do{const page=await request(`/api/research-runs/${id}/events?after=${after}`);run=page.run;events.push(...page.events);after=page.nextCursor;if(!page.hasMore)break;}while(true);
      const url=URL.createObjectURL(new Blob([JSON.stringify({run,events},null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=`research-${id}.json`;link.click();URL.revokeObjectURL(url);
    }catch(error){say(error.message);}
  };
  window.houselightsResearch={launch,history};
})();
