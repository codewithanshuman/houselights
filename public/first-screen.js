/* The Booking Desk's four-step path, hydrated from data inlined at build time
   (scripts/build-judge-static.mjs), so the first screen needs no API call.
   1 brief · 2 bill (why, near-tie, your call) · 3 withdraw Qloo evidence · 4 receipt.
   The Qloo switch flips between two results computed by the same zero-call
   judgeExperiment the Booking Desk runs; "Re-run it live" runs it again on the server. */
'use strict';
(()=>{
  const dataNode=document.getElementById('judge-static');
  if(!dataNode||!window.HL)return;
  const {e,money,signedMoney,affinity,fetchJSON,state}=window.HL;
  const data=JSON.parse(dataNode.textContent),cur=data.brief.currency||'USD';
  const $=id=>document.getElementById(id);
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  // A control can still be disabled while the case loads; focus it as soon as it is ready
  // (for up to ten seconds) so the jump never leaves focus behind.
  const reveal=target=>{
    target.scrollIntoView({block:'start',behavior:reduced()?'instant':'smooth'});
    const until=Date.now()+10000,focus=()=>{if(!target.disabled){target.focus({preventScroll:true});return;}if(Date.now()<until)setTimeout(focus,120);};
    focus();
  };
  const badge=basis=>`<span class="fit-badge ${basis==='Qloo affinity'?'fit-badge-affinity':'fit-badge-ordinal'}">Fit: ${e(basis)}</span>`;
  const bill=row=>`${row.names.join(' + ')} (${money(row.totalFee,cur)})`;

  // ── First screen: the Qloo evidence switch ─────────────────────────────────────
  const sw=$('qloo-switch'),diff=$('fs-diff'),announce=$('fs-announce');
  const diffHtml=()=>`<p><strong>${e(signedMoney(data.diff.feeChange,cur))}</strong> in artist fees</p><ul class="fs-diff-acts"><li class="act-out"><span class="act-mark" aria-hidden="true">−</span><span><span class="sr-only">Leaves the bill: </span>${e(data.diff.leaving.join(', ')||'nobody')}</span></li><li class="act-in"><span class="act-mark" aria-hidden="true">+</span><span><span class="sr-only">Enters the bill: </span>${e(data.diff.entering.join(', ')||'nobody')}</span></li></ul>`;
  function setSwitch(on,{speak=true}={}){
    const row=on?data.withQloo:data.withoutQloo;
    sw.setAttribute('aria-checked',String(on));$('qloo-switch-state').textContent=on?'on':'off';
    $('fs-bill').textContent=row.names.join(' + ');$('fs-fee').textContent=money(row.totalFee,cur);
    document.getElementById('first-screen').classList.toggle('is-qloo-off',!on);
    diff.hidden=on;diff.innerHTML=on?'':diffHtml();
    if(!reduced()){const h=$('fs-bill');h.classList.remove('decision-changed');void h.offsetWidth;h.classList.add('decision-changed');}
    if(speak)announce.textContent=on?`Qloo evidence on. The bill is ${bill(data.withQloo)}.`:`Decision changed. Without Qloo evidence the bill is ${bill(data.withoutQloo)}, ${signedMoney(data.diff.feeChange,cur)}.`;
  }
  sw?.addEventListener('click',()=>setSwitch(sw.getAttribute('aria-checked')!=='true'));

  // ── Step 1: the brief ──────────────────────────────────────────────────────────
  $('step-brief-body').innerHTML=`<dl class="brief-facts"><div><dt>City</dt><dd>${e(data.brief.city)}</dd></div><div><dt>Audience</dt><dd>Fans of ${e(data.brief.anchors.join(', '))}</dd></div><div><dt>Slots</dt><dd>${e(data.brief.slots)}</dd></div><div><dt>Artist budget</dt><dd>${e(money(data.brief.budget,cur))}</dd></div><div><dt>Candidates</dt><dd>${e(data.brief.candidates)} acts, illustrative fees</dd></div></dl>`;

  // ── Step 3: withdraw Qloo evidence ─────────────────────────────────────────────
  $('step-withdraw-body').innerHTML=`<div class="bill-diff"><div><small>WITH QLOO EVIDENCE</small><strong>${e(data.withQloo.names.join(' + '))}</strong><span>${e(money(data.withQloo.totalFee,cur))}</span></div><div aria-hidden="true" class="bill-diff-arrow">→</div><div><small>WITHOUT QLOO EVIDENCE</small><strong>${e(data.withoutQloo.names.join(' + '))}</strong><span>${e(money(data.withoutQloo.totalFee,cur))}</span></div></div>
    <div class="fs-diff">${diffHtml()}</div>
    <p class="path-note">${badge(data.fitBasis.bookingDesk)} Same candidates, fees, budget and rules; only the saved Qloo evidence is removed. ${data.sameBillUnderAffinity?'Qloo affinity scoring picks the same bill. ':''}This shows Qloo changes the decision, not that it sells more tickets.</p>
    <button type="button" class="button primary" id="glance-withdraw">Re-run it live in the Booking Desk ↓</button> <span id="glance-withdraw-note" class="path-note" role="status"></span>`;

  // ── Step 4: receipts ───────────────────────────────────────────────────────────
  $('step-receipt-body').innerHTML=`<p class="path-note">Every act links to the saved Qloo rank response that scored it.</p><ul class="receipt-buttons">${data.acts.filter(act=>act.rankReceipt).map(act=>`<li><button type="button" class="button subtle" data-receipt="${e(act.rankReceipt)}" data-entity="${e(act.name)}">${e(act.name)} · Qloo receipt ${e(act.rankReceipt)}</button></li>`).join('')}</ul>`;

  // ── Step 2: the bill, from the recorded live run ───────────────────────────────
  const glance=$('decision-glance-body');
  const plain=text=>String(text).replace(/[−-]?\d+(?:\.\d+)? policy points?(?:, )?/g,'').replace(/\s*\(\)/g,'');
  function nearTieFigure(tie){
    if(!tie)return '';
    const [a,b]=tie.scores,hi=Math.max(a,b),lo=hi-tie.band,min=lo-tie.band*.5,max=hi+tie.band*.5,x=v=>((v-min)/(max-min))*100;
    return `<figure class="near-tie" aria-labelledby="near-tie-caption"><svg viewBox="0 0 100 34" role="img" aria-label="${e(`${tie.names[0]} ${affinity(a)} and ${tie.names[1]} ${affinity(b)}: ${affinity(tie.spread)} apart, inside the ${tie.band} near-tie band.`)}" preserveAspectRatio="none">
      <rect class="near-tie-band" x="${x(lo).toFixed(2)}" y="6" width="${(x(hi)-x(lo)).toFixed(2)}" height="18"></rect>
      <line class="near-tie-axis" x1="0" y1="24" x2="100" y2="24"></line>
      <line class="near-tie-mark" x1="${x(a).toFixed(2)}" y1="4" x2="${x(a).toFixed(2)}" y2="26"></line>
      <line class="near-tie-mark near-tie-mark-b" x1="${x(b).toFixed(2)}" y1="4" x2="${x(b).toFixed(2)}" y2="26"></line></svg>
      <figcaption id="near-tie-caption"><span><strong>${e(tie.names[0])}</strong> ${e(affinity(a))}</span><span><strong>${e(tie.names[1])}</strong> ${e(affinity(b))}</span><span>Shaded: the ${e(tie.band)} near-tie band. They are ${e(affinity(tie.spread))} apart.</span><span class="coin-flip">Coin flip, your call.</span></figcaption></figure>`;
  }
  async function loadGlance(){
    state(glance,{kind:'loading'});
    try{
      const file=await fetchJSON('/autopilot-recorded.json',{timeout:15000,retries:1}),p=file.run.packet,rec=p.recommendation;
      if(!rec){state(glance,{kind:'empty',title:'No feasible bill',text:'The recorded run found no bill that satisfies every rule.'});return;}
      const why=rec.artists.map(artist=>{const act=data.acts.find(row=>row.name===artist.name);return `<li><strong>${e(artist.name)}</strong>: Qloo affinity ${e(affinity(act?.affinity))} with ${e(data.brief.anchors.join(', '))} fans in ${e(data.brief.city)}. Cultural fit, not ticket demand.</li>`;});
      const risks=p.robustness.vulnerabilities.filter(row=>['critical','high'].includes(row.severity)).slice(0,2).map(row=>plain(row.text));
      const decision=p.actions.find(row=>row.type==='approval'&&!/^Approve /.test(row.text))??p.actions.find(row=>row.type==='approval');
      glance.setAttribute('aria-busy','false');
      glance.innerHTML=`<p class="glance-kicker">RECORDED LIVE QLOO RUN · ${e(data.brief.city.toUpperCase())} · ${e(String(file.capturedAt).slice(0,10))} · REPLAYED, NO NEW CALLS</p>
        <div class="glance-grid">
          <div class="glance-book"><small>BOOK</small><strong>${e(rec.names.join(' + '))}</strong><span>${e(money(rec.totalFee,cur))} of ${e(money(data.brief.budget,cur))} · every booking rule passes</span>${badge(data.fitBasis.recordedRun)}</div>
          <div><small>WHY</small><ul>${why.join('')}</ul></div>
          <div><small>WATCH OUT</small><ul>${risks.map(row=>`<li>${e(row)}</li>`).join('')||'<li>No high-severity risk found in the stress test.</li>'}</ul></div>
          <div><small>YOUR CALL</small><p>${e(decision?.text??'Approve the planning bill before any hold request is sent.')}</p></div>
        </div>${nearTieFigure(data.nearTie)}
        <p class="glance-limit">Fees are illustrative. Qloo affinity is cultural fit, not ticket demand. Nothing has been booked.</p>
        <div class="glance-links"><a class="button subtle" href="#judge-tight-budget" data-glance-scroll>Try a budget cut ↓</a><a class="button subtle" href="#go-deeper-autopilot" data-glance-scroll>See how Autopilot decided ↓</a><a class="button subtle" href="/workspace.html#example">See it plan a brand-new event ↗</a></div>`;
      glance.querySelectorAll('[data-glance-scroll]').forEach(link=>link.addEventListener('click',event=>{
        const target=document.getElementById(link.getAttribute('href').slice(1));if(!target)return;
        event.preventDefault();if(target.tagName==='DETAILS'){target.open=true;}reveal(target.tagName==='DETAILS'?target.querySelector('summary'):target);
      }));
    }catch(problem){state(glance,{kind:problem.kind??'server',text:`${problem.message} The bill above is from the published record and does not depend on this.`,retry:loadGlance});}
  }
  void loadGlance();

  // ── Step 3 live re-run: drives the Booking Desk's own matched comparison ───────
  const wait=async(test,ms=20000)=>{const until=Date.now()+ms;while(Date.now()<until){const value=test();if(value)return value;await new Promise(resolve=>setTimeout(resolve,150));}return null;};
  $('glance-withdraw')?.addEventListener('click',async event=>{
    const button=event.currentTarget,note=$('glance-withdraw-note');button.disabled=true;note.textContent='Re-running the same brief with saved Qloo evidence withdrawn…';
    const select=$('judge-case'),compare=$('judge-qloo-compare');
    try{
      if(select&&select.value!==data.caseId&&[...select.options].some(option=>option.value===data.caseId)){select.value=data.caseId;select.dispatchEvent(new Event('change'));}
      if(!await wait(()=>compare&&!compare.disabled&&select?.value===data.caseId&&!$('judge-workspace')?.hidden&&$('judge-title')?.textContent.trim()))throw new Error('The Booking Desk is still loading.');
      document.querySelector('.judge-evidence-comparison')?.remove();compare.click();
      const comparison=await wait(()=>document.querySelector('.judge-evidence-comparison'));
      if(!comparison)throw new Error(document.getElementById('judge-status')?.textContent||'The re-run did not complete.');
      comparison.setAttribute('tabindex','-1');reveal(comparison);
      note.textContent=`Done: ${comparison.querySelector('p strong')?.textContent??'comparison ready.'}`;
    }catch(error){note.textContent=`${error.message} Use "Compare with Qloo evidence removed" in the Booking Desk below.`;}
    finally{button.disabled=false;}
  });

  // ── Receipt drawer: the saved row, the entity highlighted, digests and integrity ─
  const drawer=$('receipt-drawer'),drawerBody=$('receipt-drawer-body');let opener=null,staticFile=null;
  async function openReceipt(id,entity,trigger){
    opener=trigger??document.activeElement;
    drawer.showModal?drawer.showModal():drawer.setAttribute('open','');
    $('receipt-drawer-title').textContent=`Saved Qloo receipt ${id}`;
    state(drawerBody,{kind:'loading'});
    try{
      staticFile??=await fetchJSON('/judge-static.json',{timeout:12000,retries:1});
      const receipt=staticFile.receipts.find(row=>row.id===id);
      if(!receipt){state(drawerBody,{kind:'empty',title:'Receipt not published',text:`Receipt ${id} is not in the published record.`});return;}
      const same=name=>String(name??"").toLowerCase()===String(entity??"").toLowerCase();const ok=receipt.integrity.matchesManifest,pin=staticFile.integrity.pinMatches;
      drawerBody.setAttribute('aria-busy','false');
      drawerBody.innerHTML=`<dl class="receipt-facts"><div><dt>Tool</dt><dd>${e(receipt.tool)}</dd></div><div><dt>Status</dt><dd>${e(receipt.status)}</dd></div><div><dt>Fetched</dt><dd>${e(String(receipt.fetchedAt??'').replace('T',' ').slice(0,19))} UTC</dd></div><div><dt>Why it was asked</dt><dd>${e(receipt.why??'—')}</dd></div></dl>
        ${receipt.rows.length?`<div class="table-scroll"><table class="data-table"><caption>What Qloo returned${entity?` (highlighted: ${e(entity)})`:''}</caption><thead><tr><th scope="col">Artist</th><th scope="col">Qloo affinity</th></tr></thead><tbody>${receipt.rows.map(row=>`<tr${same(row.name)?' class="is-highlight" aria-current="true"':''}><th scope="row">${same(row.name)?'<mark>':''}${e(row.name??row.id)}${same(row.name)?'</mark>':''}</th><td>${e(affinity(row.affinity))}</td></tr>`).join('')}</tbody></table></div>`:'<p>No result rows were preserved in the public copy.</p>'}
        <div class="integrity ${ok&&pin?'integrity-ok':'integrity-bad'}"><strong>${ok&&pin?'✓ Integrity check passed':'✗ Integrity check failed'}</strong><p>${ok?'This receipt matches its digest in the run manifest':'This receipt does not match its digest in the run manifest'}${pin?', and the manifest matches its independently pinned digest.':', and the manifest does not match its pinned digest.'}</p>
        <dl class="digests"><div><dt>Content digest</dt><dd><code>${e(receipt.integrity.contentDigest)}</code></dd></div><div><dt>Capture-time digest</dt><dd><code>${e(receipt.originalDigest??'not preserved')}</code></dd></div><div><dt>Pinned manifest</dt><dd><code>${e(staticFile.integrity.pinnedDigest)}</code></dd></div></dl>
        <p class="path-note">${e(staticFile.integrity.providerProvenance)}</p></div>`;
    }catch(problem){state(drawerBody,{kind:problem.kind??'server',text:problem.message,retry:()=>openReceipt(id,entity,opener)});}
  }
  const closeDrawer=()=>{drawer.close?drawer.close():drawer.removeAttribute('open');opener?.focus?.();};
  $('receipt-drawer-close')?.addEventListener('click',closeDrawer);
  drawer?.addEventListener('cancel',event=>{event.preventDefault();closeDrawer();});
  drawer?.addEventListener('click',event=>{if(event.target===drawer)closeDrawer();});
  $('step-receipt-body').addEventListener('click',event=>{const button=event.target.closest('[data-receipt]');if(button)void openReceipt(button.dataset.receipt,button.dataset.entity,button);});

  // Step links are wired by booking-journey.js, which moves focus to each step.
  // Autopilot's scripts and styles load only when its "Go deeper" panel is opened (or linked to), so
  // the first screen does not pay for them. autopilot.js announces booking:ready and judge.js
  // answers with the current case, so a late load still receives the state.
  function loadLazyScripts(panel){
    if(!panel||panel.dataset.lazyLoaded)return;panel.dataset.lazyLoaded='true';
    for(const href of (panel.dataset.lazyStyles||'').split(/\s+/).filter(Boolean)){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.appendChild(link);}
    let chain=Promise.resolve();
    for(const src of panel.dataset.lazyScripts.split(/\s+/).filter(Boolean))chain=chain.then(()=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.head.appendChild(script);}));
    chain.catch(()=>{panel.querySelector('#autopilot-status')&&(panel.querySelector('#autopilot-status').textContent='Autopilot could not load. Reload the page to try again.');});
  }
  document.querySelectorAll('details[data-lazy-scripts]').forEach(panel=>{
    panel.addEventListener('toggle',()=>{if(panel.open)loadLazyScripts(panel);});
    // Case IDs can start with a digit, which is not a valid CSS selector: look up by ID.
    const target=location.hash.length>1?document.getElementById(decodeURIComponent(location.hash.slice(1))):null;
    if(panel.open||(target&&panel.contains(target))){panel.open=true;loadLazyScripts(panel);}
  });
  window.HLFirstScreen={setSwitch,openReceipt};
})();
