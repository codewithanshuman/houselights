import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'houselights-room-'));
process.env.DATA_DIR=directory;process.env.QLOO_MODE='mock';process.env.LLM_MODE='off';process.env.ORGANIZER_TOKEN='test-credential-for-decision-room-only';
const {db}=await import('../server/database.mjs');
const store=await import('../server/store.mjs');
const {createApp}=await import('../server/app.mjs');
const {optimizeSlate}=await import('../server/optimizer.mjs');
const {reviewScopeDigest}=await import('../server/decision-room.mjs');
const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(directory,{recursive:true,force:true});});
const post=(path,body={},auth=true)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:`Bearer ${process.env.ORGANIZER_TOKEN}`}:{})},body:JSON.stringify({...body,...(body.action==='approve' && body.expectedScopeDigest===undefined ? {expectedScopeDigest:reviewScopeDigest(store.load(path.split('/')[3]))}: {})})});
function save(budget=60){const items=['a','b','c'].map((id,i)=>({id,name:id,fit:1-i/2,evidence:{rank:true},evidenceReceipts:{rank:['r1']},receipts:['r1'],terms:{fee:[40,30,10][i],available:true,genre:id}}));const constraints={budget,slots:2};return store.save({mock:true,receipts:[{id:'r1',tool:'rank',status:'ok',source:'synthetic'}],memo:{currency:'GBP',input:{city:'London'},items,constraints,slate:optimizeSlate(items,constraints)}});}

test('proof creates an immutable child, validates approval with CAS, and only prepares unsent drafts',async()=>{
  const id=save();
  assert.equal((await post(`/api/decision/${id}/proof`,{},false)).status,401);
  const proofResponse=await post(`/api/decision/${id}/proof`);
  assert.equal(proofResponse.status,201);const saved=await proofResponse.json();
  assert.equal(store.load(id).decisionProof,undefined);
  assert.equal(store.load(saved.id).parentId,id);
  const path=`/api/decision/${saved.id}/transition`;
  assert.equal((await post(path,{action:'draft',expectedRevision:0,event:{date:'2027-04-01'}})).status,409);
  assert.equal((await post(path,{action:'approve',expectedRevision:0,reason:'Approved fixture trade-offs',acknowledgedFindings:[]})).status,400);
  const acknowledgedFindings=saved.proof.findings.filter(f=>f.severity==='review').map(f=>f.id);
  const approval={action:'approve',expectedRevision:0,reason:'Reviewed fixture trade-offs for planning only.',acknowledgedFindings};
  assert.equal((await post(path,approval)).status,200);
  assert.equal((await post(path,approval)).status,409);
  assert.equal((await post(path,{action:'draft',expectedRevision:1,event:{date:'not-a-date'}})).status,400);
  const drafted=await post(path,{action:'draft',expectedRevision:1,event:{date:'2027-04-01'}});
  assert.equal(drafted.status,200);const {session}=await drafted.json();
  assert.equal(session.state,'draft_ready');assert.equal(session.revision,2);assert.equal(session.events[1].detail.sent,false);
  const publicRoom=await (await fetch(`${base}/api/decision/${saved.id}`)).json();
  assert.equal(publicRoom.session.events,undefined);assert.equal(publicRoom.session.packet,undefined);
  assert.equal(publicRoom.proof.proofDigest,saved.proof.proofDigest);
  const deferred=await post(path,{action:'defer',expectedRevision:2,reason:'Need new venue confirmation'});
  assert.equal((await deferred.json()).session.packet,null);
  assert.equal((await post(path,{action:'reopen',expectedRevision:3})).status,200);
  assert.equal(db.prepare('SELECT pinned FROM snapshots WHERE id=?').get(saved.id).pinned,1);
});

test('blocked proofs cannot be approved; preview budgets use only server-held evidence and never save',async()=>{
  const id=save(1),saved=await (await post(`/api/decision/${id}/proof`)).json();
  assert.equal(saved.proof.status,'blocked');
  assert.equal((await post(`/api/decision/${saved.id}/transition`,{action:'approve',expectedRevision:0,reason:'Trying to bypass a blocker',acknowledgedFindings:[]})).status,422);
  const preview=await post(`/api/decision/${saved.id}/preview`,{budget:80,items:[{id:'fake',fit:999}]});
  assert.equal(preview.status,200);const value=await preview.json();assert.equal(value.saved,false);assert.ok(!value.slate.selectedIds.includes('fake'));
  assert.equal(store.load(saved.id).memo.constraints.budget,1);
  assert.equal((await post(`/api/decision/${saved.id}/preview`,{budget:-1})).status,400);
  assert.equal((await post(`/api/decision/${saved.id}/preview`,{budget:80},false)).status,401);
});

test('a changed evidence fingerprint cannot reuse a proof or its approval',async()=>{
  const id=save(),saved=await (await post(`/api/decision/${id}/proof`)).json(),modified=store.load(saved.id);
  modified.memo.currency='USD';const changedId=store.save(modified);
  const report=await (await fetch(`${base}/api/decision/${changedId}`)).json();assert.equal(report.proof,null);
  assert.equal((await post(`/api/decision/${changedId}/transition`,{action:'defer',expectedRevision:0,reason:'defer'})).status,409);
});
