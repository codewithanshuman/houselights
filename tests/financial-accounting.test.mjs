import test from 'node:test';
import assert from 'node:assert/strict';
import { minor, signedMinor } from '../server/financial/money.mjs';
import { normalizeFinancial } from '../server/financial/schema.mjs';
import { accountDraw, breakEvenVolume } from '../server/financial/accounting.mjs';
import { normalizeDemandInput } from '../server/demand.mjs';
import { demoInput } from '../scripts/generate-financial-demo.mjs';

const config = () => normalizeFinancial(demoInput.financial, normalizeDemandInput(demoInput));
test('money requires integer minor units and rejects mixed currency', () => {
  assert.equal(minor('10.05'), 1005); assert.equal(signedMinor('-42.00'), -4200);
  assert.throws(() => minor(1.005), /two decimal/);
  assert.throws(() => normalizeFinancial({ ...demoInput.financial, currency: 'USD' }, normalizeDemandInput(demoInput)), /currencies must match/);
  assert.throws(() => normalizeFinancial({ ...demoInput.financial, costs: { artistFees: 1 } }, normalizeDemandInput(demoInput)), /do not add them again/);
});
test('ticket, refund, tax, fee and expense ledger reconciles to exact cents', () => {
  const c = config(); c.sellableCapacity = 100; c.ticketTiers = [{ name: 'One', allocation: 100, priceCents: 1000 }];
  c.costs = { venue: 10000, production: 0, marketing: 0, staffing: 0, insurance: 0, other: 0 };
  c.perAttendeeCents = 200; c.ancillaryPerTicketCents = 100; c.ancillaryFixedCents = 0;
  c.tax = { mode: 'included', rate: .2 }; c.fees = { ownership: 'promoter', fixedCents: 500, perTicketCents: 50, percent: 0 };
  const row = accountDraw(c, { ticketsSold: 50, selectedFeesCents: 10000 });
  assert.deepEqual([row.ticketReceiptsCents, row.ancillaryCents, row.grossRevenueCents], [50000, 5000, 55000]);
  assert.equal(row.taxCents, 8333); assert.equal(row.promoterFeesCents, 3000);
  assert.equal(row.profitCents, 13667);
  assert.equal(row.netRevenueCents - row.totalCostsCents, row.profitCents);
  const zero = accountDraw(c, { ticketsSold: 0, selectedFeesCents: 10000 });
  assert.equal(zero.ticketReceiptsCents, 0); assert.equal(zero.ancillaryCents, 0);
  assert.throws(() => accountDraw(c, { ticketsSold: 101, selectedFeesCents: 0 }), /capacity/);
});
test('buyer-borne fees stay outside recognized promoter revenue and expense', () => {
  const c = config(); c.fees = { ownership: 'buyer', fixedCents: 10000, perTicketCents: 200, percent: .1 };
  const row = accountDraw(c, { ticketsSold: 100, selectedFeesCents: 0 });
  assert.equal(row.promoterFeesCents, 0);
  assert.equal(row.grossRevenueCents - row.refundsCents - row.taxCents, row.netRevenueCents);
});
test('cancellation applies contract refunds and replacement cost once', () => {
  const c = config(); c.booking.artistCancellationRefundFraction = .5; c.booking.ticketRefundFraction = .25;
  c.booking.replacementFeeCents = 1000; c.booking.cancellationPenaltyCents = 200;
  const row = accountDraw(c, { ticketsSold: 100, selectedFeesCents: 20000,
    artistCanceled: true, canceledArtistFeeCents: 10000, replacementFeeCents: 1000 });
  assert.equal(row.refundsCents, Math.round(row.ticketReceiptsCents * .25));
  assert.equal(row.artistCostsCents, 20000 - 5000 + 1000 + 200);
  c.booking.eventArtistFeeRefundFraction = .25;
  const canceled = accountDraw(c, { ticketsSold: 100, selectedFeesCents: 20000, canceled: true });
  assert.equal(canceled.attendance, 0); assert.equal(canceled.ancillaryCents, 0);
  assert.equal(canceled.refundsCents, canceled.ticketReceiptsCents);
  assert.equal(canceled.artistCostsCents, 20000 - 5000 + 200);
});
test('break-even ticket volume uses the same accounting ledger', () => {
  const c = config(); const fee = 2000000, n = breakEvenVolume(c, fee);
  if (n != null) { assert.ok(accountDraw(c, { ticketsSold: n, selectedFeesCents: fee }).profitCents >= 0);
    if (n > 0) assert.ok(accountDraw(c, { ticketsSold: n - 1, selectedFeesCents: fee }).profitCents < 0); }
});
test('break-even finds the first profitable volume even when tier rounding reverses profit', () => {
  const c = config();
  c.sellableCapacity = 9;
  c.ticketTiers = [
    { name: 'High', allocation: 1, priceCents: 10000 },
    { name: 'Low A', allocation: 4, priceCents: 1 },
    { name: 'Low B', allocation: 4, priceCents: 1 },
  ];
  c.costs = { venue: 0, production: 0, marketing: 0, staffing: 0, insurance: 0, other: 0 };
  c.perAttendeeCents = 0;
  c.ancillaryPerTicketCents = 0;
  c.ancillaryFixedCents = 0;
  c.tax = { mode: 'none', rate: 0 };
  c.fees = { ownership: 'none', fixedCents: 0, perTicketCents: 0, percent: 0 };
  const fee = 9000;
  assert.ok(accountDraw(c, { ticketsSold: 3, selectedFeesCents: fee }).profitCents >= 0);
  assert.ok(accountDraw(c, { ticketsSold: 4, selectedFeesCents: fee }).profitCents < 0);
  assert.equal(breakEvenVolume(c, fee), 3);
});
