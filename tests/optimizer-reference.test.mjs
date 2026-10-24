import test from 'node:test';
import assert from 'node:assert/strict';
const {optimizeSlate,evaluateSelection}=await import('../server/optimizer.mjs');

// An independent reference written from the documented hard constraints (budget, slots,
// valid fees, confirmed availability, locks, exclusions, discovery minimum, cap per known
// genre). The optimizer must choose a slate the reference allows, and no slate the
// reference allows may score higher. Seeded, so failures are reproducible.
test('combined booking constraints: the optimizer matches an independent reference',()=>{
  let seed=7;const rnd=()=>((seed=Math.imul(seed^seed>>>15,2246822507)+0x9e3779b9|0)>>>0)/2**32,pick=a=>a[Math.floor(rnd()*a.length)];
  const combos=(arr,k)=>k===0?[[]]:arr.flatMap((x,i)=>combos(arr.slice(i+1),k-1).map(c=>[x,...c]));
  const known=g=>{const s=typeof g==='string'?g.trim().toLowerCase():'';return s&&!['unknown','no data','n/a','unspecified'].includes(s)?s:null;};
  let checked=0,infeasible=0;
  for(let t=0;t<600;t++){
    const n=3+Math.floor(rnd()*6);
    const pool=Array.from({length:n},(_,i)=>({id:'a'+i,name:'A'+i,fit:rnd()<.85?Math.round(rnd()*1000)/1000:undefined,found:rnd()<.35,
      evidence:{rank:rnd()<.85,local:rnd()<.5,trends:rnd()<.3,comparison:rnd()<.5},local:pick(['yes','no']),momentum:pick(['rising','flat','falling']),
      terms:{fee:rnd()<.1?null:Math.round(1000+rnd()*9000),available:rnd()<.85,genre:pick(['soul','jazz','rock','unknown',undefined])}}));
    const ids=pool.map(row=>row.id),slots=1+Math.floor(rnd()*Math.min(3,n));
    const c={budget:Math.round(2000+rnd()*25000),slots,discoveryMin:Math.floor(rnd()*2),maxPerGenre:1+Math.floor(rnd()*2),lockedIds:rnd()<.3?[pick(ids)]:[],excludedIds:rnd()<.3?[pick(ids)]:[]};
    const result=optimizeSlate(pool,c);if(result.status==='invalid')continue;checked++;
    const allowed=sel=>{
      if(sel.some(row=>row.terms.fee==null||!row.terms.available||c.excludedIds.includes(row.id)))return false;
      if(sel.reduce((sum,row)=>sum+row.terms.fee,0)>c.budget||!c.lockedIds.every(id=>sel.some(row=>row.id===id)))return false;
      if(sel.filter(row=>row.found).length<c.discoveryMin)return false;
      const genres={};for(const row of sel){const g=known(row.terms.genre);if(g)genres[g]=(genres[g]??0)+1;}
      return Object.values(genres).every(count=>count<=c.maxPerGenre);
    };
    const feasible=combos(pool,slots).filter(allowed),chosen=result.selectedIds??[];
    if(!feasible.length){infeasible++;assert.equal(chosen.length,0,`case ${t}: chose a slate the reference forbids`);continue;}
    assert.ok(chosen.length,`case ${t}: found nothing although ${feasible.length} slates are allowed`);
    assert.ok(allowed(pool.filter(row=>chosen.includes(row.id))),`case ${t}: chosen slate breaks a hard constraint`);
    const score=evaluateSelection(pool,c,chosen).score,best=Math.max(...feasible.map(sel=>evaluateSelection(pool,c,sel.map(row=>row.id)).score));
    assert.ok(best<=score+1e-6,`case ${t}: an allowed slate scores ${best} > ${score}`);
  }
  assert.ok(checked>500&&infeasible>20,'the generator covers both feasible and infeasible combinations');
});
