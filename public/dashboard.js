/* The recorded organizer session as a dashboard: a header with a breadcrumb, the six steps
   as folder cards (one open at a time, like tabs) and an Info panel on the right with the
   budget bars, the event's properties, its tags and the session activity. */
'use strict';
(()=>{
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ICON={back:'<path d="M19 12H5M11 18l-6-6 6-6"/>',folder:'<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
    chevron:'<path d="M9 6l6 6-6 6"/>',close:'<path d="M13 6l6 6-6 6M5 6l6 6-6 6"/>',pin:'<path d="M15 4l5 5-3 1-4 4 1 4-2 2-4-4-4 4M9 11l4-4 1-3"/>',activity:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',share:'<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',search:'<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',filter:'<path d="M4 7h16M7 12h10M10 17h4"/>'};
  const svg=(name,size=18)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

  // Header: breadcrumb with a share action, the title with the main action, then search
  // and a filter for the folder cards below.
  function head({title,where,action}){
    return `<div class="dx-top"><nav class="dx-crumbs" aria-label="Breadcrumb"><a class="dx-back" href="/workspace.html" aria-label="Back to the workspace">${svg('back')}</a><span class="dx-sep" aria-hidden="true"></span>
        <a href="/workspace.html">${svg('folder',16)}<span>Workspace</span></a>${svg('chevron',14)}<span aria-current="page">${svg('folder',16)}<span>Recorded session</span></span></nav>
        <button class="dx-ghost" type="button" data-dx-share>${svg('share',16)}<span>Share</span></button></div>
      <div class="dx-title"><div><h1>${e(title)}</h1><p>${e(where)}</p></div>${action?`<a class="dx-action" href="${e(action.href)}">${e(action.label)}</a>`:''}</div>
      <div class="dx-tools"><label class="dx-search">${svg('search',16)}<span class="sr-only">Search steps</span><input type="search" placeholder="Search" data-dx-search autocomplete="off"></label>
        <button class="dx-filter" type="button" aria-pressed="false" data-dx-filter>${svg('filter',16)}<span>Decisions only</span></button></div>`;
  }

  // Folder cards. Each is a tab; its paper shows a pencil note from that step.
  function folders(steps){
    return `<div class="dx-folders" role="tablist" aria-label="Session steps">${steps.map((step,index)=>`<button class="dx-folder" type="button" role="tab" id="tab-${e(step.id)}" data-kind="${e(step.kind??'')}" aria-controls="${e(step.id)}" aria-selected="${index===0}" tabindex="${index===0?0:-1}" style="--i:${index}">
        <span class="dx-papers" aria-hidden="true"><span class="dx-paper dx-paper-back"></span><span class="dx-paper">${e(step.note)}</span></span>
        <span class="dx-front"><strong>${e(step.title)}</strong><span class="dx-sub">${e(step.sub)}</span><span class="dx-meta">${e(step.meta)}</span></span>
      </button>`).join('')}</div><p class="dx-empty" hidden>No steps match your search.</p>`;
  }
  function bindFolders(root){
    const tabs=[...root.querySelectorAll('.dx-folder')];
    const select=(tab,focus)=>{
      tabs.forEach(other=>{const on=other===tab;other.setAttribute('aria-selected',String(on));other.tabIndex=on?0:-1;const panel=document.getElementById(other.getAttribute('aria-controls'));if(panel)panel.hidden=!on;});
      if(focus)tab.focus();
      const panel=document.getElementById(tab.getAttribute('aria-controls'));
      if(panel&&!reduced()){panel.classList.remove('dx-open');void panel.offsetWidth;panel.classList.add('dx-open');}
    };
    tabs.forEach((tab,index)=>{
      tab.addEventListener('click',()=>select(tab,false));
      tab.addEventListener('keydown',event=>{
        const step={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[event.key];
        if(step){event.preventDefault();select(tabs[(index+step+tabs.length)%tabs.length],true);}
        else if(event.key==='Home'){event.preventDefault();select(tabs[0],true);}
        else if(event.key==='End'){event.preventDefault();select(tabs.at(-1),true);}
      });
    });
    const search=root.querySelector('[data-dx-search]'),filter=root.querySelector('[data-dx-filter]'),empty=root.querySelector('.dx-empty');
    const apply=()=>{
      const query=(search?.value??'').trim().toLowerCase(),decisions=filter?.getAttribute('aria-pressed')==='true';
      let shown=0;tabs.forEach(tab=>{const hit=(!query||tab.textContent.toLowerCase().includes(query))&&(!decisions||tab.dataset.kind==='decision');tab.hidden=!hit;if(hit)shown++;});
      if(empty)empty.hidden=shown>0;
    };
    search?.addEventListener('input',apply);
    filter?.addEventListener('click',()=>{filter.setAttribute('aria-pressed',String(filter.getAttribute('aria-pressed')!=='true'));apply();});
    root.querySelector('[data-dx-share]')?.addEventListener('click',async event=>{
      const button=event.currentTarget,label=button.querySelector('span');
      try{await navigator.clipboard.writeText(location.href);label.textContent='Link copied';}catch{label.textContent='Copy the address bar';}
      setTimeout(()=>{label.textContent='Share';},2200);
    });
    root.querySelector('.workspace-story')?.setAttribute('role','none');
    tabs.forEach((tab,index)=>{const panel=document.getElementById(tab.getAttribute('aria-controls'));if(panel){panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);panel.tabIndex=0;panel.hidden=index!==0;}});
  }

  // The Info panel.
  function rail(file){
    const node=document.getElementById('dash-rail');if(!node)return;
    const event=file.event,first=event.revisions[0],last=event.revisions.at(-1),brief=first.brief,lastBrief=last.brief;
    const latest=file.runs.at(-1)?.run?.packet?.recommendation,money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:brief.currency||'USD',maximumFractionDigits:0}).format(value);
    const was=brief.constraints.budget,now=lastBrief.constraints.budget,date=iso=>new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
    const bar=(label,value,share,note,tone)=>`<div class="dx-stat"><p><span>${e(label)}</span><small>${e(note)}</small></p><strong>${e(value)}</strong><span class="dx-bar ${tone}" role="img" aria-label="${e(Math.round(share*100))}%"><span style="--w:${(share*100).toFixed(1)}%"></span></span></div>`;
    const activity=[
      {at:first.createdAt,title:'Brief created',text:`${brief.candidates.length} candidates, ${money(was)}`},
      {at:file.research.receipts[0]?.fetchedAt??first.createdAt,title:'Qloo research',text:`${file.research.receipts.length} receipts saved`},
      ...file.runs.map((run,index)=>({at:run.createdAt,title:`Decision ${index+1}`,text:`${run.run.packet.recommendation.names.join(' + ')} · ${money(run.run.packet.recommendation.totalFee)}`,latest:index===file.runs.length-1})),
      ...event.revisions.slice(1).map(revision=>({at:revision.createdAt,title:`Revision ${revision.revision}`,text:revision.note})),
    ].sort((a,b)=>a.at.localeCompare(b.at));
    node.hidden=false;
    node.innerHTML=`<div class="dx-info-head"><h2>Info</h2><button class="dx-collapse" type="button" aria-expanded="true" aria-label="Collapse the info panel" data-dx-collapse>${svg('close',18)}</button></div>
      <div class="dx-info-body">
        ${bar('Artist budget',money(now),now/was,was===now?'unchanged':`cut from ${money(was)}`,'is-violet')}
        ${latest?bar('Booked bill',money(latest.totalFee),latest.totalFee/now,`${Math.round(latest.totalFee/now*100)}% of the budget`,'is-rose'):''}
        <h3>Properties</h3>
        <dl class="dx-props">
          <div><dt>City</dt><dd>${e(brief.city)}</dd></div>
          <div><dt>Venue</dt><dd>${e(brief.venue)}</dd></div>
          <div><dt>Show date</dt><dd>${e(date(brief.date+'T00:00:00Z'))}</dd></div>
          <div><dt>Qloo calls</dt><dd>${e(file.providerCalls)}</dd></div>
          <div><dt>Candidates</dt><dd>${e(lastBrief.candidates.length)} for ${e(lastBrief.constraints.slots)} slots</dd></div>
          <div><dt>Recorded</dt><dd>${e(date(file.capturedAt))}</dd></div>
        </dl>
        <h3>Tags</h3>
        <p class="dx-tags">${brief.anchors.map(name=>`<span class="dx-tag is-violet">${e(name)}</span>`).join('')}<span class="dx-tag">Live Qloo</span><span class="dx-tag is-rose">Illustrative fees</span></p>
      </div>
      <details class="dx-more" open><summary>${svg('activity',18)}<span>Activity</span><small>UTC</small></summary>
        <ol class="dx-activity">${activity.map(row=>`<li class="${row.latest?'is-latest':''}"><time>${e(row.at.slice(11,16))}</time><div><strong>${e(row.title)}</strong><span>${e(row.text)}</span></div></li>`).join('')}</ol>
      </details>`;
    node.querySelector('[data-dx-collapse]').addEventListener('click',event=>{
      const button=event.currentTarget,collapsed=node.classList.toggle('is-collapsed');
      button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',collapsed?'Expand the info panel':'Collapse the info panel');
      document.querySelector('.dash')?.classList.toggle('rail-collapsed',collapsed);
    });
  }
  function hideRail(){const node=document.getElementById('dash-rail');if(node){node.hidden=true;node.innerHTML='';}}

  window.HLDash={head,folders,bindFolders,rail,hideRail};
})();
