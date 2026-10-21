'use strict';
(() => {
  const [studyId, token] = location.hash.slice(1).split(':');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const status = document.getElementById('review-status'), form = document.getElementById('review-form');
  let cases = [];
  const headers = { 'x-review-token': token ?? '', 'content-type': 'application/json' };
  async function load() {
    if (!studyId || !token) { document.getElementById('review-protocol').textContent = ''; status.textContent = 'Open the complete review invitation supplied by the organizer.'; return; }
    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(studyId)}`, { headers });
      const review = await response.json(); if (!response.ok) throw new Error(review.error);
      document.getElementById('review-protocol').textContent = review.protocol;
      if (review.submitted) { status.textContent = 'Your review has already been recorded. Thank you.'; return; }
      cases = review.cases;
      document.getElementById('review-cases').innerHTML = cases.map((item, index) => `<section class="panel"><h2>Brief ${index + 1} · ${esc(item.brief.city)}</h2><p>Audience anchors: ${esc(item.brief.audiencePreferences.join(', '))}. Budget: ${esc(item.brief.budget)} ${esc(item.brief.currency)}. Slots: ${esc(item.brief.slots)}.</p>${item.synthetic ? '<p class="gm-status">Synthetic research example. Judge the booking brief; this does not validate live market relevance.</p>' : ''}<div class="gm-pairs">${['a', 'b'].map(side => `<article><h3>Lineup ${side.toUpperCase()}</h3><ul>${item[side].map(artist => `<li>${esc(artist.name)} · ${esc(artist.genre)} · ${esc(artist.fee)}</li>`).join('')}</ul></article>`).join('')}</div><fieldset><legend>Optional rubric: 1 = weak, 5 = strong; leave unknown when evidence is insufficient</legend>${['a','b'].map(side=>`<h4>Lineup ${side.toUpperCase()}</h4>${[['culturalFit','Cultural fit'],['programBreadth','Program breadth'],['bookingPracticality','Booking practicality']].map(([key,label])=>`<label>${label}<select data-rating="${index}-${side}-${key}"><option value="">Insufficient evidence</option>${[1,2,3,4,5].map(n=>`<option value="${n}">${n}</option>`).join('')}</select></label>`).join('')}`).join('')}</fieldset><fieldset><legend>Your preference for brief ${index + 1}</legend>${['a', 'b', 'tie', 'abstain'].map(choice => `<label><input type="radio" name="choice-${index}" value="${choice}" required> ${choice === 'a' || choice === 'b' ? 'Lineup ' + choice.toUpperCase() : choice === 'tie' ? 'Equally suitable' : 'Insufficient basis to judge'}</label>`).join('')}</fieldset><label for="reason-${index}">Why?</label><textarea id="reason-${index}" minlength="12" maxlength="2000" required style="width:100%;min-height:90px"></textarea></section>`).join('');
      form.hidden = false;
    } catch (error) { document.getElementById('review-protocol').textContent = ''; status.textContent = error.message; }
  }
  form.onsubmit = async event => {
    event.preventDefault(); if (!form.reportValidity()) return;
    form.querySelector('button').disabled = true;
    try {
      const judgments = cases.map((item, index) => ({ caseId: item.caseId, preference: new FormData(form).get(`choice-${index}`), reason: document.getElementById(`reason-${index}`).value, ratings:Object.fromEntries(['a','b'].map(side=>[side,Object.fromEntries(['culturalFit','programBreadth','bookingPracticality'].map(key=>{const value=document.querySelector(`[data-rating="${index}-${side}-${key}"]`).value;return [key,value?Number(value):null];}))])) }));
      const response = await fetch(`/api/reviews/${encodeURIComponent(studyId)}/ballot`, { method: 'POST', headers, body: JSON.stringify({ judgments }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      form.hidden = true; status.textContent = result.message;
    } catch (error) { status.textContent = error.message; form.querySelector('button').disabled = false; }
  };
  load();
})();
