/* Shared Autopilot result views for the Booking Desk and the organizer workspace.
   Pure rendering: every value comes from the run; provenance banners are supplied by the caller. */
'use strict';
(()=>{
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tierLabel={ranking:'Ranking',material:'Decision-material',robustness:'Robustness check',justification:'Booking justification',fallback:'Fallback evidence',deferred:'Needs more calls',immaterial:'Not worth a call',blocked:'Not answerable',done:'Answered'};
  const stopLabel={sufficient:'Evidence sufficient',exhausted:'All relevant questions attempted',budget_exhausted:'Research budget spent',round_limit:'Round limit',provider_unavailable:'Provider unavailable',planning_only:'Planning only — no calls',not_needed:'No follow-up needed',interrupted:'Interrupted'};
  const feeStatus={quoted:'Quoted',estimate:'Estimate',illustrative:'Illustrative',entered:'Buyer-entered',unknown:'Unknown'};
  const availability={confirmed:'Confirmed',assumed:'Assumed',unconfirmed:'Not confirmed',unavailable:'Unavailable',illustrative:'Illustrative'};
  const actionType={approval:'Needs your approval',confirm:'Confirm with agent',recommendation:'Recommendation'};
  const OPEN=['ranking','material','robustness','justification','fallback'];

  function create(run,options){
    const {kind,money,receiptLink=id=>`<span class="autopilot-receipt-ref">${e(id)}</span>`,actionsHtml='',scope='autopilot'}=options;
    const nameOf=id=>run.items?.find(item=>item.id===id)?.name??id;
    const names=ids=>ids?.length?ids.map(nameOf).join(' + '):'No feasible lineup';
    const timed=!['planning'].includes(kind);
    const receiptDetail=id=>{const receipt=run.receipts.find(row=>row.id===id);if(!receipt)return '';
      return `<details class="autopilot-receipt" id="${scope}-receipt-${e(id)}"><summary>Receipt ${e(id)} · ${e(receipt.tool)} · ${e(receipt.status)}${receipt.cached?' · cached':''}</summary><pre>${e(JSON.stringify(receipt,null,2))}</pre></details>`;};
    const ref=id=>run.receipts.some(row=>row.id===id)?`<button type="button" class="judge-receipt-link" data-autopilot-receipt="${e(id)}" data-autopilot-scope="${e(scope)}">Receipt ${e(id)}</button>`:receiptLink(id);
    function pipeline(){
      const actions=run.events.filter(row=>row.type==='action').length,critical=run.stress.vulnerabilities.filter(row=>row.severity==='critical').length;
      const queued=run.questions.filter(row=>OPEN.includes(row.tier)).length;
      const stages=[['Brief',`${run.items.length} artists · ${money(run.constraints.budget)}`],['Research',kind==='planning'?`${queued} queued, not run`:`${actions} actions · ${run.budget.used}/${run.budget.maxCalls} calls`],
        ['Strategies',run.strategies.status==='feasible'?`${run.strategies.list.length} feasible`:'None feasible'],['Stress test',`${run.strategies.scenarios?.length??0} common scenarios · ${critical} critical`],['Decision packet',`${run.packet.actions?.length??0} next actions`]];
      return `<ol class="autopilot-pipeline">${stages.map(([label,detail],index)=>`<li><span>${String(index+1).padStart(2,'0')}</span><strong>${e(label)}</strong><small>${e(detail)}</small></li>`).join('')}</ol>${run.status==='partial'?'<p class="autopilot-banner autopilot-banner-warning"><strong>PARTIAL RUN</strong><span>Research stopped early (provider failure or interruption). Results below use only the evidence returned before stopping.</span></p>':''}`;
    }
    function timeline(){
      const events=run.events,rows=[],stamp=event=>timed?`<small class="autopilot-time">+${e((event.at/1000).toFixed(1))}s</small>`:'';
      for(let index=0;index<events.length;index++){
        const event=events[index];
        if(event.type==='frame')rows.push(`<li class="autopilot-event"><span class="autopilot-chip">Brief</span><p>${e(event.text)}</p>${stamp(event)}</li>`);
        else if(event.type==='questions')rows.push(`<li class="autopilot-event"><span class="autopilot-chip">Gaps found</span><p>${e(event.text)}</p>${stamp(event)}</li>`);
        else if(event.type==='action'){
          const observation=events.slice(index+1).find(row=>['observation','failure'].includes(row.type)&&row.round===event.round),after=events.slice(index+1).find(row=>row.type==='reevaluate'&&row.round===event.round);
          rows.push(`<li class="autopilot-event autopilot-action ${after?.changed?'autopilot-changed':''}"><span class="autopilot-chip autopilot-tier-${e(event.tier)}">${e(tierLabel[event.tier]??event.tier)}${event.joint?' · joint':''}</span><div><strong>${e(event.text)}</strong><p class="autopilot-why">Why: ${e(event.why)}</p>${observation?`<p class="autopilot-observed ${observation.type==='failure'?'autopilot-failed':''}"><span>${e(event.tool)}</span> ${e(observation.text)}</p>${observation.receiptId?receiptDetail(observation.receiptId):''}`:''}${after?`<p class="autopilot-after">${e(after.text)}</p>`:''}</div>${stamp(event)}</li>`);
        }else if(event.type==='stop')rows.push(`<li class="autopilot-event autopilot-stop"><span class="autopilot-chip">${e(stopLabel[event.reason]??event.reason)}</span><p>${e(event.text)}</p>${stamp(event)}</li>`);
        else if(['strategies','stress','followup','packet'].includes(event.type)||(event.type==='reevaluate'&&event.round==null))rows.push(`<li class="autopilot-event"><span class="autopilot-chip">${e({strategies:'Strategies',stress:'Stress test',followup:'Stress follow-up',packet:'Packet',reevaluate:'Re-evaluated'}[event.type])}</span><p>${e(event.text)}</p>${stamp(event)}</li>`);
      }
      const queued=kind==='planning'?run.questions.filter(row=>OPEN.includes(row.tier)):[];
      const skipped=run.questions.filter(row=>['immaterial','blocked','deferred'].includes(row.tier));
      return `<ol class="autopilot-timeline">${rows.join('')}</ol>${queued.length?`<div class="autopilot-queue"><h4>Research the agent would run next</h4><ol>${queued.slice(0,8).map(row=>`<li><span class="autopilot-chip autopilot-tier-${e(row.tier)}">${e(tierLabel[row.tier])}${row.joint?' · joint':''}</span><strong>${e(row.question)}</strong><p>${e(row.why)}</p></li>`).join('')}</ol></div>`:''}${skipped.length?`<details class="autopilot-skipped"><summary>Questions the agent chose not to research (${skipped.length})</summary><ul>${skipped.map(row=>`<li><strong>${e(row.question)}</strong> <span class="autopilot-chip autopilot-tier-${e(row.tier)}">${e(tierLabel[row.tier])}</span><p>${e(row.why)}</p></li>`).join('')}</ul></details>`:''}`;
    }
    function strategies(){
      const s=run.strategies;
      if(s.status!=='feasible')return `<div class="autopilot-infeasible"><strong>No feasible strategy.</strong><p>${e((s.reasons??[]).join(' '))}</p></div>`;
      const total=s.list[0]?.robustness?.total??0;
      return `<div class="table-scroll"><table class="autopilot-compare"><caption>Every strategy is checked against the same ${e(total)} disruption scenarios and the same constraints.</caption><thead><tr><th scope="col">Strategy</th><th scope="col">Bill</th><th scope="col">Fees</th><th scope="col">vs recommended</th><th scope="col">Plan continues</th><th scope="col">Unchanged</th></tr></thead><tbody>${s.list.map((row,index)=>`<tr class="${index===0?'autopilot-recommended-row':''}"><th scope="row">${index===0?'<span class="autopilot-chip autopilot-tier-material">Recommended</span> ':''}${e(row.label)}</th><td>${e(names(row.selectedIds))}</td><td>${e(money(row.totalFee))}</td><td>${index?e(`${row.feeDelta>=0?'+':'−'}${money(Math.abs(row.feeDelta))}, −${row.scoreGap} pts`):'—'}</td><td>${e(row.robustness?.continued)}/${e(row.robustness?.total)}</td><td>${e(row.robustness?.held)}</td></tr>`).join('')}</tbody></table></div>
        <div class="autopilot-strategies">${s.list.map((row,index)=>`<article class="${index===0?'autopilot-recommended':''}"><small>${index===0?'RECOMMENDED · ':''}${e(row.label.toUpperCase())}</small><h4>${e(names(row.selectedIds))}</h4><p>${e(row.rationale)}</p>${row.preferWhen?`<p class="autopilot-prefer">${e(row.preferWhen)}</p>`:''}<span class="autopilot-evidence">${row.evidence.map(member=>`${e(member.name)}: ${e(member.kinds.join(', ')||'no evidence')}`).join(' · ')}</span></article>`).join('')}</div>
        ${s.robustNote?`<p class="autopilot-note">${e(s.robustNote)}</p>`:''}<details class="autopilot-definition"><summary>How robustness is measured</summary><p>${e(s.robustnessDefinition?.scenarios)} ${e(s.robustnessDefinition?.outcomes)} ${e(s.robustnessDefinition?.ranking)} ${e(s.robustnessDefinition?.scope)}</p></details>
        ${s.backups?.length?`<h4>Backups if an act drops out</h4><ul class="autopilot-breakpoints">${s.backups.map(row=>`<li><strong>${e(nameOf(row.artistId))}:</strong> ${row.options.length?row.options.map((option,index)=>`${index+1}) ${e(names(option.replacementIds))} → ${e(names(option.selectedIds))} (${e(money(option.totalFee))})`).join('; '):'no feasible replacement keeps the other acts'}</li>`).join('')}</ul>`:''}
        <p class="autopilot-note">Policy points are the optimizer's declared objective, not ticket demand.</p>`;
    }
    function stress(){
      const rows=run.stress.vulnerabilities,breaks=run.stress.breakpoints??[];
      return `<p class="autopilot-summary">${e(run.stress.summary)}</p><ul class="autopilot-vulnerabilities">${rows.map(row=>`<li class="autopilot-severity-${e(row.severity)}"><span>${e(row.severity)}</span><p>${e(row.text)}</p></li>`).join('')||'<li><p>No vulnerability changed the recommendation.</p></li>'}</ul>${breaks.length?`<h4>Break points</h4><ul class="autopilot-breakpoints">${breaks.map(row=>`<li>${e(row.text)}</li>`).join('')}</ul>`:''}`;
    }
    function packet(){
      const p=run.packet,rec=p.recommendation,f=p.financial;
      return `<div class="autopilot-packet-head"><div><small>DECISION PACKET · ${e(options.packetLabel??kind.toUpperCase())}</small><h4>${rec?e(rec.names.join(' + ')):'No feasible booking'}</h4><p>${rec?`${e(money(rec.totalFee))} planned fees · ${e(money(rec.headroom))} unallocated · ${e(rec.policyScore)} policy points`:e(p.infeasibility?.reasons?.join(' '))}</p>${rec?.provisional?`<p class="autopilot-provisional"><strong>${p.comparability?.comparable===false?'Not comparable':'Provisional'}:</strong> ${e(rec.provisionalReason)}</p>`:''}${(p.ties?.groups??[]).map(group=>`<p class="${group.changesBill?'autopilot-provisional':'autopilot-note'}"><strong>${group.changesBill?'Near-tie decides the bill':'Near-tie'}:</strong> ${e(group.names.join(', '))} differ by ${e(group.spread.toFixed(4))} in Qloo affinity${group.changesBill?`; treated as tied the bill would be ${e(group.tiedNames.join(' + '))}`:', with no effect on the bill'}.</p>`).join('')}${p.ordinalComparison?`<p class="autopilot-provisional"><strong>Affinity versus ordinal:</strong> ${e(p.ordinalComparison.text)}</p>`:''}${p.fitBasis?`<p class="autopilot-note">Fit basis: ${p.fitBasis==='qloo-affinity'?'Qloo affinity scores':'ordinal rank positions (affinity scores unavailable)'}.</p>`:''}<p class="autopilot-approval">A recommendation for your approval. Nothing has been booked, offered or sent.</p></div><div class="autopilot-packet-actions">${actionsHtml}</div></div>
        <p class="autopilot-verdict"><strong>Did research change the decision?</strong> ${e(p.research.verdict)}</p>
        ${rec?`<div class="autopilot-justification">${rec.artists.map(artist=>`<article><strong>${e(artist.name)}</strong><small>${e(money(artist.fee))} · fee ${e(feeStatus[artist.feeStatus]??artist.feeStatus)} · availability ${e(availability[artist.availability]??artist.availability)}${artist.genre?` · ${e(artist.genre)}`:''}</small><ul>${artist.claims.map(claim=>`<li>${e(claim.text)} ${claim.receipts.map(receipt=>ref(receipt.id)).join(' ')}</li>`).join('')}</ul></article>`).join('')}</div>`:''}
        <h4>Next actions</h4><ol class="autopilot-steps">${(p.actions??[]).map(row=>`<li><span class="autopilot-chip autopilot-action-${e(row.type)}">${e(actionType[row.type]??row.type)}</span> ${e(row.text)}</li>`).join('')}</ol>
        ${p.confirmations?.length?`<h4>Fees and availability to confirm</h4><ul class="autopilot-gaps">${p.confirmations.map(row=>`<li>${e(row)}</li>`).join('')}</ul>`:''}
        <h4>Budget sensitivity</h4><ul class="autopilot-breakpoints">${f.plannedFees!=null?`<li>Planned artist fees ${e(money(f.plannedFees))} of ${e(money(f.artistBudget))}; ${e(money(f.headroom))} unallocated.</li>`:''}${f.commercial?`<li>On your commercial assumptions (unverified): break-even at ${e(f.commercial.breakEvenTickets??'—')} paid tickets${f.commercial.breakEvenShare!=null?` (${e(f.commercial.breakEvenShare)}% of the assumed capacity)`:''}, including ${e(money(f.commercial.otherCosts))} other costs. Arithmetic on assumptions, not a sales forecast.</li>`:''}</ul>
        <details><summary>Evidence: measured vs missing (${p.evidenceMatrix?.length??0} artists)</summary><div class="table-scroll"><table class="autopilot-compare"><thead><tr><th scope="col">Artist</th><th scope="col">Role</th><th scope="col">Rank</th><th scope="col">Local</th><th scope="col">Audience comparison</th><th scope="col">Trend</th></tr></thead><tbody>${(p.evidenceMatrix??[]).map(row=>`<tr><th scope="row">${e(row.name)}</th><td>${e(row.role)}</td>${['rank','local','comparison','trends'].map(kindName=>`<td class="${row.cells[kindName].label.startsWith('Measured')?'autopilot-measured':'autopilot-missing'}">${e(row.cells[kindName].label)} ${row.cells[kindName].receipts.map(ref).join(' ')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
        <details><summary>Remaining uncertainties (${p.evidenceGaps.length})</summary><ul class="autopilot-gaps">${p.evidenceGaps.map(row=>`<li><strong>${e(row.question)}</strong> <em>${e(row.status)}</em><p>${e(row.why)}</p></li>`).join('')}</ul></details>
        <details><summary>Assumptions, limits and integrity</summary><ul>${p.assumptions.map(row=>`<li>${e(row)}</li>`).join('')}</ul><p>${e(p.limits)}</p>${p.integrity?`<p class="autopilot-note">Integrity manifest <code>${e(p.integrity.manifestDigest)}</code>. ${e(p.integrity.statement)}</p>`:''}</details>`;
    }
    return `${pipeline()}<div class="autopilot-grid"><section aria-label="How the agent investigated"><h3>How the agent investigated</h3>${timeline()}</section><section aria-label="Strategies and stress test"><h3>Feasible strategies</h3>${strategies()}<h3>Stress test</h3>${stress()}</section></div><section class="autopilot-packet" aria-label="Decision packet">${packet()}</section>`;
  }
  function openReceipt(button){
    const detail=document.getElementById(`${button.dataset.autopilotScope??'autopilot'}-receipt-${button.dataset.autopilotReceipt}`);
    if(!detail)return false;
    detail.open=true;detail.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});detail.querySelector('summary')?.focus({preventScroll:true});return true;
  }
  function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type})),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  window.HouselightsAutopilotView={render:create,openReceipt,download,escape:e};
})();
