import test from 'node:test';
import assert from 'node:assert/strict';
import { commercialStress } from '../server/commercial-stress.mjs';
import { optimizeSlate } from '../server/optimizer.mjs';
function source(){const items=['a','b','c'].map((id,i)=>({id,name:id,fit:1-i*.3,evidence:{rank:true},terms:{fee:[40,30,20][i],available:true,genre:id}})),constraints={budget:70,slots:2};return {memo:{items,constraints,slate:optimizeSlate(items,constraints)},receipts:[]};}
const scenario={label:'Declared fixture',attendance:100,capacity:200,ticketPrice:2.55,variableCostPerAttendee:.25,fixedCosts:10};
test('joint scenarios calculate cents, preserve inputs, and identify a robust fixed alternative',()=>{
  const snapshot=source(),before=structuredClone(snapshot);
  const result=commercialStress(snapshot,{scenarios:[{...scenario,probability:.5},{...scenario,label:'Fee shock and lower attendance',attendance:20,fees:{a:60},probability:.5}]});
  assert.deepEqual(snapshot,before);
  const base=result.outcomes[0].alternatives.find(a=>a.selectedIds.includes('a')&&a.selectedIds.includes('b'));
  assert.equal(base.plannedRevenue,255);assert.equal(base.operatingMargin,150);assert.equal(base.breakEvenAttendance,35);
  assert.deepEqual([...result.robustAlternative.selectedIds].sort(),['b','c']);
  assert.equal(result.robustAlternative.expectedOperatingMargin,78);
  assert.equal(result.comparison.find(a=>a.selectedIds.includes('a')&&a.selectedIds.includes('b')).expectedOperatingMargin,null);
});
test('unrecoverable cancellation declares failure without invented margins',()=>{
  const r=commercialStress(source(),{scenarios:[{...scenario,unavailableIds:['a','b']}]});
  assert.equal(r.robustAlternative,null);assert.equal(r.outcomes[0].feasibleRecovery,false);
  assert.ok(r.outcomes[0].alternatives.every(a=>a.operatingMargin===null));
});
test('scenario probability, capacities, currencies and IDs are validated',()=>{
  assert.throws(()=>commercialStress(source(),{scenarios:[{...scenario,probability:.5}]}),/summing to one/);
  assert.throws(()=>commercialStress(source(),{scenarios:[{...scenario,attendance:201}]}),/Attendance/);
  assert.throws(()=>commercialStress(source(),{scenarios:[{...scenario,fees:{fake:1}}]}),/saved candidates/);
  assert.throws(()=>commercialStress(source(),{scenarios:[{...scenario,ticketPrice:'2'}]}),/number/);
  const r=commercialStress(source(),{scenarios:[{...scenario,ticketPrice:0}]});
  assert.ok(r.outcomes[0].alternatives.every(a=>a.breakEvenAttendance===null));
});

test('joint costs cannot overflow exact cents even when individual revenue products are safe',()=>{
  assert.throws(()=>commercialStress(source(),{scenarios:[{
    ...scenario, attendance:100000, capacity:100000, ticketPrice:0,
    variableCostPerAttendee:900719925.47, fixedCosts:1e9,
  }]}),/exact cent/);
});
