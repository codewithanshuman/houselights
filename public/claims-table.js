/* The evidence page's claim table: each claim, its status, its limit, a source link and
   the command that reproduces it (with a copy button). The table is generated into the
   page by scripts/claims.mjs (data: /claims.json). This fills in the live count of human
   reviews, which is honestly 0 until real ballots arrive, and wires the copy buttons. */
'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const box=document.getElementById('claim-table-body');if(!box||!window.HL)return;
  const {fetchJSON}=window.HL,status=document.getElementById('copy-status');
  async function copy(text,button){
    try{await navigator.clipboard.writeText(text);}
    catch{const range=document.createRange();range.selectNodeContents(button.previousElementSibling);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);status.textContent='Clipboard unavailable: the command is selected, press Ctrl+C to copy.';return;}
    status.textContent=`Copied: ${text}`;const label=button.textContent;button.textContent='Copied';setTimeout(()=>{button.textContent=label;},1500);
  }
  box.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',()=>void copy(button.dataset.copy,button)));
  const live=box.querySelectorAll('[data-live="reviews"]');
  if(live.length)fetchJSON('/api/evidence/reviews',{timeout:12000})
    .then(reviews=>live.forEach(node=>{node.textContent=String(reviews.completedReviewers);}))
    .catch(()=>live.forEach(node=>{node.textContent='unavailable';}));
});
