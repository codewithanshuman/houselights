/* "The decision at a glance": the recommended booking, why, the main risk and
   the human decision, drawn from the recorded packet before any mechanics. */
'use strict';
(()=>{
  const box=document.getElementById('decision-glance-body');
  if(!box)return;
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  fetch('/autopilot-recorded.json',{signal:AbortSignal.timeout(15000)}).then(response=>{if(!response.ok)throw new Error();return response.json();}).then(file=>{
    const p=file.run.packet,rec=p.recommendation,money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:file.run.currency,maximumFractionDigits:0}).format(value);
    if(!rec){box.textContent='The recorded run found no feasible booking.';return;}
    const why=rec.artists.map(artist=>`${artist.name}: ${artist.claims[0]?.text??'no Qloo rank'}`);
    // Policy-point figures are explained further down; the first screen keeps the plain sentence.
    const plain=text=>String(text).replace(/[−-]?\d+(?:\.\d+)? policy points?(?:, )?/g,'').replace(/\s*\(\)/g,'');
    const risks=p.robustness.vulnerabilities.filter(row=>['critical','high'].includes(row.severity)).slice(0,2).map(row=>plain(row.text));
    const decision=p.actions.find(row=>row.type==='approval'&&!/^Approve /.test(row.text))??p.actions.find(row=>row.type==='approval');
    box.innerHTML=`<p class="glance-kicker">RECORDED LIVE QLOO RUN · ${e(p.brief.city.toUpperCase())} · ${e(file.capturedAt.slice(0,10))} · REPLAYED, NO NEW CALLS</p>
      <div class="glance-grid">
        <div class="glance-book"><small>BOOK</small><strong>${e(rec.names.join(' + '))}</strong><span>${e(money(rec.totalFee))} of a ${e(money(p.brief.budget))} artist budget · ${e(p.brief.slots)} slots</span></div>
        <div><small>WHY</small><ul>${why.map(row=>`<li>${e(row)}</li>`).join('')}</ul></div>
        <div><small>WATCH OUT</small><ul>${risks.map(row=>`<li>${e(row)}</li>`).join('')||'<li>No high-severity risk found in the stress test.</li>'}</ul></div>
        <div><small>YOUR CALL</small><p>${e(decision?.text??'Approve the planning bill before any hold request is sent.')}</p></div>
      </div>
      <p class="glance-qloo" id="glance-qloo" aria-live="polite"><small>WHAT QLOO CHANGED</small> <span>Re-running this brief without Qloo evidence…</span></p>
      <p class="glance-limit">Fees are illustrative. Qloo affinity is cultural fit, not ticket demand. Nothing has been booked.</p>
      <div class="glance-links"><a class="button primary" href="#judge-tight-budget" data-glance-scroll>Try a budget cut ↓</a><a class="button subtle" href="#booking-autopilot" data-glance-scroll>See how Autopilot decided ↓</a><a class="button subtle" href="/workspace.html#example">See it plan a brand-new event ↗</a></div>`;
    // The glance renders after judge.js wires its scroll links, so it moves focus itself.
    box.querySelectorAll('[data-glance-scroll]').forEach(link=>link.addEventListener('click',event=>{
      const target=document.getElementById(link.getAttribute('href').slice(1));if(!target)return;
      event.preventDefault();target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});target.focus({preventScroll:true});
    }));
    void qlooContribution(file);
  }).catch(()=>{box.textContent='The recorded decision could not be loaded. The Booking Desk below still works.';});
  // A matched comparison from the existing zero-call experiment route: same case,
  // pool, fees and budget, with saved Qloo evidence on and then withdrawn.
  async function qlooContribution(file){
    const line=document.getElementById('glance-qloo');if(!line||!file.caseId)return;
    const run=async qlooOff=>{const response=await fetch(`/api/judge/cases/${encodeURIComponent(file.caseId)}/experiment`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({qlooOff}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error();const body=await response.json(),memo=body.snapshot.memo;return {ids:[...(memo.slate.selectedIds??[])].sort().join(),names:(memo.slate.selectedIds??[]).map(id=>memo.items.find(item=>item.id===id)?.name??id),fee:memo.slate.totalFee,budget:memo.constraints.budget,currency:memo.currency??file.run.currency};};
    try{
      const [on,off]=await Promise.all([run(false),run(true)]);
      const money=value=>value==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:on.currency||'USD',maximumFractionDigits:0}).format(value);
      const bill=row=>row.names.length?`${row.names.join(' + ')} (${money(row.fee)})`:'no feasible bill';
      line.querySelector('span').innerHTML=on.ids===off.ids
        ?`Same pool, fees and ${e(money(on.budget))} budget: the optimizer books ${e(bill(on))} with or without Qloo evidence. Qloo did not change this bill.`
        :`Same pool, fees and ${e(money(on.budget))} budget: with Qloo evidence the optimizer books <strong>${e(bill(on))}</strong>; with it withdrawn, <strong>${e(bill(off))}</strong>. Qloo changed the bill. This shows influence on the decision, not more ticket sales.`;
    }catch{line.querySelector('span').textContent='The with/without-Qloo comparison could not be loaded. Use "Turn off Qloo evidence" in the Booking Desk below.';}
  }
})();
