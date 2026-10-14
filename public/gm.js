'use strict';
(() => {
  const e = escapeHTML;
  let busy = false, editable = true, lastId = null;
  document.querySelector('.sidebar nav').insertAdjacentHTML('beforeend', '<button class="nav-item" data-view="gm"><span class="nav-icon">◉</span>Festival GM<span class="nav-key">05</span></button>');
  $('results').insertAdjacentHTML('afterbegin', '<div class="gm-status"><strong>Take this slate into the festival workflow.</strong> Compare markets, inspect the whole lineup, and rehearse a headliner cancellation. <button type="button" class="button dark small" data-view="gm">Open Festival GM →</button></div>');
  document.querySelector('.page-footer').insertAdjacentHTML('beforebegin', `<section class="view" id="view-gm" aria-label="Festival GM" hidden>
    <div class="page-heading compact-heading"><div><p class="eyebrow">THE FESTIVAL DECISION, END TO END</p><h1>Your lineup.<br>Your next move.</h1><p class="lede">Research the market. Build a connected bill. Recover when plans change.</p><p class="gm-steps"><span>01 Brief & budget</span><span>02 Cultural research</span><span>03 Lineup decision</span><span>04 Cancellation & recovery</span></p></div></div>
    <div class="gm-layout">
    <section class="panel"><h2>Saved examples & organizer access</h2><p id="gm-access-status">Checking access…</p><div class="gm-fields"><label>Saved judge example<select id="gm-examples"><option value="">Choose a saved example</option></select></label><label>Organizer access token<input id="gm-token" type="password" autocomplete="off" placeholder="For organizer edits only"></label></div><div class="gm-actions"><button id="gm-unlock" class="button dark">Unlock organizer actions</button><button id="gm-lock" class="button subtle">Clear access</button><button id="gm-pin" class="button subtle" data-gm-write>Pin current example</button></div><p class="field-hint">Credentials stay in this tab’s memory. Shared reports are read-only on protected deployments.</p></section>
    <section class="panel"><h2>Research the festival audience</h2><p id="gm-source">Build or load a slate in Slate studio to begin.</p><div class="gm-fields"><label>Cities to compare<input id="gm-markets" placeholder="London, Paris" maxlength="400"></label><label>Decision city<input id="gm-city" placeholder="London" maxlength="100"></label><label>Optional age signal<select id="gm-age"><option value="">Audience anchors only</option><option value="24_and_younger">24 and younger</option><option value="25_to_29">25–29</option><option value="30_to_34">30–34</option><option value="35_to_44">35–44</option><option value="45_to_54">45–54</option><option value="55_and_older">55 and older</option></select></label></div><button id="gm-run" class="button primary" data-gm-write>Research & optimize festival →</button><p class="field-hint">Uses the saved pool, quotes and availability. Research may take up to two minutes; every missing result stays visible.</p><div id="gm-operation" class="gm-status" role="status" aria-live="polite" hidden></div></section>
    <div id="gm-report"></div>
    <section class="panel"><h2>Research themed nights</h2><p>Rank themes for each night’s audience, then research sponsors, music, local partners and media from its individual theme.</p><div id="gm-theme-dates"></div><button type="button" id="gm-theme-add" class="button subtle">Add a date</button><div class="gm-fields"><label>Reference market (optional)<input id="gm-theme-reference" maxlength="100" placeholder="United Kingdom"></label><label>Sponsor categories (optional, comma-separated)<input id="gm-theme-tags" maxlength="500" placeholder="Technology, apparel"></label></div><button id="gm-theme-run" class="button dark" data-gm-write>Research & save themed nights</button><p class="field-hint">Requires saved festival research. Up to eight dates; every date is retained. Family life-stage is unmeasured. Partner leads are uncontacted and do not establish availability.</p><div id="gm-theme-report"></div></section>
    <section class="panel"><h2>Ask the GM</h2><label for="gm-request">Request a lineup change</label><textarea id="gm-request" maxlength="2000">Replace the headliner, keep the budget and maintain audience fit</textarea><div class="gm-fields"><label>Declared headliner<select id="gm-headliner"></select></label></div><button id="gm-revise" class="button dark" data-gm-write>Check & save revision</button><p class="field-hint">A fit-preserving revision can be impossible. The GM reports the binding constraints and leaves the source intact.</p></section>
    <section class="panel"><h2>An artist cancels. What happens next?</h2><p>Remove the canceled booking, keep surviving acts locked, and search the pool for a feasible replacement.</p><div class="gm-fields"><label>Canceled artist<select id="gm-canceled"></select></label></div><button id="gm-cancel" class="button primary" data-gm-write>Re-plan after cancellation →</button><div id="gm-recovery"></div></section>
    <section class="panel"><h2>Compare, then independently evaluate</h2><p>The optimizer is expected to win its own objective. That score difference does not prove better festival choices.</p><button id="gm-benchmark" class="button dark" data-gm-write>Run LLM-only control</button><div id="gm-benchmark-report"></div><details><summary>Collect blind promoter preferences</summary><p>Choose distinct saved benchmark briefs and invite real reviewers. Neither system names nor scores are shown to reviewers.</p><div class="gm-fields"><label>Benchmark snapshot IDs<input id="gm-study-sources" placeholder="One or more IDs, comma-separated"></label><label>Reviewer labels<input id="gm-reviewers" placeholder="Promoter 1, Promoter 2" maxlength="500"></label></div><button id="gm-study" class="button subtle" data-gm-write>Create blind study</button><div id="gm-study-report" class="gm-invitation"></div></details></section>
    </div></section>`);
  const current = () => state.snapshot?.id === state.savedId ? state.snapshot : null;
  const unsaved = () => state.dirty || state.briefDirty || state.memo?.modifiedLocally;
  const table = (heads, rows) => `<div class="table-scroll"><table class="gm-table"><thead><tr>${heads.map(h => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const td = values => `<tr>${values.map(value => `<td>${value}</td>`).join('')}</tr>`;
  const status = (text, failed = false) => { $('gm-operation').hidden = false; $('gm-operation').classList.toggle('gm-error', failed); $('gm-operation').textContent = text; };
  function buttons() {
    document.querySelectorAll('[data-gm-write]').forEach(button => { button.disabled = busy || state.busy || !editable || !state.savedId || unsaved(); });
    $('gm-examples').disabled = busy || state.busy;
    $('gm-theme-run').disabled ||= !current()?.festivalResearch;
  }
  function addThemeDate(row = {}) {
    if ($('gm-theme-dates').children.length >= 8) return;
    const field = document.createElement('div'); field.className = 'gm-fields';
    field.innerHTML = `<label>Date<input type="date" data-theme-date value="${e(row.date ?? '')}"></label><label>Time<select data-theme-time><option value="night">Night</option><option value="day">Day</option></select></label><label>Audience<select data-theme-segment><option value="gen_z">Under 25</option><option value="young_pros">Young professionals (25–34)</option><option value="boomers">55 and older</option><option value="families">Families (life-stage unavailable)</option></select></label><button type="button" class="button subtle" data-theme-remove>Remove</button>`;
    field.querySelector('[data-theme-time]').value = row.time ?? 'night';
    field.querySelector('[data-theme-segment]').value = row.segment ?? 'gen_z';
    field.querySelector('[data-theme-remove]').onclick = () => field.remove();
    $('gm-theme-dates').append(field);
  }
  function renderThemeReport(season) {
    if (!season) return '<p>No themed season saved for this decision.</p>';
    const nights = season.nights.map((night, i) => {
      const leads = table(['Lead type', 'Prospects', 'Research status'], (night.experience ?? []).map(kit => td([
        e(label(kit.target)), e(kit.candidates.map(card => card.name).join(', ') || 'No supported leads'), e(kit.status),
      ])));
      const choices = season.research?.matrix.flatMap(domain => domain.rows.map(row =>
        `<option value="${e(row.id)}" ${row.id === night.anchor.id ? 'selected' : ''}>${e(row.name)} (${e(label(domain.kind))})</option>`)).join('');
      const replace = season.research ? `<label>Choose another saved theme<select id="gm-theme-choice-${i}">${choices}</select></label><button class="button subtle" data-gm-write data-theme-replace="${i}">Research this replacement</button>` : '';
      return `<details><summary>${e(night.date)} · ${e(night.title)} · ${e(night.researchStatus ?? 'not researched separately')}</summary>
        <p>Anchor: ${e(night.anchor.name)}. Audience: ${e(label(night.segment))}. Taste Fit ${night.tasteFit.total}; measured weight ${number(night.tasteFit.measuredWeight)}. Missing: ${e(night.tasteFit.estimated.join(', '))}.</p>
        <p>${e(night.experienceBasis)}</p>${leads}${receiptLinks(night.evidence)}${replace}</details>`;
    }).join('');
    const domains = season.research?.matrix.map(domain => {
      const rows = domain.rows.map(row => td([e(row.name), e(row.local.rank ?? 'Missing'),
        Object.entries(row.segments).map(([segment, evidence]) => `${e(label(segment))}: ${e(evidence.status)}${evidence.complete ? ` · ordinal utility ${number(evidence.utility)}` : ''}`).join('<br>'),
        e(row.referenceLift?.positions ?? 'Unmeasured'),
      ]));
      return `<h3>${e(label(domain.kind))} · ${domain.testedCandidates}/${domain.scannedCandidates} candidates tested</h3>${table(['Theme', 'Local rank', 'Audience evidence', 'Reference lift'], rows)}`;
    }).join('');
    const matrix = season.research ? `<details><summary>Inspect all theme audience rankings</summary><p>Each domain uses one fixed pool. Reference lift is a rank-position difference, not demand growth.</p>${domains}</details>` : '';
    const issues = themeCategoryIssues(season);
    const resolution = issues.length ? `<h3>Choose the intended sponsor categories</h3><p>Qloo returned multiple meanings. Select a category to continue; no meaning is selected automatically.</p>${issues.map((issue, i) => `<label>${e(issue.input)}<select id="gm-theme-category-${i}"><option value="">Choose a meaning</option>${issue.candidates.map(card => `<option value="${e(card.id)}">${e(card.name)} · ${e(card.id)}</option>`).join('')}</select></label>${receiptLinks([issue.receiptId])}`).join('')}<button id="gm-theme-resolve" class="button subtle" data-gm-write>Research with selected categories</button>` : '';
    return `<h3>${e(season.city)} · ${e(season.research?.status ?? 'shared festival evidence')}</h3>${resolution}${nights}${matrix}<p>${e(season.limitations.join(' '))}</p>`;
  }
  function themeCategoryIssues(season) {
    return [...new Map((season?.nights ?? []).flatMap(night => (night.experience ?? []).flatMap(kit => kit.resolution ?? [])).map(issue => [issue.input, issue])).values()];
  }
  function render() {
    const saved = unsaved() ? null : current(), research = saved?.festivalResearch, slate = unsaved() ? null : state.memo?.slate;
    $('gm-source').textContent = state.savedId ? `Saved decision ${state.savedId} · ${state.memo?.input?.city} · budget ${money(state.memo?.constraints?.budget)}${unsaved() ? ' · Re-optimize, then save a scenario in Slate studio. Saved research is hidden while edits are unsaved.' : ''}` : 'Build or load a slate in Slate studio to begin.';
    if (state.savedId !== lastId) {
      lastId = state.savedId;
      $('gm-city').value = state.memo?.input?.city ?? '';
      $('gm-markets').value = research?.input.markets.join(', ') ?? state.memo?.input?.city ?? '';
      $('gm-study-sources').value = saved?.benchmark ? state.savedId : '';
      $('gm-theme-dates').replaceChildren();
      const theme = saved?.themeSeason;
      for (const row of theme?.nights ?? [{}]) addThemeDate(row);
      $('gm-theme-reference').value = theme?.research?.referenceLocation ?? '';
      $('gm-theme-tags').value = theme?.research?.sponsorTags.join(', ') ?? '';
    }
    const options = (slate?.selectedIds ?? []).map(id => `<option value="${e(id)}">${e(byId(id)?.name ?? id)}</option>`).join('');
    for (const select of ['gm-headliner', 'gm-canceled']) { const previous = $(select).value; $(select).innerHTML = options; if ([...$(select).options].some(option => option.value === previous)) $(select).value = previous; }
    let html = '';
    if (saved?.gm) html += `<section class="panel"><h2>The GM’s decision</h2><p class="gm-status">${e(saved.gm.state)} · ${slate?.feasible ? 'All hard constraints satisfied' : 'Constraints blocked'}</p><p>${e(names(slate?.selectedIds))}</p><p class="gm-score">${number(slate?.score)} <small>festival policy points</small></p>${table(['Component', 'Points'], Object.entries(slate?.objectiveBreakdown ?? {}).map(([key, value]) => td([e(label(key)), number(value)])))}<details><summary>Inspect the agent’s decisions</summary><ol class="gm-trace">${(saved.gm.trace ?? []).map(step => `<li><strong>${e(step.stage)}</strong> — ${e(step.detail)}</li>`).join('')}</ol></details>${saved.parentId ? `<a href="/m/${e(saved.parentId)}">Open the unchanged source decision ↗</a>` : ''}</section>`;
    if (slate?.festival) html += `<section class="panel"><h2>How this lineup connects</h2><p>${slate.festival.supportedPairs}/${slate.festival.pairCount} pairs have interpretable comparison evidence. Shared themes indicate cultural connections, not ticket-buyer overlap.</p><div class="gm-pairs">${slate.festival.pairs.map(pair => `<article><strong>${e(names([pair.a, pair.b]))}</strong><p>${pair.supported ? e(pair.sharedTastes.join(', ') || 'No shared themes returned') : 'Comparison evidence unavailable'}</p>${receiptLinks(pair.receiptId ? [pair.receiptId] : [])}</article>`).join('')}</div></section>`;
    if (research) {
      html += `<section class="panel"><h2>Market DNA</h2><p>Identical candidate pools. Local and audience ranks are relative within each city; no cross-query affinity percentages.</p>${research.markets.map(market => `<h3>${e(market.city)}</h3>${table(['Artist', 'Local rank', 'Audience rank', 'Evidence'], market.audience.rows.map(row => td([e(row.name), e(market.local.rows.find(local => local.id === row.id)?.rank ?? 'Missing'), e(row.rank ?? 'Missing'), receiptLinks([row.receiptId])])))}${!market.audience.complete ? '<p class="gm-error">Incomplete pool: no comparable audience-fit utility assigned.</p>' : ''}`).join('')}<details><summary>Cross-domain similarities & differences</summary>${research.overlap.map(pair => `<h3>${e(pair.a)} × ${e(pair.b)}</h3>${table(['Domain', 'Shared / union', 'Distinctive A', 'Distinctive B'], pair.domains.map(domain => td([e(label(domain.kind)), `${domain.sharedCount} · Jaccard ${number(domain.jaccard)}`, e(domain.onlyA.map(row => row.name).join(', ')), e(domain.onlyB.map(row => row.name).join(', '))])))} `).join('')}</details></section>`;
      html += `<section class="panel"><h2>Artist evidence</h2><p>The active booking decision uses the festival policy above. The imported five-part reference score is shown separately with its missing inputs.</p>${research.profiles.map(profile => `<details><summary>${e(profile.name)} · audience rank ${e(profile.audience.rank ?? 'unavailable')}</summary><p>Reference Taste Fit ${profile.tasteFit.total}; measured weight ${number(profile.tasteFit.measuredWeight)}; missing-input bounds ${number(profile.tasteFit.uncertaintyBounds.lower)}–${number(profile.tasteFit.uncertaintyBounds.upper)}. These are not confidence intervals.</p><p>Missing: ${e(profile.tasteFit.estimated.join(', ') || 'none')}</p><p>Demographics: ${e(profile.demographics.status)}</p><pre>${json(profile.demographics.rows)}</pre>${receiptLinks(profile.receipts)}</details>`).join('')}</section>`;
    }
    $('gm-report').innerHTML = html;
    const season = saved?.themeSeason;
    $('gm-theme-report').innerHTML = renderThemeReport(season);
    if ($('gm-theme-resolve')) $('gm-theme-resolve').onclick = () => {
      const issues = themeCategoryIssues(season), choices = new Map(issues.map((issue, i) => [issue.input, $(`gm-theme-category-${i}`).value]));
      if ([...choices.values()].some(value => !value)) return status('Choose a meaning for every unresolved sponsor category.', true);
      operation('season-research', { ...season.research.options,
        anchorOverrides: Object.fromEntries(season.nights.map(night => [night.date, night.anchor.id])),
        sponsorTags: season.research.sponsorTags.map(tag => choices.get(tag) ?? tag) });
    };
    document.querySelectorAll('[data-theme-replace]').forEach(button => { button.onclick = () => {
      const i = Number(button.dataset.themeReplace), anchorOverrides = Object.fromEntries(season.nights.map(night => [night.date, night.anchor.id]));
      anchorOverrides[season.nights[i].date] = $(`gm-theme-choice-${i}`).value;
      operation('season-research', { ...season.research.options, anchorOverrides });
    }; });
    const recoveries = saved?.gm?.recovery?.cancellations ?? [];
    $('gm-recovery').innerHTML = `${(saved?.cancellations ?? []).map(event => `<div class="gm-status">Cancellation recorded: ${e(byId(event.artistId)?.name ?? event.artistId)}. Replacement: ${e(names(event.replacementIds))}. Survivors retained: ${e(names(event.retainedIds))}.</div>`).join('')}${recoveries.length ? `<details><summary>Saved cancellation rehearsals</summary><pre>${json(recoveries)}</pre></details>` : ''}`;
    const benchmark = saved?.benchmark;
    $('gm-benchmark-report').innerHTML = benchmark ? `<p class="gm-status">${e(benchmark.status)} · objective diagnostic, not independent evidence</p><p>${e(benchmark.reason ?? benchmark.methodology)}</p>${benchmark.comparison ? `<p>Objective difference: ${number(benchmark.comparison.policyPointDelta)} points. Control: ${e(names(benchmark.control.selectedIds))}.</p>` : ''}` : '<p>No control has been run for this decision. A configured LLM is required.</p>';
    buttons();
  }
  async function refresh() {
    try {
      if (state.savedId && !current()) { const response = await fetch(`/api/memo/${encodeURIComponent(state.savedId)}`); if (response.ok) state.snapshot = await response.json(); }
      const [access, examples] = await Promise.all([fetch('/api/access').then(r => r.json()), fetch('/api/examples').then(r => r.json())]);
      editable = access.editable === true;
      $('gm-access-status').textContent = access.protected ? editable ? 'Organizer access unlocked for this tab.' : 'Read-only access. Open a saved example or unlock organizer actions.' : 'Local development access. Public deployment will require an organizer token.';
      $('gm-examples').innerHTML = '<option value="">Choose a saved example</option>' + (Array.isArray(examples) ? examples : []).map(example => `<option value="${e(example.id)}">${e(example.city)} · ${example.mock ? 'Synthetic' : 'Qloo'} · ${e(example.title)}</option>`).join('');
      render();
    } catch (failure) { status(failure.message, true); }
  }
  async function operation(action, body) {
    if (busy || state.busy || unsaved() || !state.savedId) return;
    busy = true; setBusy(true, 'gm'); buttons(); status(action === 'run' ? 'Researching markets, checking evidence gaps, and enumerating feasible lineups…' : 'Checking this decision…');
    try {
      const response = await fetch(`/api/gm/${encodeURIComponent(state.savedId)}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(150000) });
      const result = await response.json();
      if (!response.ok) throw new Error([result.error || result.reason || 'Operation failed', ...(result.slate?.reasons ?? [])].join(' '));
      if (!await loadSaved(result.id)) throw new Error(`Decision ${result.id} was saved, but could not be loaded. Open /m/${result.id} to retry.`);
      history.replaceState(null, '', `/m/${encodeURIComponent(result.id)}`);
      status(`Saved ${result.id}. ${action === 'cancel' ? 'Cancellation recovery verified; surviving acts remain locked.' : 'The source decision remains unchanged.'}`); render();
    } catch (failure) { status(failure.message, true); }
    finally { busy = false; setBusy(false); buttons(); }
  }
  $('gm-run').onclick = () => operation('run', { markets: $('gm-markets').value.split(',').map(city => city.trim()).filter(Boolean), city: $('gm-city').value.trim(), demographic: $('gm-age').value || null });
  $('gm-revise').onclick = () => operation('revise', { request: $('gm-request').value, headlinerId: $('gm-headliner').value || undefined });
  $('gm-cancel').onclick = () => operation('cancel', { artistId: $('gm-canceled').value });
  $('gm-benchmark').onclick = () => operation('benchmark', {});
  $('gm-theme-add').onclick = () => addThemeDate();
  $('gm-theme-run').onclick = () => {
    const dates = [...$('gm-theme-dates').children].map(field => ({ date: field.querySelector('[data-theme-date]').value, time: field.querySelector('[data-theme-time]').value, segment: field.querySelector('[data-theme-segment]').value }));
    if (!dates.length || dates.some(row => !row.date)) return status('Enter a date for every night, or remove empty rows.', true);
    operation('season-research', { dates, count: dates.length, gapDays: 0, city: current()?.festivalResearch?.input.city,
      ...($('gm-theme-reference').value.trim() ? { referenceLocation: $('gm-theme-reference').value.trim() } : {}),
      sponsorTags: $('gm-theme-tags').value.split(',').map(value => value.trim()).filter(Boolean) });
  };
  $('gm-unlock').onclick = async () => { window.organizerAccess.setToken($('gm-token').value.trim()); $('gm-token').value = ''; await refresh(); };
  $('gm-lock').onclick = () => { window.organizerAccess.clear(); refresh(); };
  $('gm-examples').onchange = async () => { if ($('gm-examples').value) { await loadSaved($('gm-examples').value); render(); } };
  $('gm-pin').onclick = async () => { const response = await fetch(`/api/examples/${state.savedId}/pin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); const result = await response.json(); if (!response.ok) status(result.error, true); else { status('Saved example pinned for judge access.'); refresh(); } };
  $('gm-study').onclick = async () => {
    try {
      const response = await fetch('/api/studies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceIds: $('gm-study-sources').value.split(',').map(v => v.trim()).filter(Boolean), reviewers: $('gm-reviewers').value.split(',').map(v => v.trim()).filter(Boolean) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      $('gm-study-report').innerHTML = `<p>Study ${e(result.id)} · ${result.caseCount} distinct briefs. No judgments collected yet.</p>${result.invitations.map(invite => `<p>${e(invite.label)}: <a href="${e(invite.url)}" target="_blank" rel="noreferrer">Open private review invitation ↗</a></p>`).join('')}<button class="button subtle" id="gm-study-refresh">Check submitted preferences</button><output id="gm-study-results"></output>`;
      $('gm-study-refresh').onclick = async () => { const r = await fetch(`/api/studies/${result.id}`); $('gm-study-results').textContent = JSON.stringify(await r.json(), null, 2); };
    } catch (failure) { status(failure.message, true); }
  };
  window.houselightsGM = { render, refresh, buttons };
  addThemeDate();
  refresh();
})();
