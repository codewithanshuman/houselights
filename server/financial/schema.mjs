import { currencies, minor } from './money.mjs';
import { cholesky, defaultCorrelation } from './correlations.mjs';

export const modelVersion = 'financial-scenario-v1';
const fraction = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be a number from 0 to 1.`);
  return value;
};
const bounded = (value, name, low, high) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) throw new Error(`${name} must be between ${low} and ${high}.`);
  return value;
};
const reference = (value, name) => {
  const text = String(value ?? '').trim();
  if (text.length > 240) throw new Error(`${name} is too long.`);
  return text || null;
};
const costNames = ['venue', 'production', 'marketing', 'staffing', 'insurance', 'other'];
const optionalMoney = (value, name) => minor(value ?? 0, name);

export function normalizeFinancial(raw, demandInput) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Financial assumptions are required.');
  const currency = raw.currency ?? demandInput.brief.currency;
  if (!currencies.has(currency) || currency !== demandInput.brief.currency) throw new Error('Financial and demand currencies must match; explicit conversion is not supported.');
  if (raw.exchangeRate != null) throw new Error('Currency conversion is not supported in a single event scenario.');
  const capacity = demandInput.brief.capacity;
  const tiers = raw.ticketTiers;
  if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > 8) throw new Error('Provide 1–8 ticket tiers.');
  const names = new Set();
  const ticketTiers = tiers.map((tier, index) => {
    const name = String(tier?.name ?? '').trim();
    if (!name || name.length > 60 || names.has(name.toLowerCase())) throw new Error(`Ticket tier ${index + 1} needs a unique name.`);
    names.add(name.toLowerCase());
    if (!Number.isInteger(tier.allocation) || tier.allocation < 0 || tier.allocation > capacity) throw new Error(`Invalid allocation for ${name}.`);
    const priceCents = minor(tier.price, `${name} price`);
    if (priceCents < 1) throw new Error(`${name} price must be positive.`);
    return { name, allocation: tier.allocation, priceCents };
  });
  const sellableCapacity = ticketTiers.reduce((total, tier) => total + tier.allocation, 0);
  if (sellableCapacity < 1 || sellableCapacity > capacity) throw new Error('Ticket allocations must be positive and cannot exceed venue capacity.');
  if (raw.costs?.artistFees != null && minor(raw.costs.artistFees, 'Artist fees') !== 0)
    throw new Error('Artist fees come from each selected candidate quote; do not add them again to fixed event costs.');
  const costs = Object.fromEntries(costNames.map(name => [name, optionalMoney(raw.costs?.[name], `${name} cost`)]));
  const perAttendeeCents = optionalMoney(raw.costs?.perAttendee, 'Cost per paid ticket');
  const ancillaryPerTicketCents = optionalMoney(raw.revenue?.ancillaryPerTicket, 'Ancillary revenue per paid ticket');
  const ancillaryFixedCents = optionalMoney(raw.revenue?.ancillaryFixed, 'Fixed ancillary revenue');
  const taxMode = raw.tax?.mode;
  if (!['none', 'included', 'added'].includes(taxMode)) throw new Error('Tax mode must explicitly be none, included, or added.');
  const taxRate = fraction(raw.tax?.rate, 'Ticket tax rate');
  if (taxRate > .5) throw new Error('Ticket tax rate above 50% is outside this scenario model.');
  const feeMode = raw.fees?.ownership;
  if (!['promoter', 'buyer', 'none'].includes(feeMode)) throw new Error('Fee ownership must explicitly be promoter, buyer, or none.');
  const fees = { ownership: feeMode,
    perTicketCents: optionalMoney(raw.fees?.perTicket, 'Ticketing fee per ticket'),
    fixedCents: optionalMoney(raw.fees?.fixed, 'Fixed ticketing fee'),
    percent: fraction(raw.fees?.percent ?? 0, 'Ticketing fee percentage') };
  if (feeMode === 'none' && (fees.perTicketCents || fees.fixedCents || fees.percent)) throw new Error('Fee amounts must be zero when ownership is none.');
  const risk = raw.risk ?? {};
  const booking = {
    eventCancellationProbability: fraction(risk.eventCancellationProbability ?? 0, 'Event cancellation probability'),
    artistCancellationProbability: fraction(risk.artistCancellationProbability ?? 0, 'Artist cancellation probability'),
    feeEscalationProbability: fraction(risk.feeEscalationProbability ?? 0, 'Fee escalation probability'),
    feeEscalationRate: fraction(risk.feeEscalationRate ?? 0, 'Fee escalation rate'),
    artistCancellationRefundFraction: fraction(risk.artistCancellationRefundFraction ?? 0, 'Artist cancellation fee refund fraction'),
    eventArtistFeeRefundFraction: fraction(risk.eventArtistFeeRefundFraction ?? 0, 'Event cancellation artist-fee refund fraction'),
    ticketRefundFraction: fraction(risk.ticketRefundFraction ?? 0, 'Ticket refund fraction after artist cancellation'),
    eventTicketRefundFraction: fraction(risk.eventTicketRefundFraction ?? 1, 'Ticket refund fraction after event cancellation'),
    replacementFeeCents: optionalMoney(risk.replacementFee, 'Replacement fee'),
    cancellationPenaltyCents: optionalMoney(risk.cancellationPenalty, 'Cancellation penalty'),
  };
  const uncertainty = raw.uncertainty ?? {};
  const volatility = {
    demand: bounded(uncertainty.demand ?? .18, 'Demand volatility', 0, 1),
    costs: bounded(uncertainty.costs ?? .1, 'Cost volatility', 0, 1),
    competition: bounded(uncertainty.competition ?? .07, 'Competition volatility', 0, 1),
    weather: bounded(uncertainty.weather ?? .06, 'Weather volatility', 0, 1),
  };
  const correlation = raw.correlation ?? defaultCorrelation;
  cholesky(correlation); // reject invalid structures before work is queued
  const simulation = raw.simulation ?? {};
  const draws = simulation.draws ?? 10000, seed = simulation.seed ?? 20261022;
  if (!Number.isInteger(draws) || draws < 10000 || draws > 100000) throw new Error('Simulation draws must be 10,000–100,000.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Simulation seed must be an unsigned 32-bit integer.');
  if (simulation.mode != null && simulation.mode !== 'scenario') throw new Error('Only explicitly labeled scenario mode is currently supported.');
  const lossThresholdCents = optionalMoney(raw.lossThreshold ?? 50000, 'Loss threshold');
  const maxEventBudgetCents = raw.policy?.maximumEventBudget == null ? null : minor(raw.policy.maximumEventBudget, 'Maximum event budget');
  const maxCvarLossCents = raw.policy?.maximumCvarLoss == null ? null : minor(raw.policy.maximumCvarLoss, 'Maximum CVaR loss');
  const policy = raw.policy?.objective ?? 'balanced';
  if (!['expected_profit', 'downside', 'balanced'].includes(policy)) throw new Error('Optimization policy must be expected_profit, downside, or balanced.');
  const assumptionSets = raw.assumptionSets ?? [{ id: 'base', demandMultiplier: 1, costMultiplier: 1 }];
  if (!Array.isArray(assumptionSets) || !assumptionSets.length || assumptionSets.length > 5) throw new Error('Provide 1–5 assumption sets.');
  const assumptionIds = new Set();
  const sets = assumptionSets.map((set, index) => {
    const id = String(set?.id ?? '').trim();
    if (!/^[\w-]{1,40}$/.test(id) || assumptionIds.has(id)) throw new Error(`Assumption set ${index + 1} needs a unique short ID.`);
    assumptionIds.add(id);
    return { id, demandMultiplier: bounded(set.demandMultiplier, 'Demand multiplier', 0, 2),
      costMultiplier: bounded(set.costMultiplier, 'Cost multiplier', 0, 3),
      reference: reference(set.reference, 'Assumption-set reference') };
  });
  const cash = raw.cashTiming ?? {};
  const cashTiming = { artistDepositFraction: fraction(cash.artistDepositFraction ?? .5, 'Artist deposit fraction'),
    fixedCostPreRevenueFraction: fraction(cash.fixedCostPreRevenueFraction ?? .7, 'Fixed cost pre-revenue fraction'),
    refundReserveFraction: fraction(cash.refundReserveFraction ?? 0, 'Refund reserve fraction') };
  return { modelVersion, currency, capacity, sellableCapacity, ticketTiers, costs, perAttendeeCents,
    ancillaryPerTicketCents, ancillaryFixedCents, tax: { mode: taxMode, rate: taxRate, reference: reference(raw.tax?.reference, 'Tax reference') },
    fees, booking, volatility, correlation, simulation: { draws, seed, mode: 'scenario', assumptionSet: String(simulation.assumptionSet ?? 'organizer-v1').slice(0, 60) },
    lossThresholdCents, policy: { objective: policy, maxEventBudgetCents, maxCvarLossCents }, assumptionSets: sets, cashTiming,
    evidenceReferences: Array.isArray(raw.evidenceReferences) ? raw.evidenceReferences.slice(0, 30).map((item, index) => reference(item, `Evidence ${index + 1}`)).filter(Boolean) : [],
    caveat: 'Amounts are organizer-entered assumptions. Tax treatment and contracts must be verified for this event; scenario probabilities are not calibrated predictions.' };
}
