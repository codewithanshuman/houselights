'use strict';
(() => {
  const $=id=>document.getElementById(id),e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  document.querySelectorAll('[data-judge-scroll]').forEach(link=>link.addEventListener('click',event=>{
    const target=$(link.getAttribute('href').slice(1));if(!target)return;
    event.preventDefault();target.focus({preventScroll:true});target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }));
  let current=null,result=null,busy=false,loadSequence=0;
  const say=message=>$('judge-status').textContent=message;
  async function request(path,body){const response=await fetch(path,{...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const value=await response.json();if(!response.ok)throw new Error(value.error??'Request failed.');return value;}
  const names=ids=>ids.map(id=>current.snapshot.memo.items.find(i=>i.id===id)?.name??id).join(' + ')||'No feasible lineup';
  const money=value=>value==null?'Unknown':new Intl.NumberFormat('en-GB',{style:'currency',currency:current.snapshot.memo.currency}).format(value);
  function renderAgentTrace(){
    const snapshot=current.snapshot,receipts=snapshot.receipts??[],brief=snapshot.memo.input??{};
    const question=`Which of these ${snapshot.memo.items.length} artists fit ${brief.anchors?.join(' and ')||'the saved audience'} in ${brief.city||'this market'}, within the booking constraints?`;
    const receiptById=new Map(receipts.map(receipt=>[receipt.id,receipt]));
    const title={describe:'Describe artist',entity_tags:'Inspect tags',recommend:'Discover related artists',rank:'Rank audience fit',
      trends:'Check trends',where_popular:'Check local relevance',compare_audiences:'Compare audiences'};
    const stamp=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():'Timestamp unavailable';
    const trace=Array.isArray(snapshot.trace)?snapshot.trace:[];
    const recorded=trace.length>0;
    const steps=[];
    if(recorded){
      const eventNames={start:'Run started',stage:'Research stage emitted',receipt:'Tool returned',plan:'Research plan emitted',needs_input:'Input requested',memo:'Optimizer result emitted'};
      for(const [index,event] of [...trace].sort((a,b)=>a.elapsedMs-b.elapsedMs).entries()){
        const receipt=receiptById.get(event.receiptId),kind=receipt?.tool;
        const label=receipt?`${title[kind]??kind} returned`:eventNames[event.type]??'Recorded event';
        const detail=receipt?`${receipt.status} · ${receipt.evidence?.rows?.length??0} projected rows · ${stamp(receipt.fetchedAt)}`:
          event.type==='memo'?`Feasible: ${event.feasible?'yes':'no'}`:'The saved event contains no public explanation of the model’s reasoning.';
        steps.push(`<li><span class="agent-step-number">${e(String(index+1).padStart(2,'0'))}</span><div><strong>${e(label)}</strong><p>${e(detail)}</p><small>Recorded +${e((event.elapsedMs/1000).toFixed(1))}s${receipt?` · <a href="#judge-receipts">Receipt ${e(receipt.id)}</a>`:''}</small></div></li>`);
      }
    }else{
      const ordered=receipts.map((receipt,index)=>({receipt,index,time:Date.parse(receipt.fetchedAt)}))
        .sort((a,b)=>(Number.isFinite(a.time)?a.time:Infinity)-(Number.isFinite(b.time)?b.time:Infinity)||a.index-b.index);
      const groups=[];
      for(const row of ordered){
        const previous=groups.at(-1),gap=row.time-previous?.at(-1)?.time;
        if(previous&&previous[0].receipt.tool===row.receipt.tool&&previous[0].receipt.status===row.receipt.status&&gap>=0&&gap<=60000)previous.push(row);
        else groups.push([row]);
      }
      for(const [index,group] of groups.entries()){
        const first=group[0].receipt,last=group.at(-1).receipt,rows=group.reduce((n,row)=>n+(row.receipt.evidence?.rows?.length??0),0);
        const times=stamp(first.fetchedAt)+(group.length>1?` to ${stamp(last.fetchedAt)}`:'');
        const gap=index>0?group[0].time-groups[index-1].at(-1).time:0;
        const later=gap>60000?` · ${e(Math.round(gap/1000))}s after the preceding receipt; the case does not establish whether this was the same run.`:'';
        steps.push(`<li><span class="agent-step-number">${e(String(index+1).padStart(2,'0'))}</span><div><strong>${e(title[first.tool]??first.tool)} · ${e(group.length)} ${group.length===1?'receipt':'receipts'}</strong><p>${e(first.status)} · ${e(rows)} projected evidence rows · ${e(times)}</p><small><a href="#judge-receipts">Receipts ${e(group.map(row=>row.receipt.id).join(', '))}</a> · Recorded completion order; the model’s reason for each call was not saved.${later}</small></div></li>`);
      }
    }
    const slate=snapshot.memo.slate;
    $('judge-agent-trace').innerHTML=`<p class="judge-trace-disclosure">${recorded?'Actual saved run events are ordered by elapsed time. Free-text model reasoning is not published.':'This case has receipt completion timestamps but no saved model-step event log. The order below follows those timestamps; it does not reconstruct the agent’s choices.'}</p><p><strong>Published booking question:</strong> ${e(question)} <small>Derived from the brief, not a recorded model prompt.</small></p><ol class="agent-trace-list">${steps.join('')}</ol><p class="judge-trace-disclosure"><strong>Current replay:</strong> The exact optimizer checks ${e(slate.checkedCount)} lineups; ${e(slate.feasibleCount)} meet every hard constraint. ${e(slate.feasible?'The selected lineup is feasible.':'No feasible lineup was found.')} This replay is separate from the recorded receipt timeline. Fees and availability are illustrative booking inputs.</p>`;
  }
  function methodComparison(){
    const methods=result.methods??{qloo:result.proof.baseline,constraintOnly:result.proof.constraintOnly,
      llm:{available:false,status:'unavailable',interpretation:'No saved first-trial LLM control is published for this case.'}};
    const llm=methods.llm;
    const rows=[[result.qlooOff?'Optimizer with Qloo evidence off':'Qloo-informed optimizer',methods.qloo],['Cheapest feasible lineup',methods.constraintOnly],['Saved LLM selection',llm]];
    return `<h4>Compare the three methods</h4><div class="table-scroll"><table class="gm-table"><thead><tr><th>Method</th><th>Selected artists</th><th>Fees</th><th>Policy points</th><th>Constraint check</th></tr></thead><tbody>${rows.map(([label,row])=>`<tr><td>${e(label)}</td><td>${row.selectedIds?.length?e(names(row.selectedIds)):'No selection available'}</td><td>${e(money(row.totalFee))}</td><td>${Number.isFinite(row.score)?e(row.score.toFixed(2)):'—'}</td><td>${e(row.feasible===true?'Pass':row.feasible===false?'Fails constraints':row.status)}</td></tr>`).join('')}</tbody></table></div><p>The cheapest feasible lineup is selected by cost alone. All displayed policy points are scored afterward with the current evidence.</p><p>${e(llm.interpretation)}</p>${llm.available?`<p>${e(llm.generation?.provider)} · ${e(llm.generation?.model)} · first trial · ${llm.identicalSelection?'same selection as the optimizer':'different selection from the optimizer'}.</p>${llm.violations?.length?`<ul>${llm.violations.map(v=>`<li>Saved LLM selection: ${e(v)}</li>`).join('')}</ul>`:''}`:''}<p>${e(methods.interpretation??'Policy points evaluate the optimizer’s own objective. They are not independent evidence, attendance predictions or revenue uplift.')}</p>${methods.policyPointDelta!=null?`<p>Optimizer minus LLM: ${e(methods.policyPointDelta.toFixed(2))} policy points on this unchanged saved brief.</p>`:''}`;
  }
  function evidenceComparison(){
    if(!result.qlooOff)return '';
    const original=current.snapshot.memo.slate,updated=result.snapshot.memo.slate,comparison=result.comparison;
    const changedIds=[...new Set([...comparison.removedIds,...comparison.addedIds])];
    const linked=[...new Set(changedIds.flatMap(id=>Object.values(current.snapshot.memo.items.find(item=>item.id===id)?.evidenceReceipts??{}).flat()))].filter(Boolean);
    const matched=comparison.matchedEvidenceWithdrawal===true;
    const note=matched?'Same candidate pool, fees, availability, scoring policy and booking constraints. Only saved cultural evidence was withdrawn. This tests the optimizer’s dependence on that evidence, not ticket sales or commercial value.':'This experiment also changes booking inputs or withdraws a separate receipt. The lineup difference cannot be attributed to Qloo evidence alone.';
    const change=comparison.changed?`Removed: ${comparison.removedIds.length?e(names(comparison.removedIds)):'none'}. Added: ${comparison.addedIds.length?e(names(comparison.addedIds)):'none'}.`:'Both runs selected the same artists.';
    return `<section class="judge-evidence-comparison" aria-label="Qloo evidence comparison"><p class="judge-section-label"><span>↳</span> MATCHED EVIDENCE TEST</p><h4>Same brief. What did Qloo change?</h4><div class="judge-evidence-columns"><div><small>WITH SAVED QLOO EVIDENCE</small><strong>${e(names(original.selectedIds))}</strong><span>${e(original.feasible?'Passes constraints':'No feasible selection')} · ${e(money(original.totalFee))} fees</span></div><div><small>WITH QLOO EVIDENCE REMOVED</small><strong>${e(names(updated.selectedIds))}</strong><span>${e(updated.feasible?'Passes constraints':'Explicitly infeasible')} · ${e(money(updated.totalFee))} fees</span></div></div><p><strong>${e(comparison.changed?'Selection changed.':'Selection unchanged.')}</strong> ${change}</p><p class="judge-comparison-limit">${e(note)}</p>${linked.length?`<p class="judge-comparison-limit">Changed artists have links to saved receipts ${e(linked.slice(0,6).join(', '))}${linked.length>6?' and more':''}. Inspect them below or use Proof Lab to test individual signals; a link alone does not establish which signal caused the change.</p>`:''}</section>`;
  }
  function renderResult(){
    const {snapshot,proof,comparison}=result,slate=snapshot.memo.slate;
    $('judge-result').innerHTML=`<h3>${e(names(slate.selectedIds))}</h3><p>${e(slate.status)} · ${e(money(slate.totalFee))} planned fees · ${e(money(snapshot.memo.constraints.budget))} budget</p>${evidenceComparison()}${comparison?`<p>${comparison.changed?'The selected lineup changed.':'The selected lineup did not change.'} ${comparison.feeDelta==null?'':`Fee difference: ${e(money(comparison.feeDelta))}.`} ${comparison.survivorIds.length?`Survivors ${comparison.survivorsPreserved===null?'cannot all be accommodated':comparison.survivorsPreserved?'preserved':'not preserved'}.`:''}</p><p>${e(comparison.interpretation)}</p>`:''}<p><strong>Evidence state: ${e(proof.status)}.</strong> Computational feasibility is separate from commercial approval.</p>${!slate.feasible?`<ul>${slate.reasons.map(reason=>`<li>${e(reason)}</li>`).join('')}</ul>`:''}${methodComparison()}<ul>${proof.findings.map(f=>`<li><strong>${e(f.severity)}:</strong> ${e(f.assumption)} ${e(f.correction)}</li>`).join('')}</ul><details><summary>Inspect exact search, rejected candidates, evidence tests and recovery</summary><pre>${e(JSON.stringify({proof,methods:result.methods},null,2))}</pre></details>`;
  }
  function reset(){
    if(!current)return;
    const {memo}=current.snapshot;
    $('judge-budget').value=memo.constraints.budget;$('judge-cancel').value='';$('judge-withdraw').value='';$('judge-qloo-off').checked=false;
    document.querySelectorAll('[data-judge-lock]').forEach(input=>input.checked=memo.constraints.lockedIds.includes(input.dataset.judgeLock));
    document.querySelectorAll('[data-judge-exclude]').forEach(input=>input.checked=memo.constraints.excludedIds.includes(input.dataset.judgeExclude));
    result={caseId:current.id,snapshot:current.snapshot,proof:current.proof,methods:current.methods,providerCalls:0,persisted:false,terms:current.terms};renderResult();
  }
  async function load(id){
    const sequence=++loadSequence;$('judge-workspace').hidden=true;current=null;result=null;
    if(!id)return;
    try{
      const record=await request('/api/judge/cases/'+encodeURIComponent(id));if(sequence!==loadSequence)return;current=record;
      const {memo}=record.snapshot;
      $('judge-title').textContent=record.title;$('judge-source').textContent=`${memo.input.city} · ${record.snapshot.mock?'Synthetic evidence — demonstration only':'Saved live Qloo evidence'} · ${memo.items.length} artists · ${memo.constraints.slots} slots`;
      $('judge-baseline').textContent=`Baseline: ${names(memo.slate.selectedIds)} · ${money(memo.slate.totalFee)} planned fees.`;$('judge-terms').textContent=record.terms;
      $('judge-constraints').innerHTML=`<span>${e(memo.constraints.slots)} slots</span><span>${e(money(memo.constraints.budget))} fee budget</span><span>Max ${e(memo.constraints.maxPerGenre)} per genre</span><span>${e(memo.constraints.discoveryMin)} discovery minimum</span>${memo.constraints.lockedIds?.length?`<span>Locked: ${e(names(memo.constraints.lockedIds))}</span>`:''}${memo.constraints.excludedIds?.length?`<span>Excluded: ${e(names(memo.constraints.excludedIds))}</span>`:''}`;
      $('judge-cancel').innerHTML='<option value="">No cancellation</option>'+memo.slate.selectedIds.map(id=>`<option value="${e(id)}">${e(names([id]))}</option>`).join('');
      $('judge-withdraw').innerHTML='<option value="">Keep all evidence</option>'+record.snapshot.receipts.map(r=>`<option value="${e(r.id)}">${e(r.id)} · ${e(r.tool)} · ${e(r.status)}</option>`).join('');
      $('judge-candidates').innerHTML=`<div class="table-scroll"><table class="gm-table"><thead><tr><th>Artist</th><th>Illustrative fee</th><th>Saved rank (before changes)</th><th>Lock</th><th>Exclude</th></tr></thead><tbody>${memo.items.map(i=>`<tr><td>${e(i.name)}</td><td>${e(money(i.terms.fee))}</td><td>${i.evidence.rank?e(i.rank??i.fit):'Unknown'}</td><td><input type="checkbox" data-judge-lock="${e(i.id)}" aria-label="Lock ${e(i.name)}"></td><td><input type="checkbox" data-judge-exclude="${e(i.id)}" aria-label="Exclude ${e(i.name)}"></td></tr>`).join('')}</tbody></table></div>`;
      $('judge-receipts').innerHTML=record.snapshot.receipts.map(r=>`<details><summary>${e(r.id)} · ${e(r.tool)} · ${e(r.status)}</summary><pre>${e(JSON.stringify(r,null,2))}</pre></details>`).join('');
      renderAgentTrace();$('judge-proof-link').href='/proof-lab.html#'+encodeURIComponent(record.id);
      reset();$('judge-workspace').hidden=false;history.replaceState(null,'','#'+id);say('Ready. Each experiment uses the same saved pool.');
    }catch(error){if(sequence===loadSequence)say(error.message);}
  }
  async function experiment(scrollToProof=false){
    if(busy||!current)return;busy=true;const id=current.id;
    $('judge-case').disabled=true;document.querySelectorAll('#judge-form button, #judge-form input, #judge-form select').forEach(b=>b.disabled=true);say('Enumerating feasible lineups and checking evidence dependencies…');
    try{
      const body={budget:Number($('judge-budget').value),lockedIds:[...document.querySelectorAll('[data-judge-lock]:checked')].map(i=>i.dataset.judgeLock),excludedIds:[...document.querySelectorAll('[data-judge-exclude]:checked')].map(i=>i.dataset.judgeExclude),cancelId:$('judge-cancel').value,withdrawReceiptId:$('judge-withdraw').value,qlooOff:$('judge-qloo-off').checked};
      result=await request('/api/judge/cases/'+id+'/experiment',body);renderResult();say('Experiment complete. No provider calls, saved-plan changes, or approvals.');
      if(scrollToProof)$('judge-proof-title').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    }catch(error){say(error.message);}finally{busy=false;$('judge-case').disabled=false;document.querySelectorAll('#judge-form button, #judge-form input, #judge-form select').forEach(b=>b.disabled=false);}
  }
  $('judge-form').onsubmit=event=>{event.preventDefault();void experiment();};$('judge-reset').onclick=()=>{reset();say('Published baseline restored.');};
  $('judge-tight-budget').onclick=()=>{reset();$('judge-budget').value=Math.floor(current.snapshot.memo.slate.totalFee*.9);void experiment(true);};
  $('judge-qloo-compare').onclick=()=>{reset();$('judge-qloo-off').checked=true;void experiment(true);};
  $('judge-rank-challenge').onclick=()=>{reset();const id=current.snapshot.memo.items.flatMap(i=>i.evidenceReceipts.rank??[]).find(id=>current.snapshot.receipts.some(r=>r.id===id));if(!id){say('No linked rank receipt is available in this case.');return;}$('judge-withdraw').value=id;void experiment();};
  $('judge-cancellation').onclick=()=>{reset();const id=current.snapshot.memo.slate.selectedIds[0];if(!id){say('The baseline has no feasible selected artist to cancel.');return;}$('judge-cancel').value=id;void experiment();};
  $('judge-export').onclick=()=>{if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`houselights-judge-${current.id}.json`;link.click();URL.revokeObjectURL(url);};
  $('judge-case').onchange=()=>void load($('judge-case').value);
  request('/api/judge/cases').then(({cases})=>{
    $('judge-live-count').textContent=`${cases.filter(c=>!c.synthetic).length} saved live-Qloo cases · ${cases.filter(c=>c.synthetic).length} synthetic cases`;
    $('judge-case').innerHTML=cases.map(c=>`<option value="${e(c.id)}">${e(c.title)}${c.synthetic?' · Synthetic':''}</option>`).join('');
    if(!cases.length){say('No public cases have been prepared on this server yet.');return;}
    const id=location.hash.slice(1),guided=cases.find(c=>c.id==='bf9b65d52eeff00e0e258917')??cases.find(c=>c.city?.toLowerCase()==='new york');
    $('judge-case').value=cases.some(c=>c.id===id)?id:(guided??cases[0]).id;void load($('judge-case').value);
  }).catch(error=>say(error.message));
  request('/api/evidence/reviews').then(report=>$('judge-review-count').textContent=`${report.completedReviewers} independent reviews recorded`).catch(()=>$('judge-review-count').textContent='Review status unavailable');
  fetch('/shocks-summary.json').then(response=>response.json()).then(data=>{
    const count=data.headlineDenominator;
    $('judge-shock-teaser').innerHTML=`<strong>${e(count.violationResponses)}/${e(count.returnedResponses)}</strong><span>violating re-prompted LLM responses in the clearly labeled synthetic ${e(count.candidateCount)}-candidate case</span><small>Houselights returned 0 invalid lineups across ${e(data.summary.houselights.shocks)} deterministic shocks, with ${e(data.summary.houselights.abstained)} explicit abstentions. This follows from exact constraint enforcement; it does not prove commercial uplift.</small><a href="/evidence.html">Inspect all shocks and limitations ↗</a>`;
  }).catch(()=>$('judge-shock-teaser').textContent='Shock study unavailable; the live decision room remains usable.');
})();
