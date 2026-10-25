import test from 'node:test';
import assert from 'node:assert/strict';
const {optimizeSlate,evaluateSelection}=await import('../server/optimizer.mjs');
const {fitsFromRankRows}=await import('../server/affinity.mjs');

// Seeded generator shared by the tests below, so failures are reproducible.
function generator(seed){
  const rnd=()=>((seed=Math.imul(seed^seed>>>15,2246822507)+0x9e3779b9|0)>>>0)/2**32,pick=a=>a[Math.floor(rnd()*a.length)];
  return {rnd,pick,pool(n,{affinity=false}={}){
    const rows=Array.from({length:n},(_,i)=>({id:'a'+i,name:'A'+i,fit:rnd()<.85?Math.round(rnd()*1000)/1000:undefined,found:rnd()<.35,
      evidence:{rank:rnd()<.85,local:rnd()<.5,trends:rnd()<.3,comparison:rnd()<.5},local:pick(['yes','no']),momentum:pick(['rising','flat','falling']),
      terms:{fee:rnd()<.1?null:Math.round(1000+rnd()*9000),available:rnd()<.85,genre:pick(['soul','jazz','rock','unknown',undefined])}}));
    if(affinity){
      // Fit from Qloo-like affinity scores through the real fixed-span scaling, near-ties included.
      const base=.9+rnd()*.08,scores=rows.map(()=>base-rnd()*(rnd()<.5?.004:.06));
      const {fits}=fitsFromRankRows(rows.map(row=>row.id),rows.map((row,i)=>({id:row.id,affinity:scores[i]})));
      rows.forEach(row=>{row.fit=fits.get(row.id);row.evidence.rank=true;});
    }
    return rows;
  }};
}
const combos=(arr,k)=>k===0?[[]]:arr.flatMap((x,i)=>combos(arr.slice(i+1),k-1).map(c=>[x,...c]));
const known=g=>{const s=typeof g==='string'?g.trim().toLowerCase():'';return s&&!['unknown','no data','n/a','unspecified'].includes(s)?s:null;};

// An independent reference written from the documented hard constraints (budget, slots,
// valid fees, confirmed availability, locks, exclusions, discovery minimum, cap per known
// genre). The optimizer must choose a bill the reference allows, and no bill the reference
// allows may score higher under the same declared policy.
test('combined booking constraints: the optimizer matches an independent reference on 5,000 seeded cases',()=>{
  const g=generator(7);let checked=0,infeasible=0,festival=0,affinity=0;
  for(let t=0;t<5000;t++){
    const useAffinity=t%3===0,useFestival=t%5===0,n=3+Math.floor(g.rnd()*(useFestival?4:6));
    const pool=g.pool(n,{affinity:useAffinity}),ids=pool.map(row=>row.id),slots=1+Math.floor(g.rnd()*Math.min(3,n));
    const c={budget:Math.round(2000+g.rnd()*25000),slots,discoveryMin:Math.floor(g.rnd()*2),maxPerGenre:1+Math.floor(g.rnd()*2),lockedIds:g.rnd()<.3?[g.pick(ids)]:[],excludedIds:g.rnd()<.3?[g.pick(ids)]:[],...(useFestival?{festivalPolicy:true}:{})};
    const result=optimizeSlate(pool,c);if(result.status==='invalid')continue;checked++;if(useFestival)festival++;if(useAffinity)affinity++;
    const allowed=sel=>{
      if(sel.some(row=>row.terms.fee==null||!row.terms.available||c.excludedIds.includes(row.id)))return false;
      if(sel.reduce((sum,row)=>sum+row.terms.fee,0)>c.budget||!c.lockedIds.every(id=>sel.some(row=>row.id===id)))return false;
      if(sel.filter(row=>row.found).length<c.discoveryMin)return false;
      const genres={};for(const row of sel){const k=known(row.terms.genre);if(k)genres[k]=(genres[k]??0)+1;}
      return Object.values(genres).every(count=>count<=c.maxPerGenre);
    };
    const feasible=combos(pool,slots).filter(allowed),chosen=result.selectedIds??[];
    if(!feasible.length){infeasible++;assert.equal(chosen.length,0,`case ${t}: chose a bill the reference forbids`);continue;}
    assert.ok(chosen.length,`case ${t}: found nothing although ${feasible.length} bills are allowed`);
    assert.ok(allowed(pool.filter(row=>chosen.includes(row.id))),`case ${t}: chosen bill breaks a hard rule`);
    const score=evaluateSelection(pool,c,chosen).score,best=Math.max(...feasible.map(sel=>evaluateSelection(pool,c,sel.map(row=>row.id)).score));
    assert.ok(best<=score+1e-6,`case ${t}: an allowed bill scores ${best} > ${score}`);
  }
  assert.ok(checked>4000&&infeasible>100&&festival>700&&affinity>1300,`coverage: ${checked} checked, ${infeasible} infeasible, ${festival} festival, ${affinity} affinity`);
});

test('determinism: shuffling candidate order changes neither the bill, the score nor tie-breaks',()=>{
  const g=generator(31);
  const shuffle=rows=>{const copy=[...rows];for(let i=copy.length-1;i>0;i--){const j=Math.floor(g.rnd()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;};
  for(let t=0;t<800;t++){
    const pool=g.pool(4+Math.floor(g.rnd()*5),{affinity:t%2===0}),slots=1+Math.floor(g.rnd()*3);
    // Force exact ties on some cases: identical fit, fee and evidence for two acts.
    if(t%4===0&&pool.length>2){pool[1]={...structuredClone(pool[0]),id:'tie-b',name:'Tie B'};pool[0]={...pool[0],id:'tie-a',name:'Tie A'};}
    const c={budget:Math.round(5000+g.rnd()*20000),slots,maxPerGenre:3};
    const first=optimizeSlate(pool,c);if(first.status==='invalid')continue;
    for(let k=0;k<3;k++){
      const again=optimizeSlate(shuffle(pool),c);
      assert.deepEqual([...(again.selectedIds??[])].sort(),[...(first.selectedIds??[])].sort(),`case ${t}: order changed the bill`);
      assert.equal(again.score,first.score,`case ${t}: order changed the score`);
    }
  }
});

test('festival policy rejects briefs too large to rehearse synchronously',()=>{
  const pool=n=>Array.from({length:n},(_,i)=>({id:'a'+i,name:'A'+i,fit:.5,evidence:{rank:true},terms:{fee:1000,available:true,genre:'g'+i%4}}));
  const large=optimizeSlate(pool(20),{budget:15000,slots:5,maxPerGenre:3,festivalPolicy:true});
  assert.equal(large.status,'invalid');assert.match(large.reasons.join(' '),/Festival policy .* at most 2500 combinations/);
  assert.notEqual(optimizeSlate(pool(12),{budget:15000,slots:5,maxPerGenre:3,festivalPolicy:true}).status,'invalid','12 candidates × 5 slots (792) is allowed');
  assert.notEqual(optimizeSlate(pool(20),{budget:15000,slots:5,maxPerGenre:3}).status,'invalid','without festival policy the 25,000 limit still applies');
});
