/* Houselights organizer workspace: brief → Qloo research → Autopilot decision →
   revise → compare → packet. Every result shows where its evidence came from. */
'use strict';
(()=>{
  const $=id=>document.getElementById(id),View=window.HouselightsAutopilotView,e=View.escape;
  const state={event:null,run:null,busy:false,example:null,editable:false,protected:false};
  const form=$('brief-form');
  const moneyFor=currency=>value=>value==null||!Number.isFinite(value)?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:currency||'USD',maximumFractionDigits:0}).format(value);
  const say=text=>{$('ws-status').textContent=text;};
  async function api(path,{method='GET',body}={}){
    const response=await fetch(path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(240000)});
    const value=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(value.error??`Request failed (${response.status}).`),{status:response.status,value});
    return value;
  }
  function setBusy(busy,label){
    state.busy=busy;document.querySelectorAll('#workspace-app button, #workspace-app input, #workspace-app select, #workspace-app textarea').forEach(control=>{control.disabled=busy||control.dataset.locked==='true';});
    $('ws-decide').setAttribute('aria-busy',String(busy));
    if(label)say(label);
    if(!busy)updateButtons();
  }

  // ---------- Brief form ----------
  const FEE_STATUS=[['estimate','Estimate'],['quoted','Quoted'],['unknown','Unknown']];
  const AVAIL=[['confirmed','Confirmed'],['assumed','Assumed (plan with it)'],['unconfirmed','Not confirmed'],['unavailable','Unavailable']];
  function candidateRow(row={},index){
    const options=(list,value)=>list.map(([key,label])=>`<option value="${key}"${key===value?' selected':''}>${label}</option>`).join('');
    const n=index+1;
    return `<tr><td><input aria-label="Candidate ${n} name" data-field="name" maxlength="100" value="${e(row.name??'')}" required></td><td><input aria-label="Candidate ${n} fee" data-field="fee" type="number" min="0" step="1" value="${row.fee??''}" placeholder="Unknown"></td><td><select aria-label="Candidate ${n} fee status" data-field="feeStatus">${options(FEE_STATUS,row.fee==null?'unknown':row.feeStatus??'estimate')}</select></td><td><select aria-label="Candidate ${n} availability" data-field="availability">${options(AVAIL,row.availability??'unconfirmed')}</select></td><td><input aria-label="Candidate ${n} genre" data-field="genre" maxlength="60" value="${e(row.genre??'')}"></td><td><input aria-label="Lock candidate ${n}" data-field="lock" type="checkbox"${row.lock?' checked':''}></td><td><input aria-label="Exclude candidate ${n}" data-field="exclude" type="checkbox"${row.exclude?' checked':''}></td><td><button type="button" class="button subtle small" data-remove-candidate aria-label="Remove candidate ${n}">Remove</button></td></tr>`;
  }
  function setCandidates(rows){$('candidate-rows').innerHTML=rows.map(candidateRow).join('');}
  function fillForm(brief){
    for(const name of ['name','city','venue','date','direction','audience','currency'])form.elements[name].value=brief?.[name]??(name==='currency'?'USD':'');
    form.elements.objectives.value=(brief?.objectives??[]).join('\n');
    for(let index=0;index<3;index++)form.elements[`anchor${index}`].value=brief?.anchors?.[index]??'';
    form.elements.budget.value=brief?.constraints?.budget??'';form.elements.slots.value=brief?.constraints?.slots??2;form.elements.maxPerGenre.value=brief?.constraints?.maxPerGenre??'';form.elements.discoveryMin.value=brief?.constraints?.discoveryMin??0;
    form.elements.capacity.value=brief?.commercial?.capacity??'';form.elements.ticketPrice.value=brief?.commercial?.ticketPrice??'';form.elements.otherCosts.value=brief?.commercial?.otherCosts??'';
    form.elements.note.value='';
    setCandidates(brief?.candidates??[{},{},{}]);
  }
  const num=value=>value===''||value==null?null:Number(value);
  function readForm(){
    const v=name=>form.elements[name].value.trim();
    const candidates=[...$('candidate-rows').rows].map(row=>{
      const field=name=>row.querySelector(`[data-field="${name}"]`);
      const fee=num(field('fee').value);
      return {name:field('name').value.trim(),fee,feeStatus:fee==null?'unknown':field('feeStatus').value==='unknown'?'estimate':field('feeStatus').value,availability:field('availability').value,genre:field('genre').value.trim()||null,lock:field('lock').checked,exclude:field('exclude').checked};
    }).filter(row=>row.name||row.fee!=null);
    const commercial={capacity:num(v('capacity')),ticketPrice:num(v('ticketPrice')),otherCosts:num(v('otherCosts'))};
    // Keep the organizer's earlier Qloo match choices for names still in the brief.
    const present=new Set([...[0,1,2].map(index=>v(`anchor${index}`)),...candidates.map(row=>row.name)].filter(Boolean).map(name=>name.toLowerCase()));
    const picks=Object.fromEntries(Object.entries(state.event?.revisions.at(-1).brief.picks??{}).filter(([name])=>present.has(name.toLowerCase())));
    return {name:v('name'),city:v('city'),venue:v('venue')||null,date:v('date')||null,direction:v('direction')||null,audience:v('audience')||null,
      objectives:form.elements.objectives.value.split('\n').map(line=>line.trim()).filter(Boolean),anchors:[0,1,2].map(index=>v(`anchor${index}`)).filter(Boolean),currency:v('currency'),
      constraints:{budget:num(v('budget')),slots:num(v('slots')),...(v('maxPerGenre')?{maxPerGenre:num(v('maxPerGenre'))}:{}),...(v('discoveryMin')?{discoveryMin:num(v('discoveryMin'))}:{})},candidates,
      ...(Object.values(commercial).some(value=>value!=null)?{commercial}:{}),...(Object.keys(picks).length?{picks}:{})};
  }
  const EXAMPLE={name:'Night Shift Soul Revue',city:'Chicago',venue:'700-capacity club (illustrative)',date:'2027-04-16',direction:'Modern soul with a jazz-funk edge',audience:'25–40 year-old soul and R&B fans who follow Leon Bridges and Erykah Badu',objectives:['Fill a 700-capacity room','Book one act the audience is likely to discover'],
    anchors:['Leon Bridges','Erykah Badu'],currency:'USD',constraints:{budget:22000,slots:2},
    candidates:[{name:'Thundercat',fee:12000,feeStatus:'estimate',availability:'assumed',genre:'jazz-funk'},{name:'Durand Jones & The Indications',fee:7000,feeStatus:'estimate',availability:'assumed',genre:'soul'},{name:'Masego',fee:9000,feeStatus:'estimate',availability:'assumed',genre:'r&b'},{name:'Lianne La Havas',fee:11000,feeStatus:'estimate',availability:'unconfirmed',genre:'soul'},{name:'Thee Sacred Souls',fee:5500,feeStatus:'estimate',availability:'assumed',genre:'soul'},{name:'Nao',fee:null,availability:'unconfirmed',genre:'r&b'}],
    commercial:{capacity:700,ticketPrice:55,otherCosts:9000}};

  // ---------- Events list and selection ----------
  async function loadList(selectId){
    const {events}=await api('/api/events');
    $('event-list').innerHTML=events.length?events.map(row=>`<li><button type="button" class="workspace-event${row.id===state.event?.id?' workspace-event-active':''}" data-event="${e(row.id)}" aria-current="${row.id===state.event?.id?'true':'false'}"><strong>${e(row.name)}</strong><small>${e(row.city)}${row.date?` · ${e(row.date)}`:''} · revision ${e(row.revisions)}</small><small>${row.latestDecision?`Latest: ${e(row.latestDecision.names.join(' + ')||'no feasible bill')}`:row.research?.status==='complete'?'Researched · no decision yet':'Not researched yet'}</small></button></li>`).join(''):'<li class="workspace-empty">No events yet. Create one, or fill the example brief.</li>';
    if(selectId)await select(selectId);
  }
  async function select(id){
    state.event=await api(`/api/events/${encodeURIComponent(id)}`);state.run=null;
    fillForm(state.event.revisions.at(-1).brief);
    $('brief-submit').textContent=`Save as revision ${state.event.revisions.length+1}`;$('revision-note-row').hidden=false;
    renderResearch();renderRevisionChoices();renderHistory();
    const last=state.event.runs.at(-1);
    if(last)await showRun(last.id);else $('decide-output').innerHTML='<p class="workspace-empty">No decision yet. Research the event, then run Autopilot.</p>';
    document.querySelectorAll('[data-event]').forEach(button=>{const active=button.dataset.event===id;button.classList.toggle('workspace-event-active',active);button.setAttribute('aria-current',String(active));});
    updateButtons();
  }
  function newEvent(){state.event=null;state.run=null;fillForm(null);$('brief-submit').textContent='Create event';$('revision-note-row').hidden=true;$('research-output').innerHTML='';$('decide-output').innerHTML='';$('history-output').innerHTML='';renderRevisionChoices();updateButtons();form.elements.name.focus();}
  function updateButtons(){
    const event=state.event,ready=['complete','partial'].includes(event?.research?.status)&&!event.researchStale;
    $('run-research').disabled=state.busy||!event;
    $('run-autopilot').disabled=state.busy||!event||!ready;
    $('run-research').textContent=['complete','partial'].includes(event?.research?.status)?(event.researchStale?'Research again (brief changed)':'Research again'):'Research with Qloo';
  }

  // ---------- Research ----------
  function researchSummary(event){
    const research=event.research;
    if(!research)return '<p class="workspace-empty">Not researched yet.</p>';
    const synthetic=research.mode==='synthetic';
    const items=research.items??[];
    return `<div class="autopilot-banner ${synthetic?'autopilot-banner-warning':'autopilot-banner-live'}"><strong>${synthetic?'SYNTHETIC QLOO DATA':'QLOO RESEARCH'} · REVISION ${e(research.revision)}</strong><span>${synthetic?'Development fixtures, not real cultural evidence.':`${e(research.callsUsed)} live Qloo workflow calls`} · ${e(research.receipts)} receipts · completed ${e(String(research.completedAt).replace('T',' ').slice(0,16))} UTC.</span></div>
      ${research.status==='partial'?`<p class="workspace-warning" role="alert"><strong>Partial research:</strong> ${e(research.failedCalls?.length??0)} Qloo call(s) failed (${e([...new Set((research.failedCalls??[]).map(row=>row.error).filter(Boolean))].join(', ')||'errors')}). That evidence is missing, not guessed, so decisions on it are provisional. Research again when Qloo is responding.</p>`:''}
      ${event.researchStale?`<p class="workspace-warning" role="alert">${e(event.researchStale)} Decisions use the last research until you research again.</p>`:''}
      ${research.unresolved?.length?`<div class="workspace-warning"><p>Qloo could not resolve: ${e(research.unresolved.join(', '))}. These names were not used.</p>${(research.choices??[]).filter(row=>row.choices?.length).map(row=>`<p><strong>${e(row.name)}</strong> could be: ${row.choices.map(choice=>`<button type="button" class="button subtle small" data-pick-name="${e(row.name)}" data-pick-id="${e(choice.id)}" data-pick-label="${e(choice.name)}">${e(choice.name)}</button>`).join(' ')}</p>`).join('')}${(research.choices??[]).some(row=>row.choices?.length)?'<p>Choose the intended artist to save a revision, then research again.</p>':'<p>Check the spelling or make the name more specific.</p>'}</div>`:''}
      <div class="table-scroll"><table class="autopilot-compare"><caption>What Qloo returned for each artist in ${e(event.revisions.find(row=>row.revision===research.revision)?.brief.city??'')}</caption><thead><tr><th scope="col">Artist</th><th scope="col">Source</th><th scope="col">Audience rank</th><th scope="col">Local evidence</th><th scope="col">Audience comparison</th></tr></thead><tbody>${items.map(item=>`<tr><th scope="row">${e(item.name)}${item.originalName&&item.originalName!==item.name?` <small>(you entered “${e(item.originalName)}”)</small>`:''}</th><td>${item.found?'Found by Qloo · no quote yet':'Your candidate'}</td><td>${item.evidence?.rank?`${e(item.rank)} of ${e(item.of)}`:'Missing'}</td><td>${item.evidence?.local?'Measured':'Missing'}</td><td>${item.evidence?.comparison?'Measured':'Missing'}</td></tr>`).join('')}</tbody></table></div>
      <p class="autopilot-note">Rank is relative audience fit against your reference artists in this city. It is cultural affinity, not ticket demand.</p>`;
  }
  function renderResearch(){$('research-output').innerHTML=state.event?researchSummary(state.event):'';}
  async function runResearch(){
    if(!state.event)return;
    setBusy(true,'Researching with Qloo. This makes up to 24 bounded calls and can take a minute.');
    $('research-output').innerHTML='<p class="autopilot-loading">Resolving artists, ranking the pool and checking local evidence…</p>';
    try{state.event=await api(`/api/events/${state.event.id}/research`,{method:'POST'});renderResearch();say(state.event.research.mode==='synthetic'?`Research complete on synthetic fixtures: ${state.event.research.callsUsed} fixture calls, no provider contacted.`:`Research complete: ${state.event.research.callsUsed} Qloo workflow calls.`);}
    catch(error){if(error.value?.id){state.event=error.value;}renderResearch();say(`${error.message}`);$('research-output').insertAdjacentHTML('afterbegin',`<p class="workspace-error" role="alert">${e(error.message)} ${e((error.value?.attempt?.errors??[]).join(' '))}</p>`);}
    finally{setBusy(false);await loadList();renderRevisionChoices();}
  }

  async function choosePick(name,id,label){
    const brief=readForm();brief.picks={...(brief.picks??{}),[name]:{id,name:label}};
    setBusy(true,`Saving your Qloo match for ${name}…`);
    try{state.event=await api(`/api/events/${state.event.id}/revisions`,{method:'POST',body:{brief,note:`Chose Qloo match “${label}” for ${name}`}});await loadList(state.event.id);say(`Saved. Research again to use “${label}” for ${name}.`);}
    catch(error){say(error.message);}
    finally{setBusy(false);}
  }

  // ---------- Decide ----------
  function renderRevisionChoices(){
    const event=state.event;
    $('decide-revision').innerHTML=event?[...event.revisions].reverse().map(row=>`<option value="${row.revision}">Revision ${row.revision}: ${e(row.note)}</option>`).join(''):'';
  }
  function runBanner(entry){
    if(entry.mode==='planning')return `<div class="autopilot-banner"><strong>PLANNED FROM SAVED EVIDENCE · REVISION ${e(entry.revision)}</strong><span>No new Qloo calls in this decision. It uses the event's ${entry.researchMode==='synthetic'?'synthetic':'Qloo'} research.</span></div>`;
    if(entry.mode==='synthetic')return `<div class="autopilot-banner autopilot-banner-warning"><strong>SYNTHETIC QLOO DATA · REVISION ${e(entry.revision)}</strong><span>Development fixtures, not real cultural evidence.</span></div>`;
    if(entry.mode==='recorded')return '';
    return `<div class="autopilot-banner autopilot-banner-live"><strong>LIVE QLOO DECISION · REVISION ${e(entry.revision)}</strong><span>${e(entry.callsUsed)} extra Qloo workflow calls on ${e(String(entry.createdAt).replace('T',' ').slice(0,16))} UTC.</span></div>`;
  }
  function renderRun(entry,{target,example=false}={}){
    const money=moneyFor(entry.run.currency);
    const actionsHtml=`<button type="button" class="button primary" data-download="md" data-run="${e(entry.id)}">Download packet (.md)</button>${example?'':`<button type="button" class="button subtle" data-download="html" data-run="${e(entry.id)}">Download printable packet (.html)</button>`}<button type="button" class="button subtle" data-download="json" data-run="${e(entry.id)}">Download full run (JSON)</button>`;
    target.innerHTML=runBanner(entry)+View.render(entry.run,{kind:entry.mode==='planning'?'planning':'event',money,actionsHtml,scope:`run-${entry.id}`,packetLabel:`REVISION ${entry.revision} · ${entry.mode.toUpperCase()}`});
  }
  async function showRun(id){
    const entry=await api(`/api/events/${state.event.id}/runs/${encodeURIComponent(id)}`);state.run=entry;renderRun(entry,{target:$('decide-output')});
  }
  async function runAutopilot(){
    if(!state.event)return;
    const calls=Number($('decide-calls').value),revision=Number($('decide-revision').value);
    setBusy(true,calls?`Running Autopilot with up to ${calls} extra Qloo calls…`:'Planning from saved evidence…');
    try{
      const entry=await api(`/api/events/${state.event.id}/autopilot`,{method:'POST',body:{revision,maxCalls:calls}});
      state.event=entry.event;state.run=entry;renderRun(entry,{target:$('decide-output')});renderHistory();
      say(`Decision ready for revision ${revision}: ${entry.summary.names.join(' + ')||'no feasible bill'}.`);
      $('decide-output').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    }catch(error){say(error.message);$('decide-output').insertAdjacentHTML('afterbegin',`<p class="workspace-error" role="alert">${e(error.message)}</p>`);}
    finally{setBusy(false);await loadList();}
  }

  // ---------- History and comparison ----------
  function comparisonHtml(result,money){
    const [a,b]=result.runs;
    return `<div class="workspace-compare"><h3>Revision ${e(a.revision)} → revision ${e(b.revision)}</h3>
      <div class="workspace-compare-grid"><div><small>BEFORE</small><strong>${e(a.names.join(' + ')||'No feasible bill')}</strong><span>${e(money(a.totalFee))} · ${e(a.mode)}</span></div><div><small>AFTER</small><strong>${e(b.names.join(' + ')||'No feasible bill')}</strong><span>${e(money(b.totalFee))} · ${e(b.mode)}</span></div></div>
      <p><strong>${result.lineupChanged?'The recommended bill changed.':'The recommended bill did not change.'}</strong> ${result.added.length?`Added ${e(result.added.join(', '))}. `:''}${result.removed.length?`Removed ${e(result.removed.join(', '))}. `:''}${result.feeDelta!=null?`Fee change ${result.feeDelta>=0?'+':'−'}${e(money(Math.abs(result.feeDelta)))}; policy points ${result.scoreDelta>=0?'+':''}${e(result.scoreDelta)}.`:''}</p>
      ${result.robustness[0]&&result.robustness[1]?`<p>Disruption scenarios where the plan continues: ${e(result.robustness[0].continued)}/${e(result.robustness[0].total)} → ${e(result.robustness[1].continued)}/${e(result.robustness[1].total)}.</p>`:''}
      <h4>What changed in the brief</h4><ul>${result.briefChanges.map(row=>`<li>${e(row)}</li>`).join('')||'<li>Same brief revision.</li>'}</ul><p class="autopilot-note">${e(result.note)}</p></div>`;
  }
  function renderHistory(){
    const event=state.event;
    if(!event){$('history-output').innerHTML='';return;}
    const money=moneyFor(event.revisions.at(-1).brief.currency);
    const revisions=`<h3>Brief revisions</h3><ol class="workspace-revisions">${event.revisions.map(row=>`<li><strong>Revision ${e(row.revision)}</strong> · ${e(row.note)} <small>${e(String(row.createdAt).replace('T',' ').slice(0,16))} UTC</small>${row.changes.length?`<ul>${row.changes.map(change=>`<li>${e(change)}</li>`).join('')}</ul>`:''}</li>`).join('')}</ol>`;
    const runs=event.runs.length?`<h3>Decision runs</h3><div class="table-scroll"><table class="autopilot-compare"><thead><tr><th scope="col">Run</th><th scope="col">Revision</th><th scope="col">Mode</th><th scope="col">Recommended bill</th><th scope="col">Fees</th><th scope="col">Compare</th></tr></thead><tbody>${[...event.runs].reverse().map(row=>`<tr><th scope="row"><button type="button" class="judge-receipt-link" data-show-run="${e(row.id)}">${e(String(row.createdAt).replace('T',' ').slice(5,16))}</button></th><td>${e(row.revision)}</td><td>${e(row.mode)}${row.status==='partial'?' · partial':''}</td><td>${e(row.summary.names.join(' + ')||'No feasible bill')}</td><td>${e(money(row.summary.totalFee))}</td><td><label class="workspace-inline"><input type="checkbox" data-compare="${e(row.id)}"> <span class="workspace-sr">Compare run ${e(row.id)}</span></label></td></tr>`).join('')}</tbody></table></div><button type="button" class="button subtle small" id="compare-runs">Compare the two selected runs</button><div id="compare-output" aria-live="polite"></div>`:'<p class="workspace-empty">No decision runs yet.</p>';
    $('history-output').innerHTML=revisions+runs;
  }
  async function compareSelected(){
    const ids=[...document.querySelectorAll('[data-compare]:checked')].map(input=>input.dataset.compare);
    if(ids.length!==2){say('Select exactly two runs to compare.');return;}
    const order=state.event.runs.map(row=>row.id),[a,b]=ids.sort((x,y)=>order.indexOf(x)-order.indexOf(y));
    const result=await api(`/api/events/${state.event.id}/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
    $('compare-output').innerHTML=comparisonHtml(result,moneyFor(state.event.revisions.at(-1).brief.currency));
  }

  // ---------- Downloads ----------
  async function download(kind,runId){
    const entry=state.example?state.example.runs.find(row=>row.id===runId):state.run?.id===runId?state.run:await api(`/api/events/${state.event.id}/runs/${encodeURIComponent(runId)}`);
    const base=`houselights-${state.example?'example':state.event.id}-${runId}`;
    if(kind==='md')View.download(`${base}.md`,`${state.example?'> Recorded organizer session example. Replayed without new provider calls.\n\n':''}${entry.run.packet.markdown}`,'text/markdown;charset=utf-8');
    else if(kind==='json')View.download(`${base}.json`,JSON.stringify(entry,null,2),'application/json');
    else{
      const response=await fetch(`/api/events/${state.event.id}/runs/${encodeURIComponent(runId)}/packet`,{signal:AbortSignal.timeout(30000)});
      if(!response.ok){say('The printable packet could not be prepared.');return;}
      View.download(`${base}.html`,await response.text(),'text/html;charset=utf-8');
    }
  }

  // ---------- Recorded example ----------
  async function showExample(){
    $('workspace-app').hidden=true;$('workspace-gate').hidden=true;$('workspace-example').hidden=false;
    $('workspace-mode').innerHTML='<strong>RECORDED ORGANIZER SESSION</strong> · read-only replay, no new Qloo calls';
    const target=$('workspace-example');
    target.innerHTML='<p class="autopilot-loading">Loading the recorded session…</p>';
    try{
      const file=await (await fetch('/workspace-example.json',{signal:AbortSignal.timeout(15000)})).json();state.example=file;
      const event=file.event,brief=event.revisions[0].brief,money=moneyFor(brief.currency);
      const [first,second]=file.runs;
      target.innerHTML=`<div class="autopilot-banner autopilot-banner-recorded"><strong>RECORDED ORGANIZER SESSION</strong><span>${e(file.disclosure)} Captured ${e(file.capturedAt.replace('T',' ').slice(0,16))} UTC with ${e(file.providerCalls)} live Qloo workflow calls. This page replays the record and makes no calls.${file.runs.some(row=>row.run?.fitBasis==='ordinal-rank')?' These decisions scored cultural fit by Qloo rank order, because the session was recorded before Houselights used Qloo affinity scores; a new event researched today uses affinity.':''}</span></div>
        <ol class="workspace-story">
          <li><h2><span>1</span> The organizer writes a new brief</h2><div class="panel workspace-brief-card">${briefCard(brief,money)}</div></li>
          <li><h2><span>2</span> Houselights researches it with Qloo</h2><div class="panel">${researchSummary({...event,researchStale:null})}</div></li>
          <li><h2><span>3</span> Autopilot builds the first decision</h2><div class="panel" id="example-run-1"></div></li>
          <li><h2><span>4</span> The organizer revises the brief</h2><div class="panel"><p>${e(event.revisions[1]?.note??'')}</p><ul>${(event.revisions[1]?.changes??[]).map(row=>`<li>${e(row)}</li>`).join('')}</ul><p class="autopilot-note">Fees and constraints changed; the Qloo evidence is reused, so the second decision needs no new research calls.</p></div></li>
          <li><h2><span>5</span> Autopilot decides again</h2><div class="panel" id="example-run-2"></div></li>
          <li><h2><span>6</span> Compare the two decisions</h2><div class="panel">${comparisonHtml(file.comparison,money)}</div></li>
        </ol><p class="workspace-example-cta">Ready to try it? <a href="/workspace.html">Open the workspace</a> (organizer token required on the public server) or return to the <a href="/judge.html">Booking Desk</a>.</p>`;
      renderRun(first,{target:$('example-run-1'),example:true});
      if(second)renderRun(second,{target:$('example-run-2'),example:true});
    }catch{target.innerHTML='<p class="workspace-error">The recorded example could not be loaded.</p>';}
  }
  function briefCard(brief,money){
    return `<h3>${e(brief.name)}</h3><p>${e(brief.city)}${brief.venue?` · ${e(brief.venue)}`:''}${brief.date?` · ${e(brief.date)}`:''}</p><p>${e(brief.direction??'')}${brief.audience?` — ${e(brief.audience)}`:''}</p><p><strong>Audience references:</strong> ${e(brief.anchors.join(', '))} · <strong>Budget:</strong> ${e(money(brief.constraints.budget))} for ${e(brief.constraints.slots)} acts</p>
      <div class="table-scroll"><table class="autopilot-compare"><thead><tr><th scope="col">Candidate</th><th scope="col">Fee</th><th scope="col">Fee status</th><th scope="col">Availability</th></tr></thead><tbody>${brief.candidates.map(row=>`<tr><th scope="row">${e(row.name)}</th><td>${e(money(row.fee))}</td><td>${e(row.feeStatus)}</td><td>${e(row.availability)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ---------- Events ----------
  form.addEventListener('submit',async event=>{
    event.preventDefault();$('brief-error').textContent='';
    const brief=readForm();
    setBusy(true,state.event?'Saving revision…':'Creating event…');
    try{
      if(state.event){state.event=await api(`/api/events/${state.event.id}/revisions`,{method:'POST',body:{brief,note:form.elements.note.value.trim()||undefined}});await loadList(state.event.id);say(`Saved revision ${state.event.revisions.length}.${state.event.researchStale?' Research again before deciding: '+state.event.researchStale:' Run Autopilot to decide on this revision.'}`);}
      else{const created=await api('/api/events',{method:'POST',body:{brief}});await loadList(created.id);say('Event created. Next: research it with Qloo.');}
    }catch(error){$('brief-error').textContent=error.message;say(error.message);}
    finally{setBusy(false);}
  });
  document.addEventListener('click',event=>{
    const target=event.target;
    if(target.closest('[data-remove-candidate]')){if($('candidate-rows').rows.length>2)target.closest('tr').remove();else say('Keep at least two candidates.');return;}
    const pick=target.closest('[data-event]');if(pick&&!state.busy){void select(pick.dataset.event).catch(error=>say(error.message));return;}
    const show=target.closest('[data-show-run]');if(show){void showRun(show.dataset.showRun).then(()=>$('decide-output').scrollIntoView({block:'start'})).catch(error=>say(error.message));return;}
    const match=target.closest('[data-pick-id]');if(match&&state.event&&!state.busy){void choosePick(match.dataset.pickName,match.dataset.pickId,match.dataset.pickLabel);return;}
    const dl=target.closest('[data-download]');if(dl){void download(dl.dataset.download,dl.dataset.run).catch(error=>say(error.message));return;}
    const receipt=target.closest('[data-autopilot-receipt]');if(receipt){View.openReceipt(receipt);return;}
    if(target.closest('#compare-runs')){void compareSelected().catch(error=>say(error.message));}
  });
  $('add-candidate').addEventListener('click',()=>{const rows=$('candidate-rows');if(rows.rows.length>=8){say('At most 8 candidates.');return;}rows.insertAdjacentHTML('beforeend',candidateRow({},rows.rows.length));rows.rows[rows.rows.length-1].querySelector('input').focus();});
  $('fill-example').addEventListener('click',()=>{const keep=state.event;fillForm(EXAMPLE);if(keep)say('Example values filled. Saving will create a new revision of this event.');else say('Example brief filled with illustrative fees. Review it, then create the event.');});
  $('new-event').addEventListener('click',newEvent);
  $('run-research').addEventListener('click',()=>void runResearch());
  $('run-autopilot').addEventListener('click',()=>void runAutopilot());
  $('gate-form').addEventListener('submit',async event=>{
    event.preventDefault();$('gate-error').textContent='';
    window.organizerAccess.setToken($('gate-token').value.trim());
    try{await api('/api/events');$('gate-token').value='';await openApp();}
    catch(error){window.organizerAccess.clear();$('gate-error').textContent=error.status===401?'That token was not accepted.':error.message;}
  });

  async function openApp(){
    state.example=null;$('workspace-example').hidden=true;$('workspace-gate').hidden=true;$('workspace-app').hidden=false;
    $('workspace-mode').innerHTML=state.protected?'<strong>ORGANIZER ACCESS</strong> · private workspace on this server':'<strong>LOCAL DEVELOPMENT</strong> · this server does not require an organizer token';
    newEvent();await loadList();
    const health=await fetch('/healthz').then(r=>r.json()).catch(()=>null);
    if(health?.mock)$('workspace-mode').innerHTML+=' · <strong class="workspace-synthetic">SYNTHETIC QLOO MODE</strong>: research uses development fixtures, not real evidence';
  }
  async function route(){
    if(location.hash==='#example'){await showExample();return;}
    const access=await fetch('/api/access').then(r=>r.json()).catch(()=>({protected:true,editable:false}));
    state.protected=access.protected;state.editable=access.editable;
    if(access.editable)await openApp();
    else{$('workspace-app').hidden=true;$('workspace-example').hidden=true;$('workspace-gate').hidden=false;$('workspace-mode').innerHTML='<strong>PRIVATE</strong> · organizer token required';}
  }
  addEventListener('hashchange',()=>{if(location.hash==='#example'||(!$('workspace-example').hidden&&location.hash!=='#example'))void route();});
  void route().catch(error=>say(error.message));
})();
