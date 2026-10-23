import { checked, ratio, sum } from './money.mjs';

function allocatedTickets(sold, tiers, capacity) {
  if (!Number.isInteger(sold) || sold < 0 || sold > capacity) throw new Error('Paid ticket count cannot exceed sellable capacity.');
  // A stable proportional allocation avoids silently assuming that the highest
  // priced tier sells first. Largest remainders resolve rounding exactly.
  const rows = tiers.map((tier, index) => {
    const exact = sold * tier.allocation / capacity;
    return { index, whole: Math.floor(exact), remainder: exact % 1 };
  });
  let remaining = sold - rows.reduce((total, row) => total + row.whole, 0);
  rows.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const row of rows) if (remaining > 0 && row.whole < tiers[row.index].allocation) { row.whole++; remaining--; }
  if (remaining) throw new Error('Ticket allocation could not reconcile.');
  return rows.sort((a, b) => a.index - b.index).map((row, index) => ({ ...tiers[index], sold: row.whole }));
}

export function accountDraw(config, { ticketsSold, selectedFeesCents, costMultiplier = 1,
  canceled = false, artistCanceled = false, canceledArtistFeeCents = 0, feeEscalationCents = 0, replacementFeeCents = 0 } = {}) {
  if (!Number.isSafeInteger(selectedFeesCents) || selectedFeesCents < 0) throw new Error('Selected artist fees must be non-negative integer minor units.');
  const tiers = allocatedTickets(ticketsSold, config.ticketTiers, config.sellableCapacity);
  const ticketBaseCents = sum(tiers.map(row => checked(row.sold * row.priceCents)));
  const collectedTaxCents = config.tax.mode === 'added' ? ratio(ticketBaseCents, config.tax.rate) : 0;
  const ticketReceiptsCents = checked(ticketBaseCents + collectedTaxCents);
  const refundFraction = canceled ? config.booking.eventTicketRefundFraction : artistCanceled ? config.booking.ticketRefundFraction : 0;
  const refundsCents = ratio(ticketReceiptsCents, refundFraction);
  const retainedTicketReceiptsCents = ticketReceiptsCents - refundsCents;
  const taxCents = config.tax.mode === 'none' ? 0 : config.tax.mode === 'added'
    ? ratio(retainedTicketReceiptsCents, config.tax.rate / (1 + config.tax.rate))
    : ratio(retainedTicketReceiptsCents, config.tax.rate / (1 + config.tax.rate));
  const attendance = canceled ? 0 : Math.min(ticketsSold, config.sellableCapacity);
  const ancillaryCents = canceled ? 0 : checked(config.ancillaryFixedCents + attendance * config.ancillaryPerTicketCents);
  const grossRevenueCents = checked(ticketReceiptsCents + ancillaryCents);
  const promoterFeesCents = config.fees.ownership === 'promoter'
    ? checked(config.fees.fixedCents + ticketsSold * config.fees.perTicketCents + ratio(ticketReceiptsCents, config.fees.percent)) : 0;
  const artistFeeRefundCents = canceled ? ratio(selectedFeesCents, config.booking.eventArtistFeeRefundFraction) :
    artistCanceled ? ratio(canceledArtistFeeCents, config.booking.artistCancellationRefundFraction) : 0;
  const artistCostsCents = checked(selectedFeesCents - artistFeeRefundCents + feeEscalationCents + replacementFeeCents +
    (canceled || artistCanceled ? config.booking.cancellationPenaltyCents : 0));
  const fixedCostsCents = checked(Math.round(sum(Object.values(config.costs)) * costMultiplier));
  const variableCostsCents = checked(attendance * config.perAttendeeCents);
  const netRevenueCents = checked(grossRevenueCents - refundsCents - promoterFeesCents - taxCents);
  const totalCostsCents = checked(artistCostsCents + fixedCostsCents + variableCostsCents);
  const profitCents = checked(netRevenueCents - totalCostsCents);
  const cashBeforeRevenueCents = checked(ratio(selectedFeesCents, config.cashTiming.artistDepositFraction) +
    ratio(fixedCostsCents, config.cashTiming.fixedCostPreRevenueFraction) +
    ratio(ticketReceiptsCents, config.cashTiming.refundReserveFraction));
  return { ticketsSold, attendance, tierSales: tiers.map(({ name, sold, priceCents }) => ({ name, sold, priceCents })),
    ticketReceiptsCents, ancillaryCents, grossRevenueCents, refundsCents, promoterFeesCents, taxCents, netRevenueCents,
    artistCostsCents, fixedCostsCents, variableCostsCents, totalCostsCents, profitCents, cashBeforeRevenueCents,
    canceled, artistCanceled, feeEscalationCents, replacementFeeCents };
}

export function breakEvenVolume(config, selectedFeesCents, costMultiplier = 1) {
  // Largest-remainder ticket-tier allocation can move a sale from an expensive
  // tier into cheaper tiers as volume rises. Profit is therefore not monotonic.
  // Each tier receives at most its proportional share plus one rounded ticket.
  // This deliberately generous affine profit ceiling lets us skip intervals
  // that cannot break even; surviving volumes use the exact accounting ledger.
  const zero=accountDraw(config,{ticketsSold:0,selectedFeesCents,costMultiplier});
  if(zero.profitCents>=0)return 0;
  const capacity = config.sellableCapacity;
  const ticketMultiplier = config.tax.mode === 'added' ? 1 + config.tax.rate : 1;
  const weightedPrice = config.ticketTiers.reduce((total, tier) =>
    total + tier.priceCents * tier.allocation / capacity, 0);
  const roundingAllowance = config.ticketTiers.reduce((total, tier) => total + tier.priceCents, 0);
  const promoterFees = config.fees.ownership === 'promoter';
  const slope = weightedPrice * ticketMultiplier + config.ancillaryPerTicketCents -
    config.perAttendeeCents - (promoterFees ? config.fees.perTicketCents : 0);
  const intercept = roundingAllowance * ticketMultiplier + (config.tax.mode === 'added' ? 1 : 0) +
    config.ancillaryFixedCents - selectedFeesCents -
    checked(Math.round(sum(Object.values(config.costs)) * costMultiplier)) -
    (promoterFees ? config.fees.fixedCents : 0);
  const intervals = [[1, capacity]];
  while (intervals.length) {
    const [low, high] = intervals.pop();
    // A small margin covers floating-point error in the deliberately loose bound.
    if (intercept + slope * (slope >= 0 ? high : low) + 2 < 0) continue;
    if (high - low < 16) {
      for (let sold = low; sold <= high; sold++) {
        if (accountDraw(config, { ticketsSold: sold, selectedFeesCents, costMultiplier }).profitCents >= 0) return sold;
      }
    } else {
      const middle = Math.floor((low + high) / 2);
      intervals.push([middle + 1, high], [low, middle]);
    }
  }
  return null;
}
