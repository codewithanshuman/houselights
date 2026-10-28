/* The agent card: one component for both the replay of a saved Qloo run and a live run.
   A pixel-grid loader, a shimmering status line and an elapsed timer head a trace of
   stages, each listing the Qloo calls made under it. When the run ends the trace settles
   into a summary and stays expandable. Reduced motion freezes the loader and the shimmer;
   the timer still ticks. */
'use strict';
(()=>{
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STAGES=[['Resolve','Confirm the artists with Qloo'],['Discover','Find artists these fans love in {city}'],['Rank','Rank every candidate for this audience'],
    ['Plan','Choose which acts to check in depth'],['Verify','Check where fans are and how audiences overlap'],['Optimize','Check every possible bill against the budget'],['Write','Write up the decision']];
  const TOOLS={describe:'Confirm artist',entity_tags:'Read taste tags',recommend:'Find similar artists',rank:'Rank for this audience',
    trends:'Check six month trends',where_popular:'Find where fans are',compare_audiences:'Compare audiences'};
  const GLYPHS={describe:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    entity_tags:'<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    recommend:'<path d="M12 3l2.4 6.2L21 12l-6.6 2.8L12 21l-2.4-6.2L3 12l6.6-2.8z"/>',
    rank:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',trends:'<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    where_popular:'<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    compare_audiences:'<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>'};
  const glyph=tool=>`<svg class="agent-glyph" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[tool]??'<circle cx="12" cy="12" r="8"/>'}</svg>`;
  const between=(text,start,end)=>{const a=text.indexOf(start);if(a<0)return null;const b=end?text.indexOf(end,a+start.length):-1;return text.slice(a+start.length,b<0?undefined:b).trim()||null;};
  // A short, plain chip for each call: who or what it was about, and how much came back.
  function chipFor({tool,why='',count,status,city,anchor,first}){
    const n=Number.isFinite(count)?count:null;let text;
    if(tool==='describe')text=between(why,'Confirm “','”')??(first?anchor:null)??'artist identity';
    else if(tool==='entity_tags')text=n!=null?`${n} taste tags`:'taste tags';
    else if(tool==='recommend')text=n!=null?`${n} artists in ${city}`:`artists in ${city}`;
    else if(tool==='rank')text=n!=null?`${n} candidates ranked`:'candidates ranked';
    else if(tool==='trends')text=n!=null?`${n} acts checked`:'trend data';
    else if(tool==='where_popular')text=between(why,'evidence for ',' within')??(n!=null?`${n} areas`:'fan locations');
    else if(tool==='compare_audiences')text=between(why,'Compare ',' and the anchor')??'audience overlap';
    else text=n!=null?`${n} results`:tool;
    return status&&status!=='ok'?`${text} · ${status}`:text;
  }
  const LOADER=Array.from({length:9},(_,i)=>{const r=Math.floor(i/3),c=i%3;return `<span style="--d:${(c+Math.abs(r-1))*90}ms"></span>`;}).join('');

  function create(root,{city='',anchor='',label='Researching with Qloo',clock}={}){
    root.classList.remove('is-done','is-failed','is-static');root.classList.add('agent-card-on');
    root.innerHTML=`<div class="agent-head">
        <span class="agent-loader" aria-hidden="true">${LOADER}</span>
        <span class="agent-label"><span class="agent-label-text">${e(label)}</span></span>
        <span class="agent-time" aria-hidden="true">0.0s</span>
        <span class="agent-count" aria-hidden="true"></span>
        <button type="button" class="agent-toggle" aria-expanded="true" aria-label="Hide the research trace"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
      </div>
      <div class="agent-body"><div class="agent-body-inner"><ol class="agent-stages"></ol></div></div>
      <div class="agent-foot" hidden></div>`;
    const $=selector=>root.querySelector(selector),stages=$('.agent-stages'),time=$('.agent-time');
    const started=performance.now(),now=clock??(()=>performance.now()-started);
    let current=null,calls=0,finished=false;
    const tick=()=>{time.textContent=`${(now()/1000).toFixed(1)}s`;};
    const timer=setInterval(tick,100);
    const toggle=$('.agent-toggle');
    toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Hide the research trace':'Show the research trace');root.classList.toggle('is-collapsed',!open);});
    // A finished stage folds to a count of its calls (click to open again), keeping the card compact.
    const settle=li=>{
      if(!li||li.classList.contains('is-done'))return;
      li.classList.remove('is-active');li.classList.add('is-done');
      const n=li.querySelectorAll('.agent-call').length;
      if(n){li.querySelector('.agent-stage-count').textContent=`${n} call${n===1?'':'s'}`;li.classList.add('is-folded');li.querySelector('.agent-stage-head').setAttribute('aria-expanded','false');}
    };
    const inner=$('.agent-body-inner');
    const follow=()=>requestAnimationFrame(()=>{
      // Research continues while a visitor edits the adjacent brief, but must
      // not drive scrolling while their focus belongs to a form control.
      if(root.classList.contains('is-static')||root.ownerDocument.activeElement?.closest('form'))return;
      inner.scrollTo({top:inner.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    });
    const api={
      stage(text){
        const index=STAGES.findIndex(([key])=>String(text).startsWith(key));if(index<0)return;
        const existing=stages.querySelector(`[data-stage="${index}"]`);
        if(existing){current=existing;return;}
        settle(current);
        const li=document.createElement('li');li.className='agent-stage is-active';li.dataset.stage=String(index);
        li.innerHTML=`<span class="agent-mark" aria-hidden="true"><span class="agent-spin"></span><svg class="agent-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span><button type="button" class="agent-stage-head" aria-expanded="true"><span class="agent-stage-text">${e(STAGES[index][1].replace('{city}',city||'the city'))}</span><span class="agent-stage-count"></span></button><div class="agent-calls-wrap"><ul class="agent-calls"></ul></div>`;
        const head=li.querySelector('.agent-stage-head');
        head.addEventListener('click',()=>{const open=head.getAttribute('aria-expanded')!=='true';head.setAttribute('aria-expanded',String(open));li.classList.toggle('is-folded',!open);});
        stages.appendChild(li);current=li;follow();
      },
      call(call){
        if(!current)api.stage('Resolve');
        calls+=1;
        const row=document.createElement('li');row.className='agent-call';
        row.innerHTML=`${glyph(call.tool)}<span class="agent-call-label">${e(TOOLS[call.tool]??call.tool)}</span><span class="agent-chip">${e(chipFor({...call,city,anchor,first:calls===1}))}</span>`;
        current.querySelector('.agent-calls').appendChild(row);follow();
        $('.agent-count').textContent=`${calls} Qloo call${calls===1?'':'s'}`;
      },
      setBudget(used,max){if(max)$('.agent-count').textContent=`${used} of ${max} Qloo calls`;},
      done(summary,footHtml=''){
        if(finished)return;finished=true;clearInterval(timer);tick();
        stages.querySelectorAll('.agent-stage').forEach(settle);
        root.classList.add('is-done');$('.agent-label-text').textContent=summary;
        if(footHtml){const foot=$('.agent-foot');foot.innerHTML=footHtml;foot.hidden=false;}
      },
      fail(text){if(finished)return;finished=true;clearInterval(timer);root.classList.add('is-failed');$('.agent-label-text').textContent=text;},
      stop(){finished=true;clearInterval(timer);},
      get calls(){return calls;},
    };
    return api;
  }

  // Replays a saved run's recorded application events with their real relative timing.
  function replay(root,snapshot,{speed=2,label,onDone,animate=true,onReplay}={}){
    const city=snapshot.memo.input.city,anchor=(snapshot.memo.input.anchors??[]).join(', ');
    const events=(snapshot.trace??[]).filter(event=>['stage','receipt','memo'].includes(event.type));
    const total=events.at(-1)?.elapsedMs??0;
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animated=animate&&!reduce;
    const started=performance.now();
    const trace=create(root,{city,anchor,label:label??`Replaying the saved ${city} run`,clock:()=>animated?Math.min(total,(performance.now()-started)*speed):total});
    if(!animated)root.classList.add('is-static');
    const timers=[];
    const apply=event=>{
      if(event.type==='stage'&&event.text)trace.stage(event.text);
      else if(event.type==='receipt'){const r=snapshot.receipts.find(x=>x.id===event.receiptId);if(r)trace.call({tool:r.tool,why:r.why,count:r.evidence?.rows?.length,status:r.status});}
      else if(event.type==='memo'){trace.done(`Researched in ${(total/1000).toFixed(1)}s · ${trace.calls} Qloo calls`,`Recorded live run, ${animated?`replayed at ${speed}× speed`:'shown without animation'}. Every call is saved as a receipt. <button type="button" class="link-button agent-replay">Replay</button>`);
        root.querySelector('.agent-replay')?.addEventListener('click',()=>onReplay?onReplay():replay(root,snapshot,{speed,label,onDone}));onDone?.();}
    };
    if(!animated){events.forEach(apply);return{cancel(){trace.stop();}};}
    for(const event of events)timers.push(setTimeout(()=>apply(event),event.elapsedMs/speed));
    return{cancel(){timers.forEach(clearTimeout);trace.stop();}};
  }

  window.HLTrace={create,replay,chipFor};
})();
