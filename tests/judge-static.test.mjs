import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The Booking Desk's first screen is generated from published evidence and inlined into
// judge.html. Both copies must equal a fresh computation, and every receipt must still
// match the pinned manifest.
test('the inlined first screen and judge-static.json match a fresh computation',async()=>{
  const {computeJudgeStatic,firstScreenHtml}=await import('../scripts/build-judge-static.mjs');
  const fresh=await computeJudgeStatic();
  const published=JSON.parse(readFileSync(new URL('../public/judge-static.json',import.meta.url),'utf8'));
  assert.deepEqual(published,fresh,'Regenerate with: node scripts/build-judge-static.mjs');
  const page=readFileSync(new URL('../public/judge.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  assert.ok(page.includes(firstScreenHtml(fresh).replace(/\r\n/g,'\n')),'judge.html first screen is stale; run node scripts/build-judge-static.mjs');
  assert.equal(fresh.integrity.pinMatches,true);
  assert.ok(fresh.receipts.length>0&&fresh.receipts.every(row=>row.integrity.matchesManifest),'every published receipt matches its manifest digest');
  assert.deepEqual(fresh.withQloo.names,['Michael Kiwanuka','Sault']);assert.equal(fresh.diff.changed,true);
  assert.ok(fresh.nearTie&&Math.abs(fresh.nearTie.scores[0]-fresh.nearTie.scores[1])<fresh.nearTie.band);
});
