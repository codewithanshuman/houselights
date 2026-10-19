import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDecisionProof, decisionFingerprint } from '../server/decision-proof.mjs';
import { optimizeSlate, enumerateSlates } from '../server/optimizer.mjs';
import { benchmarkFestival, withoutDerived, reviseFestival } from '../server/gm.mjs';
import { buildDossier, dossierHtml } from '../server/dossier.mjs';

function source(overrides = {}) {
  const items = ['a','b','c','d'].map((id,i)=>({id,name:id,fit:[1,.8,.4,.2][i],rank:i+1,of:4,evidence:{rank:true},
    evidenceReceipts:{rank:['rank1'],local:[],trends:[],comparison:[]},receipts:['rank1'],terms:{fee:[50,40,20,10][i],available:true,genre:id}}));
  const constraints={budget:70,slots:2,...overrides};
  return {id:'source123',mock:true,receipts:[{id:'rank1',tool:'rank',status:'ok',source:'synthetic',args:{options:items.map(i=>i.id)},digest:'sha256:test'}],
    memo:{mode:'mock',currency:'GBP',input:{city:'London',anchors:['Anchor']},items,constraints,slate:optimizeSlate(items,constraints)}};
}

test('proof compares exact feasible operational cost with grounded selection without mutating input',()=>{
  const s=source(),before=structuredClone(s),p=buildDecisionProof(s);
  assert.deepEqual(s,before);
  assert.deepEqual(p.baseline.selectedIds,['a','c']);
  assert.deepEqual(p.constraintOnly.selectedIds,['c','d']);
  assert.equal(p.constraintOnly.totalFee,30);
  assert.equal(p.llmOnly.status,'unavailable');
  assert.equal(p.assumptions.newProviderCalls,0);
  assert.equal(p.inputDigest,decisionFingerprint(s));
  assert.equal(p.proofDigest,buildDecisionProof(s).proofDigest);
  assert.equal(withoutDerived({...s,decisionProof:p}).decisionProof,undefined);
});

test('one shared rank receipt is withdrawn from every dependent artist and changes the slate',()=>{
  const p=buildDecisionProof(source()),a=p.ablations.find(row=>row.id==='receipt:rank1');
  assert.deepEqual(a.affectedIds,['a','b','c','d']);
  assert.deepEqual(a.selectedIds,['c','d']);
  assert.equal(a.changed,true);
  assert.equal(a.evidenceCoverage.level,'insufficient');
  assert.ok(p.findings.some(f=>f.id==='receipt:rank1'&&f.counterfactual.changed));
  assert.ok(p.graph.find(c=>c.id==='a').consequentialAblations.includes('receipt:rank1'));
});

test('legacy rank provenance changes invalidate a proof even when candidate scores remain unchanged',()=>{
  const s=source();
  s.memo.items.forEach(item=>{delete item.evidenceReceipts;});
  s.festivalResearch={profiles:s.memo.items.map(item=>({id:item.id,audience:{receiptId:'rank1'}}))};
  const proof=buildDecisionProof(s);
  s.festivalResearch.profiles[0].audience.receiptId='missing';
  assert.notEqual(proof.inputDigest,decisionFingerprint(s));
  assert.equal(buildDecisionProof(s).status,'blocked');
  s.festivalResearch={};
  assert.doesNotThrow(()=>buildDecisionProof(s));
});

test('scenario derivation and GM revisions preserve explicit legacy rank provenance without guessing', async()=>{
  const original=source();
  original.receipts.push({...original.receipts[0],id:'rank2'});
  original.memo.items.forEach(item=>{delete item.evidenceReceipts;item.receipts.push('rank2');});
  original.festivalResearch={profiles:original.memo.items.map(item=>({id:item.id,audience:{receiptId:'rank1'}}))};
  const before=structuredClone(original),derived=withoutDerived(original);
  assert.equal(derived.festivalResearch,undefined);
  assert.ok(buildDecisionProof(derived).graph.every(card=>card.evidence.rank.mapping==='linked'&&card.evidence.rank.receiptIds.join()==='rank1'));
  const revised=await reviseFestival(original,{request:'Exclude a'});
  assert.equal(revised.status,'revised');
  assert.ok(buildDecisionProof(revised.snapshot).graph.every(card=>card.evidence.rank.receiptIds.join()==='rank1'));
  assert.deepEqual(original,before);
  original.memo.items[0].evidenceReceipts={rank:[]};
  assert.deepEqual(withoutDerived(original).memo.items[0].evidenceReceipts.rank,[]);
  delete original.festivalResearch;
  assert.equal(buildDecisionProof(withoutDerived(original)).graph[1].evidence.rank.mapping,'ambiguous');
});

test('exact budget boundary tests cent-valued fees and every preceding feasible threshold',()=>{
  const s=source();s.memo.items[1].terms.fee=40.01;s.memo.slate=optimizeSlate(s.memo.items,s.memo.constraints);
  const p=buildDecisionProof(s);
  assert.equal(p.budgetSwitch.next.budget,90.01);
  assert.equal(p.budgetSwitch.next.increase,20.01);
  assert.deepEqual(optimizeSlate(s.memo.items,{...s.memo.constraints,budget:90}).selectedIds,p.baseline.selectedIds);
  assert.deepEqual(p.budgetSwitch.next.selectedIds,['a','b']);
});

test('evidence-dependent fit floors remain identical in ablations and make evidence-free controls incomparable',()=>{
  const p=buildDecisionProof(source({minimumAverageFit:.6}));
  assert.equal(p.constraintOnly.status,'not_comparable');
  assert.equal(p.ablations.find(a=>a.id==='class:rank').feasible,false);
});

test('a real saved control is revalidated, invalid controls remain invalid, and changed terms invalidate comparison',async()=>{
  const s=source();s.benchmark=await benchmarkFestival(s,{propose:async()=>({selectedIds:['b','c'],reason:'Fixture proposal'})});
  assert.equal(buildDecisionProof(s).llmOnly.status,'compared');
  s.memo.items[0].terms.fee=49;
  assert.equal(buildDecisionProof(s).llmOnly.status,'stale');
  s.benchmark=await benchmarkFestival(s,{propose:async()=>({selectedIds:['unknown']})});
  assert.equal(buildDecisionProof(s).llmOnly.status,'invalid_control');
});

test('infeasible slates and unlinked or ambiguous rank provenance block planning approval',()=>{
  assert.equal(buildDecisionProof(source({budget:1})).status,'blocked');
  const s=source();s.receipts=[];
  assert.ok(buildDecisionProof(s).findings.some(f=>f.id==='rank-provenance'&&f.severity==='blocker'));
  const old=source();old.receipts.push({...old.receipts[0],id:'rank2'});
  old.memo.items.forEach(item=>{delete item.evidenceReceipts;item.receipts.push('rank2');});
  const proof=buildDecisionProof(old);
  assert.equal(proof.graph[0].evidence.rank.mapping,'ambiguous');
  assert.ok(!proof.ablations.some(a=>a.id==='receipt:rank2'));
  assert.equal(proof.status,'blocked');
});

test('pair ablation removes both directed dependencies while leaving unrelated evidence intact',()=>{
  const s=source({festivalPolicy:true});s.receipts.push({id:'pair1',tool:'compare_audiences',status:'ok'});
  s.memo.items[0].culturalLinks=[{otherId:'c',available:true,sharedTastes:['ambient'],receiptId:'pair1'}];
  s.memo.items[2].culturalLinks=[{otherId:'a',available:true,sharedTastes:['ambient'],receiptId:'pair1'}];
  s.memo.slate=optimizeSlate(s.memo.items,s.memo.constraints);
  const p=buildDecisionProof(s),a=p.ablations.find(a=>a.id==='receipt:pair1');
  assert.deepEqual(a.affectedIds,['a','c']);
  assert.deepEqual(p.graph.find(card=>card.id==='a').culturalLinks,[{otherId:'c',available:true,sharedTastes:['ambient'],receiptId:'pair1'}]);
  assert.equal(a.evidenceCoverage.supportedFitCount,2);
  assert.ok(p.ablations.find(a=>a.id==='class:local').changed===false);
});

test('enumeration and robustness never discard required locks, exclusions or survivor constraints',()=>{
  const s=source({lockedIds:['c'],excludedIds:['d']});
  const rows=enumerateSlates(s.memo.items,s.memo.constraints);
  assert.equal(rows.length,6);
  assert.ok(rows.filter(r=>r.feasible).every(r=>r.selectedIds.includes('c')&&!r.selectedIds.includes('d')));
  const p=buildDecisionProof(s);
  assert.ok(p.robustAlternatives.every(r=>r.selectedIds.includes('c')));
  for(const canceled of p.cancellations){if(canceled.feasible)assert.ok(p.baseline.selectedIds.filter(id=>id!==canceled.canceledId).every(id=>canceled.selectedIds.includes(id)));}
});

test('a saved decision that disagrees with the recomputed optimum is explicitly blocked',()=>{
  const s=source();s.memo.slate.selectedIds=['c','d'];
  assert.ok(buildDecisionProof(s).findings.some(f=>f.id==='saved-slate-mismatch'));
});

test('declared sensitivity preserves native tie-breaking and unrounded objective precision',()=>{
  const s=source({slots:1,budget:100});
  s.memo.items[0].id='Z';s.memo.items[1].id='a';
  s.memo.items[0].fit=.800000001;s.memo.items[1].fit=.8;
  s.memo.items[0].terms.fee=s.memo.items[1].terms.fee=10;
  s.memo.slate=optimizeSlate(s.memo.items,s.memo.constraints);
  const p=buildDecisionProof(s);
  assert.deepEqual(p.sensitivity[0].selectedIds,p.baseline.selectedIds);
  assert.equal(p.sensitivity[0].changed,false);
});

test('proof findings survive dossier exports with supplied text escaped in HTML',()=>{
  const s=source();s.decisionProof=buildDecisionProof(s);
  s.decisionProof.findings[0].assumption='<script>untrusted fixture</script>';
  const dossier=buildDossier(s),html=dossierHtml(dossier);
  assert.match(dossier.markdown,/## Decision proof/);
  assert.match(html,/<h2>Decision proof<\/h2>/);
  assert.ok(html.includes('&lt;script&gt;untrusted fixture&lt;/script&gt;'));
  assert.ok(!html.includes('<script>untrusted fixture</script>'));
});
