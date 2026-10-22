(() => {
  const $ = id => document.getElementById(id);
  const state = { payload: null, input: null, jobId: null, polling: null, active: null };
  const setText = (node, value) => { node.textContent = value == null ? '—' : String(value); return node; };
  const cell = (row, value) => row.appendChild(setText(document.createElement('td'), value));
  const currency = () => state.payload?.config?.currency ?? 'GBP';
  const money = value => value == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency(), maximumFractionDigits: 0 }).format(value);
  const pct = value => value == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 1 }).format(value);
  const number = value => value == null ? '—' : new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value);
  const ids = values => values?.map(id => state.input?.candidates?.find(item => item.id === id)?.name ?? id).join(' · ') ?? 'No feasible decision';
  function metric(label, value, note) {
    const article = document.createElement('article');
    article.appendChild(setText(document.createElement('span'), label));
    article.appendChild(setText(document.createElement('strong'), value));
    if (note) article.appendChild(setText(document.createElement('small'), note));
    return article;
  }
  function svgText(x, y, value, anchor = 'middle') {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    node.setAttribute('x', x); node.setAttribute('y', y); node.setAttribute('text-anchor', anchor); node.textContent = value;
    return node;
  }
  function svgElement(name, attributes) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }
  function chart(row) {
    const key = $('distribution').value, data = row.metrics[key], root = $('chart'); root.replaceChildren();
    if (!data) return;
    const svg = svgElement('svg', { viewBox: '0 0 820 270', role: 'presentation', preserveAspectRatio: 'xMidYMid meet' });
    const bars = data.histogram, max = Math.max(1, ...bars.map(item => item.count));
    svg.appendChild(svgElement('line', { x1: 42, y1: 220, x2: 805, y2: 220, stroke: '#c7bfd6' }));
    const width = 750 / bars.length;
    bars.forEach((bar, index) => {
      const height = bar.count / max * 176, rect = svgElement('rect', { x: 48 + index * width, y: 220 - height,
        width: Math.max(3, width - 3), height, rx: 3, fill: '#7357c8' });
      rect.appendChild(setText(document.createElementNS('http://www.w3.org/2000/svg', 'title'),
        `${key}: ${['attendance','paidTickets'].includes(key) ? number(bar.from) : money(bar.from)} to ${['attendance','paidTickets'].includes(key) ? number(bar.to) : money(bar.to)} · ${number(bar.count)} draws`));
      svg.appendChild(rect);
    });
    const xFor = value => 48 + 750 * (value - data.minimum) / Math.max(1e-9, data.maximum - data.minimum);
    if (data.minimum < 0 && data.maximum > 0) svg.appendChild(svgElement('line', { x1: xFor(0), y1: 30, x2: xFor(0), y2: 220, stroke: '#191919', 'stroke-width': 1.5, 'stroke-dasharray': '5 5' }));
    for (const [label, value, color] of [['P5', data.p5, '#b74661'], ['MEDIAN', data.median, '#191919'], ['P95', data.p95, '#579177']]) {
      const x = xFor(value);
      svg.appendChild(svgElement('line', { x1: x, y1: 26, x2: x, y2: 220, stroke: color, 'stroke-width': 2 }));
      const text = svgText(x, label === 'MEDIAN' ? 18 : 246, label);
      text.setAttribute('fill', color); svg.appendChild(text);
    }
    svg.appendChild(svgText(48, 264, ['attendance','paidTickets'].includes(key) ? number(data.minimum) : money(data.minimum), 'start'));
    svg.appendChild(svgText(798, 264, ['attendance','paidTickets'].includes(key) ? number(data.maximum) : money(data.maximum), 'end'));
    root.appendChild(svg);
    root.setAttribute('aria-label', `${key} distribution from ${['attendance','paidTickets'].includes(key) ? number(data.minimum) : money(data.minimum)} to ${['attendance','paidTickets'].includes(key) ? number(data.maximum) : money(data.maximum)}; median ${['attendance','paidTickets'].includes(key) ? number(data.median) : money(data.median)}.`);
    const format = ['attendance','paidTickets'].includes(key) ? number : money;
    $('quartiles').replaceChildren(...[['5th', data.p5], ['25th', data.p25], ['Median', data.median], ['75th', data.p75], ['95th', data.p95]].map(([label, value]) =>
      setText(document.createElement('span'), `${label}: ${format(value)}`)));
  }
  function frontier(rows, selectedIds) {
    const root = $('frontier'); root.replaceChildren(); if (!rows.length) return;
    const svg = svgElement('svg', { viewBox: '0 0 700 265', role: 'presentation' });
    const profits = rows.map(row => row.metrics.profit.mean), risks = rows.map(row => row.metrics.conditionalValueAtRisk95);
    const minP = Math.min(...profits), maxP = Math.max(...profits), minR = Math.min(...risks), maxR = Math.max(...risks);
    const x = value => 72 + 580 * (value - minR) / Math.max(1, maxR - minR);
    const y = value => 204 - 160 * (value - minP) / Math.max(1, maxP - minP);
    svg.appendChild(svgElement('line', { x1: 72, y1: 204, x2: 652, y2: 204, stroke: '#aba4b7' }));
    svg.appendChild(svgElement('line', { x1: 72, y1: 38, x2: 72, y2: 204, stroke: '#aba4b7' }));
    svg.appendChild(svgText(360, 245, 'WORST-TAIL LOSS →'));
    svg.appendChild(svgText(15, 24, '↑ PROFIT', 'start'));
    rows.forEach((row, index) => {
      const selected = JSON.stringify(row.selectedIds) === JSON.stringify(selectedIds);
      const circle = svgElement('circle', { cx: x(row.metrics.conditionalValueAtRisk95), cy: y(row.metrics.profit.mean),
        r: selected ? 11 : 8, fill: selected ? '#7357c8' : '#c9bce8', stroke: '#fff', 'stroke-width': 2 });
      circle.appendChild(setText(document.createElementNS('http://www.w3.org/2000/svg', 'title'),
        `${ids(row.selectedIds)}: ${money(row.metrics.profit.mean)} mean, ${money(row.metrics.conditionalValueAtRisk95)} worst-tail loss`));
      svg.appendChild(circle); svg.appendChild(svgText(x(row.metrics.conditionalValueAtRisk95) + 15, y(row.metrics.profit.mean) - 9, String(index + 1), 'start'));
    });
    root.appendChild(svg); root.setAttribute('aria-label', `${rows.length} feasible lineups plotted by mean profit and worst-tail loss.`);
  }
  function render() {
    const payload = state.payload, result = payload?.result;
    if (!result || result.status !== 'scenario_complete') { $('warning').textContent = result?.reason ?? 'No financial result is available.'; return; }
    const set = result.assumptionResults.find(row => row.id === $('assumption-select').value) ?? result.assumptionResults[0];
    const chosen = set.rows.find(row => JSON.stringify(row.selectedIds) === JSON.stringify(set.selectedIds)) ?? set.rows[0];
    state.active = chosen;
    $('decision-label').textContent = `${set.decisionStatus === 'do_not_book_under_assumptions' ? 'No financially attractive lineup under these assumptions · least-loss comparison: ' : set.decisionStatus === 'no_lineup_within_downside_limit' ? 'No lineup meets the downside limit · comparison: ' : 'Conditional preference: '}${ids(chosen.selectedIds)} · ${number(result.finalCount)} financially simulated finalists`;
    $('metrics').replaceChildren(
      metric('Expected net profit', money(chosen.metrics.profit.mean), 'Scenario mean'),
      metric('Chance of breaking even', pct(chosen.metrics.breakEvenProbability), `${number(payload.config.simulation.draws)} seeded draws`),
      metric('5th-percentile profit', money(chosen.metrics.profit.p5), 'Adverse threshold'),
      metric('Worst 5% mean loss', money(chosen.metrics.conditionalValueAtRisk95), 'CVaR at 95%'),
      metric('Expected paid tickets sold', number(chosen.metrics.paidTickets.mean), `Capacity ${number(payload.config.sellableCapacity)}`),
      metric('Cash before revenue', money(chosen.metrics.cashBeforeRevenue.mean), 'Deposit and pre-event needs'),
      metric('Loss beyond threshold', pct(chosen.metrics.lossBeyondThresholdProbability), `Threshold ${money(payload.config.lossThresholdCents / 100)}`),
      metric('Event budget overrun', pct(chosen.metrics.eventBudgetOverrunProbability), 'Includes shocked costs and fees')
    );
    $('warning').textContent = `${payload.label ?? 'PRIVATE SCENARIO'} · ${chosen.demand.caveat} ${set.decisionStatus === 'no_lineup_within_downside_limit' ? 'No finalist meets the declared CVaR limit; the table is shown for comparison, not approval.' : ''} ${set.rows.every(row => row.metrics.profit.mean < 0) ? 'Every compared lineup has negative modeled expected profit under this assumption set.' : ''}`;
    chart(chosen); frontier(set.rows, set.selectedIds);
    const tbody = $('alternatives').querySelector('tbody'); tbody.replaceChildren();
    set.rows.forEach((row, index) => { const tr = document.createElement('tr');
      cell(tr, `${index + 1}. ${ids(row.selectedIds)}`); cell(tr, money(row.metrics.profit.mean));
      cell(tr, pct(row.metrics.breakEvenProbability)); cell(tr, money(row.metrics.conditionalValueAtRisk95));
      cell(tr, number(row.culturalFit)); cell(tr, row.breakEvenTickets == null ? 'Beyond capacity' : number(row.breakEvenTickets));
      tbody.appendChild(tr); });
    $('filter-disclosure').textContent = result.filterDisclosure;
    const stressBody = $('stress').querySelector('tbody'); stressBody.replaceChildren();
    for (const item of result.stressTestsBySet?.[set.id] ?? result.stressTests ?? []) { const tr = document.createElement('tr');
      cell(tr, item.label); cell(tr, money(item.originalExpectedProfit)); cell(tr, money(item.originalProfitChange));
      cell(tr, money(item.originalCvarLoss)); cell(tr, item.decisionChanges ? 'Yes' : 'No'); stressBody.appendChild(tr); }
    $('drivers').replaceChildren(...(result.explanationsBySet?.[set.id]?.drivers ?? result.explanations?.drivers ?? []).slice(0, 5).map(item => {
      const box = document.createElement('div'); box.appendChild(setText(document.createElement('span'), item.name));
      box.appendChild(setText(document.createElement('strong'), money(item.expectedProfitChange))); return box; }));
    const provenance = $('provenance'); provenance.replaceChildren();
    const lines = [
      `Demand basis: ${chosen.demand.source}; Qloo source: ${payload.provenance?.sourceClassification ?? payload.provenance?.qlooSource ?? 'unknown'}.`,
      `Model ${payload.config.modelVersion}; seed ${payload.config.simulation.seed}; ${number(payload.config.simulation.draws)} common market draws per lineup.`,
      `Tax: ${payload.config.tax.mode} at declared ${pct(payload.config.tax.rate)}; ticketing fees borne by ${payload.config.fees.ownership}.`,
      `Evidence references: ${payload.config.evidenceReferences.length ? payload.config.evidenceReferences.join(' · ') : 'none supplied'}.`,
      `Historical financial validation: ${payload.provenance?.historicalFinancialValidation ?? 'see organizer validation status'}.`
    ];
    lines.forEach(line => provenance.appendChild(setText(document.createElement('p'), line)));
    $('audit-preview').textContent = JSON.stringify({ id: payload.id ?? null, inputDigest: payload.inputDigest ?? null,
      resultDigest: payload.resultDigest ?? null, config: payload.config, provenance: payload.provenance,
      selected: chosen, caveat: result.caveat }, null, 2);
  }
  function adopt(payload) {
    state.payload = payload; state.input = payload.input ?? payload.snapshot?.demandInput ?? state.input;
    const select = $('assumption-select'); select.replaceChildren(...(payload.result?.assumptionResults ?? []).map(item => {
      const option = document.createElement('option'); option.value = item.id; option.textContent = item.id; return option; }));
    render();
  }
  async function loadDemo() {
    const response = await fetch('/financial-demo.json'); if (!response.ok) throw new Error('Illustration is unavailable.');
    const payload = await response.json(); adopt(payload);
    $('scenario-json').value = JSON.stringify(payload.input, null, 2);
    $('source-ribbon').textContent = 'SYNTHETIC ILLUSTRATION · 10,000 actual seeded calculations · zero observed-event calibration · no Qloo receipt';
  }
  async function poll(id) {
    clearTimeout(state.polling);
    const response = await fetch(`/api/financial/jobs/${id}`); const job = await response.json();
    if (!response.ok) throw new Error(job.error ?? 'Could not read financial job.');
    $('job-status').textContent = `Job ${job.id}: ${job.status}${job.error ? ` — ${job.error}` : ''}`;
    if (job.status === 'running') { state.polling = setTimeout(() => poll(id).catch(showError), 1100); return; }
    $('cancel').disabled = true;
    if (job.status === 'completed') {
      adopt({ ...job, input: job.snapshot?.demandInput, label: 'PRIVATE ORGANIZER SCENARIO',
        provenance: { ...job.provenance, historicalFinancialValidation: 'See validation panel' } });
      $('replay').disabled = false; $('source-ribbon').textContent = `PRIVATE SCENARIO · ${job.modelVersion} · seed ${job.config.simulation.seed} · ${job.config.simulation.draws} common draws`;
    }
  }
  function showError(error) { $('job-status').textContent = error.message; $('cancel').disabled = true; }
  $('assumption-select').addEventListener('change', render);
  $('distribution').addEventListener('change', () => state.active && chart(state.active));
  $('download').addEventListener('click', () => {
    if (!state.payload) return;
    const blob = new Blob([JSON.stringify(state.payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `houselights-financial-${state.payload.id ?? 'synthetic-illustration'}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('unlock').addEventListener('click', async () => {
    window.organizerAccess.setToken($('token').value.trim()); $('token').value = '';
    try { const response = await fetch('/api/financial/validation'); const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Access denied.');
      $('validation').textContent = `Historical validation: ${data.count} prospective settled event(s); mean absolute profit error ${money(data.meanAbsoluteProfitError)}. ${data.caveat}`;
      $('job-status').textContent = 'Organizer session unlocked in this tab.';
    } catch (error) { showError(error); window.organizerAccess.clear(); }
  });
  $('run').addEventListener('click', async () => {
    try {
      const input = JSON.parse($('scenario-json').value); input.financial.policy.objective = $('policy').value;
      input.financial.simulation.draws = Number($('draws').value);
      $('run').disabled = true; $('job-status').textContent = 'Validating the event and exact booking constraints…';
      const response = await fetch('/api/financial/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Financial request failed.');
      state.jobId = data.id; state.input = input; $('cancel').disabled = false;
      $('job-status').textContent = `${number(data.feasibleCount)} feasible slates; simulating ${number(data.shortlistedCount)} finalists…`;
      await poll(data.id);
    } catch (error) { showError(error); } finally { $('run').disabled = false; }
  });
  $('cancel').addEventListener('click', async () => {
    if (!state.jobId) return;
    const response = await fetch(`/api/financial/jobs/${state.jobId}/cancel`, { method: 'POST' });
    const data = await response.json(); $('job-status').textContent = data.error ?? 'Financial job canceled.';
    clearTimeout(state.polling); $('cancel').disabled = true;
  });
  $('replay').addEventListener('click', async () => {
    if (!state.jobId) return;
    try { const response = await fetch(`/api/financial/jobs/${state.jobId}/replay`, { method: 'POST' });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Replay failed.');
      state.jobId = data.id; $('cancel').disabled = false; await poll(data.id);
      if (state.payload?.resultDigest && data.expectedResultDigest && state.payload.resultDigest !== data.expectedResultDigest)
        $('job-status').textContent += ' · WARNING: replay digest differs from original.';
    } catch (error) { showError(error); }
  });
  $('settlement-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!state.jobId || !state.active || state.payload?.id !== state.jobId) {
      $('settlement-status').textContent = 'Run or load a private completed financial job first.'; return;
    }
    const data = new FormData(event.currentTarget);
    const body = { jobId: state.jobId, assumptionSetId: $('assumption-select').value,
      selectedIds: state.active.selectedIds, actualPaidTickets: Number(data.get('actualPaidTickets')),
      actualProfit: Number(data.get('actualProfit')), sourceKind: String(data.get('sourceKind')),
      sourceReference: String(data.get('sourceReference')).trim() };
    try {
      const response = await fetch('/api/financial/outcomes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'Settlement rejected.');
      $('settlement-status').textContent = `Observed result ${result.id} recorded; error and validation counts are now available.`;
      const validation = await fetch('/api/financial/validation').then(row => row.json());
      $('validation').textContent = `Historical validation: ${validation.count} prospective settled event(s); mean absolute profit error ${money(validation.meanAbsoluteProfitError)}. ${validation.caveat}`;
    } catch (error) { $('settlement-status').textContent = error.message; }
  });
  loadDemo().catch(error => { $('source-ribbon').textContent = error.message; });
})();
