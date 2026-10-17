import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizePortfolio } from '../server/portfolio.mjs';
import { optimizeSlate } from '../server/optimizer.mjs';
import { firstFreeSlot } from '../server/resource-schedule.mjs';
const fixture=()=>{
  const items=['a','b','c'].map((id,i)=>({id,name:id,fit:1-i*.2,evidence:{rank:true},terms:{fee:[60,40,20][i],available:true,genre:id}}));
  const memo={items,currency:'GBP',input:{city:'London'},constraints:{budget:100,slots:1}};memo.slate=optimizeSlate(items,memo.constraints);
  const snapshot={id:'source1',mock:true,memo,receipts:[]};
  const raw={budget:100,maxBookingsPerArtist:1,restHours:24,events:[{id:'one',sourceId:'source1',start:'2027-04-01T18:00:00Z',end:'2027-04-01T23:00:00Z',resource:'Hall A'},{id:'two',sourceId:'source1',start:'2027-04-03T18:00:00Z',end:'2027-04-03T23:00:00Z',resource:'Hall A'}]};
  return {raw,snapshot,load:()=>snapshot};
};
test('joint optimum differs from independently feasible slates and keeps source inputs immutable',()=>{
  const {raw,snapshot,load}=fixture(),before=structuredClone({raw,snapshot}),result=optimizePortfolio(raw,load);
  assert.equal(result.status,'optimal');assert.equal(result.certifiedOptimal,true);assert.equal(result.totalCost,100);
  assert.deepEqual(result.events.flatMap(e=>e.selectedIds).sort(),['a','b']);
  assert.equal(result.independent.feasible,false);assert.ok(result.independent.violations.some(v=>v.code==='artist_reuse'));
  assert.deepEqual({raw,snapshot},before);assert.equal(result.paymentSchedule.at(-1).cumulative,100);
});
test('cash constraints change allocation and exact cents reconcile all deposits and balances',()=>{
  const {raw,snapshot,load}=fixture();snapshot.memo.items[0].terms.fee=60.01;raw.budget=100.01;
  raw.cashLimits=[{at:'2027-04-01T18:00:00Z',available:40}];
  const result=optimizePortfolio(raw,load);assert.deepEqual(result.events[0].selectedIds,['b']);assert.deepEqual(result.events[1].selectedIds,['a']);
  assert.equal(result.paymentSchedule.at(-1).cumulative,100.01);
  assert.equal(Math.round(result.paymentSchedule.reduce((sum,row)=>sum+row.amount,0)*100),10001);
});
test('fixed venue overlap is infeasible and suggests a gap without silently moving either event',()=>{
  const {raw,load}=fixture();raw.events[1].start='2027-04-01T20:00:00Z';raw.events[1].end='2027-04-02T01:00:00Z';
  const result=optimizePortfolio(raw,load);assert.equal(result.status,'infeasible');assert.equal(result.diagnostics[0].code,'resource_overlap');
  assert.equal(result.diagnostics[0].suggestedSlot.start,'2027-04-01T23:00:00.000Z');
});
test('rest rules apply across different resources and artist reuse caps never relax silently',()=>{
  const {raw,load}=fixture();raw.maxBookingsPerArtist=2;raw.budget=120;raw.events[1].resource='Hall B';raw.events[1].start='2027-04-02T18:00:00Z';raw.events[1].end='2027-04-02T23:00:00Z';
  const result=optimizePortfolio(raw,load);assert.deepEqual(result.events.flatMap(e=>e.selectedIds).sort(),['a','b']);
  assert.ok(result.independent.violations.some(v=>v.code==='artist_rest_or_overlap'));
});
test('empty joint feasible set, missing quotes, mixed currencies, invalid dates and bounded search stay explicit',()=>{
  const {raw,snapshot,load}=fixture();raw.budget=1;assert.equal(optimizePortfolio(raw,load).status,'infeasible');
  raw.budget=100;assert.equal(optimizePortfolio(raw,load,{maxNodes:1}).status,'search_limit');assert.equal(optimizePortfolio(raw,load,{maxNodes:1}).certifiedOptimal,false);
  const bounded=optimizePortfolio(raw,load,{maxNodes:3});
  assert.equal(bounded.status,'search_limit');assert.equal(bounded.certifiedOptimal,false);
  assert.ok(bounded.search.examinedExtensions<=3);assert.ok(bounded.search.visitedNodes<=3);
  snapshot.memo.items.forEach(item=>item.terms.fee=null);assert.ok(optimizePortfolio(raw,load).diagnostics.some(v=>v.code==='event_infeasible'));
  raw.events[0].start='2027-02-30T18:00:00Z';assert.throws(()=>optimizePortfolio(raw,load),/date/);
});
test('shared search agrees with an independent brute-force oracle for varied budgets and reuse caps',()=>{
  for(const budget of [40,60,80,100,120])for(const maxBookings of [1,2]){
    const {raw,snapshot,load}=fixture();raw.budget=budget;raw.maxBookingsPerArtist=maxBookings;
    const options=snapshot.memo.items.map(item=>({id:item.id,cost:item.terms.fee,score:optimizeSlate([item],{budget:100,slots:1}).score}));
    const feasible=options.flatMap(a=>options.map(b=>({ids:[a.id,b.id],cost:a.cost+b.cost,score:a.score+b.score}))).filter(p=>p.cost<=budget&&(maxBookings===2||p.ids[0]!==p.ids[1]));
    const expected=feasible.sort((a,b)=>b.score-a.score||a.cost-b.cost||a.ids.join(';').localeCompare(b.ids.join(';')))[0];
    const actual=optimizePortfolio(raw,load);assert.equal(actual.feasible,!!expected);if(expected){assert.ok(Math.abs(actual.objective-expected.score)<1e-5);assert.equal(actual.totalCost,expected.cost);}
  }
});
test('PartDrop scheduling adaptation fills a gap, tolerates unsorted reservations and rejects malformed intervals',()=>{
  const rows=[{start:'2027-01-01T15:00Z',end:'2027-01-01T17:00Z'},{start:'2027-01-01T10:00Z',end:'2027-01-01T12:00Z'}];
  assert.equal(firstFreeSlot(rows,Date.parse('2027-01-01T11:00Z'),2*36e5).start,'2027-01-01T12:00:00.000Z');
  assert.throws(()=>firstFreeSlot([{start:'bad',end:'bad'}],0,1),/reservation/);
});
test('portfolio rejects mixed currencies and invalid offset dates, and does not pass missing rank values',()=>{
  const {raw,snapshot,load}=fixture();
  assert.throws(()=>optimizePortfolio(raw,(id,event)=>event==='two'?{...snapshot,memo:{...snapshot.memo,currency:'USD'}}:snapshot),/same supported currency/);
  const invalid=structuredClone(raw);invalid.events[0].start='2027-02-30T18:00:00+05:30';assert.throws(()=>optimizePortfolio(invalid,load),/date/);
  snapshot.mock=false;snapshot.receipts=[{id:'r',tool:'rank',status:'ok',source:'qloo'}];
  snapshot.memo.items.forEach(item=>{item.evidenceReceipts={rank:['r']};item.fit=null;});
  const result=optimizePortfolio(raw,load);assert.equal(result.feasible,true);assert.equal(result.readiness.evidencePass,false);assert.equal(result.readiness.status,'evidence_required');
});
