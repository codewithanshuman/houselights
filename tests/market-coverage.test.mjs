import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {evaluateSelection,optimizeSlate} from '../server/optimizer.mjs';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const protocol=read('../evals/market-coverage-protocol.json'),manifest=read('../deploy/judge-cases.json');
const captured=read('../results/market-coverage-capture.json');
const id=row=>createHash('sha256').update(JSON.stringify({version:'1.0',title:row.title,snapshot:row.snapshot})).digest('hex').slice(0,24);
test('market expansion preserves originals, declared cases and resource caps without inventing controls',()=>{
  const originals=['4986d98dcd8ac838aed3874a','934e002267e2db9ccdc1b5a9','bf9b65d52eeff00e0e258917','5031a69f837e1c28ce045422','8be4d03ef4792ca9f1466983'];
  for(const expected of originals)assert.ok(manifest.cases.some(row=>id(row)===expected));
  assert.equal(captured.capturedBriefs,protocol.briefs.length);
  assert.ok(captured.qlooWorkflows<=protocol.maximumQlooWorkflowAttempts);assert.ok(captured.modelRequests<=protocol.maximumLlmRequests);
  assert.ok(captured.reservedTokens<=protocol.conservativeLlmTokenBudget);
  for(const declared of protocol.briefs){
    const row=manifest.cases.find(row=>row.title==='Illustrative: '+declared.label);assert.ok(row);
    const s=row.snapshot;assert.equal(s.mock,false);assert.equal(s.memo.input.city,declared.city);
    assert.equal(s.memo.constraints.slots,3);assert.equal(s.memo.constraints.maxPerGenre,2);
    assert.equal(s.memo.constraints.budget,declared.constraints.budget);
    assert.ok(s.memo.items.every(item=>!item.found));assert.ok(s.receipts.every(receipt=>receipt.source==='qloo'));
    const full=optimizeSlate(s.memo.items,s.memo.constraints);assert.deepEqual(full.selectedIds,s.memo.slate.selectedIds);
    if(s.benchmark.status==='compared'){
      const check=evaluateSelection(s.memo.items,s.memo.constraints,s.benchmark.control.selectedIds);
      assert.equal(check.feasible,true);assert.equal(s.benchmark.generation.toolsAllowed,false);
      assert.equal(s.benchmarkTrial.index,1);assert.equal(s.benchmarkTrial.reviewTrial,1);
    }else{
      assert.equal(s.benchmark.status,'not_comparable');assert.equal(s.benchmark.generation.mode,'not_called');
      assert.equal(s.benchmark.control,null);
    }
  }
});
test('incomplete and infeasible market probes remain visible with original constraints',()=>{
  for(const city of ['Paris','Sydney']){
    const s=manifest.cases.find(row=>row.title.startsWith('Illustrative:')&&row.snapshot.memo.input.city===city).snapshot;
    assert.ok(s.memo.items.some(item=>item.evidence.rank===false));assert.equal(s.benchmark.status,'not_comparable');
  }
  const paris=manifest.cases.find(row=>row.snapshot.memo.input.city==='Paris').snapshot;
  assert.equal(paris.memo.slate.feasible,false);assert.deepEqual(paris.memo.slate.selectedIds,[]);
  const raised=optimizeSlate(paris.memo.items,{...paris.memo.constraints,budget:paris.memo.constraints.budget*1.25});
  assert.equal(raised.feasible,true);assert.ok(raised.totalFee<=15625);
});
