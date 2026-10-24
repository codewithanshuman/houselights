/* Enhances the existing public replay; no provider calls or alternative solver. */
'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let record=null,result=null,busy=false,report=null,mask=15,loading=0,draft=false;
  const groups=['rank','local','trends','comparison'];
  const labels=['Audience affinity','City relevance','Cultural momentum','Audience relationships'];
  const tools={rank:'Audience affinity',where_popular:'City context',compare_audiences:'Audience relationships',trends:'Cultural momentum',describe:'Artist identity',recommend:'Discovery',entity_tags:'Cultural vocabulary'};
  const money=value=>value==null?'Quote missing':new Intl.NumberFormat('en-GB',{style:'currency',currency:record.snapshot.memo.currency,maximumFractionDigits:2,minimumFractionDigits:0}).format(value);
  const names=ids=>ids.map(id=>record.snapshot.memo.items.find(item=>item.id===id)?.name??id).join(' + ')||'No feasible lineup';
  const receipt=id=>{const index=record.snapshot.receipts.findIndex(row=>row.id===id);return index<0?'':`<button class="judge-receipt-link" type="button" data-receipt-index="${index}">Receipt ${escape(id)}</button>`;};
  const activate=target=>{target?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});target?.focus({preventScroll:true});};
  document.querySelectorAll('.booking-path a').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();const target=$(link.getAttribute('href').slice(1));if(target){target.tabIndex=-1;activate(target);}}));
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){document.querySelectorAll('.booking-path a').forEach(link=>{if(link.getAttribute('href')==='#'+entry.target.id)link.setAttribute('aria-current','step');else link.removeAttribute('aria-current');});}},{rootMargin:'-10% 0px -55% 0px'});
  for(const id of ['booking-brief','booking-research','booking-autopilot','booking-evidence','judge-form','booking-decision'])observer.observe($(id));
  function pending(){
    draft=true;
    const budget=Number($('judge-budget').value),slider=$('booking-budget-range');
    if(slider){slider.max=String(Math.max(record.snapshot.memo.constraints.budget*1.25,budget,1));slider.value=String(budget);$('booking-budget-output').textContent=money(budget);}
    $('booking-pending').textContent='Inputs changed. Recalculate to update the decision; the last completed result remains below.';
    $('booking-decision-card').dataset.pending='true';
  }
  function brief(){
    const memo=record.snapshot.memo;
    $('booking-brief-card').innerHTML=`<div class="booking-market"><span class="booking-market-code">${escape(memo.currency)}</span><div><small>THE ROOM WE'RE PROGRAMMING</small><strong>${escape(memo.input.city)}</strong><p>For listeners of ${escape((memo.input.anchors??[]).join(', ')||'the saved audience')}</p></div></div><div class="booking-stats"><div><small>Artist budget</small><strong>${escape(money(memo.constraints.budget))}</strong></div><div><small>Bill / shortlist</small><strong>${escape(memo.constraints.slots)} / ${memo.items.length}</strong></div></div><p class="booking-note">An ordinary LLM can suggest a bill. This desk connects cultural observations to an exact feasibility check. Independent superiority has not been established.</p>`;
    const receipts=record.snapshot.receipts;
    const kindFor={rank:'rank',where_popular:'local',compare_audiences:'comparison'};
    const featured=['rank','where_popular','compare_audiences'].map(tool=>{const linked=new Set(memo.items.flatMap(item=>item.evidenceReceipts?.[kindFor[tool]]??[]));return receipts.find(row=>row.tool===tool&&linked.has(row.id))??receipts.find(row=>row.tool===tool);}).filter(Boolean);
    $('booking-research-cards').innerHTML=`<div class="booking-research-status"><span class="booking-led"></span><strong>${record.snapshot.traceMeta?.complete?'Recorded agent research':'Saved evidence collection'}</strong><span>${receipts.length} receipts · ${record.snapshot.trace?.length??0} application events · no new provider calls</span></div><div class="booking-observations">${featured.map(row=>`<article><small>${escape(tools[row.tool]??row.tool)}</small><strong>${row.tool==='rank'&&memo.items[0]?.rankCoverage?`${escape(memo.items[0].rankCoverage.returned)} / ${escape(memo.items[0].rankCoverage.requested)} ranked`:`${escape(row.evidence?.rows?.length??0)} public rows`}</strong><p>${escape(row.why??'A saved tool response; the research objective was not recorded.')}</p><span>${escape(row.status)} · ${receipt(row.id)}</span></article>`).join('')}</div>`;
    const budget=memo.constraints.budget;
    $('booking-budget-controls').innerHTML=`<div class="booking-budget-readout"><span>ARTIST BUDGET</span><output id="booking-budget-output" for="booking-budget-range">${escape(money(budget))}</output></div><label class="booking-range-label" for="booking-budget-range">Explore the fee budget</label><input id="booking-budget-range" type="range" min="0" max="${Math.max(1,Math.ceil(budget*1.25))}" step="1" value="${budget}"><div class="booking-presets" aria-label="Budget presets">${(memo.slate.feasible?[100,90,80,70]:[125,110,100,90]).map(value=>`<button type="button" data-booking-budget="${value}">${value}%</button>`).join('')}</div>`;
    $('booking-budget-range').addEventListener('input',event=>{$('judge-budget').value=event.target.value;pending();});
    $('booking-cancel-cards').innerHTML=`<p class="booking-control-title">What if an artist drops out?</p>${memo.slate.selectedIds.map(id=>`<button class="booking-cancel" type="button" data-booking-cancel="${escape(id)}"><span><small>CANCEL & REBUILD</small><strong>${escape(names([id]))}</strong></span><span aria-hidden="true">↗</span></button>`).join('')||'<p>No selected artist is available to cancel.</p>'}`;
    $('booking-pending').textContent='Adjust inputs, then recalculate. Existing source evidence stays fixed.';
  }
  async function loadSignals(){
    const id=record.id,sequence=++loading;report=null;mask=15;
    $('booking-signal-lab').textContent='Loading the locked signal combinations…';
    try{
      const response=await fetch('/api/experiments/public/'+encodeURIComponent(id),{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error();const body=await response.json();
      if(sequence!==loading||record?.id!==id)return;
      report=body.report;renderSignals();
    }catch{if(sequence===loading&&record?.id===id)$('booking-signal-lab').innerHTML='<p class="booking-note">The signal comparison could not load. The booking simulator and saved receipts remain available.</p><button type="button" class="button subtle" data-booking-retry>Retry signal comparison</button>';}
  }
  async function loadIndependentStudy(){
    const id=record.id;
    $('booking-independent-study').textContent='';
    if(id!=='8be4d03ef4792ca9f1466983')return;
    try{
      const response=await fetch('/recorded-control-study.json',{signal:AbortSignal.timeout(15000)});
      if(!response.ok)return;const study=await response.json();
      if(record?.id!==id||study.sourceCaseId!==id)return;
      const first=study.trials.find(row=>row.index===study.reviewTrial),valid=study.trials.filter(row=>row.available);
      $('booking-independent-study').innerHTML=`<div class="booking-independent-heading"><div><p class="judge-section-label">A SEPARATE, LATER CONTROL STUDY</p><h3>What did a tool-free LLM choose?</h3></div><span>${study.attemptedTrials} / ${study.plannedTrials} declared attempts retained</span></div><p>Collected after the original research, under a protocol locked before these model calls. The model received the same artist pool, illustrative terms and booking constraints, with no Qloo scores, receipts or tools. This does not replace the original run's missing contemporaneous control.</p><div class="booking-lab-grid"><div class="booking-lab-choice"><small>HOUSELIGHTS · SAVED EVIDENCE + EXACT SOLVER</small><h3>${escape(names(study.houselights.selectedIds))}</h3><span>${study.houselights.feasible?'Meets constraints':'Infeasible'} · ${escape(money(study.houselights.plannedFees))}</span></div><div class="booking-lab-choice booking-lab-active"><small>PREDECLARED FIRST LLM TRIAL</small><h3>${escape(first?.available?names(first.selectedIds):'No valid selection returned')}</h3><span>${first?.available?`${first.feasible?'Meets constraints':'Fails constraints'} · ${escape(money(first.plannedFees))}`:escape(first?.status??'Not attempted')}</span></div></div><p class="booking-note">${first?.available&&first.plannedFees<study.houselights.plannedFees?`The LLM selection is ${escape(money(study.houselights.plannedFees-first.plannedFees))} cheaper. Cultural policy points cannot establish whether the additional artist spend is worthwhile.`:'Different selections do not establish a superior booking decision.'} ${valid.length} valid returned selections; ${new Set(valid.map(row=>[...row.selectedIds].sort().join('|'))).size} distinct lineup(s). No genuine reviewer judgments or ticket outcomes.</p><details><summary>Inspect every trial and its collection provenance</summary><div class="table-scroll"><table class="gm-table"><thead><tr><th>Trial</th><th>Selection</th><th>Feasibility</th><th>Fees</th></tr></thead><tbody>${study.trials.map(row=>`<tr><td>${row.index}${row.index===study.reviewTrial?' · primary':''}</td><td>${escape(row.available?names(row.selectedIds):'No selection')}</td><td>${escape(row.status)}</td><td>${escape(money(row.plannedFees))}</td></tr>`).join('')}</tbody></table></div><p class="booking-note">Declared ${escape(study.declaredAt)} · ${escape(first?.generation?.provider??'Provider unavailable')} / ${escape(first?.generation?.model??'Model unavailable')}. Application request/response hashes are not provider signatures. Raw full provider payloads are not part of this public artifact.</p><pre>${escape(JSON.stringify({protocolDigest:study.protocolDigest,briefDigest:study.briefDigest,publicSnapshotDigest:study.publicSnapshotDigest,trials:study.trials.map(row=>({index:row.index,generation:row.generation}))},null,2))}</pre><p class="booking-note">${study.limitations.map(escape).join(' ')}</p></details>`;
    }catch{if(record?.id===id)$('booking-independent-study').textContent='The separate later control study is unavailable; original saved evidence and the simulator remain usable.';}
  }
  function renderSignals(){
    if(!report)return;
    const row=report.ablations.coalitions.find(row=>row.mask===mask),full=report.methods.full_houselights;
    const removed=full.selectedIds.filter(id=>!row.selectedIds.includes(id)),added=row.selectedIds.filter(id=>!full.selectedIds.includes(id));
    const relevant=[...new Set(row.difference.relevantReceipts.map(row=>row.receiptId))];
    const contributions=report.contributions;
    $('booking-signal-lab').innerHTML=`<div class="booking-signal-switches" role="group" aria-label="Cultural signals in the original brief">${groups.map((group,index)=>`<button type="button" aria-pressed="${!!(mask&(1<<index))}" data-booking-signal="${index}"><span>${mask&(1<<index)?'ON':'OFF'}</span>${labels[index]}</button>`).join('')}</div><div class="booking-lab-grid"><div class="booking-lab-choice"><small>ALL SAVED CULTURAL SIGNALS</small><h3>${escape(names(full.selectedIds))}</h3><span>${full.feasible?'Meets constraints':'Explicitly infeasible'} · ${escape(money(full.totalFee))}</span></div><div class="booking-lab-choice booking-lab-active"><small>${mask===0?'ALL CULTURAL EVIDENCE WITHDRAWN':mask===15?'ALL SIGNALS RETAINED':`${row.enabled.length} OF 4 SIGNAL GROUPS RETAINED`}</small><h3>${escape(names(row.selectedIds))}</h3><span>${row.feasible?'Meets constraints':'Explicitly infeasible'} · ${escape(money(row.totalFee))}</span></div></div><div class="booking-lineup-diff">${removed.map(id=>`<span class="booking-out">− ${escape(names([id]))}</span>`).join('')}${added.map(id=>`<span class="booking-in">+ ${escape(names([id]))}</span>`).join('')}${!removed.length&&!added.length?'<span>Same selected artists. Evidence can change without changing the bill.</span>':''}</div><div class="booking-signal-explanation"><strong>How cultural signals influence this policy</strong><p>${escape(row.difference.interpretation)}</p>${contributions.status==='computed'?`<div class="booking-contributions">${contributions.groups.map(group=>`<div><span>${labels[groups.indexOf(group.group)]}</span><strong>${escape(group.contribution.toFixed(2))}</strong><small>policy attribution points</small></div>`).join('')}</div><p>Exact four-group attribution on the optimizer's own objective. This explains model behavior, not measured audience preference.</p>`:`<p>${escape(contributions.reason??'Attribution is unavailable.')}</p>`}<p>${relevant.length?'Associated observations: '+relevant.slice(0,6).map(receipt).join(' · '):'No receipt is claimed to cause a selection change for this setting.'}</p></div><p class="booking-note">Original saved budget, pool, fees and policy remain identical in this lab. Simulator changes below are a separate experiment. Signals are cultural affinity, not ticket demand. ${!record.methods?.llm?.comparable?'The original run has no contemporaneous matched LLM control. The separate later study below is a new replication.':''}</p>`;
  }
  function decision(){
    if(!result)return;const memo=result.snapshot.memo,slate=memo.slate,original=record.snapshot.memo.slate;
    const changed=JSON.stringify([...slate.selectedIds].sort())!==JSON.stringify([...original.selectedIds].sort());
    const fee=slate.totalFee,headroom=fee==null?null:memo.constraints.budget-fee;
    $('booking-decision-card').dataset.pending=String(draft);
    $('booking-decision-card').innerHTML=`<div class="booking-decision-top"><span class="booking-verdict ${slate.feasible?'':'booking-infeasible'}">${slate.feasible?'FEASIBLE PLANNING OPTION':'NO FEASIBLE BOOKING'}</span><span>${busy?'Checking…':'Last completed calculation'}</span></div><div class="booking-selected">${slate.selectedIds.map(id=>{const item=memo.items.find(item=>item.id===id);return `<article><span class="booking-artist-initial">${escape(item.name.slice(0,1))}</span><div><strong>${escape(item.name)}</strong><small>${escape(item.terms.genre||'Genre unknown')} · ${original.selectedIds.includes(id)?'Original selection':'Added to the bill'}</small></div><strong>${escape(money(item.terms.fee))}</strong></article>`;}).join('')||`<p class="booking-empty">${escape(slate.reasons?.[0]??'These constraints cannot all be met.')} Keep this explicit result or revise the brief; the solver will not silently relax it.</p>`}</div><div class="booking-decision-metrics"><div><small>Planned artist fees</small><strong>${escape(slate.feasible?money(fee):'No selection')}</strong></div><div><small>Unallocated fee budget</small><strong>${escape(slate.feasible?money(headroom):'Not applicable')}</strong></div><div><small>Feasible / evaluated</small><strong>${slate.feasibleCount} / ${slate.checkedCount}</strong></div></div><p class="booking-decision-change">${!slate.feasible?'No lineup meets this experiment.':changed?'The bill changed under this experiment.':'The original bill survives this experiment.'} ${slate.feasible?'All declared hard constraints pass.':'No lineup is proposed.'} Evidence state: ${escape(result.proof.status)}.</p>${slate.alternatives?.some(row=>row.feasible)?`<details class="booking-alternatives"><summary>Consider feasible swaps</summary>${slate.alternatives.filter(row=>row.feasible).slice(0,3).map(row=>`<article><strong>${escape(names(row.selectedIds))}</strong><span>${escape(money(row.totalFee))} fees · ${escape(row.scoreDelta)} policy-point change</span><p>${escape(row.reason)}</p></article>`).join('')}<p>These swaps satisfy this experiment's constraints. Policy points are an internal preference objective, not commercial value.</p></details>`:''}<div class="booking-report-actions"><button class="button subtle" type="button" data-booking-report>Download promoter brief</button><span>Illustrative terms · not commercial approval</span></div>`;
    $('booking-pending').textContent=busy?'Checking the same evidence against your changed inputs…':draft?'Inputs changed or the replay failed. The last completed decision is still displayed; recalculate to apply these inputs.':'The decision below reflects the last completed calculation.';
    $('booking-budget-output').textContent=money(Number($('judge-budget').value));
    $('booking-budget-range').value=$('judge-budget').value;
    document.querySelectorAll('[data-booking-cancel], [data-booking-budget], #booking-budget-range').forEach(button=>button.disabled=busy);
    $('judge-form').setAttribute('aria-busy',String(busy));
  }
  function downloadBrief(){
    const memo=result.snapshot.memo,slate=memo.slate;
    const text=`HOUSELIGHTS / PROMOTER DECISION BRIEF\n${draft?'UNAPPLIED INPUTS: this export describes the last completed calculation only.\n':''}\nCity: ${memo.input.city}\nSource case: ${record.id}\nMode: saved research, deterministic replay; no new provider calls\n\nLineup: ${names(slate.selectedIds)}\nFeasible: ${slate.feasible}\nArtist fees: ${slate.feasible?money(slate.totalFee):'No feasible selection'}\nArtist budget: ${money(memo.constraints.budget)}\nSlots: ${memo.constraints.slots}; genre cap: ${memo.constraints.maxPerGenre}\nLocked: ${memo.constraints.lockedIds.length?names(memo.constraints.lockedIds):'None'}\nExcluded: ${memo.constraints.excludedIds.length?names(memo.constraints.excludedIds):'None'}\nEvidence: ${result.proof.status}\nEvidence withdrawal: ${result.qlooOff===true?'all Qloo evidence off':'all-off not selected; inspect JSON for individual withdrawals'}\n\n${(slate.reasons??[]).join('\n')}\n\nSaved source: ${record.snapshot.receipts.length} public receipts. Original receipt digests and exact input changes are available in the JSON experiment export.\n${result.proof.findings.map(row=>`${row.severity}: ${row.assumption} ${row.correction}`).join('\n')}\n\nIllustrative booking terms. No capacity, attendance, ticket-sales uplift or professional endorsement is inferred. Computational feasibility is not commercial approval.\n${!record.methods?.llm?.comparable?'No matched saved first-trial LLM-only control was captured with the original run. A separate later replication is available at /recorded-control-study.json.':''}\n`;
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`houselights-promoter-${record.id}.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  document.addEventListener('booking:state',event=>{
    const next=event.detail.current;busy=event.detail.busy;result=event.detail.result;
    if(['reset','completed'].includes(event.detail.phase))draft=false;
    if(['calculating','failed'].includes(event.detail.phase))draft=true;
    if(!next){record=null;report=null;++loading;return;}
    if(record?.id!==next.id){record=next;brief();void loadSignals();void loadIndependentStudy();}
    decision();
  });
  $('judge-budget').addEventListener('input',()=>record&&pending());
  $('judge-form').addEventListener('change',()=>record&&pending());
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-booking-budget],[data-booking-cancel],[data-booking-signal],[data-booking-retry],[data-booking-report]');
    if(!button||!record)return;
    if(button.hasAttribute('data-booking-signal')){const index=Number(button.dataset.bookingSignal);mask^=1<<index;renderSignals();$('booking-signal-lab').querySelector(`[data-booking-signal="${index}"]`).focus({preventScroll:true});return;}
    if(button.hasAttribute('data-booking-retry')){void loadSignals();return;}
    if(button.hasAttribute('data-booking-report')){if(result)downloadBrief();return;}
    if(busy)return;
    if(button.hasAttribute('data-booking-budget')){$('judge-budget').value=String(Math.round(record.snapshot.memo.constraints.budget*Number(button.dataset.bookingBudget))/100);pending();}
    // Keep the edited budget, locks and exclusions: a cancellation is an extra
    // shock on the current experiment, not a reset to the published brief.
    if(button.hasAttribute('data-booking-cancel')){const id=button.dataset.bookingCancel;const lock=document.querySelector(`[data-judge-lock="${CSS.escape(id)}"]`);if(lock)lock.checked=false;$('judge-cancel').value=id;$('judge-form').requestSubmit();}
  });
  document.dispatchEvent(new Event('booking:ready'));
})();
