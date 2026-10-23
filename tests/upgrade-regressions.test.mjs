import test from 'node:test';
import assert from 'node:assert/strict';
import { accountDraw, breakEvenVolume } from '../server/financial/accounting.mjs';
import { optimizeSlate } from '../server/optimizer.mjs';

function config(i) {
  const a=i%7+1, b=i%5+1, c=i%3+1;
  return {
    sellableCapacity:a+b+c,
    ticketTiers:[
      {name:'Premium',allocation:a,priceCents:600+(i*31)%1000},
      {name:'Standard',allocation:b,priceCents:250+(i*17)%420},
      {name:'Economy',allocation:c,priceCents:75+(i*11)%170}],
    costs:{venue:200+i*45,production:0,marketing:0,staffing:0,insurance:0,other:0},
    perAttendeeCents:(i*37)%450,ancillaryPerTicketCents:(i*13)%110,
    ancillaryFixedCents:(i*19)%180,
    tax:{mode:['none','included','added'][i%3],rate:(i%5)/20},
    fees:{ownership:['none','promoter','buyer'][i%3],fixedCents:(i*7)%100,
      perTicketCents:(i*29)%130,percent:(i%4)/15},
    booking:{eventTicketRefundFraction:1,ticketRefundFraction:0,eventArtistFeeRefundFraction:0,
      artistCancellationRefundFraction:0,cancellationPenaltyCents:0},
    cashTiming:{artistDepositFraction:0,fixedCostPreRevenueFraction:0,refundReserveFraction:0}
  };
}
test('first profitable ticket count is found despite non-monotone tier rounding',()=>{
  const c=config(1);
  c.sellableCapacity=3;
  c.ticketTiers=[{name:'P',allocation:1,priceCents:3000},
    {name:'M',allocation:1,priceCents:300},{name:'L',allocation:1,priceCents:300}];
  c.costs={venue:2500,production:0,marketing:0,staffing:0,insurance:0,other:0};
  c.perAttendeeCents=500;c.ancillaryPerTicketCents=0;c.ancillaryFixedCents=0;
  c.tax={mode:'none',rate:0};c.fees={ownership:'none',fixedCents:0,perTicketCents:0,percent:0};
  assert.deepEqual([0,1,2,3].map(n=>accountDraw(c,{ticketsSold:n,selectedFeesCents:0}).profitCents),[-2500,0,-200,-400]);
  assert.equal(breakEvenVolume(c,0),1);
});
test('first break-even count matches exhaustive oracle for diverse tier, fee and tax inputs',()=>{
  for(let i=1;i<=240;i++) {
    const c=config(i),fee=i*43%1000;
    const expected=Array.from({length:c.sellableCapacity+1},(_,n)=>n)
      .find(n=>accountDraw(c,{ticketsSold:n,selectedFeesCents:fee}).profitCents>=0)??null;
    assert.equal(breakEvenVolume(c,fee),expected,`Input ${i}`);
  }
});
test('malformed optional cultural links fail closed without throwing in festival scoring',()=>{
  const act=(id,links)=>({id,name:id,fit:.7,evidence:{rank:true,local:false,trends:false,comparison:false},
    culturalLinks:links,terms:{fee:10,available:true,genre:'folk'},receipts:[]});
  const outcome=optimizeSlate([act('a',[null,'bad',{},
    {otherId:'b',available:true,receiptId:'receipt',sharedTastes:['folk']}]),act('b',[42])],
    {budget:30,slots:2,maxPerGenre:2,festivalPolicy:true});
  assert.equal(outcome.status,'invalid');
  assert.ok(outcome.reasons.some(reason=>/Malformed culturalLinks/.test(reason)));
  const valid=optimizeSlate([act('a',[{otherId:'b',available:true,receiptId:'receipt',sharedTastes:['folk']}]),act('b',[])],
    {budget:30,slots:2,maxPerGenre:2,festivalPolicy:true});
  assert.equal(valid.feasible,true);
  assert.deepEqual(valid.festival.pairs[0].sharedTastes,['folk']);
});
