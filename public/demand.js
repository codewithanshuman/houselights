'use strict';
(() => {
  const $=id=>document.getElementById(id),form=$('plan-form');
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=(value,currency)=>value==null?'Unknown':new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(value);
  const read=async(path,body)=>{const response=await fetch(path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);
    const data=await response.json();if(!response.ok)throw new Error(data.error||`Request failed (${response.status}).`);return data;};
  const value=name=>form.elements.namedItem(name)?.value?.trim()??'';
  const numeric=name=>value(name)===''?null:Number(value(name));
  const state={last:null};
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
  function renderModel(data){
    $('model-status').textContent=data.status==='backtested'
      ?`${data.eligible} eligible sourced outcomes. Chronological holdout: ${data.heldOut} later events.`
      :`${data.eligible??0} eligible real outcomes of ${data.required??40} needed. Attendance forecasting is disabled.`;
    $('model-details').innerHTML=data.status==='backtested'
      ?`<p>Baseline held-out occupancy MAE: <strong>${escape(data.baseline?.mae)}</strong>. ${data.qlooComparison?
        `Matched Qloo cohort: ${escape(data.qlooComparison.cohort)} events; no-Qloo MAE ${escape(data.qlooComparison.withoutQloo.mae)}, Qloo MAE ${escape(data.qlooComparison.withQloo.mae)}. ${data.qlooComparison.qlooImproved?'Qloo improved this holdout.':'Qloo did not improve this holdout.'}`:
        'A paired Qloo versus no-Qloo holdout is not yet available.'}</p>`
      :`<p>${escape(data.reason||'No model is active.')}</p>`;
    if(data.reported?.count) $('model-details').innerHTML+=`<p>Source catalog: ${escape(data.reported.count)} publisher-reported outcomes, including ${escape(data.reported.singleShow)} single-show rows. They have no timestamped pre-event predictors, so none train the model. <a href="/api/demand/reported-outcomes">Inspect private source rows</a>.</p>`;
  }
  async function refreshModel(){try{renderModel(await read('/api/demand/model'));}catch(error){$('model-status').textContent=error.message;$('model-details').textContent='Unlock organizer access to inspect private training records.';}}
  function renderPlan(data,request){
    state.last=data;$('results').hidden=false;
    $('result-mode').textContent=data.status==='infeasible'?'No feasible lineup':data.mode==='backtested_observational_forecast'?'Backtested observational forecast':'Cultural scenario proxy · not attendance prediction';
    if(data.status!=='feasible'){$('result-summary').textContent=data.reasons.join(' ');return;}
    const names=ids=>ids.map(id=>request.candidates.find(item=>item.id===id)?.name||id).join(' + ');
    const selection=data.selected,att=selection.forecast?.attendance||selection.scenario;
    $('result-summary').innerHTML=`<p><strong>${escape(names(selection.selectedIds))}</strong></p><p><span class="metric">${escape(data.feasibleCount)} feasible of ${escape(data.checkedCount)} exact combinations</span><span class="metric">${escape(money(selection.fees,data.brief.currency))} artist fees</span><span class="metric">${escape(selection.cultural.proxy)} cultural proxy points</span></p>
      <p>${escape(data.objective)}</p>${data.forecastId?`<p class="mono">Saved pre-event forecast ID: ${escape(data.forecastId)}</p>`:''}`;
    $('result-financial').innerHTML=`<h3>Attendance and economics</h3>${att
      ?`<div class="result-grid"><article><strong>${selection.forecast?'Modeled attendance range':'Assumed attendance stress'}</strong><p>${escape(att.low)}–${escape(att.high)} · central ${escape(att.point)}</p></article><article><strong>Gross revenue</strong><p>${escape(money(selection.economics?.grossRevenue.low,data.brief.currency))}–${escape(money(selection.economics?.grossRevenue.high,data.brief.currency))}</p></article><article><strong>Operating margin</strong><p>${escape(money(selection.economics?.operatingMargin.low,data.brief.currency))}–${escape(money(selection.economics?.operatingMargin.high,data.brief.currency))}</p></article></div>`
      :'<p>Attendance and financial ranges are unavailable. Add explicit sell-through assumptions or genuine outcomes sufficient for backtesting.</p>'}`;
    $('result-prices').innerHTML=`<h3>Price sensitivity</h3><div class="table-scroll"><table><thead><tr><th>Ticket price</th><th>Modeled attendance</th><th>Assumed attendance</th><th>Basis</th></tr></thead><tbody>${data.priceScenarios.map(row=>`<tr><td>${escape(money(row.ticketPrice,data.brief.currency))}</td><td>${row.modelAttendance?`${escape(row.modelAttendance.low)}–${escape(row.modelAttendance.high)}`:'Unavailable'}</td><td>${row.assumedAttendance??'Unavailable'}</td><td>${escape(row.basis)}</td></tr>`).join('')}</tbody></table></div>`;
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
    $('plan-status').textContent=`Loaded ${Math.min(source.memo.items.length,20)} artists. Confirm fees, availability, capacity and date before calculating.`;
  }catch(error){$('plan-status').textContent=error.message;}};
  form.onsubmit=async event=>{event.preventDefault();$('plan-status').textContent='Enumerating exact feasible lineups…';
    const submit=form.querySelector('button[type=submit]');submit.disabled=true;
    try{const request={sourceId:value('sourceId')||undefined,brief:{city:value('city'),venue:value('venue'),eventDate:value('eventDate'),capacity:numeric('capacity'),ticketPrice:numeric('ticketPrice'),currency:value('currency'),genre:value('genre'),competitionCount:numeric('competitionCount')},
      candidates:candidates(),constraints:{budget:numeric('budget'),slots:numeric('slots'),maxPerGenre:numeric('maxPerGenre')},
      assumptions:{baseSellThrough:numeric('baseSellThrough'),priceElasticity:numeric('priceElasticity'),fixedCosts:numeric('fixedCosts'),variableCostPerAttendee:numeric('variableCostPerAttendee')},
      save:form.elements.namedItem('save').checked};
      const result=await read('/api/demand/plan',request);renderPlan(result,request);$('plan-status').textContent='Decision calculated. No new Qloo or LLM calls were made.';$('results').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){$('plan-status').textContent=error.message;}finally{submit.disabled=false;}};
  $('outcome-form').onsubmit=async event=>{event.preventDefault();const f=event.currentTarget;
    try{const result=await read('/api/demand/outcomes',{forecastId:f.elements.namedItem('forecastId').value.trim(),paidAttendance:Number(f.elements.namedItem('paidAttendance').value),sourceKind:f.elements.namedItem('sourceKind').value,sourceReference:f.elements.namedItem('sourceReference').value.trim()});
      $('outcome-status').textContent=`Outcome recorded as ${result.provenance.classification}. ${result.forecastError==null?'No pre-event attendance forecast existed.':`Forecast error: ${result.forecastError} tickets.`}`;await refreshModel();
    }catch(error){$('outcome-status').textContent=error.message;}};
  $('historical-submit').onclick=async()=>{try{const result=await read('/api/demand/historical-events',JSON.parse($('historical-json').value));
    $('historical-status').textContent=`Imported ${result.id}: ${result.provenance.classification}.`;await refreshModel();
  }catch(error){$('historical-status').textContent=error.message;}};
  for(let index=0;index<4;index++)artistRow();
  form.elements.namedItem('eventDate').value=new Date(Date.now()+45*864e5).toISOString().slice(0,10);
  void refreshModel();
})();
