/* Houselights: one inspectable client, no build step. */
'use strict';

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const json = value => escapeHTML(JSON.stringify(value ?? null, null, 2));
const state = { memo: null, receipts: [], offers: [], picks: {}, needsInput: [], busy: false, dirty: false, briefDirty: false, savedId: null, mock: null, runMock: null, currency: 'GBP', example: false, lockedIds: new Set(), excludedIds: new Set() };
state.analysis = null; state.scenarioHistory = []; state.keyed = false; state.gauntlet = null; state.trace = []; state.traceStarted = 0;


// Header previews explain the existing missions; they never score or edit a run.
const gauntletPreviews = {
  pressure: { number: '01', title: 'The 90% Room', target: '90%', unit: 'of the original budget', icon: 'budget', copy: 'Make the whole slate work with 90% of the original budget.' },
  discovery: { number: '02', title: 'Open the Side Door', target: '+1', unit: 'discovered act', icon: 'sparkles', copy: 'Bring in a Qloo-discovered act with your quote and availability confirmed, while keeping the slate feasible.' },
  diversity: { number: '03', title: 'Three Colours', target: '1–3', unit: 'buyer-defined genres', icon: 'sliders', copy: 'Broaden the mix across up to three planning genres, depending on your slot count, and keep the slate feasible.' },
  shock: { number: '04', title: 'Rain Check', target: '+10%', unit: 'on every known quote', icon: 'trend-up', copy: 'Keep the exact selected lineup feasible when every known quote rises by 10%.' },
  evidence: { number: '05', title: 'Receipts, Please', target: 'ALL', unit: 'selected acts supported', icon: 'receipt', copy: 'Support every selected act with relative-rank evidence, while keeping the slate feasible.' },
  conviction: { number: '06', title: 'Make the Call', target: '1+', unit: 'lock or exclusion', icon: 'pin', copy: 'Lock an act you believe in or exclude one you would pass on. Then keep the slate feasible.' }
};

function previewGauntletChallenge(id) {
  const challenge = Object.hasOwn(gauntletPreviews, id) ? gauntletPreviews[id] : null;
  if (!challenge) return;
  $('gauntlet-preview-number').textContent = 'CHALLENGE ' + challenge.number + ' / 06';
  for (const field of ['title', 'target', 'unit', 'copy']) $('gauntlet-preview-' + field).textContent = challenge[field];
  $('gauntlet-preview-icon').dataset.icon = challenge.icon;
  for (const button of document.querySelectorAll('[data-gauntlet-preview]')) button.setAttribute('aria-pressed', String(button.dataset.gauntletPreview === id));
}

function installGauntletUI() {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet'; stylesheet.href = '/gauntlet.css';
  document.head.insertBefore(stylesheet, document.querySelector('link[href^="/theme.css"]'));
  $('memo-notes').insertAdjacentHTML('beforebegin', '<section class="gauntlet-invite"><div><p class="small-label">THE DECISION GAUNTLET</p><h3>Can your slate survive the room?</h3><p>Six server-verified missions test cost pressure, discovery, diversity, evidence, resilience, and conviction.</p></div><button id="enter-gauntlet" type="button" class="button dark">Enter the Gauntlet <span class="ui-icon" data-icon="trophy" aria-hidden="true"></span></button></section>');
  document.querySelector('.page-footer').insertAdjacentHTML('beforebegin', `<section class="view" id="view-gauntlet" aria-label="Decision Gauntlet" hidden><header class="gauntlet-arena" aria-labelledby="gauntlet-heading">
  <div class="arena-marquee"><span><i class="ui-icon" data-icon="sparkles" aria-hidden="true"></i> THE HOUSELIGHTS CHALLENGE SERIES</span><span>06 CHALLENGES · ONE LINEUP</span></div>
  <div class="arena-layout">
    <div class="arena-intro">
      <p class="arena-kicker">GOOD TASTE, UNDER PRESSURE.</p>
      <h1 id="gauntlet-heading">The Decision<br><em>Gauntlet.</em></h1>
      <p class="arena-description">The budget tightens. The quotes change.<br>Can your lineup still make the night?</p>
      <div class="arena-actions"><button id="score-gauntlet" type="button" class="button primary" disabled>Build a slate first</button><span class="arena-score-note">Real constraints.<br>Progress verified from saved evidence.</span></div>
      <ol class="arena-route" aria-label="The Gauntlet workflow"><li><span>01</span> Explore</li><li><span>02</span> Decide</li><li><span>03</span> Verify</li></ol>
    </div>
    <div class="arena-stage">
      <div class="arena-stage-label"><span>PREVIEW A CHALLENGE</span><span aria-hidden="true"><span class="ui-icon" data-icon="arrow-down-left" aria-hidden="true"></span> PICK YOUR PRESSURE</span></div>
      <div class="arena-ticket-stack">
        <img class="arena-disc" src="/assets/brand/disc.webp" alt="" width="997" height="1506" loading="lazy" aria-hidden="true">
        <article class="arena-ticket" id="gauntlet-preview" aria-labelledby="gauntlet-preview-title" aria-live="polite" aria-atomic="true">
          <div class="arena-ticket-top"><span id="gauntlet-preview-number">CHALLENGE 01 / 06</span><span class="arena-preview-label">PREVIEW</span></div>
          <div class="arena-target"><strong id="gauntlet-preview-target">90%</strong><span id="gauntlet-preview-unit">of the original budget</span><span class="arena-target-mark ui-icon" id="gauntlet-preview-icon" data-icon="budget" aria-hidden="true"></span></div>
          <h2 id="gauntlet-preview-title">The 90% Room</h2>
          <p class="arena-challenge-copy" id="gauntlet-preview-copy">Make the whole slate work with 90% of the original budget.</p>
          <div class="arena-ticket-stub"><span class="arena-barcode" aria-hidden="true"></span><p>Explore freely. Score a saved slate<br>to check the result.</p><span class="ui-icon arena-stub-mark" data-icon="sparkles" aria-hidden="true"></span></div>
        </article>
      </div>
      <div class="arena-choices" role="group" aria-label="Preview a Gauntlet challenge">
        <button type="button" data-gauntlet-preview="pressure" aria-controls="gauntlet-preview" aria-pressed="true"><span>01</span> Budget <i class="ui-icon" data-icon="budget" aria-hidden="true"></i></button>
        <button type="button" data-gauntlet-preview="discovery" aria-controls="gauntlet-preview" aria-pressed="false"><span>02</span> Discovery <i class="ui-icon" data-icon="sparkles" aria-hidden="true"></i></button>
        <button type="button" data-gauntlet-preview="diversity" aria-controls="gauntlet-preview" aria-pressed="false"><span>03</span> Genre mix <i class="ui-icon" data-icon="sliders" aria-hidden="true"></i></button>
        <button type="button" data-gauntlet-preview="shock" aria-controls="gauntlet-preview" aria-pressed="false"><span>04</span> Quote rise <i class="ui-icon" data-icon="trend-up" aria-hidden="true"></i></button>
        <button type="button" data-gauntlet-preview="evidence" aria-controls="gauntlet-preview" aria-pressed="false"><span>05</span> Evidence <i class="ui-icon" data-icon="receipt" aria-hidden="true"></i></button>
        <button type="button" data-gauntlet-preview="conviction" aria-controls="gauntlet-preview" aria-pressed="false"><span>06</span> Your call <i class="ui-icon" data-icon="pin" aria-hidden="true"></i></button>
      </div>
    </div>
  </div>
  <div class="arena-footnote"><span><i class="ui-icon" data-icon="shield-check" aria-hidden="true"></i> EVERY POINT HAS TO BE EARNED.</span><p>Six missions. Server-checked results. A more considered decision.</p></div>
</header><div id="gauntlet-empty" class="panel gauntlet-empty"><p class="small-label">YOUR FIRST MISSION</p><h2>Build a slate, then put it under pressure.</h2><p>The Gauntlet turns the optimizer into a hands-on decision game. Lower the budget, take a discovery bet, protect genre breadth, survive quote increases, and record what you chose.</p><button type="button" class="button dark" data-view="slate">Go to Slate studio <span class="ui-icon" data-icon="arrow-up-right" aria-hidden="true"></span></button></div><section id="gauntlet-results" hidden><div class="gauntlet-score panel"><div class="xp-ring" id="xp-ring"><strong id="gauntlet-xp">0</strong><span>XP</span></div><div class="gauntlet-rank"><p class="small-label">CURRENT TIER</p><h2 id="gauntlet-tier">Soundcheck</h2><p id="gauntlet-next"></p><div class="xp-track"><span id="xp-progress"></span></div><small id="gauntlet-summary"></small></div><div id="gauntlet-metrics" class="gauntlet-metrics"></div></div><div id="mission-grid" class="mission-grid"></div><article class="panel gauntlet-rules"><h2>Why these missions matter</h2><p>This is a learning layer over the exact optimizer. XP is not a forecast or measure of artistic quality. It rewards explicit assumptions, supported evidence, portfolio resilience, and meaningful constraint trade-offs.</p><button id="rescore-gauntlet" type="button" class="button primary">Re-score current slate <span class="ui-icon" data-icon="refresh" aria-hidden="true"></span></button></article></section></section>`);
}
installGauntletUI();
const label = value => String(value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
const money = value => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: state.currency, maximumFractionDigits: value % 1 ? 2 : 0 }).format(value) : 'Quote needed';
const number = value => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '—';
const delta = value => typeof value === 'number' && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}` : '—';
const byId = id => state.memo?.items.find(item => item.id === id);
const names = ids => (ids || []).map(id => byId(id)?.name || id).join(' + ');
const error = message => { $('global-error').textContent = message || ''; $('global-error').hidden = !message; };
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4300); }

function setView(view) {
  for (const node of document.querySelectorAll('.view')) node.hidden = node.id !== `view-${view}`;
  for (const node of document.querySelectorAll('[data-view]')) {
    const active = node.dataset.view === view;
    node.classList.toggle('active', active);
    if (active) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
  }
  $('breadcrumb').textContent = { portfolio:'Event portfolio', evaluation:'Independent evaluation', room: 'Decision Room', slate: 'Slate studio', gauntlet: 'Decision Gauntlet', evidence: 'Evidence ledger', method: 'Decision policy', gm: 'Festival GM' }[view];
  if (view === 'gm') window.houselightsGM?.refresh();
  if (view === 'room') window.houselightsDecision?.refresh();
  if (view === 'evaluation') window.houselightsAdvanced?.configuration();
  window.scrollTo(0, 0);
}

function updateMode(mock, saved = false) {
  const synthetic = mock === true;
  if (mock === false && !saved && state.runMock == null) {
    $('mode-badge').textContent = state.keyed ? 'Qloo configured' : 'Qloo key needed';
    $('mode-badge').className = `mode-badge ${state.keyed ? '' : 'needs-key'}`;
    $('source-banner').hidden = false;
    $('source-banner').textContent = state.keyed ? 'Qloo is configured. Build a slate to retrieve evidence; a configured key alone does not verify live data.' : 'Live evidence is not connected yet. Configure Qloo on the server to build a live slate. The example button only fills illustrative booking inputs.';
    return;
  }
  $('mode-badge').textContent = mock == null ? 'Source unavailable' : `${synthetic ? 'Synthetic demo' : 'Qloo live'}${saved ? ' · saved run' : ''}`;
  $('mode-badge').className = `mode-badge ${mock == null ? '' : synthetic ? 'synthetic' : 'live'}`;
  $('source-banner').hidden = false;
  $('source-banner').innerHTML = mock == null
    ? '<strong>Source unverified.</strong> The server could not be reached. Check the connection before building a slate.'
    : synthetic
      ? '<strong>Synthetic demonstration.</strong> Taste signals and receipts in this run are generated fixtures, not Qloo findings. All example fees and availability are illustrative booking inputs.'
      : `<strong>${saved ? 'Saved Qloo run.' : 'Live Qloo mode.'}</strong> Evidence comes from Qloo tool responses. Fees, availability, and genres remain buyer-entered booking assumptions.`;
}

async function checkHealth() {
  try {
    const response = await fetch('/healthz', { cache: 'no-store' });
    if (!response.ok) throw new Error('Server unavailable');
    const health = await response.json();
    state.mock = health.mock;
    state.keyed = health.keyed === true;
    $('connection-dot').className = `status-dot ${health.mock ? 'demo' : health.keyed ? 'ready' : 'error'}`;
    $('connection-label').textContent = health.mock ? 'Synthetic mode' : health.keyed ? 'Qloo configured' : 'Qloo key needed';
    $('connection-detail').textContent = health.mock ? 'Reproducible demo fixtures' : health.keyed ? `${health.llm ? 'LLM planner' : 'Rules planner'} · server ready` : 'Set QLOO_API_KEY on server';
    if (state.runMock == null) updateMode(health.mock);
  } catch {
    $('connection-dot').className = 'status-dot error';
    $('connection-label').textContent = 'Server unavailable';
    $('connection-detail').textContent = 'Check the local server';
    if (state.runMock == null) updateMode(null);
  }
}

function renderOffers() {
  $('offer-rows').innerHTML = state.offers.map((offer, index) => `<tr>
    <td><input data-offer="${index}" data-field="name" value="${escapeHTML(offer.name)}" maxlength="60" placeholder="Artist name" aria-label="Artist ${index + 1}" required></td>
    <td><input data-offer="${index}" data-field="fee" value="${offer.fee == null ? '' : escapeHTML(offer.fee)}" type="number" min="0" step="0.01" placeholder="Quote needed" aria-label="Fee for act ${index + 1}"></td>
    <td><input data-offer="${index}" data-field="genre" value="${escapeHTML(offer.genre)}" maxlength="60" placeholder="Planning genre" aria-label="Genre for act ${index + 1}"></td>
    <td class="center"><input data-offer="${index}" data-field="available" type="checkbox" ${offer.available ? 'checked' : ''} aria-label="Act ${index + 1} is available"></td>
    <td><button type="button" class="remove-offer" data-remove="${index}" aria-label="Remove act ${index + 1}" ${state.offers.length < 2 ? 'disabled' : ''}><span class="ui-icon" data-icon="x" aria-hidden="true"></span></button></td>
  </tr>`).join('');
  $('add-offer').disabled = state.offers.length >= 6 || state.busy;
}

function loadExample() {
  if (state.busy) return;
  state.example = true;
  state.picks = {};
  $('city').value = 'London'; $('anchors').value = 'Radiohead, Beach House, Bonobo';
  $('currency').value = 'GBP'; state.currency = 'GBP';
  $('budget').value = 55000; $('slots').value = 3; $('max-per-genre').value = 2; $('discovery-min').value = 0; $('risk').value = 50;
  state.offers = [
    { name: 'Four Tet', fee: 26000, genre: 'Electronic', available: true },
    { name: 'Caribou', fee: 22000, genre: 'Electronic', available: true },
    { name: 'Floating Points', fee: 15000, genre: 'Electronic', available: true },
    { name: 'Khruangbin', fee: 30000, genre: 'Psychedelic', available: true },
    { name: 'Japanese Breakfast', fee: 14000, genre: 'Indie pop', available: true },
    { name: 'BADBADNOTGOOD', fee: 12000, genre: 'Jazz', available: true },
  ];
  renderOffers(); updateCurrency(); updateRisk();
  $('example-note').hidden = false; $('briefing').open = true;
  setView('slate'); error('');
  if (state.memo) markBriefDirty('Example loaded. Build a new slate to retrieve evidence for this brief.');
  toast('London example loaded · all booking terms are illustrative.');
}

function updateCurrency() { document.querySelectorAll('.currency-label').forEach(node => { node.textContent = $('currency').value; }); }
function updateRisk() { $('risk-value').textContent = `${$('risk').value} / 100`; }
function constraints() {
  return { ...state.memo?.constraints, budget: Number($('budget').value), slots: Number($('slots').value), discoveryMin: Number($('discovery-min').value), maxPerGenre: Number($('max-per-genre').value), riskTolerance: Number($('risk').value), lockedIds: [...state.lockedIds], excludedIds: [...state.excludedIds] };
}
function putConstraints(value = {}) {
  for (const [key, id] of Object.entries({ budget: 'budget', slots: 'slots', discoveryMin: 'discovery-min', maxPerGenre: 'max-per-genre', riskTolerance: 'risk' })) if (value[key] != null) $(id).value = value[key];
  state.lockedIds = new Set(value.lockedIds || []); state.excludedIds = new Set(value.excludedIds || []); updateRisk();
}
function markDirty(message) {
  if (!state.memo) return;
  state.dirty = true;
  $('dirty-banner').textContent = message || 'Booking assumptions changed. Re-optimize to update the recommendation.';
  $('dirty-banner').hidden = false;
  $('share-link').hidden = true;
  state.analysis = null; state.gauntlet = null; renderStress(); renderGauntlet(); updateSaveControls();
}
function markBriefDirty(message) { state.briefDirty = true; markDirty(message); }
function setBusy(busy, kind = 'build') {
  state.busy = busy;
  $('build-button').disabled = busy; $('optimize-button').disabled = busy; $('load-scenario').disabled = busy; $('empty-example').disabled = busy;
  for (const node of document.querySelectorAll('#brief-form input, #brief-form select, #brief-form button, #candidate-rows input')) node.disabled = busy;
  $('add-offer').disabled = busy || state.offers.length >= 6;
  $('build-button').innerHTML = busy && kind === 'build' ? 'Building your slate…' : 'Build my slate <span class="ui-icon" data-icon="arrow-up-right" aria-hidden="true"></span>';
  $('optimize-button').innerHTML = busy && kind === 'optimize' ? 'Checking combinations…' : 'Re-optimize <span class="ui-icon" data-icon="refresh" aria-hidden="true"></span>';
  document.querySelectorAll('[data-remove]').forEach(node => { node.disabled = busy || state.offers.length < 2; });
  $('analyze-button').disabled = busy || !state.memo;
  $('score-gauntlet').disabled = busy || !state.memo || !state.savedId;
  $('rescore-gauntlet').disabled = busy || !state.memo || !state.savedId;
  $('enter-gauntlet').disabled = busy || !state.memo;
  updateSaveControls();
  window.houselightsGM?.buttons();
}

function receiptLinks(ids = []) {
  return ids.map(id => `<button class="receipt-link" type="button" data-receipt="${escapeHTML(id)}" aria-label="Read evidence ${escapeHTML(id)}">${escapeHTML(id)}</button>`).join('');
}
function renderReceipts() {
  $('receipt-count').textContent = state.receipts.length;
  $('ledger-export').disabled = !state.receipts.length;
  const synthetic = state.receipts.filter(receipt => receipt.source === 'synthetic').length;
  const cached = state.receipts.filter(receipt => receipt.cached).length;
  $('ledger-summary').textContent = state.receipts.length ? `${state.receipts.length} receipts · ${synthetic ? `${synthetic} synthetic` : 'Qloo source'} · ${cached} cache hits` : 'Run a booking brief to collect evidence.';
  if (!state.receipts.length) {
    $('receipt-list').innerHTML = '<div class="panel ledger-empty"><span class="ui-icon" data-icon="receipt" aria-hidden="true"></span><h2>Evidence starts with a real question.</h2><p>Your calls will appear here as the agent works.</p></div>';
    return;
  }
  $('receipt-list').innerHTML = state.receipts.map((receipt, index) => `<details class="receipt" id="receipt-${index}">
    <summary><span class="receipt-id">${escapeHTML(receipt.id)}</span><span class="receipt-title"><strong>${escapeHTML(receipt.tool)}</strong><small>${escapeHTML(receipt.why)}</small></span><span class="tag ${receipt.source === 'synthetic' ? 'discovery' : ''}">${receipt.source === 'synthetic' ? 'Synthetic' : 'Qloo'}</span><span class="receipt-status ${receipt.status === 'error' ? 'error' : ['partial', 'degraded', 'needs_input'].includes(receipt.status) ? 'warning' : ''}">${escapeHTML(receipt.status)}</span></summary>
    <div class="receipt-body"><p>${escapeHTML(receipt.summary || 'No summary supplied.')}</p><div class="receipt-grid"><div><h4>Exact tool inputs</h4><pre>${json(receipt.args)}</pre></div><div><h4>Normalized evidence</h4><pre>${json(receipt.evidence)}</pre></div></div><div class="receipt-meta"><span>Fetched ${escapeHTML(receipt.fetchedAt || 'unknown')}</span><span>${escapeHTML(receipt.ms ?? 0)} ms · ${escapeHTML(receipt.attempts ?? 0)} attempts</span><span>${receipt.cached ? 'Cached response' : 'Fresh retrieval'} · ${escapeHTML(receipt.count ?? 0)} results</span></div><details class="receipt-provenance"><summary>Provenance &amp; integrity digest</summary><pre>${json({ source: receipt.source, provenance: receipt.provenance, digest: receipt.digest, fetchedAt: receipt.fetchedAt, observedAt: receipt.observedAt })}</pre><p>The digest identifies this recorded payload; it is not independent certification of a claim.</p></details></div></details>`).join('');
}

function renderCandidates() {
  const selected = new Set(state.memo.slate?.selectedIds || []);
  $('candidate-count').textContent = String(state.memo.items.length);
  $('candidate-rows').innerHTML = state.memo.items.map((item, index) => {
    const assessment = state.memo.slate?.candidateAssessments?.find(row => row.id === item.id);
    const supported = item.evidence?.rank === true && Number.isFinite(item.fit);
    const fit = supported ? Math.max(0, Math.min(1, item.fit)) : null;
    return `<tr class="${selected.has(item.id) ? 'is-selected' : ''} ${state.excludedIds.has(item.id) ? 'is-excluded' : ''}">
    <td><div class="candidate-name">${selected.has(item.id) ? '<span class="selection-dot" title="Selected"></span>' : ''}${escapeHTML(item.name)}${item.found ? '<span class="tag discovery">Discovery</span>' : ''}</div><div class="candidate-detail">${escapeHTML(assessment?.exclusionReasons?.join(' ') || `${item.evidence?.local ? 'Local evidence' : 'Local unverified'} · ${item.momentum || 'unknown'} trend`)}</div><div class="candidate-receipts">${receiptLinks(item.receipts)}</div></td>
    <td><div class="affinity-value">${supported ? number(fit) : 'No evidence'}</div><div class="affinity-track" aria-hidden="true"><span style="width:${supported ? Math.round(fit * 100) : 0}%"></span></div><div class="affinity-note">${supported ? `Rank ${escapeHTML(item.rank)} of ${escapeHTML(item.of)} · rank utility` : 'Unsupported rank'}</div></td>
    <td><input type="number" data-candidate="${index}" data-field="fee" min="0" step="0.01" value="${item.terms?.fee == null ? '' : escapeHTML(item.terms.fee)}" placeholder="Quote needed" aria-label="${escapeHTML(item.name)} fee"></td>
    <td><input data-candidate="${index}" data-field="genre" value="${escapeHTML(item.terms?.genre)}" maxlength="60" placeholder="Unknown" aria-label="${escapeHTML(item.name)} genre"></td>
    <td class="center"><input type="checkbox" data-candidate="${index}" data-field="available" ${item.terms?.available === true ? 'checked' : ''} aria-label="${escapeHTML(item.name)} available"></td>
    <td class="center"><input type="checkbox" data-candidate="${index}" data-field="locked" ${state.lockedIds.has(item.id) ? 'checked' : ''} aria-label="Lock ${escapeHTML(item.name)}"></td>
    <td class="center"><input type="checkbox" data-candidate="${index}" data-field="excluded" ${state.excludedIds.has(item.id) ? 'checked' : ''} aria-label="Exclude ${escapeHTML(item.name)}"></td></tr>`;
  }).join('');
}

function renderFrontier(slate) {
  const points = slate.frontier || [];
  if (!points.length) { $('frontier-chart').innerHTML = '<p class="no-data">No feasible slates to compare under these constraints.</p>'; return; }
  const w = 520, h = 205, left = 52, right = 18, top = 22, bottom = 40;
  const costs = points.map(point => point.totalFee), scores = points.map(point => point.score);
  const minCost = Math.min(...costs), maxCost = Math.max(...costs), minScore = Math.min(...scores), maxScore = Math.max(...scores);
  const lowScore = minScore === maxScore ? minScore - 1 : minScore, highScore = minScore === maxScore ? maxScore + 1 : maxScore;
  const x = value => minCost === maxCost ? (left + w - right) / 2 : left + (value - minCost) / (maxCost - minCost) * (w - left - right);
  const y = value => h - bottom - (value - lowScore) / (highScore - lowScore) * (h - top - bottom);
  const line = points.map(point => `${x(point.totalFee)},${y(point.score)}`).join(' ');
  const ticks = [0, .5, 1].map(tick => { const yy = h - bottom - tick * (h - top - bottom); return `<line x1="${left}" y1="${yy}" x2="${w - right}" y2="${yy}" stroke="#e0e5d8"/><text x="${left - 10}" y="${yy + 3}" text-anchor="end" fill="#859179" font-size="9">${number(lowScore + tick * (highScore - lowScore))}</text>`; }).join('');
  $('frontier-chart').innerHTML = `<svg class="frontier-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Cost versus planner utility for ${points.length} efficient slate options. Full values follow in the table."><title>Feasible cost–utility frontier</title>${ticks}<polyline points="${line}" fill="none" stroke="#77906a" stroke-width="2"/>${points.map(point => `<circle cx="${x(point.totalFee)}" cy="${y(point.score)}" r="${point.score === slate.score ? 6 : 4}" fill="${point.score === slate.score ? '#b68a40' : '#55754a'}"><title>${escapeHTML(names(point.selectedIds))}: ${escapeHTML(money(point.totalFee))}, ${number(point.score)} points</title></circle>`).join('')}<text x="${left}" y="${h - 17}" fill="#859179" font-size="9">${escapeHTML(money(minCost))}</text>${maxCost !== minCost ? `<text x="${w - right}" y="${h - 17}" fill="#859179" text-anchor="end" font-size="9">${escapeHTML(money(maxCost))}</text>` : ''}</svg><p class="chart-caption">${points.length} efficient ${points.length === 1 ? 'combination' : 'combinations'} within the current budget. Higher utility follows the declared policy; it does not predict ticket sales.</p><details class="frontier-detail"><summary>Compare every frontier option</summary><div class="table-scroll"><table class="frontier-table"><thead><tr><th>Slate</th><th>Fees</th><th>Utility</th></tr></thead><tbody>${points.map(point => `<tr><td>${escapeHTML(names(point.selectedIds))}</td><td>${escapeHTML(money(point.totalFee))}</td><td>${number(point.score)}</td></tr>`).join('')}</tbody></table></div></details>`;
}

function renderAlternatives(slate) {
  if (!slate.feasible) {
    const nearest = slate.diagnostics?.nearestSlates || [];
    $('alternatives').innerHTML = nearest.length ? nearest.map(item => `<article class="alternative"><div class="alternative-title"><strong>${escapeHTML(names(item.selectedIds))}</strong></div><p class="infeasible">${escapeHTML(item.violations?.join(' '))}</p><p>${escapeHTML(money(item.totalFee))} · ${number(item.score)} policy points</p></article>`).join('') : '<p class="no-data">Enter valid booking terms or adjust the brief to explore alternatives.</p>';
    return;
  }
  $('alternatives').innerHTML = (slate.alternatives || []).slice(0, 5).map((item, index) => `<article class="alternative"><div class="alternative-title"><strong>${escapeHTML(byId(item.removedId)?.name)} <span class="ui-icon" data-icon="arrow-right" aria-hidden="true"></span> ${escapeHTML(byId(item.addedId)?.name)}</strong><span>${delta(item.scoreDelta)} pts</span></div><p class="${item.feasible ? '' : 'infeasible'}">${item.feasible ? `${item.costDelta > 0 ? '+' : ''}${escapeHTML(money(item.costDelta))} in fees · all constraints satisfied` : escapeHTML(item.violations?.join(' '))}</p>${item.feasible ? `<button class="button small subtle" type="button" data-swap="${index}">Require replacement &amp; re-optimize <span class="ui-icon" data-icon="arrow-up-right" aria-hidden="true"></span></button>` : ''}</article>`).join('') || '<p class="no-data">All available candidates are already on the slate.</p>';
}

function renderPolicy(slate) {
  const policy = slate.policy || {};
  $('policy-content').innerHTML = `<p>${escapeHTML(policy.scoreMeaning || policy.disclaimer || 'Exact enumeration compares every slate under the stated utility policy. Utility is a decision heuristic, not a forecast.')}</p><div class="policy-weights">${Object.entries(policy.weights || {}).map(([key, value]) => `<div class="policy-weight">${escapeHTML(label(key))}<strong>${escapeHTML(value)}</strong></div>`).join('')}</div><p>${escapeHTML(policy.riskRule)} ${escapeHTML(policy.missingFeeRule)}</p><details class="policy-detail-toggle"><summary>Inspect the complete machine-readable policy</summary><pre class="policy-json">${json(policy)}</pre></details>`;
}

function renderMemo() {
  const memo = state.memo, slate = memo.slate;
  if (!slate) throw new Error('This saved run predates the slate optimizer. Build a fresh brief.');
  $('results').hidden = false; $('empty-state').hidden = true;
  $('result-eyebrow').textContent = state.runMock ? 'SYNTHETIC EXAMPLE · BOOKING DECISION' : 'YOUR BOOKING DECISION';
  $('result-title').textContent = !slate.feasible ? 'The brief needs an adjustment.' : slate.status === 'provisional' ? 'A provisional slate to review.' : 'The recommended slate';
  $('result-subtitle').textContent = `${memo.input?.city || $('city').value} · ${slate.constraints?.slots ?? '—'} slots · ${slate.checkedCount} combinations checked · ${slate.feasibleCount} feasible`;
  $('brief-summary').textContent = `${memo.input?.city || $('city').value} · ${slate.constraints?.slots} slots · ${money(slate.constraints?.budget)} budget`;
  $('slate-summary').innerHTML = !slate.feasible
    ? `<div class="explanation-box"><h3>No bookable slate under these constraints.</h3><ul>${(slate.reasons || []).map(reason => `<li>${escapeHTML(reason)}</li>`).join('')}</ul><p>Update fees, availability, locks, or constraints, then re-optimize using the same evidence.</p></div>`
    : `<div class="summary-grid"><div class="summary-stat"><p class="small-label">TOTAL BOOKING FEES</p><strong>${escapeHTML(money(slate.totalFee))}</strong><small>Buyer-entered fees only</small></div><div class="summary-stat"><p class="small-label">BUDGET REMAINING</p><strong>${escapeHTML(money(slate.remainingBudget))}</strong><small>Within ${escapeHTML(money(slate.constraints.budget))} cap</small></div><div class="summary-stat"><p class="small-label">PLANNER UTILITY</p><strong>${number(slate.score)}</strong><small>Policy points · not a forecast</small></div><div class="summary-stat"><p class="small-label">RANK COVERAGE</p><strong>${slate.confidence.supportedFitCount} / ${slate.confidence.totalCount}</strong><small>Selected acts with rank evidence</small></div></div>`;
  $('selected-cards').innerHTML = (slate.selectedIds || []).map((id, index) => {
    const item = byId(id);
    if (!item) return '';
    return `<article class="artist-card"><div class="artist-card-top"><span class="artist-number">ACT ${String(index + 1).padStart(2, '0')}</span><span class="tag ${item.found ? 'discovery' : ''}">${item.found ? 'Discovery' : 'Your shortlist'}</span></div><h3>${escapeHTML(item.name)}</h3><div class="artist-meta">${escapeHTML(item.terms?.genre || 'Genre unassigned')} · ${item.evidence?.rank ? `rank ${escapeHTML(item.rank)} of ${escapeHTML(item.of)}` : 'Rank unverified'}</div><div class="artist-fee">${escapeHTML(money(item.terms?.fee))}<span>assumed booking fee</span></div><p>${escapeHTML(item.note || 'No verified written claims available.')}</p><div class="receipt-links">${receiptLinks(item.receipts)}</div></article>`;
  }).join('');
  renderCandidates(); renderFrontier(slate); renderAlternatives(slate); renderPolicy(slate);
  const baseline = slate.baseline;
  $('baseline-comparison').innerHTML = baseline ? `<div class="baseline"><strong>${baseline.feasible && baseline.scoreDelta != null ? `${delta(baseline.scoreDelta)} policy points vs. the baseline` : 'The input-order baseline is infeasible'}</strong><span>${escapeHTML(baseline.label)}.</span><span>${escapeHTML(names(baseline.selectedIds))} · ${escapeHTML(money(baseline.totalFee))} · ${number(baseline.score)} points</span>${!baseline.feasible ? `<span>${escapeHTML(baseline.violations?.join(' '))}</span>` : ''}</div>` : '';
  $('memo-notes').innerHTML = `<p>${escapeHTML(slate.reasons?.join(' '))}</p><details><summary>Inspect the objective breakdown</summary><div class="breakdown-grid">${Object.entries(slate.objectiveBreakdown || {}).map(([key, value]) => `<span>${escapeHTML(label(key))}<strong>${number(value)}</strong></span>`).join('')}</div></details><details><summary>Evidence limits &amp; run details</summary>${(memo.caveats || []).map(note => `<p>${escapeHTML(note)}</p>`).join('')}<p>${escapeHTML(memo.writer || 'Template')} writer · ${memo.quality?.ranked ?? 0} candidates ranked · ${memo.quality?.deepChecked ?? 0} checked in depth · ${state.receipts.length} receipts</p></details>`;
  updateCurrency(); renderStress(); renderGauntlet(); renderModelBaseline(); updateSaveControls();
}

function renderChoices() {
  $('entity-choices').innerHTML = state.needsInput.map((entry, index) => `<div class="entity-choice"><p><strong>Confirm the artist for “${escapeHTML(entry.name)}”</strong> ${state.picks[entry.name] ? `Selected: ${escapeHTML(state.picks[entry.name].name)}` : 'Choose an identity before rebuilding the brief.'}</p>${(entry.candidates || []).map((candidate, choice) => `<button class="button small subtle" type="button" data-choice="${index}" data-option="${choice}" aria-pressed="${state.picks[entry.name]?.id === candidate.id}">${escapeHTML(candidate.name)} <span>${escapeHTML(candidate.id || '')}</span></button>`).join('')}</div>`).join('') + (state.needsInput.length ? '<button id="resolve-again" type="button" class="button dark resolve-button">Rebuild with confirmed identities <span class="ui-icon" data-icon="arrow-up-right" aria-hidden="true"></span></button>' : '');
}

function recordTrace(event) {
  if ($('live-trace').hidden) return;
  const elapsed = Math.max(0, Math.round((Date.now() - state.traceStarted) / 1000));
  const receipt = event.receipt;
  const detail = event.type === 'stage' ? event.text
    : event.type === 'receipt' ? `${receipt?.tool || 'Tool'} · ${receipt?.status || 'unknown'} · ${receipt?.source === 'synthetic' ? 'synthetic fixture' : receipt?.source || 'source unknown'} · ${receipt?.id || 'no ID'}${Number.isFinite(receipt?.ms) ? ` · ${receipt.ms} ms` : ''}`
    : event.type === 'plan' ? `${event.by === 'llm' ? 'Model' : 'Rules'} selected ${(event.deep || []).length} deep checks`
    : event.type === 'needs_input' ? `Identity confirmation needed for ${event.name}`
    : event.type === 'memo' ? `Exact optimization complete · ${event.slate?.feasible ? 'feasible slate' : 'infeasible, no bookable slate'}`
    : event.type === 'saved' ? 'Run saved with its receipts'
    : event.type === 'error' ? event.text || 'Run stopped'
    : event.type === 'start' ? `${event.mock ? 'Synthetic' : 'Live Qloo'} source selected` : null;
  if (!detail) return;
  state.trace.push({elapsed,type:event.type,detail:String(detail)});
  const inspect = event.type === 'receipt' && receipt?.id ? ` <button type="button" data-receipt="${escapeHTML(receipt.id)}">Inspect receipt</button>` : '';
  $('live-trace-entries').insertAdjacentHTML('beforeend', `<li><time>+${elapsed}s</time><span>${escapeHTML(event.type.replaceAll('_',' '))}</span><strong>${escapeHTML(detail)}${inspect}</strong></li>`);
  $('live-trace-status').textContent = `${state.trace.length} actual events · ${event.type === 'error' ? 'stopped' : event.type === 'saved' ? 'saved' : 'running'}`;
}

let replayTimers = [];
function replaySavedTrace() {
  replayTimers.forEach(clearTimeout); replayTimers = [];
  const trace = Array.isArray(state.snapshot?.trace) ? state.snapshot.trace : [];
  if (!trace.length) return;
  $('live-trace-entries').replaceChildren();
  $('live-trace-status').textContent = `Replaying ${trace.length} recorded events`;
  let previous = 0, delay = 0;
  for (const entry of trace) {
    delay += Math.min(450, Math.max(90, (Number(entry.elapsedMs) || 0) - previous));
    previous = Number(entry.elapsedMs) || previous;
    replayTimers.push(setTimeout(() => {
      const detail = entry.type === 'receipt' ? `${entry.tool || 'Tool'} · ${entry.status || 'unknown'} · ${entry.source || 'source unknown'} · ${entry.receiptId || 'no ID'}${Number.isFinite(entry.ms) ? ` · ${entry.ms} ms` : ''}`
        : entry.type === 'start' ? `${entry.mock ? 'Synthetic' : 'Live Qloo'} source selected`
        : entry.type === 'memo' ? `Exact optimization complete · ${entry.feasible ? 'feasible slate' : 'infeasible, no bookable slate'}`
        : entry.type === 'plan' ? `Evidence plan · ${entry.text}` : entry.text || entry.type.replaceAll('_', ' ');
      const inspect = entry.receiptId && state.receipts.some(receipt => receipt.id === entry.receiptId)
        ? ` <button type="button" data-receipt="${escapeHTML(entry.receiptId)}">Inspect receipt</button>` : '';
      $('live-trace-entries').insertAdjacentHTML('beforeend', `<li><time>+${Math.round((Number(entry.elapsedMs) || 0) / 1000)}s</time><span>${escapeHTML(entry.type.replaceAll('_', ' '))}</span><strong>${escapeHTML(detail)}${inspect}</strong></li>`);
      $('live-trace-status').textContent = `${$('live-trace-entries').children.length}/${trace.length} recorded events · original timings shown`;
    }, delay));
  }
}
$('replay-trace').onclick = replaySavedTrace;

function handleEvent(event) {
  recordTrace(event);
  switch (event.type) {
    case 'start': state.runMock = event.mock; updateMode(event.mock); break;
    case 'stage': {
      $('progress-label').textContent = event.text;
      const text = String(event.text).toLowerCase();
      const active = text.startsWith('resolve') ? 0 : /^(discover|rank)/.test(text) ? 1 : /^(plan|verify)/.test(text) ? 2 : 3;
      document.querySelectorAll('[data-step]').forEach((node, index) => node.classList.toggle('active', index <= active));
      break;
    }
    case 'plan': $('plan-explanation').textContent = `${event.by === 'llm' ? 'LLM evidence planner' : 'Rules evidence planner'}: ${event.reason} Deep checks: ${(event.deep || []).join(', ')}.`; break;
    case 'receipt': state.receipts.push(event.receipt); renderReceipts(); if (event.budget) $('call-budget').textContent = `${event.budget.used} / ${event.budget.max} workflow attempts`; break;
    case 'needs_input': state.needsInput.push(event); renderChoices(); break;
    case 'memo': {
      const { type, ...memo } = event;
      state.memo = memo; state.currency = memo.currency || $('currency').value; state.dirty = false; state.briefDirty = false;
      state.runMock = memo.mode === 'mock' || state.runMock === true;
      updateMode(state.runMock); $('dirty-banner').hidden = true; renderMemo(); break;
    }
    case 'saved': state.savedId = event.id; document.dispatchEvent(new CustomEvent('houselights:decision-loaded',{detail:{id:event.id}})); $('share-link').href = `/m/${encodeURIComponent(event.id)}`; $('share-link').hidden = false; updateSaveControls(); break;
    case 'error': throw new Error(event.text || 'The run could not complete.');
  }
}

async function consumeSSE(response) {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `The server returned ${response.status}. Please try again.`);
  }
  if (!response.body) throw new Error('This browser could not read the streaming response.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  const dispatch = block => {
    const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (data) handleEvent(JSON.parse(data));
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) { dispatch(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); }
      if (done) { if (buffer.trim()) dispatch(buffer); break; }
    }
  } catch (failure) { await reader.cancel().catch(() => {}); throw failure; }
  finally { reader.releaseLock(); }
}

async function buildSlate() {
  if (state.busy || !$('brief-form').reportValidity()) return;
  const anchors = $('anchors').value.split(',').map(value => value.trim()).filter(Boolean);
  if (anchors.length < 1 || anchors.length > 3) { error('Enter between one and three audience anchors, separated by commas.'); return; }
  const offers = state.offers.map(offer => offer.name.trim());
  if (offers.some(name => !name) || new Set(offers.map(name => name.toLowerCase())).size !== offers.length) { error('Give each offer a different artist name.'); return; }
  if (offers.some(name => name.includes(','))) { error('Enter one artist per offer row without commas.'); return; }
  error(''); setView('slate'); setBusy(true);
  state.receipts = []; state.needsInput = []; state.memo = null; state.savedId = null; state.analysis = null; state.gauntlet = null; state.scenarioHistory = []; $('scenario-history').innerHTML = '';
  state.lockedIds.clear(); state.excludedIds.clear();
  state.currency = $('currency').value; state.runMock = state.mock;
  $('results').hidden = true; $('empty-state').hidden = true; $('run-progress').hidden = false; $('entity-choices').innerHTML = '';
  replayTimers.forEach(clearTimeout); replayTimers = []; $('replay-trace').hidden = true;
  state.trace = []; state.traceStarted = Date.now(); $('live-trace-entries').replaceChildren(); $('live-trace').hidden = false;
  $('live-trace-status').textContent = 'Waiting for first server event';
  $('progress-label').textContent = 'Preparing your slate'; $('plan-explanation').textContent = ''; $('call-budget').textContent = '';
  $('share-link').hidden = true; $('dirty-banner').hidden = true;
  document.querySelectorAll('[data-step]').forEach(node => node.classList.remove('active'));
  renderReceipts();
  const payload = { city: $('city').value.trim(), anchors: anchors.join(', '), offers: offers.join(', '), picks: state.picks, terms: Object.fromEntries(state.offers.map(offer => [offer.name.trim(), { fee: offer.fee, genre: offer.genre.trim(), available: offer.available }])), constraints: constraints(), currency: state.currency, exampleBookingTerms: state.example };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 240000);
  try {
    await consumeSSE(await fetch('/api/memo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal }));
    if (!state.memo && !state.needsInput.length) throw new Error('The connection closed before a complete slate arrived. Please try again.');
    if (state.memo) { $('briefing').open = false; toast('Slate checked. Every recommendation has a receipt.'); }
  } catch (failure) {
    error(failure.name === 'AbortError' ? 'The evidence run timed out. Check the server connection and try again.' : failure.message);
    if (!state.memo) $('empty-state').hidden = false;
  } finally { clearTimeout(timeout); $('run-progress').hidden = true; setBusy(false);
    $('live-trace-status').textContent = `${state.trace.length} actual events · ${state.memo ? 'decision complete' : 'run incomplete'}`; }
}

async function optimize() {
  if (state.busy || !state.memo) return;
  if (state.briefDirty) { error('The artist shortlist, market, or audience anchors changed. Use “Build my slate” to retrieve fresh evidence for that brief.'); $('briefing').open = true; $('build-button').focus(); return; }
  for (const node of document.querySelectorAll('.constraint-panel input, #candidate-rows input')) if (!node.reportValidity()) return;
  error(''); setBusy(true, 'optimize');
  try {
    const response = await fetch('/api/optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: state.memo.items, constraints: constraints() }), signal: AbortSignal.timeout(30000) });
    const slate = await response.json();
    if (!response.ok) throw new Error(slate.error || `Optimization returned ${response.status}.`);
    state.memo.slate = slate; state.memo.constraints = slate.constraints; state.memo.currency = state.currency; state.memo.input.currency = state.currency; state.analysis = null; state.gauntlet = null;
    state.dirty = false; $('dirty-banner').hidden = true; $('share-link').hidden = true;
    state.memo.modifiedLocally = true;
    renderMemo(); toast(`${slate.checkedCount} combinations checked using saved evidence · no Qloo calls.`);
  } catch (failure) { error(failure.name === 'TimeoutError' ? 'The optimizer timed out. Check the server and try again.' : failure.message); }
  finally { setBusy(false); }
}

function exportRun() {
  const payload = { schema: 'houselights-receipts-v1', exportedAt: new Date().toISOString(), source: state.runMock ? 'synthetic' : 'qloo', exampleBookingTerms: state.example, originalSavedRunId: state.savedId, modifiedLocally: !!state.memo?.modifiedLocally, pendingEdits: state.dirty, memo: state.memo, stressAnalysis: state.analysis, decisionGauntlet: state.gauntlet, scenarios: state.scenarioHistory, pendingConstraints: state.dirty ? constraints() : undefined, receipts: state.receipts };
  const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = href; anchor.download = `houselights-${(state.memo?.input?.city || 'evidence').toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${Date.now()}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  toast('Exported evidence, booking assumptions, and decision policy.');
}

async function loadSaved(id) {
  replayTimers.forEach(clearTimeout); replayTimers = [];
  state.trace = []; $('live-trace').hidden = true; $('replay-trace').hidden = true;
  setBusy(true); $('progress-label').textContent = 'Loading saved evidence'; $('run-progress').hidden = false;
  try {
    const response = await fetch(`/api/memo/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(response.status === 404 ? 'This saved run could not be found. You can build a new brief below.' : 'The saved run could not be loaded.');
    const saved = await response.json();
    if (!saved.memo?.slate) throw new Error('This saved run predates the slate optimizer. Build a new brief below.');
    state.snapshot = saved;
    state.memo = saved.memo; state.receipts = saved.receipts || []; state.savedId = id; state.runMock = saved.mock === true || saved.memo.mode === 'mock'; state.gauntlet = null;
    if (Array.isArray(saved.trace) && saved.trace.length) {
      $('live-trace').hidden = false; $('replay-trace').hidden = false;
      $('live-trace-entries').replaceChildren();
      $('live-trace-status').textContent = `${saved.trace.length} recorded events · replay available`;
    }
    document.dispatchEvent(new CustomEvent('houselights:decision-loaded',{detail:{id}}));
    state.currency = saved.memo.currency || saved.input?.currency || 'USD';
    const input = saved.memo.input || saved.input;
    state.picks = { ...saved.input?.picks, ...Object.fromEntries(saved.memo.items.filter(item => item.originalName).map(item => [item.originalName, { id: item.id, name: item.name }])) };
    state.example = saved.memo.exampleBookingTerms === true || input.exampleBookingTerms === true || saved.input?.exampleBookingTerms === true;
    $('example-note').hidden = !state.example;
    $('city').value = input.city || ''; $('anchors').value = (input.anchors || []).join(', '); $('currency').value = state.currency;
    state.offers = (input.offers || []).slice(0, 6).map(name => {
      const key = name.trim().toLowerCase();
      const item = saved.memo.items.find(item => item.originalName?.trim().toLowerCase() === key)
        || saved.memo.items.find(item => item.name.trim().toLowerCase() === key);
      const terms = item?.terms || Object.entries(saved.input?.terms || {}).find(([original]) => original.trim().toLowerCase() === key)?.[1];
      return { name, fee: terms?.fee ?? null, genre: terms?.genre || '', available: terms?.available === true };
    });
    if (!state.offers.length) state.offers = [{ name: '', fee: null, genre: '', available: false }];
    state.dirty = false; state.briefDirty = false;
    putConstraints(saved.memo.slate.constraints || saved.memo.constraints); renderOffers(); renderReceipts(); renderMemo(); updateMode(state.runMock, true);
    window.houselightsGM?.render();
    window.houselightsDecision?.refresh();
    $('briefing').open = false; $('share-link').href = `/m/${encodeURIComponent(id)}`; $('share-link').hidden = false;
    if (saved.scenario) { $('scenario-name').value = saved.scenarioName || 'Alternative slate'; state.scenarioHistory.push({ id, name: saved.scenarioName || 'Saved scenario', parentId: saved.parentId }); renderScenarioHistory(); }
    return true;
  } catch (failure) { error(failure.message); return false; }
  finally { setBusy(false); $('run-progress').hidden = true; }
}

document.addEventListener('click', event => {
  const preview = event.target.closest('[data-gauntlet-preview]'); if (preview) { previewGauntletChallenge(preview.dataset.gauntletPreview); return; }
  const view = event.target.closest('[data-view]'); if (view) setView(view.dataset.view);
  const gauntletAction = event.target.closest('[data-gauntlet-action]'); if (gauntletAction) takeGauntletAction(gauntletAction.dataset.gauntletAction);
  const remove = event.target.closest('[data-remove]'); if (remove && !state.busy && state.offers.length > 1) { state.offers.splice(Number(remove.dataset.remove), 1); renderOffers(); markBriefDirty('Your shortlist changed. Build a new slate to retrieve evidence for the revised brief.'); }
  const receipt = event.target.closest('[data-receipt]');
  if (receipt) {
    const index = state.receipts.findIndex(row => row.id === receipt.dataset.receipt);
    if (index >= 0) { setView('evidence'); const node = $(`receipt-${index}`); node.open = true; node.scrollIntoView({ behavior: 'smooth', block: 'center' }); node.querySelector('summary').focus({ preventScroll: true }); }
    else toast('This receipt is not available in the loaded run.');
  }
  const choice = event.target.closest('[data-choice]'); if (choice && !state.busy) { const entry = state.needsInput[Number(choice.dataset.choice)]; state.picks[entry.name] = entry.candidates[Number(choice.dataset.option)]; renderChoices(); }
  if (event.target.closest('#resolve-again') && !state.busy) {
    if (state.needsInput.some(entry => !state.picks[entry.name])) { error('Confirm an identity for every ambiguous artist before rebuilding.'); return; }
    buildSlate();
  }
  const swap = event.target.closest('[data-swap]'); if (swap && !state.busy) {
    const alternative = state.memo.slate.alternatives[Number(swap.dataset.swap)];
    state.lockedIds.delete(alternative.removedId); state.excludedIds.add(alternative.removedId);
    state.excludedIds.delete(alternative.addedId); state.lockedIds.add(alternative.addedId);
    markDirty(); renderCandidates(); optimize();
  }
});

$('offer-rows').addEventListener('input', event => {
  const target = event.target, offer = state.offers[Number(target.dataset.offer)]; if (!offer) return;
  offer[target.dataset.field] = target.type === 'checkbox' ? target.checked : target.dataset.field === 'fee' ? target.value === '' ? null : Number(target.value) : target.value;
  markBriefDirty('Your booking brief changed. Build a new slate to use the updated shortlist and terms.');
});
$('candidate-rows').addEventListener('input', event => {
  const target = event.target, item = state.memo?.items[Number(target.dataset.candidate)]; if (!item) return;
  const field = target.dataset.field;
  if (field === 'locked' || field === 'excluded') {
    const set = field === 'locked' ? state.lockedIds : state.excludedIds, other = field === 'locked' ? state.excludedIds : state.lockedIds;
    if (target.checked) { set.add(item.id); other.delete(item.id); } else set.delete(item.id);
    renderCandidates();
  } else {
    item.terms ||= {};
    item.terms[field] = target.type === 'checkbox' ? target.checked : field === 'fee' ? target.value === '' ? null : Number(target.value) : target.value;
  }
  state.memo.modifiedLocally = true; markDirty();
});
$('add-offer').addEventListener('click', () => { if (!state.busy && state.offers.length < 6) { state.offers.push({ name: '', fee: null, genre: '', available: true }); renderOffers(); $('offer-rows').lastElementChild.querySelector('input').focus(); markBriefDirty('Your shortlist changed. Build a new slate to retrieve evidence for the revised brief.'); } });
$('brief-form').addEventListener('submit', event => { event.preventDefault(); buildSlate(); });
$('load-scenario').addEventListener('click', loadExample); $('empty-example').addEventListener('click', loadExample);
$('risk').addEventListener('input', () => { updateRisk(); markDirty(); });
for (const id of ['budget', 'slots', 'discovery-min', 'max-per-genre']) $(id).addEventListener('input', () => markDirty());
for (const id of ['city', 'anchors']) $(id).addEventListener('input', () => { state.picks = {}; markBriefDirty('The audience brief changed. Build a new slate to retrieve evidence for the new market or anchors.'); });
$('currency').addEventListener('change', () => { state.currency = $('currency').value; updateCurrency(); markDirty('Currency label changed; amounts are not converted. Verify your quotes and re-optimize.'); });
$('optimize-button').addEventListener('click', optimize);
$('export-json').addEventListener('click', exportRun); $('ledger-export').addEventListener('click', exportRun);
$('print-brief').addEventListener('click', () => { setView('slate'); if (state.dirty) { error('Update the recommendation before printing: re-optimize booking changes, or build a new slate for changes to the audience brief.'); return; } window.print(); });

state.offers = [{ name: '', fee: null, genre: '', available: true }, { name: '', fee: null, genre: '', available: true }, { name: '', fee: null, genre: '', available: true }];
renderOffers(); updateRisk(); checkHealth();
const savedMatch = window.location.pathname.match(/^\/m\/([^/]+)\/?$/);
if (savedMatch) loadSaved(decodeURIComponent(savedMatch[1])).then(() => {
  if (location.hash.startsWith('#portfolio=')) window.houselightsAdvanced?.openPortfolio(location.hash.slice(11));
  else if (location.hash === '#gm') setView('gm');
  else if (location.hash === '#room' || state.snapshot?.decisionProof) setView('room');
});

function renderGauntlet() {
  const result = state.gauntlet;
  $('gauntlet-empty').hidden = !!result;
  $('gauntlet-results').hidden = !result;
  $('gauntlet-count').textContent = result ? `${result.completed}/${result.total}` : '0/6';
  if (!result) {
    $('score-gauntlet').innerHTML = state.memo ? 'Score this slate <span class="ui-icon" data-icon="arrow-up-right" aria-hidden="true"></span>' : 'Build a slate first';
    $('score-gauntlet').disabled = state.busy || !state.memo || !state.savedId;
    return;
  }
  $('gauntlet-xp').textContent = result.xp;
  $('gauntlet-tier').textContent = result.tier;
  $('gauntlet-next').textContent = result.nextMove;
  $('gauntlet-summary').textContent = `${result.completed} of ${result.total} missions · ${result.xp} / ${result.totalXp} verified XP`;
  $('xp-progress').style.width = `${result.progressPercent}%`;
  $('xp-ring').style.setProperty('--progress', `${result.progressPercent * 3.6}deg`);
  const metrics = result.metrics || {};
  $('gauntlet-metrics').innerHTML = [
    ['Budget used', metrics.budgetUsePercent == null ? '—' : `${metrics.budgetUsePercent}%`],
    ['Genres', metrics.genreCount ?? '—'],
    ['Discoveries', metrics.discoveredCount ?? '—'],
    ['Rank coverage', `${metrics.rankCoveragePercent ?? 0}%`],
    ['+10% quotes', metrics.quoteShock10 == null ? 'Unknown' : metrics.quoteShock10 ? 'Holds' : 'Breaks']
  ].map(([name, value]) => `<div><span>${escapeHTML(name)}</span><strong>${escapeHTML(value)}</strong></div>`).join('');
  $('mission-grid').innerHTML = result.missions.map((mission, index) => `<article class="mission-card ${mission.achieved ? 'complete' : ''}"><div class="mission-top"><span class="mission-number">${String(index + 1).padStart(2, '0')}</span><span class="mission-icon ui-icon" data-icon="${Object.hasOwn(gauntletPreviews, mission.id) ? gauntletPreviews[mission.id].icon : 'shield-check'}" aria-hidden="true"></span><span class="mission-points">${mission.achieved ? `+${mission.points} XP` : `${mission.points} XP`}</span></div><p class="small-label">${mission.achieved ? 'MISSION CLEARED' : 'OPEN MISSION'}</p><h2>${escapeHTML(mission.title)}</h2><p>${escapeHTML(mission.instruction)}</p><div class="mission-progress"><span class="ui-icon" data-icon="${mission.achieved ? 'check' : 'circle'}" aria-hidden="true"></span>${escapeHTML(mission.progress)}</div><button type="button" class="button ${mission.achieved ? 'subtle' : 'dark'} small" data-gauntlet-action="${escapeHTML(mission.action)}">${mission.achieved ? 'Review' : escapeHTML(mission.actionLabel)} <span class="ui-icon" data-icon="arrow-up-right" aria-hidden="true"></span></button></article>`).join('');
}

async function scoreGauntlet() {
  if (state.busy || !state.memo || !state.savedId) return;
  if (state.dirty || state.briefDirty) { error('Re-optimize the current assumptions before scoring the Gauntlet. Every mission must match the displayed slate.'); setView('slate'); return; }
  error(''); setBusy(true, 'gauntlet');
  for (const id of ['score-gauntlet', 'rescore-gauntlet']) $(id).textContent = 'Verifying missions…';
  try {
    const response = await fetch('/api/gauntlet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId: state.savedId, constraints: state.memo.constraints, terms: Object.fromEntries(state.memo.items.map(item => [item.id, item.terms])) }), signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The Decision Gauntlet could not be scored.');
    state.gauntlet = result; renderGauntlet(); setView('gauntlet');
    toast(`${result.completed} missions cleared · ${result.xp} server-verified XP.`);
  } catch (failure) { error(failure.message); }
  finally {
    $('score-gauntlet').innerHTML = 'Score this slate <span class="ui-icon" data-icon="arrow-up-right" aria-hidden="true"></span>';
    $('rescore-gauntlet').innerHTML = 'Re-score current slate <span class="ui-icon" data-icon="refresh" aria-hidden="true"></span>';
    setBusy(false);
  }
}

function takeGauntletAction(action) {
  if (!state.memo || state.busy) return;
  if (action === 'evidence') { setView('evidence'); return; }
  if (action === 'shock') { setView('slate'); analyze(); return; }
  setView('slate');
  if (action === 'pressure') {
    const sourceBudget = Number(state.memo.input?.constraints?.budget || state.memo.constraints?.budget);
    $('budget').value = Math.round(sourceBudget * .9 * 100) / 100;
    markDirty('The Gauntlet lowered the budget to 90% of the source brief. Re-optimize to test it.');
  } else if (action === 'discovery') {
    $('discovery-min').value = Math.max(1, Number($('discovery-min').value));
    markDirty('The Gauntlet now requires a discovered act. Give a discovery a quote and availability, then re-optimize.');
  } else if (action === 'diversity') {
    $('max-per-genre').value = 1;
    markDirty('The Gauntlet capped the slate at one act per planning genre. Re-optimize to test the mix.');
  } else if (action === 'conviction') {
    toast('Lock one act you believe in or exclude one you would pass on, then re-optimize.');
  }
  $('results').scrollIntoView({ behavior: 'smooth', block: action === 'conviction' ? 'center' : 'start' });
}

function updateSaveControls() {
  $('save-scenario').disabled = state.busy || !state.memo || !state.savedId || state.dirty || state.briefDirty;
  $('scenario-name').disabled = state.busy;
}

function renderStress() {
  const result = state.analysis;
  if (!result) { $('stress-output').innerHTML = `<p class="muted">${state.dirty ? 'Re-optimize your edited assumptions, then test the updated plan.' : 'Compare five budgets and four fee scenarios. No new Qloo calls.'}</p>`; return; }
  const status = feasible => `<span class="${feasible ? 'status-ok' : 'status-fail'}">${feasible ? 'Feasible' : 'No feasible slate'}</span>`;
  $('stress-output').innerHTML = `<p class="stress-intro">${escapeHTML(result.basis)}</p>${result.headroom ? `<p class="stress-intro"><strong>${escapeHTML(money(result.headroom.budgetAmount))}</strong> unallocated · ${number(result.headroom.budgetPercent)}% of the current budget. This is remaining budget, not a likelihood of success.</p>` : ''}<div class="stress-grid"><div><h3>If the budget changes</h3>${result.budgetScenarios.map(row => `<div class="stress-row"><div><strong>${escapeHTML(money(row.budget))} <small>(${row.deltaPercent > 0 ? '+' : ''}${row.deltaPercent}%)</small></strong>${status(row.feasible)}</div><p>${row.feasible ? escapeHTML(names(row.selectedIds)) : 'The current booking rules cannot all be met.'}</p>${row.feasible ? `<p>${row.retainedCount} original acts retained · ${number(row.score)} policy points${row.status === 'provisional' ? ' · provisional evidence' : ''}</p>` : ''}</div>`).join('')}</div><div><h3>If every known quote rises</h3>${result.feeScenarios.map(row => `<div class="stress-row"><div><strong>Fees +${row.increasePercent}%</strong><span class="${row.currentSlateFeasible ? 'status-ok' : 'status-fail'}">${row.currentSlateFeasible == null ? 'No baseline slate' : row.currentSlateFeasible ? 'Current slate holds' : 'Current slate breaks'}</span></div><p>${row.currentSlateCost == null ? 'Resolve the initial brief first.' : `Original slate fees: ${escapeHTML(money(row.currentSlateCost))}.`}</p><p>${row.feasible ? `Best feasible choice: ${escapeHTML(names(row.bestSelectedIds))} · ${escapeHTML(money(row.bestTotalFee))}${row.status === 'provisional' ? ' · provisional evidence' : ''}` : 'No replacement slate satisfies the unchanged rules.'}</p></div>`).join('')}</div></div><details class="stress-footnote"><summary>Scenario assumptions and limits</summary>${result.warnings.map(warning => `<p>${escapeHTML(warning)}</p>`).join('')}</details>`;
}

async function analyze() {
  if (state.busy || !state.memo) return;
  if (state.dirty || state.briefDirty) { error('Update the slate before running stress tests, so the analysis matches your current assumptions.'); return; }
  error(''); setBusy(true, 'analyze'); $('analyze-button').textContent = 'Testing the plan…';
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: state.memo.items, constraints: state.memo.constraints }), signal: AbortSignal.timeout(30000) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Stress analysis could not complete.');
    state.analysis = result; renderStress(); toast(`${result.budgetScenarios.length + result.feeScenarios.length} planning scenarios checked. No new Qloo calls.`);
  } catch (failure) { error(failure.message); }
  finally { setBusy(false); $('analyze-button').innerHTML = 'Run stress tests <span class="ui-icon" data-icon="shield-check" aria-hidden="true"></span>'; }
}

function renderScenarioHistory() {
  $('scenario-history').className = 'scenario-history';
  $('scenario-history').innerHTML = state.scenarioHistory.map(row => `<a href="/m/${encodeURIComponent(row.id)}">${escapeHTML(row.name)} <span class="ui-icon" data-icon="arrow-up-right" aria-hidden="true"></span></a>${row.parentId ? `<a href="/m/${encodeURIComponent(row.parentId)}">Source run <span class="ui-icon" data-icon="arrow-up-right" aria-hidden="true"></span></a>` : ''}`).join('');
}

async function saveScenario() {
  if (state.busy || state.dirty || state.briefDirty || !state.savedId || !state.memo) return;
  const scenarioName = $('scenario-name').value.trim() || 'Alternative slate';
  error(''); setBusy(true, 'save'); $('save-scenario').textContent = 'Saving…';
  try {
    const response = await fetch('/api/scenario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId: state.savedId, name: scenarioName, currency: state.currency, constraints: state.memo.constraints, terms: Object.fromEntries(state.memo.items.map(item => [item.id, item.terms])) }), signal: AbortSignal.timeout(30000) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'The scenario could not be saved.');
    state.savedId = result.id; state.memo = result.snapshot.memo;
    document.dispatchEvent(new CustomEvent('houselights:decision-loaded',{detail:{id:result.id}}));
    state.scenarioHistory.push({ id: result.id, name: scenarioName, parentId: result.snapshot.parentId });
    $('share-link').href = `/m/${encodeURIComponent(result.id)}`; $('share-link').hidden = false;
    renderMemo(); renderScenarioHistory(); toast('Scenario saved with the original evidence and a link to its source.');
  } catch (failure) { error(failure.message); }
  finally { $('save-scenario').innerHTML = 'Save scenario <span class="ui-icon" data-icon="save" aria-hidden="true"></span>'; setBusy(false); }
}

function renderModelBaseline() {
  const base = state.memo?.base, evaluation = state.memo?.eval;
  if (!base) { $('llm-baseline').innerHTML = '<p>The optional model-only comparison is unavailable for this run. When enabled, it asks a model about the same room without Qloo or other tools. The input-order slate comparison in the studio is a separate deterministic baseline.</p>'; return; }
  $('llm-baseline').innerHTML = '<p>This model-only answer has no Qloo receipts. Differences show where data changed the decision; they do not establish which answer is right.</p>' + `<div class="table-scroll"><table class="frontier-table"><thead><tr><th>Artist</th><th>Without Qloo</th><th>Model explanation</th></tr></thead><tbody>${base.verdicts.map(row => `<tr><td>${escapeHTML(row.name)}</td><td>${escapeHTML(row.verdict)}</td><td>${escapeHTML(row.reason)}</td></tr>`).join('')}</tbody></table></div>` + (evaluation ? `<p>Exact verdict agreement: ${number(evaluation.exact)} · direction agreement: ${number(evaluation.direction)} · rank correlation: ${number(evaluation.rho)}. Descriptive comparison only.</p>` : '');
}

$('analyze-button').addEventListener('click', analyze);
$('save-scenario').addEventListener('click', saveScenario);
$('score-gauntlet').addEventListener('click', scoreGauntlet);
$('rescore-gauntlet').addEventListener('click', scoreGauntlet);
$('enter-gauntlet').addEventListener('click', scoreGauntlet);
// Atmosphere is decorative, opt-in, and always respects the system motion preference.
const atmosphereMotionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const atmosphereStorageKey = 'houselights:motion';
let atmosphereEnabled = false;
try { atmosphereEnabled = localStorage.getItem(atmosphereStorageKey) === 'on'; } catch { /* Storage can be unavailable in private contexts. */ }
function renderAtmosphereMotion() {
  const button = $('motion-toggle');
  const reduced = atmosphereMotionPreference.matches;
  const playing = atmosphereEnabled && !reduced;
  $('atmosphere-image').closest('.atmosphere').classList.toggle('is-playing', playing && !document.hidden);
  button.disabled = reduced;
  button.setAttribute('aria-pressed', String(playing));
  button.textContent = reduced ? 'Motion reduced' : playing ? 'Pause atmosphere' : 'Play atmosphere';
  $('motion-preference').textContent = reduced
    ? 'Still artwork · follows your reduced-motion preference'
    : playing ? 'Gentle motion enabled · no sound' : 'A little motion while you plan · off by default';
}
$('motion-toggle').addEventListener('click', () => {
  if (atmosphereMotionPreference.matches) return;
  atmosphereEnabled = !atmosphereEnabled;
  try { localStorage.setItem(atmosphereStorageKey, atmosphereEnabled ? 'on' : 'off'); } catch { /* Keep the control usable without storage. */ }
  renderAtmosphereMotion();
});
atmosphereMotionPreference.addEventListener('change', renderAtmosphereMotion);
document.addEventListener('visibilitychange', renderAtmosphereMotion);
renderAtmosphereMotion();
