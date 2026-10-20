'use strict';
(() => {
  const $=id=>document.getElementById(id),e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let current=null,result=null,busy=false,loadSequence=0;
  const say=message=>$('judge-status').textContent=message;
  async function request(path,body){const response=await fetch(path,{...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const value=await response.json();if(!response.ok)throw new Error(value.error??'Request failed.');return value;}
  const names=ids=>ids.map(id=>current.snapshot.memo.items.find(i=>i.id===id)?.name??id).join(' + ')||'No feasible lineup';
  const money=value=>value==null?'Unknown':new Intl.NumberFormat('en-GB',{style:'currency',currency:current.snapshot.memo.currency}).format(value);
  function renderResult(){
    const {snapshot,proof,comparison}=result,slate=snapshot.memo.slate;
    $('judge-result').innerHTML=`<h3>${e(names(slate.selectedIds))}</h3><p>${e(slate.status)} · ${e(money(slate.totalFee))} planned fees · ${e(money(snapshot.memo.constraints.budget))} budget</p>${comparison?`<p>${comparison.changed?'The selected lineup changed.':'The selected lineup did not change.'} ${comparison.feeDelta==null?'':`Fee difference: ${e(money(comparison.feeDelta))}.`} ${comparison.survivorIds.length?`Survivors ${comparison.survivorsPreserved===null?'cannot all be accommodated':comparison.survivorsPreserved?'preserved':'not preserved'}.`:''}</p><p>${e(comparison.interpretation)}</p>`:''}<p><strong>Evidence state: ${e(proof.status)}.</strong> Computational feasibility is separate from commercial approval.</p>${!slate.feasible?`<ul>${slate.reasons.map(reason=>`<li>${e(reason)}</li>`).join('')}</ul>`:''}<p>Constraint-only alternative: ${e(names(proof.constraintOnly.selectedIds??[]))} · ${e(money(proof.constraintOnly.totalFee))}. This alternative minimizes cost without using cultural scores.</p><ul>${proof.findings.map(f=>`<li><strong>${e(f.severity)}:</strong> ${e(f.assumption)} ${e(f.correction)}</li>`).join('')}</ul><details><summary>Inspect exact search, rejected candidates, evidence tests and recovery</summary><pre>${e(JSON.stringify(proof,null,2))}</pre></details>`;
  }
  function reset(){
    if(!current)return;
    const {memo}=current.snapshot;
    $('judge-budget').value=memo.constraints.budget;$('judge-cancel').value='';$('judge-withdraw').value='';
    document.querySelectorAll('[data-judge-lock]').forEach(input=>input.checked=memo.constraints.lockedIds.includes(input.dataset.judgeLock));
    document.querySelectorAll('[data-judge-exclude]').forEach(input=>input.checked=memo.constraints.excludedIds.includes(input.dataset.judgeExclude));
    result={caseId:current.id,snapshot:current.snapshot,proof:current.proof,providerCalls:0,persisted:false,terms:current.terms};renderResult();
  }
  async function load(id){
    const sequence=++loadSequence;$('judge-workspace').hidden=true;current=null;result=null;
    if(!id)return;
    try{
      const record=await request('/api/judge/cases/'+encodeURIComponent(id));if(sequence!==loadSequence)return;current=record;
      const {memo}=record.snapshot;
      $('judge-title').textContent=record.title;$('judge-source').textContent=`${memo.input.city} · ${record.snapshot.mock?'Synthetic evidence — demonstration only':'Saved live Qloo evidence'} · ${memo.items.length} artists · ${memo.constraints.slots} slots`;
      $('judge-baseline').textContent=`Baseline: ${names(memo.slate.selectedIds)} · ${money(memo.slate.totalFee)} planned fees.`;$('judge-terms').textContent=record.terms;
      $('judge-cancel').innerHTML='<option value="">No cancellation</option>'+memo.slate.selectedIds.map(id=>`<option value="${e(id)}">${e(names([id]))}</option>`).join('');
      $('judge-withdraw').innerHTML='<option value="">Keep all evidence</option>'+record.snapshot.receipts.map(r=>`<option value="${e(r.id)}">${e(r.id)} · ${e(r.tool)} · ${e(r.status)}</option>`).join('');
      $('judge-candidates').innerHTML=`<div class="table-scroll"><table class="gm-table"><thead><tr><th>Artist</th><th>Illustrative fee</th><th>Saved rank (before changes)</th><th>Lock</th><th>Exclude</th></tr></thead><tbody>${memo.items.map(i=>`<tr><td>${e(i.name)}</td><td>${e(money(i.terms.fee))}</td><td>${i.evidence.rank?e(i.rank??i.fit):'Unknown'}</td><td><input type="checkbox" data-judge-lock="${e(i.id)}" aria-label="Lock ${e(i.name)}"></td><td><input type="checkbox" data-judge-exclude="${e(i.id)}" aria-label="Exclude ${e(i.name)}"></td></tr>`).join('')}</tbody></table></div>`;
      $('judge-receipts').innerHTML=record.snapshot.receipts.map(r=>`<details><summary>${e(r.id)} · ${e(r.tool)} · ${e(r.status)}</summary><pre>${e(JSON.stringify(r,null,2))}</pre></details>`).join('');
      reset();$('judge-workspace').hidden=false;history.replaceState(null,'','#'+id);say('Ready. Each experiment uses the same saved pool.');
    }catch(error){if(sequence===loadSequence)say(error.message);}
  }
  async function experiment(){
    if(busy||!current)return;busy=true;const id=current.id;
    $('judge-case').disabled=true;document.querySelectorAll('#judge-form button, #judge-form input, #judge-form select').forEach(b=>b.disabled=true);say('Enumerating feasible lineups and checking evidence dependencies…');
    try{
      const body={budget:Number($('judge-budget').value),lockedIds:[...document.querySelectorAll('[data-judge-lock]:checked')].map(i=>i.dataset.judgeLock),excludedIds:[...document.querySelectorAll('[data-judge-exclude]:checked')].map(i=>i.dataset.judgeExclude),cancelId:$('judge-cancel').value,withdrawReceiptId:$('judge-withdraw').value};
      result=await request('/api/judge/cases/'+id+'/experiment',body);renderResult();say('Experiment complete. No provider calls, saved-plan changes, or approvals.');
    }catch(error){say(error.message);}finally{busy=false;$('judge-case').disabled=false;document.querySelectorAll('#judge-form button, #judge-form input, #judge-form select').forEach(b=>b.disabled=false);}
  }
  $('judge-form').onsubmit=event=>{event.preventDefault();void experiment();};$('judge-reset').onclick=()=>{reset();say('Published baseline restored.');};
  $('judge-tight-budget').onclick=()=>{reset();$('judge-budget').value=Math.floor(current.snapshot.memo.slate.totalFee*.9);void experiment();};
  $('judge-rank-challenge').onclick=()=>{reset();const id=current.snapshot.memo.items.flatMap(i=>i.evidenceReceipts.rank??[]).find(id=>current.snapshot.receipts.some(r=>r.id===id));if(!id){say('No linked rank receipt is available in this case.');return;}$('judge-withdraw').value=id;void experiment();};
  $('judge-cancellation').onclick=()=>{reset();const id=current.snapshot.memo.slate.selectedIds[0];if(!id){say('The baseline has no feasible selected artist to cancel.');return;}$('judge-cancel').value=id;void experiment();};
  $('judge-export').onclick=()=>{if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`houselights-judge-${current.id}.json`;link.click();URL.revokeObjectURL(url);};
  $('judge-case').onchange=()=>void load($('judge-case').value);
  request('/api/judge/cases').then(({cases})=>{
    $('judge-case').innerHTML=cases.map(c=>`<option value="${e(c.id)}">${e(c.title)}${c.synthetic?' · Synthetic':''}</option>`).join('');
    if(!cases.length){say('No public cases have been prepared on this server yet.');return;}
    const id=location.hash.slice(1);$('judge-case').value=cases.some(c=>c.id===id)?id:cases[0].id;void load($('judge-case').value);
  }).catch(error=>say(error.message));
})();
