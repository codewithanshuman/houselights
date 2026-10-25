/* The evidence page's claim table: each claim, its status, its limit, a source link and
   the command that reproduces it (with a copy button). Generated data: /claims.json.
   Pending human reviews show the live count from the server, which is honestly 0 until
   real ballots arrive. */
'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const box=document.getElementById('claim-table-body');if(!box||!window.HL)return;
  const {e,fetchJSON,state}=window.HL,status=document.getElementById('copy-status');
  const badge=value=>`<span class="badge ${/^verified/.test(value)?'badge-good':/pending/.test(value)?'badge-warn':'badge-muted'}">${e(value)}</span>`;
  async function copy(text,button){
    try{await navigator.clipboard.writeText(text);}
    catch{const range=document.createRange();range.selectNodeContents(button.previousElementSibling);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);status.textContent='Clipboard unavailable: the command is selected, press Ctrl+C to copy.';return;}
    status.textContent=`Copied: ${text}`;const label=button.textContent;button.textContent='Copied';setTimeout(()=>{button.textContent=label;},1500);
  }
  async function load(){
    state(box,{kind:'loading'});
    try{
      const [table,reviews]=await Promise.all([fetchJSON('/claims.json',{timeout:12000}),fetchJSON('/api/evidence/reviews',{timeout:12000}).catch(()=>null)]);
      box.setAttribute('aria-busy','false');
      box.innerHTML=`<div class="table-scroll"><table class="data-table"><caption>Claims and their evidence</caption><thead><tr><th scope="col">Claim</th><th scope="col">Status</th><th scope="col">Limit</th><th scope="col">Reproduce</th></tr></thead><tbody>${table.rows.map(row=>{
        const live=row.live==='reviews'?` <strong>${e(reviews?String(reviews.completedReviewers):'unavailable')}</strong> completed so far.`:'';
        return `<tr><th scope="row">${e(row.claim)} <a href="${e(row.source)}">source</a></th><td>${badge(row.status)}</td><td>${e(row.limit)}${live}</td><td>${row.reproduce?`<code>${e(row.reproduce)}</code> <button type="button" class="button subtle small" data-copy="${e(row.reproduce)}" aria-label="Copy command: ${e(row.reproduce)}">Copy</button>`:'—'}</td></tr>`;}).join('')}</tbody></table></div>
        <p class="path-note">Reproduce everything at once with <code>npm run verify:all</code> <button type="button" class="button subtle small" data-copy="npm run verify:all" aria-label="Copy command: npm run verify:all">Copy</button></p>`;
      box.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',()=>void copy(button.dataset.copy,button)));
    }catch(problem){state(box,{kind:problem.kind??'server',text:problem.message,retry:load});}
  }
  void load();
});
