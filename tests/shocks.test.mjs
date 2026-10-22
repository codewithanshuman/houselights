import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const dir=mkdtempSync(join(tmpdir(),'houselights-shocks-'));
process.env.DATA_DIR=dir;
const {seededShockCases,enumerateShocks,reproduceShocks,shocksMarkdown}=await import('../server/shocks.mjs');
const {db}=await import('../server/database.mjs');
const cases=seededShockCases(JSON.parse(readFileSync(new URL('../deploy/judge-cases.json',import.meta.url),'utf8')));
test('seeded shocks are deterministic, replay the saved LLM, and never propose a violating Houselights lineup',async()=>{
  assert.equal(cases.length,4);
  assert.deepEqual(enumerateShocks(cases[0]).map(shock=>shock.kind),[
    'budget','budget','budget','cancellation','fee_increase','unavailability','cancellation','fee_increase','unavailability']);
  const result=await reproduceShocks(cases);
  assert.equal(result.rows.length,36);
  assert.ok(result.rows.every(row=>row.arms.houselights.violationCount===0));
  assert.equal(result.summary.houselights.totalHardConstraintViolations,0);
  assert.ok(result.summary.houselights.abstained>0,'infeasible shocks are reported as abstentions, not successes');
  assert.ok(result.summary.staticLlm.totalHardConstraintViolations>0);
  assert.ok(result.rows.some(row=>row.arms.staticLlm.hardConstraintViolations.includes('availability')));
  assert.ok(result.rows.some(row=>row.arms.staticLlm.hardConstraintViolations.includes('budget')));
  assert.match(shocksMarkdown(result),/optimizer only returns lineups that satisfy its constraints/);
  const fixture=JSON.parse(readFileSync(new URL('../results/shocks-llm-fixture.json',import.meta.url),'utf8'));
  const reproduced=await reproduceShocks(cases,{fixture:fixture.responses});
  assert.deepEqual(reproduced,JSON.parse(readFileSync(new URL('../results/shocks.json',import.meta.url),'utf8')));
});
test('live LLM attempts can be captured once and replayed offline against an exact brief digest',async()=>{
  const fixture={};let calls=0;
  const first=await reproduceShocks(cases.slice(0,1),{fixture,reprompt:async({briefDigest})=>{
    calls++;return {briefDigest,status:'responded',selectedIds:['unknown'],generation:{provider:'fixture'}};
  }});
  assert.equal(calls,9);
  assert.ok(first.rows.every(row=>row.arms.repromptedLlm.status==='invalid_response'));
  const second=await reproduceShocks(cases.slice(0,1),{fixture});
  assert.deepEqual(second,first);
  const key=Object.keys(fixture)[0];fixture[key].briefDigest='sha256:stale';
  await assert.rejects(()=>reproduceShocks(cases.slice(0,1),{fixture}),/Stale LLM fixture/);
});
test.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
