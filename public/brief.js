/* The promoter brief: one printable page for a plan, built only from its saved record. */
'use strict';
(()=>{
  const {e,money,fetchJSON}=window.HL,$=id=>document.getElementById(id),box=$('brief-body');
  const id=new URLSearchParams(location.search).get('plan');
  const pct=value=>`${Math.round(value*100)}%`;
  $('brief-print').addEventListener('click',()=>window.print());
  async function load(){
    if(!/^[a-f0-9]{24}$/.test(id??'')){box.innerHTML='<p>This brief link is not valid. Open it from a plan on the Booking Desk.</p>';return;}
    $('brief-back').href=`/judge.html?plan=${encodeURIComponent(id)}`;
    let record;
    try{record=await fetchJSON(`/api/judge/cases/${encodeURIComponent(id)}`,{timeout:15000});}
    catch(problem){box.innerHTML=`<p>${e(problem.message)}</p>`;return;}
    const memo=record.snapshot.memo,slate=memo.slate,currency=memo.currency??'USD',usd=value=>money(value,currency),analysis=record.analysis,estimated=record.feeBasis==='estimated-from-qloo-popularity';
    if(!slate.feasible){box.innerHTML='<p>No bill fits this plan, so there is nothing to brief.</p>';return;}
    const fans=(memo.input.anchors??[]).join(', '),acts=slate.selectedIds.map(key=>memo.items.find(item=>item.id===key)).filter(Boolean);
    const robust=analysis?.robustness?.status==='ready'?analysis.robustness:null,aff=analysis?.affinity?.status==='ready'?analysis.affinity:null;
    const coin=(aff?.acts??[]).filter(act=>act.verdict==='coin-flip').map(act=>memo.items.find(item=>item.id===act.id)?.name).filter(Boolean);
    const lists=(record.reach?.groups??[]).map(group=>`<div><h2>${e(group.label)}</h2><ul>${group.leads.slice(0,4).map(lead=>`<li>${e(lead.name)}</li>`).join('')}</ul></div>`).join('');
    const place=record.place,where={'this-place':`Qloo's location data sits around ${place?.name}.`,partly:`Qloo's location data only partly matches ${place?.name}.`,elsewhere:`Qloo has no location data near ${place?.name}, so no local fans are claimed.`}[place?.status];
    const watch=[robust?`Holds in ${pct(robust.share)} of ${robust.draws} fee scenarios.`:'',coin.length?`Coin-flip pick${coin.length>1?'s':''}: ${coin.join(', ')}.`:'',where??'',record.actCheck?.removed?.length?`Removed because MusicBrainz lists them as ended: ${record.actCheck.removed.map(act=>act.name).join(', ')}.`:''].filter(Boolean);
    const qloo=record.snapshot.receipts.filter(receipt=>receipt.source==='qloo').length;
    box.innerHTML=`<p class="b-kicker">Promoter brief · ${e(memo.input.city)}</p>
      <h1>${e(acts.map(act=>act.name).join(' + '))}</h1>
      <p class="b-sub">${e(usd(slate.totalFee))}${estimated?' estimated':''} of a ${e(usd(memo.constraints.budget))} artist budget · for fans of ${e(fans)} · best of ${e(slate.feasibleCount)} bookable bills out of ${e(slate.checkedCount)} checked</p>
      <h2>The bill</h2>
      <table><thead><tr><th scope="col">Act</th><th scope="col">Qloo rank</th><th scope="col" class="n">Fee</th></tr></thead><tbody>${acts.map(act=>`<tr><th scope="row">${e(act.name)}</th><td>${act.rank?`${e(act.rank)} of ${e(act.of)}`:'Not ranked'}</td><td class="n">${e(usd(act.terms.fee))}${estimated?' est.':''}</td></tr>`).join('')}</tbody></table>
      ${watch.length?`<h2>How firm it is</h2><ul>${watch.map(line=>`<li>${e(line)}</li>`).join('')}</ul>`:''}
      ${lists?`<div class="b-cols">${lists}</div>`:''}
      <p class="b-foot">Built by Houselights from ${e(qloo)} saved Qloo responses. ${e(record.terms??'')} Plan ${e(record.id)}.</p>`;
    document.title=`Houselights brief — ${acts.map(act=>act.name).join(' + ')}`;
  }
  void load();
})();
