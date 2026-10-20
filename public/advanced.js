'use strict';
(() => {
  const e=escapeHTML;
  document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="/advanced.css">');
  let eventSequence=0, portfolio=null, batch=null, busy=false;
  document.querySelector('.sidebar nav').insertAdjacentHTML('beforeend','<button class="nav-item" data-view="portfolio"><span class="nav-icon">▦</span>Event portfolio<span class="nav-key">06</span></button><button class="nav-item" data-view="evaluation"><span class="nav-icon">≋</span>Independent evaluation<span class="nav-key">07</span></button>');
  document.querySelector('.page-footer').insertAdjacentHTML('beforebegin',`<section class="view" id="view-portfolio" aria-label="Event portfolio" hidden>
    <header class="decision-heading"><p class="eyebrow">DECIDE ACROSS THE SEASON</p><h1>One budget.<br>Every event connected.</h1><p>Jointly choose lineups from saved evidence. Respect artist reuse, rest, shared rooms and cash deadlines. No bookings or payments are made.</p></header>
    <form id="portfolio-form" class="panel"><div class="gm-fields"><label>Total portfolio budget<input id="portfolio-budget" type="number" min="0" max="1000000000" step="0.01" required></label><label>Maximum bookings per artist<input id="portfolio-reuse" type="number" min="1" max="6" value="1" required></label><label>Minimum rest between appearances (hours)<input id="portfolio-rest" type="number" min="0" max="720" value="24" required></label></div><div id="portfolio-events"></div><div class="decision-toolbar"><button id="portfolio-add" type="button" class="button subtle">Add event</button><button id="portfolio-rehearsal" type="button" class="button subtle">Fill a two-night rehearsal</button></div><details><summary>Cash availability checkpoints</summary><p>Optional JSON array, for example [{"at":"2027-03-01T00:00:00Z","available":10000}]. Each amount caps cumulative planned payments by that instant. No ticket income is assumed.</p><textarea id="portfolio-cash" rows="3" style="width:100%">[]</textarea></details><button class="button primary" id="portfolio-run">Optimize all events</button></form><p id="portfolio-status" role="status" aria-live="polite"></p><div id="portfolio-result"></div></section>
    <section class="view" id="view-evaluation" aria-label="Independent evaluation" hidden><header class="decision-heading"><p class="eyebrow">TEST THE CLAIM</p><h1>Evidence before<br>the victory lap.</h1><p>Run the same booking brief through a real model without Qloo. Keep every attempt. Ask real people to compare lineups without seeing system names or scores.</p></header>
    <section class="panel"><h2>1. Repeated LLM-only benchmark</h2><p id="evaluation-config"></p><p>Trials use the same candidate pool and terms. The first trial is predeclared for review; an invalid first result cannot be replaced by a more favorable trial.</p><div class="gm-fields"><label>Saved source ID<input id="evaluation-source" placeholder="Use the current saved decision"></label><label>Trials (1–5)<input id="evaluation-trials" type="number" min="1" max="5" value="3"></label></div><button id="evaluation-run" class="button primary">Run genuine benchmark</button><p id="evaluation-status" role="status" aria-live="polite"></p><div id="evaluation-result"></div></section>
    <section class="panel"><h2>2. Invite independent perspectives</h2><p>Include venue, festival, artist-booking and audience perspectives. These are roles for real reviewers, not AI personas. The form collects A/B preference and three optional ratings; nothing is submitted automatically.</p><label>Benchmark snapshot IDs (comma-separated)<input id="evaluation-sources" style="width:100%"></label><label>Reviewer labels and roles (one per line)<textarea id="evaluation-reviewers" rows="4" style="width:100%" placeholder="Alex | venue_programmer&#10;Sam | festival_organizer&#10;Jo | artist_booker&#10;Lee | audience_member"></textarea></label><p>Supported roles: venue_programmer, festival_organizer, artist_booker, audience_member, other. Enter labels only; email addresses are unnecessary.</p><button id="evaluation-study" class="button dark">Prepare private review links</button><div id="evaluation-invitations"></div></section>
    <section class="panel"><h2>3. Report actual judgments</h2><label>Study ID<input id="evaluation-study-id"></label><button id="evaluation-report" class="button subtle">Refresh submitted judgments</button><div id="evaluation-report-result"></div></section></section>`);
  const table=(heads,rows)=>`<div class="table-scroll"><table class="gm-table"><thead><tr>${heads.map(h=>`<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(value=>`<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  async function request(path,body){const r=await fetch(path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});const result=await r.json();if(!r.ok)throw new Error(result.error);return result;}
  async function action(status,fn){if(busy||state.busy)return;busy=true;$(status).textContent='Working…';try{await fn();}catch(err){$(status).textContent=err.message;}finally{busy=false;}}
  function addEvent(value={}){
    if($('portfolio-events').children.length>=6)return;
    const id=++eventSequence,section=document.createElement('fieldset');section.dataset.event=String(id);
    const input=(name,label,type,defaultValue,extra='')=>`<label>${label}<input data-field="${name}" type="${type}" value="${e(value[name]??defaultValue)}" ${extra}></label>`;
    section.innerHTML=`<legend>Event ${id}</legend><div class="gm-fields">${input('name','Event name','text',`Event ${id}`,'required maxlength="120"')}${input('sourceId','Saved evidence source ID','text',state.savedId??'','required')}${input('resource','Venue / shared resource','text','','required maxlength="120"')}${input('start','Start (UTC)','datetime-local','','required')}${input('end','End (UTC)','datetime-local','','required')}${input('fixedCost','Other fixed costs','number',0,'min="0" max="1000000000" step="0.01" required')}${input('depositPercent','Artist deposit (%)','number',50,'min="0" max="100" required')}${input('depositAt','Deposit due (UTC; blank = event start)','datetime-local','')}${input('weight','Policy priority weight','number',1,'min="1" max="5" required')}</div><button type="button" class="button subtle" data-remove-event>Remove event</button>`;
    section.querySelector('[data-remove-event]').onclick=()=>section.remove();$('portfolio-events').append(section);
  }
  const utc=value=>value?value+':00Z':undefined;
  function restoreInputs(input){
    if(!input)return;
    $('portfolio-budget').value=input.budget;
    $('portfolio-reuse').value=input.maxBookingsPerArtist??1;
    $('portfolio-rest').value=input.restHours??24;
    $('portfolio-cash').value=JSON.stringify(input.cashLimits??[],null,2);
    $('portfolio-events').innerHTML='';eventSequence=0;
    const date=value=>value?new Date(value).toISOString().slice(0,16):'';
    for(const event of input.events)addEvent({...event,start:date(event.start),end:date(event.end),depositAt:date(event.depositAt)});
  }
  $('portfolio-add').onclick=()=>addEvent();addEvent();addEvent();
  $('portfolio-rehearsal').onclick=()=>{
    if(!state.savedId){$('portfolio-status').textContent='Load a saved decision first.';return;}
    $('portfolio-events').innerHTML='';eventSequence=0;
    for(const [index,date] of ['2027-04-01','2027-04-15'].entries())addEvent({name:`Illustrative night ${index+1}`,sourceId:state.savedId,resource:'Illustrative hall',start:date+'T18:00',end:date+'T23:00',depositAt:'2027-03-01T12:00'});
    $('portfolio-budget').value=String(Math.round((state.memo?.constraints?.budget??14000)*1.6));$('portfolio-reuse').value='2';$('portfolio-status').textContent='Illustrative planning dates and shared evidence only. Edit the assumptions before treating this as an actual event plan.';
  };
  $('portfolio-form').onsubmit=event=>{event.preventDefault();action('portfolio-status',async()=>{
    const events=[...$('portfolio-events').children].map(section=>{const values=Object.fromEntries([...section.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.value]));return {...values,id:`event-${section.dataset.event}`,start:utc(values.start),end:utc(values.end),depositAt:utc(values.depositAt),fixedCost:Number(values.fixedCost),depositPercent:Number(values.depositPercent),weight:Number(values.weight)};});
    portfolio=await request('/api/portfolios',{budget:Number($('portfolio-budget').value),maxBookingsPerArtist:Number($('portfolio-reuse').value),restHours:Number($('portfolio-rest').value),cashLimits:JSON.parse($('portfolio-cash').value),events});renderPortfolio();history.replaceState(null,'',location.pathname+'#portfolio='+portfolio.id);
  });};
  function renderPortfolio(){
    const p=portfolio,format=value=>new Intl.NumberFormat('en-GB',{style:'currency',currency:p.currency}).format(value);
    $('portfolio-status').textContent=`Saved portfolio ${p.id} · ${label(p.status)} · ${p.search.visitedNodes} search nodes. ${p.certifiedOptimal?'Optimality certified within the saved pools.':'No optimality claim.'}`;
    $('portfolio-result').innerHTML=`<section class="panel"><h2>${p.feasible?'A joint plan that fits.':'Resolve the shared constraints.'}</h2>${p.feasible?`<p>Total planned outflow <strong>${e(format(p.totalCost))}</strong> · remaining budget ${e(format(p.remainingBudget))}</p>`:''}<p><strong>Readiness: ${e(label(p.readiness.status))}</strong>. ${e(p.readiness.basis)}</p><details><summary>Deterministic and evidence checks</summary><pre>${json(p.readiness)}</pre></details><p>Independent event choices: ${p.independent.feasible?'also jointly feasible':'do not satisfy the portfolio constraints'}.</p>${table(['Event / resource','Selected lineup','Planned costs','Decision changed'],p.events.map(row=>[`${e(row.name)}<br>${e(row.start)}<br>${e(row.resource)}`,e(row.artists.map(a=>a.name).join(' + ')),e(format(row.bookingCost+row.fixedCost)),row.changedFromIndependent?'Yes':'No']))}<details><summary>Constraint diagnostics and independent-plan conflicts</summary><pre>${json({diagnostics:p.diagnostics,independent:p.independent.violations,search:p.search})}</pre></details><button class="button subtle" id="portfolio-export">Export portfolio JSON</button></section>${p.feasible?`<section class="panel"><h2>Planned cash timeline</h2><p>Server-calculated deposits, balances and fixed costs. These are not payment instructions or transactions.</p>${table(['Due (UTC)','Event','Kind','Amount','Cumulative'],p.paymentSchedule.map(row=>[e(row.at),e(row.eventId),e(label(row.kind)),e(format(row.amount)),e(format(row.cumulative))]))}</section><section class="panel"><h2>Rehearse a cancellation</h2><p>Freeze every surviving booking across the portfolio and search for a replacement. This creates a new scenario; cancellation costs and refunds are not assumed.</p><select id="portfolio-cancel-choice">${p.events.flatMap(row=>row.artists.map(artist=>`<option value="${e(JSON.stringify([row.eventId,artist.id]))}">${e(row.name)} — ${e(artist.name)}</option>`)).join('')}</select><button class="button subtle" id="portfolio-cancel">Test survivor-preserving recovery</button></section>`:''}<section class="panel"><h2>Declared limits</h2><ul>${p.limitations.map(v=>`<li>${e(v)}</li>`).join('')}</ul><p>${e(p.inputDigest)}</p></section>`;
    $('portfolio-export').onclick=()=>download(p,`portfolio-${p.id}.json`);
    if(p.parentId){
      const parentLink=location.pathname+'#portfolio='+encodeURIComponent(p.parentId);
      $('portfolio-result').insertAdjacentHTML('afterbegin',`<p class="panel">Cancellation rehearsal derived from <a href="${e(parentLink)}" id="portfolio-parent">${e(p.parentId)}</a>. Every surviving selection is fixed in this result. ${e(p.recovery?.scope??'')} The form above starts a new plan from its evidence sources; it does not carry these recovery locks.</p>`);
      $('portfolio-parent').onclick=event=>{event.preventDefault();history.replaceState(null,'',parentLink);window.houselightsAdvanced.openPortfolio(p.parentId);};
    }
    if($('portfolio-cancel'))$('portfolio-cancel').onclick=()=>action('portfolio-status',async()=>{const [eventId,artistId]=JSON.parse($('portfolio-cancel-choice').value);portfolio=await request(`/api/portfolios/${p.id}/recover`,{eventId,artistId});renderPortfolio();history.replaceState(null,'',location.pathname+'#portfolio='+portfolio.id);});
  }
  function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
  async function configuration(){try{const c=await request('/api/benchmarks/config');$('evaluation-config').textContent=`${c.provider} · ${c.model||'model not selected'} · ${c.enabled?'configured':'needs '+c.missing.join(', ')}. Configuration alone does not establish a successful model response.`;}catch(err){$('evaluation-config').textContent=err.message;}}
  $('evaluation-run').insertAdjacentHTML('afterend',' <button id="evaluation-reconnect" class="button subtle">Reconnect benchmark</button> <button id="evaluation-cancel" class="button subtle" hidden>Stop after current trial</button>');
  let benchmarkRun=null;
  async function benchmarkProgress(run){
    if(run.kind!=='benchmark')throw new Error('The last request was not a benchmark. Inspect it in research history.');
    benchmarkRun=run;sessionStorage.setItem('houselights-benchmark-run',run.id);
    batch=await request('/api/benchmarks/'+encodeURIComponent(run.id));
    $('evaluation-cancel').hidden=run.terminal;$('evaluation-cancel').disabled=run.status==='cancel_requested';
    $('evaluation-status').textContent=`Batch ${batch.id} · ${batch.status}. Every attempt is saved.`;
    $('evaluation-result').innerHTML=table(['Trial','Status','Saved result','Provider response'],batch.trials.map(row=>[String(row.index),e(label(row.status)),`<a href="/m/${e(row.snapshotId)}#room">${e(row.snapshotId)}</a>`,e(row.benchmark.generation?.status)]))+`<p>${e(batch.selectionRule)}</p><p>${e(batch.stopReason??'')}</p><details><summary>Model receipts and complete results</summary><pre>${json(batch)}</pre></details><button id="evaluation-export" class="button subtle">Export every trial</button>`;
    $('evaluation-sources').value=batch.reviewSourceId??'';
    $('evaluation-export').onclick=()=>download(batch,`benchmark-${batch.id}.json`);
  }
  $('evaluation-run').onclick=()=>action('evaluation-status',async()=>{
    sessionStorage.removeItem('houselights-benchmark-run');
    await window.houselightsResearch.launch('benchmark',{trials:Number($('evaluation-trials').value)},false,{sourceId:$('evaluation-source').value.trim()||state.savedId,onProgress:benchmarkProgress});
  });
  $('evaluation-reconnect').onclick=()=>action('evaluation-status',async()=>{
    const id=sessionStorage.getItem('houselights-benchmark-run');
    if(id)await window.houselightsResearch.watch(id,benchmarkProgress);
    else await window.houselightsResearch.launch(null,{},true,{onProgress:benchmarkProgress});
  });
  $('evaluation-cancel').onclick=async()=>{try{
    if(benchmarkRun){benchmarkRun=await request('/api/research-runs/'+benchmarkRun.id+'/cancel',{expectedRevision:benchmarkRun.revision});await benchmarkProgress(benchmarkRun);}
  }catch(error){$('evaluation-status').textContent=error.message;}};
  $('evaluation-study').onclick=()=>action('evaluation-status',async()=>{
    const entries=$('evaluation-reviewers').value.split('\n').map(line=>line.split('|').map(s=>s.trim())).filter(([label])=>label);
    const study=await request('/api/studies',{sourceIds:$('evaluation-sources').value.split(',').map(v=>v.trim()).filter(Boolean),reviewers:entries.map(([label])=>label),reviewerRoles:Object.fromEntries(entries.map(([label,role])=>[label,role||'other']))});
    $('evaluation-study-id').value=study.id;
    $('evaluation-invitations').innerHTML=`<p>Study ${e(study.id)} · ${study.caseCount} briefs. No judgments yet. Share each private link with its intended reviewer; localhost links require access to this machine until hosting is selected.</p>${study.invitations.map(invite=>`<p>${e(invite.label)}: <a href="${e(invite.url)}" target="_blank" rel="noreferrer">Open private review</a></p>`).join('')}`;
    $('evaluation-status').textContent='Private invitations prepared. No messages sent.';
  });
  $('evaluation-report').onclick=()=>action('evaluation-status',async()=>{
    const report=await request('/api/studies/'+encodeURIComponent($('evaluation-study-id').value.trim()));
    $('evaluation-report-result').innerHTML=`<p>${report.completedReviewers}/${report.invitedReviewers} reviewers submitted. ${e(report.conclusion)}</p>${table(['Role','Invited','Submitted'],(report.roleCoverage??[]).map(row=>[e(label(row.role)),String(row.invited),String(row.completed)]))}${table(['Brief','Grounded','Control','Tie','Abstain'],report.cases.map(row=>[e(row.city),String(row.qloo),String(row.control),String(row.tie),String(row.abstain)]))}<details><summary>Judgments, rubric scores and limitations</summary><pre>${json(report)}</pre></details>`;
    $('evaluation-status').textContent='Actual submitted judgments loaded.';
  });
  window.houselightsAdvanced={configuration,openPortfolio:async id=>{setView('portfolio');await action('portfolio-status',async()=>{portfolio=await request('/api/portfolios/'+encodeURIComponent(id));restoreInputs(portfolio.input);renderPortfolio();});}};
  configuration();
})();
