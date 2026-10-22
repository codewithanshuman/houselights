'use strict';
(() => {
  const $=id=>document.getElementById(id),form=$('plan-form');
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=(value,currency)=>value==null?'Unknown':new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(value);
  const read=async(path,body)=>{const response=await fetch(path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);
    const data=await response.json();if(!response.ok)throw new Error(data.error||`Request failed (${response.status}).`);return data;};
  const value=name=>form.elements.namedItem(name)?.value?.trim()??'';
  const numeric=name=>value(name)===''?null:Number(value(name));
  const state={last:null,twinId:null,lastRequest:null};
  function artistRow(artist={}){
    if($('artists').children.length>=20)throw new Error('The exact search supports at most 20 candidates.');
    const row=document.createElement('tr');
    row.innerHTML=`<td><input data-field="name" maxlength="180" required aria-label="Artist name" value="${escape(artist.name??'')}"></td>
      <td><input data-field="id" maxlength="180" required aria-label="Artist ID" value="${escape(artist.id??'')}"></td>
      <td><input data-field="fee" type="number" min="0" step="0.01" aria-label="Illustrative artist fee" value="${artist.fee??''}"></td>
      <td><input data-field="genre" maxlength="80" aria-label="Artist genre" value="${escape(artist.genre??'')}"></td>
      <td><input data-field="available" type="checkbox" aria-label="Artist available" ${artist.available?'checked':''}></td>
      <td><button type="button" class="quiet" aria-label="Remove artist">Remove</button></td>`;
    row.querySelector('button').onclick=()=>row.remove();$('artists').append(row);
  }
  function candidates(){return [...$('artists').children].map(row=>({name:row.querySelector('[data-field=name]').value.trim(),id:row.querySelector('[data-field=id]').value.trim(),
    fee:row.querySelector('[data-field=fee]').value===''?null:Number(row.querySelector('[data-field=fee]').value),
    genre:row.querySelector('[data-field=genre]').value.trim(),available:row.querySelector('[data-field=available]').checked}));}
  function requestFromForm(){return {sourceId:value('sourceId')||undefined,brief:{city:value('city'),venue:value('venue'),eventDate:value('eventDate'),capacity:numeric('capacity'),ticketPrice:numeric('ticketPrice'),currency:value('currency'),genre:value('genre'),competitionCount:numeric('competitionCount')},
    candidates:candidates(),constraints:{budget:numeric('budget'),slots:numeric('slots'),maxPerGenre:numeric('maxPerGenre')},
    assumptions:{baseSellThrough:numeric('baseSellThrough'),priceElasticity:numeric('priceElasticity'),fixedCosts:numeric('fixedCosts'),variableCostPerAttendee:numeric('variableCostPerAttendee')},
    save:form.elements.namedItem('save').checked};}
  function twinSeeds(){return [...$('twin-seeds').children].map(row=>{
    const field=name=>row.querySelector(`[data-twin=${name}]`).value.trim();
    return {label:field('label'),anchorIds:field('anchorIds').split(',').map(item=>item.trim()).filter(Boolean),
      weight:Number(field('weight')),baseIntent:Number(field('baseIntent')),priceElasticity:Number(field('priceElasticity')),
      competitionLoss:Number(field('competitionLoss'))};});}
  function renderModel(data){
    $('model-status').textContent=data.status==='backtested'
      ?`${data.eligible} eligible sourced outcomes. Chronological holdout: ${data.heldOut} later events.`
      :`${data.eligible??0} eligible real outcomes of ${data.required??40} needed. Paid-ticket forecasting is disabled.`;
    $('model-details').innerHTML=data.status==='backtested'
      ?`<p>Baseline held-out occupancy MAE: <strong>${escape(data.baseline?.mae)}</strong>. ${data.qlooComparison?
        `Matched Qloo cohort: ${escape(data.qlooComparison.cohort)} events; no-Qloo MAE ${escape(data.qlooComparison.withoutQloo.mae)}, Qloo MAE ${escape(data.qlooComparison.withQloo.mae)}. ${data.qlooComparison.qlooImproved?'Qloo improved this holdout.':'Qloo did not improve this holdout.'}`:
        'A paired Qloo versus no-Qloo holdout is not yet available.'}</p>`
      :`<p>${escape(data.reason||'No model is active.')}</p>`;
    if(data.reported?.count) $('model-details').innerHTML+=`<p>Source catalog: ${escape(data.reported.count)} publisher-reported outcomes, including ${escape(data.reported.singleShow)} single-show rows. They have no timestamped pre-event predictors, so none train the model. <a href="/api/demand/reported-outcomes">Inspect private source rows</a>.</p>`;
  }
  async function refreshModel(){try{renderModel(await read('/api/demand/model'));
      const validation=await read('/api/demand/twin-validation');
      $('twin-validation').textContent=validation.count
        ?`Audience Twin: ${validation.count} eligible sourced event totals; mean absolute scenario error ${Math.round(validation.meanAbsoluteError)} paid tickets. ${Math.round(validation.withinSensitivityRange*100)}% fell inside the assumption-sensitivity range; that is not statistical coverage.`
        :'Audience Twin: no eligible paired real event outcomes yet. Historical box-office rows cannot validate synthetic segment assumptions.';
    }catch(error){$('model-status').textContent=error.message;$('model-details').textContent='Unlock organizer access to inspect private training records.';$('twin-validation').textContent='';}}
  function renderPlan(data,request){
    state.last=data;state.lastRequest=request;$('results').hidden=false;
    $('result-mode').textContent=data.status==='infeasible'?'No feasible lineup':data.mode==='backtested_observational_forecast'?'Backtested paid-ticket forecast':data.mode==='synthetic_audience_scenario'?'Synthetic audience scenario · not a forecast':'Cultural scenario proxy · not a ticket-sales prediction';
    if(data.status!=='feasible'){$('result-summary').textContent=data.reasons.join(' ');return;}
    const names=ids=>ids.map(id=>request.candidates.find(item=>item.id===id)?.name||id).join(' + ');
    const selection=data.selected,att=selection.forecast?.ticketsSold||selection.twinScenario?.ticketsSold||selection.scenario;
    $('result-summary').innerHTML=`<p><strong>${escape(names(selection.selectedIds))}</strong></p><p><span class="metric">${escape(data.feasibleCount)} feasible of ${escape(data.checkedCount)} exact combinations</span><span class="metric">${escape(money(selection.fees,data.brief.currency))} artist fees</span><span class="metric">${escape(selection.cultural.proxy)} cultural proxy points</span></p>
      <p>${escape(data.objective)}</p>${data.forecastId?`<p class="mono">Saved pre-event forecast ID: ${escape(data.forecastId)}</p>`:''}`;
    $('result-financial').innerHTML=`<h3>Paid tickets and economics</h3>${att
      ?`<div class="result-grid"><article><strong>${selection.forecast?'Modeled paid-ticket range':'Assumed ticket-sales stress'}</strong><p>${escape(att.low)}–${escape(att.high)} · central ${escape(att.point)}</p></article><article><strong>Gross revenue</strong><p>${escape(money(selection.economics?.grossRevenue.low,data.brief.currency))}–${escape(money(selection.economics?.grossRevenue.high,data.brief.currency))}</p></article><article><strong>Operating margin</strong><p>${escape(money(selection.economics?.operatingMargin.low,data.brief.currency))}–${escape(money(selection.economics?.operatingMargin.high,data.brief.currency))}</p></article></div>`
      :'<p>Paid-ticket and financial ranges are unavailable. Add explicit sell-through assumptions or genuine outcomes sufficient for backtesting.</p>'}`;
    $('result-prices').innerHTML=`<h3>Price sensitivity</h3><div class="table-scroll"><table><thead><tr><th>Ticket price</th><th>Modeled paid tickets</th><th>Assumed paid tickets</th><th>Basis</th></tr></thead><tbody>${data.priceScenarios.map(row=>`<tr><td>${escape(money(row.ticketPrice,data.brief.currency))}</td><td>${row.modelTicketsSold?`${escape(row.modelTicketsSold.low)}–${escape(row.modelTicketsSold.high)}`:'Unavailable'}</td><td>${row.assumedTicketsSold??'Unavailable'}</td><td>${escape(row.basis)}</td></tr>`).join('')}</tbody></table></div>`;
    $('result-twin').innerHTML=data.audienceTwin?`<h3>Audience twin · synthetic profiles</h3><p>${escape(data.audienceTwin.originalSeedCount)} taste seeds clustered into ${escape(data.audienceTwin.clusterCount)} scenario segments. Assumed reachable pool ${escape(data.audienceTwin.audiencePool)}; overlap strength ${escape(data.audienceTwin.overlapAssumption)}. ${escape(data.audienceTwin.interpretation)}</p>
      ${data.audienceTwin.excludedSeedArtistIds.length?`<p class="warning">Seed artists excluded from twin-ranked lineup choices: ${escape(data.audienceTwin.excludedSeedArtistIds.join(', '))}. Qloo may omit an artist ranked against itself.</p>`:''}<div class="table-scroll"><table><thead><tr><th>Segment hypothesis</th><th>Pool weight</th><th>Scenario tickets</th><th>Sensitivity range</th><th>Incremental lineup coverage</th><th>Qloo receipts</th></tr></thead><tbody>${selection.twinScenario.segments.map(row=>`<tr><td>${escape(row.labels.join(' + '))}</td><td>${escape(Math.round(row.weight*100))}%</td><td>${escape(row.scenarioTickets)}</td><td>${escape(row.scenarioRange.low)}–${escape(row.scenarioRange.high)}</td><td>${escape(Math.round(row.incrementalCoverage*100))} points</td><td class="mono">${escape(row.receiptIds.join(', '))}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">The range changes intent and overlap assumptions. It has no statistical coverage guarantee. Segment memberships and buyer overlap were not observed. Qloo rank is mapped onto an illustrative 20–80% artist-response scale.</p><h3>Price response by segment</h3><div class="table-scroll"><table><thead><tr><th>Price</th><th>Assumed paid tickets</th>${selection.twinScenario.segments.map(row=>`<th>${escape(row.labels.join(' + '))}</th>`).join('')}<th>Scenario revenue</th></tr></thead><tbody>${data.audienceTwin.priceScenarios.map(row=>`<tr><td>${escape(money(row.price,data.brief.currency))}</td><td>${escape(row.ticketsSold.point)}</td>${row.segments.map(segment=>`<td>${escape(segment.scenarioTickets)}</td>`).join('')}<td>${escape(money(row.grossRevenue.point,data.brief.currency))}</td></tr>`).join('')}</tbody></table></div>
      <div class="row"><label>Competing events added<input id="twin-competition" type="number" min="0" max="10" value="1"></label><button id="twin-compare" type="button" class="quiet">Compare with first alternative</button></div><p id="twin-migration" role="status"></p>`:'';
    if(data.audienceTwin)$('twin-compare').onclick=async()=>{try{
      const alternative=data.alternatives[0];if(!alternative)throw new Error('No feasible alternative is available.');
      const result=await read(`/api/demand/twins/${encodeURIComponent(data.audienceTwin.id)}/compare`,{...state.lastRequest,originalIds:selection.selectedIds,changedIds:alternative.selectedIds,competitionIncrease:Number($('twin-competition').value)});
      $('twin-migration').textContent=`Alternative ${names(alternative.selectedIds)} with added competition: ${result.deltaScenarioTickets>=0?'+':''}${result.deltaScenarioTickets} scenario tickets. Segment shifts: ${result.segmentMigration.map(row=>`${row.labels.join(' + ')} ${row.deltaScenarioTickets>=0?'+':''}${row.deltaScenarioTickets}`).join('; ')}. No observed individual migration is implied.`;
    }catch(error){$('twin-migration').textContent=error.message;}};
    const cultural=selection.cultural;
    $('result-evidence').innerHTML=`<h3>Cultural and overlap evidence</h3><p>${escape(Math.round(cultural.rankCoverage*100))}% of selected artists have receipt-backed rank evidence. ${escape(cultural.observedOverlapPairs)}/${escape(cultural.totalPairs)} pairs have measured aggregate buyer-overlap observations. ${escape(cultural.culturalBridgeFraction)} is the fraction with a shared cultural theme, not unique buyers.</p>
      <div class="table-scroll"><table><thead><tr><th>Artist</th><th>Qloo source</th><th>Relative fit utility</th><th>Receipt IDs</th></tr></thead><tbody>${data.candidateEvidence.map(row=>`<tr><td>${escape(row.name)}</td><td>${escape(row.source)}</td><td>${row.rankFit==null?'Unknown':escape(row.rankFit)}</td><td class="mono">${escape(row.receiptIds.join(', ')||'None')}</td></tr>`).join('')}</tbody></table></div>
      <h3>Other feasible choices</h3><ul>${data.alternatives.map(row=>`<li>${escape(names(row.selectedIds))} · ${escape(money(row.fees,data.brief.currency))} fees · ${row.forecast?'modeled lower-margin objective '+escape(money(row.objective,data.brief.currency)):'proxy '+escape(row.cultural.proxy)}</li>`).join('')||'<li>No alternative met the constraints.</li>'}</ul>`;
    $('result-limits').innerHTML=`<h3>What this result cannot prove</h3>${data.caveats.map(note=>`<p class="warning">${escape(note)}</p>`).join('')}`;
    if(data.forecastId)$('outcome-form').elements.namedItem('forecastId').value=data.forecastId;
  }
  $('unlock').onclick=async()=>{window.organizerAccess.setToken($('token').value.trim());$('token').value='';
    try{const access=await read('/api/access');$('access-state').textContent=access.editable?'Organizer access enabled.':'This token does not unlock the server.';}catch(error){$('access-state').textContent=error.message;}await refreshModel();};
  $('lock').onclick=()=>{window.organizerAccess.clear();$('access-state').textContent='Read-only until unlocked.';void refreshModel();};
  $('add-artist').onclick=()=>{try{artistRow();}catch(error){$('plan-status').textContent=error.message;}};
  $('load-source').onclick=async()=>{try{const id=value('sourceId');if(!id)throw new Error('Enter a saved source ID first.');const source=await read('/api/memo/'+encodeURIComponent(id));
    form.elements.namedItem('city').value=source.memo.input.city;
    $('artists').replaceChildren();for(const item of source.memo.items.slice(0,20))artistRow({id:item.id,name:item.name,fee:item.terms?.fee,genre:item.terms?.genre,available:item.terms?.available});
    const defaults=[...(source.memo.input.anchorIds||[]),...source.memo.items.map(item=>item.id)];
    [...$('twin-seeds').children].forEach((row,index)=>{row.querySelector('[data-twin=anchorIds]').value=defaults[index]||defaults[0]||'';});
    state.twinId=null;$('twin-receipts').replaceChildren();$('twin-status').textContent='Taste seeds loaded. Research their Qloo rankings to activate a synthetic audience scenario.';
    $('plan-status').textContent=`Loaded ${Math.min(source.memo.items.length,20)} artists. Confirm fees, availability, capacity and date before calculating.`;
  }catch(error){$('plan-status').textContent=error.message;}};
  $('research-twin').onclick=async()=>{const button=$('research-twin');button.disabled=true;$('twin-status').textContent='Researching Qloo relative rankings for each taste seed…';
    try{const request={...requestFromForm(),segmentSeeds:twinSeeds(),audiencePool:numeric('audiencePool'),overlapAssumption:numeric('overlapAssumption')};
      if(!request.sourceId)throw new Error('Load a saved Qloo source first.');
      const twin=await read('/api/demand/twins',request);state.twinId=twin.id;
      $('twin-status').textContent=`Saved audience twin ${twin.id}: ${twin.clusterCount} synthetic segments from ${twin.originalSeedCount} ${twin.synthetic?'synthetic fixture':'Qloo'} rank patterns. ${twin.excludedSeedArtistIds.length?`${twin.excludedSeedArtistIds.length} seed artist(s) excluded from ranked lineup choices. `:''}Use Analyze to optimize against its declared assumptions.`;
      $('twin-receipts').innerHTML=`<details><summary>Inspect segment-research receipts</summary><ul>${twin.receipts.map(receipt=>`<li class="mono">${escape(receipt.id)} · ${escape(receipt.source)} · ${escape(receipt.status)} · ${escape(receipt.summary)}</li>`).join('')}</ul></details>`;
    }catch(error){state.twinId=null;$('twin-receipts').replaceChildren();$('twin-status').textContent=error.message;}finally{button.disabled=false;}};
  form.onsubmit=async event=>{event.preventDefault();$('plan-status').textContent='Enumerating exact feasible lineups…';
    const submit=form.querySelector('button[type=submit]');submit.disabled=true;
    try{const request={...requestFromForm(),twinId:state.twinId||undefined};
      const result=await read('/api/demand/plan',request);renderPlan(result,request);$('plan-status').textContent='Decision calculated. No new Qloo or LLM calls were made.';$('results').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){$('plan-status').textContent=error.message;}finally{submit.disabled=false;}};
  $('outcome-form').onsubmit=async event=>{event.preventDefault();const f=event.currentTarget;
    try{const result=await read('/api/demand/outcomes',{forecastId:f.elements.namedItem('forecastId').value.trim(),paidTicketsSold:Number(f.elements.namedItem('paidTicketsSold').value),sourceKind:f.elements.namedItem('sourceKind').value,sourceReference:f.elements.namedItem('sourceReference').value.trim()});
      $('outcome-status').textContent=`Outcome recorded as ${result.provenance.classification}. ${result.forecastError==null?'No pre-event paid-ticket forecast existed.':`Forecast error: ${result.forecastError} tickets.`}${result.twinComparison?` Audience Twin scenario error: ${result.twinComparison.signedError} tickets; ${result.twinComparison.withinSensitivityRange?'inside':'outside'} the assumption-sensitivity range.`:''}`;await refreshModel();
    }catch(error){$('outcome-status').textContent=error.message;}};
  $('historical-submit').onclick=async()=>{try{const result=await read('/api/demand/historical-events',JSON.parse($('historical-json').value));
    $('historical-status').textContent=`Imported ${result.id}: ${result.provenance.classification}.`;await refreshModel();
  }catch(error){$('historical-status').textContent=error.message;}};
  for(let index=0;index<4;index++)artistRow();
  form.elements.namedItem('eventDate').value=new Date(Date.now()+45*864e5).toISOString().slice(0,10);
  void refreshModel();
})();
