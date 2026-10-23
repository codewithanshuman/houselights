'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const read = async path => { const response = await fetch(path, {cache:'no-store'}); if (!response.ok) throw new Error('Evidence is temporarily unavailable.'); return response.json(); };
  read('/shocks-summary.json').then(data => {
    $('shock-headline').textContent = data.headline;
    $('shock-method').textContent = data.methodology;
    $('shock-limits').textContent = data.note;
    $('shock-stats').innerHTML = `<span><strong>${e(data.summary.houselights.shocks)}</strong> deterministic shocks</span><span><strong>${e(data.summary.houselights.abstained)}</strong> explicit infeasibilities</span><span><strong>${e(data.summary.repromptedLlm.respondedTrials)}</strong> returned LLM responses</span>`;
    $('shock-rows').innerHTML = data.rows.map(row => `<tr><td>${e(row.caseTitle)}${row.caseTitle.startsWith('SYNTHETIC')?' · synthetic':' · saved Qloo case'}</td><td>${e(row.shock)}</td><td>${e(row.houselights.status)} · ${e(row.houselights.violations)} violations</td><td>${e(row.reprompted.failures)}/${e(row.reprompted.returned)} violating responses</td></tr>`).join('');
  }).catch(error => $('shock-headline').textContent = error.message);
  read('/api/judge/cases').then(data => {
    const cases=data.cases??[],complete=cases.filter(row=>row.recordedTrace===true);
    $('agent-trace-status').textContent=`${complete.length} of ${cases.length} public cases have a complete saved application-event sequence; the others expose receipts without a model-step timeline.`;
    $('agent-trace-link').hidden=!complete.some(row=>row.id==='8be4d03ef4792ca9f1466983');
  }).catch(error => $('agent-trace-status').textContent=error.message);
  read('/api/evidence/reviews').then(data => {
    $('review-status').textContent = `${data.completedReviewers} completed reviewers across ${data.distinctBriefs} published briefs. ${data.conclusion}`;
    $('review-missing').textContent = data.missing || '';
    $('review-cases').innerHTML = data.cases.map(row => `<article><h3>${e(row.city)}${row.synthetic?' · synthetic':''}</h3><p>Qloo ${e(row.qloo)} · control ${e(row.control)} · tie ${e(row.tie)} · abstain ${e(row.abstain)}</p>${row.reasons.map(reason => `<blockquote><strong>${e(reason.role)} · ${e(reason.preference)}</strong><p>${e(reason.reason)}</p></blockquote>`).join('')}</article>`).join('') || '<p>No review rows or reasons exist yet. They will appear here only after genuine ballots are submitted.</p>';
  }).catch(error => $('review-status').textContent = error.message);
})();
