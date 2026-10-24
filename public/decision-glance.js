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
    const risks=p.robustness.vulnerabilities.filter(row=>['critical','high'].includes(row.severity)).slice(0,2).map(row=>row.text);
    const decision=p.actions.find(row=>row.type==='approval'&&!/^Approve /.test(row.text))??p.actions.find(row=>row.type==='approval');
    box.innerHTML=`<p class="glance-kicker">RECORDED LIVE QLOO RUN · ${e(p.brief.city.toUpperCase())} · ${e(file.capturedAt.slice(0,10))} · REPLAYED, NO NEW CALLS</p>
      <div class="glance-grid">
        <div class="glance-book"><small>BOOK</small><strong>${e(rec.names.join(' + '))}</strong><span>${e(money(rec.totalFee))} of a ${e(money(p.brief.budget))} artist budget · ${e(p.brief.slots)} slots</span></div>
        <div><small>WHY</small><ul>${why.map(row=>`<li>${e(row)}</li>`).join('')}</ul></div>
        <div><small>WATCH OUT</small><ul>${risks.map(row=>`<li>${e(row)}</li>`).join('')||'<li>No high-severity risk found in the stress test.</li>'}</ul></div>
        <div><small>YOUR CALL</small><p>${e(decision?.text??'Approve the planning bill before any hold request is sent.')}</p></div>
      </div>
      <p class="glance-limit">Fees are illustrative. Qloo affinity is cultural fit, not ticket demand. Nothing has been booked.</p>
      <div class="glance-links"><a class="button primary" href="#booking-autopilot" data-judge-scroll>See how Autopilot decided ↓</a><a class="button subtle" href="/workspace.html#example">See it plan a brand-new event ↗</a></div>`;
  }).catch(()=>{box.textContent='The recorded decision could not be loaded. The booking desk below still works.';});
})();
