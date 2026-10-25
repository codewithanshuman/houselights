'use strict';
(() => {
  const $=id=>document.getElementById(id),e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  document.querySelectorAll('[data-judge-scroll]').forEach(link=>link.addEventListener('click',event=>{
    const target=$(link.getAttribute('href').slice(1));if(!target)return;
    event.preventDefault();target.focus({preventScroll:true});target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }));
  let current=null,result=null,busy=false,loadSequence=0;
  const notify=(phase='state')=>document.dispatchEvent(new CustomEvent('booking:state',{detail:{current,result,busy,phase}}));
  document.addEventListener('booking:ready',()=>notify());
  const say=message=>$('judge-status').textContent=message;
  async function request(path,body){const response=await fetch(path,{...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const value=await response.json();if(!response.ok)throw new Error(value.error??'Request failed.');return value;}
  const names=ids=>ids.map(id=>current.snapshot.memo.items.find(i=>i.id===id)?.name??id).join(' + ')||'No feasible bill';
  const money=value=>value==null?'Unknown':window.HL.money(value,current.snapshot.memo.currency);
  const receiptLink=id=>{
    const index=current.snapshot.receipts.findIndex(receipt=>receipt.id===id);
    return index<0?e(id):`<button type="button" class="judge-receipt-link" data-receipt-index="${index}">Receipt ${e(id)}</button>`;
  };
  function renderQlooPreview(){
    const baseline=current.snapshot.memo.slate,withdrawn=current.proof.ablations?.find(row=>row.id==='class:all');
    const box=$('judge-qloo-preview');
    if(!withdrawn){box.textContent='A matched evidence withdrawal is unavailable for this saved case.';return;}
    const changed=JSON.stringify([...baseline.selectedIds].sort())!==JSON.stringify([...withdrawn.selectedIds].sort());
    const liveReceipts=current.snapshot.receipts.filter(row=>row.source==='qloo').length;
    // Without a complete Qloo ranking there is no comparable fit, so no Qloo effect can be shown.
    const coverage=current.snapshot.memo.items.map(item=>item.rankCoverage).find(Boolean),notComparable=coverage?.complete===false;
    const insufficient=!notComparable&&current.proof.status==='blocked';
    box.innerHTML=`<p class="judge-preview-kicker">SAME CITY · SAME ARTISTS · SAME BUDGET</p><div class="judge-preview-choice"><small>With saved Qloo evidence</small><strong>${e(names(baseline.selectedIds))}</strong></div><div class="judge-preview-arrow" aria-hidden="true">↓</div><div class="judge-preview-choice"><small>With cultural evidence withdrawn</small><strong>${e(names(withdrawn.selectedIds))}</strong></div>${notComparable?`<p class="judge-preview-outcome">Not comparable: Qloo ranked ${e(coverage.returned)} of ${e(coverage.requested)} candidates, so no comparable fit exists. This brief is excluded from Qloo-effect and method comparisons.</p>`:`<p class="judge-preview-outcome">${e(changed?'The choice changes under matched assumptions.':'The choice stays the same under matched assumptions.')}</p>`}${insufficient?'<p class="judge-preview-warning">Evidence review is blocked. Treat this comparison as inconclusive.</p>':''}<p class="judge-preview-limit">${e(liveReceipts)} recorded Qloo receipts · illustrative fees. This tests evidence dependence, not ticket demand or causal uplift.</p>${!current.methods?.llm?.comparable?'<p class="judge-preview-limit">No matched saved first-trial LLM-only control was captured with the original run. A separate later replication is shown in Cultural proof. Evidence withdrawal cannot establish superiority over an independent LLM booking decision.</p>':''}<button type="button" class="button primary" data-preview-compare>Run the matched test and inspect receipts ↗</button>`;
  }
  function renderAgentTrace(){
    const snapshot=current.snapshot,receipts=snapshot.receipts??[],brief=snapshot.memo.input??{};
    const question=`Which of these ${snapshot.memo.items.length} artists fit ${brief.anchors?.join(' and ')||'the saved audience'} in ${brief.city||'this market'}, within the booking constraints?`;
    const receiptById=new Map(receipts.map(receipt=>[receipt.id,receipt]));
    const title={describe:'Describe artist',entity_tags:'Inspect tags',recommend:'Discover related artists',rank:'Rank audience fit',
      trends:'Check trends',where_popular:'Check local relevance',compare_audiences:'Compare audiences'};
    const stamp=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():'Timestamp unavailable';
    const trace=Array.isArray(snapshot.trace)?snapshot.trace:[];
    const recorded=trace.length>0;
    let activity='';
    if(recorded){
      const ordered=[...trace].sort((a,b)=>a.elapsedMs-b.elapsedMs);
      const eventNames={start:'Run started',stage:'Research step',receipt:'Qloo tool returned',plan:'Evidence-check plan',needs_input:'Artist identity needs input',memo:'Optimizer completed'};
      const eventDetail=event=>{
        const receipt=receiptById.get(event.receiptId);
        if(receipt)return `${receipt.why??'No public tool objective was saved.'} · ${receipt.status} · ${receipt.evidence?.rows?.length??0} public rows${receipt.cached?' · cached result':''}.`;
        if(event.type==='plan')return `${event.by==='llm'?'Model-selected checks':event.by==='rules'?'Rule-selected checks':'Recorded selection method unavailable'}: ${event.deep?.length?event.deep.join(', '):'artist names not saved'}. ${event.text??''}`;
        if(event.type==='memo')return `Exact optimization ${event.feasible?'found a feasible bill':'reported infeasibility'}.`;
        return event.text??'No public explanation was saved for this event.';
      };
      const full=ordered.map((event,index)=>`<li><span class="agent-step-number">${e(String(index+1).padStart(2,'0'))}</span><div><strong>${e(event.type==='receipt'?`${title[receiptById.get(event.receiptId)?.tool]??'Qloo tool'} returned`:eventNames[event.type]??'Recorded event')}</strong><p>${e(eventDetail(event))}</p><small>Recorded +${e((event.elapsedMs/1000).toFixed(1))}s${event.receiptId?` · ${receiptLink(event.receiptId)}`:''}</small></div></li>`).join('');
      const groups=[];
      for(const event of ordered){
        if(event.type==='receipt'&&groups.length){groups.at(-1).receipts.push(event);continue;}
        groups.push({event,receipts:[]});
      }
      const highlights=groups.filter(group=>['stage','plan','memo'].includes(group.event.type)).map((group,index)=>{
        const event=group.event,linked=group.receipts.filter(row=>receiptById.has(row.receiptId));
        return `<li><span class="agent-step-number">${e(String(index+1).padStart(2,'0'))}</span><div><strong>${e(event.type==='stage'?event.text??'Research stage recorded':eventNames[event.type])}</strong><p>${e(event.type==='stage'?`${linked.length} Qloo tool ${linked.length===1?'return':'returns'} followed this step.`:eventDetail(event))}</p><small>Recorded +${e((event.elapsedMs/1000).toFixed(1))}s${linked.length?` · ${linked.slice(0,5).map(row=>receiptLink(row.receiptId)).join(', ')}${linked.length>5?` · ${e(linked.length-5)} more in the full log`:''}`:''}</small></div></li>`;
      }).join('');
      const meta=snapshot.traceMeta??{},quality=meta.complete?'Complete saved event sequence':'Partial saved event sequence';
      activity=`<div class="judge-trace-summary"><strong>${e(quality)}</strong><span>${e(ordered.length)} recorded events · ${e(meta.linkedReceipts??0)}/${e(meta.totalReceipts??receipts.length)} receipts linked · ${e(snapshot.mock?'synthetic evidence':'live Qloo receipts')}</span></div><ol class="agent-trace-list agent-stage-list">${highlights}</ol><details class="judge-trace-full"><summary>Inspect all ${e(ordered.length)} recorded events in elapsed order</summary><ol class="agent-trace-list">${full}</ol></details>`;
    }else{
      const steps=[];
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
        steps.push(`<li><span class="agent-step-number">${e(String(index+1).padStart(2,'0'))}</span><div><strong>${e(title[first.tool]??first.tool)} · ${e(group.length)} ${group.length===1?'receipt':'receipts'}</strong><p>${e(first.status)} · ${e(rows)} projected evidence rows · ${e(times)}</p><small>${group.map(row=>receiptLink(row.receipt.id)).join(', ')} · Recorded completion order; the model’s reason for each call was not saved.${later}</small></div></li>`);
      }
      activity=`<ol class="agent-trace-list">${steps.join('')}</ol>`;
    }
    const slate=snapshot.memo.slate;
    $('judge-agent-trace').innerHTML=`<p class="judge-trace-disclosure">${recorded?'These are saved application events in elapsed order, linked to the exact public Qloo receipts. The summary groups recorded steps for readability; the full log preserves every event. Free-text model reasoning was not saved.':'This case has receipt completion timestamps but no saved model-step event log. The order below follows those timestamps; it does not reconstruct the agent’s choices.'}</p><p><strong>Published booking question:</strong> ${e(question)} <small>Derived from the brief, not a recorded model prompt.</small></p>${activity}<p class="judge-trace-disclosure"><strong>Published baseline search:</strong> The exact optimizer checks ${e(slate.checkedCount)} lineups; ${e(slate.feasibleCount)} meet every hard constraint. ${e(slate.feasible?'The selected bill is feasible.':'No feasible bill was found.')} This replay is separate from the recorded research. Fees and availability are illustrative booking inputs.</p>`;
  }
  function methodComparison(){
    const methods=result.methods??{qloo:result.proof.baseline,constraintOnly:result.proof.constraintOnly,
      llm:{available:false,status:'unavailable',interpretation:'No saved first-trial LLM control is published for this case.'}};
    const llm=methods.llm;
    const rows=[[result.qlooOff?'Optimizer with Qloo evidence off':'Qloo-informed optimizer',methods.qloo],['Cheapest feasible bill',methods.constraintOnly],['Saved LLM selection',llm]];
    return `<h4>Compare the three methods</h4><div class="table-scroll"><table class="gm-table"><thead><tr><th>Method</th><th>Selected artists</th><th>Fees</th><th>${window.HL?window.HL.term('Policy points','policyPoints'):'Policy points'}</th><th>Constraint check</th></tr></thead><tbody>${rows.map(([label,row])=>`<tr><td>${e(label)}</td><td>${row.selectedIds?.length?e(names(row.selectedIds)):'No selection available'}</td><td>${e(money(row.totalFee))}</td><td>${Number.isFinite(row.score)?e(row.score.toFixed(2)):'—'}</td><td>${e(row.feasible===true?'Pass':row.feasible===false?'Fails constraints':row.status)}</td></tr>`).join('')}</tbody></table></div><p>The cheapest feasible bill is selected by cost alone. All displayed policy points are scored afterward with the current evidence.</p><p>${e(llm.interpretation)} ${current.id==='8be4d03ef4792ca9f1466983'?'This table describes the original saved methods only; Cultural proof shows the separately collected later LLM replication.':''}</p>${llm.available?`<p>${e(llm.generation?.provider)} · ${e(llm.generation?.model)} · first trial · ${llm.identicalSelection?'same selection as the optimizer':'different selection from the optimizer'}.</p>${llm.violations?.length?`<ul>${llm.violations.map(v=>`<li>Saved LLM selection: ${e(v)}</li>`).join('')}</ul>`:''}`:''}<p>${e(methods.interpretation??'Policy points evaluate the optimizer’s own objective. They are not independent evidence, attendance predictions or revenue uplift.')}</p>${methods.policyPointDelta!=null?`<p>Optimizer minus LLM: ${e(methods.policyPointDelta.toFixed(2))} policy points on this unchanged saved brief.</p>`:''}`;
  }
  function evidenceComparison(){
    if(!result.qlooOff)return '';
    const original=current.snapshot.memo.slate,updated=result.snapshot.memo.slate,comparison=result.comparison;
    const changedIds=[...new Set([...comparison.removedIds,...comparison.addedIds])];
    const linked=[...new Set(changedIds.flatMap(id=>Object.values(current.snapshot.memo.items.find(item=>item.id===id)?.evidenceReceipts??{}).flat()))].filter(id=>current.snapshot.receipts.some(receipt=>receipt.id===id));
    const matched=comparison.matchedEvidenceWithdrawal===true;
    const label=matched?'MATCHED EVIDENCE TEST':'COMBINED-CHANGE REPLAY';
    const heading=matched?'Same brief. What did Qloo change?':'Evidence and booking inputs changed';
    const changedLabel=matched?'WITH QLOO EVIDENCE REMOVED':'EVIDENCE REMOVED + OTHER CHANGES';
    const note=matched?'Same candidate pool, fees, availability, scoring policy and booking constraints. Only saved cultural evidence was withdrawn. This tests the optimizer’s dependence on that evidence, not ticket sales or commercial value.':'This experiment also changes booking inputs or withdraws a separate receipt. The bill difference cannot be attributed to Qloo evidence alone.';
    const change=comparison.changed?`Removed: ${comparison.removedIds.length?e(names(comparison.removedIds)):'none'}. Added: ${comparison.addedIds.length?e(names(comparison.addedIds)):'none'}.`:'Both runs selected the same artists.';
    return `<section class="judge-evidence-comparison" aria-label="Qloo evidence comparison"><p class="judge-section-label"><span>↳</span> ${label}</p><h4>${heading}</h4><div class="judge-evidence-columns"><div><small>WITH SAVED QLOO EVIDENCE</small><strong>${e(names(original.selectedIds))}</strong><span>${e(original.feasible?'Passes constraints':'No feasible selection')} · ${e(money(original.totalFee))} fees</span></div><div><small>${changedLabel}</small><strong>${e(names(updated.selectedIds))}</strong><span>${e(updated.feasible?'Passes constraints':'Explicitly infeasible')} · ${e(money(updated.totalFee))} fees</span></div></div><p><strong>${e(comparison.changed?'Selection changed.':'Selection unchanged.')}</strong> ${change}</p><p class="judge-comparison-limit">${e(note)}</p>${linked.length?`<p class="judge-comparison-limit">Saved receipts for changed artists: ${linked.slice(0,6).map(receiptLink).join(', ')}${linked.length>6?' and more':''}. A receipt link alone does not establish which signal caused the change; use Proof Lab to test individual signals.</p>`:''}</section>`;
  }
  function renderResult(){
    const {snapshot,proof,comparison}=result,slate=snapshot.memo.slate;
    $('judge-result').innerHTML=`<h3>${e(names(slate.selectedIds))}</h3><p>${e(slate.status)} · ${e(money(slate.totalFee))} planned fees · ${e(money(snapshot.memo.constraints.budget))} budget</p>${evidenceComparison()}${comparison?`<p>${comparison.changed?'The selected bill changed.':'The selected bill did not change.'} ${comparison.feeDelta==null?'':`Fee difference: ${e(money(comparison.feeDelta))}.`} ${comparison.survivorIds.length?`Survivors ${comparison.survivorsPreserved===null?'cannot all be accommodated':comparison.survivorsPreserved?'preserved':'not preserved'}.`:''}</p><p>${e(comparison.interpretation)}</p>`:''}<p><strong>Evidence state: ${e(proof.status)}.</strong> Computational feasibility is separate from commercial approval.</p>${!slate.feasible?`<ul>${slate.reasons.map(reason=>`<li>${e(reason)}</li>`).join('')}</ul>`:''}${methodComparison()}<ul>${proof.findings.map(f=>`<li><strong>${e(f.severity)}:</strong> ${e(f.assumption)} ${e(f.correction)}</li>`).join('')}</ul><details><summary>Inspect exact search, rejected candidates, evidence tests and recovery</summary><pre>${e(JSON.stringify({proof,methods:result.methods},null,2))}</pre></details>`;
  }
  function reset(){
    if(!current)return;
    const {memo}=current.snapshot;
    $('judge-budget').value=memo.constraints.budget;$('judge-cancel').value='';$('judge-withdraw').value='';$('judge-qloo-off').checked=false;
    document.querySelectorAll('[data-judge-lock]').forEach(input=>input.checked=memo.constraints.lockedIds.includes(input.dataset.judgeLock));
    document.querySelectorAll('[data-judge-exclude]').forEach(input=>input.checked=memo.constraints.excludedIds.includes(input.dataset.judgeExclude));
    result={caseId:current.id,snapshot:current.snapshot,proof:current.proof,methods:current.methods,providerCalls:0,persisted:false,terms:current.terms};renderResult();notify('reset');
  }
  async function load(id){
    const sequence=++loadSequence;$('judge-workspace').hidden=true;current=null;result=null;notify();
    if(!id)return;
    try{
      const record=await request('/api/judge/cases/'+encodeURIComponent(id));if(sequence!==loadSequence)return;current=record;
      const {memo}=record.snapshot;
      $('judge-title').textContent=record.title;$('judge-source').textContent=`${memo.input.city} · ${record.snapshot.mock?'Synthetic evidence — demonstration only':'Saved live Qloo evidence'} · ${record.snapshot.traceMeta?.complete?'Complete recorded run':'Receipts only; no agent event log'} · ${memo.items.length} artists · ${memo.constraints.slots} slots`;
      $('judge-baseline').textContent=`Baseline: ${names(memo.slate.selectedIds)} · ${money(memo.slate.totalFee)} planned fees.`;$('judge-terms').textContent=record.terms;
      $('judge-constraints').innerHTML=`<span>${e(memo.constraints.slots)} slots</span><span>${e(money(memo.constraints.budget))} fee budget</span><span>Max ${e(memo.constraints.maxPerGenre)} per genre</span><span>${e(memo.constraints.discoveryMin)} discovery minimum</span>${memo.constraints.lockedIds?.length?`<span>Locked: ${e(names(memo.constraints.lockedIds))}</span>`:''}${memo.constraints.excludedIds?.length?`<span>Excluded: ${e(names(memo.constraints.excludedIds))}</span>`:''}`;
      $('judge-cancel').innerHTML='<option value="">No cancellation</option>'+memo.slate.selectedIds.map(id=>`<option value="${e(id)}">${e(names([id]))}</option>`).join('');
      $('judge-withdraw').innerHTML='<option value="">Keep all evidence</option>'+record.snapshot.receipts.map(r=>`<option value="${e(r.id)}">${e(r.id)} · ${e(r.tool)} · ${e(r.status)}</option>`).join('');
      $('judge-candidates').innerHTML=`<div class="table-scroll"><table class="gm-table"><thead><tr><th>Artist</th><th>Illustrative fee</th><th>Saved rank (before changes)</th><th>Lock</th><th>Exclude</th></tr></thead><tbody>${memo.items.map(i=>`<tr><td>${e(i.name)}</td><td>${e(money(i.terms.fee))}</td><td>${i.evidence.rank?e(i.rank??i.fit):'Unknown'}</td><td><input type="checkbox" data-judge-lock="${e(i.id)}" aria-label="Lock ${e(i.name)}"></td><td><input type="checkbox" data-judge-exclude="${e(i.id)}" aria-label="Exclude ${e(i.name)}"></td></tr>`).join('')}</tbody></table></div>`;
      $('judge-receipts').innerHTML=record.snapshot.receipts.map(r=>`<details><summary>${e(r.id)} · ${e(r.tool)} · ${e(r.status)}</summary><pre>${e(JSON.stringify(r,null,2))}</pre></details>`).join('');
      renderAgentTrace();renderQlooPreview();$('judge-proof-link').href='/proof-lab.html#'+encodeURIComponent(record.id);
      reset();$('judge-tight-budget').disabled=!memo.slate.feasible;$('judge-tight-budget').title=memo.slate.feasible?'':'No feasible original bill has a cost to cut below.';$('judge-workspace').hidden=false;history.replaceState(null,'','#'+id);say('Ready. Each experiment uses the same saved pool.');
    }catch(error){if(sequence===loadSequence){say(error.message);$('judge-qloo-preview').textContent='The saved comparison could not be loaded.';}}
  }
  // The budget field is validated here (the form is novalidate): a clear error for
  // missing or non-numeric input, and clamping to $0-$10,000,000 with a note.
  const BUDGET_MAX=10000000;
  function readBudget(){
    const field=$('judge-budget'),error=$('judge-budget-error'),raw=String(field.value).trim().replace(/[$,s]/g,''),value=Number(raw);
    const fail=message=>{field.setAttribute('aria-invalid','true');if(error){error.textContent=message;error.hidden=false;}field.focus();return null;};
    if(!raw)return fail('Enter an artist budget in US dollars, for example 14500.');
    if(!Number.isFinite(value))return fail('The budget must be a number of US dollars, for example 14500.');
    const clamped=Math.min(BUDGET_MAX,Math.max(0,Math.round(value*100)/100));
    field.removeAttribute('aria-invalid');if(error){error.hidden=clamped===value;error.textContent=clamped===value?'':`Budget adjusted to ${clamped.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})}: the allowed range is $0 to $10,000,000.`;}
    if(clamped!==value)field.value=String(clamped);
    return clamped;
  }
  $('judge-budget')?.addEventListener('input',()=>{$('judge-budget').removeAttribute('aria-invalid');const error=$('judge-budget-error');if(error){error.hidden=true;error.textContent='';}});
  async function experiment(scrollToProof=false){
    if(busy||!current)return;const budgetValue=readBudget();if(budgetValue==null){say('Fix the budget to recalculate. The previous result is still displayed.');return;}busy=true;const id=current.id;
    const controls=document.querySelectorAll('#judge-form button, #judge-form input, #judge-form select, .judge-quick-actions button, [data-preview-compare]');
    $('judge-case').disabled=true;controls.forEach(control=>control.disabled=true);notify('calculating');say('Enumerating feasible bills and checking evidence dependencies…');
    try{
      const body={budget:budgetValue,lockedIds:[...document.querySelectorAll('[data-judge-lock]:checked')].map(i=>i.dataset.judgeLock),excludedIds:[...document.querySelectorAll('[data-judge-exclude]:checked')].map(i=>i.dataset.judgeExclude),cancelId:$('judge-cancel').value,withdrawReceiptId:$('judge-withdraw').value,qlooOff:$('judge-qloo-off').checked};
      result=await request('/api/judge/cases/'+id+'/experiment',body);renderResult();notify('completed');say('Experiment complete. No provider calls, saved-plan changes, or approvals.');
      if(scrollToProof)$('judge-proof-title').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    }catch(error){notify('failed');say(`${error.message} The previous result is still displayed; no new experiment completed.`);}finally{busy=false;$('judge-case').disabled=false;controls.forEach(control=>control.disabled=false);$('judge-tight-budget').disabled=!current.snapshot.memo.slate.feasible;notify();}
  }
  $('judge-form').onsubmit=event=>{event.preventDefault();void experiment();};$('judge-reset').onclick=()=>{reset();say('Published baseline restored.');};
  $('judge-workspace').addEventListener('click',event=>{
    const link=event.target.closest('[data-receipt-index]');
    if(!link)return;
    const detail=$('judge-receipts').children[Number(link.dataset.receiptIndex)];
    if(!detail)return;
    detail.open=true;
    detail.querySelector('summary')?.focus({preventScroll:true});
    detail.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  });
  $('judge-tight-budget').onclick=()=>{if(busy||!current)return;reset();$('judge-budget').value=Math.floor(current.snapshot.memo.slate.totalFee*.9);void experiment(true);};
  $('judge-qloo-compare').onclick=()=>{if(busy||!current)return;reset();$('judge-qloo-off').checked=true;void experiment(true);};
  $('judge-qloo-preview').addEventListener('click',event=>{if(event.target.closest('[data-preview-compare]'))$('judge-qloo-compare').click();});
  $('judge-rank-challenge').onclick=()=>{reset();const id=current.snapshot.memo.items.flatMap(i=>i.evidenceReceipts.rank??[]).find(id=>current.snapshot.receipts.some(r=>r.id===id));if(!id){say('No linked rank receipt is available in this case.');return;}$('judge-withdraw').value=id;void experiment();};
  $('judge-cancellation').onclick=()=>{reset();const id=current.snapshot.memo.slate.selectedIds[0];if(!id){say('The baseline has no feasible selected artist to cancel.');return;}$('judge-cancel').value=id;void experiment();};
  $('judge-export').onclick=()=>{if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`houselights-judge-${current.id}.json`;link.click();URL.revokeObjectURL(url);};
  $('judge-case').onchange=()=>void load($('judge-case').value);
  request('/api/judge/cases').then(({cases})=>{
    $('judge-live-count').textContent=`${cases.filter(c=>!c.synthetic).length} saved live-Qloo cases · ${cases.filter(c=>c.recordedTrace).length} complete recorded run${cases.filter(c=>c.recordedTrace).length===1?'':'s'} · ${cases.filter(c=>c.synthetic).length} synthetic cases`;
    $('judge-case').innerHTML=cases.map(c=>`<option value="${e(c.id)}">${e(c.title)}${c.synthetic?' · Synthetic':''}</option>`).join('');
    if(!cases.length){say('No public cases have been prepared on this server yet.');return;}
    const id=location.hash.slice(1),guided=cases.find(c=>c.id==='8be4d03ef4792ca9f1466983')??cases.find(c=>c.recordedTrace)??cases.find(c=>c.city?.toLowerCase()==='new york');
    $('judge-case').value=cases.some(c=>c.id===id)?id:(guided??cases[0]).id;void load($('judge-case').value);
  }).catch(error=>say(error.message));
  request('/api/evidence/reviews').then(report=>$('judge-review-count').textContent=`${report.completedReviewers} independent reviews recorded`).catch(()=>$('judge-review-count').textContent='Review status unavailable');
  fetch('/shocks-summary.json').then(response=>response.json()).then(data=>{
    const solvable=data.breakdown.solvable,unsolvable=data.breakdown.unsolvable;
    $('judge-shock-teaser').innerHTML=`<strong>${e(solvable.violationResponses)}/${e(solvable.returnedResponses)}</strong><span>re-prompted LLM responses violated a hard constraint on ${e(solvable.shocks)} solvable shocks; Houselights proposed 0</span><small>On ${e(unsolvable.shocks)} shocks with no feasible bill, Houselights abstained and all ${e(unsolvable.returnedResponses)} LLM responses violated, because the prompt required a bill. Those are reported separately, not as a like-for-like rate. ${e(data.breakdown.notComparable.shocks)} shocks from briefs without a comparable Qloo ranking are excluded. Zero violations follows from exact constraint enforcement; it does not prove commercial uplift.</small><a href="/evidence.html">Inspect all shocks and limitations ↗</a>`;
  }).catch(()=>$('judge-shock-teaser').textContent='Shock study unavailable; the Booking Desk remains usable.');
})();
