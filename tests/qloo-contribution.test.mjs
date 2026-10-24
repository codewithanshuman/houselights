import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The Booking Desk serves the with/without-Qloo comparison as a static file so page
// views do not spend the shared experiment quota. It must equal a fresh computation.
test('the published Qloo contribution matches a fresh zero-call experiment',async()=>{
  const {computeQlooContribution}=await import('../scripts/build-qloo-contribution.mjs');
  const published=JSON.parse(readFileSync(new URL('../public/qloo-contribution.json',import.meta.url),'utf8'));
  const fresh=await computeQlooContribution();
  assert.deepEqual(published,fresh,'Regenerate with: node scripts/build-qloo-contribution.mjs');
  assert.equal(published.caseId,JSON.parse(readFileSync(new URL('../public/autopilot-recorded.json',import.meta.url),'utf8')).caseId);
  assert.equal(published.withQloo.feasible&&published.withoutQloo.feasible,true);
});
