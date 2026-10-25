const $ = id => document.getElementById(id);
const labels = { rank: 'Audience affinity', local: 'Geographic affinity', trends: 'Cultural trends', comparison: 'Cross-artist affinity' };
const descriptions = { rank: 'Artist relevance to the audience', local: 'City and area observations', trends: 'Recorded momentum', comparison: 'Relationships between artists' };
const methods = [ ['llm_only','A','LLM only'], ['constraint_only','B','Constraint only'], ['qloo_ablated','C','Qloo withdrawn'], ['full_houselights','D','Full Houselights'] ];
let current = null, selectedMask = 15, caseRequest = 0;
const text = (node, value) => { node.textContent = String(value ?? '—'); return node; };
const el = (tag, className, value) => { const node = document.createElement(tag); if (className) node.className = className; if (value != null) text(node,value); return node; };
const clear = node => node.replaceChildren();
const artistNames = ids => ids.map(id => current?.recordNames?.[id] ?? id);
const money = (value, currency) => value == null ? '—' : window.HL ? window.HL.money(value, currency ?? 'GBP') : new Intl.NumberFormat('en-US', { style:'currency', currency: currency ?? 'GBP', maximumFractionDigits:0 }).format(value);
const percent = value => value == null ? '—' : `${Math.round(value * 100)}%`;
function tile(label, value, note) { const node=el('div','tile'); node.append(el('small','',label),el('strong','',value)); if(note)node.append(el('small','',note)); return node; }
function renderHeadlineComparison() {
  const r=current.report, full=r.methods.full_houselights, without=r.methods.qloo_ablated, difference=r.decisionDifference;
  text($('without-lineup'),without.selectedIds.length?artistNames(without.selectedIds).join(' + '):'No feasible bill');
  text($('with-lineup'),full.selectedIds.length?artistNames(full.selectedIds).join(' + '):'No feasible bill');
  text($('without-feasibility'),`${without.feasible?'Meets':'Does not meet'} booking constraints · ${money(without.totalFee,r.brief.currency)} in planned fees`);
  text($('with-feasibility'),`${full.feasible?'Meets':'Does not meet'} booking constraints · ${money(full.totalFee,r.brief.currency)} in planned fees`);
  const removed=artistNames(difference.removedIds),added=artistNames(difference.addedIds);
  text($('headline-change'),difference.changed?`Selection changed: ${removed.join(', ')||'none'} out; ${added.join(', ')||'none'} in.`:
    'The selected artists did not change when Qloo evidence was withdrawn.');
  const singleGroups=r.config.groups.filter((group,index)=>r.ablations.coalitions.find(row=>row.mask===(15^(1<<index)))?.difference.changed);
  const receiptIds=[...new Set(difference.relevantReceipts.map(row=>row.receiptId))];
  const signalNote=difference.changed?(singleGroups.length?`Removing ${singleGroups.map(group=>labels[group]).join(', ')} individually also changes the selection.`:
    'No single signal withdrawal changed the selection alone; combined withdrawal did.'):
    `Evidence confidence changed from ${difference.counterfactualConfidence} without Qloo to ${difference.fullConfidence} with Qloo.`;
  text($('headline-evidence'),`${signalNote} ${receiptIds.length?`Associated saved receipts: ${receiptIds.slice(0,3).join(', ')}${receiptIds.length>3?` and ${receiptIds.length-3} more`:''}.`:
    'No receipt is claimed to cause a selection change in this case.'}`);
}
function renderMethods() {
  const box = $('methods'); clear(box); const r=current.report;
  for (const [id,index,title] of methods) {
    const data=r.methods[id], metric=r.metrics[id], card=el('article',`method ${id==='full_houselights'?'full':''}`);
    card.append(el('span','index',`METHOD ${index}`),el('h3','',title),el('span','state',data.status.replaceAll('_',' ')));
    card.append(el('p','lineup',data.available&&data.selectedIds.length?artistNames(data.selectedIds).join(' + '):data.reason??'No feasible bill'));
    const dl=el('dl'); for(const [label,value] of [['Operationally feasible',data.available?(data.feasible?'Yes':'No'):'Unavailable'],['Booking cost',money(data.totalFee,r.brief.currency)],['Budget used',percent(metric.budgetUtilization)],['Hard violations',metric.hardConstraintViolations],['Overlap with full',percent(metric.lineupJaccardVsFull)]]){
      const row=el('div'); row.append(el('dt','',label),el('dd','',value)); dl.append(row);
    } card.append(dl); box.append(card);
  }
}
function renderSignalControls() {
  const box=$('signal-controls'); clear(box);
  current.report.config.groups.forEach((group,index)=>{
    const label=el('label'), input=el('input'); input.type='checkbox'; input.checked=!!(selectedMask&(1<<index));
    input.addEventListener('change',()=>{selectedMask=input.checked?selectedMask|(1<<index):selectedMask&~(1<<index);renderSignalControls();renderSignal();});
    const copy=el('span');copy.append(el('strong','',labels[group]),el('small','',descriptions[group]));label.append(input,copy);box.append(label);
  });
}
function renderSignal() {
  const r=current.report,row=r.ablations.coalitions.find(entry=>entry.mask===selectedMask);
  text($('signal-mask'),`${row.enabled.length} OF 4 SIGNAL GROUPS RETAINED · COMBINATION ${selectedMask+1}/16`);
  text($('signal-lineup'),row.selectedIds.length?artistNames(row.selectedIds).join(' + '):'No feasible bill');
  text($('signal-note'),row.feasible?row.difference.interpretation:'The declared constraints yield no feasible bill with these signals.');
  const chips=$('signal-difference');clear(chips);
  for(const id of row.difference.removedIds)chips.append(el('span','chip remove',`− ${current.recordNames[id]??id}`));
  for(const id of row.difference.addedIds)chips.append(el('span','chip add',`+ ${current.recordNames[id]??id}`));
  if(!chips.children.length)chips.append(el('span','chip','Same selected artists'));
  renderDifference(row);
}
function renderContributions() {
  const box=$('contribution-bars');clear(box);const c=current.report.contributions;
  if(c.status!=='computed'){box.append(el('p','notice',c.reason));return;}
  const max=Math.max(1,...c.groups.map(row=>Math.abs(row.contribution)));
  for(const row of c.groups){const wrap=el('div','bar-row'),track=el('div','bar-track'),fill=el('div','bar-fill');fill.style.width=`${Math.max(2,Math.abs(row.contribution)/max*100)}%`;track.append(fill);
    wrap.append(el('span','',labels[row.group]),track,el('output','',row.contribution.toFixed(2)));box.append(wrap);}
}
function renderDifference(row){
  const r=current.report,d=row.difference,box=$('difference-body');clear(box);
  const grid=el('div','difference-grid');grid.append(tile('Artists added',d.addedIds.length?artistNames(d.addedIds).join(', '):'None'),
    tile('Artists removed',d.removedIds.length?artistNames(d.removedIds).join(', '):'None'),
    tile('Counterfactual feasible',d.counterfactualFeasible?'Yes':'No'),
    tile('Quoted-fee difference',money(d.bookingCostDifference,r.brief.currency),'Full minus selected signal setting'),
    tile('Confidence',`${d.fullConfidence??'unknown'} → ${d.counterfactualConfidence??'unknown'}`),
    tile('Weight stability',`${r.decisionDifference.weightSensitivity.changedUnderOtherProfiles}/${r.decisionDifference.weightSensitivity.availableProfiles} profiles differ`,'Full versus all-signal withdrawal'));
  box.append(grid,el('p','notice',d.interpretation));
  if(d.relevantReceipts.length){const details=el('p','micro','Relevant saved receipts: '+[...new Set(d.relevantReceipts.map(x=>x.receiptId))].join(', '));box.append(details);}
  const target=$('receipt-ablations');clear(target);const table=el('table'),head=el('thead');head.innerHTML='<tr><th>Receipt</th><th>Affected artists</th><th>Selection change</th><th>Feasible</th></tr>';table.append(head);const body=el('tbody');
  for(const a of r.ablations.receipts){const tr=el('tr');for(const value of [a.receiptId,artistNames(a.affectedIds).join(', ')||'None',a.difference.changed?'Changed':'Unchanged',a.feasible?'Yes':'No'])tr.append(el('td','mono',value));body.append(tr);}table.append(body);target.append(table);
}
function renderEvaluation(){const r=current.report,box=$('evaluation-body');clear(box);const human=r.independentEvaluation.human;
  const grid=el('div','eval-grid');grid.append(tile('Published briefs in suite',current.coverage.briefs,`${current.coverage.distinctPools} distinct pools`),
    tile('LLM control',r.methods.llm_only.status),tile('Genuine review judgments',human.submittedJudgments??0),
    tile('Held-out event outcomes',r.independentEvaluation.independentOutcomes.count));box.append(grid);
  box.append(el('p','notice',human.status==='observed'?`${human.totals.qloo} Houselights preferences · ${human.totals.control} baseline preferences · ${human.totals.tie} ties · ${human.totals.abstain} abstentions. Decisive denominator: ${human.decisiveDenominator}.`:
    'No linked independent blind judgments. Reviews have not been manufactured or counted from invitations.'));
  box.append(el('p','micro',`Candidate pool: ${r.brief.candidateCount} · ${r.brief.synthetic?'Synthetic evidence':'Saved live evidence'} · ${r.brief.illustrativeTerms?'Illustrative booking terms':'Organizer-supplied terms'}. Four-method findings are descriptive until independently validated.`));
}
function renderAudit(){const r=current.report,box=$('audit-summary');clear(box);const grid=el('div','audit-grid');grid.append(tile('Saved receipts',r.evidence.receiptIndex.length),tile('Supported observations',`${r.evidence.counts.supported}/${r.evidence.counts.observations}`),
  tile('Flagged observations',r.evidence.counts.flagged),tile('Receipt counterfactuals',`${r.ablations.receiptCoverage.tested}/${r.ablations.receiptCoverage.eligible}`));box.append(grid);
  const target=$('receipts');clear(target);const table=el('table'),head=el('thead');head.innerHTML='<tr><th>Receipt ID</th><th>Qloo tool</th><th>Source</th><th>Status</th><th>Fetched</th><th>Digest</th></tr>';table.append(head);const body=el('tbody');
  for(const row of r.evidence.receiptIndex){const tr=el('tr');for(const value of [row.id,row.tool,row.source,row.status,row.fetchedAt??'Unknown',row.digest??'Unavailable'])tr.append(el('td','mono',value));body.append(tr);}table.append(body);target.append(table);
  const limits=$('limitations');clear(limits);for(const value of r.limitations)limits.append(el('p','micro',value));
  text($('fingerprint'),`Model: ${r.version}\nInput: ${r.inputDigest}\nReport: ${r.reportDigest}\nFrozen pool: ${r.poolDigest}\nAs-of: ${r.config.evidenceAsOf}`);
}
function render(){const r=current.report;current.recordNames=Object.fromEntries((current.names??[]).map(row=>[row.id,row.name]));
  text($('case-status'),`${r.brief.city} · ${r.brief.candidateCount} candidates · ${r.brief.slots} slots · ${money(r.brief.budget,r.brief.currency)} artist budget`);
  const strip=$('status-strip');clear(strip);for(const value of [r.brief.synthetic?'SYNTHETIC EVIDENCE':'SAVED LIVE EVIDENCE',r.brief.illustrativeTerms?'ILLUSTRATIVE TERMS':'ORGANIZER TERMS',
    `${current.coverage.briefs} PUBLISHED BRIEFS`,`${current.coverage.distinctPools} DISTINCT POOLS`,`${current.review.completedReviewers??0} REVIEWERS COMPLETED`])strip.append(el('span','',value));
  text($('combination-count'),`${r.ablations.coalitions.length} / 16 combinations`);
  renderHeadlineComparison();renderMethods();renderSignalControls();renderSignal();renderContributions();renderEvaluation();renderAudit();
}
async function selectCase(id){
  const request=++caseRequest;
  text($('case-status'),current?'Loading selected brief… The previous report remains displayed.':'Loading locked report…');
  $('download').disabled=true;
  $('main').setAttribute('aria-busy','true');
  for(const input of $('signal-controls').querySelectorAll('input'))input.disabled=true;
  try{
    const response=await fetch(`/api/experiments/public/${encodeURIComponent(id)}`);
    if(!response.ok)throw new Error('Published case could not be loaded.');
    const next=await response.json();
    if(request!==caseRequest)return;
    current=next;current.coverage=window.proofCoverage;selectedMask=15;
    $('case-select').value=id;render();history.replaceState(null,'',`#${id}`);
  }catch(error){
    if(request!==caseRequest)return;
    if(current){$('case-select').value=current.caseId;text($('case-status'),`${error.message} The previous report remains displayed; its brief is selected again.`);}
    else text($('case-status'),error.message);
  }finally{
    if(request===caseRequest){
      $('download').disabled=!current;
      $('main').setAttribute('aria-busy','false');
      for(const input of $('signal-controls').querySelectorAll('input'))input.disabled=false;
    }
  }
}
async function init(){try{const response=await fetch('/api/experiments/public');if(!response.ok)throw new Error('Published case list unavailable.');const payload=await response.json();window.proofCoverage=payload.coverage;const select=$('case-select');clear(select);
    for(const item of payload.cases){const option=el('option','',`${item.title} · ${item.synthetic?'synthetic':'saved live'}`);option.value=item.id;select.append(option);}
    if(!payload.cases.length){text($('case-status'),'No published cases yet.');return;}
    const requested=location.hash.slice(1),guided=payload.cases.find(item=>item.id==='8be4d03ef4792ca9f1466983');
    const first=payload.cases.some(item=>item.id===requested)?requested:(guided??payload.cases[0]).id;select.value=first;
    select.addEventListener('change',()=>selectCase(select.value));
    await selectCase(first);
  }catch(error){text($('case-status'),error.message);}}
$('download').addEventListener('click',()=>{if(!current)return;const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download=`houselights-proof-${current.caseId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('run-private').addEventListener('click',async()=>{const status=$('private-status');text(status,'Creating locked experiment…');try{const token=$('token').value.trim(),headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`};const sourceSnapshotId=$('source-id').value.trim();if(!sourceSnapshotId)throw new Error('Enter a saved source ID.');
  let response=await fetch('/api/experiments',{method:'POST',headers,body:JSON.stringify({sourceSnapshotId,policy:$('policy').value})});let body=await response.json();if(!response.ok)throw new Error(body.error??'Creation failed.');const id=body.id;
  response=await fetch(`/api/experiments/${id}/run`,{method:'POST',headers});body=await response.json();if(!response.ok)throw new Error(body.error??'Run failed.');
  for(let attempt=0;attempt<60;attempt++){await new Promise(resolve=>setTimeout(resolve,1000));response=await fetch(`/api/experiments/${id}`,{headers});body=await response.json();if(body.status==='completed'){text(status,`Completed · ${id} · report ${body.resultDigest}. Download through /api/experiments/${id}/export with your organizer token.`);return;}if(['failed','interrupted'].includes(body.status))throw new Error(body.error??body.status);}
  text(status,`Still running · ${id}. Return to this experiment ID for the result.`);
}catch(error){text(status,error.message);}});
init();
