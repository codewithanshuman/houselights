/* The landing page. Its figures come from the published featured plan, so they always match
   the Booking Desk; the values in the HTML are the same plan's and stand in if a request fails.
   The product itself lives on the Booking Desk (judge.html). */
'use strict';
(()=>{
  const {e,money,fetchJSON}=window.HL,$=id=>document.getElementById(id);
  const FEATURED='8be4d03ef4792ca9f1466983';
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  let currency='USD';
  const usd=value=>money(value,currency);
  const itemsOf=snapshot=>snapshot.memo.items;
  const billNames=snapshot=>snapshot.memo.slate.selectedIds.map(id=>itemsOf(snapshot).find(item=>item.id===id)?.name??id);
  const rankReceipt=snapshot=>{
    const bound=new Set(itemsOf(snapshot).flatMap(item=>item.evidenceReceipts?.rank??[]));
    return snapshot.receipts.find(receipt=>receipt.tool==='rank'&&receipt.evidence?.rows?.length&&(!bound.size||bound.has(receipt.id)));
  };
  const affinityOf=(snapshot,item)=>{const rows=rankReceipt(snapshot)?.evidence.rows??[];const row=rows.find(r=>r.id===item.id)||rows.find(r=>r.name&&r.name.toLowerCase()===item.name.toLowerCase());return typeof row?.affinity==='number'?row.affinity:null;};

  // The hero cards show the featured plan; they are filled from the published record so
  // they always match the decision below.
  function fillFan(snapshot,off){
    const set=(key,text)=>document.querySelectorAll(`[data-fan="${key}"]`).forEach(node=>{node.textContent=text;});
    const top=[...itemsOf(snapshot)].filter(item=>item.rank).sort((a,b)=>a.rank-b.rank)[0],score=top?affinityOf(snapshot,top):null;
    if(top){set('top-act',top.name);if(score!=null)set('top-score',`Affinity ${score.toFixed(3)} · rank ${top.rank} of ${top.of}`);}
    set('bill',billNames(snapshot).join(' + '));set('fee',usd(snapshot.memo.slate.totalFee));
    if(off){set('off-bill',billNames(off).join(' + '));set('off-fee',`${usd(off.memo.slate.totalFee)} · a different bill`);}
  }
  // The timeline's line is drawn through the centres of its circles: it enters from the top,
  // passes behind each circle and swings across between rows, so it never crosses the text.
  function drawTimeline(){
    const list=document.querySelector('.pipeline-track.tl'),svg=list?.querySelector('.tl-path'),path=svg?.querySelector('path');if(!path)return;
    const box=list.getBoundingClientRect(),pts=[...list.querySelectorAll('.tl-node')].map(node=>{const r=node.getBoundingClientRect();return [r.left-box.left+r.width/2,r.top-box.top+r.height/2];});
    if(!pts.length)return;
    svg.setAttribute('viewBox',`0 0 ${box.width.toFixed(0)} ${box.height.toFixed(0)}`);
    const [x0,y0]=pts[0],mid=box.width/2;let d=`M${mid.toFixed(1)} 0C${mid.toFixed(1)} ${(y0*.6).toFixed(1)} ${x0.toFixed(1)} ${(y0*.4).toFixed(1)} ${x0.toFixed(1)} ${y0.toFixed(1)}`;
    for(let k=1;k<pts.length;k++){const [xa,ya]=pts[k-1],[xb,yb]=pts[k],dy=(yb-ya)*.62;d+=`C${xa.toFixed(1)} ${(ya+dy).toFixed(1)} ${xb.toFixed(1)} ${(yb-dy).toFixed(1)} ${xb.toFixed(1)} ${yb.toFixed(1)}`;}
    const [xl,yl]=pts.at(-1);d+=`C${xl.toFixed(1)} ${(yl+(box.height-yl)*.6).toFixed(1)} ${mid.toFixed(1)} ${(box.height-(box.height-yl)*.4).toFixed(1)} ${mid.toFixed(1)} ${box.height.toFixed(1)}`;
    path.setAttribute('d',d);
  }
  drawTimeline();
  if(document.querySelector('.pipeline-track.tl')){let tlTimer;new ResizeObserver(()=>{clearTimeout(tlTimer);tlTimer=setTimeout(drawTimeline,120);}).observe(document.querySelector('.pipeline-track.tl'));}
  // The pipeline shows the featured run's real numbers and counts up when it scrolls in.
  function fillPipeline(snapshot){
    const values={calls:snapshot.receipts.length,candidates:itemsOf(snapshot).length,checked:snapshot.memo.slate.checkedCount,bookable:snapshot.memo.slate.feasibleCount,booked:snapshot.memo.slate.feasible?1:0};
    for(const [key,value] of Object.entries(values))document.querySelectorAll(`[data-pipe="${key}"]`).forEach(node=>{node.dataset.value=String(value);node.textContent=String(value);});
    document.querySelectorAll('[data-pipe="bill"]').forEach(node=>{node.textContent=billNames(snapshot).join(' + ');});
  }
  const pipeline=$('pipeline');
  function countUp(){
    pipeline.classList.add('is-in');
    if(reduced())return;
    pipeline.querySelectorAll('.pipe-num').forEach((node,index)=>{
      const target=Number(node.dataset.value??node.textContent),start=performance.now()+index*420+500,duration=900;
      const step=time=>{const t=Math.min(1,Math.max(0,(time-start)/duration)),eased=1-Math.pow(1-t,3);node.textContent=String(Math.round(target*eased));if(t<1)requestAnimationFrame(step);};
      node.textContent='0';requestAnimationFrame(step);
    });
  }
  if(pipeline&&'IntersectionObserver' in window){
    const pipeWatch=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){pipeWatch.disconnect();countUp();}},{rootMargin:'0px 0px -25% 0px'});
    pipeWatch.observe(pipeline);
  }else pipeline?.classList.add('is-in');
  // The pixel field behind the facts: a purple glow made of a few drifting soft blobs is
  // sampled once per square cell. A blurred copy is drawn first for the glow, then each
  // cell as a frosted tile with a soft top highlight. Cells too faint to colour stay page
  // colour, which gives the stepped edge. Redrawn about 12 times a second while visible.
  (()=>{
    const canvas=document.querySelector('.tiles-canvas');if(!canvas)return;
    const ctx=canvas.getContext('2d'),small=document.createElement('canvas'),sctx=small.getContext('2d');
    const stops=[[0,[246,244,251]],[.25,[238,230,253]],[.5,[226,208,252]],[.75,[212,186,250]],[1,[198,164,248]]];
    const ramp=v=>{for(let k=1;k<stops.length;k++)if(v<=stops[k][0]){const [a,ca]=stops[k-1],[b,cb]=stops[k],t=(v-a)/(b-a);return ca.map((c,n)=>Math.round(c+(cb[n]-c)*t));}return stops.at(-1)[1];};
    const blobs=[{x:.24,y:1.02,r:.42,a:1.05,sx:.07,sy:.05,p:0},{x:.72,y:1.08,r:.38,a:.8,sx:.08,sy:.04,p:2.1},{x:.5,y:.92,r:.26,a:.55,sx:.1,sy:.06,p:4.2}];
    let cols=0,rows=0,cell=64,w=0,h=0,raf=0,last=0,visible=true;
    const size=()=>{
      const box=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);
      w=box.width;h=box.height;cell=w<640?46:62;cols=Math.ceil(w/cell);rows=Math.ceil(h/cell);
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
      small.width=cols;small.height=rows;
    };
    const field=(x,y,t)=>{
      let v=0;
      for(const b of blobs){const bx=b.x+Math.sin(t*b.sx+b.p)*.16,by=b.y+Math.cos(t*b.sy+b.p)*.08,dx=(x-bx)*Math.max(w/h,1.6)*.55,dy=y-by;v+=b.a*Math.exp(-(dx*dx+dy*dy)/(b.r*b.r));}
      return Math.min(1,v*Math.min(1,Math.max(0,(y-.22)/.45))*(w<640?.7:1));
    };
    // A fixed, per-cell jitter (plus a slow shimmer) gives every pixel its own brightness
    // and makes the stepped edge uneven, as in a pixelated blur.
    const jitter=(c,r,t)=>{const n=Math.sin(c*12.9898+r*78.233)*43758.5453;return (n-Math.floor(n)-.5)*.16+Math.sin(t*.9+c*1.7+r*2.3)*.035;};
    const draw=t=>{
      ctx.clearRect(0,0,w,h);
      // faint column lines through the light part
      ctx.fillStyle='rgba(22,19,31,.035)';for(let c=1;c<cols;c++)ctx.fillRect(Math.round(c*cell),0,1,h);
      const img=sctx.createImageData(cols,rows),values=[];
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        const v=Math.max(0,Math.min(1,field((c+.5)/cols,(r+.5)/rows,t)+jitter(c,r,t)*Math.min(1,field((c+.5)/cols,(r+.5)/rows,t)*3)));values.push(v);
        const [R,G,B]=ramp(v),o=(r*cols+c)*4;img.data[o]=R;img.data[o+1]=G;img.data[o+2]=B;img.data[o+3]=v<.16?0:Math.round(Math.min(1,(v-.16)/.2)*255);
      }
      sctx.putImageData(img,0,0);
      ctx.save();ctx.filter=`blur(${cell*.45}px)`;ctx.imageSmoothingEnabled=true;ctx.drawImage(small,0,0,cols*cell,rows*cell);ctx.restore();
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        const v=values[r*cols+c];if(v<.16)continue;
        const x=c*cell+1.5,y=r*cell+1.5+Math.sin(t*1.1+c*.9+r*1.3)*2.2,s=cell-3,[R,G,B]=ramp(Math.min(1,v+.04)),strength=Math.min(1,(v-.16)/.25);
        ctx.beginPath();ctx.roundRect(x,y,s,s,cell*.13);
        ctx.fillStyle=`rgba(${R},${G},${B},${(.5*strength).toFixed(3)})`;ctx.fill();
        const gloss=ctx.createLinearGradient(0,y,0,y+s);gloss.addColorStop(0,`rgba(255,255,255,${(.32*strength).toFixed(3)})`);gloss.addColorStop(.55,'rgba(255,255,255,0)');
        ctx.fillStyle=gloss;ctx.fill();
        ctx.strokeStyle=`rgba(255,255,255,${(.22*strength).toFixed(3)})`;ctx.lineWidth=1;ctx.stroke();
      }
    };
    const loop=now=>{raf=requestAnimationFrame(loop);if(now-last<80)return;last=now;draw(now/1000);};
    const start=()=>{if(!raf&&visible&&!reduced()&&!document.hidden)raf=requestAnimationFrame(loop);};
    const stop=()=>{cancelAnimationFrame(raf);raf=0;};
    size();draw(0);
    let timer;new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{size();draw(performance.now()/1000);},150);}).observe(canvas);
    if('IntersectionObserver' in window)new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;visible?start():stop();}).observe(canvas);else start();
    document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
  })();
  // The selection frame over the three facts follows the pointer; left alone it steps
  // through the columns every few seconds (not with reduced motion, not off screen).
  (()=>{
    const stage=document.querySelector('.facts-stage'),sel=stage?.querySelector('.sel');if(!sel)return;
    const facts=[...stage.querySelectorAll('.fact')],tag=sel.querySelector('.sel-tag'),names=['Qloo pick','Selected','Without Qloo'];
    let current=1,hovering=false,timer=null;
    const place=index=>{
      const fact=facts[index],box=fact.getBoundingClientRect(),base=stage.getBoundingClientRect(),pad=6;
      sel.style.transform=`translate(${box.left-base.left-pad}px,${box.top-base.top-pad}px)`;
      sel.style.width=`${box.width+pad*2}px`;sel.style.height=`${box.height+pad*2}px`;
      tag.textContent=`${names[index]} · ${Math.round(box.width)} × ${Math.round(box.height)}`;
      sel.classList.add('is-on','is-moving');clearTimeout(place.t);place.t=setTimeout(()=>sel.classList.remove('is-moving'),500);
      current=index;
    };
    facts.forEach((fact,index)=>fact.addEventListener('pointerenter',()=>{hovering=true;place(index);}));
    stage.addEventListener('pointerleave',()=>{hovering=false;});
    addEventListener('resize',()=>place(current));
    place(1);
    if(reduced())return;
    const cycle=()=>{if(!hovering&&!document.hidden)place((current+1)%facts.length);};
    if('IntersectionObserver' in window)new IntersectionObserver(([entry])=>{clearInterval(timer);if(entry.isIntersecting)timer=setInterval(cycle,3200);}).observe(stage);
  })();
  // Sections fade up as they enter.
  if('IntersectionObserver' in window){
    document.documentElement.classList.add('has-reveal');
    const reveal=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-in');reveal.unobserve(entry.target);}},{rootMargin:'0px 0px -10% 0px'});
    document.querySelectorAll('.qa,.reveal').forEach(node=>reveal.observe(node));
  }

  // ── Start ──────────────────────────────────────────────────────────────────────
  (async()=>{
    try{
      const record=await fetchJSON(`/api/judge/cases/${FEATURED}`,{timeout:12000});
      currency=record.snapshot.memo.currency??'USD';
      fillFan(record.snapshot,null);fillPipeline(record.snapshot);
      const off=await fetchJSON(`/api/judge/cases/${FEATURED}/experiment`,{method:'POST',body:{qlooOff:true},timeout:12000});
      fillFan(record.snapshot,off.snapshot);
    }catch{/* The page keeps the published values written in its HTML. */}
  })();
})();
