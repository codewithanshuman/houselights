// A financial scenario built from a real Booking Desk plan (published or live). The candidates,
// their Qloo fit and their fees come from the saved plan; the venue, ticket, cost and demand
// numbers are the visitor's assumptions, with defaults scaled to the plan's artist budget.
// Nothing here is a sales forecast: paid demand is an explicit sell-through assumption.
const fault = message => Object.assign(new Error(message), { status: 400 });
const round = (value, step) => Math.max(step, Math.round(value / step) * step);
const FIELDS = {
  capacity: [100, 100000, true], ticketPrice: [1, 2000, false], sellThrough: [0.05, 1, false],
  venueCost: [0, 5e6, false], productionCost: [0, 5e6, false], marketingCost: [0, 5e6, false],
};
export const PUBLIC_DRAWS = 10000;

/** The visitor's assumptions, filled from defaults scaled to the plan's artist budget. */
export function caseAssumptions(record, raw = {}) {
  const budget = record.snapshot.memo.constraints.budget;
  const ticketPrice = 45, defaults = {
    // A room whose gross at 75% sell-through is about 2.6× the artist budget: the usual
    // rule of thumb for a night that can cover its artists and fixed costs.
    capacity: round(budget * 3.5 / ticketPrice, 100), ticketPrice, sellThrough: 0.75,
    venueCost: round(budget * 0.3, 500), productionCost: round(budget * 0.25, 500), marketingCost: round(budget * 0.15, 500),
  };
  if (raw !== undefined && (raw === null || typeof raw !== 'object' || Array.isArray(raw))) throw fault('Assumptions must be an object.');
  const out = { ...defaults };
  for (const [key, [min, max, whole]] of Object.entries(FIELDS)) {
    if (raw?.[key] === undefined) continue;
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (whole && !Number.isInteger(value)))
      throw fault(`${key} must be ${whole ? 'a whole number' : 'a number'} from ${min} to ${max}.`);
    out[key] = value;
  }
  return out;
}

/** The demand input and financial terms for `record`, in the shape the financial API takes. */
export function caseFinancialRequest(record, assumptions) {
  const memo = record.snapshot.memo, budget = memo.constraints.budget, a = assumptions;
  const currency = ['GBP', 'USD', 'EUR', 'INR'].includes(memo.currency) ? memo.currency : 'USD';
  const premium = Math.round(a.capacity * 0.2), general = a.capacity - premium;
  const staffing = round(budget * 0.1, 500), insurance = round(budget * 0.03, 100);
  const fixed = a.venueCost + a.productionCost + a.marketingCost + staffing + insurance;
  return {
    brief: { city: memo.input.city, venue: `Assumed ${a.capacity.toLocaleString('en-US')}-capacity room`, genre: 'Live music',
      eventDate: new Date(Date.now() + 120 * 864e5).toISOString().slice(0, 10), capacity: a.capacity, ticketPrice: a.ticketPrice, currency, competitionCount: 1 },
    constraints: { budget, slots: memo.constraints.slots, maxPerGenre: memo.constraints.slots, discoveryMin: 0 },
    assumptions: { baseSellThrough: a.sellThrough, priceElasticity: -1.1 },
    candidates: memo.items.map(item => ({ id: item.id, name: item.name, fee: item.terms.fee, genre: item.terms.genre || 'Unspecified', available: item.terms.available === true })),
    financial: {
      currency, ticketTiers: [{ name: 'General', price: a.ticketPrice, allocation: general }, { name: 'Premium', price: Math.round(a.ticketPrice * 1.6), allocation: premium }],
      costs: { venue: a.venueCost, production: a.productionCost, marketing: a.marketingCost, staffing, insurance, other: 0, perAttendee: 2 },
      revenue: { ancillaryPerTicket: 3, ancillaryFixed: 0 },
      tax: { mode: 'included', rate: 0.1, reference: 'Assumed rate; verify applicable tax and contract terms.' },
      fees: { ownership: 'promoter', perTicket: 1.5, fixed: 0, percent: 0.02 },
      risk: { eventCancellationProbability: 0.01, artistCancellationProbability: 0.03, feeEscalationProbability: 0.1,
        feeEscalationRate: 0.15, artistCancellationRefundFraction: 0.5, eventArtistFeeRefundFraction: 0.25, ticketRefundFraction: 0.25,
        eventTicketRefundFraction: 1, replacementFee: round(budget * 0.15, 500), cancellationPenalty: round(budget * 0.05, 500) },
      uncertainty: { demand: 0.18, costs: 0.1, competition: 0.07, weather: 0.06 },
      cashTiming: { artistDepositFraction: 0.5, fixedCostPreRevenueFraction: 0.7, refundReserveFraction: 0.1 },
      policy: { objective: 'balanced', maximumEventBudget: Math.round((budget + fixed) * 1.5), maximumCvarLoss: Math.round((budget + fixed) * 0.5) },
      assumptionSets: [{ id: 'base', demandMultiplier: 1, costMultiplier: 1 },
        { id: 'cautious', demandMultiplier: 0.85, costMultiplier: 1.1, reference: 'Demand 15% lower and costs 10% higher than the stated assumptions.' },
        { id: 'strong-presales', demandMultiplier: 1.2, costMultiplier: 0.9, reference: 'Demand 20% higher and costs 10% lower; no presale evidence.' }],
      simulation: { draws: PUBLIC_DRAWS, seed: 20261030, mode: 'scenario', assumptionSet: 'plan-assumptions-v1' },
      lossThreshold: Math.round((budget + fixed) * 0.3),
      evidenceReferences: [`Candidates, Qloo fit and fees come from saved plan ${record.id}${record.feeBasis === 'estimated-from-qloo-popularity' ? ' (fees estimated from Qloo popularity tiers)' : ' (illustrative fees)'}.`,
        'Venue size, ticket price, sell-through and costs are stated assumptions, not observed sales.'],
    },
  };
}
