import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const dir=mkdtempSync(join(tmpdir(),'houselights-shocks-'));
process.env.DATA_DIR=dir;
const {seededShockCases,syntheticShockCases,enumerateShocks,reproduceShocks,shocksMarkdown}=await import('../server/shocks.mjs');
const {db}=await import('../server/database.mjs');
const cohort=JSON.parse(readFileSync(new URL('../evals/shock-cohort.json',import.meta.url),'utf8'));
const real=seededShockCases(JSON.parse(readFileSync(new URL('../deploy/judge-cases.json',import.meta.url),'utf8'))).filter(record=>cohort.caseIds.includes(record.id));
assert.equal(real.length,cohort.caseIds.length,'the frozen study cohort must remain available');
const syntheticSource=JSON.parse(readFileSync(new URL('../evals/shock-cases.json',import.meta.url),'utf8'));
test('symmetric shocks include either arm’s picks; synthetic 12-candidate exact search never proposes a violation',async()=>{
  const synthetic=syntheticShockCases(syntheticSource);
  assert.deepEqual(synthetic.map(row=>row.snapshot.memo.items.length),[10,12]);
  assert.equal(synthetic[1].snapshot.memo.slate.checkedCount,792);
  const withControl=structuredClone(real[1]);
  const llmOnly=withControl.snapshot.benchmark.control.selectedIds.find(id=>!withControl.snapshot.memo.slate.selectedIds.includes(id));
  assert.ok(llmOnly);
  assert.ok(enumerateShocks(withControl).some(shock=>shock.patch.cancelId===llmOnly));
  const cases=[...synthetic,...real];
  const result=await reproduceShocks(cases);
  assert.equal(result.rows.length,cases.reduce((sum,record)=>sum+3+3*new Set([
    ...record.snapshot.memo.slate.selectedIds,...(record.snapshot.benchmark?.control?.selectedIds??[])]).size,0));
  assert.ok(result.rows.every(row=>row.arms.houselights.violationCount===0));
  assert.equal(result.summary.houselights.totalHardConstraintViolations,0);
  assert.ok(result.summary.houselights.abstained>0,'infeasible shocks are reported as abstentions, not successes');
  assert.ok(result.summary.staticLlm.totalHardConstraintViolations>0);
  assert.ok(result.rows.some(row=>row.arms.staticLlm.hardConstraintViolations.includes('availability')));
  assert.ok(result.rows.some(row=>row.arms.staticLlm.hardConstraintViolations.includes('budget')));
  assert.ok(result.rows.some(row=>row.arms.staticLlm.budgetOverage>0));
  assert.match(shocksMarkdown(result),/optimizer only returns lineups that satisfy its constraints/);
});
test('the committed three-response fixture reproduces every per-shock result offline',async()=>{
  const fixture=JSON.parse(readFileSync(new URL('../results/shocks-llm-fixture.json',import.meta.url),'utf8'));
  assert.equal(fixture.version,'2.0');
  const cases=[...syntheticShockCases(syntheticSource,fixture.baselines).reverse(),...real];
  const reproduced=await reproduceShocks(cases,{fixture:fixture.responses});
  assert.deepEqual(reproduced,JSON.parse(readFileSync(new URL('../results/shocks.json',import.meta.url),'utf8')));
  // The headline reports the like-for-like rate on solvable shocks; forced
  // violations on unsolvable shocks and non-comparable briefs stay separate.
  const {solvable,unsolvable,notComparable,overall}=reproduced.breakdown;
  assert.deepEqual([solvable.violationResponses,solvable.returnedResponses],[3,231]);
  assert.deepEqual([unsolvable.shocks,unsolvable.violationResponses,unsolvable.returnedResponses,unsolvable.houselightsAbstained],[7,21,21,7]);
  assert.deepEqual(notComparable.cases,['Mumbai: why a comparison is unavailable']);assert.equal(notComparable.returnedResponses,0);
  assert.equal(overall.shocks,solvable.shocks+unsolvable.shocks);
  assert.match(reproduced.headline,/^On 77 solvable shocks, 3\/231 re-prompted LLM responses \(1\.3%\)/);
  assert.match(reproduced.headline,/because the prompt required a lineup/);
  assert.doesNotMatch(reproduced.headline,/9\.[57]%/);
});
test('live LLM attempts can be captured once and replayed offline against an exact brief digest',async()=>{
  const fixture={};let calls=0;
  const first=await reproduceShocks(real.slice(0,1),{fixture,reprompt:async({briefDigest})=>{
    calls++;return {briefDigest,status:'responded',selectedIds:['unknown'],generation:{provider:'fixture'}};
  }});
  assert.equal(calls,27);
  assert.ok(first.rows.every(row=>row.arms.repromptedLlm.violationTrials===3));
  const second=await reproduceShocks(real.slice(0,1),{fixture});
  assert.deepEqual(second,first);
  const key=Object.keys(fixture)[0];fixture[key][0].briefDigest='sha256:stale';
  await assert.rejects(()=>reproduceShocks(real.slice(0,1),{fixture}),/Stale or malformed LLM fixture/);
});
test.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
