/* The Booking Desk's one path: the brief → the optimized slate → withdraw Qloo evidence
   → the decision changes → open the receipt behind it. Steps 1–2 come from the recorded
   packet; steps 3–4 drive the real Booking Desk controls below (the same zero-call
   experiment and receipt links), so nothing on this card is simulated. */
'use strict';
(()=>{
  const box=document.getElementById('decision-glance-body');
  if(!box)return;
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const smooth=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
  const reveal=target=>{target.scrollIntoView({block:'center',behavior:smooth()});target.focus({preventScroll:true});};
  const wait=async(test,ms=20000)=>{const until=Date.now()+ms;while(Date.now()<until){const value=test();if(value)return value;await new Promise(resolve=>setTimeout(resolve,150));}return null;};
  fetch('/autopilot-recorded.json',{signal:AbortSignal.timeout(15000)}).then(response=>{if(!response.ok)throw new Error();return response.json();}).then(file=>{
    const p=file.run.packet,rec=p.recommendation,money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:file.run.currency,maximumFractionDigits:0}).format(value);
    if(!rec){box.textContent='The recorded run found no feasible booking.';return;}
    const why=rec.artists.map(artist=>`${artist.name}: ${artist.claims[0]?.text??'no Qloo rank'}`);
    // Policy-point figures are explained further down; the first screen keeps the plain sentence.
    const plain=text=>String(text).replace(/[−-]?\d+(?:\.\d+)? policy points?(?:, )?/g,'').replace(/\s*\(\)/g,'');
    const risks=p.robustness.vulnerabilities.filter(row=>['critical','high'].includes(row.severity)).slice(0,2).map(row=>plain(row.text));
    const decision=p.actions.find(row=>row.type==='approval'&&!/^Approve /.test(row.text))??p.actions.find(row=>row.type==='approval');
    const brief=p.brief;
    box.innerHTML=`<p class="glance-kicker">RECORDED LIVE QLOO RUN · ${e(brief.city.toUpperCase())} · ${e(file.capturedAt.slice(0,10))} · REPLAYED, NO NEW CALLS</p>
      <ol class="glance-path">
        <li class="glance-step"><small>1 · THE BRIEF</small><p>${e(brief.slots)} slots in ${e(brief.city)} for listeners of ${e((brief.anchors??[]).join(', '))}: ${e(money(brief.budget))} artist budget, ${e(brief.candidates)} candidate acts with illustrative fees.</p></li>
        <li class="glance-step"><small>2 · THE OPTIMIZED SLATE</small>
          <div class="glance-grid">
            <div class="glance-book"><small>BOOK</small><strong>${e(rec.names.join(' + '))}</strong><span>${e(money(rec.totalFee))} of ${e(money(brief.budget))} · every booking rule passes</span></div>
            <div><small>WHY</small><ul>${why.map(row=>`<li>${e(row)}</li>`).join('')}</ul></div>
            <div><small>WATCH OUT</small><ul>${risks.map(row=>`<li>${e(row)}</li>`).join('')||'<li>No high-severity risk found in the stress test.</li>'}</ul></div>
            <div><small>YOUR CALL</small><p>${e(decision?.text??'Approve the planning bill before any hold request is sent.')}</p></div>
          </div></li>
        <li class="glance-step"><small>3 · WITHDRAW QLOO EVIDENCE</small>
          <p class="glance-qloo" id="glance-qloo" aria-live="polite"><span>Loading the matched comparison…</span></p>
          <button type="button" class="button primary" id="glance-withdraw">Withdraw Qloo evidence and re-run ↓</button></li>
        <li class="glance-step"><small>4 · CHECK THE RECEIPT</small>
          <p id="glance-receipt-note">After the re-run, open the saved Qloo receipt behind the change.</p>
          <button type="button" class="button subtle" id="glance-receipt" disabled>Open the receipt ↓</button></li>
      </ol>
      <p class="glance-limit">Fees are illustrative. Qloo affinity is cultural fit, not ticket demand. Nothing has been booked.</p>
      <div class="glance-links"><a class="button subtle" href="#judge-tight-budget" data-glance-scroll>Try a budget cut ↓</a><a class="button subtle" href="#booking-autopilot" data-glance-scroll>See how Autopilot decided ↓</a><a class="button subtle" href="/workspace.html#example">See it plan a brand-new event ↗</a></div>`;
    // The glance renders after judge.js wires its scroll links, so it moves focus itself.
    box.querySelectorAll('[data-glance-scroll]').forEach(link=>link.addEventListener('click',event=>{
      const target=document.getElementById(link.getAttribute('href').slice(1));if(!target)return;
      event.preventDefault();reveal(target);
    }));
    const withdraw=document.getElementById('glance-withdraw'),receipt=document.getElementById('glance-receipt'),note=document.getElementById('glance-receipt-note');
    // Step 3 runs the Booking Desk's own "Compare with Qloo evidence removed" on the recorded case.
    withdraw.addEventListener('click',async()=>{
      withdraw.disabled=true;note.textContent='Re-running the same brief with saved Qloo evidence withdrawn…';
      const caseSelect=document.getElementById('judge-case'),compare=document.getElementById('judge-qloo-compare');
      try{
        if(caseSelect&&caseSelect.value!==file.caseId&&[...caseSelect.options].some(option=>option.value===file.caseId)){caseSelect.value=file.caseId;caseSelect.dispatchEvent(new Event('change'));}
        // judge.js reveals the workspace and fills the title once a case has loaded.
        if(!await wait(()=>compare&&!compare.disabled&&caseSelect?.value===file.caseId&&!document.getElementById('judge-workspace')?.hidden&&document.getElementById('judge-title')?.textContent.trim()))throw new Error('The Booking Desk is still loading.');
        document.querySelector('.judge-evidence-comparison')?.remove();
        compare.click();
        const comparison=await wait(()=>document.querySelector('.judge-evidence-comparison'));
        if(!comparison)throw new Error('The re-run did not complete.');
        reveal(comparison);comparison.setAttribute('tabindex','-1');comparison.focus({preventScroll:true});
        const link=comparison.querySelector('[data-receipt-index]');
        receipt.disabled=!link;note.textContent=link?`Done. ${comparison.querySelector('p strong')?.textContent??''} Open the saved receipt behind the change.`:'Done. This comparison lists no receipt for a changed artist.';
      }catch(error){note.textContent=`${error.message} Use "Compare with Qloo evidence removed" in the Booking Desk below.`;}
      finally{withdraw.disabled=false;}
    });
    // Step 4 opens the first receipt the comparison links, exactly as clicking it would.
    receipt.addEventListener('click',()=>{
      const link=document.querySelector('.judge-evidence-comparison [data-receipt-index]');if(!link)return;
      link.click();const opened=document.querySelector('#judge-receipts details[open]');if(opened)reveal(opened.querySelector('summary')??opened);
    });
    void qlooContribution(file);
  }).catch(()=>{box.textContent='The recorded decision could not be loaded. The Booking Desk below still works.';});
  // A matched comparison: the same zero-call judgeExperiment the Booking Desk runs,
  // with saved Qloo evidence on and withdrawn (same case, pool, fees and budget).
  // It is published as a static file, checked by tests/qloo-contribution.test.mjs,
  // so page views do not spend the shared per-minute experiment quota.
  async function qlooContribution(file){
    const line=document.getElementById('glance-qloo');if(!line||!file.caseId)return;
    try{
      const response=await fetch('/qloo-contribution.json',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error();
      const result=await response.json();if(result.caseId!==file.caseId)throw new Error();
      const money=value=>value==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:result.currency||file.run.currency||'USD',maximumFractionDigits:0}).format(value);
      const bill=row=>row.names.length?`${row.names.join(' + ')} (${money(row.totalFee)})`:'no feasible bill';
      line.querySelector('span').innerHTML=!result.changed
        ?`Same pool, fees and ${e(money(result.budget))} budget: the optimizer books ${e(bill(result.withQloo))} with or without Qloo evidence. Qloo did not change this bill.`
        :`Same pool, fees and ${e(money(result.budget))} budget: with Qloo evidence the optimizer books <strong>${e(bill(result.withQloo))}</strong>; with it withdrawn, <strong>${e(bill(result.withoutQloo))}</strong>. Qloo changed the bill. This shows influence on the decision, not more ticket sales.`;
    }catch{line.querySelector('span').textContent='The matched comparison could not be loaded. Use the button to run it in the Booking Desk below.';}
  }
})();
