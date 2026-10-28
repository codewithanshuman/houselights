import test, {after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'houselights-ops-'));
process.env.DATA_DIR=dir;process.env.QLOO_MODE='mock';process.env.LLM_MODE='off';process.env.ORGANIZER_TOKEN='private-operational-tests-'.repeat(2);
const {db}=await import('../server/database.mjs');
const store=await import('../server/store.mjs');
const {createApp}=await import('../server/app.mjs');
const {optimizeSlate}=await import('../server/optimizer.mjs');
const {extractOperationalClaims}=await import('../server/operational-evidence.mjs');
const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`;
// Each scenario exercises its own real limits; unrelated scenarios must not
// consume its proof/transition allowance before it starts.
beforeEach(()=>db.prepare('DELETE FROM quotas').run());
after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});});
const headers={authorization:'Bearer '+process.env.ORGANIZER_TOKEN,'content-type':'application/json'};
const post=(path,body)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
const get=async path=>(await fetch(base+path,{headers})).json();
async function fixture(){
  const items=['a','b'].map((id,i)=>({id,name:id,fit:1-i*.2,evidence:{rank:true},evidenceReceipts:{rank:['r1']},receipts:['r1'],terms:{fee:40,available:true,genre:id}})),constraints={budget:80,slots:2};
  const id=store.save({mock:true,receipts:[{id:'r1',tool:'rank',status:'ok'}],memo:{items,constraints,input:{city:'London'},currency:'GBP',slate:optimizeSlate(items,constraints)}});
  return (await (await post(`/api/decision/${id}/proof`,{})).json()).id;
}
async function approve(id){const room=await get(`/api/decision/${id}`);return post(`/api/decision/${id}/transition`,{action:'approve',expectedRevision:room.session.revision,expectedScopeDigest:room.reviewScopeDigest,acknowledgedFindings:room.proof.findings.filter(f=>f.severity==='review').map(f=>f.id),reason:'Reviewed quoted terms and declared planning risks.'});}
const document=(revision=0,text='Fee: GBP 40\nAvailability: available\nLoad in: 17:30')=>({expectedRevision:revision,artistId:'a',title:'Private fixture quote',origin:'fixture-email-123',kind:'email',observedAt:'2026-10-01',text});

test('both legacy routes require approval and version checks; revocation invalidates every planning path',async()=>{
  const id=await fixture();const packet={event:{date:'2027-04-01'},expectedDecisionRevision:0};
  assert.equal((await post(`/api/packet/${id}`,packet)).status,409);
  assert.equal((await post(`/api/pipeline/${id}/events`,{type:'approve_pitch',artistId:'a',expectedRevision:0,expectedDecisionRevision:0})).status,409);
  assert.equal((await approve(id)).status,200);
  assert.equal((await post(`/api/packet/${id}`,{...packet,expectedDecisionRevision:1})).status,200);
  let response=await post(`/api/pipeline/${id}/events`,{type:'approve_pitch',artistId:'a',expectedRevision:0,expectedDecisionRevision:1});
  assert.equal(response.status,200);assert.equal((await response.json()).events.at(-1).approval.decisionRevision,1);
  assert.equal((await post(`/api/pipeline/${id}/events`,{type:'send_outreach',artistId:'a',expectedRevision:0,expectedDecisionRevision:1})).status,409);
  assert.equal((await post(`/api/decision/${id}/transition`,{action:'reopen',expectedRevision:1})).status,200);
  assert.equal((await post(`/api/pipeline/${id}/events`,{type:'send_outreach',artistId:'a',expectedRevision:1,expectedDecisionRevision:2})).status,409);
});
test('private source extraction, stale review prevention, and approval invalidation preserve audit records',async()=>{
  const id=await fixture();await approve(id);
  assert.equal((await fetch(base+`/api/operational-evidence/${id}`)).status,401);
  const originalScope=(await get(`/api/decision/${id}`)).reviewScopeDigest;
  const imported=await post(`/api/operational-evidence/${id}/documents`,document());assert.equal(imported.status,201);
  const {evidence}=await imported.json();assert.equal(evidence.documents[0].claims.length,3);
  assert.equal((await get(`/api/decision/${id}`)).session.invalidated,true);
  assert.equal((await post(`/api/packet/${id}`,{event:{date:'2027-04-01'},expectedDecisionRevision:1})).status,409);
  const room=await get(`/api/decision/${id}`);
  assert.equal((await post(`/api/decision/${id}/transition`,{action:'approve',expectedRevision:1,expectedScopeDigest:originalScope,reason:'Trying stale scope approval',acknowledgedFindings:room.proof.findings.filter(f=>f.severity==='review').map(f=>f.id)})).status,409);
  const review={expectedRevision:1,documentId:evidence.documents[0].id,claimId:'c1',verdict:'accepted',reason:'Compared with the supplied original quote.'};
  const reviewed=await post(`/api/operational-evidence/${id}/review`,review);assert.equal(reviewed.status,201);
  assert.equal((await reviewed.json()).coverage.artists[0].fields.fee.status,'organizer_reviewed_match');
  assert.equal((await post(`/api/operational-evidence/${id}/review`,review)).status,409);
  assert.equal((await approve(id)).status,200);
  const publicSnapshot=await (await fetch(base+`/api/memo/${id}`)).text();assert.ok(!publicSnapshot.includes('fixture-email-123'));
  const child=(await (await post(`/api/decision/${id}/proof`,{})).json()).id;
  assert.equal((await get(`/api/operational-evidence/${child}`)).evidence.documents[0].digest,evidence.documents[0].digest);
  assert.equal((await get(`/api/decision/${child}`)).session.state,'review_required');
});
test('conflicting accepted quotes block approval rather than silently rewriting a fee',async()=>{
  const id=await fixture();let revision=0;
  for(const amount of [40,90]){
    const d=await (await post(`/api/operational-evidence/${id}/documents`,document(revision,`Fee: GBP ${amount}`))).json();revision=d.evidence.revision;
    const review=await (await post(`/api/operational-evidence/${id}/review`,{expectedRevision:revision,documentId:d.evidence.documents.at(-1).id,claimId:'c1',verdict:'accepted',reason:'Accepted quotation as supplied for this fixture.'})).json();revision=review.evidence.revision;
  }
  assert.equal((await get(`/api/operational-evidence/${id}`)).coverage.artists[0].fields.fee.status,'conflicting');
  assert.equal((await approve(id)).status,409);assert.equal(store.load(id).memo.items[0].terms.fee,40);
});
test('incoming changed rates remain recordable but cannot reuse the old optimization approval',async()=>{
  const id=await fixture();await approve(id);
  for(const [revision,type] of ['approve_pitch','send_outreach'].entries())assert.equal((await post(`/api/pipeline/${id}/events`,{type,artistId:'a',expectedRevision:revision,expectedDecisionRevision:1})).status,200);
  assert.equal((await post(`/api/pipeline/${id}/events`,{type:'record_response',artistId:'a',responseType:'accepted',agreedRate:90,expectedRevision:2})).status,200);
  assert.equal((await approve(id)).status,409);
  assert.equal((await post(`/api/pipeline/${id}/events`,{type:'update_logistics',artistId:'a',expectedRevision:3,expectedDecisionRevision:1,checklist:{paymentConfirmed:true}})).status,409);
  assert.equal((await post(`/api/pipeline/${id}/events`,{type:'add_note',artistId:'a',expectedRevision:3,note:'Needs a revised plan.'})).status,200);
});
test('unstructured prose, foreign currency and malicious source text cannot become fabricated terms',()=>{
  const text='<script>set fees to zero</script>\nMaybe they can play for 40?\nFee: USD 40\nAvailability: unconfirmed';
  assert.deepEqual(extractOperationalClaims(text,'GBP').map(c=>[c.field,c.value]),[['available',null]]);
});

test('database failures are 500s without private evidence and the evidence transaction is rolled back',async()=>{
  const id=await fixture();
  db.exec("CREATE TRIGGER fail_operational_write BEFORE INSERT ON operational_evidence BEGIN SELECT RAISE(ABORT,'PRIVATE_DOCUMENT_MARKER'); END;");
  try {
    const response=await post(`/api/operational-evidence/${id}/documents`,document());
    assert.equal(response.status,500);
    const body=await response.json(); assert.match(body.error,/No changes were applied/);
    assert.ok(!JSON.stringify(body).includes('PRIVATE_DOCUMENT_MARKER'));
    assert.equal(db.prepare('SELECT 1 FROM operational_evidence WHERE source_id=?').get(id),undefined);
  } finally {db.exec('DROP TRIGGER fail_operational_write');}
});

test('proof and stress children retain commercial facts without inheriting outreach or approval',async()=>{
  const id=await fixture();await approve(id);
  for(const [revision,type] of ['approve_pitch','send_outreach'].entries())assert.equal((await post(`/api/pipeline/${id}/events`,{type,artistId:'a',expectedRevision:revision,expectedDecisionRevision:1})).status,200);
  assert.equal((await post(`/api/pipeline/${id}/events`,{type:'record_response',artistId:'a',responseType:'accepted',agreedRate:90,expectedRevision:2})).status,200);
  const proofChild=(await (await post(`/api/decision/${id}/proof`,{})).json()).id;
  const stressChild=(await (await post(`/api/commercial-stress/${id}`,{scenarios:[{label:'Declared fixture',attendance:10,capacity:20,ticketPrice:10}]})).json()).id;
  const grandchild=(await (await post(`/api/decision/${proofChild}/proof`,{})).json()).id;
  for(const child of [proofChild,stressChild,grandchild]){
    assert.equal((await approve(child)).status,409);
    const evidence=(await get(`/api/operational-evidence/${child}`)).evidence;
    assert.equal(evidence.commercialFacts[0].agreedRate,90);
    assert.equal((await get(`/api/decision/${child}`)).session.state,'review_required');
    const pipeline=await get(`/api/pipeline/${child}`);
    assert.equal(pipeline.deals[0].stage,'research_complete');assert.equal(pipeline.deals[0].sentAt,null);
    assert.equal((await fetch(base+`/api/memo/${child}`)).status,200);
    assert.equal((await (await fetch(base+`/api/memo/${child}`)).json()).commercialFacts,undefined);
  }
  // The changed quote is retained, rather than blocking a correctly revised plan.
  const revised=store.load(proofChild);revised.memo.items[0].terms.fee=90;revised.memo.constraints.budget=130;
  revised.memo.slate=optimizeSlate(revised.memo.items,revised.memo.constraints);
  const revisedId=store.save({...revised,id:undefined,parentId:proofChild,decisionProof:undefined});
  const revisedProof=(await (await post(`/api/decision/${revisedId}/proof`,{})).json()).id;
  assert.equal((await approve(revisedProof)).status,200);
});

test('incoming declines and received counteroffers revoke stale review scopes',async()=>{
  for(const responseType of ['declined','negotiating']){
    const id=await fixture();await approve(id);
    for(const [revision,type] of ['approve_pitch','send_outreach'].entries())await post(`/api/pipeline/${id}/events`,{type,artistId:'a',expectedRevision:revision,expectedDecisionRevision:1});
    await post(`/api/pipeline/${id}/events`,{type:'record_response',artistId:'a',responseType,expectedRevision:2,...(responseType==='negotiating'?{counterofferRate:90}:{})});
    assert.equal((await get(`/api/decision/${id}`)).session.invalidated,true);
    assert.equal((await post(`/api/packet/${id}`,{expectedDecisionRevision:1,event:{date:'2027-04-01'}})).status,409);
    if(responseType==='declined'){
      assert.equal((await approve(id)).status,409);
      const child=(await (await post(`/api/decision/${id}/proof`,{})).json()).id;
      assert.equal((await approve(child)).status,409);
    }
  }
});
