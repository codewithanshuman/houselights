'use strict';
(() => {
  const e=escapeHTML, pendingKey='houselights-pending-research';
  let current=null, cursor=0, entries=[], watching=null, submitting=false;
  $('gm-operation').insertAdjacentHTML('afterend',`<section class="panel"><h3>Persistent research history</h3><p>Closing this page leaves research running on the server. Reconnect to inspect progress and receipts. Interrupted provider calls are never automatically repeated.</p><button type="button" class="button subtle" id="research-history">Refresh run history</button> <button type="button" class="button subtle" id="research-reconnect">Reconnect last request</button> <button type="button" class="button subtle" id="research-proof">Build proof from saved evidence</button><div id="research-list"></div><p id="research-status" role="status" aria-live="polite"></p><button type="button" class="button subtle" id="research-stop" hidden>Request cancellation</button> <button type="button" class="button subtle" id="research-export" hidden>Export recorded events</button><details><summary>Inspect recorded progress</summary><ol id="research-events"></ol></details></section>`);
  const say=message=>$('research-status').textContent=message;
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
